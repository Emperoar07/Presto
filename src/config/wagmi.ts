import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import {
  baseSepolia,
} from 'wagmi/chains';
import { tempoModerato } from 'viem/chains';
import { fallback, http } from 'viem';
import { getTempoRpcUrls, getBaseSepoliaRpcUrls } from '@/lib/rpc';

const tempoRpcUrls = getTempoRpcUrls();
const baseSepoliaRpcUrls = getBaseSepoliaRpcUrls();

const tempoTransport =
  tempoRpcUrls.length > 1
    ? fallback(tempoRpcUrls.map((url) => http(url, { timeout: 8000 })))
    : http(tempoRpcUrls[0] ?? tempoModerato.rpcUrls.default.http[0], { timeout: 8000 });

const baseSepoliaTransport =
  baseSepoliaRpcUrls.length > 1
    ? fallback(baseSepoliaRpcUrls.map((url) => http(url, { timeout: 8000 })))
    : http(baseSepoliaRpcUrls[0] ?? baseSepolia.rpcUrls.default.http[0], { timeout: 8000 });

export const config = getDefaultConfig({
  appName: 'Tempo Mini DEX',
  projectId: '3a8170812b534d0ff9d794f19a901d64', // Placeholder Project ID
  chains: [tempoModerato, baseSepolia],
  ssr: true, // If your dApp uses server side rendering (SSR)
  transports: {
    [tempoModerato.id]: tempoTransport,
    [baseSepolia.id]: baseSepoliaTransport,
  },
});
