import { NextResponse } from 'next/server';

const CACHE_TTL_MS = 60_000;

type PriceCache = {
  ts: number;
  prices: Record<string, number>;
};

type GlobalPriceCache = typeof globalThis & {
  __prestoPriceCache?: PriceCache;
};

const g = globalThis as GlobalPriceCache;

export async function GET() {
  if (g.__prestoPriceCache && Date.now() - g.__prestoPriceCache.ts < CACHE_TTL_MS) {
    return NextResponse.json(g.__prestoPriceCache.prices, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  }

  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
      { headers: { accept: 'application/json' }, next: { revalidate: 60 } }
    );
    if (!response.ok) throw new Error(`Price fetch failed (${response.status})`);
    const data = (await response.json()) as { bitcoin?: { usd?: number } };
    const btcUsd = data.bitcoin?.usd;
    if (!btcUsd || !Number.isFinite(btcUsd) || btcUsd <= 0) {
      throw new Error('BTC price unavailable');
    }

    const prices = { BTC: btcUsd };
    g.__prestoPriceCache = { ts: Date.now(), prices };
    return NextResponse.json(prices, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  } catch (error) {
    console.error('price api error:', error);
    if (g.__prestoPriceCache) {
      return NextResponse.json(g.__prestoPriceCache.prices, {
        headers: { 'Cache-Control': 'public, s-maxage=5' },
      });
    }
    return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 503 });
  }
}
