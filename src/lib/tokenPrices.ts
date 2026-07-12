import type { Token } from '@/config/tokens';

const STABLE_SYMBOLS = new Set(['USDC', 'EURC', 'USDT', 'WUSDC', 'USYC']);

// App token symbol -> Pyth price-map key (served by /api/prices from Pyth Hermes).
// Prefer the live Pyth price; fall back to a stable peg when the feed is unavailable.
const PYTH_PRICED: Record<string, string> = {
  CIRBTC: 'BTC',
  EURC: 'EUR',
};

export type TokenPriceMap = Record<string, number>;

export function getStaticTokenUsdPrice(token: Pick<Token, 'symbol'>): number | null {
  if (STABLE_SYMBOLS.has(token.symbol.toUpperCase())) return 1;
  return null;
}

export function getTokenUsdPrice(token: Pick<Token, 'symbol'>, prices: TokenPriceMap): number | null {
  const pythKey = PYTH_PRICED[token.symbol.toUpperCase()];
  if (pythKey) {
    const px = prices[pythKey];
    if (Number.isFinite(px) && px > 0) return px;
  }
  return getStaticTokenUsdPrice(token);
}

export async function fetchTokenPrices(): Promise<TokenPriceMap> {
  const response = await fetch('/api/prices');
  if (!response.ok) throw new Error(`Price fetch failed (${response.status})`);
  return response.json() as Promise<TokenPriceMap>;
}

export function tokenToUsdAmount(tokenAmount: string, token: Pick<Token, 'symbol'>, prices: TokenPriceMap): string {
  const price = getTokenUsdPrice(token, prices);
  const amount = Number(tokenAmount);
  if (!price || !Number.isFinite(amount) || amount <= 0) return '';
  return (amount * price).toFixed(2);
}

export function usdToTokenAmount(usdAmount: string, token: Pick<Token, 'symbol' | 'decimals'>, prices: TokenPriceMap): string {
  const price = getTokenUsdPrice(token, prices);
  const amount = Number(usdAmount);
  if (!price || !Number.isFinite(amount) || amount <= 0) return '';
  const tokenAmount = amount / price;
  return tokenAmount.toFixed(Math.min(token.decimals, 12)).replace(/\.?0+$/, '');
}
