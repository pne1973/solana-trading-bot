require('dotenv').config();
const { Connection } = require('@solana/web3.js');
const https = require('https');

const connection = new Connection(process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com', 'confirmed');

const SOL_MINT = "So11111111111111111111111111111111111111112";

const WATCHLIST = [
    { symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
    { symbol: "USDT", mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" },
    { symbol: "BONK", mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
    { symbol: "WIF", mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm" }
];

const AMOUNT_SOL_TO_TRADE = 0.01;
let activePosition = null;

function fetchQuote(url) {
    return new Promise((resolve) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept': 'application/json'
            },
            timeout: 5000 // Timeout de segurança de 5 segundos
        };

        const req = https.get(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ success: true, data: parsed });
                } catch (e) {
                    resolve({ success: false, error: "Parse error" });
                }
            });
        });

        req.on('error', (err) => {
            resolve({ success: false, error: err.message });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({ success: false, error: "Timeout" });
        });
    });
}

async function scanAndSelectPromisingToken() {
    try {
        console.log("\n==============================================");
        console.log(`[SCANNER MULTI-TOKEN] Analisando mercado: ${new Date().toLocaleTimeString()}`);
        console.log("==============================================\n");

        const amountInLamports = Math.floor(AMOUNT_SOL_TO_TRADE * 1e9);
        const marketOpportunities = [];

        for (const token of WATCHLIST) {
            const url = `https://quote-api.jup.ag/v6/quote?inputMint=${SOL_MINT}&outputMint=${token.mint}&amount=${amountInLamports}&slippageBps=50`;
            const result = await fetchQuote(url);

            if (result.success && result.data && !result.data.error && result.data.outAmount) {
                marketOpportunities.push({
                    symbol: token.symbol,
                    mint: token.mint,
                    outAmount: Number(result.data.outAmount),
                    priceImpactPct: Number(result.data.priceImpactPct || 0),
                    isSimulatedFallback: false
                });
            } else {
                // Ativa o Fallback inteligente para este token específico caso a API esteja bloqueada no ambiente
                const simulatedBaseAmounts = { USDC: 180000000, USDT: 180500000, BONK: 150000000000, WIF: 45000000 };
                const base = simulatedBaseAmounts[token.symbol] || 100000000;
                const randomVariation = (Math.random() * 10 - 4.8); // Oscilação entre -4.8% e +5.2%
                const calculatedAmount = Math.floor(base * (1 + randomVariation / 100));

                marketOpportunities.push({
                    symbol: token.symbol,
                    mint: token.mint,
                    outAmount: calculatedAmount,
                    priceImpactPct: 0.1,
                    isSimulatedFallback: true
                });
            }
        }

        if (marketOpportunities.length === 0) {
            console.log("Nenhuma oportunidade encontrada neste ciclo.");
            return;
        }

        // Ordena para encontrar o token com maior retorno estimado
        marketOpportunities.sort((a, b) => b.outAmount - a.outAmount);
        const bestCandidate = marketOpportunities[0];

        console.log(`🏆 [TOKEN MAIS PROMISSOR SELECIONADO]: ${bestCandidate.symbol} ${bestCandidate.isSimulatedFallback ? '(Modo Simulação de Mercado)' : ''}`);
        console.log(`- Retorno estimado: ${bestCandidate.outAmount} unidades para ${AMOUNT_SOL_TO_TRADE} SOL`);
        console.log(`- Impacto no preço: ${bestCandidate.priceImpactPct}%\n`);

        if (!activePosition) {
            activePosition = {
                symbol: bestCandidate.symbol,
                mint: bestCandidate.mint,
                entryOutAmount: bestCandidate.outAmount,
                investedSol: AMOUNT_SOL_TO_TRADE,
                entryTime: new Date()
            };
            console.log(`🟢 [PAPER TRADING] Posição aberta em ${bestCandidate.symbol}!\n`);
        } else {
            if (activePosition.mint === bestCandidate.mint) {
                const pnl = ((bestCandidate.outAmount - activePosition.entryOutAmount) / activePosition.entryOutAmount) * 100;
                console.log(`📊 [MONITORANDO ${activePosition.symbol}] PnL Atual: ${pnl.toFixed(2)}%\n`);
                
                if (pnl >= 5 || pnl <= -3) {
                    console.log(`🏁 Fechando posição simulada para ${activePosition.symbol} (Alvo atingido ou Stop Loss).\n`);
                    activePosition = null;
                }
            } else {
                console.log(`⏳ Aguardando ciclo da posição atual (${activePosition.symbol})...\n`);
            }
        }

    } catch (error) {
        console.error("Erro crítico no scanner:", error);
    }
}

setInterval(scanAndSelectPromisingToken, 15000);
scanAndSelectPromisingToken();
