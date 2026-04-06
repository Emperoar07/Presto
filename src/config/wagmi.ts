import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  metaMaskWallet,
  rabbyWallet,
  zerionWallet,
  coinbaseWallet,
  walletConnectWallet,
  injectedWallet,
  trustWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { createConfig } from 'wagmi';
import {
  baseSepolia,
  sepolia,
} from 'wagmi/chains';
import { tempoModerato } from 'viem/chains';
import { defineChain, fallback, http } from 'viem';
import { getTempoRpcUrls, getBaseSepoliaRpcUrls, getArcTestnetRpcUrls } from '@/lib/rpc';

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.network'] },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' },
  },
  testnet: true,
});

const tempoRpcUrls = getTempoRpcUrls();
const baseSepoliaRpcUrls = getBaseSepoliaRpcUrls();
const arcTestnetRpcUrls = getArcTestnetRpcUrls();

const tempoTransport =
  tempoRpcUrls.length > 1
    ? fallback(tempoRpcUrls.map((url) => http(url, { timeout: 8000 })))
    : http(tempoRpcUrls[0] ?? tempoModerato.rpcUrls.default.http[0], { timeout: 8000 });

const baseSepoliaTransport =
  baseSepoliaRpcUrls.length > 1
    ? fallback(baseSepoliaRpcUrls.map((url) => http(url, { timeout: 8000 })))
    : http(baseSepoliaRpcUrls[0] ?? baseSepolia.rpcUrls.default.http[0], { timeout: 8000 });

const arcTestnetTransport =
  arcTestnetRpcUrls.length > 1
    ? fallback(arcTestnetRpcUrls.map((url) => http(url, { timeout: 15_000, retryCount: 2 })))
    : http(arcTestnetRpcUrls[0], { timeout: 15_000, retryCount: 2 });

const projectId = '3a8170812b534d0ff9d794f19a901d64';

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Popular',
      wallets: [
        metaMaskWallet,
        rabbyWallet,
        zerionWallet,
        coinbaseWallet,
        trustWallet,
      ],
    },
    {
      groupName: 'More',
      wallets: [
        walletConnectWallet,
        injectedWallet,
      ],
    },
  ],
  {
    appName: 'Tempo Mini DEX',
    projectId,
  }
);

export const config = createConfig({
  connectors,
  chains: [arcTestnet, tempoModerato, baseSepolia, sepolia],
  ssr: true,
  transports: {
    [arcTestnet.id]: arcTestnetTransport,
    [tempoModerato.id]: tempoTransport,
    [baseSepolia.id]: baseSepoliaTransport,
    [sepolia.id]: http(sepolia.rpcUrls.default.http[0], { timeout: 8000 }),
  },
});
