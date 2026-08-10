require('dotenv').config();

// Configurações do Auto Sniper (Estilo GMGN)
const SNIPER_CONFIG = {
    amountToInvestSol: 0.05,       
    minLiquiditySol: 15,           
    autoTakeProfitPct: 50,         
    autoStopLossPct: -25           
};

let activeSnipeTrade = null;

function gerarNovoMemeTokenAleatorio() {
    const prefixos = ["MOON", "PEPE", "SOL", "CAT", "DOG", "AI", "CHAD", "BABY", "ELON", "SAFE"];
    const sufixos = ["INU", "WIF", "PEPE", "AI", "GEM", "MOON", "ROCKET", "BOME"];
    
    const nomeAleatorio = prefixos[Math.floor(Math.random() * prefixos.length)] + "_" + 
                          sufixos[Math.floor(Math.random() * sufixos.length)] + "_" + 
                          Math.floor(Math.random() * 900 + 100);

    return {
        name: nomeAleatorio,
        mint: "Token" + Math.random().toString(36).substring(2, 15) + "Sol",
        liquiditySol: Number((Math.random() * 50 + 5).toFixed(2)),
        lpBurned: Math.random() > 0.2, 
        buyTax: Math.random() > 0.9 ? 5 : 0 
    };
}

function runAutoSniperEngine() {
    console.log("\n==================================================");
    console.log(`[AUTO-SNIPER RADAR] Procurando novos pools: ${new Date().toLocaleTimeString()}`);
    console.log("==================================================");

    if (activeSnipeTrade) {
        monitorActiveTrade();
        return;
    }

    const tokenDetectado = gerarNovoMemeTokenAleatorio();

    console.log(`🚀 [NOVO TOKEN DETETADO NO MEMPOOL]: ${tokenDetectado.name}`);
    console.log(`   - Mint: ${tokenDetectado.mint}`);
    console.log(`   - Liquidez Inicial: ${tokenDetectado.liquiditySol} SOL`);
    console.log(`   - LP Queimado: ${tokenDetectado.lpBurned ? '✅ Sim (Seguro)' : '❌ Não (Risco)'}`);
    console.log(`   - Taxa de Compra: ${tokenDetectado.buyTax}%`);

    if (tokenDetectado.liquiditySol < SNIPER_CONFIG.minLiquiditySol) {
        console.log(`🛡️ [REJEITADO] Liquidez abaixo do mínimo configurado (${SNIPER_CONFIG.minLiquiditySol} SOL).`);
        return;
    }

    if (!tokenDetectado.lpBurned) {
        console.log(`🛡️ [REJEITADO] Alerta de golpe: Pool de liquidez não foi queimado.`);
        return;
    }

    if (tokenDetectado.buyTax > 0) {
        console.log(`🛡️ [REJEITADO] Token taxado detetado. Ignorando.`);
        return;
    }

    console.log(`✨ [APROVADO] ${tokenDetectado.name} passou nos filtros de segurança do GMGN!`);

    activeSnipeTrade = {
        name: tokenDetectado.name,
        mint: tokenDetectado.mint,
        investedSol: SNIPER_CONFIG.amountToInvestSol,
        currentValueSol: SNIPER_CONFIG.amountToInvestSol
    };
    console.log(`🎯 [COMPRA EXECUTADA] Snipados ${SNIPER_CONFIG.amountToInvestSol} SOL em ${tokenDetectado.name} com sucesso!`);
}

function monitorActiveTrade() {
    console.log(`\n--------------------------------------------------`);
    console.log(`📊 [GERINDO POSIÇÃO DO SNIPE]: ${activeSnipeTrade.name}`);

    const variacaoPreco = (Math.random() * 60 - 22); 
    activeSnipeTrade.currentValueSol *= (1 + variacaoPreco / 100);

    const pnlPct = ((activeSnipeTrade.currentValueSol - activeSnipeTrade.investedSol) / activeSnipeTrade.investedSol) * 100;
    console.log(`   - PnL Atual: ${pnlPct.toFixed(2)}% (Valor: ${activeSnipeTrade.currentValueSol.toFixed(4)} SOL)`);

    if (pnlPct >= SNIPER_CONFIG.autoTakeProfitPct) {
        console.log(`🎉 [TAKE PROFIT ATINGIDO!] Vendendo ${activeSnipeTrade.name} com lucro de +${pnlPct.toFixed(2)}%!`);
        activeSnipeTrade = null;
    } else if (pnlPct <= SNIPER_CONFIG.autoStopLossPct) {
        console.log(`🛑 [STOP LOSS ATINGIDO!] Cortando perdas em ${activeSnipeTrade.name} (${pnlPct.toFixed(2)}%).`);
        activeSnipeTrade = null;
    } else {
        console.log(`⏳ Posição mantida. A acompanhar o próximo bloco...`);
    }
}

setInterval(runAutoSniperEngine, 4000);
runAutoSniperEngine();
