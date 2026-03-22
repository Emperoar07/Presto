'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Listbox, Transition } from '@headlessui/react';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import { useWallet } from '@solana/wallet-adapter-react';
import { VersionedMessage, VersionedTransaction } from '@solana/web3.js';
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
  SOLANA_DEVNET_RPC_URL,
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
        <Listbox.Button className="flex w-full items-center gap-2.5 rounded-[18px] border border-primary/12 bg-[linear-gradient(180deg,#202b45_0%,#1a243b_100%)] px-3 py-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all hover:border-primary/30 hover:bg-[linear-gradient(180deg,#24304d_0%,#1c2740_100%)]">
          {selectedVisual ? (
            <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-primary/12 ring-1 ring-white/5">
              <Image src={selectedVisual.iconSrc} alt={selectedNetwork.label} width={36} height={36} className="h-9 w-9" />
            </span>
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/12 text-xs font-bold text-white ring-1 ring-white/5">
              {selectedNetwork.shortLabel.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-white">{selectedNetwork.label}</p>
            <p className="text-[11px] text-slate-400">USDC on {selectedNetwork.shortLabel}</p>
          </div>
          <span className="material-symbols-outlined text-[18px] text-slate-400">expand_more</span>
        </Listbox.Button>
        <Transition
          as={Fragment}
          leave="transition ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <Listbox.Options className="absolute right-0 z-50 mt-2 min-w-[240px] rounded-[18px] border border-primary/12 bg-[#131d31] p-2 shadow-[0_18px_48px_rgba(2,6,23,0.5)]">
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
                    `rounded-[14px] px-3 py-2.5 transition-colors ${
                      disabled
                        ? 'cursor-not-allowed opacity-40'
                        : active
                          ? 'bg-[#1c2943]'
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
  const [manualDestinationAddress, setManualDestinationAddress] = useState('');
  const [destinationAddressModalOpen, setDestinationAddressModalOpen] = useState(false);
  const [destinationAddressDraft, setDestinationAddressDraft] = useState('');
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
  const [historyOpen, setHistoryOpen] = useState(false);
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
    // When a manual destination is set, always use it (user wants to send to someone else).
    if (manualDestinationAddress.trim()) return manualDestinationAddress.trim();
    // Otherwise fall back to connected wallet for the destination ecosystem.
    if (destinationNetwork.ecosystem === 'solana') return solanaAddress;
    return evmAddress ?? '';
  }, [destinationNetwork.ecosystem, evmAddress, manualDestinationAddress, solanaAddress]);

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

      const { SolanaKitAdapter } = await import('@circle-fin/adapter-solana-kit');
      const { createSolanaRpc } = await import('@solana/kit');

      const walletAddress = solanaBridgeProvider.address ?? '';
      const rpcCache = new Map<string, ReturnType<typeof createSolanaRpc>>();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adapter = new SolanaKitAdapter(
        ({
          getRpc: ({ chain }: { chain: { name: string; rpcEndpoints?: string[] } }) => {
            const cached = rpcCache.get(chain.name);
            if (cached) return cached;
            const rpcUrl = chain.rpcEndpoints?.[0] ?? SOLANA_DEVNET_RPC_URL;
            const rpc = createSolanaRpc(rpcUrl);
            rpcCache.set(chain.name, rpc);
            return rpc;
          },
          getSigner: async (): Promise<any> => ({
            address: walletAddress,
            signTransactions: async (transactions: unknown[]) => {
              console.log('[solana-signer] signTransactions called with', transactions.length, 'tx(s)');
              return Promise.all(transactions.map(async (compiledTx: any, idx: number) => {
                const messageBytes: Uint8Array = compiledTx.messageBytes;
                console.log(`[solana-signer] signTransactions[${idx}]: messageBytes length =`, messageBytes.length);
                const message = VersionedMessage.deserialize(messageBytes);
                const tx = new VersionedTransaction(message);
                console.log(`[solana-signer] signTransactions[${idx}]: calling wallet signTransaction...`);
                const signed = await signSolanaTransaction!(tx);
                const sig = signed.signatures[0];
                console.log(`[solana-signer] signTransactions[${idx}]: wallet returned signed tx, sig[0] length =`, sig?.length);
                return { [walletAddress]: sig } as Record<string, Uint8Array>;
              }));
            },
            signAndSendTransactions: async (transactions: unknown[]) => {
              console.log('[solana-signer] signAndSendTransactions called with', transactions.length, 'tx(s)');
              return Promise.all((transactions as any[]).map(async (compiledTx: any) => {
                const messageBytes: Uint8Array = compiledTx.messageBytes;
                const message = VersionedMessage.deserialize(messageBytes);
                const tx = new VersionedTransaction(message);
                const signed = await signSolanaTransaction!(tx);
                return signed.signatures[0];
              }));
            },
          }),
        } as any),
        { addressContext: 'user-controlled' } as any,
      );
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

  // Clear manual destination address when the route ecosystem changes.
  useEffect(() => {
    setManualDestinationAddress('');
  }, [sourceKey, destinationKey]);

  // ---- Route management ----

  const commitRoute = (nextSource: BridgeNetworkKey, nextDestination: BridgeNetworkKey) => {
    if (nextSource === nextDestination) return;
    hasInteractedRef.current = true;
    setSourceKey(nextSource);
    setDestinationKey(nextDestination);
    setManualDestinationAddress('');

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
      setStatusMessage('Route ready. Review the fees and then bridge when you are ready.');
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

      const hasCustomDest = !!manualDestinationAddress.trim();
      const sdkAmount = effectiveBridgeAmount;
      console.log('[bridge] Calling kit.bridge() with:', {
        from: { chain: sourceNetwork.bridgeChain, ecosystem: sourceNetwork.ecosystem },
        to: { chain: destinationNetwork.bridgeChain, ecosystem: destinationNetwork.ecosystem, recipientAddress: hasCustomDest ? resolvedDestinationAddress : '(own wallet)' },
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
              if (err.cause) console.error(`[bridge] step[${i}] cause:`, err.cause);
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
                : needsSolanaWalletForDestination && !manualDestinationAddress
                  ? 'CONNECT SOLANA OR ENTER ADDRESS'
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
          if (needsEvmWalletForDestination && !manualDestinationAddress) {
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
          <section className="mx-auto max-w-[400px]">
            <div className="rounded-[18px] border border-primary/10 bg-[#121a2d] p-2 shadow-[0_18px_48px_rgba(2,6,23,0.34)] overflow-visible">
                <div className="rounded-[15px] border border-white/10 bg-[#151f33] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-slate-400">Sell</p>
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
                      placeholder="0"
                      className="mt-3 w-full bg-transparent text-4xl font-semibold tracking-tight text-white outline-none placeholder:text-white"
                    />
                  </div>

                  <div className="w-full max-w-[200px] space-y-2">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setHistoryOpen((current) => !current)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-[#132238] text-slate-300 transition-colors hover:border-primary/30 hover:text-primary"
                        aria-label="Toggle bridge history"
                      >
                        <span className="material-symbols-outlined text-[17px]">history</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (sourceNetwork.ecosystem === 'solana') {
                            if (solanaAddress) {
                              void disconnectSolanaAdapter().then(() => {
                                setSolanaAddress('');
                                setErrorMessage(null);
                              });
                              return;
                            }
                            void connectSolanaWallet();
                            return;
                          }
                          if (sourceNetwork.ecosystem === 'evm' && !connected) {
                            openConnectModal();
                          }
                        }}
                        className="ml-auto block text-[11px] font-semibold text-primary"
                      >
                        {sourceNetwork.ecosystem === 'solana' && solanaAddress ? 'Disconnect Solana' : sourceWalletDisplayLabel}
                      </button>
                    </div>

                    <BridgeNetworkSelector value={sourceKey} onChange={handleSourceNetworkChange} disabledKey={destinationKey} />
                  </div>
                </div>

                <div className="mt-4 text-xs text-slate-400">{formatBalanceLabel(sourceBalance)}</div>
              </div>

              <div className="-my-2 flex justify-center">
                <button
                  type="button"
                  onClick={handleSwapRoute}
                  className="z-10 flex h-10 w-10 items-center justify-center rounded-xl border border-primary/15 bg-[#132238] text-slate-300 shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition-colors hover:border-primary/35 hover:text-primary"
                >
                  <span className="material-symbols-outlined text-2xl">south</span>
                </button>
              </div>

              <div className="rounded-[15px] border border-white/10 bg-[#151f33] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-slate-400">Buy</p>
                    <div className="mt-3 text-4xl font-semibold tracking-tight text-white">
                      {estimate ? estimatedReceiveAmount : '0'}
                    </div>
                  </div>

                  <div className="w-full max-w-[200px] space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (destinationNetwork.ecosystem === 'solana') {
                          void connectSolanaWallet();
                        }
                      }}
                      className="ml-auto block text-[11px] font-semibold text-primary"
                    >
                      {destinationWalletDisplayLabel}
                    </button>

                    <BridgeNetworkSelector value={destinationKey} onChange={handleDestinationNetworkChange} disabledKey={sourceKey} />
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-slate-400">{formatBalanceLabel(destinationBalance)}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setDestinationAddressDraft(manualDestinationAddress);
                      setDestinationAddressModalOpen(true);
                    }}
                    className="text-[10px] font-semibold text-primary hover:text-primary/80 transition-colors"
                  >
                    {manualDestinationAddress
                      ? `Custom: ${manualDestinationAddress.slice(0, 6)}...${manualDestinationAddress.slice(-4)}`
                      : 'Send to another address'}
                  </button>
                </div>

                {/* Show active custom destination */}
                {manualDestinationAddress ? (
                  <div className="mt-2 flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5">
                    <p className="text-[10px] text-slate-300 truncate mr-2">
                      Sending to: {manualDestinationAddress.slice(0, 8)}...{manualDestinationAddress.slice(-6)}
                    </p>
                    <button
                      type="button"
                      onClick={() => setManualDestinationAddress('')}
                      className="text-[10px] font-semibold text-rose-400 hover:text-rose-300 shrink-0"
                    >
                      Reset
                    </button>
                  </div>
                ) : null}
                </div>
                <button
                  type="button"
                  onClick={handlePrimaryAction}
                  disabled={
                    primaryActionBusy ||
                    (sourceWalletMissing
                      ? false
                      : needsEvmWalletForDestination && !manualDestinationAddress
                        ? false
                        : needsSolanaWalletForDestination && !resolvedDestinationAddress
                          ? false
                          : needsEvmChainSwitch
                            ? false
                            : !estimate)
                  }
                  className="mt-3 w-full rounded-[16px] bg-gradient-to-r from-[#1fb6ff] to-[#0ea5e9] px-5 py-3 text-sm font-black uppercase tracking-[0.08em] text-background-dark transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    {primaryActionBusy ? (
                      <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-background-dark/30 border-t-background-dark" />
                    ) : null}
                    <span>{primaryLabel}</span>
                  </span>
                </button>

                {/* Wallet mismatch hints — only shown briefly, not blocking */}
            </div>

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

            {historyOpen ? (
              <BridgeHistoryPanel
                bridgeHistory={bridgeHistory}
                claimingItemId={claimingItemId}
                onClose={() => setHistoryOpen(false)}
                onManualClaim={(item) => void handleManualClaim(item)}
              />
            ) : null}

            {/* ---- Confirmation modal ---- */}
            {confirmOpen && estimate ? (
              <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/65 px-4 py-8">
                <div className="w-full max-w-md rounded-[18px] border border-white/10 bg-[#151f33] p-4 shadow-[0_20px_60px_rgba(2,6,23,0.55)]">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Confirm Bridge</p>
                    <button
                      type="button"
                      onClick={() => setConfirmOpen(false)}
                      className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold text-slate-400 transition-colors hover:border-primary/30 hover:text-primary"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {/* Amount */}
                    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#132238] px-3 py-2.5">
                      <span className="text-xs text-slate-400">{exactAmountMode ? 'Sending (incl. fees)' : 'Amount'}</span>
                      <span className="text-sm font-semibold text-white">{compactAmount(exactAmountMode ? effectiveBridgeAmount : amount, 6)} USDC</span>
                    </div>

                    {/* Route */}
                    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#132238] px-3 py-2.5">
                      <span className="text-xs text-slate-400">Route</span>
                      <span className="text-sm font-semibold text-white">
                        {sourceNetwork.shortLabel} &rarr; {destinationNetwork.shortLabel}
                      </span>
                    </div>

                    {/* Source address */}
                    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#132238] px-3 py-2.5">
                      <span className="text-xs text-slate-400">From</span>
                      <span className="text-xs font-mono text-slate-300 truncate max-w-[200px]" title={sourceAddress}>
                        {sourceAddress.slice(0, 6)}...{sourceAddress.slice(-4)}
                      </span>
                    </div>

                    {/* Destination address */}
                    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#132238] px-3 py-2.5">
                      <span className="text-xs text-slate-400">To</span>
                      <span className="text-xs font-mono text-slate-300 truncate max-w-[200px]" title={resolvedDestinationAddress}>
                        {resolvedDestinationAddress.slice(0, 6)}...{resolvedDestinationAddress.slice(-4)}
                      </span>
                    </div>

                    {/* You receive */}
                    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#132238] px-3 py-2.5">
                      <span className="text-xs text-slate-400">You receive</span>
                      <span className="text-sm font-semibold text-emerald-400">{estimatedReceiveAmount} USDC</span>
                    </div>

                    {/* Fees */}
                    {estimate.fees.length > 0 ? (
                      <div className="rounded-xl border border-white/10 bg-[#132238] px-3 py-2.5">
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
                    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#132238] px-3 py-2.5">
                      <span className="text-xs text-slate-400">Estimated time</span>
                      <span className="text-xs text-slate-300">~1-3 minutes</span>
                    </div>

                    {/* Cross-ecosystem warning */}
                    {isCrossEcosystem ? (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
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
                    className="mt-4 w-full rounded-[16px] bg-gradient-to-r from-[#1fb6ff] to-[#0ea5e9] px-5 py-3 text-sm font-black uppercase tracking-[0.08em] text-background-dark transition-opacity hover:opacity-95"
                  >
                    CONFIRM BRIDGE
                  </button>
                </div>
              </div>
            ) : null}

            {/* Destination address modal */}
            {destinationAddressModalOpen ? (
              <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/65 px-4 py-8">
                <div className="w-full max-w-md rounded-[18px] border border-white/10 bg-[#151f33] p-4 shadow-[0_20px_60px_rgba(2,6,23,0.55)]">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Custom Destination Address
                    </p>
                    <button
                      type="button"
                      onClick={() => setDestinationAddressModalOpen(false)}
                      className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold text-slate-400 transition-colors hover:border-primary/30 hover:text-primary"
                    >
                      Cancel
                    </button>
                  </div>

                  <p className="mt-3 text-xs text-slate-400">
                    Paste a {destinationNetwork.ecosystem === 'solana' ? 'Solana' : 'EVM'} address to send USDC to someone else on {destinationNetwork.label}.
                  </p>

                  <input
                    value={destinationAddressDraft}
                    onChange={(e) => setDestinationAddressDraft(e.target.value)}
                    placeholder={
                      destinationNetwork.ecosystem === 'solana'
                        ? 'Solana address (base58)'
                        : '0x... EVM address'
                    }
                    className="mt-3 w-full rounded-xl border border-white/10 bg-[#132238] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-primary/30"
                    autoFocus
                  />

                  {destinationAddressDraft.trim() &&
                    !(destinationNetwork.ecosystem === 'solana'
                      ? isValidSolanaAddress(destinationAddressDraft.trim())
                      : isValidEvmAddress(destinationAddressDraft.trim())) ? (
                    <p className="mt-1.5 text-[10px] text-rose-400">
                      Invalid {destinationNetwork.ecosystem === 'solana' ? 'Solana' : 'EVM'} address
                    </p>
                  ) : null}

                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = destinationAddressDraft.trim();
                        const isValid = destinationNetwork.ecosystem === 'solana'
                          ? isValidSolanaAddress(trimmed)
                          : isValidEvmAddress(trimmed);
                        if (!trimmed || !isValid) return;
                        setManualDestinationAddress(trimmed);
                        setDestinationAddressModalOpen(false);
                      }}
                      disabled={
                        !destinationAddressDraft.trim() ||
                        !(destinationNetwork.ecosystem === 'solana'
                          ? isValidSolanaAddress(destinationAddressDraft.trim())
                          : isValidEvmAddress(destinationAddressDraft.trim()))
                      }
                      className="flex-1 rounded-[14px] bg-gradient-to-r from-[#1fb6ff] to-[#0ea5e9] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.06em] text-background-dark transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Confirm Address
                    </button>
                    {manualDestinationAddress ? (
                      <button
                        type="button"
                        onClick={() => {
                          setManualDestinationAddress('');
                          setDestinationAddressModalOpen(false);
                        }}
                        className="rounded-[14px] border border-white/10 px-4 py-2.5 text-xs font-semibold text-slate-400 transition-colors hover:border-primary/30 hover:text-primary"
                      >
                        Use My Wallet
                      </button>
                    ) : null}
                  </div>
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
