import { NextResponse } from 'next/server';

const CACHE_TTL_MS = 60_000;

// Curated Pyth price feeds (Hermes is an off-chain price service — works from any chain).
// Keyed by the symbol we expose in the app price map.
const PYTH_FEEDS: Record<string, string> = {
  BTC: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  ETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  EUR: '0xa995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b',
  SOL: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  USDT: '0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b',
  USDC: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
};

const FEED_TO_SYMBOL = new Map(
  Object.entries(PYTH_FEEDS).map(([symbol, id]) => [id.replace(/^0x/, '').toLowerCase(), symbol]),
);

type PriceCache = { ts: number; prices: Record<string, number> };
type GlobalPriceCache = typeof globalThis & { __prestoPriceCache?: PriceCache };
const g = globalThis as GlobalPriceCache;

async function fetchPythPrices(): Promise<Record<string, number> | null> {
  try {
    const params = Object.values(PYTH_FEEDS).map((id) => `ids[]=${id}`).join('&');
    const response = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?${params}`, {
      headers: { accept: 'application/json' },
      next: { revalidate: 60 },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      parsed?: { id?: string; price?: { price?: string; expo?: number } }[];
    };
    if (!data.parsed?.length) return null;

    const prices: Record<string, number> = {};
    for (const entry of data.parsed) {
      const symbol = entry.id ? FEED_TO_SYMBOL.get(entry.id.replace(/^0x/, '').toLowerCase()) : undefined;
      const p = entry.price;
      if (!symbol || !p || p.price == null || p.expo == null) continue;
      const px = Number(p.price) * Math.pow(10, p.expo);
      if (Number.isFinite(px) && px > 0) prices[symbol] = px;
    }
    return Object.keys(prices).length ? prices : null;
  } catch {
    return null;
  }
}

async function fetchBtcFromCoinGecko(): Promise<number | null> {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
      { headers: { accept: 'application/json' }, next: { revalidate: 60 } }
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { bitcoin?: { usd?: number } };
    const btcUsd = data.bitcoin?.usd;
    return btcUsd && Number.isFinite(btcUsd) && btcUsd > 0 ? btcUsd : null;
  } catch {
    return null;
  }
}

export async function GET() {
  if (g.__prestoPriceCache && Date.now() - g.__prestoPriceCache.ts < CACHE_TTL_MS) {
    return NextResponse.json(g.__prestoPriceCache.prices, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  }

  // Prefer Pyth (reliable, multi-asset); fall back to CoinGecko for BTC only.
  let prices = await fetchPythPrices();
  if (!prices) {
    const btc = await fetchBtcFromCoinGecko();
    if (btc) prices = { BTC: btc };
  }

  if (!prices) {
    if (g.__prestoPriceCache) {
      return NextResponse.json(g.__prestoPriceCache.prices, { headers: { 'Cache-Control': 'public, s-maxage=5' } });
    }
    return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 503 });
  }

  g.__prestoPriceCache = { ts: Date.now(), prices };
  return NextResponse.json(prices, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
  });
}
