import { NextResponse } from 'next/server';
import { createPublicClient, http, getAddress, type Address } from 'viem';
import { getUniswapV2Addresses } from '@/config/contracts';

// The Uniswap V2 fork is deployed on Arc Testnet only.
const ARC_CHAIN_ID = 5042002;
const ARC_RPC_URL = process.env.ARC_TESTNET_RPC_URL || process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network';

const FACTORY_ABI = [
  {
    type: 'function',
    name: 'getPair',
    stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'address' }],
    outputs: [{ type: 'address' }],
  },
] as const;

const PAIR_ABI = [
  {
    type: 'function',
    name: 'getReserves',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint112' }, { type: 'uint112' }, { type: 'uint32' }],
  },
  { type: 'function', name: 'token0', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
] as const;

const ZERO = '0x0000000000000000000000000000000000000000';

// Uniswap V2 constant-product math (0.30% fee)
function getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;
  const amountInWithFee = amountIn * 997n;
  return (amountInWithFee * reserveOut) / (reserveIn * 1000n + amountInWithFee);
}

function getAmountIn(amountOut: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  if (amountOut <= 0n || amountOut >= reserveOut || reserveIn <= 0n) return 0n;
  const numerator = reserveIn * amountOut * 1000n;
  const denominator = (reserveOut - amountOut) * 997n;
  return numerator / denominator + 1n;
}

// Price impact in percent vs the mid-price, scaled by 1e4 then divided for precision.
function priceImpactPct(amountIn: bigint, amountOut: bigint, reserveIn: bigint, reserveOut: bigint): string {
  if (amountIn <= 0n || amountOut <= 0n || reserveIn <= 0n || reserveOut <= 0n) return '0';
  // execPrice = amountOut/amountIn ; midPrice = reserveOut/reserveIn
  // impact = (1 - execPrice/midPrice) * 100
  const execNum = amountOut * reserveIn;
  const midNum = amountIn * reserveOut;
  if (midNum === 0n) return '0';
  const ratioBps = (execNum * 10000n) / midNum; // execPrice/midPrice in bps
  const impactBps = ratioBps >= 10000n ? 0n : 10000n - ratioBps;
  return (Number(impactBps) / 100).toFixed(4);
}

export async function POST(request: Request) {
  try {
    const { tokenIn, tokenOut, amount, tradeType, slippageBps } = await request.json();
    if (!tokenIn || !tokenOut || !amount) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const uni = getUniswapV2Addresses(ARC_CHAIN_ID);
    if (!uni) {
      return NextResponse.json({ error: 'Uniswap fork not configured for this chain' }, { status: 503 });
    }

    const tokenInDecimals = request.headers.get('x-token-in-decimals')
      ? parseInt(request.headers.get('x-token-in-decimals')!) : 18;
    const tokenOutDecimals = request.headers.get('x-token-out-decimals')
      ? parseInt(request.headers.get('x-token-out-decimals')!) : 18;

    const client = createPublicClient({ transport: http(ARC_RPC_URL) });

    const tIn = getAddress(tokenIn) as Address;
    const tOut = getAddress(tokenOut) as Address;

    const pair = (await client.readContract({
      address: uni.factory,
      abi: FACTORY_ABI,
      functionName: 'getPair',
      args: [tIn, tOut],
    })) as Address;

    if (!pair || pair.toLowerCase() === ZERO) {
      return NextResponse.json({ error: 'No Uniswap pool for this pair' }, { status: 404 });
    }

    const [reserves, token0] = await Promise.all([
      client.readContract({ address: pair, abi: PAIR_ABI, functionName: 'getReserves' }) as Promise<readonly [bigint, bigint, number]>,
      client.readContract({ address: pair, abi: PAIR_ABI, functionName: 'token0' }) as Promise<Address>,
    ]);

    const inIsToken0 = token0.toLowerCase() === tIn.toLowerCase();
    const reserveIn = inIsToken0 ? reserves[0] : reserves[1];
    const reserveOut = inIsToken0 ? reserves[1] : reserves[0];

    if (reserveIn <= 0n || reserveOut <= 0n) {
      return NextResponse.json({ error: 'Uniswap pool has no liquidity' }, { status: 404 });
    }

    const isExactIn = tradeType !== 'EXACT_OUTPUT';
    let amountIn: bigint;
    let amountOut: bigint;

    if (isExactIn) {
      amountIn = BigInt(amount);
      amountOut = getAmountOut(amountIn, reserveIn, reserveOut);
      if (amountOut <= 0n) {
        return NextResponse.json({ error: 'Insufficient liquidity' }, { status: 404 });
      }
    } else {
      amountOut = BigInt(amount);
      amountIn = getAmountIn(amountOut, reserveIn, reserveOut);
      if (amountIn <= 0n) {
        return NextResponse.json({ error: 'Insufficient liquidity' }, { status: 404 });
      }
    }

    return NextResponse.json({
      amountIn: amountIn.toString(),
      amountOut: amountOut.toString(),
      priceImpact: priceImpactPct(amountIn, amountOut, reserveIn, reserveOut),
      // Execution is built client-side via the router; no prebuilt calldata.
      transaction: null,
      router: uni.router,
      path: [tIn, tOut],
      pair,
      gasEstimate: '180000',
      routeString: 'Uniswap V2',
      tokenInDecimals,
      tokenOutDecimals,
      slippageBps: slippageBps ?? 50,
    });
  } catch (error) {
    console.error('Uniswap Quote Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
