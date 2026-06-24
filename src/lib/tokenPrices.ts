import type { Token } from '@/config/tokens';

const STABLE_SYMBOLS = new Set(['USDC', 'EURC', 'USDT', 'WUSDC', 'USYC']);

export type TokenPriceMap = Record<string, number>;

export function getStaticTokenUsdPrice(token: Pick<Token, 'symbol'>): number | null {
  if (STABLE_SYMBOLS.has(token.symbol.toUpperCase())) return 1;
  return null;
}

export function getTokenUsdPrice(token: Pick<Token, 'symbol'>, _prices: TokenPriceMap): number | null {
  const staticPrice = getStaticTokenUsdPrice(token);
  if (staticPrice != null) return staticPrice;
  // NOTE: cirBTC is a testnet token whose on-chain/route pricing is unrelated to the
  // real BTC market. Applying the real BTC price here produced wildly misleading USD
  // estimates (e.g. "$100 in -> $3.78 out") that don't reflect the actual testnet quote,
  // so we intentionally return null (no USD estimate) rather than a fake market value.
  return null;
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

