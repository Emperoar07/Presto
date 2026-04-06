'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Address } from 'viem';
import type { BridgeNetworkKey, BridgeHistoryItem, BridgeSummary } from './types';
import {
  BRIDGE_HISTORY_STORAGE_KEY,
  CCTP_DOMAIN_IDS,
  SOLANA_DEVNET_RPC_URL,
  NETWORKS,
  evmBridgeClients,
  isValidBridgeHistoryItem,
} from './constants';

// ---------------------------------------------------------------------------
// Reconciliation helpers
// ---------------------------------------------------------------------------

async function fetchCircleAttestationState(sourceKey: BridgeNetworkKey, burnTxHash: string) {
  const domain = CCTP_DOMAIN_IDS[sourceKey];
  const response = await fetch(
    `https://iris-api-sandbox.circle.com/v2/messages/${domain}?transactionHash=${burnTxHash}`,
  );

  if (response.status === 404) {
    return { available: false, complete: false };
  }

  if (!response.ok) {
    throw new Error(`Could not reconcile attestation state (${response.status}).`);
  }

  const payload = (await response.json()) as {
    messages?: Array<{ status?: string; attestation?: string }>;
  };

  const firstMessage = payload.messages?.[0];

  return {
    available: Boolean(firstMessage),
    complete:
      Boolean(firstMessage?.attestation) ||
      String(firstMessage?.status ?? '').toLowerCase().includes('complete'),
  };
}

async function getEvmReceiptState(
  networkKey: Exclude<BridgeNetworkKey, 'solana-devnet'>,
  txHash: string,
) {
  const client = evmBridgeClients[networkKey];
  if (!client) return { confirmed: false, failed: false };

  try {
    const receipt = await client.getTransactionReceipt({ hash: txHash as Address });
    return {
      confirmed: receipt.status === 'success',
      failed: receipt.status === 'reverted',
    };
  } catch {
    return { confirmed: false, failed: false };
  }
}

async function getSolanaReceiptState(signature: string) {
  try {
    const response = await fetch(SOLANA_DEVNET_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignatureStatuses',
        params: [[signature], { searchTransactionHistory: true }],
      }),
    });

    if (!response.ok) return { confirmed: false, failed: false };

    const payload = (await response.json()) as {
      result?: {
        value?: Array<{
          confirmationStatus?: string | null;
          err?: unknown;
        } | null>;
      };
    };

    const status = payload.result?.value?.[0];
    if (!status) return { confirmed: false, failed: false };

    return {
      confirmed:
        status.confirmationStatus === 'confirmed' ||
        status.confirmationStatus === 'finalized',
      failed: Boolean(status.err),
    };
  } catch {
    return { confirmed: false, failed: false };
  }
}

async function getTransactionState(networkKey: BridgeNetworkKey, txHash: string) {
  if (networkKey === 'solana-devnet') return getSolanaReceiptState(txHash);
  return getEvmReceiptState(networkKey, txHash);
}

function findStepTxHash(item: BridgeHistoryItem, stepName: string) {
  return item.steps.find((step) => {
    const normalized = String(step.name ?? step.action ?? '').toLowerCase();
    return normalized.includes(stepName.toLowerCase()) && step.txHash;
  })?.txHash;
}

export async function reconcileBridgeHistoryItem(
  item: BridgeHistoryItem,
): Promise<BridgeHistoryItem> {
  const mintHash = findStepTxHash(item, 'mint');
  const burnHash = findStepTxHash(item, 'burn') ?? item.sourceTxHash ?? null;

  if (mintHash) {
    const mintState = await getTransactionState(item.destinationKey, mintHash);
    if (mintState.confirmed) {
      return { ...item, liveState: 'success', liveNote: 'Mint confirmed on the destination chain.' };
    }
    if (mintState.failed) {
      return { ...item, liveState: 'error', liveNote: 'Mint failed on the destination chain.' };
    }
  }

  if (item.state === 'error') {
    return {
      ...item,
      liveState: 'error',
      liveNote: item.errorMessage ?? item.liveNote ?? 'Bridge execution failed.',
    };
  }

  if (burnHash) {
    const burnState = await getTransactionState(item.sourceKey, burnHash);
    if (burnState.failed) {
      return { ...item, liveState: 'error', liveNote: 'Burn failed on the source chain.' };
    }

    if (burnState.confirmed) {
      try {
        const attestationState = await fetchCircleAttestationState(item.sourceKey, burnHash);
        return {
          ...item,
          liveState: 'pending',
          liveNote: attestationState.available
            ? attestationState.complete
              ? 'Attestation is ready. Waiting for mint confirmation.'
              : 'Attestation located. Waiting for mint completion.'
            : 'Burn confirmed. Waiting for attestation.',
        };
      } catch {
        return {
          ...item,
          liveState: 'pending',
          liveNote: 'Burn confirmed. Waiting for attestation or mint confirmation.',
        };
      }
    }
  }

  return { ...item, liveState: 'pending', liveNote: item.liveNote ?? 'Bridge is still pending.' };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useBridgeHistory(deps: {
  buildBridgeKit: () => Promise<{ kit: any }>;
  createAdapterFor: (networkKey: BridgeNetworkKey) => Promise<unknown>;
  onBalanceRefresh: () => void;
}) {
  const { buildBridgeKit, createAdapterFor, onBalanceRefresh } = deps;

  const [bridgeHistory, setBridgeHistory] = useState<BridgeHistoryItem[]>([]);
  const [claimingItemId, setClaimingItemId] = useState<string | null>(null);

  // Track which items are being auto-claimed to prevent duplicate attempts.
  const autoClaimingRef = useRef<Set<string>>(new Set());

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(BRIDGE_HISTORY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown[];
      if (Array.isArray(parsed)) {
        setBridgeHistory(parsed.filter(isValidBridgeHistoryItem));
      }
    } catch {
      // Ignore malformed local history.
    }
  }, []);

  const persistBridgeHistory = useCallback((next: BridgeHistoryItem[]) => {
    setBridgeHistory(next);
    try {
      localStorage.setItem(BRIDGE_HISTORY_STORAGE_KEY, JSON.stringify(next.slice(0, 20)));
    } catch {
      // Ignore storage errors.
    }
  }, []);

  const upsertBridgeHistory = useCallback((item: BridgeHistoryItem) => {
    setBridgeHistory((current) => {
      const next = [item, ...current.filter((existing) => existing.id !== item.id)].slice(0, 20);
      try {
        localStorage.setItem(BRIDGE_HISTORY_STORAGE_KEY, JSON.stringify(next, (_k, v) => typeof v === 'bigint' ? v.toString() : v));
      } catch {
        // Ignore storage errors.
      }
      return next;
    });
  }, []);

  // Claim via kit.retry() — used by both auto-claim and manual claim
  const executeRetry = useCallback(async (item: BridgeHistoryItem) => {
    if (!item.rawResult) return;
    console.log('[bridge-retry] Building kit and adapters for', item.sourceKey, '→', item.destinationKey);

    const [{ kit }, fromAdapter, toAdapter] = await Promise.all([
      buildBridgeKit(),
      createAdapterFor(item.sourceKey),
      createAdapterFor(item.destinationKey),
    ]);
    console.log('[bridge-retry] Adapters created. Calling kit.retry()...');

    // RetryContext expects adapters directly, not { adapter, chain } wrappers.
    // For forwarder destinations (EVM), pass `to: undefined` so the SDK uses
    // Circle's Orbit relayer for the mint. For Solana, pass the adapter.
    const retryResult = (await kit.retry(item.rawResult, {
      from: fromAdapter,
      to: NETWORKS[item.destinationKey].ecosystem === 'solana' ? toAdapter : undefined,
    })) as BridgeSummary;
    try { console.log('[bridge-retry] kit.retry() returned:', JSON.parse(JSON.stringify(retryResult, (_k, v) => typeof v === 'bigint' ? v.toString() : v))); } catch { console.log('[bridge-retry] kit.retry() returned:', retryResult); }
    if (Array.isArray((retryResult as any).steps)) {
      (retryResult as any).steps.forEach((step: any, i: number) => {
        try { console.log(`[bridge-retry] step[${i}]:`, JSON.parse(JSON.stringify(step, (_k: string, v: unknown) => typeof v === 'bigint' ? v.toString() : v))); } catch { console.log(`[bridge-retry] step[${i}]:`, step); }
        if (step.state === 'error') {
          const err = step.error;
          if (err) {
            const flat: Record<string, unknown> = {};
            for (const k of Object.getOwnPropertyNames(err)) { try { flat[k] = (err as any)[k]; } catch {} }
            for (const k of Object.keys(err)) { try { flat[k] = (err as any)[k]; } catch {} }
            try { console.error(`[bridge-retry] step[${i}] ERROR:`, JSON.parse(JSON.stringify(flat, (_k: string, v: unknown) => typeof v === 'bigint' ? v.toString() : v))); } catch { console.error(`[bridge-retry] step[${i}] ERROR (raw):`, err); }
            if (err.cause) console.error(`[bridge-retry] step[${i}] cause:`, err.cause);
            if ((err as any).logs) console.error(`[bridge-retry] step[${i}] logs:`, (err as any).logs);
            if ((err as any).context) console.error(`[bridge-retry] step[${i}] context:`, (err as any).context);
          }
          console.error(`[bridge-retry] step[${i}] errorMessage:`, step.errorMessage);
        }
      });
    }

    upsertBridgeHistory({
      ...item,
      state: retryResult.state,
      steps: retryResult.steps ?? item.steps,
      liveState: retryResult.state === 'success' ? 'success' : 'pending',
      liveNote:
        retryResult.state === 'success'
          ? 'Claim completed successfully.'
          : 'Retry submitted. Waiting for confirmation.',
      rawResult:
        retryResult.state === 'success'
          ? null
          : (retryResult as unknown as Record<string, unknown>),
      errorMessage: null,
    });

    if (retryResult.state === 'success') {
      onBalanceRefresh();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildBridgeKit, createAdapterFor, onBalanceRefresh, upsertBridgeHistory]);

  // Manual claim handler (for the button in the history panel)
  async function handleManualClaim(item: BridgeHistoryItem) {
    if (!item.rawResult || claimingItemId) return;

    try {
      setClaimingItemId(item.id);
      await executeRetry(item);
    } catch (error) {
      upsertBridgeHistory({
        ...item,
        liveState: 'error',
        liveNote: `Claim failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setClaimingItemId(null);
    }
  }

  // Reconciliation polling — now also auto-claims when attestation is ready
  const bridgeHistoryRef = useRef(bridgeHistory);
  bridgeHistoryRef.current = bridgeHistory;

  useEffect(() => {
    const hasPending = bridgeHistoryRef.current.some(
      (item) => item.state === 'pending' || item.liveState === 'pending' || item.liveClaimable,
    );
    if (!bridgeHistoryRef.current.length) return;

    let cancelled = false;

    const runReconciliation = async () => {
      const snapshot = bridgeHistoryRef.current;
      if (!snapshot.length) return;
      const activeItems = snapshot.filter(
        (item) => item.state === 'pending' || item.liveState === 'pending' || item.liveClaimable,
      );
      if (!activeItems.length) return;

      const reconciledItems = await Promise.all(activeItems.map((item) => reconcileBridgeHistoryItem(item)));
      if (cancelled) return;

      const reconciledMap = new Map(reconciledItems.map((item) => [item.id, item]));
      const next = snapshot.map((item) => reconciledMap.get(item.id) ?? item);

      const changed = snapshot.some((item, index) => {
        const updated = next[index];
        return updated.liveState !== item.liveState || updated.liveNote !== item.liveNote || updated.liveClaimable !== item.liveClaimable;
      });

      if (changed) {
        persistBridgeHistory(next);
      }

      // Auto-claim: for items where attestation is ready but no mint has
      // happened yet, automatically complete the bridge.
      for (const item of reconciledItems) {
        if (
          item.liveClaimable &&
          item.liveState === 'pending' &&
          item.state !== 'error' &&
          !findStepTxHash(item, 'mint') &&
          !autoClaimingRef.current.has(item.id)
        ) {
          autoClaimingRef.current.add(item.id);
          void (async () => {
            try {
              if (item.rawResult) {
                await executeRetry(item);
              }
              // Items without rawResult cannot be auto-claimed — user must retry manually.
            } catch {
              // Auto-claim failed silently — user can still use manual claim.
            } finally {
              autoClaimingRef.current.delete(item.id);
            }
          })();
        }
      }
    };

    void runReconciliation();

    if (!hasPending) return;

    const intervalId = window.setInterval(() => {
      if (!cancelled) void runReconciliation();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgeHistory.length, persistBridgeHistory, executeRetry]);

  return {
    bridgeHistory,
    upsertBridgeHistory,
    persistBridgeHistory,
    claimingItemId,
    handleManualClaim,
  };
}
