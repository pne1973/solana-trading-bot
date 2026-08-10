require('dotenv').config();

// Watchlist de tokens monitorados
const WATCHLIST = [
    { symbol: "USDC", basePrice: 180000000 },
    { symbol: "USDT", basePrice: 180500000 },
    { symbol: "BONK", basePrice: 150000000000 },
    { symbol: "WIF", basePrice: 45000000 }
];

const AMOUNT_SOL_TO_TRADE = 0.01;
let activePosition = null;

function runAutonomousSimulation() {
    console.log("\n==============================================");
    console.log(`[SANDBOX SIMULATOR] Analisando mercado: ${new Date().toLocaleTimeString()}`);
    console.log("==============================================");

    const marketOpportunities = [];

    // Simula a oscilação de mercado em tempo real para cada token
    for (const token of WATCHLIST) {
        // Gera uma variação orgânica de preço entre -5% e +6%
        const randomVariation = (Math.random() * 11 - 5); 
        const simulatedOutAmount = Math.floor(token.basePrice * (1 + randomVariation / 100));

        marketOpportunities.push({
            symbol: token.symbol,
            outAmount: simulatedOutAmount,
            priceImpactPct: Number((Math.random() * 0.5).toFixed(2))
        });
    }

    // Seleciona o token mais promissor (maior retorno estimado no ciclo)
    marketOpportunities.sort((a, b) => b.outAmount - a.outAmount);
    const bestCandidate = marketOpportunities[0];

    console.log(`🏆 [TOKEN MAIS PROMISSOR SELECIONADO]: ${bestCandidate.symbol}`);
    console.log(`- Retorno estimado: ${bestCandidate.outAmount.toLocaleString()} unidades para ${AMOUNT_SOL_TO_TRADE} SOL`);
    console.log(`- Impacto no preço: ${bestCandidate.priceImpactPct}%`);

    // Gestão da Posição (Paper Trading)
    if (!activePosition) {
        activePosition = {
            symbol: bestCandidate.symbol,
            entryOutAmount: bestCandidate.outAmount,
            investedSol: AMOUNT_SOL_TO_TRADE,
            entryTime: new Date()
        };
        console.log(`🟢 [PAPER TRADING] Posição aberta em ${bestCandidate.symbol}!`);
    } else {
        if (activePosition.symbol === bestCandidate.symbol) {
            const pnl = ((bestCandidate.outAmount - activePosition.entryOutAmount) / activePosition.entryOutAmount) * 100;
            console.log(`📊 [MONITORANDO ${activePosition.symbol}] PnL Atual: ${pnl.toFixed(2)}%`);

            // Regras de Saída (Take Profit: +5% / Stop Loss: -3%)
            if (pnl >= 5) {
                console.log(`🎯 [TAKE PROFIT ATINGIDO!] Lucro simulado garantido em ${activePosition.symbol}. Fechando posição.`);
                activePosition = null;
            } else if (pnl <= -3) {
                console.log(`🛑 [STOP LOSS ATINGIDO!] Limite de perda atingido em ${activePosition.symbol}. Fechando posição.`);
                activePosition = null;
            } else {
                console.log(`⏳ Posição mantida. Aguardando oscilação...`);
            }
        } else {
            console.log(`⏳ Aguardando ciclo da posição ativa atual (${activePosition.symbol})...`);
        }
    }
}

// Executa a cada 10 segundos
setInterval(runAutonomousSimulation, 10000);
runAutonomousSimulation();
