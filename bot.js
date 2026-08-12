require('dotenv').config();
const fs = require('fs');
const http = require('http');
const https = require('https');
const axios = require('axios');
const dns = require('dns');
const { Connection, Keypair, LAMPORTS_PER_SOL, VersionedTransaction } = require('@solana/web3.js');

try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

const SNIPER_CONFIG = {
    LIVE_TRADING_ENABLED: true,  
    amountToInvestSol: 0.001,
    maxAllowedSlippageBps: 500,
    rpcEndpoint: process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com'
};

const connection = new Connection(SNIPER_CONFIG.rpcEndpoint, 'confirmed');

let walletKeypair = null;
try {
    if (process.env.WALLET_PRIVATE_KEY) {
        const secretKey = Uint8Array.from(JSON.parse(process.env.WALLET_PRIVATE_KEY));
        walletKeypair = Keypair.fromSecretKey(secretKey);
        console.log(`🔐 Carteira carregada com sucesso: ${walletKeypair.publicKey.toBase58()}`);
    } else {
        console.warn("⚠️ AVISO: WALLET_PRIVATE_KEY não encontrada no .env.");
    }
} catch (e) {
    console.error("❌ Erro ao carregar a chave privada:", e.message);
}

let activeSnipeTrade = null;
const HISTORY_FILE = 'trades_history_real.json';

let botStats = {
    mode: SNIPER_CONFIG.LIVE_TRADING_ENABLED ? "LIVE TRADING REAL (Produção)" : "Modo Seguro",
    walletPublicKey: walletKeypair ? walletKeypair.publicKey.toBase58() : "Não configurada",
    totalScanned: 0,
    approvedTokens: 0,
    realWalletBalanceSol: 0,
    netProfitSol: 0,
    totalTrades: 0,
    wins: 0,
    losses: 0,
    activeTrade: null,
    history: []
};

async function atualizarSaldoReal() {
    if (!walletKeypair) return;
    try {
        const balanceLamports = await connection.getBalance(walletKeypair.publicKey);
        botStats.realWalletBalanceSol = Number((balanceLamports / LAMPORTS_PER_SOL).toFixed(6));
    } catch (err) {
        console.error("Erro ao consultar saldo RPC:", err.message);
    }
}

function carregarHistorico() {
    if (fs.existsSync(HISTORY_FILE)) {
        try {
            const data = fs.readFileSync(HISTORY_FILE, 'utf8');
            botStats.history = JSON.parse(data);
            botStats.totalTrades = botStats.history.length;
            botStats.wins = botStats.history.filter(t => t.result === 'TAKE_PROFIT').length;
            botStats.losses = botStats.history.filter(t => t.result === 'STOP_LOSS').length;
            const bruto = botStats.history.reduce((acc, t) => acc + (t.finalValueSol - t.investedSol), 0);
            botStats.netProfitSol = Number(bruto.toFixed(6));
        } catch (e) {
            botStats.history = [];
        }
    }
}

async function executarSwapJupiter(outputMint, isBuy = true) {
    if (!walletKeypair) return null;
    try {
        const inputMint = isBuy ? "So11111111111111111111111111111111111111112" : outputMint;
        const targetMint = isBuy ? outputMint : "So11111111111111111111111111111111111111112";
        const amount = Math.floor(SNIPER_CONFIG.amountToInvestSol * LAMPORTS_PER_SOL);

        console.log("🔍 A obter cotação da Jupiter...");
        
        // Resolver IP estático via DNS lookup direto para evitar ENOTFOUND no Codespace
        const ipAddress = await new Promise((resolve) => {
            dns.lookup('quote-api.jup.ag', (err, address) => {
                resolve(err ? null : address);
            });
        });

        const hostUrl = ipAddress ? `https://${ipAddress}` : 'https://quote-api.jup.ag';

        const quoteRes = await axios.get(`${hostUrl}/v6/quote?inputMint=${inputMint}&outputMint=${targetMint}&amount=${amount}&slippageBps=${SNIPER_CONFIG.maxAllowedSlippageBps}`, { 
            timeout: 10000,
            headers: { 'Host': 'quote-api.jup.ag', 'User-Agent': 'Mozilla/5.0' },
            httpsAgent: new https.Agent({ rejectUnauthorized: false })
        });
        
        console.log("🔄 A criar transação de swap...");
        const swapRes = await axios.post(`${hostUrl}/v6/swap`, {
            quoteResponse: quoteRes.data,
            userPublicKey: walletKeypair.publicKey.toBase58(),
            wrapAndUnwrapSol: true
        }, { 
            timeout: 10000,
            headers: { 'Host': 'quote-api.jup.ag', 'User-Agent': 'Mozilla/5.0' },
            httpsAgent: new https.Agent({ rejectUnauthorized: false })
        });

        const transaction = VersionedTransaction.deserialize(Buffer.from(swapRes.data.swapTransaction, 'base64'));
        transaction.sign([walletKeypair]);

        const txid = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false });
        console.log(`✅ Sucesso! TXID: https://solscan.io/tx/${txid}`);
        return txid;
    } catch (err) {
        console.error("❌ Erro no Swap:", err.response ? err.response.data : err.message);
        return null;
    }
}

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.url === '/api/stats') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ...botStats, config: SNIPER_CONFIG }));
    } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <title>Solana Real Sniper - Produção</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-100 font-sans p-6">
    <h1 class="text-xl font-bold mb-4">Solana Real Sniper v33.12 (Jupiter Integration)</h1>
    <div class="bg-slate-900 p-4 rounded shadow">
        <p>Saldo da Carteira: <span id="bal" class="text-cyan-400 font-bold">0 SOL</span></p>
        <p>Lucro Líquido: <span id="prof" class="text-emerald-400 font-bold">0 SOL</span></p>
        <p>Modo: <span class="text-yellow-400">LIVE TRADING REAL</span></p>
    </div>
    <script>
        async function update() {
            try {
                const res = await fetch('/api/stats');
                const data = await res.json();
                document.getElementById('bal').innerText = data.realWalletBalanceSol + ' SOL';
                document.getElementById('prof').innerText = data.netProfitSol + ' SOL';
            } catch(e) {}
        }
        setInterval(update, 2000);
        update();
    </script>
</body>
</html>`);
    }
});

server.listen(3000, '0.0.0.0', () => {
    console.log("🌐 Painel de Produção ativo em: http://0.0.0.0:3000");
});

function monitorizarMercadoReal() {
    const PUMP_FUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
    const dataPost = {
        jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [PUMP_FUN_PROGRAM_ID, { limit: 1 }]
    };

    axios.post(SNIPER_CONFIG.rpcEndpoint, dataPost).then(response => {
        if (response.data && response.data.result && response.data.result.length > 0) {
            botStats.totalScanned++;
            const tokenMintReal = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

            if (!activeSnipeTrade && botStats.realWalletBalanceSol >= SNIPER_CONFIG.amountToInvestSol) {
                if (SNIPER_CONFIG.LIVE_TRADING_ENABLED) {
                    console.log(`🚀 [COMPRA REAL] A iniciar swap via Jupiter API...`);
                    executarSwapJupiter(tokenMintReal, true);
                }

                activeSnipeTrade = {
                    mint: tokenMintReal,
                    investedSol: SNIPER_CONFIG.amountToInvestSol,
                    currentValueSol: SNIPER_CONFIG.amountToInvestSol,
                    pnlPct: 0,
                    entryTime: new Date().toLocaleTimeString()
                };
                botStats.activeTrade = activeSnipeTrade;
            }
        }
    }).catch(() => {});
}

setInterval(atualizarSaldoReal, 10000);
setInterval(monitorizarMercadoReal, 10000);
carregarHistorico();
atualizarSaldoReal();
