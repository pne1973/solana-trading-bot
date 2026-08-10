require('dotenv').config();
const { Connection } = require('@solana/web3.js');

// Conexão com a Solana (dados reais de mercado)
const connection = new Connection(process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com', 'confirmed');

const SOL_MINT = "So11111111111111111111111111111111111111112";
// Exemplo: USDC ou o token desejado
const TOKEN_TARGET_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; 

async function simulateTrading() {
    try {
        console.log("--- INICIANDO CICLO DE SIMULAÇÃO (PAPER TRADING) ---");
        const amountInLamports = 10000000; // Simulando o uso de 0.01 SOL
        const solAmountDecimal = amountInLamports / 1e9;

        console.log(`Buscando dados reais de preço para ${solAmountDecimal} SOL...`);
        
        const quoteResponse = await (
            await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${SOL_MINT}&outputMint=${TOKEN_TARGET_MINT}&amount=${amountInLamports}&slippageBps=50`)
        ).json();

        if (!quoteResponse || quoteResponse.error) {
            console.error("Erro ao buscar dados de mercado:", quoteResponse);
            return;
        }

        const outAmount = quoteResponse.outAmount;
        console.log("\n[DADOS REAIS OBTIDOS DA REDE]:");
        console.log(`- Você investiria: ${solAmountDecimal} SOL`);
        console.log(`- Receberia aproximadamente: ${outAmount} unidades do token`);
        console.log(`- Rota utilizada: ${quoteResponse.routePlan.length} DEX(s) envolvida(s)`);
        
        // Simulação de acompanhamento de preço / PnL fictício
        console.log("\n[MODO SIMULAÇÃO ATIVO]: Nenhuma ordem real foi enviada para a blockchain.");
        console.log("--------------------------------------------------\n");

    } catch (error) {
        console.error("Erro na simulação:", error);
    }
}

// Executa a simulação a cada 30 segundos para testar com dados reais do mercado
setInterval(simulateTrading, 30000);

// Executa imediatamente na primeira vez
simulateTrading();
