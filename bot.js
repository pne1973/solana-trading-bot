require('dotenv').config();
const { Connection } = require('@solana/web3.js');

// Conexão com a Solana (dados reais de mercado)
const connection = new Connection(process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com', 'confirmed');

const SOL_MINT = "So11111111111111111111111111111111111111112";
const TOKEN_TARGET_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // Ex: USDC

// Variáveis de controle do Paper Trading
let activePosition = null; 
const AMOUNT_SOL_TO_TRADE = 0.01; // 0.01 SOL por operação simulada
const TAKE_PROFIT_PERCENT = 10;   // Vender se subir 10%
const STOP_LOSS_PERCENT = -5;     // Vender se cair 5%

async function simulateTradingCycle() {
    try {
        console.log("\n--- NOVO CICLO DE MONITORAMENTO (PAPER TRADING) ---");
        const amountInLamports = Math.floor(AMOUNT_SOL_TO_TRADE * 1e9);

        // Busca cotação atual na Jupiter API
        const quoteResponse = await (
            await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${SOL_MINT}&outputMint=${TOKEN_TARGET_MINT}&amount=${amountInLamports}&slippageBps=50`)
        ).json();

        if (!quoteResponse || quoteResponse.error) {
            console.error("Erro ao buscar dados de mercado:", quoteResponse);
            return;
        }

        const currentOutAmount = Number(quoteResponse.outAmount);
        
        // Se não temos uma posição aberta, "compramos" (registramos o preço de entrada)
        if (!activePosition) {
            activePosition = {
                entryAmountTokens: currentOutAmount,
                investedSol: AMOUNT_SOL_TO_TRADE,
                timestamp: new Date()
            };
            console.log(`[COMPRA SIMULADA] Entrou na posição com ${AMOUNT_SOL_TO_TRADE} SOL.`);
            console.log(`- Tokens adquiridos (estimados): ${currentOutAmount}`);
            console.log(`- Horário: ${activePosition.timestamp.toLocaleTimeString()}`);
            return;
        }

        // Se já temos uma posição aberta, calculamos o PnL (Lucro/Prejuízo)
        const pnlPercentage = ((currentOutAmount - activePosition.entryAmountTokens) / activePosition.entryAmountTokens) * 100;
        
        console.log(`[POSIÇÃO ATIVA] Monitorando...`);
        console.log(`- Variação atual: ${pnlPercentage.toFixed(2)}%`);

        // Verifica regras de saída (Take Profit ou Stop Loss)
        if (pnlPercentage >= TAKE_PROFIT_PERCENT) {
            console.log(`🎯 [TAKE PROFIT ATINGIDO!] Lucro de +${pnlPercentage.toFixed(2)}%. Fechando posição simulada.`);
            activePosition = null; // Reseta a posição
        } else if (pnlPercentage <= STOP_LOSS_PERCENT) {
            console.log(`🛑 [STOP LOSS ATINGIDO!] Prejuízo de ${pnlPercentage.toFixed(2)}%. Fechando posição simulada.`);
            activePosition = null; // Reseta a posição
        } else {
            console.log(`⏳ Mantendo posição aberta. Aguardando oscilação de preço...`);
        }

    } catch (error) {
        console.error("Erro no ciclo de simulação:", error);
    }
}

// Executa o ciclo a cada 20 segundos
setInterval(simulateTradingCycle, 20000);

// Executa imediatamente na inicialização
simulateTradingCycle();
