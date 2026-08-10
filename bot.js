require('dotenv').config();
const { Connection } = require('@solana/web3.js');

// Conexão com a Solana para leitura de dados reais de mercado
const connection = new Connection(process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com', 'confirmed');

const SOL_MINT = "So11111111111111111111111111111111111111112";
const TOKEN_TARGET_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // Ex: USDC

// Configurações do Paper Trading (Simulação)
let activePosition = null; 
const AMOUNT_SOL_TO_TRADE = 0.01; // Simulação de 0.01 SOL
const TAKE_PROFIT_PERCENT = 5;    // Alvo de lucro simulado (+5%)
const STOP_LOSS_PERCENT = -3;     // Limite de perda simulado (-3%)

async function runPaperTradingSimulation() {
    try {
        console.log("\n==============================================");
        console.log(`[SIMULAÇÃO] Consultando dados de mercado: ${new Date().toLocaleTimeString()}`);
        console.log("==============================================");

        const amountInLamports = Math.floor(AMOUNT_SOL_TO_TRADE * 1e9);

        // Busca cotação real na Jupiter API v6
        const response = await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${SOL_MINT}&outputMint=${TOKEN_TARGET_MINT}&amount=${amountInLamports}&slippageBps=50`);
        const quoteResponse = await response.json();

        if (!quoteResponse || quoteResponse.error) {
            console.error("Erro ao obter cotação da API:", quoteResponse);
            return;
        }

        const currentOutAmount = Number(quoteResponse.outAmount);

        // Cenário 1: Abrir posição simulada se não houver nenhuma ativa
        if (!activePosition) {
            activePosition = {
                entryOutAmount: currentOutAmount,
                investedSol: AMOUNT_SOL_TO_TRADE,
                entryTime: new Date()
            };
            console.log(`🟢 [COMPRA SIMULADA EXECUTADA]`);
            console.log(`- Capital fictício investido: ${AMOUNT_SOL_TO_TRADE} SOL`);
            console.log(`- Tokens recebidos (estimados): ${currentOutAmount}`);
            console.log(`- Horário de entrada: ${activePosition.entryTime.toLocaleTimeString()}`);
            return;
        }

        // Cenário 2: Monitorar posição aberta e calcular PnL (Lucro/Prejuízo)
        const pnlPercentage = ((currentOutAmount - activePosition.entryOutAmount) / activePosition.entryOutAmount) * 100;

        console.log(`📊 [MONITORANDO POSIÇÃO ATIVA]`);
        console.log(`- Variação de preço atual: ${pnlPercentage.toFixed(2)}%`);

        // Verificar gatilhos de saída simulados
        if (pnlPercentage >= TAKE_PROFIT_PERCENT) {
            console.log(`🎯 [TAKE PROFIT ATINGIDO NA SIMULAÇÃO!]`);
            console.log(`- Alvo de +${TAKE_PROFIT_PERCENT}% alcançado. Lucro simulado garantido.`);
            activePosition = null; // Fecha a posição
        } else if (pnlPercentage <= STOP_LOSS_PERCENT) {
            console.log(`🛑 [STOP LOSS ATINGIDO NA SIMULAÇÃO!]`);
            console.log(`- Limite de ${STOP_LOSS_PERCENT}% atingido. Fechando posição para conter perdas.`);
            activePosition = null; // Fecha a posição
        } else {
            console.log(`⏳ Posição mantida. Aguardando oscilação do mercado...`);
        }

    } catch (error) {
        console.error("Erro durante o ciclo de simulação:", error);
    }
}

// Roda a simulação a cada 15 segundos
setInterval(runPaperTradingSimulation, 15000);

// Executa o primeiro ciclo imediatamente
runPaperTradingSimulation();
