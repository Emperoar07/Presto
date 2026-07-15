'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Listbox, Transition } from '@headlessui/react';
import { useAccount, useChainId, useConnectorClient, useSwitchChain } from 'wagmi';
import { arcTestnet } from '@/config/wagmi';
import { getNetworkVisual } from '@/components/common/NetworkBadgeDropdown';
import { isArcChain } from '@/config/contracts';
import type {
  BridgeNetworkKey,
  BridgeStep,
  BridgeSummary,
  EstimateSummary,
} from './types';
import {
  AUTO_ESTIMATE_COOLDOWN_MS,
  BRIDGE_NETWORKS,
  EVM_NETWORK_PARAMS,
  NETWORKS,
  compactAmount,
  formatBalanceLabel,
  formatUsd,
  getBridgeActionLabel,
  getTransferSpeed,
  isBridgeNetworkKey,
  isValidEvmAddress,
  parseChainId,
  resolveEvmProvider,
  sanitizeBridgeAmount,
} from './constants';
import { useBridgeBalance } from './useBridgeBalance';
import { useBridgeHistory } from './useBridgeHistory';
import { BridgeHistoryPanel } from './BridgeHistoryPanel';
import { BridgeEstimatePanel } from './BridgeEstimatePanel';
import { emitPrestoDataRefresh, refreshPrestoQueries } from '@/lib/appDataRefresh';

// ---------------------------------------------------------------------------
// Iris API CORS proxy — intercept fetch to Circle's sandbox API and route
// through our Next.js API proxy to avoid browser CORS blocks.
// ---------------------------------------------------------------------------

const IRIS_ORIGINS = [
  'https://iris-api-sandbox.circle.com',
  'https://iris-api.circle.com',
];
const BRIDGE_DEBUG = process.env.NEXT_PUBLIC_BRIDGE_DEBUG === 'true';
const bridgeDebug = (...args: unknown[]) => {
  if (BRIDGE_DEBUG) console.log(...args);
};
const bridgeDebugError = (...args: unknown[]) => {
  if (BRIDGE_DEBUG) console.error(...args);
};

if (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function') {
  const _originalFetch = globalThis.fetch;
  // Only patch once — guard with a flag
  if (!(globalThis as any).__irisFetchPatched) {
    (globalThis as any).__irisFetchPatched = true;
    globalThis.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      for (const origin of IRIS_ORIGINS) {
        if (url.startsWith(origin)) {
          const proxyUrl = url.replace(origin, '/api/iris-proxy');
          bridgeDebug('[iris-proxy] intercepting', url, '->', proxyUrl);
          const newInput = typeof input === 'string' ? proxyUrl : input instanceof URL ? new URL(proxyUrl, window.location.origin) : new Request(proxyUrl, input);
          return _originalFetch.call(globalThis, newInput, init);
        }
      }
      return _originalFetch.call(globalThis, input, init);
    };
  }
}

// ---------------------------------------------------------------------------
// Bridge party builders
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildBridgeParty(
  network: (typeof NETWORKS)[BridgeNetworkKey],
  adapter: unknown,
  _address: string,
): any {
  return {
    adapter,
    chain: network.bridgeChain,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildBridgeDestinationParty(
  network: (typeof NETWORKS)[BridgeNetworkKey],
  adapter: unknown,
  address: string,
): any {
  return {
    adapter,
    chain: network.bridgeChain,
    useForwarder: true,
    ...(address ? { recipientAddress: address } : {}),
  };
}

// ---------------------------------------------------------------------------
// Network selector sub-component
// ---------------------------------------------------------------------------

function BridgeNetworkSelector({
  value,
  onChange,
  disabledKey,
}: {
  value: BridgeNetworkKey;
  onChange: (nextKey: BridgeNetworkKey) => void;
  disabledKey: BridgeNetworkKey;
}) {
  const selectedNetwork = NETWORKS[value];
  const selectedVisual = value === 'arc' ? getNetworkVisual(arcTestnet.id) : null;

  return (
    <Listbox value={value} onChange={onChange}>
      <div className="relative">
        <Listbox.Button className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left transition-all hover:bg-white/[0.04]" style={{ background: '#263347', border: '1px solid rgba(255,255,255,0.06)' }}>
          {selectedVisual ? (
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ background: 'rgba(37,192,244,0.12)' }}>
              <Image src={selectedVisual.iconSrc} alt={selectedNetwork.label} width={28} height={28} className="h-7 w-7" />
            </span>
          ) : (
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: 'rgba(37,192,244,0.15)' }}>
              {selectedNetwork.shortLabel.slice(0, 2).toUpperCase()}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">{selectedNetwork.label}</span>
          <span className="material-symbols-outlined text-[16px] text-slate-500">expand_more</span>
        </Listbox.Button>
        <Transition
          as={Fragment}
          leave="transition ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <Listbox.Options className="absolute right-0 z-50 mt-2 min-w-[240px] rounded-[14px] border border-white/[0.07] bg-[#1e293b] p-2 shadow-[0_18px_48px_rgba(2,6,23,0.5)]">
            {BRIDGE_NETWORKS.map((networkKey) => {
              const network = NETWORKS[networkKey];
              const visual = networkKey === 'arc' ? getNetworkVisual(arcTestnet.id) : null;
              const disabled = networkKey === disabledKey;

              return (
                <Listbox.Option
                  key={networkKey}
                  value={networkKey}
                  disabled={disabled}
                  className={({ active }) =>
                      `rounded-[12px] px-3 py-2.5 transition-colors ${
                      disabled
                        ? 'cursor-not-allowed opacity-40'
                        : active
                          ? 'bg-[#263347]'
                          : 'cursor-pointer'
                    }`
                  }
                >
                  <div className="flex items-center gap-3">
                    {visual ? (
                      <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-primary/12 ring-1 ring-white/5">
                        <Image src={visual.iconSrc} alt={network.label} width={32} height={32} className="h-8 w-8" />
                      </span>
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/12 text-xs font-bold text-white ring-1 ring-white/5">
                        {network.shortLabel.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-white">{network.label}</p>
                      <p className="text-[11px] text-slate-400">
                        {disabled
                            ? 'Already selected on the other side'
                            : `Route through ${network.shortLabel}`}
                      </p>
                    </div>
                  </div>
                </Listbox.Option>
              );
            })}
          </Listbox.Options>
        </Transition>
      </div>
    </Listbox>
  );
}

// ---------------------------------------------------------------------------
// Module-level caches to hold dynamically imported SDK modules to preserve
// browser User Gesture context during transaction signing.
// ---------------------------------------------------------------------------
let preloadedBridgeKit: any = null;
let preloadedViemAdapter: any = null;

// ---------------------------------------------------------------------------
// Main workspace component
// ---------------------------------------------------------------------------

export function BridgeWorkspace() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSourceParam = searchParams.get('source');
  const initialDestinationParam = searchParams.get('destination');
  const chainId = useChainId();
  const { address: evmAddress, connector } = useAccount();
  const { data: connectorClient } = useConnectorClient();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const [sourceKey, setSourceKey] = useState<BridgeNetworkKey>(() => {
    return isBridgeNetworkKey(initialSourceParam) ? initialSourceParam : 'arc';
  });
  const [destinationKey, setDestinationKey] = useState<BridgeNetworkKey>(() => {
    const key = isBridgeNetworkKey(initialDestinationParam) ? initialDestinationParam : 'ethereum-sepolia';
    const resolvedSource = isBridgeNetworkKey(initialSourceParam) ? initialSourceParam : 'arc';
    if (key === resolvedSource) {
      return resolvedSource === 'arc' ? 'ethereum-sepolia' : 'arc';
    }
    return key;
  });
  const [amount, setAmount] = useState('');
  const [exactAmountMode, setExactAmountMode] = useState(false);
  const [manualDestination, setManualDestination] = useState('');
  const [useManualDestination, setUseManualDestination] = useState(false);
  const [estimate, setEstimate] = useState<EstimateSummary | null>(null);
  const [bridgeResult, setBridgeResult] = useState<BridgeSummary | null>(null);
  const [eventLog, setEventLog] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [isBridging, setIsBridging] = useState(false);
  const [isAddingChain, setIsAddingChain] = useState(false);
  const [activeWalletChainId, setActiveWalletChainId] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyAutoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bridgeCardRef = useRef<HTMLDivElement>(null);
  const [bridgeCardHeight, setBridgeCardHeight] = useState<number | null>(null);

  const startHistoryAutoClose = useCallback(() => {
    if (historyAutoCloseRef.current) clearTimeout(historyAutoCloseRef.current);
    historyAutoCloseRef.current = setTimeout(() => setHistoryOpen(false), 20_000);
  }, []);

  const resetHistoryAutoClose = useCallback(() => {
    if (!historyOpen) return;
    if (historyAutoCloseRef.current) clearTimeout(historyAutoCloseRef.current);
    historyAutoCloseRef.current = setTimeout(() => setHistoryOpen(false), 20_000);
  }, [historyOpen]);

  // Start auto-close when panel opens, clear when it closes
  useEffect(() => {
    if (historyOpen) {
      startHistoryAutoClose();
    } else if (historyAutoCloseRef.current) {
      clearTimeout(historyAutoCloseRef.current);
    }
    return () => { if (historyAutoCloseRef.current) clearTimeout(historyAutoCloseRef.current); };
  }, [historyOpen, startHistoryAutoClose]);

  // Measure the Bridge Card height dynamically to size the History panel
  useEffect(() => {
    if (!bridgeCardRef.current) return;
    const updateHeight = () => {
      if (bridgeCardRef.current) {
        setBridgeCardHeight(bridgeCardRef.current.offsetHeight);
      }
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(bridgeCardRef.current);
    return () => observer.disconnect();
  }, [historyOpen]);

  const [bridgeStatusCard, setBridgeStatusCard] = useState<{
    state: 'pending' | 'success' | 'error';
    message: string;
  } | null>(null);
  const [hasMounted, setHasMounted] = useState(false);
  const lastAutoEstimateRef = useRef<{ key: string; at: number } | null>(null);
  const activeBridgeIdRef = useRef<string | null>(null);
  const hasInteractedRef = useRef(false);

  const sourceNetwork = NETWORKS[sourceKey];
  const destinationNetwork = NETWORKS[destinationKey];
  const effectiveChainId = activeWalletChainId ?? chainId;
  const isArcVisible = isArcChain(effectiveChainId || arcTestnet.id);
  const needsEvmChainSwitch =
    effectiveChainId !== null &&
    effectiveChainId !== sourceNetwork.chainId;

  // ---- Resolved addresses ----

  const resolvedDestinationAddress = useMemo(() => {
    if (useManualDestination && manualDestination.trim()) return manualDestination.trim();
    return evmAddress ?? '';
  }, [evmAddress, useManualDestination, manualDestination]);

  const sourceAddress = evmAddress ?? '';

  const destinationAddressIsValid = useMemo(() => {
    if (!resolvedDestinationAddress) return false;
    return isValidEvmAddress(resolvedDestinationAddress);
  }, [resolvedDestinationAddress]);

  const sourceAddressIsValid = useMemo(() => {
    if (!sourceAddress) return false;
    return isValidEvmAddress(sourceAddress);
  }, [sourceAddress]);

  // ---- Fee & receive amount computation ----

  const totalUsdcFee = useMemo(() => {
    if (!estimate) return 0;
    const protocolFees = estimate.fees.reduce((sum, f) => sum + Number(f.amount ?? 0), 0);
    const gasByToken = new Map<string, number>();
    for (const g of estimate.gasFees) {
      if (!g.fees?.fee) continue;
      const feeStr = g.fees.fee;
      const value = feeStr.includes('.') ? Number(feeStr) : Number(BigInt(feeStr)) / 10 ** (g.token === 'SOL' ? 9 : 18);
      gasByToken.set(g.token, (gasByToken.get(g.token) ?? 0) + value);
    }
    return protocolFees + (gasByToken.get('USDC') ?? 0);
  }, [estimate]);

  /** Amount the recipient will receive after USDC fees are deducted. */
  const estimatedReceiveAmount = useMemo(() => {
    const inputNum = Number(amount) || 0;
    if (inputNum <= 0) return '0';
    if (exactAmountMode) return compactAmount(String(inputNum), 6);
    const received = Math.max(inputNum - totalUsdcFee, 0);
    // Round to 6 decimals to avoid float noise (e.g. 3.3311439999999997)
    const rounded = Math.floor(received * 1e6) / 1e6;
    return compactAmount(rounded.toFixed(6).replace(/\.?0+$/, ''), 6);
  }, [amount, exactAmountMode, totalUsdcFee]);

  /**
   * The amount to pass to the SDK.
   * In exact-amount mode we add fees so the recipient gets the entered amount.
   * In default mode we pass the entered amount as-is (fees deducted from it).
   */
  const effectiveBridgeAmount = useMemo(() => {
    const inputNum = Number(amount) || 0;
    if (inputNum <= 0) return amount;
    if (!exactAmountMode) return amount;
    const withFees = inputNum + totalUsdcFee;
    // USDC supports max 6 decimal places — round to avoid SDK rejection from float noise
    const rounded = Math.ceil(withFees * 1e6) / 1e6;
    return rounded.toFixed(6).replace(/\.?0+$/, '');
  }, [amount, exactAmountMode, totalUsdcFee]);

  // ---- Hooks for balance and history ----

  const { sourceBalance, destinationBalance, refreshBalances } = useBridgeBalance({
    sourceKey,
    destinationKey,
    sourceAddress,
    resolvedDestinationAddress,
    sourceAddressIsValid,
    destinationAddressIsValid,
    isBridging,
  });

  async function createAdapterFor(networkKey: BridgeNetworkKey, _isDestination = false, isRetry = false) {
    let ethereumProvider: any = await resolveEvmProvider(
      connector,
      connectorClient as { transport?: { value?: unknown } } | undefined,
    );

    if (!ethereumProvider && isRetry) {
      ethereumProvider = {
        request: async (args: { method: string; params?: any[] }) => {
          if (args.method === 'eth_accounts' || args.method === 'eth_requestAccounts') {
            return ['0x0000000000000000000000000000000000000000'];
          }
          if (args.method === 'personal_sign') {
            return '0x';
          }
          return null;
        }
      };
    }

    if (!ethereumProvider) {
      throw new Error(
        `Connect an EVM wallet to bridge with ${NETWORKS[networkKey].label}. ` +
        'Open the wallet selector and connect a wallet like MetaMask or Rabby.',
      );
    }

    const mod = preloadedViemAdapter || (await import('@circle-fin/adapter-viem-v2'));
    const { createViemAdapterFromProvider } = mod;
    return createViemAdapterFromProvider({
      provider: ethereumProvider,
      capabilities: {
        addressContext: 'user-controlled',
      },
    });
  }

  async function buildBridgeKit() {
    const mod = preloadedBridgeKit || (await import('@circle-fin/bridge-kit'));
    const { BridgeKit, TransferSpeed } = mod;
    return {
      kit: new BridgeKit(),
      transferSpeed: TransferSpeed[getTransferSpeed(sourceKey)],
    };
  }

  const {
    bridgeHistory,
    upsertBridgeHistory,
    claimingItemId,
    handleManualClaim,
  } = useBridgeHistory({
    buildBridgeKit,
    createAdapterFor,
    onBalanceRefresh: refreshBalances,
  });

  // ---- Lifecycle effects ----

  useEffect(() => {
    // Preload heavy bridge SDK modules on mount to avoid async latency
    // which breaks modern browser's User Gesture requirement for wallet popups.
    const preloadModules = async () => {
      try {
        if (!preloadedBridgeKit) {
          preloadedBridgeKit = await import('@circle-fin/bridge-kit');
        }
        if (!preloadedViemAdapter) {
          preloadedViemAdapter = await import('@circle-fin/adapter-viem-v2');
        }
        bridgeDebug('[bridge] preloaded SDK modules successfully');
      } catch (e) {
        bridgeDebugError('[bridge] failed to preload SDK modules:', e);
      }
    };
    void preloadModules();

    setHasMounted(true);
  }, []);

  useEffect(() => {
    let mounted = true;
    let activeProvider: Awaited<ReturnType<typeof resolveEvmProvider>> = null;
    const handleChainChanged = (value: unknown) => {
      if (!mounted) return;
      setActiveWalletChainId(parseChainId(value));
    };

    void resolveEvmProvider(
      connector,
      connectorClient as { transport?: { value?: unknown } } | undefined,
    ).then(async (provider) => {
      if (!mounted) return;
      activeProvider = provider;
      if (!provider) {
        setActiveWalletChainId(null);
        return;
      }

      try {
        const value = await provider.request({ method: 'eth_chainId' });
        if (mounted) setActiveWalletChainId(parseChainId(value));
      } catch {
        if (mounted) setActiveWalletChainId(null);
      }

      if (!mounted) return;
      provider.on?.('chainChanged', handleChainChanged);
    });

    return () => {
      mounted = false;
      activeProvider?.removeListener?.('chainChanged', handleChainChanged);
    };
  }, [connector, connectorClient]);

  useEffect(() => {
    const nextSourceParam = searchParams.get('source');
    const nextDestinationParam = searchParams.get('destination');

    if (
      isBridgeNetworkKey(nextSourceParam) &&
      isBridgeNetworkKey(nextDestinationParam) &&
      nextSourceParam !== nextDestinationParam
    ) {
      setSourceKey(nextSourceParam);
      setDestinationKey(nextDestinationParam);
    }
  }, [searchParams]);

  useEffect(() => {
    const legacyPeer = searchParams.get('peer');
    const legacyDirection = searchParams.get('direction');
    if (!isBridgeNetworkKey(legacyPeer) || !legacyDirection) return;

    const params = new URLSearchParams(searchParams.toString());
    params.delete('peer');
    params.delete('direction');

    if (legacyDirection === 'from-arc') {
      params.set('source', 'arc');
      params.set('destination', legacyPeer);
    } else if (legacyDirection === 'to-arc') {
      params.set('source', legacyPeer);
      params.set('destination', 'arc');
    } else {
      return;
    }

    router.replace(`/bridge?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  useEffect(() => {
    setEstimate(null);
    setBridgeResult(null);
    setEventLog([]);
    setErrorMessage(null);
    setBridgeStatusCard(null);
    setConfirmOpen(false);
  }, [amount, destinationKey, sourceKey]);

  // ---- Route management ----

  const commitRoute = (nextSource: BridgeNetworkKey, nextDestination: BridgeNetworkKey) => {
    if (nextSource === nextDestination) return;
    hasInteractedRef.current = true;
    setSourceKey(nextSource);
    setDestinationKey(nextDestination);

    const params = new URLSearchParams(searchParams.toString());
    params.delete('peer');
    params.delete('direction');
    params.set('source', nextSource);
    params.set('destination', nextDestination);

    const currentSource = searchParams.get('source') ?? 'arc';
    const currentDestination = searchParams.get('destination') ?? 'ethereum-sepolia';
    if (currentSource === nextSource && currentDestination === nextDestination) {
      return;
    }

    router.replace(`/bridge?${params.toString()}`, { scroll: false });
  };

  // ---- Derived state ----

  const sanitizedAmount = sanitizeBridgeAmount(amount);
  const canEstimate =
    sanitizedAmount !== '' &&
    Number(sanitizedAmount) > 0 &&
    sourceAddressIsValid &&
    destinationAddressIsValid &&
    !isEstimating &&
    !isBridging &&
    !needsEvmChainSwitch;

  const autoEstimateKey = useMemo(
    () =>
      [
        sourceKey,
        destinationKey,
        amount.trim(),
        sourceAddress,
        resolvedDestinationAddress,
      ].join('|'),
    [amount, destinationKey, resolvedDestinationAddress, sourceAddress, sourceKey],
  );

  // ---- EVM chain switching ----

  async function ensureEvmSourceChain(networkKey: BridgeNetworkKey) {
    const targetChainId = NETWORKS[networkKey].chainId;
    if (!targetChainId) return;

    const provider = await resolveEvmProvider(
      connector,
      connectorClient as { transport?: { value?: unknown } } | undefined,
    );
    if (!provider) {
      throw new Error('An EVM wallet is required to add or switch bridge networks.');
    }

    const hexChainId = `0x${targetChainId.toString(16)}` as const;
    const currentChainId = parseChainId(await provider.request({ method: 'eth_chainId' }));
    if (currentChainId === targetChainId) return;

    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hexChainId }],
      });
      const switchedChainId = parseChainId(await provider.request({ method: 'eth_chainId' }));
      if (switchedChainId !== targetChainId) {
        throw new Error(`Switch your wallet to ${NETWORKS[networkKey].label} before continuing.`);
      }
      return;
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? Number((error as { code?: unknown }).code) : null;
      if (code !== 4902) {
        throw error;
      }
    }

    const params = EVM_NETWORK_PARAMS[networkKey];
    if (!params) {
      throw new Error(`Could not prepare ${NETWORKS[networkKey].label} for wallet setup.`);
    }

    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [params],
    });

    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hexChainId }],
    });

    const switchedChainId = parseChainId(await provider.request({ method: 'eth_chainId' }));
    if (switchedChainId !== targetChainId) {
      throw new Error(`Switch your wallet to ${NETWORKS[networkKey].label} before continuing.`);
    }
  }

  // ---- Estimate & Bridge ----

  const handleEstimate = useCallback(async () => {
    const validAmount = sanitizeBridgeAmount(amount);
    if (!validAmount || Number(validAmount) <= 0) {
      setErrorMessage('Enter a valid amount to estimate.');
      return;
    }
    try {
      setIsEstimating(true);
      setErrorMessage(null);
      setBridgeResult(null);

      const [{ kit, transferSpeed }, fromAdapter, toAdapter] = await Promise.all([
        buildBridgeKit(),
        createAdapterFor(sourceKey, false),
        createAdapterFor(destinationKey, true),
      ]);

      const result = (await kit.estimate({
        from: buildBridgeParty(sourceNetwork, fromAdapter, sourceAddress),
        to: buildBridgeDestinationParty(destinationNetwork, toAdapter, resolvedDestinationAddress),
        amount,
        token: 'USDC',
        config: {
          transferSpeed,
        },
      })) as EstimateSummary;

      bridgeDebug('[bridge] estimate result:', { amount: result.amount, fees: result.fees, gasFees: result.gasFees });
      setEstimate(result);
    } catch (error) {
      setEstimate(null);
      setErrorMessage(error instanceof Error ? error.message : 'Could not estimate the bridge route.');
    } finally {
      setIsEstimating(false);
    }
  }, [
    amount,
    destinationKey,
    destinationNetwork,
    resolvedDestinationAddress,
    sourceAddress,
    sourceKey,
    sourceNetwork,
  ]);

  async function handleBridge() {
    const validAmount = sanitizeBridgeAmount(amount);
    if (!validAmount || Number(validAmount) <= 0) {
      setErrorMessage('Enter a valid amount to bridge.');
      return;
    }
    const capturedSteps: BridgeStep[] = [];
    try {
      await ensureEvmSourceChain(sourceKey);

      // Validate amount exceeds fees before submitting
      const inputNum = Number(effectiveBridgeAmount) || 0;
      if (inputNum > 0 && totalUsdcFee > 0 && inputNum <= totalUsdcFee) {
        setErrorMessage(`Amount must exceed the bridge fee of ${totalUsdcFee.toFixed(2)} USDC. Try a larger amount.`);
        return;
      }

      setIsBridging(true);
      setErrorMessage(null);
      setBridgeStatusCard({
        state: 'pending',
        message: 'Bridge submitted and waiting for completion.',
      });
      setEventLog([]);
      const bridgeId = `${crypto.randomUUID()}-${sourceKey}-${destinationKey}`;
      activeBridgeIdRef.current = bridgeId;
      upsertBridgeHistory({
        id: bridgeId,
        createdAt: Date.now(),
        amount,
        sourceKey,
        destinationKey,
        state: 'pending',
        steps: [],
      });

      bridgeDebug('[bridge] Building kit and adapters for', sourceKey, '->', destinationKey);
      const [{ kit, transferSpeed }, fromAdapter, toAdapter] = await Promise.all([
        buildBridgeKit(),
        createAdapterFor(sourceKey, false),
        createAdapterFor(destinationKey, true),
      ]);
      bridgeDebug('[bridge] Adapters created.');

      kit.on('*', (payload: any) => {
        const method = 'method' in payload && typeof payload.method === 'string' ? payload.method : 'bridge';
        try { bridgeDebug('[bridge] event:', method, JSON.parse(JSON.stringify(payload, (_k, v) => typeof v === 'bigint' ? v.toString() : v))); } catch { bridgeDebug('[bridge] event:', method, payload); }
        setEventLog((current) => {
          if (current.includes(method)) return current;
          return [...current, method];
        });

        const txHash = 'txHash' in payload && typeof payload.txHash === 'string' ? payload.txHash : undefined;
        const state = 'state' in payload && typeof payload.state === 'string' ? payload.state : undefined;
        if (method || txHash) {
          capturedSteps.push({ name: method, action: method, state, txHash });
        }
      });

      const sdkAmount = effectiveBridgeAmount;
      bridgeDebug('[bridge] Calling kit.bridge() with:', {
        from: { chain: sourceNetwork.bridgeChain, ecosystem: sourceNetwork.ecosystem },
        to: { chain: destinationNetwork.bridgeChain, ecosystem: destinationNetwork.ecosystem, recipientAddress: '(connected destination wallet)' },
        amount: sdkAmount,
        exactAmountMode,
      });
      const result = (await kit.bridge({
        from: buildBridgeParty(sourceNetwork, fromAdapter, sourceAddress),
        to: buildBridgeDestinationParty(destinationNetwork, toAdapter, resolvedDestinationAddress),
        amount: sdkAmount,
        token: 'USDC',
        config: {
          transferSpeed,
        },
      })) as BridgeSummary;
      try { bridgeDebug('[bridge] kit.bridge() returned:', JSON.parse(JSON.stringify(result, (_k, v) => typeof v === 'bigint' ? v.toString() : v))); } catch { bridgeDebug('[bridge] kit.bridge() returned:', result); }
      // Log each step's details for debugging
      if (Array.isArray((result as any).steps)) {
        (result as any).steps.forEach((step: any, i: number) => {
          try { bridgeDebug(`[bridge] step[${i}]:`, JSON.parse(JSON.stringify(step, (_k: string, v: unknown) => typeof v === 'bigint' ? v.toString() : v))); } catch { bridgeDebug(`[bridge] step[${i}]:`, step); }
          if (step.state === 'error') {
            const err = step.error;
            if (err) {
              const flat: Record<string, unknown> = {};
              // Error instances have non-enumerable props — extract them manually
              for (const k of Object.getOwnPropertyNames(err)) { try { flat[k] = (err as any)[k]; } catch {} }
              for (const k of Object.keys(err)) { try { flat[k] = (err as any)[k]; } catch {} }
              try { bridgeDebugError(`[bridge] step[${i}] ERROR:`, JSON.parse(JSON.stringify(flat, (_k: string, v: unknown) => typeof v === 'bigint' ? v.toString() : v))); } catch { bridgeDebugError(`[bridge] step[${i}] ERROR (raw):`, err); }
              if (err.cause) {
                bridgeDebugError(`[bridge] step[${i}] cause:`, err.cause);
                // Include simulation logs from the adapter trace when available.
                const trace = (err.cause as any)?.trace;
                if (trace) {
                  if (trace.logs) bridgeDebugError(`[bridge] step[${i}] SIMULATION LOGS:\n`, trace.logs);
                  if (trace.error) bridgeDebugError(`[bridge] step[${i}] SIMULATION ERROR:`, trace.error);
                  if (trace.errorDetails) bridgeDebugError(`[bridge] step[${i}] ERROR DETAILS:`, trace.errorDetails);
                  if (trace.walletAddress) bridgeDebugError(`[bridge] step[${i}] wallet:`, trace.walletAddress);
                  if (trace.network) bridgeDebugError(`[bridge] step[${i}] network:`, trace.network);
                  if (trace.currentBalanceSol) bridgeDebugError(`[bridge] step[${i}] SOL balance:`, trace.currentBalanceSol);
                }
              }
              if ((err as any).logs) bridgeDebugError(`[bridge] step[${i}] logs:`, (err as any).logs);
              if ((err as any).context) bridgeDebugError(`[bridge] step[${i}] context:`, (err as any).context);
            }
            bridgeDebugError(`[bridge] step[${i}] errorMessage:`, step.errorMessage);
          }
        });
      }

      setBridgeResult(result);
      setBridgeStatusCard({
        state: result.state === 'success' ? 'success' : 'pending',
        message: result.state === 'success' ? 'Bridge completed successfully.' : 'Bridge is still pending.',
      });
      if (result.state === 'success') {
        refreshBalances();
        window.setTimeout(() => {
          refreshBalances();
        }, 4000);
        await refreshPrestoQueries(queryClient, { address: evmAddress, chainId });
        emitPrestoDataRefresh('bridge');
      }
      const firstTxHash = capturedSteps.find((s) => s.txHash)?.txHash ?? (result.steps ?? []).find((s) => s.txHash)?.txHash ?? null;
      upsertBridgeHistory({
        id: bridgeId,
        createdAt: Date.now(),
        amount,
        sourceKey,
        destinationKey,
        state: result.state,
        steps: result.steps ?? [],
        sourceTxHash: firstTxHash,
        rawResult: result.state !== 'success' ? (result as unknown as Record<string, unknown>) : null,
      });
    } catch (error) {
      bridgeDebugError('[bridge] Bridge failed:', error);
      setBridgeResult(null);
      setErrorMessage(error instanceof Error ? error.message : 'Bridge execution failed.');
      setBridgeStatusCard({
        state: 'error',
        message: error instanceof Error ? error.message : 'Bridge execution failed.',
      });
      const errorFirstTxHash = capturedSteps.find((s) => s.txHash)?.txHash ?? null;
      // No rawResult here — a thrown error means we don't have a valid
      // BridgeResult from the SDK, so kit.retry() can't be used.
      // The manual claim button will only show for items with a real rawResult
      // (i.e. when kit.bridge() returned a pending/incomplete result, not threw).
      upsertBridgeHistory({
        id: activeBridgeIdRef.current ?? `${crypto.randomUUID()}-${sourceKey}-${destinationKey}`,
        createdAt: Date.now(),
        amount,
        sourceKey,
        destinationKey,
        state: 'error',
        steps: capturedSteps.length > 0 ? capturedSteps : [],
        sourceTxHash: errorFirstTxHash,
        errorMessage: error instanceof Error ? error.message : 'Bridge execution failed.',
        rawResult: null,
      });
    } finally {
      setIsBridging(false);
    }
  }

  // ---- Auto-estimate ----

  useEffect(() => {
    if (!canEstimate || isAddingChain || !hasInteractedRef.current) return;

    const now = Date.now();
    const lastAutoEstimate = lastAutoEstimateRef.current;
    if (lastAutoEstimate?.key === autoEstimateKey) {
      const elapsed = now - lastAutoEstimate.at;
      if (elapsed < AUTO_ESTIMATE_COOLDOWN_MS) return;
    }

    const timer = window.setTimeout(() => {
      lastAutoEstimateRef.current = {
        key: autoEstimateKey,
        at: Date.now(),
      };
      void handleEstimate();
    }, 350);

    return () => window.clearTimeout(timer);
  }, [autoEstimateKey, canEstimate, handleEstimate, isAddingChain]);

  // ---- Computed labels ----

  const sourceWalletLabel = evmAddress ? 'Wallet connected' : 'Select wallet';
  const destinationWalletLabel = resolvedDestinationAddress ? 'Recipient ready' : 'Select wallet';

  // ---- Render ----

  return (
    <ConnectButton.Custom>
      {({ account, mounted, openConnectModal }) => {
        const connected = mounted && Boolean(account);
        const sourceWalletDisplayLabel = hasMounted ? sourceWalletLabel : 'Select wallet';
        const destinationWalletDisplayLabel = hasMounted ? destinationWalletLabel : 'Select wallet';
        const sourceWalletMissing = !connected;

        const primaryLabel =
          !connected
            ? 'CONNECT EVM WALLET'
            : needsEvmChainSwitch
              ? isAddingChain || isSwitchingChain
                ? 'PREPARING NETWORK'
                : `SWITCH TO ${sourceNetwork.shortLabel.toUpperCase()}`
              : !estimate
                ? 'ESTIMATING ROUTE'
                : isBridging
                  ? getBridgeActionLabel(eventLog, bridgeResult, sourceNetwork.ecosystem)
                  : 'REVIEW & BRIDGE';
        const primaryActionBusy = isAddingChain || isSwitchingChain || isEstimating || isBridging;
        const hasBridgeActivityPanel = Boolean(bridgeStatusCard || errorMessage || estimate || bridgeResult);
        const summaryReceiveLabel = estimate ? `~${estimatedReceiveAmount} USDC` : '--';

        const handlePrimaryAction = () => {
          if (!connected) {
            openConnectModal();
            return;
          }
          if (needsEvmChainSwitch && sourceNetwork.chainId) {
            void (async () => {
              try {
                setIsAddingChain(true);
                await ensureEvmSourceChain(sourceKey);
                setErrorMessage(null);
              } catch (error) {
                setErrorMessage(error instanceof Error ? error.message : 'Could not add or switch the selected network.');
              } finally {
                setIsAddingChain(false);
              }
            })();
            return;
          }
          if (!estimate) return;
          // Open confirmation modal instead of bridging directly
          setConfirmOpen(true);
        };

        const handleSourceNetworkChange = (nextKey: BridgeNetworkKey) => {
          let nextDestination = destinationKey;
          if (nextKey === destinationKey) {
            const fallback = BRIDGE_NETWORKS.find((key) => key !== nextKey && key !== sourceKey);
            if (fallback) nextDestination = fallback;
          }
          commitRoute(nextKey, nextDestination);
          const nextNetwork = NETWORKS[nextKey];
          if (effectiveChainId !== nextNetwork.chainId) {
            void ensureEvmSourceChain(nextKey).catch(() => undefined);
          }
        };

        const handleDestinationNetworkChange = (nextKey: BridgeNetworkKey) => {
          let nextSource = sourceKey;
          if (nextKey === sourceKey) {
            const fallback = BRIDGE_NETWORKS.find((key) => key !== nextKey && key !== destinationKey);
            if (fallback) nextSource = fallback;
          }
          commitRoute(nextSource, nextKey);
        };

        const handleSwapRoute = () => {
          const nextSource = destinationKey;
          const nextDestination = sourceKey;
          commitRoute(nextSource, nextDestination);

          const nextNetwork = NETWORKS[nextSource];
          if (effectiveChainId !== nextNetwork.chainId) {
            void ensureEvmSourceChain(nextSource).catch(() => undefined);
          }
        };

        return (
          <section className="flex w-full justify-center">
            <div className="relative flex items-start justify-center gap-4">
            {/* Bridge card */}
            <div className="w-full max-w-[381px] flex-shrink-0">
              <div ref={bridgeCardRef} className="overflow-hidden rounded-[16px]" style={{ background: '#141e30', border: '1px solid rgba(255,255,255,0.07)' }}>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div>
                    <p className="text-[13px] font-bold text-slate-100">Bridge USDC</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">Powered by Circle CCTP V2</p>
                  </div>
                  {/* History toggle icon */}
                  <button
                    type="button"
                    onClick={() => setHistoryOpen((v) => !v)}
                    className="relative flex h-8 w-8 items-center justify-center rounded-[8px] transition-colors hover:bg-white/[0.06]"
                  >
                    <span className="material-symbols-outlined text-[18px] text-slate-400">history</span>
                  </button>
                </div>

                <div className="space-y-2.5 p-4">
                  {/* From row */}
                  <div className="rounded-[12px] px-3.5 py-3" style={{ background: '#1e2d42', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-medium text-slate-500">From</p>
                      <button
                        type="button"
                        onClick={() => { if (!connected) openConnectModal(); }}
                        className="text-[11px] font-semibold text-primary"
                      >
                        {sourceWalletDisplayLabel}
                      </button>
                    </div>
                    <div className="mt-2">
                      <BridgeNetworkSelector value={sourceKey} onChange={handleSourceNetworkChange} disabledKey={destinationKey} />
                    </div>
                    {sourceBalance ? (
                      <p className="mt-2 text-[11px] font-semibold text-slate-500">{formatBalanceLabel(sourceBalance)}</p>
                    ) : null}
                  </div>

                  {/* Swap direction button */}
                  <div className="-my-0.5 flex justify-center">
                    <button
                      type="button"
                      onClick={handleSwapRoute}
                      className="bridge-flip-btn z-10 flex h-10 w-10 items-center justify-center rounded-[12px] shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
                      style={{ background: 'linear-gradient(145deg, #1a2d45, #0f1e30)', border: '1px solid rgba(37,192,244,0.2)' }}
                    >
                      <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                        <path d="M7 2L7 16M7 2L4 5M7 2L10 5" stroke="#25c0f4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M15 20L15 6M15 20L12 17M15 20L18 17" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <style>{`
                        .bridge-flip-btn { transition: transform 0.18s cubic-bezier(.34,1.56,.64,1), box-shadow 0.18s; }
                        .bridge-flip-btn:hover { transform: scale(1.08); box-shadow: 0 0 18px rgba(37,192,244,0.25); }
                        .bridge-flip-btn:active { transform: rotate(180deg) scale(0.95); transition: transform 0.22s cubic-bezier(.34,1.56,.64,1); }
                      `}</style>
                    </button>
                  </div>

                  {/* To row */}
                  <div className="rounded-[12px] px-3.5 py-3" style={{ background: '#1e2d42', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-medium text-slate-500">To</p>
                      <button
                        type="button"
                        onClick={() => { if (!connected) openConnectModal(); }}
                        className="text-[11px] font-semibold text-primary"
                      >
                        {destinationWalletDisplayLabel}
                      </button>
                    </div>
                    <div className="mt-2">
                      <BridgeNetworkSelector value={destinationKey} onChange={handleDestinationNetworkChange} disabledKey={sourceKey} />
                    </div>
                    {destinationBalance ? (
                      <p className="mt-2 text-[11px] font-semibold text-slate-500">{formatBalanceLabel(destinationBalance)}</p>
                    ) : null}
                  </div>

                  {/* Amount input */}
                  <div className="rounded-[12px] px-3.5 py-3" style={{ background: '#1e2d42', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-medium text-slate-500">Amount (USDC)</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (sourceBalance.amount) {
                            hasInteractedRef.current = true;
                            setAmount(sanitizeBridgeAmount(sourceBalance.amount));
                          }
                        }}
                        className="rounded-full px-2.5 py-1 text-[10px] font-bold text-primary"
                        style={{ background: '#15314a', border: '1px solid rgba(37,192,244,0.18)' }}
                      >
                        Max
                      </button>
                    </div>
                    <div className="mt-3 flex items-center gap-2.5 rounded-[10px] px-3 py-3" style={{ background: '#18263a', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div className="flex flex-shrink-0 items-center gap-1.5 rounded-[8px] px-2 py-1" style={{ background: '#263347', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#3b82f6] text-[8px] font-extrabold text-white">US</span>
                        <span className="text-[12px] font-bold text-slate-100">USDC</span>
                      </div>
                      <input
                        value={amount}
                        onChange={(event) => {
                          hasInteractedRef.current = true;
                          const sanitized = sanitizeBridgeAmount(event.target.value);
                          if (event.target.value === '' || sanitized !== '') {
                            setAmount(event.target.value === '' ? '' : sanitized);
                          }
                        }}
                        inputMode="decimal"
                        placeholder="0.00"
                        className="min-w-0 flex-1 bg-transparent text-[22px] font-semibold leading-none tracking-tight text-white outline-none placeholder:text-slate-600"
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-primary">{formatBalanceLabel(sourceBalance)}</span>
                      <span className="text-[10px] font-medium text-slate-500">{sourceNetwork.shortLabel} source</span>
                    </div>
                  </div>

                  {/* Summary fees */}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-[12px] px-3.5 py-3" style={{ background: '#1e2d42', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">You receive</p>
                      <p className="mt-2 text-[13px] font-semibold text-slate-100">{summaryReceiveLabel}</p>
                    </div>
                    <div className="rounded-[12px] px-3.5 py-3" style={{ background: '#1e2d42', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Destination</p>
                        <button
                          type="button"
                          onClick={() => {
                            setUseManualDestination((v) => !v);
                            if (useManualDestination) setManualDestination('');
                          }}
                          className="text-[9px] font-semibold text-[#25c0f4] hover:opacity-80"
                        >
                          {useManualDestination ? 'Use wallet' : 'Custom'}
                        </button>
                      </div>
                      {useManualDestination ? (
                        <input
                          type="text"
                          value={manualDestination}
                          onChange={(e) => setManualDestination(e.target.value)}
                          placeholder="Paste address..."
                          className="mt-1.5 w-full bg-transparent font-mono text-[11px] text-slate-300 outline-none placeholder:text-slate-600"
                        />
                      ) : (
                        <p className="mt-2 font-mono text-[11px] text-slate-300">
                          {resolvedDestinationAddress ? `${resolvedDestinationAddress.slice(0, 8)}...${resolvedDestinationAddress.slice(-6)}` : 'Waiting for wallet'}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* CTA */}
                  <button
                    type="button"
                    onClick={handlePrimaryAction}
                    disabled={
                      primaryActionBusy ||
                      (sourceWalletMissing
                        ? false
                        : needsEvmChainSwitch
                          ? false
                          : !estimate)
                    }
                    className="w-full rounded-[12px] py-3 text-[13px] font-extrabold text-[#0a1628] transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ background: '#25c0f4', boxShadow: '0 6px 24px rgba(37,192,244,0.25)' }}
                  >
                    <span className="inline-flex items-center justify-center gap-2">
                      {primaryActionBusy ? (
                        <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-[#0f172a]/30 border-t-[#0f172a]" />
                      ) : null}
                      <span>{primaryLabel === 'REVIEW & BRIDGE' ? 'Bridge USDC' : primaryLabel}</span>
                    </span>
                  </button>

                {/* Wallet mismatch hints — only shown briefly, not blocking */}
            </div>

            {hasBridgeActivityPanel ? (
              <div className="mt-5">
                <BridgeEstimatePanel
                  bridgeStatusCard={bridgeStatusCard}
                  errorMessage={errorMessage}
                  estimate={estimate}
                  bridgeResult={bridgeResult}
                  sourceKey={sourceKey}
                  destinationKey={destinationKey}
                  estimatedReceiveAmount={estimatedReceiveAmount}
                  exactAmountMode={exactAmountMode}
                  onExactAmountModeChange={setExactAmountMode}
                />
              </div>
            ) : null}
            </div>
            </div>

            {/* Side slide-out history panel — beside on xl+, below on mobile */}
            <div
              className={`transition-all duration-300 ease-in-out overflow-hidden ${
                historyOpen
                  ? 'w-full max-w-[340px] opacity-100 xl:w-[340px]'
                  : 'w-0 max-w-0 opacity-0 xl:w-0'
              }`}
              style={{
                height: bridgeCardHeight ? `${bridgeCardHeight}px` : undefined,
              }}
              onMouseEnter={() => { if (historyAutoCloseRef.current) clearTimeout(historyAutoCloseRef.current); }}
              onMouseLeave={() => startHistoryAutoClose()}
              onScroll={() => resetHistoryAutoClose()}
            >
              <div className="w-[340px]" style={{ height: '100%' }}>
                <BridgeHistoryPanel
                  bridgeHistory={bridgeHistory}
                  claimingItemId={claimingItemId}
                  onManualClaim={(item) => void handleManualClaim(item)}
                />
              </div>
            </div>
            </div>

            {/* ---- Confirmation modal ---- */}
            {confirmOpen && estimate ? (
              <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/65 px-4 py-8">
                <div className="w-full max-w-[520px] rounded-[20px] border border-white/10 bg-[#172234] p-5 shadow-[0_24px_70px_rgba(2,6,23,0.5)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Confirm Bridge</p>
                      <p className="mt-1 text-[15px] font-bold text-slate-100">
                        {sourceNetwork.shortLabel} to {destinationNetwork.shortLabel}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setConfirmOpen(false)}
                      className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold text-slate-400 transition-colors hover:border-primary/30 hover:text-primary"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {/* Amount */}
                    <div className="rounded-[14px] border border-white/10 bg-[#132238] px-4 py-3">
                      <span className="text-xs text-slate-400">{exactAmountMode ? 'Sending (incl. fees)' : 'Amount'}</span>
                      <p className="mt-2 text-[14px] font-bold text-white">{compactAmount(exactAmountMode ? effectiveBridgeAmount : amount, 6)} USDC</p>
                    </div>

                    {/* Route */}
                    <div className="rounded-[14px] border border-white/10 bg-[#132238] px-4 py-3">
                      <span className="text-xs text-slate-400">Route</span>
                      <p className="mt-2 text-[14px] font-bold text-white">{sourceNetwork.shortLabel} to {destinationNetwork.shortLabel}</p>
                    </div>

                    {/* Source address */}
                    <div className="rounded-[14px] border border-white/10 bg-[#132238] px-4 py-3">
                      <span className="text-xs text-slate-400">From</span>
                      <p className="mt-2 truncate text-[12px] font-mono text-slate-300" title={sourceAddress}>
                        {sourceAddress.slice(0, 6)}...{sourceAddress.slice(-4)}
                      </p>
                    </div>

                    {/* Destination address */}
                    <div className="rounded-[14px] border border-white/10 bg-[#132238] px-4 py-3">
                      <span className="text-xs text-slate-400">To</span>
                      <p className="mt-2 truncate text-[12px] font-mono text-slate-300" title={resolvedDestinationAddress}>
                        {resolvedDestinationAddress.slice(0, 6)}...{resolvedDestinationAddress.slice(-4)}
                      </p>
                    </div>

                    {/* You receive */}
                    <div className="rounded-[14px] border border-white/10 bg-[#132238] px-4 py-3">
                      <span className="text-xs text-slate-400">You receive</span>
                      <p className="mt-2 text-[14px] font-bold text-emerald-400">{estimatedReceiveAmount} USDC</p>
                    </div>

                    {/* Fees */}
                    {estimate.fees.length > 0 ? (
                      <div className="rounded-[14px] border border-white/10 bg-[#132238] px-4 py-3 sm:col-span-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Fees</p>
                        <div className="mt-2 space-y-1.5">
                          {estimate.fees.map((fee, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span className="capitalize text-slate-400">{fee.type}</span>
                              <span className="text-slate-300">
                                {fee.amount ? `${compactAmount(fee.amount, 6)} ${fee.token}` : '--'}
                              </span>
                            </div>
                          ))}
                          <div className="border-t border-white/5 pt-1.5 flex items-center justify-between text-xs">
                            <span className="text-slate-400">Total fees</span>
                            <span className="font-semibold text-white">
                              {formatUsd(estimate.fees.reduce((sum, f) => sum + Number(f.amount ?? 0), 0).toString())}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {/* Estimated time */}
                    <div className="rounded-[14px] border border-white/10 bg-[#132238] px-4 py-3 sm:col-span-2">
                      <span className="text-xs text-slate-400">Estimated time</span>
                      <p className="mt-2 text-[12px] font-semibold text-emerald-400">1 to 3 min</p>
                    </div>

                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setConfirmOpen(false);
                      void handleBridge();
                    }}
                    className="mt-4 w-full rounded-[14px] px-5 py-3 text-sm font-black uppercase tracking-[0.08em] text-background-dark transition-opacity hover:opacity-95"
                    style={{ background: '#25c0f4' }}
                  >
                    CONFIRM BRIDGE
                  </button>
                </div>
              </div>
            ) : null}

          </section>
        );
      }}
    </ConnectButton.Custom>
  );
}
