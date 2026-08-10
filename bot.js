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
    console.log(`[EXECUÇÃO LOCAL] Hora: ${new Date().toLocaleTimeString()}`);
    
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
