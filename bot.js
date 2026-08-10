require('dotenv').config();
const { Connection, Keypair, LAMPORTS_PER_SOL } = require('@solana/web3.js');

// Configuração da Rede (RPC)
const connection = new Connection(process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com', 'confirmed');

// Parâmetros de Configuração do Sniper
const CONFIG = {
    amountToSnipe: 0.05,        // Quantidade de SOL a investir por snipe
    minLiquiditySol: 10,        // Mínimo de SOL de liquidez no pool para entrar
    maxBuyTax: 0,               // Rejeitar se houver taxa de compra
    autoSellProfitPct: 50,      // Take Profit em +50%
    autoSellLossPct: -25        // Stop Loss em -25%
};

let activeSnipePosition = null;

// Simulador de Evento de Detecção de Novo Meme Token (Estilo WebSocket / gRPC New Pool)
function simulateMemeTokenLaunchListener() {
    console.log("\n==============================================");
    console.log(`[AUTO-SNIPER] À escuta de novos Meme Tokens (Mempool/DEX)...`);
    console.log("==============================================");

    // Simula a chegada de um novo token recém-criado na blockchain
    const mockNewTokenEvents = [
        { name: "PUMP_COIN", mint: "TokenMintMock111111111111111111111111111", initialLiquiditySol: 25, isLpBurned: true, creatorVerified: true },
        { name: "MOON_DOG", mint: "TokenMintMock222222222222222222222222222", initialLiquiditySol: 5, isLpBurned: false, creatorVerified: false }, // Vai falhar no filtro
        { name: "AI_MEME", mint: "TokenMintMock333333333333333333333333333", initialLiquiditySol: 40, isLpBurned: true, creatorVerified: true }
    ];

    // Pega aleatoriamente um evento simulado de lançamento recente
    const detectedToken = mockNewTokenEvents[Math.floor(Math.random() * mockNewTokenEvents.length)];

    console.log(`🚀 [NOVO TOKEN DETETADO]: ${detectedToken.name} (${detectedToken.mint.slice(0, 6)}...)`);
    console.log(`- Liquidez Inicial: ${detectedToken.initialLiquiditySol} SOL`);
    console.log(`- LP Queimado: ${detectedToken.isLpBurned ? '✅ Sim' : '❌ Não'}`);

    // --- FILTROS DE SEGURANÇA (Anti-Rug / Estilo GMGN) ---
    if (detectedToken.initialLiquiditySol < CONFIG.minLiquiditySol) {
        console.log(`🛡️ [REJEITADO] Liquidez abaixo do limite mínimo (${CONFIG.minLiquiditySol} SOL).`);
        return;
    }

    if (!detectedToken.isLpBurned) {
        console.log(`🛡️ [REJEITADO] Alerta de risco: LP não queimado (Possível Rug Pull).`);
        return;
    }

    console.log(`✨ [APROVADO] ${detectedToken.name} passou em todos os filtros de segurança!`);

    // --- EXECUÇÃO DO SNIPE (Automático) ---
    if (!activeSnipePosition) {
        activeSnipePosition = {
            name: detectedToken.name,
            mint: detectedToken.mint,
            investedSol: CONFIG.amountToSnipe,
            currentValueSol: CONFIG.amountToSnipe,
            entryTime: new Date()
        };
        console.log(`🎯 [SNIPED!] Compra automática de ${CONFIG.amountToSnipe} SOL executada com sucesso em ${detectedToken.name}!`);
    } else {
        console.log(`⏳ Já existe uma posição ativa em ${activeSnipePosition.name}. Ignorando novo lançamento.`);
    }
}

// Monitoramento contínuo da posição ativa (Simulação de PnL em tempo real para o Meme Token snipado)
function monitorActiveSnipe() {
    if (!activeSnipePosition) return;

    console.log(`\n----------------------------------------`);
    console.log(`📊 [GERINDO POSIÇÃO SNIPADA]: ${activeSnipePosition.name}`);

    // Simula a volatilidade agressiva do preço do meme token após o snipe
    const priceFluctuationPct = (Math.random() * 60 - 25); // Oscilação entre -25% e +35% num ciclo
    activeSnipePosition.currentValueSol *= (1 + priceFluctuationPct / 100);

    const pnlPct = ((activeSnipePosition.currentValueSol - CONFIG.amountToSnipe) / CONFIG.amountToSnipe) * 100;
    console.log(`- PnL Atual: ${pnlPct.toFixed(2)}% (Valor: ${activeSnipePosition.currentValueSol.toFixed(4)} SOL)`);

    // Verificação de Saída Automática (Take Profit / Stop Loss)
    if (pnlPct >= CONFIG.autoSellProfitPct) {
        console.log(`🎉 [TAKE PROFIT ATINGIDO!] Vendendo ${activeSnipePosition.name} com lucro de +${pnlPct.toFixed(2)}%!`);
        activeSnipePosition = null;
    } else if (pnlPct <= CONFIG.autoSellLossPct) {
        console.log(`🛑 [STOP LOSS ATINGIDO!] Cortando perdas em ${activeSnipePosition.name} (${pnlPct.toFixed(2)}%).`);
        activeSnipePosition = null;
    } else {
        console.log(`⏳ Posição mantida. Monitorando blocos...`);
    }
}

// Executa o verificador de novos lançamentos a cada 8 segundos
setInterval(simulateMemeTokenLaunchListener, 8000);
// Monitora o PnL da posição a cada 3 segundos
setInterval(monitorActiveSnipe, 3000);

simulateMemeTokenLaunchListener();
