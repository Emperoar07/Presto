import { NextResponse } from 'next/server';
import { getOrderbookData, isValidAddress } from '@/lib/orderbook';
import { getClientIp, rateLimit } from '@/lib/rateLimit';

const SUPPORTED_ORDERBOOK_CHAIN_IDS = new Set([5042002, 42431]);

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const { allowed, retryAfter } = await rateLimit(`orderbook:${ip}`, 60, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': Math.ceil(retryAfter / 1000).toString() } }
    );
  }

  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const depthParam = Number(searchParams.get('depth') ?? '10');
  const chainIdParam = searchParams.get('chainId');
  const chainId = chainIdParam !== null ? Number(chainIdParam) : undefined;

  if (!isValidAddress(token)) {
    return NextResponse.json({ error: 'Invalid token address' }, { status: 400 });
  }

  if (
    chainId !== undefined &&
    (!Number.isInteger(chainId) || !SUPPORTED_ORDERBOOK_CHAIN_IDS.has(chainId))
  ) {
    return NextResponse.json({ error: 'Unsupported chain' }, { status: 400 });
  }

  const depth = Number.isFinite(depthParam) ? Math.min(Math.max(depthParam, 1), 50) : 10;
  try {
    const timeoutMs = 8000;
    const tokenAddress = token ?? '';
    const data = await Promise.race([
      getOrderbookData(tokenAddress, depth, 3000, chainId),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Orderbook timeout')), timeoutMs)),
    ]);
    // Serialize bigints as strings — JSON.stringify cannot handle bigint natively,
    // and the client-side code already converts them back with BigInt(amount)
    const serialized = {
      bids: data.bids.map((b) => ({ tick: b.tick, amount: b.amount.toString() })),
      asks: data.asks.map((a) => ({ tick: a.tick, amount: a.amount.toString() })),
      recentTrades: data.recentTrades.map((t) => ({
        price: t.price,
        amount: t.amount.toString(),
        side: t.side,
        hash: t.hash,
        block: t.block.toString(),
      })),
      cancelledOrders: data.cancelledOrders.map((c) => ({
        orderId: c.orderId,
        price: c.price,
        amount: c.amount.toString(),
        isBid: c.isBid,
        hash: c.hash,
        block: c.block.toString(),
      })),
    };
    const response = NextResponse.json(serialized);
    response.headers.set('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30');
    return response;
  } catch (error) {
    console.error('Orderbook API error:', error);
    const message = error instanceof Error ? error.message : 'Failed to load orderbook';
    const status = message.includes('timeout') ? 504 : 500;
    return NextResponse.json(
      { error: status === 504 ? 'Orderbook request timed out' : 'Failed to load orderbook' },
      { status }
    );
  }
}
