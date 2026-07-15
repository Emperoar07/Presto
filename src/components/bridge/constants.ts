import { createPublicClient, http } from 'viem';
import { arbitrumSepolia, avalancheFuji, baseSepolia, optimismSepolia, sepolia } from 'wagmi/chains';
import { arcTestnet } from '@/config/wagmi';
import { getArcTestnetRpcUrls, getBaseSepoliaRpcUrls } from '@/lib/rpc';
import type {
  BridgeNetworkKey,
  BridgeHistoryItem,
  BridgeSummary,
  BalanceState,
  EvmInjectedProvider,
  NetworkConfig,
} from './types';

// ---------------------------------------------------------------------------
// Network definitions
// ---------------------------------------------------------------------------

export const NETWORKS: Record<BridgeNetworkKey, NetworkConfig> = {
  arc: {
    key: 'arc',
    label: 'Arc Testnet',
    shortLabel: 'Arc',
    bridgeChain: 'Arc_Testnet',
    ecosystem: 'evm',
    chainId: arcTestnet.id,
    helper: 'Use Arc as the pinned hub side for all bridge routes on this page.',
  },
  'ethereum-sepolia': {
    key: 'ethereum-sepolia',
    label: 'Ethereum Sepolia',
    shortLabel: 'Sepolia',
    bridgeChain: 'Ethereum_Sepolia',
    ecosystem: 'evm',
    chainId: 11155111,
    helper: 'Good for testing standard EVM-to-Arc USDC bridging with a single wallet flow.',
  },
  'base-sepolia': {
    key: 'base-sepolia',
    label: 'Base Sepolia',
    shortLabel: 'Base',
    bridgeChain: 'Base_Sepolia',
    ecosystem: 'evm',
    chainId: baseSepolia.id,
    helper: 'Uses the same EVM wallet path as Arc, with cheaper test routing on Base.',
  },
  'avalanche-fuji': {
    key: 'avalanche-fuji',
    label: 'Avalanche Fuji',
    shortLabel: 'Fuji',
    bridgeChain: 'Avalanche_Fuji',
    ecosystem: 'evm',
    chainId: avalancheFuji.id,
    helper: 'Uses native USDC on Avalanche Fuji through Circle CCTP V2.',
  },
  'arbitrum-sepolia': {
    key: 'arbitrum-sepolia',
    label: 'Arbitrum Sepolia',
    shortLabel: 'Arbitrum',
    bridgeChain: 'Arbitrum_Sepolia',
    ecosystem: 'evm',
    chainId: arbitrumSepolia.id,
    helper: 'Uses native USDC on Arbitrum Sepolia through Circle CCTP V2.',
  },
  'optimism-sepolia': {
    key: 'optimism-sepolia',
    label: 'Optimism Sepolia',
    shortLabel: 'Optimism',
    bridgeChain: 'Optimism_Sepolia',
    ecosystem: 'evm',
    chainId: optimismSepolia.id,
    helper: 'Uses native USDC on Optimism Sepolia through Circle CCTP V2.',
  },
};

export const BRIDGE_NETWORKS: BridgeNetworkKey[] = [
  'arc',
  'ethereum-sepolia',
  'base-sepolia',
  'avalanche-fuji',
  'arbitrum-sepolia',
  'optimism-sepolia',
];

// ---------------------------------------------------------------------------
// Addresses & domains
// ---------------------------------------------------------------------------

export const BRIDGE_USDC_ADDRESSES: Record<BridgeNetworkKey, string> = {
  arc: '0x3600000000000000000000000000000000000000',
  'ethereum-sepolia': '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  'avalanche-fuji': '0x5425890298aed601595a70AB815c96711a31Bc65',
  'arbitrum-sepolia': '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
  'optimism-sepolia': '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
};

export const CCTP_DOMAIN_IDS: Record<BridgeNetworkKey, number> = {
  arc: 26,
  'ethereum-sepolia': 0,
  'base-sepolia': 6,
  'avalanche-fuji': 1,
  'arbitrum-sepolia': 3,
  'optimism-sepolia': 2,
};

// ---------------------------------------------------------------------------
// RPC / transport
// ---------------------------------------------------------------------------

export const AUTO_ESTIMATE_COOLDOWN_MS = 30_000;
export const BRIDGE_HISTORY_STORAGE_KEY = 'prestodex-bridge-history';

// ---------------------------------------------------------------------------
// EVM network params (for wallet_addEthereumChain)
// ---------------------------------------------------------------------------

export const EVM_NETWORK_PARAMS: Partial<
  Record<
    BridgeNetworkKey,
    {
      chainId: `0x${string}`;
      chainName: string;
      nativeCurrency: { name: string; symbol: string; decimals: number };
      rpcUrls: string[];
      blockExplorerUrls: string[];
    }
  >
> = {
  arc: {
    chainId: '0x4cef52',
    chainName: 'Arc Testnet',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: getArcTestnetRpcUrls(),
    blockExplorerUrls: ['https://testnet.arcscan.app'],
  },
  'ethereum-sepolia': {
    chainId: '0xaa36a7',
    chainName: 'Ethereum Sepolia',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: [...sepolia.rpcUrls.default.http],
    blockExplorerUrls: ['https://sepolia.etherscan.io'],
  },
  'base-sepolia': {
    chainId: '0x14a34',
    chainName: 'Base Sepolia',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: getBaseSepoliaRpcUrls().length
      ? getBaseSepoliaRpcUrls()
      : Array.from(baseSepolia.rpcUrls.default.http),
    blockExplorerUrls: ['https://sepolia.basescan.org'],
  },
  'avalanche-fuji': {
    chainId: '0xa869',
    chainName: 'Avalanche Fuji',
    nativeCurrency: avalancheFuji.nativeCurrency,
    rpcUrls: [...avalancheFuji.rpcUrls.default.http],
    blockExplorerUrls: [avalancheFuji.blockExplorers.default.url],
  },
  'arbitrum-sepolia': {
    chainId: '0x66eee',
    chainName: 'Arbitrum Sepolia',
    nativeCurrency: arbitrumSepolia.nativeCurrency,
    rpcUrls: [...arbitrumSepolia.rpcUrls.default.http],
    blockExplorerUrls: [arbitrumSepolia.blockExplorers.default.url],
  },
  'optimism-sepolia': {
    chainId: '0xaa37dc',
    chainName: 'Optimism Sepolia',
    nativeCurrency: optimismSepolia.nativeCurrency,
    rpcUrls: [...optimismSepolia.rpcUrls.default.http],
    blockExplorerUrls: [optimismSepolia.blockExplorers.default.url],
  },
};

// ---------------------------------------------------------------------------
// Public clients for balance / receipt queries
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const evmBridgeClients: Record<string, any> = {
  arc: createPublicClient({
    chain: arcTestnet,
    transport: http(
      getArcTestnetRpcUrls()[0] ?? arcTestnet.rpcUrls.default.http[0],
      { timeout: 8000 },
    ),
  }),
  'ethereum-sepolia': createPublicClient({
    chain: sepolia,
    transport: http(sepolia.rpcUrls.default.http[0], { timeout: 8000 }),
  }),
  'base-sepolia': createPublicClient({
    chain: baseSepolia,
    transport: http(
      getBaseSepoliaRpcUrls()[0] ?? baseSepolia.rpcUrls.default.http[0],
      { timeout: 8000 },
    ),
  }),
  'avalanche-fuji': createPublicClient({
    chain: avalancheFuji,
    transport: http(avalancheFuji.rpcUrls.default.http[0], { timeout: 8000 }),
  }),
  'arbitrum-sepolia': createPublicClient({
    chain: arbitrumSepolia,
    transport: http(arbitrumSepolia.rpcUrls.default.http[0], { timeout: 8000 }),
  }),
  'optimism-sepolia': createPublicClient({
    chain: optimismSepolia,
    transport: http(optimismSepolia.rpcUrls.default.http[0], { timeout: 8000 }),
  }),
};

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_AMOUNT_PATTERN = /^\d*\.?\d{0,6}$/;
const MAX_BRIDGE_AMOUNT = 1_000_000;

export function sanitizeBridgeAmount(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (!VALID_AMOUNT_PATTERN.test(trimmed)) return '';
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric) || numeric < 0) return '';
  if (numeric > MAX_BRIDGE_AMOUNT) return String(MAX_BRIDGE_AMOUNT);
  return trimmed;
}

export function isBridgeNetworkKey(value: string | null): value is BridgeNetworkKey {
  return (
    value === 'arc' ||
    value === 'ethereum-sepolia' ||
    value === 'base-sepolia' ||
    value === 'avalanche-fuji' ||
    value === 'arbitrum-sepolia' ||
    value === 'optimism-sepolia'
  );
}

export function isValidEvmAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

const EVM_TX_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;

export function isValidTxHash(hash: unknown, _networkKey: BridgeNetworkKey): boolean {
  if (typeof hash !== 'string') return false;
  return EVM_TX_HASH_PATTERN.test(hash);
}

export function isValidBridgeHistoryItem(item: unknown): item is BridgeHistoryItem {
  if (!item || typeof item !== 'object') return false;
  const record = item as Record<string, unknown>;
  if (typeof record.id !== 'string') return false;
  if (typeof record.createdAt !== 'number') return false;
  if (typeof record.amount !== 'string') return false;
  if (!isBridgeNetworkKey(record.sourceKey as string)) return false;
  if (!isBridgeNetworkKey(record.destinationKey as string)) return false;
  if (record.state !== 'pending' && record.state !== 'success' && record.state !== 'error')
    return false;
  if (!Array.isArray(record.steps)) return false;
  for (const step of record.steps) {
    if (step && typeof step === 'object' && 'txHash' in step && step.txHash) {
      if (
        !isValidTxHash(step.txHash, record.sourceKey as BridgeNetworkKey) &&
        !isValidTxHash(step.txHash, record.destinationKey as BridgeNetworkKey)
      ) {
        return false;
      }
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const REMOVE_DECIMALS_PATTERN = /(?:\.0+|(\.\d+?)0+)$/;

export function compactAmount(value?: string | null, digits = 4) {
  if (!value) return '--';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return numeric.toFixed(digits).replace(REMOVE_DECIMALS_PATTERN, '$1');
}

export function formatTokenAmount(value?: string | null, digits = 4) {
  if (!value) return '--';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function formatUsd(value?: string | null) {
  if (!value) return '--';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: numeric >= 1 ? 2 : 4,
    maximumFractionDigits: numeric >= 1 ? 2 : 4,
  }).format(numeric);
}

export function formatBalanceLabel(balance: BalanceState) {
  if (balance.loading) return 'Loading...';
  if (!balance.amount) return '--';
  return `${formatTokenAmount(balance.amount, 4)} USDC`;
}

export function getExplorerBase(networkKey: BridgeNetworkKey) {
  if (networkKey === 'arc') return 'https://testnet.arcscan.app/tx/';
  if (networkKey === 'ethereum-sepolia') return 'https://sepolia.etherscan.io/tx/';
  if (networkKey === 'base-sepolia') return 'https://sepolia.basescan.org/tx/';
  if (networkKey === 'avalanche-fuji') return 'https://testnet.snowtrace.io/tx/';
  if (networkKey === 'arbitrum-sepolia') return 'https://sepolia.arbiscan.io/tx/';
  if (networkKey === 'optimism-sepolia') return 'https://sepolia-optimism.etherscan.io/tx/';
  return '';
}

export function getTransferSpeed(networkKey: BridgeNetworkKey): 'FAST' | 'SLOW' {
  return networkKey === 'arc' || networkKey === 'avalanche-fuji' ? 'SLOW' : 'FAST';
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

export function getInjectedEvmProvider(): EvmInjectedProvider | null {
  if (typeof window === 'undefined') return null;
  return (window as Window & { ethereum?: EvmInjectedProvider }).ethereum ?? null;
}

export function getEvmProviderFromConnector(
  connectorClient: { transport?: { value?: unknown } } | undefined,
): EvmInjectedProvider | null {
  const transport = connectorClient?.transport?.value;
  if (transport && typeof transport === 'object' && 'request' in transport) {
    return transport as EvmInjectedProvider;
  }
  return null;
}

export async function resolveEvmProvider(
  connector: { getProvider?: () => Promise<unknown> } | undefined,
  connectorClient: { transport?: { value?: unknown } } | undefined,
  injectedProvider: EvmInjectedProvider | null = getInjectedEvmProvider(),
): Promise<EvmInjectedProvider | null> {
  try {
    const provider = await connector?.getProvider?.();
    if (provider && typeof provider === 'object' && 'request' in provider) {
      return provider as EvmInjectedProvider;
    }
  } catch {
    // A connector may be rebuilding after a chain switch; use the next live source.
  }

  return getEvmProviderFromConnector(connectorClient) ?? injectedProvider;
}

export function parseChainId(value: unknown) {
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 16);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

export function getBridgeActionLabel(
  eventLog: string[],
  bridgeResult: BridgeSummary | null,
  _sourceEcosystem: 'evm',
) {
  const pendingStep = bridgeResult?.steps?.find((step) => step.state !== 'success');
  const latestEvent =
    [...eventLog]
      .reverse()
      .find(Boolean)
      ?.toLowerCase() ??
    (pendingStep ? (pendingStep.name ?? pendingStep.action ?? '').toLowerCase() : '') ??
    '';

  if (latestEvent.includes('approve')) {
    return 'APPROVING USDC (CCTP)';
  }
  if (latestEvent.includes('burn')) return 'BURNING USDC';
  if (latestEvent.includes('fetchattestation')) return 'FETCHING ATTESTATION';
  if (latestEvent.includes('mint')) return 'MINTING USDC';
  if (latestEvent.includes('bridge')) return 'PREPARING BRIDGE';
  return 'BRIDGING USDC';
}
