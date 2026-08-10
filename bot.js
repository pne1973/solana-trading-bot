require('dotenv').config();
const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');

// Configuração da conexão com a Solana
const connection = new Connection(process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com', 'confirmed');

const SOL_MINT = "So11111111111111111111111111111111111111112";
// Exemplo: USDC (substitua pelo token desejado)
const TOKEN_TARGET_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; 

async function executeSwap() {
    try {
        console.log("Buscando cotação na Jupiter API...");
        const amountInLamports = 10000000; // 0.01 SOL
        
        const quoteResponse = await (
            await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${SOL_MINT}&outputMint=${TOKEN_TARGET_MINT}&amount=${amountInLamports}&slippageBps=50`);

        if (!quoteResponse || quoteResponse.error) {
            console.error("Erro ao buscar cotação:", quoteResponse);
            return;
        }

        console.log("Cotação obtida com sucesso. Pronto para integrar a carteira e executar o swap.");
    } catch (error) {
        console.error("Erro na execução:", error);
    }
}

executeSwap();
