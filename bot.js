require('dotenv').config();
const fs = require('fs');
const path = require('path');
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

// Servidor HTTP otimizado para servir ficheiros estáticos no Codespaces
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.url === '/api/stats') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(botStats));
    } else {
        const filePath = path.join(__dirname, 'public', 'index.html');
        fs.readFile(filePath, (err, content) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Erro interno ao carregar o dashboard.');
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(content);
            }
        });
    }
});

server.listen(3000, '0.0.0.0', () => {
    console.log("🌐 Dashboard web a rodar em: http://0.0.0.0:3000");
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
            // Silencia erros de rede temporários
        }
    }
}

setInterval(pollRealBlockchainEvents, 4000);
pollRealBlockchainEvents();
