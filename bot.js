require('dotenv').config();

// Configurações do Auto Sniper (Estilo GMGN)
const SNIPER_CONFIG = {
    amountToInvestSol: 0.05,       // Quantidade de SOL alocada por snipe automático
    minLiquiditySol: 15,           // Mínimo de SOL exigido no pool de liquidez
    requireLpBurned: true,         // Exigir que o LP esteja queimado/bloqueado
    maxBuyTaxPct: 0,               // Rejeitar tokens com taxa de compra
    autoTakeProfitPct: 45,         // Alvo de lucro automático (+45%)
    autoStopLossPct: -20           // Limite de perda automática (-20%)
};

let activeSnipeTrade = null;

function runGmgnStyleSniperEngine() {
    console.log("\n==================================================");
    console.log(`[GMGN SNIPER ENGINE] Escutando novos pools: ${new Date().toLocaleTimeString()}`);
    console.log("==================================================");

    // Simulação de fluxo de novos meme tokens detetados no mempool / Pump.fun / Raydium
    const rawMarketStream = [
        { 
            name: "PEPE_SOL", 
            mint: "EPepeSolMintAddressMock1111111111111111111", 
            liquiditySol: 28.5, 
            lpBurned: true, 
            buyTax: 0, 
            smartMoneyInflows: 4 
        },
        { 
            name: "SCAM_COIN", 
            mint: "EScamCoinMintAddressMock2222222222222222222", 
            liquiditySol: 4.2,  
            lpBurned: false, 
            buyTax: 99, 
            smartMoneyInflows: 0 
        },
        { 
            name: "SOL_AI", 
            mint: "ESolAiMintAddressMock33333333333333333333", 
            liquiditySol: 45.0, 
            lpBurned: true, 
            buyTax: 0, 
            smartMoneyInflows: 8 
        }
    ];

    // Seleciona um evento de token aleatório do fluxo para testar o filtro do sniper
    const detectedToken = rawMarketStream[Math.floor(Math.random() * rawMarketStream.length)];

    console.log(`🚀 [NOVO TOKEN ENCONTRADO]: ${detectedToken.name}`);
    console.log(`   - Endereço Mint: ${detectedToken.mint}`);
    console.log(`   - Liquidez do Pool: ${detectedToken.liquiditySol} SOL`);
    console.log(`   - LP Queimado: ${detectedToken.lpBurned ? 'Sim (Seguro)' : 'Não (Risco)'}`);
    console.log(`   - Smart Money Entradas: ${detectedToken.smartMoneyInflows} carteiras`);

    // --- FILTROS DE SEGURANÇA E AUDITORIA (Estilo GMGN Audit) ---
    if (detectedToken.liquiditySol < SNIPER_CONFIG.minLiquiditySol) {
        console.log(`🛡️ [SNIPER REJEITADO] Liquidez abaixo do limiar seguro (${SNIPER_CONFIG.minLiquiditySol} SOL).`);
        monitorActiveTrade();
        return;
    }

    if (SNIPER_CONFIG.requireLpBurned && !detectedToken.lpBurned) {
        console.log(`🛡️ [SNIPER REJEITADO] Alerta de Rug Pull: LP não queimado.`);
        monitorActiveTrade();
        return;
    }

    if (detectedToken.buyTax > SNIPER_CONFIG.maxBuyTaxPct) {
        console.log(`🛡️ [SNIPER REJEITADO] Taxa de compra abusiva detetada (${detectedToken.buyTax}%).`);
        monitorActiveTrade();
        return;
    }

    console.log(`✨ [APROVADO PELO FILTRO]: ${detectedToken.name} passou em todos os parâmetros de segurança!`);

    // --- EXECUÇÃO DA COMPRA (SNIPE) ---
    if (!activeSnipeTrade) {
        activeSnipeTrade = {
            name: detectedToken.name,
            mint: detectedToken.mint,
            investedSol: SNIPER_CONFIG.amountToInvestSol,
            currentValueSol: SNIPER_CONFIG.amountToInvestSol,
            entryTime: new Date()
        };
        console.log(`🎯 [AUTO-BUY EXECUTADO] Comprados ${SNIPER_CONFIG.amountToInvestSol} SOL de ${detectedToken.name} instantaneamente!`);
    } else {
        console.log(`⏳ Já existe uma posição aberta em ${activeSnipeTrade.name}. Ignorando novo sinal.`);
    }

    monitorActiveTrade();
}

function monitorActiveTrade() {
    if (!activeSnipeTrade) return;

    console.log(`\n--------------------------------------------------`);
    console.log(`📊 [GERINDO POSIÇÃO ATIVA]: ${activeSnipeTrade.name}`);

    // Simula a volatilidade agressiva de preço do token snipado
    const swingPct = (Math.random() * 50 - 20); // Variação entre -20% e +30% por ciclo
    activeSnipeTrade.currentValueSol *= (1 + swingPct / 100);

    const pnlPct = ((activeSnipeTrade.currentValueSol - SNIPER_CONFIG.amountToInvestSol) / SNIPER_CONFIG.amountToInvestSol) * 100;
    console.log(`   - PnL Atual: ${pnlPct.toFixed(2)}% (Valor avaliado: ${activeSnipeTrade.currentValueSol.toFixed(4)} SOL)`);

    // Gestão de Saída (Take Profit / Stop Loss)
    if (pnlPct >= SNIPER_CONFIG.autoTakeProfitPct) {
        console.log(`🎉 [TAKE PROFIT ATINGIDO] Venda automática efetuada em ${activeSnipeTrade.name} com lucro de +${pnlPct.toFixed(2)}%!`);
        activeSnipeTrade = null;
    } else if (pnlPct <= SNIPER_CONFIG.autoStopLossPct) {
        console.log(`🛑 [STOP LOSS ATINGIDO] Cortando perdas em ${activeSnipeTrade.name} (${pnlPct.toFixed(2)}%) para proteger o capital.`);
        activeSnipeTrade = null;
    } else {
        console.log(`⏳ Posição segura. Aguardando próximo bloco...`);
    }
}

// Executa o motor do sniper a cada 6 segundos
setInterval(runGmgnStyleSniperEngine, 6000);
runGmgnStyleSniperEngine();
