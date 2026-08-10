require('dotenv').config();
const { Connection } = require('@solana/web3.js');

const connection = new Connection(process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com', 'confirmed');

const SOL_MINT = "So11111111111111111111111111111111111111112";

// Lista de tokens que você deseja monitorar (ex: USDC, USDT e outros meme tokens populares)
const WATCHLIST = [
    { symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
    { symbol: "USDT", mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" },
    // Adicione aqui os mints de outros tokens/meme tokens que quer monitorar
];

const AMOUNT_SOL_TO_TRADE = 0.01; // 0.01 SOL para simulação
let activePosition = null;

async function scanAndSelectPromisingToken() {
    try {
        console.log("\n==============================================");
        console.log(`[SCANNER MULTI-TOKEN] Analisando mercado: ${new Date().toLocaleTimeString()}`);
        console.log("==============================================");

        const amountInLamports = Math.floor(AMOUNT_SOL_TO_TRADE * 1e9);
        const marketOpportunities = [];

        // 1. Coleta dados de cotação para cada token da lista
        for (const token of WATCHLIST) {
            try {
                const response = await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${SOL_MINT}&outputMint=${token.mint}&amount=${amountInLamports}&slippageBps=50`);
                const quote = await response.json();

                if (quote && !quote.error && quote.outAmount) {
                    marketOpportunities.push({
                        symbol: token.symbol,
                        mint: token.mint,
                        outAmount: Number(quote.outAmount),
                        priceImpactPct: Number(quote.priceImpactPct || 0),
                        routes: quote.routePlan.length
                    });
                }
            } catch (err) {
                console.error(`Erro ao consultar o token ${token.symbol}:`, err.message);
            }
        }

        if (marketOpportunities.length === 0) {
            console.log("Nenhuma oportunidade encontrada neste ciclo.");
            return;
        }

        // 2. Critério de Seleção do "Mais Promissor"
        // Exemplo de critério: selecionar o token que retorna a maior quantidade de unidades 
        // ou aquele com menor impacto de preço (pode ajustar a lógica conforme sua estratégia)
        marketOpportunities.sort((a, b) => b.outAmount - a.outAmount);
        const bestCandidate = marketOpportunities[0];

        console.log(`🏆 [TOKEN MAIS PROMISSOR SELECIONADO]: ${bestCandidate.symbol}`);
        console.log(`- Retorno estimado: ${bestCandidate.outAmount} unidades para ${AMOUNT_SOL_TO_TRADE} SOL`);
        console.log(`- Impacto no preço: ${bestCandidate.priceImpactPct}%`);

        // 3. Gerenciamento da Posição Simulada
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
            // Se já tem posição, verifica se o token ativo ainda é o mesmo ou calcula o PnL
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

// Executa a varredura a cada 20 segundos
setInterval(scanAndSelectPromisingToken, 20000);

// Executa imediatamente
scanAndSelectPromisingToken();
