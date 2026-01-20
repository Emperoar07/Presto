import { baseSepolia, hardhat } from 'viem/chains';
import { tempoModerato } from 'viem/chains';

const FALLBACK_EXPLORER = 'https://scan.moderato.tempo.xyz';

const normalizeBase = (base: string) => base.replace(/\/+$/, '');

export const getExplorerBaseUrl = (chainId?: number) => {
  if (!chainId) return FALLBACK_EXPLORER;
  if (chainId === tempoModerato.id) {
    return tempoModerato.blockExplorers?.default.url ?? FALLBACK_EXPLORER;
  }
  if (chainId === baseSepolia.id) {
    return baseSepolia.blockExplorers?.default.url ?? FALLBACK_EXPLORER;
  }
  if (chainId === hardhat.id) {
    return FALLBACK_EXPLORER;
  }
  return FALLBACK_EXPLORER;
};

export const getExplorerTxUrl = (chainId: number | undefined, hash: string) => {
  if (!hash) return '';
  const base = normalizeBase(getExplorerBaseUrl(chainId));
  return `${base}/tx/${hash}`;
};
