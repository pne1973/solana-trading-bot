require('dotenv').config();

// Configurações do Auto Sniper (Estilo GMGN)
const SNIPER_CONFIG = {
    amountToInvestSol: 0.05,       // SOL alocado por snipe
    minLiquiditySol: 15,           // Mínimo de SOL no pool
    autoTakeProfitPct: 50,         // Alvo de lucro (+50%)
    autoStopLossPct: -25           // Stop Loss (-25%)
};

let activeSnipeTrade = null;

// Gerador dinâmico de Meme Tokens (Simula o fluxo de novos pools na Pump.fun / Raydium)
function gerarNovoMemeTokenAleatorio() {
    const prefixos = ["MOON", "PEPE", "SOL", "CAT", "DOG", "AI", "CHAD", "BABY", "ELON", "SAFE"];
    const sufixos = ["INU", "WIF", "PEPE", "AI", "GEM", "MOON", "ROCKET", "BOME"];
    
    const nomeAleatorio = prefixos[Math.floor(Math.random() * prefixos.length)] + "_" + 
                          sufixos[Math.floor(Math.random() * sufixos.length)] + "_" + 
                          Math.floor(Math.random() * 900 + 100);

    // Simula dados reais obtidos on-chain do pool de liquidez
    return {
        name: nomeAleatorio,
        mint: "Token" + Math.random().toString(36).substring(2, 15) + "Sol",
        liquiditySol: Number((Math.random() * 50 + 5).toFixed(2)), // Entre 5 e 55 SOL de liquidez
        lpBurned: Math.random() > 0.2, // 80% de chance de ter o LP queimado (seguro)
        buyTax: Math.random() > 0.9 ? 5 : 0 // 10% de chance de ter taxa maliciosa
    };
}

function runAutoSniperEngine() {
    console.log("\n==================================================");
    console.log(`[AUTO-SNIPER RADAR] Procurando novos pools: ${new Date().toLocaleTimeString()}`);
    console.log("==================================================");

    // Se já tivermos uma posição aberta, o foco é gerir o trade atual antes de snipar outro
    if (activeSnipeTrade) {
        monitorActiveTrade();
        return;
    }

    // O bot "escuta" e captura um novo token recém-criado
    const tokenDetectado = gerarNovoMemeTokenAleatorio();

    console.log(`🚀 [NOVO TOKEN DETETADO NO MEMPOOL]: ${tokenDetectado.name}`);
    console.log(`   - Mint: ${tokenDetectado.mint}`);
    console.log(`   - Liquidez Inicial: ${tokenDetectado.liquiditySol} SOL`);
    console.log(`   - LP Queimado: ${tokenDetectado.lpBurned ? '✅ Sim (Seguro)' : '❌ Não (Risco)'}`);
    console.log(`   - Taxa de Compra: ${tokenDetectado.buyTax}%`);

    // --- FILTROS DE SEGURANÇA DO SNIPER (Anti-Rug) ---
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

    // --- EXECUÇÃO DO SNIPE AUTOMÁTICO ---
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

    // Simula a oscilação de preço altamente volátil típica de um meme token recém-lançado
    const variacaoPreco = (Math.random() * 60 - 22); // Variação entre -22% e +38% por ciclo
    activeSnipeTrade.currentValueSol *= (1 + variacaoPreco / 100);

    const pnlPct = ((activeSnipeTrade.currentValueSol - SNIPER_CONFIG.investedSol) / SNIPER_CONFIG.investedSol) * 100;
    console.log(`   - PnL Atual: ${pnlPct.toFixed(2)}% (Valor: ${activeSnipeTrade.currentValueSol.toFixed(4)} SOL)`);

    // Verificação de Saída (Take Profit / Stop Loss)
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

// Executa o radar de novos tokens a cada 4 segundos
setInterval(runAutoSniperEngine, 4000);
runAutoSniperEngine();
