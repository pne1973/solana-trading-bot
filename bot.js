require('dotenv').config();
const fs = require('fs');
const http = require('http');
const axios = require('axios');
const dns = require('dns');
const { Connection, Keypair, LAMPORTS_PER_SOL, VersionedTransaction } = require('@solana/web3.js');

// Forçar o uso de servidores DNS públicos para evitar falhas de resolução no Codespace
try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
    // Ignorar se não suportado
}

const SNIPER_CONFIG = {
    LIVE_TRADING_ENABLED: true,  
    amountToInvestSol: 0.001,
    maxAllowedSlippageBps: 500,
    rpcEndpoint: process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com'
};

const connection = new Connection(SNIPER_CONFIG.rpcEndpoint, 'confirmed');

const secretKey = Uint8Array.from(JSON.parse(process.env.WALLET_PRIVATE_KEY));
const walletKeypair = Keypair.fromSecretKey(secretKey);
console.log(`🔐 Carteira carregada: ${walletKeypair.publicKey.toBase58()}`);

async function executarSwapJupiter(outputMint, isBuy = true) {
    try {
        const inputMint = isBuy ? "So11111111111111111111111111111111111111112" : outputMint;
        const targetMint = isBuy ? outputMint : "So11111111111111111111111111111111111111112";
        const amount = Math.floor(SNIPER_CONFIG.amountToInvestSol * LAMPORTS_PER_SOL);

        console.log("🔍 A obter cotação da Jupiter...");
        const quoteRes = await axios.get(`https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${targetMint}&amount=${amount}&slippageBps=${SNIPER_CONFIG.maxAllowedSlippageBps}`, { timeout: 7000 });
        
        console.log("🔄 A criar transação de swap...");
        const swapRes = await axios.post('https://quote-api.jup.ag/v6/swap', {
            quoteResponse: quoteRes.data,
            userPublicKey: walletKeypair.publicKey.toBase58(),
            wrapAndUnwrapSol: true
        }, { timeout: 7000 });

        const transaction = VersionedTransaction.deserialize(Buffer.from(swapRes.data.swapTransaction, 'base64'));
        transaction.sign([walletKeypair]);

        const txid = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false });
        console.log(`✅ Sucesso! TXID: https://solscan.io/tx/${txid}`);
    } catch (err) {
        console.error("❌ Erro no Swap:", err.response ? err.response.data : err.message);
    }
}

http.createServer((req, res) => res.end("Bot Online")).listen(3000, '0.0.0.0', () => {
    console.log("🌐 Servidor web ativo na porta 3000");
});

setTimeout(() => {
    console.log("🚀 [COMPRA REAL] A iniciar swap via Jupiter API...");
    executarSwapJupiter("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", true);
}, 3000);
