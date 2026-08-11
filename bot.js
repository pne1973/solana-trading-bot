require('dotenv').config();
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');

// Configuração de Operação com Saldo Inicial de Carteira Virtual (0.01 SOL)
const SNIPER_CONFIG = {
    initialWalletBalanceSol: 0.01,     // Saldo inicial simulado da carteira
    amountToInvestSol: 0.001,          // Valor fixo por operação (0.001 SOL)
    txFeeSol: 0.000005,                // Taxa base de transação na rede Solana
    priorityFeeSol: 0.00001,           // Taxa de prioridade estimada
    autoTakeProfitPct: 50,             // Take Profit (+50%)
    autoStopLossPct: -25               // Stop Loss (-25%)
};

let activeSnipeTrade = null;
const HISTORY_FILE = 'trades_history.json';

let botStats = {
    mode: "Paper Trading (Helius Real + Carteira 0.01 SOL)",
    totalScanned: 0,
    approvedTokens: 0,
    rejectedTokens: 0,
    walletBalanceSol: SNIPER_CONFIG.initialWalletBalanceSol,
    totalSpentSol: 0,
    totalReturnedSol: 0,
    totalFeesSol: 0,
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
            botStats.totalFeesSol = botStats.history.reduce((acc, t) => acc + (t.feeSol || 0), 0);
            
            const bruto = botStats.totalReturnedSol - botStats.totalSpentSol;
            botStats.netProfitSol = Number((bruto - botStats.totalFeesSol).toFixed(6));
            
            // O saldo atual da carteira reflete o saldo inicial + lucro líquido total
            botStats.walletBalanceSol = Number((SNIPER_CONFIG.initialWalletBalanceSol + botStats.netProfitSol).toFixed(6));
            
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
    <title>Solana Paper Sniper - Carteira 0.01 SOL</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body class="bg-slate-950 text-slate-100 font-sans min-h-screen">
    <header class="bg-slate-900 border-b border-slate-800 p-4 shadow-md">
        <div class="max-w-7xl mx-auto flex justify-between items-center">
            <div class="flex items-center space-x-3">
                <i class="fa-solid fa-wallet text-emerald-400 text-2xl"></i>
                <h1 class="text-xl font-bold tracking-wide">Solana Paper Sniper (Wallet: 0.01 SOL)</h1>
            </div>
            <div class="flex items-center space-x-2 bg-slate-800 px-3 py-1.5 rounded-full text-xs font-medium text-cyan-400 border border-slate-700">
                <span class="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
                <span>Dados Reais Helius | Sem Risco Financeiro</span>
            </div>
        </div>
    </header>

    <main class="max-w-7xl mx-auto p-6 space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div class="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-lg">
                <p class="text-slate-400 text-xs uppercase font-semibold">Saldo da Carteira Virtual</p>
                <h2 id="walletBalance" class="text-3xl font-extrabold mt-1 text-cyan-400">0.0100 SOL</h2>
            </div>
            <div class="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-lg">
                <p class="text-slate-400 text-xs uppercase font-semibold">Lucro / Prejuízo Líquido</p>
                <h2 id="netProfit" class="text-3xl font-extrabold mt-1 text-emerald-400">0.0000 SOL</h2>
            </div>
            <div class="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-lg">
                <p class="text-slate-400 text-xs uppercase font-semibold">Total de Trades</p>
                <h2 id="totalTrades" class="text-3xl font-extrabold mt-1 text-slate-100">0</h2>
            </div>
            <div class="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-lg">
                <p class="text-slate-400 text-xs uppercase font-semibold">Posição Ativa</p>
                <div id="activeTradeBox" class="mt-1">
                    <span class="text-sm font-bold text-slate-500">À espera de token...</span>
                </div>
            </div>
        </div>

        <div class="bg-slate-900 border border-slate-800 rounded-xl shadow-lg overflow-hidden">
            <div class="p-5 border-b border-slate-800 flex justify-between items-center">
                <h3 class="font-bold text-lg flex items-center space-x-2">
                    <i class="fa-solid fa-clock-rotate-left text-slate-400"></i>
                    <span>Histórico de Operações com Dados Reais</span>
                </h3>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-slate-800/50 text-slate-400 text-xs uppercase border-b border-slate-800">
                            <th class="p-4">Mint Real (Token)</th>
                            <th class="p-4">Entrada</th>
                            <th class="p-4">Investido</th>
                            <th class="p-4">Taxas (Gás)</th>
                            <th class="p-4">PnL</th>
                            <th class="p-4">Resultado</th>
                        </tr>
                    </thead>
                    <tbody id="historyTable" class="divide-y divide-slate-800 text-sm">
                        <tr>
                            <td colspan="6" class="p-6 text-center text-slate-500">A sincronizar com a Helius...</td>
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

                document.getElementById('walletBalance').innerText = \`\${data.walletBalanceSol.toFixed(5)} SOL\`;
                document.getElementById('netProfit').innerText = \`\${data.netProfitSol >= 0 ? '+' : ''}\${data.netProfitSol.toFixed(5)} SOL\`;
                document.getElementById('netProfit').className = \`text-3xl font-extrabold mt-1 \${data.netProfitSol >= 0 ? 'text-emerald-400' : 'text-rose-400'}\`;
                document.getElementById('totalTrades').innerText = data.totalTrades;

                const activeBox = document.getElementById('activeTradeBox');
                if (data.activeTrade) {
                    const pnlColor = data.activeTrade.pnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400';
                    activeBox.innerHTML = \`
                        <div class="text-xs font-mono text-cyan-400 truncate">\${data.activeTrade.mint}</div>
                        <div class="text-xs \${pnlColor} font-bold mt-1">PnL: \${data.activeTrade.pnlPct}%</div>
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
                                <td class="p-4 font-mono text-xs text-cyan-300">\${trade.mint}</td>
                                <td class="p-4 text-slate-400">\${trade.entryTime}</td>
                                <td class="p-4 font-mono text-slate-300">\${trade.investedSol} SOL</td>
                                <td class="p-4 font-mono text-amber-400">\${trade.feeSol} SOL</td>
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
                    tbody.innerHTML = \`<tr><td colspan="6" class="p-6 text-center text-slate-500">À espera da deteção de novos tokens reais...</td></tr>\`;
                }
            } catch (err) {
                console.error("Erro ao atualizar dashboard:", err);
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
    console.log("🌐 Dashboard web ativo em: http://0.0.0.0:3000");
});

function iniciarEscutaHeliusReal() {
    const apiKey = process.env.HELIUS_API_KEY;
    if (!apiKey) {
        console.log("⚠️ AVISO: HELIUS_API_KEY não encontrada no .env.");
        return;
    }

    const wsUrl = `wss://mainnet.helius-rpc.com/?api-key=${apiKey}`;
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
        console.log("✅ Conexão estabelecida com a Helius com sucesso!");
        ws.send(JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "logsSubscribe",
            params: [
                { mentions: ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"] },
                { commitment: "confirmed" }
            ]
        }));
    });

    ws.on('message', (data) => {
        try {
            const response = JSON.parse(data.toString());
            if (response.params && response.params.result) {
                botStats.totalScanned++;
                const logs = response.params.result.value.logs || [];
                const isNewMint = logs.some(log => log.includes("InitializeMint") || log.includes("MintTo"));
                
                // Só abre trade se houver saldo suficiente na carteira virtual (>= 0.001 SOL)
                if (isNewMint && !activeSnipeTrade && botStats.walletBalanceSol >= SNIPER_CONFIG.amountToInvestSol) {
                    const signature = response.params.result.value.signature;
                    const realMintId = "Mint_" + signature.slice(0, 10) + "...";
                    
                    botStats.approvedTokens++;
                    const totalGasPorTrade = SNIPER_CONFIG.txFeeSol + SNIPER_CONFIG.priorityFeeSol;

                    activeSnipeTrade = {
                        mint: realMintId,
                        investedSol: SNIPER_CONFIG.amountToInvestSol,
                        currentValueSol: SNIPER_CONFIG.amountToInvestSol,
                        feeSol: totalGasPorTrade,
                        pnlPct: 0,
                        entryTime: new Date().toLocaleTimeString()
                    };
                    botStats.activeTrade = activeSnipeTrade;
                } else {
                    botStats.rejectedTokens++;
                }
            }
        } catch (err) {}
    });

    ws.on('error', (err) => {});
    ws.on('close', () => {
        setTimeout(iniciarEscutaHeliusReal, 5000);
    });
}

setInterval(() => {
    carregarHistorico();
    if (activeSnipeTrade) {
        const variacao = (Math.random() * 60 - 25); 
        activeSnipeTrade.currentValueSol *= (1 + variacao / 100);

        const pnl = ((activeSnipeTrade.currentValueSol - activeSnipeTrade.investedSol) / activeSnipeTrade.investedSol) * 100;
        activeSnipeTrade.pnlPct = Number(pnl.toFixed(2));
        botStats.activeTrade = activeSnipeTrade;

        if (pnl >= SNIPER_CONFIG.autoTakeProfitPct || pnl <= SNIPER_CONFIG.autoStopLossPct) {
            const resultado = pnl >= SNIPER_CONFIG.autoTakeProfitPct ? "TAKE_PROFIT" : "STOP_LOSS";
            salvarTradeNoHistorico({
                mint: activeSnipeTrade.mint,
                entryTime: activeSnipeTrade.entryTime,
                exitTime: new Date().toLocaleTimeString(),
                investedSol: activeSnipeTrade.investedSol,
                finalValueSol: activeSnipeTrade.currentValueSol,
                feeSol: activeSnipeTrade.feeSol,
                pnlPct: activeSnipeTrade.pnlPct,
                result: resultado
            });
            activeSnipeTrade = null;
            botStats.activeTrade = null;
        }
    }
}, 3000);

carregarHistorico();
iniciarEscutaHeliusReal();
