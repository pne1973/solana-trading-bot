require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Connection, PublicKey } = require('@solana/web3.js');

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const WSS_URL = process.env.SOLANA_WSS_URL || 'wss://api.mainnet-beta.solana.com';

const connection = new Connection(RPC_URL, {
    commitment: 'confirmed',
    wsEndpoint: WSS_URL
});

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

// Servidor do Dashboard Web com API expandida
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.url === '/api/stats') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ...botStats, config: SNIPER_CONFIG }));
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

// Simulação de ciclo de mercado e gestão de Posição Ativa
setInterval(() => {
    carregarHistorico();
    if (activeSnipeTrade) {
        const variacao = (Math.random() * 55 - 21);
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

// Escuta real na Mainnet via Helius WSS
function iniciarEscutaReal() {
    const PUMP_FUN_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
    try {
        connection.onLogs(
            new PublicKey(PUMP_FUN_PROGRAM),
            (updatedAccountInfo) => {
                botStats.totalScanned++;
                const logs = updatedAccountInfo.logs;
                const isCreate = logs.some(l => l.includes("Initialize") || l.includes("Create"));

                if (isCreate) {
                    botStats.approvedTokens++;
                    if (!activeSnipeTrade) {
                        const tokenMintHash = updatedAccountInfo.signature;
                        activeSnipeTrade = {
                            name: "PUMP_" + tokenMintHash.slice(0, 5).toUpperCase(),
                            mint: tokenMintHash,
                            investedSol: SNIPER_CONFIG.amountToInvestSol,
                            currentValueSol: SNIPER_CONFIG.amountToInvestSol,
                            pnlPct: 0,
                            entryTime: new Date().toLocaleTimeString()
                        };
                        botStats.activeTrade = activeSnipeTrade;
                    }
                } else {
                    botStats.rejectedTokens++;
                }
            },
            "confirmed"
        );
        console.log("📡 Escuta real ativa via Helius WSS.");
    } catch (e) {
        console.error("Erro na subscrição WSS:", e.message);
    }
}

carregarHistorico();
iniciarEscutaReal();
