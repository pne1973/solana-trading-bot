require('dotenv').config();
const fs = require('fs');

// Configurações Avançadas do Auto Sniper (Estilo GMGN)
const SNIPER_CONFIG = {
    amountToInvestSol: 0.05,       // Quantidade de SOL alocada por snipe
    minLiquiditySol: 15,           // Mínimo de SOL no pool de liquidez
    minSmartMoneyWallets: 2,       // Mínimo de carteiras de Smart Money detetadas
    autoTakeProfitPct: 50,         // Alvo de lucro automático (+50%)
    autoStopLossPct: -25           // Limite de perda automática (-25%)
};

let activeSnipeTrade = null;
const HISTORY_FILE = 'trades_history.json';

// Função para salvar histórico de trades em JSON
function salvarTradeNoHistorico(tradeData) {
    let history = [];
    if (fs.existsSync(HISTORY_FILE)) {
        try {
            const data = fs.readFileSync(HISTORY_FILE, 'utf8');
            history = JSON.parse(data);
        } catch (e) {
            history = [];
        }
    }
    history.push(tradeData);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

// Gerador dinâmico avançado de Meme Tokens com Smart Money
function gerarNovoMemeTokenAvancado() {
    const prefixos = ["MOON", "PEPE", "SOL", "CAT", "DOG", "AI", "CHAD", "BABY", "ELON", "SAFE"];
    const sufixos = ["INU", "WIF", "PEPE", "AI", "GEM", "MOON", "ROCKET", "BOME"];
    
    const nome = prefixos[Math.floor(Math.random() * prefixos.length)] + "_" + 
                 sufixos[Math.floor(Math.random() * sufixos.length)] + "_" + 
                 Math.floor(Math.random() * 900 + 100);

    return {
        name: nome,
        mint: "Token" + Math.random().toString(36).substring(2, 15) + "Sol",
        liquiditySol: Number((Math.random() * 50 + 10).toFixed(2)),
        lpBurned: Math.random() > 0.15, // 85% de chance de LP queimado
        smartMoneyCount: Math.floor(Math.random() * 6), // De 0 a 5 carteiras smart money
        buyTax: Math.random() > 0.95 ? 5 : 0
    };
}

function runAutoSniperEngine() {
    console.log("\n==================================================");
    console.log(`[AUTO-SNIPER RADAR] Procurando novos pools: ${new Date().toLocaleTimeString()}`);
    console.log("==================================================);

    if (activeSnipeTrade) {
        monitorActiveTrade();
        return;
    }

    const tokenDetectado = gerarNovoMemeTokenAvancado();

    console.log(`🚀 [NOVO TOKEN DETETADO]: ${tokenDetectado.name}`);
    console.log(`   - Mint: ${tokenDetectado.mint}`);
    console.log(`   - Liquidez Inicial: ${tokenDetectado.liquiditySol} SOL`);
    console.log(`   - LP Queimado: ${tokenDetectado.lpBurned ? '✅ Sim (Seguro)' : '❌ Não (Risco)'}`);
    console.log(`   - Smart Money (Top Wallets): ${tokenDetectado.smartMoneyCount} detetadas`);
    console.log(`   - Taxa de Compra: ${tokenDetectado.buyTax}%`);

    // --- FILTROS DE SEGURANÇA E SMART MONEY ---
    if (tokenDetectado.liquiditySol < SNIPER_CONFIG.minLiquiditySol) {
        console.log(`🛡️ [REJEITADO] Liquidez abaixo do limiar (${SNIPER_CONFIG.minLiquiditySol} SOL).`);
        return;
    }

    if (!tokenDetectado.lpBurned) {
        console.log(`🛡️ [REJEITADO] Alerta de Rug Pull: LP não queimado.`);
        return;
    }

    if (tokenDetectado.smartMoneyCount < SNIPER_CONFIG.minSmartMoneyWallets) {
        console.log(`🛡️ [REJEITADO] Fluxo fraco: Apenas ${tokenDetectado.smartMoneyCount} carteiras de Smart Money (Mínimo: ${SNIPER_CONFIG.minSmartMoneyWallets}).`);
        return;
    }

    if (tokenDetectado.buyTax > 0) {
        console.log(`🛡️ [REJEITADO] Token taxado detetado.`);
        return;
    }

    console.log(`✨ [APROVADO] ${tokenDetectado.name} aprovado pelos filtros de auditoria do GMGN!`);

    // --- EXECUÇÃO DO SNIPE ---
    activeSnipeTrade = {
        name: tokenDetectado.name,
        mint: tokenDetectado.mint,
        investedSol: SNIPER_CONFIG.amountToInvestSol,
        currentValueSol: SNIPER_CONFIG.amountToInvestSol,
        entryTime: new Date().toISOString()
    };
    console.log(`🎯 [COMPRA EXECUTADA] Snipados ${SNIPER_CONFIG.amountToInvestSol} SOL em ${tokenDetectado.name}!`);
}

function monitorActiveTrade() {
    console.log(`\n--------------------------------------------------`);
    console.log(`📊 [GERINDO POSIÇÃO]: ${activeSnipeTrade.name}`);

    // Simulação da volatilidade do meme token
    const variacaoPreco = (Math.random() * 55 - 20); 
    activeSnipeTrade.currentValueSol *= (1 + variacaoPreco / 100);

    const pnlPct = ((activeSnipeTrade.currentValueSol - activeSnipeTrade.investedSol) / activeSnipeTrade.investedSol) * 100;
    console.log(`   - PnL Atual: ${pnlPct.toFixed(2)}% (Valor: ${activeSnipeTrade.currentValueSol.toFixed(4)} SOL)`);

    if (pnlPct >= SNIPER_CONFIG.autoTakeProfitPct) {
        console.log(`🎉 [TAKE PROFIT ATINGIDO!] Vendendo ${activeSnipeTrade.name} com lucro de +${pnlPct.toFixed(2)}%!`);
        
        salvarTradeNoHistorico({
            name: activeSnipeTrade.name,
            mint: activeSnipeTrade.mint,
            entryTime: activeSnipeTrade.entryTime,
            exitTime: new Date().toISOString(),
            investedSol: activeSnipeTrade.investedSol,
            finalValueSol: activeSnipeTrade.currentValueSol,
            pnlPct: Number(pnlPct.toFixed(2)),
            result: "TAKE_PROFIT"
        });

        activeSnipeTrade = null;
    } else if (pnlPct <= SNIPER_CONFIG.autoStopLossPct) {
        console.log(`🛑 [STOP LOSS ATINGIDO!] Cortando perdas em ${activeSnipeTrade.name} (${pnlPct.toFixed(2)}%).`);
        
        salvarTradeNoHistorico({
            name: activeSnipeTrade.name,
            mint: activeSnipeTrade.mint,
            entryTime: activeSnipeTrade.entryTime,
            exitTime: new Date().toISOString(),
            investedSol: activeSnipeTrade.investedSol,
            finalValueSol: activeSnipeTrade.currentValueSol,
            pnlPct: Number(pnlPct.toFixed(2)),
            result: "STOP_LOSS"
        });

        activeSnipeTrade = null;
    } else {
        console.log(`⏳ Posição mantida. A acompanhar o próximo bloco...`);
    }
}

// Executa o motor a cada 4 segundos
setInterval(runAutoSniperEngine, 4000);
runAutoSniperEngine();
