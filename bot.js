require('dotenv').config();
const fs = require('fs');

const SNIPER_CONFIG = {
    amountToInvestSol: 0.05,
    minLiquiditySol: 15,
    autoTakeProfitPct: 50,
    autoStopLossPct: -25
};

let activeSnipeTrade = null;
const HISTORY_FILE = 'trades_history.json';

let botStats = {
    totalTrades: 0,
    totalProfitSol: 0,
    history: []
};

function carregarHistorico() {
    if (fs.existsSync(HISTORY_FILE)) {
        try {
            const data = fs.readFileSync(HISTORY_FILE, 'utf8');
            botStats.history = JSON.parse(data);
            botStats.totalTrades = botStats.history.length;
            botStats.totalProfitSol = botStats.history.reduce((acc, t) => acc + (t.finalValueSol - t.investedSol), 0);
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

function gerarNovoMemeToken() {
    const prefixos = ["MOON", "PEPE", "SOL", "CAT", "DOG", "AI", "CHAD", "BABY", "ELON", "SAFE"];
    const sufixos = ["INU", "WIF", "PEPE", "AI", "GEM", "MOON", "ROCKET", "BOME"];
    
    return {
        name: prefixos[Math.floor(Math.random() * prefixos.length)] + "_" + sufixos[Math.floor(Math.random() * sufixos.length)] + "_" + Math.floor(Math.random() * 900 + 100),
        mint: "Token" + Math.random().toString(36).substring(2, 12) + "Sol",
        liquiditySol: Number((Math.random() * 50 + 10).toFixed(2)),
        lpBurned: Math.random() > 0.15,
        buyTax: Math.random() > 0.95 ? 5 : 0
    };
}

// Limpa o terminal e desenha um Dashboard em Texto Rico (CLI)
function renderTerminalDashboard() {
    console.clear();
    console.log("==================================================================");
    console.log("               ⚡ SOLANA AUTO-SNIPER TERMINAL DASHBOARD           ");
    console.log("==================================================================");
    console.log(` 📊 Total de Trades: ${botStats.totalTrades}   |   💰 Lucro Líquido: ${botStats.totalProfitSol >= 0 ? '+' : ''}${botStats.totalProfitSol.toFixed(4)} SOL`);
    console.log("------------------------------------------------------------------");
    
    if (activeSnipeTrade) {
        console.log(` 🟢 POSIÇÃO ATIVA: ${activeSnipeTrade.name}`);
        console.log(`    - Investido: ${activeSnipeTrade.investedSol} SOL`);
        console.log(`    - Valor Atual: ${activeSnipeTrade.currentValueSol.toFixed(4)} SOL`);
        console.log(`    - PnL Atual: ${activeSnipeTrade.pnlPct >= 0 ? '+' : ''}${activeSnipeTrade.pnlPct}%`);
    } else {
        console.log(` ⏳ Estado: À procura de novos pools no mempool...`);
    }
    
    console.log("------------------------------------------------------------------");
    console.log(" 📜 ÚLTIMOS TRADES NO HISTÓRICO:");
    if (botStats.history.length === 0) {
        console.log("    Nenhum trade registado ainda.");
    } else {
        botStats.history.slice(-5).reverse().forEach(t => {
            const sinal = t.pnlPct >= 0 ? "+" : "";
            console.log(`    [${t.exitTime}] ${t.name.padEnd(15)} | PnL: ${sinal}${t.pnlPct}% | Result: ${t.result}`);
        });
    }
    console.log("==================================================================");
}

function runEngine() {
    carregarHistorico();

    if (activeSnipeTrade) {
        const variacao = (Math.random() * 55 - 20);
        activeSnipeTrade.currentValueSol *= (1 + variacao / 100);
        const pnl = ((activeSnipeTrade.currentValueSol - activeSnipeTrade.investedSol) / activeSnipeTrade.investedSol) * 100;
        activeSnipeTrade.pnlPct = Number(pnl.toFixed(2));

        if (pnl >= SNIPER_CONFIG.autoTakeProfitPct || pnl <= SNIPER_CONFIG.autoStopLossPct) {
            salvarTradeNoHistorico({
                name: activeSnipeTrade.name,
                mint: activeSnipeTrade.mint,
                entryTime: activeSnipeTrade.entryTime,
                exitTime: new Date().toLocaleTimeString(),
                investedSol: activeSnipeTrade.investedSol,
                finalValueSol: activeSnipeTrade.currentValueSol,
                pnlPct: activeSnipeTrade.pnlPct,
                result: pnl >= SNIPER_CONFIG.autoTakeProfitPct ? "TAKE_PROFIT" : "STOP_LOSS"
            });
            activeSnipeTrade = null;
        }
    } else {
        const token = gerarNovoMemeToken();
        if (token.liquiditySol >= SNIPER_CONFIG.minLiquiditySol && token.lpBurned && token.buyTax === 0) {
            activeSnipeTrade = {
                name: token.name,
                mint: token.mint,
                investedSol: SNIPER_CONFIG.amountToInvestSol,
                currentValueSol: SNIPER_CONFIG.amountToInvestSol,
                pnlPct: 0,
                entryTime: new Date().toLocaleTimeString()
            };
        }
    }

    renderTerminalDashboard();
}

// Atualiza o painel e o bot a cada 3 segundos
setInterval(runEngine, 3000);
runEngine();
