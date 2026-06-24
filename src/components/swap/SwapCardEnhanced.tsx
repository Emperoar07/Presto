'use client';
import { useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getTokens } from '@/config/tokens';
import { useAccount, useChainId, usePublicClient, useWalletClient, useReadContracts } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { formatUnits, parseUnits, encodeFunctionData } from 'viem';
import { approveToken, getTokenBalancesBatch, toUint128 } from '@/lib/tempoClient';
import toast from 'react-hot-toast';
import { TxToast } from '@/components/common/TxToast';
import { getExplorerTxUrl } from '@/lib/explorer';
import { SlippageSettings } from './SlippageSettings';
import {
  calculatePriceImpact,
  getPriceImpactWarning,
  requiresPriceImpactConfirmation,
  formatPriceImpact,
  calculateMinAmountOut
} from '@/lib/priceImpact';
import { parseContractError, logError, isUserCancellation } from '@/lib/errorHandling';
import {
  HUB_AMM_ABI,
  TEMPO_DEX_ABI,
  ARC_STABLESWAP_ABI,
  isArcChain,
  isTempoNativeChain,
  getDexAddress,
  getContractAddresses,
  UNISWAP_V2_ROUTER_SWAP_ABI
} from '@/config/contracts';
import { writeContractWithRetry } from '@/lib/txRetry';
import { readContractWithFallback, invalidateQuoteCache } from '@/lib/rpc';
import { TokenModal } from '@/components/common/TokenModal';
import {
  createLocalActivityItem,
  patchLocalActivityItem,
  upsertLocalActivityHistoryItem,
} from '@/lib/activityHistory';
import { readLocalActivityHistory, type LocalActivityRecord } from '@/lib/activityHistory';
import { emitPrestoDataRefresh, refreshPrestoQueries, subscribePrestoDataRefresh } from '@/lib/appDataRefresh';
import { useTokenBalances } from '@/hooks/useApiQueries';
import { isStableBasketToken } from '@/lib/stableswap';
import { useTransactionExecution } from '@/hooks/useTransactionExecution';
import {
  fetchTokenPrices,
  getTokenUsdPrice,
  tokenToUsdAmount,
  usdToTokenAmount,
  type TokenPriceMap,
} from '@/lib/tokenPrices';
import {
  arcGasHeadroom,
  buildSynRouteSwap,
  getSynRouteApprovalMode,
  getSynRouteQuote,
  isSynRouteChain,
  signPermit2,
  toTransactionValue,
  toSlippageBps,
} from '@/lib/synroute';
import { getUniswapQuote, isUniswapSupportedChain, type UniswapQuoteResponse } from '@/lib/uniswapRouter';

const DEFAULT_SLIPPAGE = 0.5; // 0.5%
const DEFAULT_DEADLINE = 20; // 20 minutes
type AmountDisplayMode = 'token' | 'usd';

const SYNROUTE_ONLY_SYMBOLS = new Set(['cirbtc']);

const formatSwapBalance = (value: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return '0';
  return parsed.toLocaleString('en-US', {
    minimumFractionDigits: parsed < 1 ? 4 : 2,
    maximumFractionDigits: 6,
  });
};

/** Format a swap rate with enough significant digits so small values are not rounded to zero. */
const formatSmartRate = (rate: number): string => {
  if (!Number.isFinite(rate) || rate <= 0) return '0';
  if (rate >= 1) return rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  // For sub-1 rates, find first non-zero digit and show at least 4 significant digits
  const str = rate.toFixed(20);
  const match = str.match(/^0\.0*/);
  if (!match) return rate.toFixed(6);
  const leadingZeros = match[0].length - 2; // count zeros after "0."
  const precision = Math.max(leadingZeros + 4, 6);
  return rate.toFixed(precision).replace(/0+$/, '').replace(/\.$/, '');
};

const QuoteDots = () => (
  <span className="quote-dots">
    <span /><span /><span />
  </span>
);

export function SwapCardEnhanced() {
  const chainId = useChainId();
  const queryClient = useQueryClient();
  // Memoize tokens to prevent unnecessary re-renders
  const tokens = useMemo(() => getTokens(chainId), [chainId]);
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { execute } = useTransactionExecution();
  const [inputAmount, setInputAmount] = useState('');
  const [outputAmount, setOutputAmount] = useState('');
  const [inputTokenAmount, setInputTokenAmount] = useState('');
  const [outputTokenAmount, setOutputTokenAmount] = useState('');
  const [inputDisplayMode, setInputDisplayMode] = useState<AmountDisplayMode>('token');
  const [outputDisplayMode, setOutputDisplayMode] = useState<AmountDisplayMode>('token');
  const [exactField, setExactField] = useState<'input' | 'output'>('input');
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapStage, setSwapStage] = useState<'idle' | 'approving' | 'swapping'>('idle');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [swapHistory, setSwapHistory] = useState<LocalActivityRecord[]>([]);
  const historyAutoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swapCardRef = useRef<HTMLDivElement>(null);
  const [swapCardHeight, setSwapCardHeight] = useState<number | null>(null);

  // Token State
  const [inputTokenAddress, setInputTokenAddress] = useState(tokens[0]?.address);
  const [outputTokenAddress, setOutputTokenAddress] = useState(tokens[1]?.address);

  // Settings State
  const [slippageTolerance, setSlippageTolerance] = useState(DEFAULT_SLIPPAGE);
  const [deadline, setDeadline] = useState(DEFAULT_DEADLINE);
  const [showSettings, setShowSettings] = useState(false);
  const [showInputTokenModal, setShowInputTokenModal] = useState(false);
  const [showOutputTokenModal, setShowOutputTokenModal] = useState(false);

  // Gas Fee State
  const [gasPrice, setGasPrice] = useState<bigint | null>(null);

  // Fetch gas price from publicClient
  useEffect(() => {
    if (!publicClient) return;
    let active = true;
    const fetchGasPrice = async () => {
      try {
        const price = await publicClient.getGasPrice();
        if (active) setGasPrice(price);
      } catch (err) {
        console.error("Failed to fetch gas price", err);
      }
    };
    fetchGasPrice();
    const interval = setInterval(fetchGasPrice, 30_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [publicClient]);

  // Measure the Swap Card height dynamically to size the History panel
  useEffect(() => {
    if (!swapCardRef.current) return;
    const updateHeight = () => {
      if (swapCardRef.current) {
        setSwapCardHeight(swapCardRef.current.offsetHeight);
      }
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(swapCardRef.current);
    return () => observer.disconnect();
  }, [historyOpen]);

  // Load saved settings from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedSlippage = localStorage.getItem('swapSlippage');
      const savedDeadline = localStorage.getItem('swapDeadline');

      if (savedSlippage) setSlippageTolerance(parseFloat(savedSlippage));
      if (savedDeadline) setDeadline(parseInt(savedDeadline));
    }
  }, []);

  // Save settings to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('swapSlippage', slippageTolerance.toString());
      localStorage.setItem('swapDeadline', deadline.toString());
    }
  }, [slippageTolerance, deadline]);

  // Sync token state with chain changes
  useEffect(() => {
    if (tokens.length > 0) {
      if (!tokens.find(t => t.address === inputTokenAddress)) setInputTokenAddress(tokens[0].address);
      if (!tokens.find(t => t.address === outputTokenAddress)) setOutputTokenAddress(tokens[1].address);
    }
  }, [chainId, tokens, inputTokenAddress, outputTokenAddress]);

  const inputToken = tokens.find(t => t.address === inputTokenAddress) || tokens[0];
  const outputToken = tokens.find(t => t.address === outputTokenAddress) || tokens[1];
  const requiresSynRoute = SYNROUTE_ONLY_SYMBOLS.has(inputToken?.symbol?.toLowerCase()) ||
    SYNROUTE_ONLY_SYMBOLS.has(outputToken?.symbol?.toLowerCase());

  const [balanceIn, setBalanceIn] = useState('0.00');
  const [balanceOut, setBalanceOut] = useState('0.00');
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);
  const [tokenPrices, setTokenPrices] = useState<TokenPriceMap>({});
  const [priceError, setPriceError] = useState<string | null>(null);
  const {
    data: polledBalances = {},
    isFetching: isPollingBalances,
    refetch: refetchPolledBalances,
  } = useTokenBalances();

  const refreshSwapHistory = useCallback(() => {
    const items = readLocalActivityHistory()
      .filter((item) => item.category === 'swaps')
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 8);
    setSwapHistory(items);
  }, []);

  const startHistoryAutoClose = useCallback(() => {
    if (historyAutoCloseRef.current) clearTimeout(historyAutoCloseRef.current);
    historyAutoCloseRef.current = setTimeout(() => setHistoryOpen(false), 10_000);
  }, []);

  const resetHistoryAutoClose = useCallback(() => {
    if (!historyOpen) return;
    startHistoryAutoClose();
  }, [historyOpen, startHistoryAutoClose]);

  // Get the correct DEX address and ABI based on chain
  const isTempoChain = isTempoNativeChain(chainId);
  const isArcTestnet = isArcChain(chainId);
  const dexAddress = getDexAddress(chainId);
  const dexAbi = isTempoChain ? TEMPO_DEX_ABI : HUB_AMM_ABI;

  const { ARC_STABLESWAP_ADDRESS } = getContractAddresses(chainId);
  const isStableSwapRoute = useMemo(() => {
    return !!(isArcTestnet &&
      ARC_STABLESWAP_ADDRESS &&
      ARC_STABLESWAP_ADDRESS !== '0x0000000000000000000000000000000000000000' &&
      isStableBasketToken(inputToken?.symbol) &&
      isStableBasketToken(outputToken?.symbol));
  }, [isArcTestnet, ARC_STABLESWAP_ADDRESS, inputToken?.symbol, outputToken?.symbol]);

  // Fetch token balances
  const fetchBalances = useCallback(async () => {
    if (!publicClient || !address) {
      setBalanceIn('0.00');
      setBalanceOut('0.00');
      return;
    }

    const nextInputToken = tokens.find(t => t.address === inputTokenAddress) || tokens[0];
    const nextOutputToken = tokens.find(t => t.address === outputTokenAddress) || tokens[1];

    if (!nextInputToken || !nextOutputToken) {
      setBalanceIn('0.00');
      setBalanceOut('0.00');
      return;
    }

    setIsBalanceLoading(true);
    try {
      const balances = await getTokenBalancesBatch(publicClient, address, [
        { address: nextInputToken.address, decimals: nextInputToken.decimals },
        { address: nextOutputToken.address, decimals: nextOutputToken.decimals },
      ]);
      setBalanceIn(balances[nextInputToken.address] ?? '0.00');
      setBalanceOut(balances[nextOutputToken.address] ?? '0.00');
    } catch (error) {
      logError(error, 'Failed to fetch balances');
    } finally {
      setIsBalanceLoading(false);
    }
  }, [address, inputTokenAddress, outputTokenAddress, publicClient, tokens]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  useEffect(() => {
    let active = true;
    const loadPrices = async () => {
      try {
        const prices = await fetchTokenPrices();
        if (!active) return;
        setTokenPrices(prices);
        setPriceError(null);
      } catch (error) {
        if (!active) return;
        setPriceError(error instanceof Error ? error.message : 'Price data unavailable');
      }
    };
    loadPrices();
    const intervalId = window.setInterval(loadPrices, 60_000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!inputToken || !outputToken) return;
    const nextInput = (polledBalances as Record<string, string>)[inputToken.address];
    const nextOutput = (polledBalances as Record<string, string>)[outputToken.address];
    if (nextInput != null) setBalanceIn(nextInput);
    if (nextOutput != null) setBalanceOut(nextOutput);
  }, [inputToken, outputToken, polledBalances]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refetchPolledBalances();
      void fetchBalances();
    }, 15_000);
    return () => window.clearInterval(intervalId);
  }, [fetchBalances, refetchPolledBalances]);

  useEffect(() => {
    refreshSwapHistory();
  }, [refreshSwapHistory]);

  useEffect(() => {
    if (!historyOpen) return;
    refreshSwapHistory();
    startHistoryAutoClose();
    const intervalId = window.setInterval(refreshSwapHistory, 5000);
    return () => {
      window.clearInterval(intervalId);
      if (historyAutoCloseRef.current) clearTimeout(historyAutoCloseRef.current);
    };
  }, [historyOpen, refreshSwapHistory, startHistoryAutoClose]);

  useEffect(() => {
    return subscribePrestoDataRefresh(() => {
      void refetchPolledBalances();
      void fetchBalances();
    });
  }, [fetchBalances, refetchPolledBalances]);

  // Note: Tempo DEX uses getPool instead of tokenReserves
  // For now, we'll skip reserves-based price impact for Tempo chain
  const { data: reservesData } = useReadContracts({
    contracts: isTempoChain ? [] : [
      {
        address: dexAddress as `0x${string}`,
        abi: HUB_AMM_ABI,
        functionName: 'tokenReserves',
        args: [inputTokenAddress],
      },
      {
        address: dexAddress as `0x${string}`,
        abi: HUB_AMM_ABI,
        functionName: 'pathReserves',
        args: [inputTokenAddress],
      },
      {
        address: dexAddress as `0x${string}`,
        abi: HUB_AMM_ABI,
        functionName: 'tokenReserves',
        args: [outputTokenAddress],
      },
      {
        address: dexAddress as `0x${string}`,
        abi: HUB_AMM_ABI,
        functionName: 'pathReserves',
        args: [outputTokenAddress],
      },
    ],
    query: {
      enabled: !isTempoChain && !!dexAddress && !!inputTokenAddress && !!outputTokenAddress,
      staleTime: 5_000,
    },
  });

  const inputReserves = reservesData?.[0]?.result as bigint | undefined;
  const inputPathReserves = reservesData?.[1]?.result as bigint | undefined;
  const outputReserves = reservesData?.[2]?.result as bigint | undefined;
  const outputPathReserves = reservesData?.[3]?.result as bigint | undefined;

  // Safe parse function
  const safeParseUnits = (value: string, decimals: number) => {
    try {
      if (!value || value === '.' || isNaN(Number(value))) return 0n;
      return parseUnits(value, decimals);
    } catch {
      return 0n;
    }
  };

  const normalizeDisplayAmount = useCallback((value: string, token: typeof inputToken, mode: AmountDisplayMode) => {
    if (mode === 'token') return value;
    return usdToTokenAmount(value, token, tokenPrices);
  }, [tokenPrices]);

  const formatDisplayAmount = useCallback((tokenAmount: string, token: typeof inputToken, mode: AmountDisplayMode) => {
    if (!tokenAmount) return '';
    if (mode === 'token') return tokenAmount;
    return tokenToUsdAmount(tokenAmount, token, tokenPrices);
  }, [tokenPrices]);

  const readLocalQuote = useCallback(async (amount: bigint) => {
    if (!publicClient || amount <= 0n) return 0n;
    if (isStableSwapRoute) {
      return readContractWithFallback<bigint>(publicClient, {
        address: ARC_STABLESWAP_ADDRESS as `0x${string}`,
        abi: ARC_STABLESWAP_ABI,
        functionName: 'getQuote',
        args: [inputToken.address, outputToken.address, amount],
      });
    }
    if (isTempoChain) {
      return readContractWithFallback<bigint>(publicClient, {
        address: dexAddress as `0x${string}`,
        abi: TEMPO_DEX_ABI,
        functionName: 'quoteSwapExactAmountIn',
        args: [inputToken.address, outputToken.address, toUint128(amount)],
      });
    }
    return readContractWithFallback<bigint>(publicClient, {
      address: dexAddress as `0x${string}`,
      abi: HUB_AMM_ABI,
      functionName: 'getQuote',
      args: [inputToken.address, outputToken.address, amount],
    });
  }, [
    ARC_STABLESWAP_ADDRESS,
    dexAddress,
    inputToken.address,
    isStableSwapRoute,
    isTempoChain,
    outputToken.address,
    publicClient,
  ]);

  const findInputForExactOutput = useCallback(async (desiredOut: bigint) => {
    if (desiredOut <= 0n) return null;
    let low = 1n;
    let high = safeParseUnits(balanceIn, inputToken.decimals);
    if (high <= 0n) {
      high = 10n ** BigInt(inputToken.decimals);
    }

    let highQuote = await readLocalQuote(high);
    for (let i = 0; i < 16 && highQuote < desiredOut; i++) {
      high *= 2n;
      highQuote = await readLocalQuote(high);
    }
    if (highQuote < desiredOut) return null;

    for (let i = 0; i < 48; i++) {
      const mid = (low + high) / 2n;
      const quote = await readLocalQuote(mid);
      if (quote >= desiredOut) {
        high = mid;
      } else {
        low = mid + 1n;
      }
    }
    return high;
  }, [balanceIn, inputToken.decimals, readLocalQuote]);

  const calculateArcSpotOutput = useCallback((amount: bigint) => {
    if (amount <= 0n) return 0n;

    // Use the constant product formula WITH fee to match the on-chain getQuote.
    // amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
    // This way price impact only reflects curve slippage, not the 0.3% fee.
    const cpSwap = (amtIn: bigint, rIn: bigint, rOut: bigint): bigint => {
      if (rIn <= 0n || rOut <= 0n) return 0n;
      const amtWithFee = amtIn * 997n;
      return (amtWithFee * rOut) / (rIn * 1000n + amtWithFee);
    };

    const inputIsHub = !inputToken.quoteTokenId;
    const outputIsHub = !outputToken.quoteTokenId;

    if (inputIsHub && outputReserves && outputPathReserves && outputPathReserves > 0n) {
      return cpSwap(amount, outputPathReserves, outputReserves);
    }

    if (outputIsHub && inputReserves && inputPathReserves && inputReserves > 0n) {
      return cpSwap(amount, inputReserves, inputPathReserves);
    }

    if (inputReserves && inputPathReserves && outputReserves && outputPathReserves && inputReserves > 0n && outputPathReserves > 0n) {
      // Two-hop: token -> hub -> token
      const hubAmount = cpSwap(amount, inputReserves, inputPathReserves);
      return cpSwap(hubAmount, outputPathReserves, outputReserves);
    }

    return 0n;
  }, [
    inputPathReserves,
    inputReserves,
    inputToken.quoteTokenId,
    outputPathReserves,
    outputReserves,
    outputToken.quoteTokenId,
  ]);

  // A single comparable route in the aggregator race.
  type RouteOption = {
    source: 'local' | 'synroute' | 'uniswap';
    label: string;
    // exact-in: output amount; exact-out: input amount (raw, in token base units)
    raw: bigint;
    // human-readable amount in the relevant token's decimals
    display: string;
    isBest: boolean;
  };

  // Quote fetching with price impact
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<Error | null>(null);
  const [priceImpact, setPriceImpact] = useState<number>(0);
  const [quoteSource, setQuoteSource] = useState<'local' | 'synroute' | 'uniswap'>('local');
  const [synRouteRoute, setSynRouteRoute] = useState('');
  const [uniswapRoute, setUniswapRoute] = useState<{ router: `0x${string}`; path: `0x${string}`[] } | null>(null);
  const [routeQuotes, setRouteQuotes] = useState<RouteOption[]>([]);
  // Track quote request version to cancel stale requests
  const quoteRequestId = useRef(0);
  useEffect(() => {
    const resetQuote = () => {
      if (exactField === 'input') {
        setOutputAmount('');
        setOutputTokenAmount('');
      } else {
        setInputAmount('');
        setInputTokenAmount('');
      }
      setQuoteError(null);
      setPriceImpact(0);
      setQuoteSource('local');
      setSynRouteRoute('');
      setUniswapRoute(null);
      setRouteQuotes([]);
    };

    const updatePriceImpact = (amount: bigint, result: bigint) => {
      if (isStableSwapRoute) {
        if (amount > 0n && result > 0n) {
          const inputValue = Number(formatUnits(amount, inputToken.decimals));
          const outputValue = Number(formatUnits(result, outputToken.decimals));
          const effectiveRate = outputValue / inputValue;
          const impact = Math.abs(1 - effectiveRate) * 100;
          setPriceImpact(impact > 0.01 ? impact : 0);
        } else {
          setPriceImpact(0);
        }
      } else if (!isTempoChain && isArcTestnet) {
        const inputIsHub = !inputToken.quoteTokenId;
        const outputIsHub = !outputToken.quoteTokenId;

        let spotRate = 0;
        if (inputIsHub && outputReserves && outputPathReserves && outputPathReserves > 0n) {
          spotRate = Number(outputReserves) / Number(outputPathReserves);
        } else if (outputIsHub && inputReserves && inputPathReserves && inputReserves > 0n) {
          spotRate = Number(inputPathReserves) / Number(inputReserves);
        } else if (inputReserves && inputPathReserves && outputReserves && outputPathReserves && inputReserves > 0n && outputPathReserves > 0n) {
          const spotHub = Number(inputPathReserves) / Number(inputReserves);
          spotRate = spotHub * (Number(outputReserves) / Number(outputPathReserves));
        }

        if (spotRate > 0 && result > 0n) {
          const inputValue = Number(formatUnits(amount, inputToken.decimals));
          const outputValue = Number(formatUnits(result, outputToken.decimals));
          const effectiveRate = outputValue / inputValue;
          const impact = ((spotRate - effectiveRate) / spotRate) * 100;
          setPriceImpact(impact > 0.01 ? impact : 0);
        } else {
          setPriceImpact(0);
        }
      } else if (!isTempoChain && inputReserves && outputReserves) {
        setPriceImpact(calculatePriceImpact(amount, inputReserves, outputReserves));
      } else if (amount > 0n && result > 0n) {
        const inputValue = Number(formatUnits(amount, inputToken.decimals));
        const outputValue = Number(formatUnits(result, outputToken.decimals));
        const estimatedImpact = Math.abs(1 - (outputValue / inputValue)) * 100;
        setPriceImpact(estimatedImpact > 0.01 ? estimatedImpact : 0);
      } else {
        setPriceImpact(0);
      }
    };

    const fetchQuote = async () => {
      const currentRequestId = ++quoteRequestId.current;
      if (!publicClient || !inputToken.address || !outputToken.address) return;

      const activeTokenAmount = exactField === 'input' ? inputTokenAmount : outputTokenAmount;
      const activeDecimals = exactField === 'input' ? inputToken.decimals : outputToken.decimals;
      if (!activeTokenAmount || Number(activeTokenAmount) <= 0) {
        resetQuote();
        return;
      }

      setQuoteLoading(true);
      setQuoteError(null);

      try {
        // ---- Aggregator route race: gather every available quote, then pick the best ----
        const synrouteEnabled = isSynRouteChain(chainId);
        const uniEnabled = isUniswapSupportedChain(chainId);
        const localRouteLabel = isStableSwapRoute ? 'Arc StableSwap' : isTempoChain ? 'Tempo DEX' : 'Presto Hub AMM';

        if (exactField === 'input') {
          const amount = safeParseUnits(inputTokenAmount, activeDecimals);
          if (amount <= 0n) {
            resetQuote();
            return;
          }

          const [localRes, synRes, uniRes] = await Promise.allSettled([
            requiresSynRoute ? Promise.resolve(0n) : readLocalQuote(amount),
            synrouteEnabled
              ? getSynRouteQuote({
                  chainId,
                  tokenIn: inputToken.address,
                  tokenOut: outputToken.address,
                  amount: amount.toString(),
                  tradeType: 'EXACT_INPUT',
                })
              : Promise.reject(new Error('synroute disabled')),
            uniEnabled
              ? getUniswapQuote({
                  chainId,
                  tokenIn: inputToken.address,
                  tokenOut: outputToken.address,
                  amount: amount.toString(),
                  tokenInDecimals: inputToken.decimals,
                  tokenOutDecimals: outputToken.decimals,
                  tradeType: 'EXACT_INPUT',
                  recipient: address,
                  slippageBps: toSlippageBps(slippageTolerance),
                })
              : Promise.reject(new Error('uniswap disabled')),
          ]);
          if (currentRequestId !== quoteRequestId.current) return;

          const options: RouteOption[] = [];
          let uniData: UniswapQuoteResponse | null = null;
          let synImpact = 0;

          if (localRes.status === 'fulfilled' && localRes.value > 0n) {
            options.push({
              source: 'local',
              label: localRouteLabel,
              raw: localRes.value,
              display: formatUnits(localRes.value, outputToken.decimals),
              isBest: false,
            });
          }
          if (synRes.status === 'fulfilled' && synRes.value.amountOutDecimals && Number(synRes.value.amountOutDecimals) > 0) {
            const q = synRes.value;
            synImpact = Number(q.priceImpact ?? 0);
            const raw = BigInt(q.amountOut ?? safeParseUnits(q.amountOutDecimals ?? '0', outputToken.decimals));
            options.push({
              source: 'synroute',
              label: q.routeString || 'SynRoute',
              raw,
              display: q.amountOutDecimals ?? formatUnits(raw, outputToken.decimals),
              isBest: false,
            });
          }
          if (uniRes.status === 'fulfilled' && BigInt(uniRes.value.amountOut || '0') > 0n) {
            const q = uniRes.value;
            uniData = q;
            const raw = BigInt(q.amountOut);
            options.push({
              source: 'uniswap',
              label: q.routeString || 'Uniswap V2',
              raw,
              display: formatUnits(raw, outputToken.decimals),
              isBest: false,
            });
          }

          if (options.length === 0) {
            if (requiresSynRoute && synRes.status === 'rejected') throw synRes.reason;
            setOutputAmount('');
            setOutputTokenAmount('');
            setRouteQuotes([]);
            setQuoteError(new Error('InsufficientLiquidity'));
            setPriceImpact(0);
            return;
          }

          // Best exact-input route = highest output.
          options.sort((a, b) => (b.raw > a.raw ? 1 : b.raw < a.raw ? -1 : 0));
          options[0].isBest = true;
          const best = options[0];

          const bestOutDecimals = formatUnits(best.raw, outputToken.decimals);
          setOutputTokenAmount(bestOutDecimals);
          setOutputAmount(formatDisplayAmount(bestOutDecimals, outputToken, outputDisplayMode));
          setQuoteSource(best.source);
          setSynRouteRoute(best.source === 'local' ? '' : best.label);
          setRouteQuotes(options);

          if (best.source === 'uniswap' && uniData?.router && uniData?.path) {
            setUniswapRoute({ router: uniData.router, path: uniData.path });
            setPriceImpact(Number(uniData.priceImpact) > 0.01 ? Number(uniData.priceImpact) : 0);
          } else if (best.source === 'synroute') {
            setUniswapRoute(null);
            setPriceImpact(Number.isFinite(synImpact) && synImpact > 0.01 ? synImpact : 0);
          } else {
            setUniswapRoute(null);
            updatePriceImpact(amount, best.raw);
          }
          return;
        }

        const desiredOut = safeParseUnits(outputTokenAmount, activeDecimals);
        if (desiredOut <= 0n) {
          resetQuote();
          return;
        }

        const [localInRes, synOutRes, uniOutRes] = await Promise.allSettled([
          requiresSynRoute ? Promise.resolve<bigint | null>(null) : findInputForExactOutput(desiredOut),
          synrouteEnabled
            ? getSynRouteQuote({
                chainId,
                tokenIn: inputToken.address,
                tokenOut: outputToken.address,
                amount: desiredOut.toString(),
                tradeType: 'EXACT_OUTPUT',
              })
            : Promise.reject(new Error('synroute disabled')),
          uniEnabled
            ? getUniswapQuote({
                chainId,
                tokenIn: inputToken.address,
                tokenOut: outputToken.address,
                amount: desiredOut.toString(),
                tokenInDecimals: inputToken.decimals,
                tokenOutDecimals: outputToken.decimals,
                tradeType: 'EXACT_OUTPUT',
                recipient: address,
                slippageBps: toSlippageBps(slippageTolerance),
              })
            : Promise.reject(new Error('uniswap disabled')),
        ]);
        if (currentRequestId !== quoteRequestId.current) return;

        const outOptions: RouteOption[] = [];
        let uniInData: UniswapQuoteResponse | null = null;
        let synInImpact = 0;
        let localInAmount: bigint | null = null;

        if (localInRes.status === 'fulfilled' && localInRes.value && localInRes.value > 0n) {
          localInAmount = localInRes.value;
          outOptions.push({
            source: 'local',
            label: localRouteLabel,
            raw: localInRes.value,
            display: formatUnits(localInRes.value, inputToken.decimals),
            isBest: false,
          });
        }
        if (synOutRes.status === 'fulfilled') {
          const q = synOutRes.value;
          const inDec = q.amountInDecimals ?? (q.amountIn ? formatUnits(BigInt(q.amountIn), inputToken.decimals) : '');
          if (inDec && Number(inDec) > 0) {
            synInImpact = Number(q.priceImpact ?? 0);
            const raw = BigInt(q.amountIn ?? safeParseUnits(q.amountInDecimals ?? '0', inputToken.decimals));
            outOptions.push({
              source: 'synroute',
              label: q.routeString || 'SynRoute',
              raw,
              display: inDec,
              isBest: false,
            });
          }
        }
        if (uniOutRes.status === 'fulfilled' && BigInt(uniOutRes.value.amountIn || '0') > 0n) {
          const q = uniOutRes.value;
          uniInData = q;
          const raw = BigInt(q.amountIn);
          outOptions.push({
            source: 'uniswap',
            label: q.routeString || 'Uniswap V2',
            raw,
            display: formatUnits(raw, inputToken.decimals),
            isBest: false,
          });
        }

        if (outOptions.length === 0) {
          if (requiresSynRoute && synOutRes.status === 'rejected') throw synOutRes.reason;
          setInputAmount('');
          setInputTokenAmount('');
          setRouteQuotes([]);
          setQuoteError(new Error('InsufficientLiquidity'));
          setPriceImpact(0);
          return;
        }

        // Best exact-output route = lowest input.
        outOptions.sort((a, b) => (a.raw > b.raw ? 1 : a.raw < b.raw ? -1 : 0));
        outOptions[0].isBest = true;
        const bestOut = outOptions[0];

        const bestInDecimals = formatUnits(bestOut.raw, inputToken.decimals);
        setInputTokenAmount(bestInDecimals);
        setInputAmount(formatDisplayAmount(bestInDecimals, inputToken, inputDisplayMode));
        setQuoteSource(bestOut.source);
        setSynRouteRoute(bestOut.source === 'local' ? '' : bestOut.label);
        setRouteQuotes(outOptions);

        if (bestOut.source === 'uniswap' && uniInData?.router && uniInData?.path) {
          setUniswapRoute({ router: uniInData.router, path: uniInData.path });
          setPriceImpact(Number(uniInData.priceImpact) > 0.01 ? Number(uniInData.priceImpact) : 0);
        } else if (bestOut.source === 'synroute') {
          setUniswapRoute(null);
          setPriceImpact(Number.isFinite(synInImpact) && synInImpact > 0.01 ? synInImpact : 0);
        } else {
          setUniswapRoute(null);
          const localResult = localInAmount ? await readLocalQuote(localInAmount) : 0n;
          if (currentRequestId !== quoteRequestId.current) return;
          updatePriceImpact(bestOut.raw, localResult);
        }
      } catch (e) {
        console.error('Quote failed', e);
        const err = e instanceof Error ? e : new Error(String(e));
        setQuoteError(err);
        setPriceImpact(0);
      } finally {
        if (currentRequestId === quoteRequestId.current) setQuoteLoading(false);
      }
    };

    const timer = setTimeout(fetchQuote, 500);
    return () => clearTimeout(timer);
  }, [
    inputTokenAmount,
    outputTokenAmount,
    inputToken.address,
    inputToken.decimals,
    inputToken.quoteTokenId,
    outputToken.address,
    outputToken.decimals,
    outputToken.quoteTokenId,
    exactField,
    publicClient,
    isTempoChain,
    isArcTestnet,
    inputReserves,
    inputPathReserves,
    outputReserves,
    outputPathReserves,
    isStableSwapRoute,
    chainId,
    outputDisplayMode,
    inputDisplayMode,
    formatDisplayAmount,
    readLocalQuote,
    findInputForExactOutput,
    requiresSynRoute,
    address,
    slippageTolerance,
  ]);


  // Swap execution
  const handleSwap = async () => {
    if (!walletClient || !address || !inputTokenAmount || !publicClient) return;
    if (quoteLoading) {
      toast.error('Quote is still loading');
      return;
    }

    if (inputToken.address === outputToken.address) {
      toast.error("Cannot swap the same token");
      return;
    }

    if (needsConfirmation) {
      const confirmed = window.confirm('This swap has high price impact. Are you sure you want to continue?');
      if (!confirmed) return;
    }

    if (!outputTokenAmount || Number(outputTokenAmount) <= 0) {
      toast.error('No valid quote available');
      return;
    }

    setIsSwapping(true);
    setSwapStage('approving');

    let hash: `0x${string}` | undefined;
    let activityId: string | null = null;

    try {
      const amount = parseUnits(inputTokenAmount, inputToken.decimals);
      const expectedOut = safeParseUnits(outputTokenAmount, outputToken.decimals);
      if (expectedOut <= 0n) {
        toast.error('No valid quote available');
        return;
      }
      const minOut = exactField === 'output'
        ? expectedOut
        : calculateMinAmountOut(expectedOut, slippageTolerance);

      const targetSpender = isStableSwapRoute ? ARC_STABLESWAP_ADDRESS : dexAddress;
      const targetAbi = isStableSwapRoute ? ARC_STABLESWAP_ABI : HUB_AMM_ABI;
      const shouldUseSynRoute = quoteSource === 'synroute' && isSynRouteChain(chainId);
      const shouldUseUniswap = quoteSource === 'uniswap' && !!uniswapRoute;

      let txHash: `0x${string}` | undefined;
      await execute(
        shouldUseSynRoute ? 'SynRoute swap' : (shouldUseUniswap ? 'Uniswap trade' : 'Swap'),
        async () => {
          if (shouldUseUniswap && uniswapRoute) {
            // 1. Approve the Uniswap V2 router to pull the input token.
            setSwapStage('approving');
            await approveToken(
              walletClient,
              publicClient,
              address,
              inputToken.address,
              uniswapRoute.router,
              amount
            );

            // 2. Build + send swapExactTokensForTokens.
            setSwapStage('swapping');
            const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
            const data = encodeFunctionData({
              abi: UNISWAP_V2_ROUTER_SWAP_ABI,
              functionName: 'swapExactTokensForTokens',
              args: [amount, minOut, uniswapRoute.path, address, deadline],
            });
            const swapHash = await walletClient.sendTransaction({
              account: address,
              to: uniswapRoute.router,
              data,
              chain: null,
            });

            txHash = swapHash;
            return swapHash;
          }

          if (shouldUseSynRoute) {
            let built = await buildSynRouteSwap({
              chainId,
              tokenIn: inputToken.address,
              tokenOut: outputToken.address,
              amount: amount.toString(),
              sender: address,
              recipient: address,
              approvalMode: getSynRouteApprovalMode(),
              slippageBps: toSlippageBps(slippageTolerance),
            });

            const tokenApproval = built.approval?.tokenApproval ?? built.approval;
            if (tokenApproval?.needsApproval && tokenApproval.approveTransaction) {
              const approveTx = tokenApproval.approveTransaction;
              const approveHash = await walletClient.sendTransaction({
                account: address,
                to: approveTx.to,
                data: approveTx.data,
                value: toTransactionValue(approveTx.value),
                chain: null,
              });
              await publicClient.waitForTransactionReceipt({ hash: approveHash });
            }

            const permit2 = built.approval?.permit2;
            if (permit2?.signatureRequired && permit2.typedData) {
              const signature = await signPermit2(walletClient, address, permit2);
              const message = permit2.typedData.message;
              built = await buildSynRouteSwap({
                chainId,
                tokenIn: inputToken.address,
                tokenOut: outputToken.address,
                amount: amount.toString(),
                sender: address,
                recipient: address,
                approvalMode: getSynRouteApprovalMode(),
                slippageBps: toSlippageBps(slippageTolerance),
                permit2Signature: signature,
                permit2Amount: message?.details?.amount,
                permit2Expiration: message?.details?.expiration,
                permit2Nonce: message?.details?.nonce,
                permit2SigDeadline: message?.sigDeadline,
              });
            }

            if (!built.transaction) throw new Error('No SynRoute swap transaction returned');
            setSwapStage('swapping');
            return walletClient.sendTransaction({
              account: address,
              to: built.transaction.to,
              data: built.transaction.data,
              value: toTransactionValue(built.transaction.value),
              gas: arcGasHeadroom(built.transaction.gasLimit),
              chain: null,
            });
          }

          if (isTempoChain) {
            if (!publicClient) {
              throw new Error('Public client unavailable');
            }
            if (inputToken.address !== '0x0000000000000000000000000000000000000000') {
              await approveToken(
                walletClient,
                publicClient,
                address,
                inputToken.address,
                dexAddress,
                amount
              );
            }
            setSwapStage('swapping');
            // Tempo DEX uses swapExactAmountIn (no deadline parameter, uses uint128)
            txHash = await writeContractWithRetry(
              walletClient,
              publicClient ?? undefined,
              {
                address: dexAddress as `0x${string}`,
                abi: TEMPO_DEX_ABI,
                functionName: 'swapExactAmountIn',
                args: [
                  inputToken.address,
                  outputToken.address,
                  toUint128(amount),
                  toUint128(minOut),
                ],
                account: address as `0x${string}`,
                chain: null,
              },
              {
                onRetry: (attempt) => {
                  toast.loading(`Retrying swap with higher gas (attempt ${attempt})...`, { duration: 1200 });
                }
              }
            );
            return txHash;
          } else {
            // HubAMM or StableSwap uses swap with deadline
            const deadlineTimestamp = BigInt(Math.floor(Date.now() / 1000) + (deadline * 60));

            await approveToken(
              walletClient,
              publicClient,
              address,
              inputToken.address,
              targetSpender,
              amount
            );

            setSwapStage('swapping');
            txHash = await writeContractWithRetry(
              walletClient,
              publicClient ?? undefined,
              {
                address: targetSpender as `0x${string}`,
                abi: targetAbi,
                functionName: 'swap',
                args: [
                  inputToken.address,
                  outputToken.address,
                  amount,
                  minOut,
                  deadlineTimestamp,
                ],
                account: address as `0x${string}`,
                chain: null,
              },
              {
                onRetry: (attempt) => {
                  toast.loading(`Retrying swap with higher gas (attempt ${attempt})...`, { duration: 1200 });
                }
              }
            );
            return txHash;
          }
        },
        {
          reason: 'swap',
          onSubmitted: async (subHash) => {
            hash = subHash;
            const pendingActivity = createLocalActivityItem({
              category: 'swaps',
              title: `Swap ${inputToken.symbol} to ${outputToken.symbol}`,
              subtitle: `${inputTokenAmount} ${inputToken.symbol} to ${outputTokenAmount || '--'} ${outputToken.symbol}`,
              status: 'pending',
              hash: subHash,
            });
            activityId = pendingActivity.id;
            upsertLocalActivityHistoryItem(pendingActivity);
            refreshSwapHistory();
            toast.custom(() => <TxToast hash={subHash} title="Swap submitted" />);
          },
          onSuccess: async (sucHash) => {
            if (activityId) {
              patchLocalActivityItem(activityId, {
                status: 'success',
                hash: sucHash,
              });
            }
            refreshSwapHistory();
            setInputAmount('');
            setOutputAmount('');
            setInputTokenAmount('');
            setOutputTokenAmount('');
            invalidateQuoteCache();
          }
        }
      );
    } catch (e: unknown) {
      logError(e, 'Swap failed');

      const errorMessage = e instanceof Error ? e.message : 'Swap execution failed';
      if (activityId) {
        patchLocalActivityItem(activityId, {
          status: 'error',
          hash: hash ?? null,
          errorMessage,
        });
      } else {
        upsertLocalActivityHistoryItem(
          createLocalActivityItem({
            category: 'swaps',
            title: `Swap ${inputToken.symbol} to ${outputToken.symbol}`,
            subtitle: `${inputTokenAmount || '0'} ${inputToken.symbol} to ${outputTokenAmount || '--'} ${outputToken.symbol}`,
            status: 'error',
            hash: hash ?? null,
            errorMessage,
          }),
        );
      }
      refreshSwapHistory();

      if (!isUserCancellation(e)) {
        const parsed = parseContractError(e);
        toast.error(`${parsed.title}: ${parsed.message}`);
      }
    } finally {
      setIsSwapping(false);
      setSwapStage('idle');
    }
  };

  // Price impact warning
  const priceImpactWarning = useMemo(() => {
    return getPriceImpactWarning(priceImpact);
  }, [priceImpact]);

  const needsConfirmation = useMemo(() => {
    return requiresPriceImpactConfirmation(priceImpact);
  }, [priceImpact]);

  const inputUsdEstimate = inputTokenAmount ? tokenToUsdAmount(inputTokenAmount, inputToken, tokenPrices) : '';
  const outputUsdEstimate = outputTokenAmount ? tokenToUsdAmount(outputTokenAmount, outputToken, tokenPrices) : '';
  const inputUsdUnavailable = !getTokenUsdPrice(inputToken, tokenPrices);
  const outputUsdUnavailable = !getTokenUsdPrice(outputToken, tokenPrices);
  const showInputPriceError = inputDisplayMode === 'usd' && inputUsdUnavailable;
  const showOutputPriceError = outputDisplayMode === 'usd' && outputUsdUnavailable;
  const routeLabel = quoteSource === 'uniswap'
    ? (synRouteRoute || 'Uniswap')
    : quoteSource === 'synroute'
      ? (synRouteRoute || 'SynRoute')
      : isStableSwapRoute
        ? 'Arc StableSwap'
        : isTempoChain
          ? 'Tempo DEX'
          : 'Presto Hub AMM';

  const networkFeeEstimate = useMemo(() => {
    // Typical swap transaction gas limit: 150,000 gas
    const gasLimit = 150000n;
    const price = gasPrice ?? 20000000000n; // Default to 20 Gwei if not loaded
    const feeInWei = price * gasLimit;
    const feeInEth = Number(feeInWei) / 1e18;
    if (feeInEth < 0.01) {
      return `~ $${feeInEth.toFixed(4)}`;
    }
    return `~ $${feeInEth.toFixed(2)}`;
  }, [gasPrice]);

  const formatRelativeTime = (timestamp: number) => {
    const diffMs = Math.max(0, Date.now() - timestamp);
    const diffSeconds = Math.floor(diffMs / 1000);
    if (diffSeconds < 5) return 'Just now';
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes} min ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} hr ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  };

  const isValidAmountText = (value: string) => /^\d*\.?\d*$/.test(value);

  const handleInputAmountChange = (value: string) => {
    if (!isValidAmountText(value)) return;
    const nextTokenAmount = normalizeDisplayAmount(value, inputToken, inputDisplayMode);
    setInputAmount(value);
    setInputTokenAmount(nextTokenAmount);
    setExactField('input');
    if (!nextTokenAmount) {
      setOutputAmount('');
      setOutputTokenAmount('');
    }
  };

  const handleOutputAmountChange = (value: string) => {
    if (!isValidAmountText(value)) return;
    const nextTokenAmount = normalizeDisplayAmount(value, outputToken, outputDisplayMode);
    setOutputAmount(value);
    setOutputTokenAmount(nextTokenAmount);
    setExactField('output');
    if (!nextTokenAmount) {
      setInputAmount('');
      setInputTokenAmount('');
    }
  };

  const switchInputDisplayMode = (mode: AmountDisplayMode) => {
    setInputDisplayMode(mode);
    setInputAmount(formatDisplayAmount(inputTokenAmount, inputToken, mode));
  };

  const switchOutputDisplayMode = (mode: AmountDisplayMode) => {
    setOutputDisplayMode(mode);
    setOutputAmount(formatDisplayAmount(outputTokenAmount, outputToken, mode));
  };

  const setMaxInputAmount = () => {
    setInputTokenAmount(balanceIn);
    setInputAmount(formatDisplayAmount(balanceIn, inputToken, inputDisplayMode));
    setExactField('input');
  };

  const renderAmountModeToggle = (
    mode: AmountDisplayMode,
    onChange: (mode: AmountDisplayMode) => void,
    disabledUsd: boolean,
  ) => {
    const isUsd = mode === 'usd';
    return (
      <button
        type="button"
        disabled={disabledUsd}
        onClick={() => onChange(isUsd ? 'token' : 'usd')}
        className={`flex h-5 w-5 items-center justify-center rounded-[6px] border text-[11px] font-semibold transition-all duration-150 ${
          isUsd
            ? 'bg-primary/20 text-primary border-primary/30 shadow-[0_0_8px_rgba(37,192,244,0.15)]'
            : 'bg-white/[0.03] text-slate-400 border-white/[0.07] hover:text-slate-200 hover:border-white/10'
        } disabled:cursor-not-allowed disabled:opacity-40`}
        title={disabledUsd ? 'USD price unavailable' : isUsd ? 'Show token quantity' : 'Show USD value'}
      >
        $
      </button>
    );
  };
  return (
    <>
      <div className="relative flex items-start justify-center gap-4">
        <div ref={swapCardRef} className="relative w-full max-w-[381px] shrink-0">
        <div className="overflow-hidden rounded-[14px] border border-white/[0.07] bg-[#1e293b] shadow-[0_18px_48px_rgba(2,6,23,0.34)]">
          <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-bold text-slate-100">Swap Tokens</p>
                {quoteSource === 'uniswap' && (
                  <span className="rounded bg-[#ff007a]/20 px-1.5 py-0.5 text-[9px] font-bold text-[#ff007a] uppercase tracking-wider">
                    Uniswap
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {quoteSource === 'uniswap' ? 'Uniswap smart routing' : quoteSource === 'synroute' ? 'SynRoute smart routing' : 'Instant onchain execution'}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowSettings(true)}
                className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] border border-white/[0.07] bg-[#263347] text-slate-400 transition-colors hover:border-primary/30 hover:text-primary"
              >
                <span className="material-symbols-outlined text-[16px]">tune</span>
              </button>
              <button
                onClick={() => setHistoryOpen((v) => !v)}
                className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] border border-white/[0.07] bg-[#263347] text-slate-400 transition-colors hover:border-primary/30 hover:text-primary"
                title={historyOpen ? 'Hide swap history' : 'Show swap history'}
              >
                <span className="material-symbols-outlined text-[16px]">history</span>
              </button>
            </div>
          </div>

          <div className="space-y-3 p-4">
            <div className="rounded-[12px] border border-white/[0.07] bg-[#263347] px-4 py-3">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[10px] font-medium text-slate-500">You pay</span>
                {renderAmountModeToggle(inputDisplayMode, switchInputDisplayMode, inputUsdUnavailable)}
              </div>
              <div className="flex justify-between items-center">
                {inputDisplayMode === 'usd' && (
                  <span className="mr-1 text-[22px] font-semibold leading-none text-white/40">$</span>
                )}
                {quoteLoading && exactField === 'output' ? (
                  <div className="flex-1"><QuoteDots /></div>
                ) : (
                  <input
                    type="text"
                    value={inputAmount}
                    onChange={(e) => handleInputAmountChange(e.target.value)}
                    placeholder="0.0"
                    className="w-full bg-transparent p-0 text-[24px] font-semibold leading-none tracking-tight text-white placeholder:text-white/30 border-none focus:ring-0"
                  />
                )}
                <button
                  type="button"
                  onClick={() => setShowInputTokenModal(true)}
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-[8px] border border-white/[0.07] bg-[#1e293b] px-2.5 py-1.5 text-[12px] font-bold text-white transition-colors hover:border-primary/30"
                >
                  <span>{inputToken.symbol}</span>
                  <span className="material-symbols-outlined text-[14px] text-slate-400">keyboard_arrow_down</span>
                </button>
              </div>
              <div className="mt-2 flex justify-between items-center">
                <span className="text-[11px] font-semibold text-primary">
                  Balance: {isBalanceLoading || isPollingBalances ? '...' : formatSwapBalance(balanceIn)} {inputToken.symbol}
                </span>
                <div className="flex items-center gap-2">
                  {inputUsdEstimate && inputDisplayMode === 'token' && (
                    <span className="text-[11px] text-slate-400 font-medium">
                      ~ ${inputUsdEstimate}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={setMaxInputAmount}
                    className="text-[11px] font-bold uppercase text-primary hover:text-primary/80"
                  >
                    Max
                  </button>
                </div>
              </div>
              {showInputPriceError && (
                <p className="mt-2 text-[10.5px] font-medium text-amber-400">
                  USD price unavailable for {inputToken.symbol}.
                </p>
              )}
            </div>

            <div className="flex justify-center -my-2 relative z-10">
              <button
                onClick={() => {
                  const tempToken = inputTokenAddress;
                  const nextInputTokenAmount = outputTokenAmount;
                  setInputTokenAddress(outputTokenAddress);
                  setOutputTokenAddress(tempToken);
                  setInputTokenAmount(nextInputTokenAmount);
                  setInputAmount(formatDisplayAmount(nextInputTokenAmount, outputToken, inputDisplayMode));
                  setOutputAmount('');
                  setOutputTokenAmount('');
                  setExactField('input');
                }}
                className="swap-flip-btn flex h-9 w-9 items-center justify-center rounded-[11px] shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
                style={{ background: 'linear-gradient(145deg, #1a2d45, #0f1e30)', border: '1px solid rgba(37,192,244,0.2)' }}
              >
                <svg width="18" height="18" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                  <path d="M7 2L7 16M7 2L4 5M7 2L10 5" stroke="#25c0f4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M15 20L15 6M15 20L12 17M15 20L18 17" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <style>{`
                  .swap-flip-btn { transition: transform 0.18s cubic-bezier(.34,1.56,.64,1), box-shadow 0.18s; }
                  .swap-flip-btn:hover { transform: scale(1.08); box-shadow: 0 0 18px rgba(37,192,244,0.25); }
                  .swap-flip-btn:active { transform: rotate(180deg) scale(0.95); transition: transform 0.22s cubic-bezier(.34,1.56,.64,1); }
                `}</style>
              </button>
            </div>

            <div className="rounded-[12px] border border-white/[0.07] bg-[#263347] px-4 py-3">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[10px] font-medium text-slate-500">You receive</span>
                {renderAmountModeToggle(outputDisplayMode, switchOutputDisplayMode, outputUsdUnavailable)}
              </div>
              <div className="flex justify-between items-center">
                {outputDisplayMode === 'usd' && (
                  <span className="mr-1 text-[22px] font-semibold leading-none text-white/40">$</span>
                )}
                {quoteLoading && exactField === 'input' ? (
                  <div className="flex-1"><QuoteDots /></div>
                ) : (
                  <input
                    type="text"
                    value={outputAmount}
                    onChange={(e) => handleOutputAmountChange(e.target.value)}
                    placeholder="0.0"
                    className="w-full bg-transparent p-0 text-[24px] font-semibold leading-none tracking-tight text-white placeholder:text-white/30 border-none focus:ring-0"
                  />
                )}
                <button
                  type="button"
                  onClick={() => setShowOutputTokenModal(true)}
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-[8px] border border-white/[0.07] bg-[#1e293b] px-2.5 py-1.5 text-[12px] font-bold text-white transition-colors hover:border-primary/30"
                >
                  <span>{outputToken.symbol}</span>
                  <span className="material-symbols-outlined text-[14px]">keyboard_arrow_down</span>
                </button>
              </div>
              <div className="mt-2 flex justify-between items-center">
                <span className="text-[11px] font-semibold text-primary">
                  Balance: {isBalanceLoading || isPollingBalances ? '...' : formatSwapBalance(balanceOut)} {outputToken.symbol}
                </span>
                {outputUsdEstimate && outputDisplayMode === 'token' && (
                  <span className="text-[11px] text-slate-400 font-medium">
                    ~ ${outputUsdEstimate}
                  </span>
                )}
              </div>
              {showOutputPriceError && (
                <p className="mt-2 text-[10.5px] font-medium text-amber-400">
                  USD price unavailable for {outputToken.symbol}.
                </p>
              )}
            </div>

            {(inputTokenAmount && outputTokenAmount) && (
              <div className="rounded-[12px] border border-white/[0.07] bg-[#263347] px-3.5 py-3">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Rate</span>
                  <span className="font-medium text-slate-200">
                    1 {inputToken.symbol} = {inputTokenAmount && outputTokenAmount && Number(inputTokenAmount) > 0 ? formatSmartRate(Number(outputTokenAmount) / Number(inputTokenAmount)) : '...'} {outputToken.symbol}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Route</span>
                  <span className="max-w-[210px] truncate text-right font-medium text-slate-200" title={routeLabel}>
                    {routeLabel}
                  </span>
                </div>
                {routeQuotes.length > 1 && (
                  <div className="mt-2 rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-2">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Routes ({routeQuotes.length})
                      </span>
                      <span className="text-[9px] text-slate-500">
                        best {exactField === 'input' ? 'output' : 'input'}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {routeQuotes.map((r) => {
                        const unitSymbol = exactField === 'input' ? outputToken.symbol : inputToken.symbol;
                        const num = Number(r.display);
                        const amountText = Number.isFinite(num)
                          ? parseFloat(num.toPrecision(6)).toString()
                          : r.display;
                        return (
                          <div
                            key={r.source}
                            className={`flex items-center justify-between rounded-[7px] px-2 py-1 text-[11px] ${
                              r.isBest
                                ? 'border border-primary/30 bg-primary/10'
                                : 'border border-transparent'
                            }`}
                          >
                            <span className="flex items-center gap-1.5">
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  r.source === 'uniswap'
                                    ? 'bg-[#ff007a]'
                                    : r.source === 'synroute'
                                      ? 'bg-violet-400'
                                      : 'bg-primary'
                                }`}
                              />
                              <span className="max-w-[120px] truncate font-medium text-slate-200" title={r.label}>
                                {r.label}
                              </span>
                              {r.isBest && (
                                <span className="rounded bg-primary/20 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider text-primary">
                                  Best
                                </span>
                              )}
                            </span>
                            <span className={`font-medium ${r.isBest ? 'text-primary' : 'text-slate-400'}`}>
                              {amountText} {unitSymbol}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="mt-1.5 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Price impact</span>
                  <span className={`font-medium ${priceImpact < 1 ? 'text-emerald-400' : priceImpact < 3 ? 'text-amber-400' : 'text-rose-400'}`}>
                    {formatPriceImpact(priceImpact)}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Slippage tolerance</span>
                  <span className="font-medium text-slate-200">{slippageTolerance}%</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Network fee</span>
                  <span className="font-medium text-slate-200">{networkFeeEstimate}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Minimum received</span>
                  <span className="font-medium text-slate-200">
                    {outputTokenAmount
                      ? Number(Number(outputTokenAmount) * (exactField === 'output' ? 1 : (1 - slippageTolerance / 100))).toFixed(4)
                      : '0'} {outputToken.symbol}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Approval</span>
                  <span className="flex items-center gap-1 font-medium text-emerald-400">
                    <span className="material-symbols-outlined text-[12px]">verified</span>
                    {quoteSource === 'synroute' && getSynRouteApprovalMode() === 'permit2' ? 'Permit2' : 'Exact amount only'}
                  </span>
                </div>
              </div>
            )}

            {/* Price Impact Warning */}
            {priceImpactWarning && (
              <div className={`p-3 rounded-xl border text-xs ${
                priceImpact < 3 ? 'bg-amber-500/5 border-amber-500/20 text-amber-600 dark:text-amber-400' :
                'bg-red-500/5 border-red-500/20 text-red-600 dark:text-red-400'
              }`}>
                {priceImpactWarning}
              </div>
            )}

            {/* Error Message */}
            {quoteError && (
              <div className="p-3 bg-red-500/5 border border-red-500/20 text-red-500 rounded-xl text-xs flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">error</span>
                {(quoteError?.message?.includes('InsufficientLiquidity') || quoteError?.message?.includes('reverted'))
                  ? 'Not enough liquidity available.'
                  : 'Error fetching quote.'}
              </div>
            )}

            {/* Swap Button */}
            {!isConnected ? (
              <div className="mt-3 w-full">
                <ConnectButton.Custom>
                  {({ openConnectModal }) => (
                    <button
                      type="button"
                      onClick={openConnectModal}
                      className="w-full rounded-[12px] bg-primary py-3 text-[13px] font-bold text-[#0f172a] transition-all hover:opacity-95"
                    >
                      Connect Wallet
                    </button>
                  )}
                </ConnectButton.Custom>
              </div>
            ) : (
              <button
                onClick={handleSwap}
                disabled={
                  isSwapping ||
                  quoteLoading ||
                  !inputTokenAmount ||
                  !outputTokenAmount ||
                  !!quoteError
                }
                className="mt-3 w-full rounded-[12px] bg-primary py-3 text-[13px] font-bold text-[#0f172a] transition-all active:scale-[0.98] hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isSwapping ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {swapStage === 'approving' ? 'Approving exact amount...' : 'Swapping...'}
                  </span>
                ) : needsConfirmation ? 'Swap Anyway' : 'Swap Tokens'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div
        className={`relative shrink-0 overflow-hidden transition-[width,opacity,transform] duration-300 ease-in-out ${
          historyOpen
            ? 'w-[320px] opacity-100 translate-x-0'
            : 'w-0 opacity-0 translate-x-3 pointer-events-none'
        }`}
        style={{
          height: swapCardHeight ? `${swapCardHeight}px` : undefined,
        }}
        onMouseEnter={() => { if (historyAutoCloseRef.current) clearTimeout(historyAutoCloseRef.current); }}
        onMouseLeave={() => startHistoryAutoClose()}
        onScroll={() => resetHistoryAutoClose()}
      >
        <div
          className="flex h-full w-[320px] flex-col overflow-hidden rounded-[14px]"
          style={{ background: '#131d2e', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
            <p className="text-[13px] font-bold text-slate-50">Swap History</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {swapHistory.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12px] text-slate-500">
                No swaps yet.
              </div>
            ) : (
              swapHistory.map((item) => {
                const isSuccess = item.status === 'success';
                const isError = item.status === 'error';
                const stateLabel = isSuccess ? 'Completed' : isError ? 'Failed' : 'Pending';
                const iconColor = isSuccess ? '#a78bfa' : isError ? '#f43f5e' : '#fbbf24';
                const iconBg = isSuccess ? 'rgba(167,139,250,0.12)' : isError ? 'rgba(244,63,94,0.10)' : 'rgba(245,158,11,0.12)';

                return (
                  <div key={item.id} className="border-t border-white/[0.05] px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
                        style={{ background: iconBg }}
                      >
                        <span className="material-symbols-outlined text-[16px]" style={{ color: iconColor }}>
                          {isError ? 'error' : 'swap_horiz'}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-semibold text-slate-100">{item.title}</p>
                        <p className="text-[11px] text-slate-500">{item.subtitle}</p>
                        {item.hash && (
                          <a
                            href={getExplorerTxUrl(chainId, item.hash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:text-primary/80 transition-colors"
                          >
                            <span>Explorer</span>
                            <span className="material-symbols-outlined text-[10px]">open_in_new</span>
                          </a>
                        )}
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className={`text-[12px] font-bold ${isSuccess ? 'text-emerald-400' : isError ? 'text-rose-400' : 'text-amber-400'}`}>
                          {stateLabel}
                        </p>
                        <p className="text-[10px] text-slate-500">{formatRelativeTime(item.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
      </div>

      {/* Settings Modal */}
      <SlippageSettings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        slippage={slippageTolerance}
        onSlippageChange={setSlippageTolerance}
        deadline={deadline}
        onDeadlineChange={setDeadline}
      />

      <TokenModal
        isOpen={showInputTokenModal}
        onClose={() => setShowInputTokenModal(false)}
        selectedToken={inputToken}
        onSelect={(token) => {
          setInputTokenAddress(token.address);
          setInputAmount(formatDisplayAmount(inputTokenAmount, token, inputDisplayMode));
          setExactField('input');
        }}
        filterTokens={(token) => token.address !== outputTokenAddress}
      />
      <TokenModal
        isOpen={showOutputTokenModal}
        onClose={() => setShowOutputTokenModal(false)}
        selectedToken={outputToken}
        onSelect={(token) => {
          setOutputTokenAddress(token.address);
          setOutputAmount(formatDisplayAmount(outputTokenAmount, token, outputDisplayMode));
          setExactField('input');
        }}
        filterTokens={(token) => token.address !== inputTokenAddress}
      />
    </>
  );
}
