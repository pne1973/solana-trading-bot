require('dotenv').config();

const fs = require('fs');
const http = require('http');
const axios = require('axios');
const {
    Connection,
    PublicKey,
    LAMPORTS_PER_SOL
} = require('@solana/web3.js');

// ============================================================
// SOLANA / PUMP.FUN PAPER TRADING BOT
// ============================================================
// IMPORTANTE:
// - Este ficheiro é PAPER TRADING.
// - NÃO carrega WALLET_PRIVATE_KEY.
// - NÃO cria Keypair.
// - NÃO assina transações.
// - NÃO chama sendRawTransaction/sendTransaction.
// - NÃO usa saldo real da carteira.
// - Blockchain/mercado são reais; dinheiro é virtual.
//
// O monitor usa o WebSocket RPC do @solana/web3.js (onLogs)
// para receber transações que mencionam o programa Pump.fun.
// Depois obtém a transação e identifica CREATE / CREATE_V2
// através dos discriminators do IDL do Pump.
//
// ============================================================

const CONFIG = {
    MODE: 'PAPER',

    // ===== Carteira virtual =====
    paperInitialBalanceSol: Number(
        process.env.PAPER_INITIAL_BALANCE_SOL || 1.0
    ),

    amountToInvestSol: Number(
        process.env.PAPER_TRADE_SIZE_SOL || 0.001
    ),

    // ===== Risco =====
    takeProfitPct: Number(
        process.env.TAKE_PROFIT_PCT || 50
    ),

    stopLossPct: Number(
        process.env.STOP_LOSS_PCT || -25
    ),

    // ===== Monitorização =====
    rpcEndpoint:
        process.env.HELIUS_RPC_URL ||
        process.env.SOLANA_RPC_URL ||
        'https://api.mainnet-beta.solana.com',

    commitment:
        process.env.RPC_COMMITMENT || 'confirmed',

    pollMs: Number(
        process.env.TRADE_MONITOR_MS || 1500
    ),

    // ===== Pump.fun =====
    pumpFunProgramId:
        '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',

    // Official Pump instruction discriminators.
    // create = [24,30,200,40,5,28,7,119]
    // create_v2 = [214,144,76,236,95,139,49,180]

    createDiscriminator: Buffer.from([
        24, 30, 200, 40, 5, 28, 7, 119
    ]),

    createV2Discriminator: Buffer.from([
        214, 144, 76, 236, 95, 139, 49, 180
    ]),

    // ===== Jupiter =====
    jupiterQuoteUrl:
        process.env.JUPITER_QUOTE_URL ||
        'https://lite-api.jup.ag/swap/v1/quote',

    jupiterApiKey:
        process.env.JUPITER_API_KEY || '',

    maxAllowedSlippageBps: Number(
        process.env.MAX_SLIPPAGE_BPS || 500
    ),

    // Para tokens muito recentes que ainda não tenham
    // rota no Jupiter, podemos consultar a bonding curve.
    allowOnChainFallback: true,

    // ===== Histórico / painel =====
    historyFile:
        process.env.HISTORY_FILE ||
        'trades_history_paper.json',

    serverPort: Number(
        process.env.PORT || 3000
    ),

    processedSignatureLimit: 5000
};

if (CONFIG.MODE !== 'PAPER') {
    throw new Error(
        'Este bot foi concebido para PAPER TRADING. ' +
        'MODE deve ser PAPER.'
    );
}

const connection = new Connection(
    CONFIG.rpcEndpoint,
    CONFIG.commitment
);

const PUMP_PROGRAM = new PublicKey(
    CONFIG.pumpFunProgramId
);

const SOL_MINT =
    'So11111111111111111111111111111111111111112';

let activeTrade = null;
let monitorSubscriptionId = null;
let processedSignatures = new Set();
let monitorInFlight = false;

// ============================================================
// CARTEIRA VIRTUAL
// ============================================================

const paperWallet = {
    initialBalanceSol:
        roundSol(CONFIG.paperInitialBalanceSol),

    balanceSol:
        roundSol(CONFIG.paperInitialBalanceSol),

    reservedSol: 0,

    realizedProfitSol: 0
};

// ============================================================
// ESTATÍSTICAS
// ============================================================

const stats = {
    mode: 'PAPER — MAINNET REAL',

    rpcEndpoint:
        CONFIG.rpcEndpoint,

    walletConnection:
        'NÃO CONFIGURADA',

    realMoneyUsedSol: 0,

    totalScanned: 0,

    createEvents: 0,

    approvedTokens: 0,

    rejectedWhileBusy: 0,

    rejectedDuplicate: 0,

    rejectedInsufficientPaperBalance: 0,

    rejectedNoPrice: 0,

    totalTrades: 0,

    wins: 0,

    losses: 0,

    activeTrade: null,

    paperWallet,

    history: [],

    lastEvent: null,

    lastError: null,

    startedAt:
        new Date().toISOString()
};

// ============================================================
// HELPERS
// ============================================================

function roundSol(value) {
    return Number(
        Number(value || 0).toFixed(9)
    );
}

function sleep(ms) {
    return new Promise(
        resolve => setTimeout(resolve, ms)
    );
}

function sameBytes(a, b) {
    return (
        Buffer.isBuffer(a) &&
        Buffer.isBuffer(b) &&
        a.length === b.length &&
        a.equals(b)
    );
}

// Minimal base58 decoder.
// Evita outra dependência apenas para descodificar
// os dados das instruções Pump.fun.

const BASE58_ALPHABET =
    '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Decode(value) {
    if (!value) {
        return Buffer.alloc(0);
    }

    let bytes = [0];

    for (const char of value) {
        const digit =
            BASE58_ALPHABET.indexOf(char);

        if (digit < 0) {
            throw new Error(
                `Base58 inválido: ${char}`
            );
        }

        let carry = digit;

        for (
            let i = 0;
            i < bytes.length;
            i++
        ) {
            const x =
                bytes[i] * 58 + carry;

            bytes[i] =
                x & 0xff;

            carry =
                x >> 8;
        }

        while (carry > 0) {
            bytes.push(
                carry & 0xff
            );

            carry >>= 8;
        }
    }

    let leadingZeroes = 0;

    while (
        leadingZeroes < value.length &&
        value[leadingZeroes] === '1'
    ) {
        leadingZeroes++;
    }

    const result =
        Buffer.from(bytes.reverse());

    return Buffer.concat([
        Buffer.alloc(
            leadingZeroes
        ),

        result.length === 1 &&
        result[0] === 0
            ? Buffer.alloc(0)
            : result
    ]);
}

function readU32LE(buffer, offset) {
    if (offset + 4 > buffer.length) {
        throw new Error(
            'Dados insuficientes para u32'
        );
    }

    return buffer.readUInt32LE(offset);
}

function readString(buffer, offset) {
    const length =
        readU32LE(buffer, offset);

    const start =
        offset + 4;

    const end =
        start + length;

    if (end > buffer.length) {
        throw new Error(
            'String Borsh excede os dados da instrução'
        );
    }

    return {
        value:
            buffer
                .subarray(start, end)
                .toString('utf8'),

        offset: end
    };
}

function readPubkey(buffer, offset) {
    if (offset + 32 > buffer.length) {
        throw new Error(
            'Pubkey ausente nos dados da instrução'
        );
    }

    return new PublicKey(
        buffer.subarray(
            offset,
            offset + 32
        )
    ).toBase58();
}

function getInstructionData(instruction) {
    if (
        !instruction ||
        typeof instruction.data !== 'string'
    ) {
        return null;
    }

    try {
        return base58Decode(
            instruction.data
        );
    } catch {
        return null;
    }
}

function rememberSignature(signature) {
    processedSignatures.add(
        signature
    );

    if (
        processedSignatures.size >
        CONFIG.processedSignatureLimit
    ) {
        const first =
            processedSignatures
                .values()
                .next()
                .value;

        processedSignatures.delete(
            first
        );
    }
}
// ============================================================
// HISTÓRICO
// ============================================================

function loadHistory() {
    if (!fs.existsSync(CONFIG.historyFile)) {
        return;
    }

    try {
        const data = JSON.parse(
            fs.readFileSync(
                CONFIG.historyFile,
                'utf8'
            )
        );

        if (!Array.isArray(data)) {
            return;
        }

        stats.history = data;

        stats.totalTrades =
            data.length;

        stats.wins =
            data.filter(
                trade =>
                    trade.result ===
                    'TAKE_PROFIT'
            ).length;

        stats.losses =
            data.filter(
                trade =>
                    trade.result ===
                    'STOP_LOSS'
            ).length;

        stats.paperWallet
            .realizedProfitSol =
            roundSol(
                data.reduce(
                    (sum, trade) =>
                        sum +
                        Number(
                            trade.pnlSol || 0
                        ),
                    0
                )
            );

        stats.paperWallet.balanceSol =
            roundSol(
                stats.paperWallet
                    .initialBalanceSol +
                stats.paperWallet
                    .realizedProfitSol
            );

    } catch (error) {
        console.error(
            '⚠️ Não foi possível carregar o histórico:',
            error.message
        );
    }
}

function saveHistory() {
    try {
        fs.writeFileSync(
            CONFIG.historyFile,
            JSON.stringify(
                stats.history,
                null,
                2
            ),
            'utf8'
        );

    } catch (error) {
        stats.lastError =
            error.message;

        console.error(
            '❌ Erro ao guardar histórico:',
            error.message
        );
    }
}


// ============================================================
// PUMP.FUN — DETEÇÃO REAL
// ============================================================

function extractCreateFromInstruction(
    instruction
) {
    if (!instruction) {
        return null;
    }

    const programId =
        instruction.programId
            ?.toBase58?.() ||
        instruction.programId
            ?.toString?.();

    if (
        programId !==
        CONFIG.pumpFunProgramId
    ) {
        return null;
    }

    const data =
        getInstructionData(
            instruction
        );

    if (
        !data ||
        data.length < 8
    ) {
        return null;
    }

    const discriminator =
        data.subarray(0, 8);

    let type = null;

    if (
        sameBytes(
            discriminator,
            CONFIG.createDiscriminator
        )
    ) {
        type = 'CREATE';

    } else if (
        sameBytes(
            discriminator,
            CONFIG.createV2Discriminator
        )
    ) {
        type = 'CREATE_V2';

    } else {
        return null;
    }

    // ========================================================
    // IMPORTANTE:
    //
    // Não assumimos que o mint é "a última conta".
    //
    // Para as instruções oficiais de criação Pump.fun,
    // a conta #0 da instrução é o mint.
    // ========================================================

    const accounts =
        instruction.accounts || [];

    if (!accounts[0]) {
        return null;
    }

    const mint =
        accounts[0].toBase58();

    // ========================================================
    // METADATA
    // ========================================================

    let name = null;
    let symbol = null;
    let uri = null;
    let creator = null;
    let isMayhemMode = null;

    try {
        let offset = 8;

        // name
        const parsedName =
            readString(
                data,
                offset
            );

        name =
            parsedName.value;

        offset =
            parsedName.offset;

        // symbol
        const parsedSymbol =
            readString(
                data,
                offset
            );

        symbol =
            parsedSymbol.value;

        offset =
            parsedSymbol.offset;

        // URI
        const parsedUri =
            readString(
                data,
                offset
            );

        uri =
            parsedUri.value;

        offset =
            parsedUri.offset;

        // creator
        creator =
            readPubkey(
                data,
                offset
            );

        offset += 32;

        // CREATE_V2 pode conter flags adicionais.
        if (
            type === 'CREATE_V2' &&
            offset < data.length
        ) {
            isMayhemMode =
                Boolean(
                    data[offset]
                );
        }

    } catch {
        // Metadata não é obrigatória
        // para detetar o token.
    }

    return {
        type,
        mint,
        name,
        symbol,
        uri,
        creator,
        isMayhemMode
    };
}


async function findCreateEvent(
    signature
) {
    const tx =
        await connection
            .getParsedTransaction(
                signature,
                {
                    commitment:
                        CONFIG.commitment,

                    maxSupportedTransactionVersion:
                        0
                }
            );

    if (
        !tx ||
        tx.meta?.err
    ) {
        return null;
    }

    const instructions = [];

    // ========================================================
    // INSTRUÇÕES PRINCIPAIS
    // ========================================================

    for (
        const instruction of
        tx.transaction
            ?.message
            ?.instructions || []
    ) {
        instructions.push(
            instruction
        );
    }

    // ========================================================
    // INNER INSTRUCTIONS
    // ========================================================

    // Inspecionamos também inner instructions
    // defensivamente, porque algumas transações
    // podem criar atividade relevante através
    // de CPI.
    for (
        const inner of
        tx.meta
            ?.innerInstructions || []
    ) {
        for (
            const instruction of
            inner.instructions || []
        ) {
            instructions.push(
                instruction
            );
        }
    }

    // ========================================================
    // PROCURAR CREATE / CREATE_V2
    // ========================================================

    for (
        const instruction of
        instructions
    ) {
        const found =
            extractCreateFromInstruction(
                instruction
            );

        if (found) {
            return {
                ...found,

                signature,

                slot:
                    tx.slot,

                blockTime:
                    tx.blockTime
            };
        }
    }

    return null;
}


// ============================================================
// PUMP.FUN — BONDING CURVE
// ============================================================

function getBondingCurvePda(
    mint
) {
    const [address] =
        PublicKey
            .findProgramAddressSync(
                [
                    Buffer.from(
                        'bonding-curve'
                    ),

                    new PublicKey(
                        mint
                    ).toBuffer()
                ],

                PUMP_PROGRAM
            );

    return address;
}


function decodeBondingCurve(
    data
) {
    // ========================================================
    // Estrutura esperada:
    //
    // 8 bytes discriminator
    // 5 x u64
    // 1 byte complete
    // 32 bytes creator
    // ========================================================

    if (
        !data ||
        data.length < 81
    ) {
        return null;
    }

    const discriminator =
        data.subarray(0, 8);

    const expected =
        Buffer.from([
            23,
            183,
            248,
            55,
            96,
            216,
            172,
            96
        ]);

    if (
        !sameBytes(
            discriminator,
            expected
        )
    ) {
        return null;
    }

    return {
        virtualTokenReserves:
            data.readBigUInt64LE(
                8
            ),

        virtualSolReserves:
            data.readBigUInt64LE(
                16
            ),

        realTokenReserves:
            data.readBigUInt64LE(
                24
            ),

        realSolReserves:
            data.readBigUInt64LE(
                32
            ),

        tokenTotalSupply:
            data.readBigUInt64LE(
                40
            ),

        complete:
            data[48] !== 0,

        creator:
            new PublicKey(
                data.subarray(
                    49,
                    81
                )
            ).toBase58(),

        isMayhemMode:
            data.length >= 82
                ? data[81] !== 0
                : false
    };
}


async function getBondingCurveState(
    mint
) {
    const pda =
        getBondingCurvePda(
            mint
        );

    const account =
        await connection
            .getAccountInfo(
                pda,
                CONFIG.commitment
            );

    if (!account) {
        return null;
    }

    const state =
        decodeBondingCurve(
            account.data
        );

    if (!state) {
        return null;
    }

    return {
        ...state,

        address:
            pda.toBase58()
    };
}
// ============================================================
// PREÇO / QUOTE REAL
// ============================================================

function buildJupiterHeaders() {
    const headers = {
        Accept: 'application/json'
    };

    if (CONFIG.jupiterApiKey) {
        headers['x-api-key'] =
            CONFIG.jupiterApiKey;
    }

    return headers;
}


async function getJupiterQuote(
    inputMint,
    outputMint,
    amountAtomic
) {
    const url =
        new URL(
            CONFIG.jupiterQuoteUrl
        );

    url.searchParams.set(
        'inputMint',
        inputMint
    );

    url.searchParams.set(
        'outputMint',
        outputMint
    );

    url.searchParams.set(
        'amount',
        String(amountAtomic)
    );

    url.searchParams.set(
        'slippageBps',
        String(
            CONFIG.maxAllowedSlippageBps
        )
    );

    try {
        const response =
            await axios.get(
                url.toString(),
                {
                    timeout: 5000,

                    headers:
                        buildJupiterHeaders()
                }
            );

        if (
            response.data &&
            response.data.outAmount
        ) {
            return response.data;
        }

        return null;

    } catch (error) {
        return null;
    }
}


// ============================================================
// BONDING CURVE — COMPRA
// ============================================================

function calculateBondingCurveBuy(
    state,
    solInLamports
) {
    if (
        state.complete ||
        state.realTokenReserves <= 0n ||
        state.virtualTokenReserves <= 0n ||
        state.virtualSolReserves <= 0n
    ) {
        return null;
    }

    const vToken =
        state.virtualTokenReserves;

    const vSol =
        state.virtualSolReserves;

    const realToken =
        state.realTokenReserves;

    // ========================================================
    // Modelo constant-product da bonding curve.
    //
    // tokensOut =
    //     virtualTokenReserves -
    //     floor(
    //       k /
    //       (virtualSolReserves + solIn)
    //     )
    //
    // ========================================================

    const k =
        vToken * vSol;

    const newVSol =
        vSol +
        BigInt(solInLamports);

    let newVToken =
        k / newVSol;

    if (newVToken < 1n) {
        newVToken = 1n;
    }

    let tokenOut =
        vToken -
        newVToken;

    // Nunca podemos comprar mais do que
    // os tokens reais disponíveis na curva.

    if (
        tokenOut >
        realToken
    ) {
        tokenOut =
            realToken;
    }

    if (
        tokenOut <= 0n
    ) {
        return null;
    }

    return {
        inputLamports:
            BigInt(solInLamports),

        outputTokenAtomic:
            tokenOut,

        source:
            'PUMP_BONDING_CURVE_ONCHAIN'
    };
}


// ============================================================
// BONDING CURVE — VENDA
// ============================================================

function calculateBondingCurveSell(
    state,
    tokenAmountAtomic
) {
    if (
        state.virtualTokenReserves <= 0n ||
        state.virtualSolReserves <= 0n ||
        tokenAmountAtomic <= 0n
    ) {
        return null;
    }

    const vToken =
        state.virtualTokenReserves;

    const vSol =
        state.virtualSolReserves;

    const amount =
        BigInt(
            tokenAmountAtomic
        );

    const newVToken =
        vToken +
        amount;

    const k =
        vToken * vSol;

    const newVSol =
        k / newVToken;

    let grossSolOut =
        vSol -
        newVSol;

    if (
        grossSolOut < 0n
    ) {
        grossSolOut = 0n;
    }

    return {
        outputLamports:
            grossSolOut,

        source:
            'PUMP_BONDING_CURVE_ONCHAIN'
    };
}


// ============================================================
// QUOTE DE ENTRADA
// ============================================================

async function getEntryQuote(
    mint
) {
    const amountLamports =
        Math.floor(
            CONFIG.amountToInvestSol *
            LAMPORTS_PER_SOL
        );

    // ========================================================
    // 1. PRIMEIRO: JUPITER
    // ========================================================

    const jupiter =
        await getJupiterQuote(
            SOL_MINT,
            mint,
            amountLamports
        );

    if (
        jupiter &&
        jupiter.outAmount
    ) {
        return {
            source:
                'JUPITER_REAL_QUOTE',

            inputSol:
                CONFIG.amountToInvestSol,

            inputLamports:
                amountLamports,

            outputTokenAtomic:
                BigInt(
                    jupiter.outAmount
                ),

            priceImpactPct:
                jupiter.priceImpactPct ??
                null,

            routePlan:
                jupiter.routePlan ??
                null,

            raw:
                jupiter
        };
    }

    // ========================================================
    // 2. FALLBACK: BONDING CURVE REAL
    // ========================================================

    if (
        !CONFIG.allowOnChainFallback
    ) {
        return null;
    }

    const state =
        await getBondingCurveState(
            mint
        );

    if (!state) {
        return null;
    }

    const curveQuote =
        calculateBondingCurveBuy(
            state,
            amountLamports
        );

    if (!curveQuote) {
        return null;
    }

    return {
        ...curveQuote,

        inputSol:
            CONFIG.amountToInvestSol,

        inputLamports:
            amountLamports,

        priceImpactPct:
            null,

        raw:
            null,

        curveState:
            state
    };
}


// ============================================================
// VALOR ATUAL DA POSIÇÃO
// ============================================================

async function getCurrentPositionValue(
    trade
) {
    // ========================================================
    // Tentamos primeiro uma venda teórica através
    // de uma cotação real do Jupiter.
    //
    // Isto NÃO executa a venda.
    //
    // Apenas pergunta:
    //
    // "Se eu vendesse esta quantidade agora,
    //  quanto SOL receberia?"
    //
    // ========================================================

    const jupiter =
        await getJupiterQuote(
            trade.mint,
            SOL_MINT,
            trade.tokenAmountAtomic
        );

    if (
        jupiter &&
        jupiter.outAmount
    ) {
        return {
            valueSol:
                Number(
                    jupiter.outAmount
                ) /
                LAMPORTS_PER_SOL,

            source:
                'JUPITER_REAL_QUOTE',

            raw:
                jupiter
        };
    }

    // ========================================================
    // FALLBACK ON-CHAIN
    // ========================================================

    if (
        !CONFIG.allowOnChainFallback
    ) {
        return null;
    }

    const state =
        await getBondingCurveState(
            trade.mint
        );

    if (!state) {
        return null;
    }

    const curveSell =
        calculateBondingCurveSell(
            state,
            trade.tokenAmountAtomic
        );

    if (!curveSell) {
        return null;
    }

    return {
        valueSol:
            Number(
                curveSell.outputLamports
            ) /
            LAMPORTS_PER_SOL,

        source:
            'PUMP_BONDING_CURVE_ONCHAIN',

        raw:
            state
    };
}


// ============================================================
// PAPER TRADING
// ============================================================

function hasTradedMint(
    mint
) {
    return stats.history.some(
        trade =>
            trade.mint === mint
    );
}


// ============================================================
// ABRIR POSIÇÃO PAPER
// ============================================================

async function openPaperPosition(
    event
) {
    // ========================================================
    // Só pode existir UMA posição.
    // ========================================================

    if (activeTrade) {
        stats.rejectedWhileBusy++;
        return;
    }

    // ========================================================
    // Não comprar o mesmo mint duas vezes.
    // ========================================================

    if (
        hasTradedMint(
            event.mint
        )
    ) {
        stats.rejectedDuplicate++;
        return;
    }

    // ========================================================
    // Saldo VIRTUAL.
    // ========================================================

    if (
        paperWallet.balanceSol <
        CONFIG.amountToInvestSol
    ) {
        stats.rejectedInsufficientPaperBalance++;
        return;
    }

    // ========================================================
    // Obter quote REAL.
    // ========================================================

    const quote =
        await getEntryQuote(
            event.mint
        );

    if (!quote) {
        stats.rejectedNoPrice++;

        console.log(
            `⏭️ Sem quote/preço disponível para ${event.mint}`
        );

        return;
    }

    // ========================================================
    // RESERVAR DINHEIRO VIRTUAL
    // ========================================================

    paperWallet.balanceSol =
        roundSol(
            paperWallet.balanceSol -
            CONFIG.amountToInvestSol
        );

    paperWallet.reservedSol =
        roundSol(
            paperWallet.reservedSol +
            CONFIG.amountToInvestSol
        );

    // ========================================================
    // CRIAR POSIÇÃO VIRTUAL
    // ========================================================

    activeTrade = {
        mint:
            event.mint,

        name:
            event.name,

        symbol:
            event.symbol,

        creator:
            event.creator,

        createType:
            event.type,

        createSignature:
            event.signature,

        investedSol:
            CONFIG.amountToInvestSol,

        tokenAmountAtomic:
            quote.outputTokenAtomic
                .toString(),

        entryQuoteSource:
            quote.source,

        entryPriceImpactPct:
            quote.priceImpactPct,

        entryValueSol:
            CONFIG.amountToInvestSol,

        currentValueSol:
            CONFIG.amountToInvestSol,

        pnlPct:
            0,

        pnlSol:
            0,

        entryTime:
            new Date()
                .toISOString(),

        lastPriceUpdate:
            new Date()
                .toISOString(),

        highWatermarkPct:
            0,

        lowWatermarkPct:
            0,

        status:
            'OPEN'
    };

    stats.approvedTokens++;

    stats.activeTrade =
        activeTrade;

    console.log('');

    console.log(
        `🟢 [PAPER BUY] ${
            event.symbol ||
            event.mint
        }`
    );

    console.log(
        `   Mint: ${event.mint}`
    );

    console.log(
        `   Entrada: ${
            CONFIG.amountToInvestSol
        } SOL`
    );

    console.log(
        `   Quote: ${
            quote.source
        }`
    );

    console.log(
        `   Tokens virtuais: ${
            quote.outputTokenAtomic
        }`
    );
}
// ============================================================
// FECHAR POSIÇÃO PAPER
// ============================================================

async function closePaperPosition(
    result,
    exitData
) {
    if (!activeTrade) {
        return;
    }

    const trade =
        activeTrade;

    const finalValueSol =
        roundSol(
            exitData.valueSol
        );

    const pnlSol =
        roundSol(
            finalValueSol -
            trade.investedSol
        );

    const pnlPct =
        Number(
            (
                (pnlSol /
                    trade.investedSol) *
                100
            ).toFixed(2)
        );

    // ========================================================
    // LIBERTAR CAPITAL VIRTUAL
    // ========================================================

    paperWallet.reservedSol =
        roundSol(
            paperWallet.reservedSol -
            trade.investedSol
        );

    // ========================================================
    // DEVOLVER AO SALDO VIRTUAL O VALOR
    // DA VENDA SIMULADA
    // ========================================================

    paperWallet.balanceSol =
        roundSol(
            paperWallet.balanceSol +
            finalValueSol
        );

    // ========================================================
    // LUCRO/PERDA REALIZADO DA CARTEIRA VIRTUAL
    // ========================================================

    paperWallet.realizedProfitSol =
        roundSol(
            paperWallet.balanceSol -
            paperWallet.initialBalanceSol
        );

    // ========================================================
    // REGISTAR TRADE
    // ========================================================

    const record = {
        mint:
            trade.mint,

        name:
            trade.name,

        symbol:
            trade.symbol,

        creator:
            trade.creator,

        createType:
            trade.createType,

        createSignature:
            trade.createSignature,

        investedSol:
            trade.investedSol,

        finalValueSol:
            finalValueSol,

        pnlSol:
            pnlSol,

        pnlPct:
            pnlPct,

        tokenAmountAtomic:
            trade.tokenAmountAtomic,

        result:
            result,

        exitQuoteSource:
            exitData.source,

        entryTime:
            trade.entryTime,

        exitTime:
            new Date()
                .toISOString(),

        priceImpactPct:
            trade.entryPriceImpactPct,

        note:
            exitData.source ===
            'JUPITER_REAL_QUOTE'
                ? 'PAPER: saída valorizada por quote real Jupiter; nenhuma transação enviada.'
                : 'PAPER: saída valorizada pela bonding curve on-chain; Jupiter não tinha rota disponível.'
    };

    stats.history.push(
        record
    );

    stats.totalTrades++;

    if (
        result ===
        'TAKE_PROFIT'
    ) {
        stats.wins++;

    } else if (
        result ===
        'STOP_LOSS'
    ) {
        stats.losses++;
    }

    saveHistory();

    // ========================================================
    // LOG
    // ========================================================

    console.log('');

    if (
        result ===
        'TAKE_PROFIT'
    ) {
        console.log(
            '🎯 [PAPER SELL — TAKE PROFIT]'
        );
    } else {
        console.log(
            '🛑 [PAPER SELL — STOP LOSS]'
        );
    }

    console.log(
        `   Token: ${
            trade.symbol ||
            trade.mint
        }`
    );

    console.log(
        `   Investido: ${
            trade.investedSol
        } SOL`
    );

    console.log(
        `   Valor final: ${
            finalValueSol
        } SOL`
    );

    console.log(
        `   P/L: ${
            pnlPct
        }%`
    );

    console.log(
        `   Resultado: ${
            pnlSol
        } SOL`
    );

    console.log(
        `   Saldo virtual: ${
            paperWallet.balanceSol
        } SOL`
    );

    console.log(
        `   Dinheiro real utilizado: 0 SOL`
    );

    console.log('');

    // ========================================================
    // LIMPAR POSIÇÃO
    // ========================================================

    activeTrade = null;

    stats.activeTrade =
        null;
}


// ============================================================
// MONITORIZAR POSIÇÃO ATIVA
// ============================================================

async function monitorActiveTrade() {
    if (
        !activeTrade ||
        monitorInFlight
    ) {
        return;
    }

    monitorInFlight = true;

    try {
        // ====================================================
        // PERGUNTAR AO MERCADO:
        //
        // "Quanto valeria agora esta quantidade
        //  de tokens se fosse vendida?"
        //
        // Não executamos nada.
        // ====================================================

        const value =
            await getCurrentPositionValue(
                activeTrade
            );

        if (!value) {
            return;
        }

        const currentValueSol =
            roundSol(
                value.valueSol
            );

        const pnlSol =
            roundSol(
                currentValueSol -
                activeTrade.investedSol
            );

        const pnlPct =
            Number(
                (
                    (pnlSol /
                        activeTrade.investedSol) *
                    100
                ).toFixed(2)
            );

        // ====================================================
        // ATUALIZAR ESTADO
        // ====================================================

        activeTrade.currentValueSol =
            currentValueSol;

        activeTrade.pnlSol =
            pnlSol;

        activeTrade.pnlPct =
            pnlPct;

        activeTrade.priceSource =
            value.source;

        activeTrade.lastPriceUpdate =
            new Date()
                .toISOString();

        // ====================================================
        // HIGH / LOW WATERMARK
        // ====================================================

        activeTrade.highWatermarkPct =
            Math.max(
                activeTrade.highWatermarkPct,
                pnlPct
            );

        activeTrade.lowWatermarkPct =
            Math.min(
                activeTrade.lowWatermarkPct,
                pnlPct
            );

        stats.activeTrade =
            activeTrade;

        // ====================================================
        // TAKE PROFIT
        // ====================================================

        if (
            pnlPct >=
            CONFIG.takeProfitPct
        ) {
            await closePaperPosition(
                'TAKE_PROFIT',
                value
            );

            return;
        }

        // ====================================================
        // STOP LOSS
        // ====================================================

        if (
            pnlPct <=
            CONFIG.stopLossPct
        ) {
            await closePaperPosition(
                'STOP_LOSS',
                value
            );

            return;
        }

    } catch (error) {
        stats.lastError =
            error.message;

    } finally {
        monitorInFlight =
            false;
    }
}


// ============================================================
// PROCESSAR UMA TRANSAÇÃO DETETADA
// ============================================================

async function processSignature(
    signature
) {
    if (!signature) {
        return;
    }

    // Evitar processar a mesma transação
    // duas vezes.

    if (
        processedSignatures.has(
            signature
        )
    ) {
        return;
    }

    rememberSignature(
        signature
    );

    stats.totalScanned++;

    try {
        // ====================================================
        // OBTER A TRANSAÇÃO REAL
        // ====================================================

        const event =
            await findCreateEvent(
                signature
            );

        if (!event) {
            return;
        }

        stats.createEvents++;

        stats.lastEvent = {
            ...event,

            detectedAt:
                new Date()
                    .toISOString()
        };

        // ====================================================
        // MOSTRAR TOKEN
        // ====================================================

        console.log('');

        console.log(
            `🆕 [${event.type}] Token real detetado`
        );

        console.log(
            `   Mint: ${event.mint}`
        );

        console.log(
            `   Nome: ${
                event.name || '-'
            }`
        );

        console.log(
            `   Symbol: ${
                event.symbol || '-'
            }`
        );

        console.log(
            `   Creator: ${
                event.creator || '-'
            }`
        );

        console.log(
            `   TX: ${
                event.signature
            }`
        );

        // ====================================================
        // UMA POSIÇÃO DE CADA VEZ
        // ====================================================

        if (activeTrade) {
            stats.rejectedWhileBusy++;

            console.log(
                '⏭️ Ignorado: já existe uma posição ativa.'
            );

            return;
        }

        // ====================================================
        // DUPLICADO
        // ====================================================

        if (
            hasTradedMint(
                event.mint
            )
        ) {
            stats.rejectedDuplicate++;

            console.log(
                '⏭️ Ignorado: token já negociado anteriormente.'
            );

            return;
        }

        // ====================================================
        // TENTAR PAPER BUY
        // ====================================================

        await openPaperPosition(
            event
        );

    } catch (error) {
        stats.lastError =
            error.message;

        console.error(
            '❌ Erro ao processar transação:',
            error.message
        );
    }
}


// ============================================================
// MONITOR REAL-TIME DA SOLANA
// ============================================================

async function startBlockchainMonitor() {
    if (
        monitorSubscriptionId !==
        null
    ) {
        return;
    }

    console.log('');

    console.log(
        '📡 A iniciar monitorização REAL da Solana...'
    );

    console.log(
        `   Pump Program: ${
            CONFIG.pumpFunProgramId
        }`
    );

    console.log(
        `   RPC: ${
            CONFIG.rpcEndpoint
        }`
    );

    console.log(
        `   Commitment: ${
            CONFIG.commitment
        }`
    );

    // ========================================================
    // WEBSOCKET
    //
    // O RPC avisa-nos quando aparece uma transação
    // relacionada com o programa Pump.fun.
    //
    // Depois processSignature() obtém a transação completa
    // e identifica se foi CREATE / CREATE_V2.
    // ========================================================

    monitorSubscriptionId =
        connection.onLogs(
            PUMP_PROGRAM,

            async (
                logInfo
            ) => {
                // Transação com erro:
                // não interessa para criação válida.

                if (
                    logInfo.err
                ) {
                    return;
                }

                processSignature(
                    logInfo.signature
                );
            },

            CONFIG.commitment
        );

    console.log('');

    console.log(
        `✅ WebSocket Pump.fun ativo.`
    );

    console.log(
        `   Subscription ID: ${
            monitorSubscriptionId
        }`
    );

    console.log('');
}


// ============================================================
// ESTATÍSTICAS PÚBLICAS PARA O PAINEL
// ============================================================

function getPublicStats() {
    return {
        ...stats,

        config: {
            mode:
                CONFIG.MODE,

            paperInitialBalanceSol:
                CONFIG.paperInitialBalanceSol,

            amountToInvestSol:
                CONFIG.amountToInvestSol,

            takeProfitPct:
                CONFIG.takeProfitPct,

            stopLossPct:
                CONFIG.stopLossPct,

            rpcCommitment:
                CONFIG.commitment,

            pumpFunProgramId:
                CONFIG.pumpFunProgramId,

            jupiterQuoteUrl:
                CONFIG.jupiterQuoteUrl,

            maxAllowedSlippageBps:
                CONFIG.maxAllowedSlippageBps
        },

        paperWallet: {
            initialBalanceSol:
                paperWallet
                    .initialBalanceSol,

            balanceSol:
                paperWallet
                    .balanceSol,

            reservedSol:
                paperWallet
                    .reservedSol,

            realizedProfitSol:
                paperWallet
                    .realizedProfitSol
        }
    };
}
// ============================================================
// SERVIDOR WEB / PAINEL
// ============================================================

const server =
    http.createServer(
        (req, res) => {

            // =================================================
            // CORS
            // =================================================

            res.setHeader(
                'Access-Control-Allow-Origin',
                '*'
            );

            // =================================================
            // API DE ESTATÍSTICAS
            // =================================================

            if (
                req.url ===
                '/api/stats'
            ) {
                res.writeHead(
                    200,
                    {
                        'Content-Type':
                            'application/json; charset=utf-8',

                        'Cache-Control':
                            'no-store'
                    }
                );

                res.end(
                    JSON.stringify(
                        getPublicStats(),
                        null,
                        2
                    )
                );

                return;
            }

            // =================================================
            // PAINEL HTML
            // =================================================

            res.writeHead(
                200,
                {
                    'Content-Type':
                        'text/html; charset=utf-8'
                }
            );

            res.end(`
<!doctype html>

<html lang="pt">

<head>

<meta charset="utf-8">

<meta
    name="viewport"
    content="width=device-width,initial-scale=1"
>

<title>
    Solana Meme Sniper — PAPER
</title>

<style>

body {
    font-family:
        Arial,
        sans-serif;

    background:
        #0b1020;

    color:
        #e8eefc;

    margin:
        0;

    padding:
        24px;
}

h1 {
    margin-top:
        0;
}

.grid {
    display:
        grid;

    grid-template-columns:
        repeat(
            auto-fit,
            minmax(
                280px,
                1fr
            )
        );

    gap:
        14px;
}

.card {
    background:
        #121a2d;

    border:
        1px solid #26324d;

    border-radius:
        12px;

    padding:
        16px;
}

.label {
    color:
        #91a0bd;

    font-size:
        12px;

    text-transform:
        uppercase;
}

.value {
    font-size:
        20px;

    margin-top:
        4px;
}

.good {
    color:
        #5ee6a8;
}

.warn {
    color:
        #ffd166;
}

.bad {
    color:
        #ff7180;
}

.cyan {
    color:
        #65d9ff;
}

pre {
    white-space:
        pre-wrap;

    word-break:
        break-word;
}

.badge {
    display:
        inline-block;

    padding:
        6px 10px;

    border-radius:
        20px;

    background:
        #163b2c;

    color:
        #5ee6a8;

    font-size:
        12px;
}

</style>

</head>


<body>

<h1>
    Solana Meme Sniper — PAPER TRADING
</h1>


<div class="card">

    <div class="label">
        Segurança
    </div>

    <div class="value good">

        <span class="badge">
            PAPER
        </span>

        MAINNET REAL ·
        DINHEIRO VIRTUAL ·
        0 TRANSAÇÕES REAIS

    </div>

</div>


<br>


<div class="grid">


    <!-- ============================================= -->
    <!-- SALDO -->
    <!-- ============================================= -->

    <div class="card">

        <div class="label">
            Saldo virtual
        </div>

        <div
            id="balance"
            class="value cyan"
        >
            -
        </div>


        <br>


        <div class="label">
            Lucro realizado
        </div>

        <div
            id="profit"
            class="value good"
        >
            -
        </div>

    </div>


    <!-- ============================================= -->
    <!-- TRADES -->
    <!-- ============================================= -->

    <div class="card">

        <div class="label">
            Trades
        </div>

        <div
            id="trades"
            class="value"
        >
            -
        </div>


        <br>


        <div
            id="winrate"
            class="label"
        >
            Win rate: -
        </div>

    </div>


    <!-- ============================================= -->
    <!-- TOKENS -->
    <!-- ============================================= -->

    <div class="card">

        <div class="label">
            Tokens CREATE detetados
        </div>

        <div
            id="creates"
            class="value"
        >
            -
        </div>


        <br>


        <div class="label">
            Tokens aprovados
        </div>

        <div
            id="approved"
            class="value"
        >
            -
        </div>

    </div>


    <!-- ============================================= -->
    <!-- ÚLTIMO TOKEN -->
    <!-- ============================================= -->

    <div class="card">

        <div class="label">
            Último token
        </div>

        <div
            id="lastToken"
            class="value cyan"
        >
            -
        </div>

    </div>

</div>


<br>


<!-- ============================================= -->
<!-- TRADE ATIVO -->
<!-- ============================================= -->

<div class="card">

    <div class="label">
        Trade ativo
    </div>

    <pre id="active">
Sem posição.
    </pre>

</div>


<br>


<!-- ============================================= -->
<!-- ÚLTIMO EVENTO -->
<!-- ============================================= -->

<div class="card">

    <div class="label">
        Último evento Pump.fun
    </div>

    <pre id="event">
Nenhum evento.
    </pre>

</div>


<br>


<!-- ============================================= -->
<!-- HISTÓRICO -->
<!-- ============================================= -->

<div class="card">

    <div class="label">
        Histórico
    </div>

    <pre id="history">
[]
    </pre>

</div>


<script>


// =================================================
// ATUALIZAÇÃO DO PAINEL
// =================================================

async function update() {

    try {

        const response =
            await fetch(
                '/api/stats',
                {
                    cache:
                        'no-store'
                }
            );


        const data =
            await response.json();


        // =========================================
        // SALDO
        // =========================================

        document
            .getElementById(
                'balance'
            )
            .textContent =
                Number(
                    data
                        .paperWallet
                        .balanceSol
                ).toFixed(9)
                + ' SOL';


        // =========================================
        // LUCRO
        // =========================================

        document
            .getElementById(
                'profit'
            )
            .textContent =
                Number(
                    data
                        .paperWallet
                        .realizedProfitSol
                ).toFixed(9)
                + ' SOL';


        // =========================================
        // TRADES
        // =========================================

        document
            .getElementById(
                'trades'
            )
            .textContent =
                data.totalTrades
                + ' · W '
                + data.wins
                + ' · L '
                + data.losses;


        // =========================================
        // WIN RATE
        // =========================================

        const winRate =
            data.totalTrades
                ? (
                    (
                        data.wins /
                        data.totalTrades
                    ) *
                    100
                ).toFixed(2)

                : '0.00';


        document
            .getElementById(
                'winrate'
            )
            .textContent =
                'Win rate: '
                + winRate
                + '%';


        // =========================================
        // CREATE EVENTS
        // =========================================

        document
            .getElementById(
                'creates'
            )
            .textContent =
                data.createEvents;


        // =========================================
        // APROVADOS
        // =========================================

        document
            .getElementById(
                'approved'
            )
            .textContent =
                data.approvedTokens;


        // =========================================
        // ÚLTIMO TOKEN
        // =========================================

        document
            .getElementById(
                'lastToken'
            )
            .textContent =
                data.lastEvent

                    ? (
                        data
                            .lastEvent
                            .symbol
                        ||
                        data
                            .lastEvent
                            .mint
                    )

                    : '-';


        // =========================================
        // TRADE ATIVO
        // =========================================

        document
            .getElementById(
                'active'
            )
            .textContent =
                data.activeTrade

                    ? JSON.stringify(
                        data.activeTrade,
                        null,
                        2
                    )

                    : 'Sem posição.';


        // =========================================
        // ÚLTIMO EVENTO
        // =========================================

        document
            .getElementById(
                'event'
            )
            .textContent =
                data.lastEvent

                    ? JSON.stringify(
                        data.lastEvent,
                        null,
                        2
                    )

                    : 'Nenhum evento.';


        // =========================================
        // HISTÓRICO
        // =========================================

        document
            .getElementById(
                'history'
            )
            .textContent =
                JSON.stringify(
                    data.history,
                    null,
                    2
                );


    } catch (error) {

        console.error(
            'Erro ao atualizar painel:',
            error
        );

    }

}


// =================================================
// ATUALIZAR A CADA 1.5 SEGUNDOS
// =================================================

setInterval(
    update,
    1500
);


// =================================================
// PRIMEIRA ATUALIZAÇÃO
// =================================================

update();

</script>


</body>

</html>
            `);
        }
    );


// ============================================================
// MAIN
// ============================================================

async function main() {

    // ========================================================
    // CARREGAR HISTÓRICO EXISTENTE
    // ========================================================

    loadHistory();


    // ========================================================
    // CABEÇALHO
    // ========================================================

    console.log('');

    console.log(
        '============================================================'
    );

    console.log(
        ' SOLANA MEME SNIPER — PAPER TRADING'
    );

    console.log(
        '============================================================'
    );

    console.log(
        '⚠️  Blockchain: REAL MAINNET'
    );

    console.log(
        '💰 Carteira: SIMULADA'
    );

    console.log(
        '🚫 Private key: NÃO UTILIZADA'
    );

    console.log(
        '🚫 Transações reais: 0'
    );

    console.log(
        `💵 Saldo virtual inicial: ${
            paperWallet.initialBalanceSol
        } SOL`
    );

    console.log(
        `🎯 Trade: ${
            CONFIG.amountToInvestSol
        } SOL`
    );

    console.log(
        `📈 Take Profit: +${
            CONFIG.takeProfitPct
        }%`
    );

    console.log(
        `📉 Stop Loss: ${
            CONFIG.stopLossPct
        }%`
    );

    console.log(
        '============================================================'
    );


    // ========================================================
    // SERVIDOR WEB
    // ========================================================

    server.listen(
        CONFIG.serverPort,
        '0.0.0.0',
        () => {

            console.log(
                `🌐 Painel: http://0.0.0.0:${
                    CONFIG.serverPort
                }`
            );

        }
    );


    // ========================================================
    // MONITOR BLOCKCHAIN
    // ========================================================

    await startBlockchainMonitor();


    // ========================================================
    // MONITOR DE POSIÇÃO
    // ========================================================

    setInterval(
        monitorActiveTrade,
        CONFIG.pollMs
    );
}


// ============================================================
// SHUTDOWN — CTRL+C
// ============================================================

process.on(
    'SIGINT',
    async () => {

        console.log(
            '\n🛑 A terminar...'
        );


        if (
            monitorSubscriptionId !==
            null
        ) {

            try {

                await connection
                    .removeOnLogsListener(
                        monitorSubscriptionId
                    );

            } catch {}

        }


        server.close(
            () => {
                process.exit(0);
            }
        );

    }
);


// ============================================================
// SHUTDOWN — SIGTERM
// ============================================================

process.on(
    'SIGTERM',
    async () => {

        if (
            monitorSubscriptionId !==
            null
        ) {

            try {

                await connection
                    .removeOnLogsListener(
                        monitorSubscriptionId
                    );

            } catch {}

        }


        server.close(
            () => {
                process.exit(0);
            }
        );

    }
);


// ============================================================
// ARRANQUE
// ============================================================

main()
    .catch(
        error => {

            console.error(
                '❌ Erro fatal:',
                error
            );

            process.exit(1);

        }
    );
