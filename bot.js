require('dotenv').config();
const fs = require('fs');

// Configurações do Auto Sniper
const SNIPER_CONFIG = {
    amountToInvestSol: 0.05,       // Saldo base investido por operação (SOL)
    minLiquiditySol: 15,           // Mínimo de SOL no pool
    autoTakeProfitPct: 50,         // Alvo de Lucro (+50%)
    autoStopLossPct: -25           // Stop Loss (-25%)
};

let activeSnipeTrade = null;
const HISTORY_FILE = 'trades_history.json';

// Estatísticas globais do bot
let botStats = {
    totalScanned: 0,
    approvedTokens: 0,
    rejectedTokens: 0,
    totalSpentSol: 0,
    totalReturnedSol: 0,
    totalTrades: 0,
    wins: 0,
    losses: 0,
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

function gerarNovoMemeToken() {
    const prefixos = ["MOON", "PEPE", "SOL", "CAT", "DOG", "AI", "CHAD", "BABY", "ELON", "SAFE"];
    const sufixos = ["INU", "WIF", "PEPE", "AI", "GEM", "MOON", "ROCKET", "BOME"];
    
    return {
        name: prefixos[Math.floor(Math.random() * prefixos.length)] + "_" + sufixos[Math.floor(Math.random() * sufixos.length)] + "_" + Math.floor(Math.random() * 900 + 100),
        mint: "Token" + Math.random().toString(36).substring(2, 12) + "Sol",
        liquiditySol: Number((Math.random() * 50 + 5).toFixed(2)),
        lpBurned: Math.random() > 0.2,
        buyTax: Math.random() > 0.9 ? 5 : 0
    };
}

function renderTerminalDashboard(ultimoEvento) {
    console.clear();
    console.log("==================================================================");
    console.log("               ⚡ SOLANA AUTO-SNIPER DASHBOARD PRO                ");
    console.log("==================================================================");
    
    console.log(` 📡 RADAR DE MERCADO:`);
    console.log(`    - Tokens Escaneados: ${botStats.totalScanned}`);
    console.log(`    - Aprovados (Seguros): ${botStats.approvedTokens}   |   Rejeitados: ${botStats.rejectedTokens}`);
    console.log("------------------------------------------------------------------");

    const lucroLiquidoSol = botStats.totalReturnedSol - botStats.totalSpentSol;
    const winrate = botStats.totalTrades > 0 ? ((botStats.wins / botStats.totalTrades) * 100).toFixed(1) : 0;
    
    console.log(` 💰 BALANÇO FINANCEIRO E PERFORMANCE:`);
    console.log(`    - Saldo Base por Operação: ${SNIPER_CONFIG.amountToInvestSol} SOL`);
    console.log(`    - Total Gasto em Snipes: ${botStats.totalSpentSol.toFixed(4)} SOL`);
    console.log(`    - Retorno Total (Vendas): ${botStats.totalReturnedSol.toFixed(4)} SOL`);
    console.log(`    - Ganhos / Lucro Líquido: ${lucroLiquidoSol >= 0 ? '+' : ''}${lucroLiquidoSol.toFixed(4)} SOL`);
    console.log(`    - Winrate: ${winrate}% (${botStats.wins} Wins / ${botStats.losses} Losses em ${botStats.totalTrades} trades)`);
    console.log("------------------------------------------------------------------");

    if (activeSnipeTrade) {
        console.log(` 🟢 POSIÇÃO ATIVA NO MOMENTO:`);
        console.log(`    - Token: ${activeSnipeTrade.name}`);
        console.log(`    - Investido: ${activeSnipeTrade.investedSol} SOL`);
        console.log(`    - Valor Atual: ${activeSnipeTrade.currentValueSol.toFixed(4)} SOL`);
        console.log(`    - PnL Flutuante: ${activeSnipeTrade.pnlPct >= 0 ? '+' : ''}${activeSnipeTrade.pnlPct}%`);
    } else {
        console.log(` ⏳ Estado Atual: À procura de novos pools válidos no mempool...`);
    }

    console.log("------------------------------------------------------------------");
    console.log(` 📢 ÚLTIMO EVENTO: ${ultimoEvento}`);
    console.log("------------------------------------------------------------------");

    console.log(" 📜 ÚLTIMAS OPERAÇÕES (HISTÓRICO):");
    if (botStats.history.length === 0) {
        console.log("    Nenhuma operação fechada ainda.");
    } else {
        botStats.history.slice(-4).reverse().forEach(t => {
            const sinal = t.pnlPct >= 0 ? "+" : "";
            const diffSol = (t.finalValueSol - t.investedSol).toFixed(4);
            console.log(`    [${t.exitTime}] ${t.name.padEnd(15)} | PnL: ${sinal}${t.pnlPct}% (${diffSol} SOL) | [${t.result}]`);
        });
    }
    console.log("==================================================================");
}

function runEngine() {
    carregarHistorico();
    let eventoMsg = "A monitorizar o fluxo de blocos...";

    if (activeSnipeTrade) {
        const variacao = (Math.random() * 55 - 20);
        activeSnipeTrade.currentValueSol *= (1 + variacao / 100);
        const pnl = ((activeSnipeTrade.currentValueSol - activeSnipeTrade.investedSol) / activeSnipeTrade.investedSol) * 100;
        activeSnipeTrade.pnlPct = Number(pnl.toFixed(2));
        eventoMsg = `A gerir trade ativo em ${activeSnipeTrade.name} (${activeSnipeTrade.pnlPct}%)`;

        if (pnl >= SNIPER_CONFIG.autoTakeProfitPct || pnl <= SNIPER_CONFIG.autoStopLossPct) {
            const resultado = pnl >= SNIPER_CONFIG.autoTakeProfitPct ? "TAKE_PROFIT" : "STOP_LOSS";
            eventoMsg = `⚠️ Trade fechado (${resultado}): ${activeSnipeTrade.name} com ${activeSnipeTrade.pnlPct}%`;
            
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
        }
    } else {
        botStats.totalScanned++;
        const token = gerarNovoMemeToken();

        if (token.liquiditySol < SNIPER_CONFIG.minLiquiditySol) {
            botStats.rejectedTokens++;
            eventoMsg = `Rejeitado (${token.name}): Liquidez baixa (${token.liquiditySol} SOL)`;
        } else if (!token.lpBurned) {
            botStats.rejectedTokens++;
            eventoMsg = `Rejeitado (${token.name}): LP não queimado (Risco de Rug)`;
        } else if (token.buyTax > 0) {
            botStats.rejectedTokens++;
            eventoMsg = `Rejeitado (${token.name}): Taxa de compra abusiva`;
        } else {
            botStats.approvedTokens++;
            activeSnipeTrade = {
                name: token.name,
                mint: token.mint,
                investedSol: SNIPER_CONFIG.amountToInvestSol,
                currentValueSol: SNIPER_CONFIG.amountToInvestSol,
                pnlPct: 0,
                entryTime: new Date().toLocaleTimeString()
            };
            eventoMsg = `🎯 Snipe executado com sucesso em ${token.name} (${token.liquiditySol} SOL liq)`;
        }
    }

    renderTerminalDashboard(eventoMsg);
}

setInterval(runEngine, 3000);
runEngine();
