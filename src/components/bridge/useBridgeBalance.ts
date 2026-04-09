'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { erc20Abi } from 'viem';
import type { BridgeNetworkKey, BalanceState } from './types';
import {
  BRIDGE_USDC_ADDRESSES,
  NETWORKS,
  SOLANA_DEVNET_RPC_URL,
  evmBridgeClients,
} from './constants';
import { subscribePrestoDataRefresh } from '@/lib/appDataRefresh';

async function fetchEvmBalance(
  networkKey: BridgeNetworkKey,
  address: string,
): Promise<string> {
  const client = evmBridgeClients[networkKey];
  if (!client) return '0';

  const usdcAddress = BRIDGE_USDC_ADDRESSES[networkKey] as `0x${string}`;
  const raw = await client.readContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
  });
  // USDC has 6 decimals on EVM
  return (Number(raw) / 1e6).toString();
}

async function fetchSolanaBalance(address: string): Promise<string> {
  const mint = BRIDGE_USDC_ADDRESSES['solana-devnet'];
  const body = {
    jsonrpc: '2.0',
    id: 1,
    method: 'getTokenAccountsByOwner',
    params: [
      address,
      { mint },
      { encoding: 'jsonParsed' },
    ],
  };
  const resp = await fetch(SOLANA_DEVNET_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await resp.json();
  if (json?.error) {
    console.warn('[bridge-balance] Solana RPC error:', json.error);
    return '0';
  }
  const accounts = json?.result?.value;
  if (!Array.isArray(accounts) || accounts.length === 0) return '0';
  const info = accounts[0]?.account?.data?.parsed?.info?.tokenAmount;
  return info?.uiAmountString ?? '0';
}

async function fetchBalance(
  networkKey: BridgeNetworkKey,
  address: string,
): Promise<string> {
  if (!address) return '0';
  const network = NETWORKS[networkKey];
  if (network.ecosystem === 'solana') {
    return fetchSolanaBalance(address);
  }
  return fetchEvmBalance(networkKey, address);
}

export function useBridgeBalance(deps: {
  sourceKey: BridgeNetworkKey;
  destinationKey: BridgeNetworkKey;
  sourceAddress: string;
  resolvedDestinationAddress: string;
  sourceAddressIsValid: boolean;
  destinationAddressIsValid: boolean;
  /** When true, pause polling to avoid RPC rate-limit contention during bridge. */
  isBridging?: boolean;
}) {
  const {
    sourceKey,
    destinationKey,
    sourceAddress,
    resolvedDestinationAddress,
    sourceAddressIsValid,
    destinationAddressIsValid,
    isBridging = false,
  } = deps;

  const [sourceBalance, setSourceBalance] = useState<BalanceState>({
    amount: null,
    loading: false,
  });
  const [destinationBalance, setDestinationBalance] = useState<BalanceState>({
    amount: null,
    loading: false,
  });

  const refreshCountRef = useRef(0);
  const isBridgingRef = useRef(isBridging);
  isBridgingRef.current = isBridging;

  const refreshBalances = useCallback((options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    refreshCountRef.current += 1;
    const id = refreshCountRef.current;

    if (sourceAddressIsValid && sourceAddress) {
      if (!silent) setSourceBalance((prev) => ({ ...prev, loading: true }));
      fetchBalance(sourceKey, sourceAddress)
        .then((amount) => {
          if (refreshCountRef.current === id) {
            setSourceBalance({ amount, loading: false });
          }
        })
        .catch((err) => {
          console.warn('[bridge-balance] source fetch failed:', sourceKey, err);
          if (refreshCountRef.current === id) {
            setSourceBalance((prev) => ({ ...prev, loading: false }));
          }
        });
    }

    if (destinationAddressIsValid && resolvedDestinationAddress) {
      if (!silent) setDestinationBalance((prev) => ({ ...prev, loading: true }));
      fetchBalance(destinationKey, resolvedDestinationAddress)
        .then((amount) => {
          if (refreshCountRef.current === id) {
            setDestinationBalance({ amount, loading: false });
          }
        })
        .catch((err) => {
          console.warn('[bridge-balance] destination fetch failed:', destinationKey, err);
          if (refreshCountRef.current === id) {
            setDestinationBalance((prev) => ({ ...prev, loading: false }));
          }
        });
    }
  }, [
    sourceKey,
    destinationKey,
    sourceAddress,
    resolvedDestinationAddress,
    sourceAddressIsValid,
    destinationAddressIsValid,
  ]);

  // Auto-refresh on dependency changes + poll every 30s (paused while bridging)
  useEffect(() => {
    if (isBridgingRef.current) return;

    refreshBalances();

    const intervalId = window.setInterval(() => {
      if (!isBridgingRef.current) refreshBalances({ silent: true });
    }, 30_000);

    return () => window.clearInterval(intervalId);
  }, [refreshBalances]);

  useEffect(() => {
    return subscribePrestoDataRefresh(() => {
      if (!isBridgingRef.current) {
        refreshBalances({ silent: true });
      }
    });
  }, [refreshBalances]);

  return { sourceBalance, destinationBalance, refreshBalances };
}
