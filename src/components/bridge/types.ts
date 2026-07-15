export type BridgeNetworkKey =
  | 'arc'
  | 'ethereum-sepolia'
  | 'base-sepolia'
  | 'avalanche-fuji'
  | 'arbitrum-sepolia'
  | 'optimism-sepolia';

export type EstimateFee = {
  type: 'kit' | 'provider' | 'forwarder';
  token: 'USDC';
  amount: string | null;
  error?: unknown;
};

export type EstimateGasFee = {
  name: string;
  token: string;
  blockchain: string;
  fees: {
    fee: string;
  } | null;
  error?: unknown;
};

export type EstimateSummary = {
  amount: string;
  token: 'USDC';
  source: {
    address: string;
    chain: string;
  };
  destination: {
    address: string;
    chain: string;
  };
  fees: EstimateFee[];
  gasFees: EstimateGasFee[];
};

export type BridgeStep = {
  name?: string;
  action?: string;
  state?: string;
  txHash?: string;
};

export type BridgeSummary = {
  amount: string;
  state: 'pending' | 'success' | 'error';
  provider: string;
  steps: BridgeStep[];
};

export type BridgeHistoryItem = {
  id: string;
  createdAt: number;
  amount: string;
  sourceKey: BridgeNetworkKey;
  destinationKey: BridgeNetworkKey;
  state: 'pending' | 'success' | 'error';
  steps: BridgeStep[];
  sourceTxHash?: string | null;
  errorMessage?: string | null;
  liveState?: 'pending' | 'success' | 'error';
  liveClaimable?: boolean;
  liveNote?: string | null;
  /** Serialized BridgeResult for kit.retry() — only stored for non-success items */
  rawResult?: Record<string, unknown> | null;
};

export type EvmInjectedProvider = import('viem').EIP1193Provider & {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
};

export type BalanceState = {
  amount: string | null;
  loading: boolean;
};

export type BridgeStatusCard = {
  state: 'pending' | 'success' | 'error';
  message: string;
};

export type NetworkConfig = {
  key: BridgeNetworkKey;
  label: string;
  shortLabel: string;
  bridgeChain: 'Arc_Testnet' | 'Ethereum_Sepolia' | 'Base_Sepolia' | 'Avalanche_Fuji' | 'Arbitrum_Sepolia' | 'Optimism_Sepolia';
  ecosystem: 'evm';
  chainId: number;
  helper: string;
};
