import { encodeFunctionData, erc20Abi, type Abi, type WalletClient } from 'viem';

/**
 * EIP-5792 batched calls.
 *
 * Lets us bundle an exact-amount `approve` + the action (swap / addLiquidity) into a
 * single wallet confirmation on wallets that support atomic batching (Coinbase Smart
 * Wallet, MetaMask Smart Accounts via EIP-7702, etc.). Wallets that don't support it
 * (plain MetaMask EOA) fall back to the existing sequential approve-then-action flow.
 *
 * No contract changes and no unlimited approvals — the approval stays exact-amount.
 */

export type BatchCall = { to: `0x${string}`; data: `0x${string}`; value?: bigint };

export function approveCall(token: `0x${string}`, spender: `0x${string}`, amount: bigint): BatchCall {
  return {
    to: token,
    data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, amount] }),
  };
}

export function contractCall(
  to: `0x${string}`,
  abi: Abi,
  functionName: string,
  args: readonly unknown[],
): BatchCall {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { to, data: encodeFunctionData({ abi, functionName, args } as any) };
}

/** True when the connected wallet can execute an atomic batch on this chain. */
export async function walletSupportsAtomicBatch(
  walletClient: WalletClient,
  account: `0x${string}`,
  chainId: number,
): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caps = (await (walletClient as any).getCapabilities({ account, chainId })) as
      | { atomic?: { status?: string } }
      | undefined;
    const status = caps?.atomic?.status;
    return status === 'supported' || status === 'ready';
  } catch {
    return false;
  }
}

/**
 * Send a batch of calls atomically (one confirmation) and resolve to the final tx hash.
 * Only call this after `walletSupportsAtomicBatch` returned true.
 */
export async function sendAtomicBatch(
  walletClient: WalletClient,
  account: `0x${string}`,
  calls: BatchCall[],
): Promise<`0x${string}`> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wc = walletClient as any;
  const { id } = await wc.sendCalls({ account, chain: null, calls, forceAtomic: true });
  const { receipts } = await wc.waitForCallsStatus({ id });
  const hash = receipts?.[receipts.length - 1]?.transactionHash as `0x${string}` | undefined;
  if (!hash) throw new Error('Batched calls returned no transaction hash');
  return hash;
}
