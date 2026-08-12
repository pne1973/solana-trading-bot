require('dotenv').config();
const fs = require('fs');
const http = http = require('http');
const https = require('https');
const { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, VersionedTransaction } = require('@solana/web3.js');

const SNIPER_CONFIG = {
    LIVE_TRADING_ENABLED: true,  
    amountToInvestSol: 0.001,
    maxAllowedSlippageBps: 500,
    autoTakeProfitPct: 50,
    autoStopLossPct: -25,
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

function salvarTradeNoHistorico(tradeData) {
    let history = botStats.history;
    history.push(tradeData);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    carregarHistorico();
}

// Função para executar Swap Real via Jupiter API v6
async function executarSwapJupiter(outputMint, isBuy = true) {
    if (!walletKeypair) return null;
    try {
        const inputMint = isBuy ? "So11111111111111111111111111111111111111112" : outputMint;
        const targetMint = isBuy ? outputMint : "So11111111111111111111111111111111111111112";
        const amount = isBuy ? Math.floor(SNIPER_CONFIG.amountToInvestSol * LAMPORTS_PER_SOL) : 1000000; // Ajustar conforme quantidade de tokens

        // 1. Obter Cotação da Jupiter
        const quoteRes = await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${targetMint}&amount=${amount}&slippageBps=${SNIPER_CONFIG.maxAllowedSlippageBps}`);
        const quoteData = await quoteRes.json();
        
        if (!quoteData || quoteData.error) {
            console.error("❌ Erro na cotação Jupiter:", quoteData.error || "Sem rota");
            return null;
        }

        // 2. Obter Transação de Swap da Jupiter
        const swapRes = await fetch('https://quote-api.jup.ag/v6/swap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                quoteResponse: quoteData,
                userPublicKey: walletKeypair.publicKey.toBase58(),
                wrapAndUnwrapSol: true
            })
        });
        const swapData = await swapRes.json();

        if (!swapData.swapTransaction) {
            console.error("❌ Falha ao obter transação de swap da Jupiter.");
            return null;
        }

        // 3. Assinar e Enviar Transação
        const swapTransactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
        const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
        transaction.sign([walletKeypair]);

        const txid = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false, maxRetries: 3 });
        console.log(`✅ Transação enviada com sucesso! TXID: https://solscan.io/tx/${txid}`);
        return txid;
    } catch (err) {
        console.error("❌ Erro crítico ao executar swap:", err.message);
        return null;
    }
}

// Servidor Web para Monitorização em Tempo Real
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
    <div class="bg-slate-900 p-4 rounded">
        <p>Saldo: <span id="bal" class="text-cyan-400">0 SOL</span></p>
        <p>Lucro: <span id="prof" class="text-emerald-400">0 SOL</span></p>
    </div>
    <script>
        async function update() {
            const res = await fetch('/api/stats');
            const data = await res.json();
            document.getElementById('bal').innerText = data.realWalletBalanceSol + ' SOL';
            document.getElementById('prof').innerText = data.netProfitSol + ' SOL';
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
    const data = JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [PUMP_FUN_PROGRAM_ID, { limit: 1 }]
    });

    const req = https.request({
        hostname: new URL(SNIPER_CONFIG.rpcEndpoint).hostname,
        path: new URL(SNIPER_CONFIG.rpcEndpoint).pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', async () => {
            try {
                const response = JSON.parse(body);
                if (response.result && response.result.length > 0) {
                    botStats.totalScanned++;
                    const tokenMintReal = "So11111111111111111111111111111111111111112"; // Substituir pelo mint detetado

                    if (!activeSnipeTrade && botStats.realWalletBalanceSol >= SNIPER_CONFIG.amountToInvestSol) {
                        if (SNIPER_CONFIG.LIVE_TRADING_ENABLED) {
                            console.log(`🚀 [COMPRA REAL] A iniciar swap via Jupiter API...`);
                            await executarSwapJupiter(tokenMintReal, true);
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
            } catch (e) {}
        });
    });
    req.write(data);
    req.end();
}

setInterval(atualizarSaldoReal, 10000);
setInterval(monitorizarMercadoReal, 10000);
carregarHistorico();
atualizarSaldoReal();
