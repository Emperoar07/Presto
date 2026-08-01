import { NextResponse } from 'next/server';
import { createPublicClient, http, getAddress, formatUnits, type Address, type PublicClient } from 'viem';
import { getClientIp, rateLimit } from '@/lib/rateLimit';
import { getUniswapV2Addresses } from '@/config/contracts';
import { getArcTestnetRpcUrls, raceRpcUrls } from '@/lib/rpc';

const DEFAULT_SYNTHRA_API_BASE = 'https://trading-api.synthra.org';
const ARC_CHAIN_ID = 5042002;
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const UINT_PATTERN = /^[1-9]\d{0,77}$/;
const BASE_TOKEN = getAddress('0x3600000000000000000000000000000000000000');
const ZERO = '0x0000000000000000000000000000000000000000';

type SynRouteEndpoint = 'quote' | 'swap';

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

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function isAddress(value: unknown): value is string {
  return typeof value === 'string' && ADDRESS_PATTERN.test(value);
}

function isPositiveUint(value: unknown): value is string {
  return typeof value === 'string' && UINT_PATTERN.test(value);
}

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

function pathImpactPct(amountIn: bigint, amountOut: bigint, hops: Hop[]): string {
  if (amountIn <= 0n || amountOut <= 0n || hops.length === 0) return '0';
  let midNum = 1n;
  let midDen = 1n;
  for (const h of hops) {
    if (h.rIn <= 0n || h.rOut <= 0n) return '0';
    midNum *= h.rOut;
    midDen *= h.rIn;
  }
  const ratioBps = (amountOut * midDen * 10000n) / (amountIn * midNum);
  const impactBps = ratioBps >= 10000n ? 0n : 10000n - ratioBps;
  return (Number(impactBps) / 100).toFixed(4);
}

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

const KNOWN_DECIMALS: Record<string, number> = {
  '0x3600000000000000000000000000000000000000': 6, // USDC
  '0x89b50855aa3be2f677cd6303cec089b5f319d72a': 6, // EURC
  '0x825ae482558415310c71b7e03d2bbe409345903': 6, // USYC
  '0xf0c4a4ce82a5746abaad9425360ab04fbba432bf': 8, // cirBTC
  '0x175cdb1d338945f0d851a741ccf787d343e57952': 18, // USDT
  '0x911b4000d3422f482f4062a913885f7b035382df': 18, // WUSDC
};

function resolveTokenDecimals(addr: string, provided?: unknown): number {
  if (typeof provided === 'number' && provided > 0) return provided;
  return KNOWN_DECIMALS[addr.toLowerCase()] ?? 18;
}

async function fallbackArcSynRouteQuote(bodyRecord: Record<string, unknown>, endpoint: SynRouteEndpoint) {
  const uni = getUniswapV2Addresses(ARC_CHAIN_ID);
  if (!uni) return NextResponse.json({ error: 'Arc router not configured' }, { status: 503 });

  const tokenIn = getAddress(String(bodyRecord.tokenIn)) as Address;
  const tokenOut = getAddress(String(bodyRecord.tokenOut)) as Address;
  const amountStr = String(bodyRecord.amount);
  const tradeType = bodyRecord.tradeType ?? 'EXACT_INPUT';

  const tokenInDecimals = resolveTokenDecimals(tokenIn, bodyRecord.tokenInDecimals);
  const tokenOutDecimals = resolveTokenDecimals(tokenOut, bodyRecord.tokenOutDecimals);

  const useHop = tokenIn.toLowerCase() !== BASE_TOKEN.toLowerCase() && tokenOut.toLowerCase() !== BASE_TOKEN.toLowerCase();
  const rpcUrls = getArcTestnetRpcUrls();

  const [directPool, legIn, legOut] = await raceRpcUrls(rpcUrls, async (url) => {
    const client = createPublicClient({ transport: http(url, { timeout: 8_000 }) });
    return Promise.all([
      readPool(client, uni.factory, tokenIn, tokenOut),
      useHop ? readPool(client, uni.factory, tokenIn, BASE_TOKEN) : Promise.resolve(null),
      useHop ? readPool(client, uni.factory, BASE_TOKEN, tokenOut) : Promise.resolve(null),
    ]);
  });

  const isExactIn = tradeType !== 'EXACT_OUTPUT';
  const candidates: Candidate[] = [];

  if (isExactIn) {
    const amountIn = BigInt(amountStr);
    if (directPool) {
      const out = getAmountOut(amountIn, directPool.rIn, directPool.rOut);
      if (out > 0n) candidates.push({ path: [tokenIn, tokenOut], hops: [directPool], amountIn, amountOut: out });
    }
    if (legIn && legOut) {
      const mid = getAmountOut(amountIn, legIn.rIn, legIn.rOut);
      const out = getAmountOut(mid, legOut.rIn, legOut.rOut);
      if (out > 0n) candidates.push({ path: [tokenIn, BASE_TOKEN, tokenOut], hops: [legIn, legOut], amountIn, amountOut: out });
    }
    candidates.sort((a, b) => (b.amountOut > a.amountOut ? 1 : b.amountOut < a.amountOut ? -1 : 0));
  } else {
    const amountOut = BigInt(amountStr);
    if (directPool) {
      const inp = getAmountIn(amountOut, directPool.rIn, directPool.rOut);
      if (inp > 0n) candidates.push({ path: [tokenIn, tokenOut], hops: [directPool], amountIn: inp, amountOut });
    }
    if (legIn && legOut) {
      const baseNeeded = getAmountIn(amountOut, legOut.rIn, legOut.rOut);
      const inp = baseNeeded > 0n ? getAmountIn(baseNeeded, legIn.rIn, legIn.rOut) : 0n;
      if (inp > 0n) candidates.push({ path: [tokenIn, BASE_TOKEN, tokenOut], hops: [legIn, legOut], amountIn: inp, amountOut });
    }
    candidates.sort((a, b) => (a.amountIn > b.amountIn ? 1 : a.amountIn < b.amountIn ? -1 : 0));
  }

  const best = candidates[0];
  if (!best) return NextResponse.json({ error: 'No SynRoute liquidity for this pair' }, { status: 404 });

  if (endpoint === 'quote') {
    return NextResponse.json({
      amountIn: best.amountIn.toString(),
      amountInDecimals: formatUnits(best.amountIn, tokenInDecimals),
      amountOut: best.amountOut.toString(),
      amountOutDecimals: formatUnits(best.amountOut, tokenOutDecimals),
      routeString: 'Synthra Route',
      priceImpact: pathImpactPct(best.amountIn, best.amountOut, best.hops),
    });
  }

  return NextResponse.json({
    approval: { needsApproval: false },
    transaction: null,
  });
}

export function validateSynRouteBody(endpoint: SynRouteEndpoint, body: unknown) {
  if (!body || typeof body !== 'object') return 'Request body must be an object';
  const record = body as Record<string, unknown>;

  if (record.chainId !== ARC_CHAIN_ID) return 'SynRoute is only enabled on Arc Testnet';
  if (!isAddress(record.tokenIn)) return 'tokenIn must be an EVM address';
  if (!isAddress(record.tokenOut)) return 'tokenOut must be an EVM address';
  if (String(record.tokenIn).toLowerCase() === String(record.tokenOut).toLowerCase()) {
    return 'tokenIn and tokenOut must be different';
  }
  if (!isPositiveUint(record.amount)) return 'amount must be a positive integer string';
  if (
    record.tradeType !== undefined &&
    record.tradeType !== 'EXACT_INPUT' &&
    record.tradeType !== 'EXACT_OUTPUT'
  ) {
    return 'tradeType must be EXACT_INPUT or EXACT_OUTPUT';
  }

  if (endpoint === 'swap') {
    if (!isAddress(record.sender)) return 'sender must be an EVM address';
    if (!isAddress(record.recipient)) return 'recipient must be an EVM address';
    if (record.approvalMode !== 'erc20' && record.approvalMode !== 'permit2') {
      return 'approvalMode must be erc20 or permit2';
    }
    const slippageBps = record.slippageBps;
    if (
      typeof slippageBps !== 'number' ||
      !Number.isInteger(slippageBps) ||
      slippageBps < 0 ||
      slippageBps > 5000
    ) {
      return 'slippageBps must be an integer from 0 to 5000';
    }
  }

  return null;
}

export async function proxySynRouteRequest(endpoint: SynRouteEndpoint, request: Request) {
  const ip = getClientIp(request);
  const limit = endpoint === 'quote' ? 60 : 20;
  const { allowed, retryAfter } = await rateLimit(`synroute:${endpoint}:${ip}`, limit, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': Math.ceil(retryAfter / 1000).toString() } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('Request body must be valid JSON');
  }

  const validationError = validateSynRouteBody(endpoint, body);
  if (validationError) return badRequest(validationError);
  const record = body as Record<string, unknown>;

  const apiKey = process.env.SYNTHRA_API_KEY;
  if (!apiKey) {
    return fallbackArcSynRouteQuote(record, endpoint);
  }

  const apiBase = (process.env.SYNTHRA_API_BASE ?? DEFAULT_SYNTHRA_API_BASE).replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(apiBase)) {
    return fallbackArcSynRouteQuote(record, endpoint);
  }

  try {
    const response = await fetch(`${apiBase}/v1/${endpoint}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: text || 'SynRoute request failed' };
    }

    if (!response.ok) {
      return fallbackArcSynRouteQuote(record, endpoint);
    }

    return NextResponse.json(data);
  } catch {
    return fallbackArcSynRouteQuote(record, endpoint);
  }
}
