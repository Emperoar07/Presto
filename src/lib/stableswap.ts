export const USDC_ADDR = '0x3600000000000000000000000000000000000000' as const;
export const EURC_ADDR = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as const;
export const USDT_ADDR = '0x175CdB1D338945f0D851A741ccF787D343E57952' as const;
export const WUSDC_ADDR = '0x911b4000D3422F482F4062a913885f7b035382Df' as const;

export const STABLE_BASKET_SYMBOLS = ['USDC', 'EURC', 'USDT', 'WUSDC'] as const;

export const STABLE_TOKEN_INDEX_MAP: Record<string, number> = {
  [USDC_ADDR.toLowerCase()]: 0,
  [EURC_ADDR.toLowerCase()]: 1,
  [USDT_ADDR.toLowerCase()]: 2,
  [WUSDC_ADDR.toLowerCase()]: 3,
};

/**
 * Check if a token symbol is part of the stable basket.
 */
export function isStableBasketToken(symbol?: string): boolean {
  return !!symbol && (STABLE_BASKET_SYMBOLS as readonly string[]).includes(symbol);
}

/**
 * Get the StableSwap pool index for a given token address.
 * Returns -1 if the token is not supported.
 */
export function getStableTokenIndex(tokenAddress: string): number {
  if (!tokenAddress) return -1;
  const addr = tokenAddress.toLowerCase();
  return STABLE_TOKEN_INDEX_MAP[addr] ?? -1;
}
