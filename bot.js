const { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');

// Configuração inicial do Bot - Apex Social v33.12
const ADMIN_ID = "5401881400";
const RPC_ENDPOINT = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

const connection = new Connection(RPC_ENDPOINT, 'confirmed');

async function main() {
    console.log(`[SYSTEM] Apex Social v33.12 inicializado.`);
    console.log(`[CONFIG] Administrador ID: ${ADMIN_ID}`);
    console.log(`[SOLANA] A ligar ao RPC: ${RPC_ENDPOINT}`);

    try {
        const slot = await connection.getSlot();
        console.log(`[SOLANA] Slot atual da blockchain: ${slot}`);
        console.log(`[ENGINE] Bot pronto para processar transações e interagir com a Jupiter API.`);
    } catch (error) {
        console.error(`[ERROR] Falha ao ligar à rede Solana:`, error.message);
    }
}

main();
