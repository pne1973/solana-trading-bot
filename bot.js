require('dotenv').config();
const fs = require('fs');
const http = require('http');
const { Connection, PublicKey } = require('@solana/web3.js');

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

const SNIPER_CONFIG = {
    amountToInvestSol: 0.05,
    minLiquiditySol: 15,
    autoTakeProfitPct: 50,
    autoStopLossPct: -25
};

let activeSnipeTrade = null;
const HISTORY_FILE = 'trades_history.json';

let botStats = {
    status: "A escutar rede",
    totalScanned: 0,
    approvedTokens: 0,
    rejectedTokens: 0,
    totalSpentSol: 0,
    totalReturnedSol: 0,
    totalTrades: 0,
    wins: 0,
    losses: 0,
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

// Servidor Web para o Dashboard (utiliza rotas relativas /api)
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.url === '/api/stats') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(botStats));
    } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(dashboardHtml);
    }
});

const dashboardHtml = `<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <title>Solana Auto-Sniper Dashboard</title>
    <style>
        body { background: #0f172a; color: #f8fafc; font-family: system-ui, sans-serif; margin: 0; padding: 20px; }
        .container { max-width: 900px; margin: 0 auto; }
        header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 15px; margin-bottom: 20px; }
        h1 { margin: 0; font-size: 24px; color: #38bdf8; }
        .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 25px; }
        .card { background: #1e293b; padding: 20px; border-radius: 10px; border: 1px solid #334155; }
        .card h3 { margin: 0 0 10px 0; color: #94a3b8; font-size: 14px; }
        .card .value { font-size: 22px; font-weight: bold; }
        .positive { color: #4ade80; }
        .negative { color: #f87171; }
        table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 10px; overflow: hidden; border: 1px solid #334155; }
        th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #334155; font-size: 14px; }
        th { background: #334155; color: #cbd5e1; }
        .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        .badge-tp { background: rgba(74, 222, 128, 0.2); color: #4ade80; }
        .badge-sl { background: rgba(248, 113, 113, 0.2); color: #f87171; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>⚡ Solana Auto-Sniper Dashboard</h1>
            <span id="status" style="color: #4ade80;">● A Escuta (Mainnet)</span>
        </header>

        <div class="grid">
            <div class="card">
                <h3>Total de Trades</h3>
                <div class="value" id="total-trades">0</div>
            </div>
            <div class="card">
                <h3>Lucro Líquido (SOL)</h3>
                <div class="value" id="total-profit">0.00 SOL</div>
            </div>
            <div class="card">
                <h3>Posição Ativa</h3>
                <div class="value" id="active-status" style="font-size: 16px; color: #facc15;">Nenhuma</div>
            </div>
        </div>

        <h2>📜 Histórico de Transações</h2>
        <table>
            <thead>
                <tr>
                    <th>Token</th>
                    <th>Entrada</th>
                    <th>Investido</th>
                    <th>Saída / PnL</th>
                    <th>Resultado</th>
                </tr>
            </thead>
            <tbody id="history-table">
                <tr><td colspan="5" style="text-align: center; color: #94a3b8;">A carregar dados...</td></tr>
            </tbody>
        </table>
    </div>

    <script>
        async function fetchStats() {
            try {
                // Utilização de URL relativa (/api/stats) compatível com túneis cloud (Codespaces)
                const res = await fetch('/api/stats');
                const data = await res.json();
                
                document.getElementById('total-trades').innerText = data.totalTrades;
                const netProfit = data.totalReturnedSol - data.totalSpentSol;
                const profitEl = document.getElementById('total-profit');
                profitEl.innerText = (netProfit >= 0 ? "+" : "") + netProfit.toFixed(4) + " SOL";
                profitEl.className = "value " + (netProfit >= 0 ? "positive" : "negative");

                const activeEl = document.getElementById('active-status');
                if (data.activeTrade) {
                    activeEl.innerHTML = \`<b>\${data.activeTrade.name}</b><br>PnL: <span class="\${data.activeTrade.pnlPct >= 0 ? 'positive' : 'negative'}">\${data.activeTrade.pnlPct}%</span>\`;
                } else {
                    activeEl.innerText = "À procura de pools...";
                }

                const tbody = document.getElementById('history-table');
                if (data.history.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #94a3b8;">Nenhum trade registado ainda.</td></tr>';
                } else {
                    tbody.innerHTML = data.history.slice(-10).reverse().map(t => \`
                        <tr>
                            <td><b>\${t.name}</b><br><small style="color: #64748b">\${t.mint.slice(0, 10)}...</small></td>
                            <td>\${t.entryTime}</td>
                            <td>\${t.investedSol} SOL</td>
                            <td class="\${t.pnlPct >= 0 ? 'positive' : 'negative'}">\${t.pnlPct > 0 ? '+' : ''}\${t.pnlPct}%</td>
                            <td><span class="badge \${t.result === 'TAKE_PROFIT' ? 'badge-tp' : 'badge-sl'}">\${t.result}</span></td>
                        </tr>
                    \`).join('');
                }
            } catch (e) {
                console.error("Erro ao atualizar dashboard", e);
            }
        }

        setInterval(fetchStats, 2000);
        fetchStats();
    </script>
</body>
</html>`;

server.listen(3000, () => {
    console.log("🌐 Dashboard web a rodar em: http://localhost:3000");
});

async function pollRealBlockchainEvents() {
    carregarHistorico();

    if (activeSnipeTrade) {
        const variacao = (Math.random() * 55 - 22);
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
    } else {
        botStats.totalScanned++;
        try {
            await connection.getSlot();
            const mockRealTokens = [
                { name: "SOL_MEME_1", mint: "So11111111111111111111111111111111111111112", liquiditySol: 18.5 },
                { name: "REAL_AI_X", mint: "TokenReal999999SolanaNetworkMintExample", liquiditySol: 12.0 },
                { name: "PUMP_GEM", mint: "PumpTokenFakeMintAddress123456789Sol", liquiditySol: 42.1 }
            ];
            const token = mockRealTokens[Math.floor(Math.random() * mockRealTokens.length)];

            if (token.liquiditySol >= SNIPER_CONFIG.minLiquiditySol) {
                botStats.approvedTokens++;
                activeSnipeTrade = {
                    name: token.name,
                    mint: token.mint,
                    investedSol: SNIPER_CONFIG.amountToInvestSol,
                    currentValueSol: SNIPER_CONFIG.amountToInvestSol,
                    pnlPct: 0,
                    entryTime: new Date().toLocaleTimeString()
                };
                botStats.activeTrade = activeSnipeTrade;
            } else {
                botStats.rejectedTokens++;
            }
        } catch (error) {
            // Mantém a execução silenciosa em caso de falhas temporárias de rede RPC
        }
    }
}

setInterval(pollRealBlockchainEvents, 4000);
pollRealBlockchainEvents();
