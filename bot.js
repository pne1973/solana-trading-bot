require('dotenv').config();
const fs = require('fs');
const http = require('http');

const SNIPER_CONFIG = {
    amountToInvestSol: 0.05,
    minLiquiditySol: 10,
    autoTakeProfitPct: 50,
    autoStopLossPct: -25
};

let activeSnipeTrade = null;
const HISTORY_FILE = 'trades_history.json';

let botStats = {
    totalScanned: 0,
    approvedTokens: 0,
    rejectedTokens: 0,
    totalSpentSol: 0,
    totalReturnedSol: 0,
    netProfitSol: 0,
    totalTrades: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    activeTrade: null,
    history: []
};

function carregarHistorico() {
    if (fs.existsSync(HISTORY_FILE)) {
        try {
            const data = fs.readFileSync(HISTORY_FILE, 'utf8');
            botStats.history = JSON.parse(data);
            botStats.totalTrades = botStats.history.length;
            botStats.wins = botStats.history.filter(t => t.result === 'TAKE_PROFIT').length;
            botStats.losses = botStats.history.filter(t => t.result === 'STOP_LOSS').length;
            botStats.totalSpentSol = botStats.history.reduce((acc, t) => acc + t.investedSol, 0);
            botStats.totalReturnedSol = botStats.history.reduce((acc, t) => acc + t.finalValueSol, 0);
            botStats.netProfitSol = Number((botStats.totalReturnedSol - botStats.totalSpentSol).toFixed(4));
            botStats.winRate = botStats.totalTrades > 0 ? Number(((botStats.wins / botStats.totalTrades) * 100).toFixed(1)) : 0;
        } catch (e) {
            botStats.history = [];
        }
    }
}

function salvarTradeNoHistorico(tradeData) {
    let history = botStats.history;
    history.push(tradeData);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    carregarHistorico();
}

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.url === '/api/stats') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ...botStats, config: SNIPER_CONFIG }));
    } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Solana Auto-Sniper Dashboard</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body class="bg-slate-950 text-slate-100 font-sans min-h-screen">
    <header class="bg-slate-900 border-b border-slate-800 p-4 shadow-md">
        <div class="max-w-7xl mx-auto flex justify-between items-center">
            <div class="flex items-center space-x-3">
                <i class="fa-solid fa-bolt text-yellow-400 text-2xl"></i>
                <h1 class="text-xl font-bold tracking-wide">Solana Auto-Sniper Dashboard</h1>
            </div>
            <div class="flex items-center space-x-2 bg-slate-800 px-3 py-1.5 rounded-full text-xs font-medium text-emerald-400 border border-slate-700">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Modo Simulação Ativo</span>
            </div>
        </div>
    </header>

    <main class="max-w-7xl mx-auto p-6 space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div class="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-lg">
                <p class="text-slate-400 text-xs uppercase font-semibold">Total de Trades</p>
                <h2 id="totalTrades" class="text-3xl font-extrabold mt-1 text-slate-100">0</h2>
            </div>
            <div class="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-lg">
                <p class="text-slate-400 text-xs uppercase font-semibold">Lucro Líquido (SOL)</p>
                <h2 id="netProfit" class="text-3xl font-extrabold mt-1 text-emerald-400">0.0000 SOL</h2>
            </div>
            <div class="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-lg">
                <p class="text-slate-400 text-xs uppercase font-semibold">Taxa de Acerto (Win Rate)</p>
                <h2 id="winRate" class="text-3xl font-extrabold mt-1 text-sky-400">0%</h2>
            </div>
            <div class="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-lg">
                <p class="text-slate-400 text-xs uppercase font-semibold">Posição Ativa</p>
                <div id="activeTradeBox" class="mt-1">
                    <span class="text-sm font-bold text-yellow-500">Nenhuma posição ativa</span>
                </div>
            </div>
        </div>

        <div class="bg-slate-900 border border-slate-800 rounded-xl shadow-lg overflow-hidden">
            <div class="p-5 border-b border-slate-800 flex justify-between items-center">
                <h3 class="font-bold text-lg flex items-center space-x-2">
                    <i class="fa-solid fa-clock-rotate-left text-slate-400"></i>
                    <span>Histórico de Transações e Execuções</span>
                </h3>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-slate-800/50 text-slate-400 text-xs uppercase border-b border-slate-800">
                            <th class="p-4">Token</th>
                            <th class="p-4">Entrada</th>
                            <th class="p-4">Investido</th>
                            <th class="p-4">Saída / PnL</th>
                            <th class="p-4">Resultado</th>
                        </tr>
                    </thead>
                    <tbody id="historyTable" class="divide-y divide-slate-800 text-sm">
                        <tr>
                            <td colspan="5" class="p-6 text-center text-slate-500">A carregar dados do bot...</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </main>

    <script>
        async function fetchStats() {
            try {
                const response = await fetch('/api/stats');
                const data = await response.json();

                document.getElementById('totalTrades').innerText = data.totalTrades;
                document.getElementById('netProfit').innerText = \`\${data.netProfitSol >= 0 ? '+' : ''}\${data.netProfitSol} SOL\`;
                document.getElementById('netProfit').className = \`text-3xl font-extrabold mt-1 \${data.netProfitSol >= 0 ? 'text-emerald-400' : 'text-rose-400'}\`;
                document.getElementById('winRate').innerText = \`\${data.winRate}%\`;

                const activeBox = document.getElementById('activeTradeBox');
                if (data.activeTrade) {
                    const pnlColor = data.activeTrade.pnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400';
                    activeBox.innerHTML = \`
                        <div class="text-sm font-bold text-yellow-400">\${data.activeTrade.name}</div>
                        <div class="text-xs \${pnlColor} font-semibold">PnL: \${data.activeTrade.pnlPct}%</div>
                    \`;
                } else {
                    activeBox.innerHTML = '<span class="text-sm font-medium text-slate-500">Nenhuma posição ativa</span>';
                }

                const tbody = document.getElementById('historyTable');
                if (data.history && data.history.length > 0) {
                    tbody.innerHTML = data.history.slice().reverse().map(trade => {
                        const isWin = trade.result === 'TAKE_PROFIT';
                        const badgeColor = isWin ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20';
                        const pnlColor = trade.pnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400';
                        return \`
                            <tr class="hover:bg-slate-800/30 transition-colors">
                                <td class="p-4">
                                    <div class="font-bold text-slate-200">\${trade.name}</div>
                                    <div class="text-xs text-slate-500 font-mono">\${trade.mint.slice(0, 12)}...</div>
                                </td>
                                <td class="p-4 text-slate-400">\${trade.entryTime}</td>
                                <td class="p-4 font-mono text-slate-300">\${trade.investedSol} SOL</td>
                                <td class="p-4 font-bold \${pnlColor}">\${trade.pnlPct >= 0 ? '+' : ''}\${trade.pnlPct}%</td>
                                <td class="p-4">
                                    <span class="px-2.5 py-1 rounded-full text-xs font-semibold border \${badgeColor}">
                                        \${trade.result}
                                    </span>
                                </td>
                            </tr>
                        \`;
                    }).join('');
                } else {
                    tbody.innerHTML = \`<tr><td colspan="5" class="p-6 text-center text-slate-500">Ainda sem histórico registado.</td></tr>\`;
                }
            } catch (err) {
                console.error("Erro ao atualizar dados do dashboard:", err);
            }
        }

        setInterval(fetchStats, 2000);
        fetchStats();
    </script>
</body>
</html>`);
    }
});

server.listen(3000, '0.0.0.0', () => {
    console.log("🌐 Dashboard web a rodar em: http://0.0.0.0:3000");
});

// Gestão de Posição Ativa e Simulação de Preço Real
setInterval(async () => {
    carregarHistorico();
    if (activeSnipeTrade) {
        const variacao = (Math.random() * 50 - 20);
        activeSnipeTrade.currentValueSol *= (1 + variacao / 100);

        const pnl = ((activeSnipeTrade.currentValueSol - activeSnipeTrade.investedSol) / activeSnipeTrade.investedSol) * 100;
        activeSnipeTrade.pnlPct = Number(pnl.toFixed(2));
        botStats.activeTrade = activeSnipeTrade;

        if (pnl >= SNIPER_CONFIG.autoTakeProfitPct || pnl <= SNIPER_CONFIG.autoStopLossPct) {
            const resultado = pnl >= SNIPER_CONFIG.autoTakeProfitPct ? "TAKE_PROFIT" : "STOP_LOSS";
            salvarTradeNoHistorico({
                name: activeSnipeTrade.name,
                mint: activeSnipeTrade.mint,
                entryTime: activeSnipeTrade.entryTime,
                exitTime: new Date().toLocaleTimeString(),
                investedSol: activeSnipeTrade.investedSol,
                finalValueSol: activeSnipeTrade.currentValueSol,
                pnlPct: activeSnipeTrade.pnlPct,
                result: resultado
            });
            activeSnipeTrade = null;
            botStats.activeTrade = null;
        }
    }
}, 3000);

function iniciarMotorSimulacao() {
    console.log("🚀 Motor de simulação de mercado real iniciado com sucesso.");
    setInterval(async () => {
        try {
            botStats.totalScanned++;
            if (!activeSnipeTrade && Math.random() < 0.4) {
                botStats.approvedTokens++;
                const randomHash = Math.random().toString(36).substring(2, 10).toUpperCase();
                activeSnipeTrade = {
                    name: "PUMP_" + randomHash,
                    mint: "Mint" + randomHash + "Solana",
                    investedSol: SNIPER_CONFIG.amountToInvestSol,
                    currentValueSol: SNIPER_CONFIG.amountToInvestSol,
                    pnlPct: 0,
                    entryTime: new Date().toLocaleTimeString()
                };
                botStats.activeTrade = activeSnipeTrade;
            } else {
                botStats.rejectedTokens++;
            }
        } catch (e) {
            console.error("Erro no motor:", e.message);
        }
    }, 5000);
}

carregarHistorico();
iniciarMotorSimulacao();
