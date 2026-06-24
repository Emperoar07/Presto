import { NextResponse } from 'next/server';
import { createPublicClient, http, getAddress, type Address, type PublicClient } from 'viem';
import { getUniswapV2Addresses } from '@/config/contracts';

// The Uniswap V2 fork is deployed on Arc Testnet only.
const ARC_CHAIN_ID = 5042002;
const ARC_RPC_URL = process.env.ARC_TESTNET_RPC_URL || process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network';
// Base token used for multi-hop routing (Arc USDC / hub token).
const BASE_TOKEN = getAddress('0x3600000000000000000000000000000000000000');

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

type Hop = { rIn: bigint; rOut: bigint; pair: Address };

// Combined price impact (%) across one or more hops, vs the product of mid-prices.
function pathImpactPct(amountIn: bigint, amountOut: bigint, hops: Hop[]): string {
  if (amountIn <= 0n || amountOut <= 0n || hops.length === 0) return '0';
  let midNum = 1n; // product of reserveOut
  let midDen = 1n; // product of reserveIn
  for (const h of hops) {
    if (h.rIn <= 0n || h.rOut <= 0n) return '0';
    midNum *= h.rOut;
    midDen *= h.rIn;
  }
  // execPrice/midPrice = (amountOut/amountIn) / (midNum/midDen) = (amountOut*midDen)/(amountIn*midNum)
  const ratioBps = (amountOut * midDen * 10000n) / (amountIn * midNum);
  const impactBps = ratioBps >= 10000n ? 0n : 10000n - ratioBps;
  return (Number(impactBps) / 100).toFixed(4);
}

// Read a pool oriented for a -> b. Returns null when no pool / no liquidity.
async function readPool(client: PublicClient, factory: Address, a: Address, b: Address): Promise<Hop | null> {
  const pair = (await client.readContract({
    address: factory, abi: FACTORY_ABI, functionName: 'getPair', args: [a, b],
  })) as Address;
  if (!pair || pair.toLowerCase() === ZERO) return null;
  const [reserves, token0] = await Promise.all([
    client.readContract({ address: pair, abi: PAIR_ABI, functionName: 'getReserves' }) as Promise<readonly [bigint, bigint, number]>,
    client.readContract({ address: pair, abi: PAIR_ABI, functionName: 'token0' }) as Promise<Address>,
  ]);
  const aIsToken0 = token0.toLowerCase() === a.toLowerCase();
  const rIn = aIsToken0 ? reserves[0] : reserves[1];
  const rOut = aIsToken0 ? reserves[1] : reserves[0];
  if (rIn <= 0n || rOut <= 0n) return null;
  return { rIn, rOut, pair };
}

type Candidate = { path: Address[]; hops: Hop[]; amountIn: bigint; amountOut: bigint };

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
    const useHop = tIn.toLowerCase() !== BASE_TOKEN.toLowerCase() && tOut.toLowerCase() !== BASE_TOKEN.toLowerCase();

    // Read direct pool and (when neither side is the base) the two hop legs, in parallel.
    const [directPool, legIn, legOut] = await Promise.all([
      readPool(client, uni.factory, tIn, tOut),
      useHop ? readPool(client, uni.factory, tIn, BASE_TOKEN) : Promise.resolve(null),
      useHop ? readPool(client, uni.factory, BASE_TOKEN, tOut) : Promise.resolve(null),
    ]);

    const isExactIn = tradeType !== 'EXACT_OUTPUT';
    const candidates: Candidate[] = [];

    if (isExactIn) {
      const amountIn = BigInt(amount);
      if (directPool) {
        const out = getAmountOut(amountIn, directPool.rIn, directPool.rOut);
        if (out > 0n) candidates.push({ path: [tIn, tOut], hops: [directPool], amountIn, amountOut: out });
      }
      if (legIn && legOut) {
        const mid = getAmountOut(amountIn, legIn.rIn, legIn.rOut);
        const out = getAmountOut(mid, legOut.rIn, legOut.rOut);
        if (out > 0n) candidates.push({ path: [tIn, BASE_TOKEN, tOut], hops: [legIn, legOut], amountIn, amountOut: out });
      }
      // Best exact-in = highest output.
      candidates.sort((a, b) => (b.amountOut > a.amountOut ? 1 : b.amountOut < a.amountOut ? -1 : 0));
    } else {
      const amountOut = BigInt(amount);
      if (directPool) {
        const inp = getAmountIn(amountOut, directPool.rIn, directPool.rOut);
        if (inp > 0n) candidates.push({ path: [tIn, tOut], hops: [directPool], amountIn: inp, amountOut });
      }
      if (legIn && legOut) {
        const baseNeeded = getAmountIn(amountOut, legOut.rIn, legOut.rOut);
        const inp = baseNeeded > 0n ? getAmountIn(baseNeeded, legIn.rIn, legIn.rOut) : 0n;
        if (inp > 0n) candidates.push({ path: [tIn, BASE_TOKEN, tOut], hops: [legIn, legOut], amountIn: inp, amountOut });
      }
      // Best exact-out = lowest input.
      candidates.sort((a, b) => (a.amountIn > b.amountIn ? 1 : a.amountIn < b.amountIn ? -1 : 0));
    }

    const best = candidates[0];
    if (!best) {
      return NextResponse.json({ error: 'No Uniswap route for this pair' }, { status: 404 });
    }

    const viaBase = best.path.length > 2;
    return NextResponse.json({
      amountIn: best.amountIn.toString(),
      amountOut: best.amountOut.toString(),
      priceImpact: pathImpactPct(best.amountIn, best.amountOut, best.hops),
      // Execution is built client-side via the router using `path`; no prebuilt calldata.
      transaction: null,
      router: uni.router,
      path: best.path,
      pair: viaBase ? undefined : best.hops[0].pair,
      gasEstimate: viaBase ? '260000' : '180000',
      routeString: viaBase ? 'Uniswap V2 · via USDC' : 'Uniswap V2',
      tokenInDecimals,
      tokenOutDecimals,
      slippageBps: slippageBps ?? 50,
    });
  } catch (error) {
    console.error('Uniswap Quote Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
