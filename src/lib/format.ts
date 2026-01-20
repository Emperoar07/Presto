import { formatUnits } from 'viem';

type CacheKey = string;
const formatCache = new Map<CacheKey, string>();

const toCacheKey = (value: bigint, decimals: number) => `${value.toString()}:${decimals}`;

const cacheGet = (key: CacheKey) => formatCache.get(key);
const cacheSet = (key: CacheKey, value: string) => {
  formatCache.set(key, value);
  if (formatCache.size > 10000) {
    formatCache.clear();
  }
};

export const formatUnitsCached = (value: bigint, decimals: number) => {
  const key = toCacheKey(value, decimals);
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;
  const formatted = formatUnits(value, decimals);
  cacheSet(key, formatted);
  return formatted;
};

export const formatUnitsFixed = (value: bigint, decimals: number, fractionDigits = 4) => {
  const formatted = formatUnitsCached(value, decimals);
  const [whole, fraction = ''] = formatted.split('.');
  if (fraction.length === 0) return `${whole}.${'0'.repeat(fractionDigits)}`;
  if (fraction.length >= fractionDigits) return `${whole}.${fraction.slice(0, fractionDigits)}`;
  return `${whole}.${fraction.padEnd(fractionDigits, '0')}`;
};
