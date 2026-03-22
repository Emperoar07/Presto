import { createPublicClient, http } from 'viem';
import { baseSepolia, sepolia } from 'wagmi/chains';
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
  'solana-devnet': {
    key: 'solana-devnet',
    label: 'Solana Devnet',
    shortLabel: 'Solana',
    bridgeChain: 'Solana_Devnet',
    ecosystem: 'solana',
    helper: 'Requires a Solana wallet like Phantom when Solana is the source chain.',
  },
};

export const BRIDGE_NETWORKS: BridgeNetworkKey[] = [
  'arc',
  'ethereum-sepolia',
  'base-sepolia',
  'solana-devnet',
];

// ---------------------------------------------------------------------------
// Addresses & domains
// ---------------------------------------------------------------------------

export const BRIDGE_USDC_ADDRESSES: Record<BridgeNetworkKey, string> = {
  arc: '0x3600000000000000000000000000000000000000',
  'ethereum-sepolia': '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  'solana-devnet': '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
};

export const CCTP_DOMAIN_IDS: Record<BridgeNetworkKey, number> = {
  arc: 26,
  'ethereum-sepolia': 0,
  'base-sepolia': 6,
  'solana-devnet': 5,
};

// ---------------------------------------------------------------------------
// RPC / transport
// ---------------------------------------------------------------------------

export const SOLANA_DEVNET_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com';

export const AUTO_ESTIMATE_COOLDOWN_MS = 30_000;
export const BRIDGE_HISTORY_STORAGE_KEY = 'prestodex-bridge-history';

// ---------------------------------------------------------------------------
// EVM network params (for wallet_addEthereumChain)
// ---------------------------------------------------------------------------

export const EVM_NETWORK_PARAMS: Partial<
  Record<
    Exclude<BridgeNetworkKey, 'solana-devnet'>,
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
    value === 'solana-devnet'
  );
}

export function isValidEvmAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export function isValidSolanaAddress(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

const EVM_TX_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const SOLANA_SIG_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;

export function isValidTxHash(hash: unknown, networkKey: BridgeNetworkKey): boolean {
  if (typeof hash !== 'string') return false;
  return networkKey === 'solana-devnet'
    ? SOLANA_SIG_PATTERN.test(hash)
    : EVM_TX_HASH_PATTERN.test(hash);
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
  if (networkKey === 'solana-devnet') return 'https://explorer.solana.com/tx/';
  return '';
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
  sourceEcosystem: 'evm' | 'solana',
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
    return sourceEcosystem === 'solana' ? 'PREPARING TRANSFER' : 'APPROVING USDC';
  }
  if (latestEvent.includes('burn')) return 'BURNING USDC';
  if (latestEvent.includes('fetchattestation')) return 'FETCHING ATTESTATION';
  if (latestEvent.includes('mint')) return 'MINTING USDC';
  if (latestEvent.includes('bridge')) return 'PREPARING BRIDGE';
  return 'BRIDGING USDC';
}
