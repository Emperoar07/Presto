'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Listbox, Transition } from '@headlessui/react';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import { useWallet } from '@solana/wallet-adapter-react';
import { VersionedTransaction } from '@solana/web3.js';
import { useAccount, useChainId, useConnectorClient, useSwitchChain } from 'wagmi';
import { arcTestnet } from '@/config/wagmi';
import { getNetworkVisual } from '@/components/common/NetworkBadgeDropdown';
import { isArcChain } from '@/config/contracts';
import type {
  BridgeNetworkKey,
  BridgeStep,
  BridgeSummary,
  EstimateSummary,
  SolanaProviderOption,
  SolanaWalletProvider,
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
  getEvmProviderFromConnector,
  getInjectedEvmProvider,
  isBridgeNetworkKey,
  isValidEvmAddress,
  isValidSolanaAddress,
  parseChainId,
  sanitizeBridgeAmount,
} from './constants';
import { useBridgeBalance } from './useBridgeBalance';
import { useBridgeHistory } from './useBridgeHistory';
import { BridgeHistoryPanel } from './BridgeHistoryPanel';
import { BridgeEstimatePanel } from './BridgeEstimatePanel';

// ---------------------------------------------------------------------------
// Iris API CORS proxy — intercept fetch to Circle's sandbox API and route
// through our Next.js API proxy to avoid browser CORS blocks.
// ---------------------------------------------------------------------------

const IRIS_ORIGINS = [
  'https://iris-api-sandbox.circle.com',
  'https://iris-api.circle.com',
];

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
          console.log('[iris-proxy] intercepting', url, '→', proxyUrl);
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
  if (network.ecosystem === 'solana') {
    return {
      adapter,
      chain: network.bridgeChain,
      ...(address ? { recipientAddress: address } : {}),
    };
  }

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
                      <p className="text-[11px] text-slate-400">{disabled ? 'Already selected on the other side' : `Route through ${network.shortLabel}`}</p>
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
// Main workspace component
// ---------------------------------------------------------------------------

export function BridgeWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    wallets: solanaWallets,
    wallet: selectedSolanaWallet,
    publicKey: solanaPublicKey,
    connected: solanaWalletConnected,
    connecting: solanaWalletConnecting,
    select: selectSolanaWallet,
    connect: connectSolanaAdapter,
    disconnect: disconnectSolanaAdapter,
    signTransaction: signSolanaTransaction,
    signAllTransactions: signAllSolanaTransactions,
    signMessage: signSolanaMessage,
  } = useWallet();
  const initialSourceParam = searchParams.get('source');
  const initialDestinationParam = searchParams.get('destination');
  const chainId = useChainId();
  const { address: evmAddress } = useAccount();
  const { data: connectorClient } = useConnectorClient();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const [sourceKey, setSourceKey] = useState<BridgeNetworkKey>(() =>
    isBridgeNetworkKey(initialSourceParam) ? initialSourceParam : 'arc',
  );
  const [destinationKey, setDestinationKey] = useState<BridgeNetworkKey>(() => {
    if (isBridgeNetworkKey(initialDestinationParam) && initialDestinationParam !== initialSourceParam) {
      return initialDestinationParam;
    }
    return 'ethereum-sepolia';
  });
  const [amount, setAmount] = useState('');
  const [exactAmountMode, setExactAmountMode] = useState(false);
  const [solanaAddress, setSolanaAddress] = useState('');
  const [estimate, setEstimate] = useState<EstimateSummary | null>(null);
  const [bridgeResult, setBridgeResult] = useState<BridgeSummary | null>(null);
  const [eventLog, setEventLog] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [isBridging, setIsBridging] = useState(false);
  const [isConnectingSolana, setIsConnectingSolana] = useState(false);
  const [isAddingChain, setIsAddingChain] = useState(false);
  const [activeWalletChainId, setActiveWalletChainId] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [solanaProviderKey, setSolanaProviderKey] = useState<string | null>(null);
  const [solanaWalletPickerOpen, setSolanaWalletPickerOpen] = useState(false);
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
  const isCrossEcosystem = sourceNetwork.ecosystem !== destinationNetwork.ecosystem;
  const solanaOptions = useMemo<SolanaProviderOption[]>(
    () =>
      solanaWallets
        .filter((wallet) => wallet.readyState === WalletReadyState.Installed || wallet.readyState === WalletReadyState.Loadable)
        .map((wallet) => ({
          key: wallet.adapter.name,
          label: wallet.adapter.name,
          icon: wallet.adapter.icon,
          adapter: wallet.adapter,
        })),
    [solanaWallets],
  );
  const effectiveChainId = activeWalletChainId ?? chainId;
  const isArcVisible = isArcChain(effectiveChainId || arcTestnet.id);
  const needsEvmChainSwitch =
    sourceNetwork.ecosystem === 'evm' &&
    typeof sourceNetwork.chainId === 'number' &&
    effectiveChainId !== null &&
    effectiveChainId !== sourceNetwork.chainId;

  // ---- Resolved addresses ----

  // Cross-ecosystem: source and destination use different wallet types.
  const resolvedDestinationAddress = useMemo(() => {
    if (destinationNetwork.ecosystem === 'solana') return solanaAddress;
    return evmAddress ?? '';
  }, [destinationNetwork.ecosystem, evmAddress, solanaAddress]);

  const sourceAddress = sourceNetwork.ecosystem === 'solana' ? solanaAddress : evmAddress ?? '';

  const destinationAddressIsValid = useMemo(() => {
    if (!resolvedDestinationAddress) return false;
    return destinationNetwork.ecosystem === 'solana'
      ? isValidSolanaAddress(resolvedDestinationAddress)
      : isValidEvmAddress(resolvedDestinationAddress);
  }, [destinationNetwork.ecosystem, resolvedDestinationAddress]);

  const sourceAddressIsValid = useMemo(() => {
    if (!sourceAddress) return false;
    return sourceNetwork.ecosystem === 'solana'
      ? isValidSolanaAddress(sourceAddress)
      : isValidEvmAddress(sourceAddress);
  }, [sourceAddress, sourceNetwork.ecosystem]);

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

  // Solana bridge provider (used by createAdapterFor)
  const solanaBridgeProvider = useMemo<SolanaWalletProvider | null>(() => {
    if (!selectedSolanaWallet?.adapter) return null;

    return {
      isConnected: solanaWalletConnected,
      address: solanaPublicKey?.toBase58(),
      connect: async () => {
        if (!solanaWalletConnected) {
          await connectSolanaAdapter();
        }
        // After connect, the adapter's publicKey is the most reliable source
        // since React state (solanaPublicKey) may not have updated yet.
        const address =
          selectedSolanaWallet.adapter.publicKey?.toBase58?.() ??
          solanaPublicKey?.toBase58() ??
          '';
        if (!address) {
          throw new Error('Connected Solana wallet did not return a valid address.');
        }
        return { address };
      },
      disconnect: async () => {
        await disconnectSolanaAdapter();
      },
      signTransaction: async (transaction) => {
        // Circle's adapter calls this via signVersionedTransaction path.
        // The adapter's executeSerializedTransaction / executeTransaction
        // handles sending via RPC after we return the signed tx.
        // We just need to sign and return the VersionedTransaction.
        if (!signSolanaTransaction) {
          throw new Error('The selected Solana wallet cannot sign transactions.');
        }
        let tx: VersionedTransaction;
        if (typeof transaction === 'string') {
          tx = VersionedTransaction.deserialize(Buffer.from(transaction, 'base64'));
        } else if (transaction instanceof Uint8Array) {
          tx = VersionedTransaction.deserialize(transaction);
        } else {
          tx = transaction as VersionedTransaction;
        }
        const signed = await signSolanaTransaction(tx);
        return signed;
      },
      signAllTransactions: signAllSolanaTransactions
        ? async (transactions) => {
            const deserialized = (transactions as unknown[]).map((t) => {
              if (typeof t === 'string') return VersionedTransaction.deserialize(Buffer.from(t, 'base64'));
              if (t instanceof Uint8Array) return VersionedTransaction.deserialize(t);
              return t as VersionedTransaction;
            });
            return await signAllSolanaTransactions(deserialized);
          }
        : undefined,
      signMessage: signSolanaMessage
        ? async (message) => ({
            signature: await signSolanaMessage(message),
          })
        : undefined,
    };
  }, [
    connectSolanaAdapter,
    disconnectSolanaAdapter,
    selectedSolanaWallet,
    signSolanaTransaction,
    signAllSolanaTransactions,
    signSolanaMessage,
    solanaPublicKey,
    solanaWalletConnected,
  ]);

  async function createAdapterFor(networkKey: BridgeNetworkKey) {
    if (networkKey === 'solana-devnet') {
      if (!solanaBridgeProvider) {
        throw new Error('A Solana wallet like Phantom is required when Solana Devnet participates in the bridge.');
      }

      const { createSolanaKitAdapterFromProvider } = await import('@circle-fin/adapter-solana-kit');

      const adapter = createSolanaKitAdapterFromProvider({
        provider: solanaBridgeProvider,
      });
      return adapter;
    }

    const connectorProvider = getEvmProviderFromConnector(connectorClient as { transport?: { value?: unknown } } | undefined);

    if (!connectorProvider && !evmAddress) {
      throw new Error(
        `Connect an EVM wallet to bridge with ${NETWORKS[networkKey].label}. ` +
        'Open the wallet selector and connect a wallet like MetaMask or Rabby.',
      );
    }

    const ethereumProvider: import('viem').EIP1193Provider | null =
      connectorProvider ??
      (typeof window !== 'undefined'
        ? ((window as Window & { ethereum?: import('viem').EIP1193Provider }).ethereum ?? null)
        : null);

    if (!ethereumProvider) {
      throw new Error('An EVM wallet is required to bridge with Arc, Base Sepolia, or Ethereum Sepolia.');
    }

    const { createViemAdapterFromProvider } = await import('@circle-fin/adapter-viem-v2');
    return createViemAdapterFromProvider({
      provider: ethereumProvider,
      capabilities: {
        addressContext: 'user-controlled',
      },
    });
  }

  async function buildBridgeKit() {
    const { BridgeKit, TransferSpeed } = await import('@circle-fin/bridge-kit');
    return {
      kit: new BridgeKit(),
      transferSpeed: TransferSpeed.FAST,
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
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (selectedSolanaWallet?.adapter?.name) {
      setSolanaProviderKey(selectedSolanaWallet.adapter.name);
    }
  }, [selectedSolanaWallet]);

  useEffect(() => {
    if (solanaPublicKey) {
      setSolanaAddress(solanaPublicKey.toBase58());
      return;
    }

    if (!solanaWalletConnected) {
      setSolanaAddress('');
    }
  }, [solanaPublicKey, solanaWalletConnected]);

  useEffect(() => {
    const provider = getEvmProviderFromConnector(connectorClient as { transport?: { value?: unknown } } | undefined) ?? getInjectedEvmProvider();
    if (!provider) {
      setActiveWalletChainId(null);
      return;
    }

    let mounted = true;
    const handleChainChanged = (value: unknown) => {
      if (!mounted) return;
      setActiveWalletChainId(parseChainId(value));
    };

    void provider
      .request({ method: 'eth_chainId' })
      .then((value) => {
        if (!mounted) return;
        setActiveWalletChainId(parseChainId(value));
      })
      .catch(() => {
        if (!mounted) return;
        setActiveWalletChainId(null);
      });

    provider.on?.('chainChanged', handleChainChanged);

    return () => {
      mounted = false;
      provider.removeListener?.('chainChanged', handleChainChanged);
    };
  }, []);

  useEffect(() => {
    const nextSourceParam = searchParams.get('source');
    const nextDestinationParam = searchParams.get('destination');

    if (
      isBridgeNetworkKey(nextSourceParam) &&
      isBridgeNetworkKey(nextDestinationParam) &&
      nextSourceParam !== nextDestinationParam &&
      (nextSourceParam !== sourceKey || nextDestinationParam !== destinationKey)
    ) {
      setSourceKey(nextSourceParam);
      setDestinationKey(nextDestinationParam);
    }
  }, [destinationKey, searchParams, sourceKey]);

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
    setStatusMessage(null);
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

  // ---- Solana wallet connection ----

  async function connectSolanaWallet() {
    setSolanaWalletPickerOpen(true);
  }

  async function connectSelectedSolanaWallet(optionKey?: string) {
    if (solanaOptions.length === 0) {
      setErrorMessage('Install a Solana wallet like Phantom to bridge from or into Solana Devnet.');
      setSolanaWalletPickerOpen(true);
      return;
    }

    const nextProviderKey = optionKey ?? solanaProviderKey ?? solanaOptions[0]?.key ?? null;
    if (!nextProviderKey) {
      setErrorMessage('Choose a Solana wallet to continue.');
      setSolanaWalletPickerOpen(true);
      return;
    }

    const nextOption = solanaOptions.find((option) => option.key === nextProviderKey) ?? null;

    if (!nextOption) {
      setErrorMessage('Choose a Solana wallet to continue.');
      setSolanaWalletPickerOpen(true);
      return;
    }

    try {
      setIsConnectingSolana(true);
      if (selectedSolanaWallet?.adapter.name !== nextProviderKey) {
        selectSolanaWallet(nextProviderKey as import('@solana/wallet-adapter-base').WalletName);
        await new Promise((resolve) => window.setTimeout(resolve, 50));
      }
      await nextOption.adapter.connect();
      const nextAddress = nextOption.adapter.publicKey?.toBase58?.() ?? '';
      if (!nextAddress || !isValidSolanaAddress(nextAddress)) {
        throw new Error('Connected Solana wallet did not return a valid address.');
      }
      setSolanaAddress(nextAddress);
      setSolanaProviderKey(nextProviderKey);
      setSolanaWalletPickerOpen(false);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not connect the Solana wallet.');
    } finally {
      setIsConnectingSolana(false);
    }
  }

  // ---- EVM chain switching ----

  async function ensureEvmSourceChain(networkKey: Exclude<BridgeNetworkKey, 'solana-devnet'>) {
    const targetChainId = NETWORKS[networkKey].chainId;
    if (!targetChainId) return;

    const provider = getEvmProviderFromConnector(connectorClient as { transport?: { value?: unknown } } | undefined) ?? getInjectedEvmProvider();
    if (!provider) {
      throw new Error('An EVM wallet is required to add or switch bridge networks.');
    }

    const hexChainId = `0x${targetChainId.toString(16)}` as const;

    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hexChainId }],
      });
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
      setStatusMessage('Estimating route and fees...');
      setBridgeResult(null);

      const [{ kit, transferSpeed }, fromAdapter, toAdapter] = await Promise.all([
        buildBridgeKit(),
        createAdapterFor(sourceKey),
        createAdapterFor(destinationKey),
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

      console.log('[bridge] estimate result:', { amount: result.amount, fees: result.fees, gasFees: result.gasFees });
      setEstimate(result);
      setStatusMessage('Route ready.');
    } catch (error) {
      setEstimate(null);
      setStatusMessage(null);
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
      // Validate amount exceeds fees before submitting
      const inputNum = Number(effectiveBridgeAmount) || 0;
      if (inputNum > 0 && totalUsdcFee > 0 && inputNum <= totalUsdcFee) {
        setErrorMessage(`Amount must exceed the bridge fee of ${totalUsdcFee.toFixed(2)} USDC. Try a larger amount.`);
        return;
      }

      setIsBridging(true);
      setErrorMessage(null);
      setStatusMessage('Preparing the crosschain transfer...');
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

      console.log('[bridge] Building kit and adapters for', sourceKey, '→', destinationKey);
      const [{ kit, transferSpeed }, fromAdapter, toAdapter] = await Promise.all([
        buildBridgeKit(),
        createAdapterFor(sourceKey),
        createAdapterFor(destinationKey),
      ]);
      console.log('[bridge] Adapters created. sourceAddress:', sourceAddress, 'destAddress:', resolvedDestinationAddress);

      kit.on('*', (payload) => {
        const method = 'method' in payload && typeof payload.method === 'string' ? payload.method : 'bridge';
        try { console.log('[bridge] event:', method, JSON.parse(JSON.stringify(payload, (_k, v) => typeof v === 'bigint' ? v.toString() : v))); } catch { console.log('[bridge] event:', method, payload); }
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
      console.log('[bridge] Calling kit.bridge() with:', {
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
      try { console.log('[bridge] kit.bridge() returned:', JSON.parse(JSON.stringify(result, (_k, v) => typeof v === 'bigint' ? v.toString() : v))); } catch { console.log('[bridge] kit.bridge() returned:', result); }
      // Log each step's details for debugging
      if (Array.isArray((result as any).steps)) {
        (result as any).steps.forEach((step: any, i: number) => {
          try { console.log(`[bridge] step[${i}]:`, JSON.parse(JSON.stringify(step, (_k: string, v: unknown) => typeof v === 'bigint' ? v.toString() : v))); } catch { console.log(`[bridge] step[${i}]:`, step); }
          if (step.state === 'error') {
            const err = step.error;
            if (err) {
              const flat: Record<string, unknown> = {};
              // Error instances have non-enumerable props — extract them manually
              for (const k of Object.getOwnPropertyNames(err)) { try { flat[k] = (err as any)[k]; } catch {} }
              for (const k of Object.keys(err)) { try { flat[k] = (err as any)[k]; } catch {} }
              try { console.error(`[bridge] step[${i}] ERROR:`, JSON.parse(JSON.stringify(flat, (_k: string, v: unknown) => typeof v === 'bigint' ? v.toString() : v))); } catch { console.error(`[bridge] step[${i}] ERROR (raw):`, err); }
              if (err.cause) {
                console.error(`[bridge] step[${i}] cause:`, err.cause);
                // Extract Solana simulation logs from trace
                const trace = (err.cause as any)?.trace;
                if (trace) {
                  if (trace.logs) console.error(`[bridge] step[${i}] SIMULATION LOGS:\n`, trace.logs);
                  if (trace.error) console.error(`[bridge] step[${i}] SIMULATION ERROR:`, trace.error);
                  if (trace.errorDetails) console.error(`[bridge] step[${i}] ERROR DETAILS:`, trace.errorDetails);
                  if (trace.walletAddress) console.error(`[bridge] step[${i}] wallet:`, trace.walletAddress);
                  if (trace.network) console.error(`[bridge] step[${i}] network:`, trace.network);
                  if (trace.currentBalanceSol) console.error(`[bridge] step[${i}] SOL balance:`, trace.currentBalanceSol);
                }
              }
              if ((err as any).logs) console.error(`[bridge] step[${i}] logs:`, (err as any).logs);
              if ((err as any).context) console.error(`[bridge] step[${i}] context:`, (err as any).context);
            }
            console.error(`[bridge] step[${i}] errorMessage:`, step.errorMessage);
          }
        });
      }

      setBridgeResult(result);
      setStatusMessage(result.state === 'success' ? 'Bridge completed successfully.' : 'Bridge submitted. Monitor the steps below.');
      setBridgeStatusCard({
        state: result.state === 'success' ? 'success' : 'pending',
        message: result.state === 'success' ? 'Bridge completed successfully.' : 'Bridge is still pending.',
      });
      if (result.state === 'success') {
        refreshBalances();
        window.setTimeout(() => {
          refreshBalances();
        }, 4000);
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
      console.error('[bridge] Bridge failed:', error);
      setBridgeResult(null);
      setStatusMessage(null);
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

  const activeSolanaOption = solanaProviderKey
    ? solanaOptions.find((option) => option.key === solanaProviderKey) ?? null
    : null;
  const sourceWalletLabel =
    sourceNetwork.ecosystem === 'solana'
      ? solanaAddress
        ? `Solana: ${activeSolanaOption?.label ?? 'Connected'}`
        : 'Choose Solana wallet'
      : evmAddress
        ? 'Wallet connected'
        : 'Select wallet';
  const destinationWalletLabel =
    destinationNetwork.ecosystem === 'solana'
      ? resolvedDestinationAddress
        ? `Solana: ${activeSolanaOption?.label ?? 'Connected'}`
        : 'Choose Solana wallet'
      : resolvedDestinationAddress
        ? 'Recipient ready'
        : 'Select wallet';

  // ---- Render ----

  return (
    <ConnectButton.Custom>
      {({ account, mounted, openConnectModal }) => {
        const connected = mounted && Boolean(account);
        const hasBridgeActivity = Boolean(statusMessage || errorMessage || estimate || bridgeResult || eventLog.length > 0);
        const sourceWalletDisplayLabel = hasMounted ? sourceWalletLabel : 'Select wallet';
        const destinationWalletDisplayLabel = hasMounted ? destinationWalletLabel : 'Select wallet';
        const needsEvmWalletForDestination =
          sourceNetwork.ecosystem === 'solana' &&
          destinationNetwork.ecosystem === 'evm' &&
          !connected &&
          !destinationAddressIsValid;
        const needsSolanaWalletForDestination =
          sourceNetwork.ecosystem === 'evm' &&
          destinationNetwork.ecosystem === 'solana' &&
          !solanaAddress &&
          !destinationAddressIsValid;

        // Wallet mismatch: source wallet check with ecosystem-specific messages
        const sourceWalletMissing =
          sourceNetwork.ecosystem === 'solana'
            ? !solanaAddress
            : !connected;

        const primaryLabel =
          sourceNetwork.ecosystem === 'solana' && !solanaAddress
            ? isConnectingSolana
              ? 'CONNECTING SOLANA'
              : 'CONNECT SOLANA WALLET'
            : sourceNetwork.ecosystem === 'evm' && !connected
              ? 'CONNECT EVM WALLET'
              : needsEvmWalletForDestination
                ? 'CONNECT EVM WALLET FOR DESTINATION'
                : needsSolanaWalletForDestination
                  ? 'CONNECT SOLANA WALLET'
                  : needsEvmChainSwitch
                    ? isAddingChain || isSwitchingChain
                      ? 'PREPARING NETWORK'
                      : `SWITCH TO ${sourceNetwork.shortLabel.toUpperCase()}`
                  : !estimate
                    ? 'ESTIMATING ROUTE'
                    : isBridging
                      ? getBridgeActionLabel(eventLog, bridgeResult, sourceNetwork.ecosystem)
                      : 'REVIEW & BRIDGE';
        const primaryActionBusy = isConnectingSolana || isAddingChain || isSwitchingChain || isEstimating || isBridging;
        const hasBridgeActivityPanel = Boolean(bridgeStatusCard || statusMessage || errorMessage || estimate || bridgeResult);
        const summaryReceiveLabel = estimate ? `~${estimatedReceiveAmount} USDC` : '--';

        const handlePrimaryAction = () => {
          if (sourceNetwork.ecosystem === 'solana' && !solanaAddress) {
            void connectSolanaWallet();
            return;
          }
          if (sourceNetwork.ecosystem === 'evm' && !connected) {
            openConnectModal();
            return;
          }
          // Cross-ecosystem: destination needs the other wallet type
          if (needsEvmWalletForDestination) {
            openConnectModal();
            return;
          }
          if (needsSolanaWalletForDestination && !resolvedDestinationAddress) {
            void connectSolanaWallet();
            return;
          }
          if (needsEvmChainSwitch && sourceNetwork.chainId) {
            void (async () => {
              try {
                setIsAddingChain(true);
                await ensureEvmSourceChain(sourceKey as Exclude<BridgeNetworkKey, 'solana-devnet'>);
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
          if (nextNetwork.ecosystem === 'evm' && nextNetwork.chainId && effectiveChainId !== nextNetwork.chainId) {
            void ensureEvmSourceChain(nextKey as Exclude<BridgeNetworkKey, 'solana-devnet'>).catch(() => undefined);
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
          if (nextNetwork.ecosystem === 'evm' && nextNetwork.chainId && effectiveChainId !== nextNetwork.chainId) {
            void ensureEvmSourceChain(nextSource as Exclude<BridgeNetworkKey, 'solana-devnet'>).catch(() => undefined);
          }
        };

        const handleSelectSolanaWallet = (optionKey: string) => {
          setSolanaProviderKey(optionKey);
          window.setTimeout(() => {
            void connectSelectedSolanaWallet(optionKey);
          }, 0);
        };

        return (
          <section className="grid w-full items-start gap-6 xl:grid-cols-[381px_minmax(0,1fr)]">
            <div className="mx-auto w-full max-w-[381px] xl:mx-0">
            <div className="overflow-hidden rounded-[16px]" style={{ background: '#141e30', border: '1px solid rgba(255,255,255,0.07)' }}>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div>
                    <p className="text-[13px] font-bold text-slate-100">Bridge USDC</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">Powered by Circle CCTP V2</p>
                  </div>
                </div>

                <div className="space-y-2.5 p-4">
                  {/* From row */}
                  <div className="rounded-[12px] px-3.5 py-3" style={{ background: '#1e2d42', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-medium text-slate-500">From</p>
                      <button
                        type="button"
                        onClick={() => {
                          if (sourceNetwork.ecosystem === 'solana') {
                            if (solanaAddress) {
                              void disconnectSolanaAdapter().then(() => { setSolanaAddress(''); setErrorMessage(null); });
                              return;
                            }
                            void connectSolanaWallet();
                            return;
                          }
                          if (sourceNetwork.ecosystem === 'evm' && !connected) openConnectModal();
                        }}
                        className="text-[11px] font-semibold text-primary"
                      >
                        {sourceNetwork.ecosystem === 'solana' && solanaAddress ? 'Disconnect Solana' : sourceWalletDisplayLabel}
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
                        onClick={() => { if (destinationNetwork.ecosystem === 'solana') void connectSolanaWallet(); }}
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
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Destination</p>
                      <p className="mt-2 font-mono text-[11px] text-slate-300">
                        {resolvedDestinationAddress ? `${resolvedDestinationAddress.slice(0, 8)}...${resolvedDestinationAddress.slice(-6)}` : 'Waiting for wallet'}
                      </p>
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
                        : needsEvmWalletForDestination
                          ? false
                          : needsSolanaWalletForDestination && !resolvedDestinationAddress
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
                  statusMessage={statusMessage}
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

            <div className="xl:w-full xl:max-w-[560px]">
              <BridgeHistoryPanel
                bridgeHistory={bridgeHistory}
                claimingItemId={claimingItemId}
                onManualClaim={(item) => void handleManualClaim(item)}
              />
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

                    {/* Cross-ecosystem warning */}
                    {isCrossEcosystem ? (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 sm:col-span-2">
                        <p className="text-[11px] text-amber-300">
                          This is a cross-ecosystem bridge ({sourceNetwork.ecosystem.toUpperCase()} &rarr; {destinationNetwork.ecosystem.toUpperCase()}).
                          Ensure the destination address is correct — funds sent to the wrong address cannot be recovered.
                        </p>
                      </div>
                    ) : null}
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

            {solanaWalletPickerOpen ? (
              <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/65 px-4 py-8">
                <div className="w-full max-w-md rounded-[18px] border border-white/10 bg-[#151f33] p-4 shadow-[0_20px_60px_rgba(2,6,23,0.55)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Solana wallet</p>
                      <p className="mt-1 text-xs text-slate-300">Choose the Solana wallet to use for this bridge route.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSolanaWalletPickerOpen(false)}
                      className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold text-slate-400 transition-colors hover:border-primary/30 hover:text-primary"
                    >
                      Close
                    </button>
                  </div>

                  <div className="mt-4 space-y-2">
                    {solanaOptions.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-white/10 bg-[#132238] px-3 py-4 text-sm text-slate-400">
                        No Solana wallet was detected. Install Phantom, Solflare, or Backpack and reload the page.
                      </div>
                    ) : (
                      solanaOptions.map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => handleSelectSolanaWallet(option.key)}
                          className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-[#132238] px-3 py-2.5 text-left transition-colors hover:border-primary/30"
                        >
                          <div className="flex items-center gap-3">
                            {option.icon ? (
                              <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-white/5 ring-1 ring-white/10">
                                <img src={option.icon} alt={option.label} className="h-8 w-8 object-contain" />
                              </span>
                            ) : (
                              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/12 text-xs font-bold text-white ring-1 ring-white/5">
                                {option.label.slice(0, 2).toUpperCase()}
                              </span>
                            )}
                            <div>
                              <p className="text-sm font-semibold text-white">{option.label}</p>
                              <p className="text-xs text-slate-400">Use this wallet for Solana Devnet transfers.</p>
                            </div>
                          </div>
                          <span className="material-symbols-outlined text-[18px] text-slate-400">chevron_right</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        );
      }}
    </ConnectButton.Custom>
  );
}
