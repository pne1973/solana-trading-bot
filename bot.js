// --- BOT DE SIMULAÇÃO LOCAL (SANDBOX) ---
const WATCHLIST = [
    { symbol: "USDC", basePrice: 180000000 },
    { symbol: "USDT", basePrice: 180500000 },
    { symbol: "BONK", basePrice: 150000000000 },
    { symbol: "WIF", basePrice: 45000000 }
];

let activePosition = null;

function executarCiclo() {
    console.log("\n----------------------------------------");
    console.log(`[EXECUÇÃO LOCAL] Hora: ${new Date().toLocaleTimeString()}`);require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');
const https = require('https');

// Conexão oficial com a blockchain Solana
const connection = new Connection(process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com', 'confirmed');

const SOL_MINT = "So11111111111111111111111111111111111111112";

// Watchlist de tokens reais na Solana (Mint Addresses)
const WATCHLIST = [
    { symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
    { symbol: "USDT", mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" },
    { symbol: "BONK", mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
    { symbol: "WIF", mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm" }
];

const AMOUNT_SOL_TO_TRADE = 0.01;
let activePosition = null;

// Função robusta de requisição HTTP com tratamento de erro isolado
function fetchJupiterQuote(url) {
    return new Promise((resolve) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept': 'application/json'
            },
            timeout: 6000
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

        req.on('error', (err) => resolve({ success: false, error: err.message }));
        req.on('timeout', () => { req.destroy(); resolve({ success: false, error: "Timeout" }); });
    });
}

async function scanAndSelectRealToken() {
    console.log("\n==============================================");
    console.log(`[SCANNER REAL] Consultando mercado Solana: ${new Date().toLocaleTimeString()}`);
    console.log("==============================================");

    const amountInLamports = Math.floor(AMOUNT_SOL_TO_TRADE * 1e9);
    const marketOpportunities = [];
    let successCount = 0;

    for (const token of WATCHLIST) {
        const url = `https://quote-api.jup.ag/v6/quote?inputMint=${SOL_MINT}&outputMint=${token.mint}&amount=${amountInLamports}&slippageBps=50`;
        const result = await fetchJupiterQuote(url);

        if (result.success && result.data && !result.data.error && result.data.outAmount) {
            successCount++;
            marketOpportunities.push({
                symbol: token.symbol,
                mint: token.mint,
                outAmount: Number(result.data.outAmount),
                priceImpactPct: Number(result.data.priceImpactPct || 0),
                isReal: true
            });
        } else {
            // Fallback temporário apenas para o token que falhar caso o firewall bloqueie intermitentemente
            const basePrices = { USDC: 180000000, USDT: 180500000, BONK: 150000000000, WIF: 45000000 };
            const base = basePrices[token.symbol] || 100000000;
            const varSimulada = (Math.random() * 4 - 2);
            
            marketOpportunities.push({
                symbol: token.symbol,
                mint: token.mint,
                outAmount: Math.floor(base * (1 + varSimulada / 100)),
                priceImpactPct: 0.1,
                isReal: false
            });
        }
    }

    // Seleciona o token mais promissor com base no maior retorno
    marketOpportunities.sort((a, b) => b.outAmount - a.outAmount);
    const bestCandidate = marketOpportunities[0];

    console.log(`🏆 [MAIS PROMISSOR]: ${bestCandidate.symbol} ${bestCandidate.isReal ? '🟢 (Dados Reais da Jupiter)' : '🟡 (Modo Híbrido)'}`);
    console.log(`- Retorno estimado: ${bestCandidate.outAmount.toLocaleString()} unidades para ${AMOUNT_SOL_TO_TRADE} SOL`);
    console.log(`- Impacto no preço: ${bestCandidate.priceImpactPct}%`);

    // Gestão da Posição (Paper Trading)
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

            if (pnl >= 5) {
                console.log(`🎯 [TAKE PROFIT] Alvo atingido em ${activePosition.symbol}. Fechando posição.`);
                activePosition = null;
            } else if (pnl <= -3) {
                console.log(`🛑 [STOP LOSS] Limite de perda atingido em ${activePosition.symbol}. Fechando posição.`);
                activePosition = null;
            } else {
                console.log(`⏳ Posição mantida.`);
            }
        } else {
            console.log(`⏳ Aguardando ciclo da posição ativa (${activePosition.symbol})...`);
        }
    }
}

// Executa a cada 15 segundos
setInterval(scanAndSelectRealToken, 15000);
scanAndSelectRealToken();
    
    // Simula variação de preço para cada token internamente
    const oportunidades = WATCHLIST.map(token => {
        const variacao = (Math.random() * 10 - 4.8); // Entre -4.8% e +5.2%
        const quantidade = Math.floor(token.basePrice * (1 + variacao / 100));
        return { symbol: token.symbol, outAmount: quantidade };
    });

    // Encontra o melhor token do ciclo
    oportunidades.sort((a, b) => b.outAmount - a.outAmount);
    const melhor = oportunidades[0];

    console.log(`> Token selecionado: ${melhor.symbol} (${melhor.outAmount.toLocaleString()} unidades)`);

    if (!activePosition) {
        activePosition = {
            symbol: melhor.symbol,
            entryAmount: melhor.outAmount
        };
        console.log(`> [COMPRA] Posição aberta em ${melhor.symbol}`);
    } else {
        if (activePosition.symbol === melhor.symbol) {
            const pnl = ((melhor.outAmount - activePosition.entryAmount) / activePosition.entryAmount) * 100;
            console.log(`> [MONITOR] PnL atual: ${pnl.toFixed(2)}%`);
            
            if (pnl >= 5 || pnl <= -3) {
                console.log(`> [VENDA] Fechando posição.`);
                activePosition = null;
            }
        } else {
            console.log(`> [AGUARDANDO] Mantendo posição em ${activePosition.symbol}`);
        }
    }
}

// Roda a cada 5 segundos
setInterval(executarCiclo, 5000);
executarCiclo();
