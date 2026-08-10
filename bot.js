require('dotenv').config();
const { Connection } = require('@solana/web3.js');
const https = require('https');

const connection = new Connection(process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com', 'confirmed');

const SOL_MINT = "So11111111111111111111111111111111111111112";

const WATCHLIST = [
    { symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
    { symbol: "USDT", mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" },
];

const AMOUNT_SOL_TO_TRADE = 0.01;
let activePosition = null;

function getJSON(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept': 'application/json'
            }
        };

        https.get(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error("Erro ao fazer parse do JSON: " + data));
                }
            });
        }).on('error', (err) => reject(err));
    });
}

async function scanAndSelectPromisingToken() {
    try {
        console.log("\n==============================================");
        console.log(`[SCANNER MULTI-TOKEN] Analisando mercado: ${new Date().toLocaleTimeString()}`);
        console.log("==============================================");

        const amountInLamports = Math.floor(AMOUNT_SOL_TO_TRADE * 1e9);
        const marketOpportunities = [];

        for (const token of WATCHLIST) {
            try {
                const url = `https://quote-api.jup.ag/v6/quote?inputMint=${SOL_MINT}&outputMint=${token.mint}&amount=${amountInLamports}&slippageBps=50`;
                const quote = await getJSON(url);

                if (quote && !quote.error && quote.outAmount) {
                    marketOpportunities.push({
                        symbol: token.symbol,
                        mint: token.mint,
                        outAmount: Number(quote.outAmount),
                        priceImpactPct: Number(quote.priceImpactPct || 0),
                        routes: quote.routePlan.length
                    });
                } else {
                    console.log(`Aviso para o token ${token.symbol}:`, quote.error || "Resposta inválida");
                }
            } catch (err) {
                console.error(`Erro de conexão ao consultar o token ${token.symbol}:`, err.message);
            }
        }

        if (marketOpportunities.length === 0) {
            console.log("Nenhuma oportunidade encontrada neste ciclo.");
            return;
        }

        marketOpportunities.sort((a, b) => b.outAmount - a.outAmount);
        const bestCandidate = marketOpportunities[0];

        console.log(`🏆 [TOKEN MAIS PROMISSOR SELECIONADO]: ${bestCandidate.symbol}`);
        console.log(`- Retorno estimado: ${bestCandidate.outAmount} unidades para ${AMOUNT_SOL_TO_TRADE} SOL`);
        console.log(`- Impacto no preço: ${bestCandidate.priceImpactPct}%`);

        if (!activePosition) {
            activePosition = {
                symbol: bestCandidate.symbol,
                mint: bestCandidate.mint,
                entryOutAmount: bestCandidate.outAmount,
                investedSol: AMOUNT_SOL_TO_TRADE,
                entryTime: new Date()
            };
            console.log(`🟢 [PAPER TRADING] Posição aberta em ${bestCandidate.symbol}!`);
        } else {
            if (activePosition.mint === bestCandidate.mint) {
                const pnl = ((bestCandidate.outAmount - activePosition.entryOutAmount) / activePosition.entryOutAmount) * 100;
                console.log(`📊 [MONITORANDO ${activePosition.symbol}] PnL Atual: ${pnl.toFixed(2)}%`);
                
                if (pnl >= 10 || pnl <= -5) {
                    console.log(`🏁 Fechando posição simulada para ${activePosition.symbol} (Alvo atingido ou Stop Loss).`);
                    activePosition = null;
                }
            } else {
                console.log(`⏳ Aguardando ciclo da posição atual (${activePosition.symbol})...`);
            }
        }

    } catch (error) {
        console.error("Erro no scanner multi-token:", error);
    }
}

setInterval(scanAndSelectPromisingToken, 20000);
scanAndSelectPromisingToken();
