import type { WalletClient } from 'viem';

export const SYNROUTE_ARC_CHAIN_ID = 5042002;

export type SynRouteApprovalMode = 'erc20' | 'permit2';

export type SynRouteQuote = {
  amountIn?: string;
  amountInDecimals?: string;
  amountOut?: string;
  amountOutDecimals: string;
  routeString?: string;
  priceImpact?: string | number;
};

export type SynRouteTransaction = {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: string;
  gasLimit?: string;
};

type TokenApproval = {
  needsApproval?: boolean;
  approveTransaction?: {
    to: `0x${string}`;
    data: `0x${string}`;
    value?: string;
  };
};

type Permit2Approval = {
  signatureRequired?: boolean;
  typedData?: {
    domain?: Record<string, unknown>;
    types?: Record<string, unknown>;
    primaryType?: string;
    message?: {
      details?: {
        amount?: string;
        expiration?: string;
        nonce?: string;
      };
      sigDeadline?: string;
      [key: string]: unknown;
    };
  };
};

export type SynRouteSwapBuild = {
  approval?: TokenApproval & {
    tokenApproval?: TokenApproval;
    permit2?: Permit2Approval;
  };
  transaction?: SynRouteTransaction;
};

type SynRouteBaseRequest = {
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  amount: string;
  tradeType?: 'EXACT_INPUT' | 'EXACT_OUTPUT';
};

type SynRouteSwapRequest = SynRouteBaseRequest & {
  sender: string;
  recipient: string;
  approvalMode: SynRouteApprovalMode;
  slippageBps: number;
  permit2Signature?: string;
  permit2Amount?: string;
  permit2Expiration?: string;
  permit2Nonce?: string;
  permit2SigDeadline?: string;
};

async function postSynRoute<T>(endpoint: 'quote' | 'swap', body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`/api/synroute/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : `SynRoute ${endpoint} failed (${response.status})`;
    throw new Error(message);
  }
  return data as T;
}

export function isSynRouteChain(chainId?: number) {
  return chainId === SYNROUTE_ARC_CHAIN_ID && process.env.NEXT_PUBLIC_SYNROUTE_ENABLED !== 'false';
}

export function getSynRouteApprovalMode(): SynRouteApprovalMode {
  return process.env.NEXT_PUBLIC_SYNROUTE_APPROVAL_MODE === 'permit2' ? 'permit2' : 'erc20';
}

export function toSlippageBps(slippagePercent: number) {
  return Math.max(0, Math.round(slippagePercent * 100));
}

export function getSynRouteQuote(request: SynRouteBaseRequest) {
  return postSynRoute<SynRouteQuote>('quote', {
    ...request,
    tradeType: request.tradeType ?? 'EXACT_INPUT',
  });
}

export function buildSynRouteSwap(request: SynRouteSwapRequest) {
  return postSynRoute<SynRouteSwapBuild>('swap', request);
}

export function toHexValue(value: unknown): `0x${string}` {
  const normalized = typeof value === 'string' && value !== '' ? value : '0';
  return `0x${BigInt(normalized).toString(16)}`;
}

export function toTransactionValue(value: unknown): bigint {
  const normalized = typeof value === 'string' && value !== '' ? value : '0';
  return BigInt(normalized);
}

export function arcGasHeadroom(gasLimit: unknown): bigint {
  const floor = 4_000_000n;
  const estimate = typeof gasLimit === 'string' && /^\d+$/.test(gasLimit)
    ? BigInt(gasLimit) * 2n
    : 0n;
  return estimate > floor ? estimate : floor;
}

export async function signPermit2(walletClient: WalletClient, account: `0x${string}`, permit2: Permit2Approval) {
  if (!permit2.typedData) throw new Error('Permit2 typed data is missing');

  const typedData = {
    ...permit2.typedData,
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      ...permit2.typedData.types,
    },
  };

  const transport = walletClient.transport as unknown as {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  };
  return transport.request({
    method: 'eth_signTypedData_v4',
    params: [account, JSON.stringify(typedData)],
  }) as Promise<string>;
}
