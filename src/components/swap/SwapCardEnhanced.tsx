'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getTokens } from '@/config/tokens';
import { useAccount, useChainId, usePublicClient, useWalletClient, useReadContracts } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { formatUnits, parseUnits } from 'viem';
import { approveToken, getTokenBalancesBatch, toUint128 } from '@/lib/tempoClient';
import toast from 'react-hot-toast';
import { useFeeToken } from '@/context/FeeTokenContext';
import { TxToast } from '@/components/common/TxToast';
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
  isArcChain,
  isTempoNativeChain,
  getDexAddress
} from '@/config/contracts';
import { writeContractWithRetry } from '@/lib/txRetry';
import { readContractWithFallback, invalidateQuoteCache } from '@/lib/rpc';
import { TokenModal } from '@/components/common/TokenModal';

const DEFAULT_SLIPPAGE = 0.5; // 0.5%
const DEFAULT_DEADLINE = 20; // 20 minutes

export function SwapCardEnhanced() {
  const chainId = useChainId();
  // Memoize tokens to prevent unnecessary re-renders
  const tokens = useMemo(() => getTokens(chainId), [chainId]);
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { feeToken, setFeeToken, isSingleGasToken } = useFeeToken();

  const [inputAmount, setInputAmount] = useState('');
  const [outputAmount, setOutputAmount] = useState('');
  const [exactField, setExactField] = useState<'input' | 'output'>('input');
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapStage, setSwapStage] = useState<'idle' | 'approving' | 'swapping'>('idle');

  // Token State
  const [inputTokenAddress, setInputTokenAddress] = useState(tokens[0]?.address);
  const [outputTokenAddress, setOutputTokenAddress] = useState(tokens[1]?.address);

  // Settings State
  const [slippageTolerance, setSlippageTolerance] = useState(DEFAULT_SLIPPAGE);
  const [deadline, setDeadline] = useState(DEFAULT_DEADLINE);
  const [showSettings, setShowSettings] = useState(false);
  const [showInputTokenModal, setShowInputTokenModal] = useState(false);
  const [showOutputTokenModal, setShowOutputTokenModal] = useState(false);

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

  const [balanceIn, setBalanceIn] = useState('0.00');
  const [balanceOut, setBalanceOut] = useState('0.00');
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);

  // Get the correct DEX address and ABI based on chain
  const isTempoChain = isTempoNativeChain(chainId);
  const isArcTestnet = isArcChain(chainId);
  const dexAddress = getDexAddress(chainId);
  const dexAbi = isTempoChain ? TEMPO_DEX_ABI : HUB_AMM_ABI;

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

  const amountIn = exactField === 'input' && inputAmount ? safeParseUnits(inputAmount, inputToken.decimals) : 0n;

  const calculateArcSpotOutput = useCallback((amount: bigint) => {
    if (amount <= 0n) return 0n;

    const inputIsHub = !inputToken.quoteTokenId;
    const outputIsHub = !outputToken.quoteTokenId;

    if (inputIsHub && outputReserves && outputPathReserves && outputPathReserves > 0n) {
      return (amount * outputReserves) / outputPathReserves;
    }

    if (outputIsHub && inputReserves && inputPathReserves && inputReserves > 0n) {
      return (amount * inputPathReserves) / inputReserves;
    }

    if (inputReserves && inputPathReserves && outputReserves && outputPathReserves && inputReserves > 0n && outputPathReserves > 0n) {
      const hubAmount = (amount * inputPathReserves) / inputReserves;
      return (hubAmount * outputReserves) / outputPathReserves;
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

  // Quote fetching with price impact
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<Error | null>(null);
  const [priceImpact, setPriceImpact] = useState<number>(0);
  // Track quote request version to cancel stale requests
  const quoteRequestId = useRef(0);

  useEffect(() => {
    const fetchQuote = async () => {
      const currentRequestId = ++quoteRequestId.current;
      if (!publicClient || !inputToken.address || !outputToken.address) return;

      if (exactField === 'input') {
        if (!inputAmount || parseFloat(inputAmount) === 0) {
          setOutputAmount('');
          setQuoteError(null);
          setPriceImpact(0);
          return;
        }

        setQuoteLoading(true);
        setQuoteError(null);

        try {
          const amount = safeParseUnits(inputAmount, inputToken.decimals);

          // Get quote - use different function based on chain
          let result: bigint;
          if (isTempoChain) {
            // Tempo DEX uses quoteSwapExactAmountIn
            result = await readContractWithFallback<bigint>(publicClient, {
              address: dexAddress as `0x${string}`,
              abi: TEMPO_DEX_ABI,
              functionName: 'quoteSwapExactAmountIn',
              args: [inputToken.address, outputToken.address, toUint128(amount)],
            });
          } else {
            // HubAMM uses getQuote
            result = await readContractWithFallback<bigint>(publicClient, {
              address: dexAddress as `0x${string}`,
              abi: HUB_AMM_ABI,
              functionName: 'getQuote',
              args: [inputToken.address, outputToken.address, amount],
            });
          }

          // Discard stale quote responses
          if (currentRequestId !== quoteRequestId.current) return;

          setOutputAmount(formatUnits(result, outputToken.decimals));

          // Calculate price impact using the correct reserve model per chain
          if (!isTempoChain && isArcTestnet) {
            const spotOutput = calculateArcSpotOutput(amount);
            if (spotOutput > 0n && result > 0n) {
              const quoteDelta = spotOutput > result ? spotOutput - result : 0n;
              const impact = (Number(quoteDelta) / Number(spotOutput)) * 100;
              setPriceImpact(impact > 0.01 ? impact : 0);
            } else {
              setPriceImpact(0);
            }
          } else if (!isTempoChain && inputReserves && outputReserves) {
            const impact = calculatePriceImpact(amount, inputReserves, outputReserves);
            setPriceImpact(impact);
          } else {
            // For Tempo chain, estimate price impact from quote vs input
            // Simple approximation: (1 - output/input) * 100 for same-decimal tokens
            if (amount > 0n && result > 0n) {
              const inputValue = Number(formatUnits(amount, inputToken.decimals));
              const outputValue = Number(formatUnits(result, outputToken.decimals));
              // Rough price impact estimate assuming 1:1 base rate for stablecoins
              const estimatedImpact = Math.abs(1 - (outputValue / inputValue)) * 100;
              setPriceImpact(estimatedImpact > 0.01 ? estimatedImpact : 0);
            } else {
              setPriceImpact(0);
            }
          }
        } catch (e) {
          console.error("Quote failed", e);
          const err = e instanceof Error ? e : new Error(String(e));
          setQuoteError(err);
          setPriceImpact(0);
        } finally {
          setQuoteLoading(false);
        }
      }
    };

    const timer = setTimeout(fetchQuote, 400); // Optimized debounce with caching
    return () => clearTimeout(timer);
  }, [inputAmount, inputToken.address, inputToken.decimals, outputToken.address, outputToken.decimals, exactField, publicClient, dexAddress, isTempoChain, isArcTestnet, inputReserves, outputReserves, calculateArcSpotOutput]);


  // Swap execution
  const handleSwap = async () => {
    if (!walletClient || !address || !inputAmount || !publicClient) return;
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

    setIsSwapping(true);
    setSwapStage('approving');

    try {
      const amount = parseUnits(inputAmount, inputToken.decimals);
      if (!outputAmount || Number(outputAmount) <= 0) {
        toast.error('No valid quote available');
        return;
      }
      const expectedOut = safeParseUnits(outputAmount, outputToken.decimals);
      if (expectedOut <= 0n) {
        toast.error('No valid quote available');
        return;
      }
      const minOut = calculateMinAmountOut(expectedOut, slippageTolerance);

      let hash: `0x${string}`;

      if (isTempoChain) {
        if (!publicClient) {
          toast.error('Public client unavailable');
          return;
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
        hash = await writeContractWithRetry(
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
            account: address,
            chain: null,
          },
          {
            onRetry: (attempt) => {
              toast.loading(`Retrying swap with higher gas (attempt ${attempt})...`, { duration: 1200 });
            }
          }
        );
      } else {
        // HubAMM uses swap with deadline
        const deadlineTimestamp = BigInt(Math.floor(Date.now() / 1000) + (deadline * 60));

        await approveToken(
          walletClient,
          publicClient,
          address,
          inputToken.address,
          dexAddress,
          amount
        );

        setSwapStage('swapping');
        hash = await writeContractWithRetry(
          walletClient,
          publicClient ?? undefined,
          {
            address: dexAddress as `0x${string}`,
            abi: HUB_AMM_ABI,
            functionName: 'swap',
            args: [
              inputToken.address,
              outputToken.address,
              amount,
              minOut,
              deadlineTimestamp,
            ],
            account: address,
            chain: null,
          },
          {
            onRetry: (attempt) => {
              toast.loading(`Retrying swap with higher gas (attempt ${attempt})...`, { duration: 1200 });
            }
          }
        );
      }

      toast.custom(() => <TxToast hash={hash} title="Swap submitted" />);

      // Wait for transaction confirmation
      await publicClient.waitForTransactionReceipt({ hash });

      // Clear inputs, invalidate cache, and refresh balances
      setInputAmount('');
      setOutputAmount('');
      invalidateQuoteCache(); // Clear quote cache after successful swap
      await fetchBalances();

      toast.success('Swap completed successfully!');
    } catch (e: unknown) {
      logError(e, 'Swap failed');

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

  const inputUsdEstimate = inputAmount && Number(inputAmount) > 0 ? `~ $${Number(inputAmount).toFixed(2)}` : '';
  const outputUsdEstimate = outputAmount && Number(outputAmount) > 0 ? `~ $${Number(outputAmount).toFixed(2)}` : '';
  const feeDescription = isArcTestnet
    ? ''
    : 'Tempo routes fee preferences through stablecoin balances.';
  return (
    <>
      {/* Glass Card Container */}
      <div className="relative w-full max-w-[480px]">
        {/* Main card */}
        <div className="glass-panel rounded-2xl p-4 md:p-6 shadow-xl relative">
          {/* Header Controls */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex gap-4">
              <button className="text-lg font-bold border-b-2 border-primary pb-1 text-slate-900 dark:text-white">Swap</button>
            </div>
            <div className="flex items-center gap-2">
              {!isSingleGasToken ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                  <span className="text-[10px] text-slate-500 uppercase">Fee:</span>
                  <select
                    value={feeToken?.address}
                    onChange={(e) => {
                      const token = tokens.find(t => t.address === e.target.value);
                      if (token) setFeeToken(token);
                    }}
                    className="bg-transparent text-xs text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
                  >
                    {tokens.map(t => (
                      <option key={t.address} value={t.address} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-300">
                        {t.symbol}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <button
                onClick={fetchBalances}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-400"
              >
                <span className="material-symbols-outlined text-xl">refresh</span>
              </button>
              <Link
                href="/analytics"
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-400"
                aria-label="Open analytics"
              >
                <span className="material-symbols-outlined text-xl">bar_chart</span>
              </Link>
              <button
                onClick={() => setShowSettings(true)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-400"
              >
                <span className="material-symbols-outlined text-xl">settings</span>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {/* Input Section: From */}
            <div className="token-input-bg rounded-xl p-4 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors mb-2">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">From</span>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  Balance: {isBalanceLoading ? '...' : Number(balanceIn).toFixed(4)} {inputToken.symbol}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <input
                  type="text"
                  value={inputAmount}
                  onChange={(e) => {
                    const val = e.target.value;
                    // Allow only numbers and a single decimal point
                    if (/^\d*\.?\d*$/.test(val)) {
                      setInputAmount(val);
                      setExactField('input');
                    }
                  }}
                  placeholder="0.0"
                  className="bg-transparent border-none focus:ring-0 text-2xl md:text-3xl font-semibold text-slate-900 dark:text-white w-full p-0 placeholder:text-slate-300 dark:placeholder:text-slate-700"
                />
                {isArcTestnet ? (
                  <button
                    type="button"
                    onClick={() => setShowInputTokenModal(true)}
                    className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold uppercase text-slate-900 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
                  >
                    <span>{inputToken.symbol}</span>
                    <span className="material-symbols-outlined text-base text-slate-400">keyboard_arrow_down</span>
                  </button>
                ) : (
                  <select
                    value={inputTokenAddress}
                    onChange={(e) => setInputTokenAddress(e.target.value as `0x${string}`)}
                    className="flex items-center gap-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors rounded-full px-3 py-1.5 border border-slate-200 dark:border-slate-700 shadow-sm font-bold text-slate-900 dark:text-white uppercase text-sm cursor-pointer outline-none"
                  >
                    {tokens.map(t => (
                      <option key={t.address} value={t.address} disabled={t.address === outputTokenAddress} className="bg-white dark:bg-slate-900">
                        {t.symbol}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {inputUsdEstimate}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setInputAmount(balanceIn);
                    setExactField('input');
                  }}
                  className="text-xs font-bold text-primary hover:text-primary/80 uppercase tracking-wider"
                >
                  Max
                </button>
              </div>
            </div>

            {/* Switch Button */}
            <div className="flex justify-center -my-3 relative z-10">
              <button
                onClick={() => {
                  const tempToken = inputTokenAddress;
                  setInputTokenAddress(outputTokenAddress);
                  setOutputTokenAddress(tempToken);
                  setInputAmount(outputAmount);
                  setOutputAmount('');
                  setExactField('input');
                }}
                className="bg-white dark:bg-slate-900 border-4 border-white dark:border-[#0f172a] text-primary hover:scale-110 transition-transform rounded-xl p-2 shadow-lg"
              >
                <span className="material-symbols-outlined text-2xl font-bold">south</span>
              </button>
            </div>

            {/* Input Section: To */}
            <div className="token-input-bg rounded-xl p-4 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">To</span>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  Balance: {isBalanceLoading ? '...' : Number(balanceOut).toFixed(4)} {outputToken.symbol}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <input
                  type="text"
                  value={quoteLoading ? '...' : outputAmount}
                  readOnly
                  placeholder="0.0"
                  className={`bg-transparent border-none focus:ring-0 text-2xl md:text-3xl font-semibold w-full p-0 placeholder:text-slate-300 dark:placeholder:text-slate-700 ${quoteLoading ? 'text-slate-400 animate-pulse' : 'text-slate-900 dark:text-white'}`}
                />
                {isArcTestnet ? (
                  <button
                    type="button"
                    onClick={() => setShowOutputTokenModal(true)}
                    className="flex items-center gap-2 rounded-full bg-primary px-3 py-1.5 text-sm font-bold uppercase text-white shadow-md shadow-primary/20 transition-colors hover:bg-primary/90 dark:text-background-dark"
                  >
                    <span>{outputToken.symbol}</span>
                    <span className="material-symbols-outlined text-base">keyboard_arrow_down</span>
                  </button>
                ) : (
                  <select
                    value={outputTokenAddress}
                    onChange={(e) => setOutputTokenAddress(e.target.value as `0x${string}`)}
                    className="flex items-center gap-2 bg-primary text-white dark:text-background-dark hover:bg-primary/90 transition-colors rounded-full px-3 py-1.5 shadow-md shadow-primary/20 font-bold uppercase text-sm cursor-pointer outline-none"
                  >
                    {tokens.map(t => (
                      <option key={t.address} value={t.address} disabled={t.address === inputTokenAddress} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-300">
                        {t.symbol}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="mt-1">
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {outputUsdEstimate}
                </span>
              </div>
            </div>

            {feeDescription && (
              <div className="mt-4 rounded-xl border border-slate-200/80 bg-white/40 px-3 py-2 text-xs text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400">
                {feeDescription}
              </div>
            )}

            {/* Transaction Details */}
            {(inputAmount && outputAmount) && (
              <div className="mt-6 space-y-3 px-1">
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                    <span>Price Impact</span>
                    <span className="material-symbols-outlined text-xs">info</span>
                  </div>
                  <span className={`font-medium ${priceImpact < 1 ? 'text-emerald-600 dark:text-emerald-500' : priceImpact < 3 ? 'text-amber-500' : 'text-red-500'}`}>
                    {formatPriceImpact(priceImpact)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                    <span>Minimum Received</span>
                    <span className="material-symbols-outlined text-xs">info</span>
                  </div>
                  <span className="text-slate-700 dark:text-slate-200 font-medium">
                    {outputAmount ? Number(Number(outputAmount) * (1 - slippageTolerance / 100)).toFixed(4) : '0'} {outputToken.symbol}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                    <span>Slippage Tolerance</span>
                    <span className="material-symbols-outlined text-xs">info</span>
                  </div>
                  <span className="text-slate-700 dark:text-slate-200 font-medium">{slippageTolerance}%</span>
                </div>
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 dark:text-slate-500">
                      1 {inputToken.symbol} = {inputAmount && outputAmount && Number(inputAmount) > 0 ? (Number(outputAmount) / Number(inputAmount)).toFixed(4) : '...'} {outputToken.symbol}
                    </span>
                    <button className="text-primary flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">swap_horiz</span>
                    </button>
                  </div>
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
              <div className="w-full mt-6 [&_button]:w-full [&_button]:py-4 [&_button]:rounded-xl [&_button]:font-bold [&_button]:text-lg [&_button]:bg-primary [&_button]:text-white [&_button]:dark:text-background-dark [&_button]:hover:bg-primary/90 [&_button]:transition-all [&_button]:shadow-xl [&_button]:shadow-primary/20">
                <ConnectButton />
              </div>
            ) : (
              <button
                onClick={handleSwap}
                disabled={
                  isSwapping ||
                  quoteLoading ||
                  !inputAmount ||
                  !outputAmount ||
                  !!quoteError
                }
                className="w-full mt-6 bg-primary hover:bg-primary/90 text-white dark:text-background-dark font-bold py-4 rounded-xl text-lg transition-all shadow-xl shadow-primary/20 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSwapping ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {swapStage === 'approving' ? 'Approving...' : 'Swapping...'}
                  </span>
                ) : needsConfirmation ? 'Swap Anyway (High Impact)' : 'Swap Tokens'}
              </button>
            )}
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

      {isArcTestnet && (
        <>
          <TokenModal
            isOpen={showInputTokenModal}
            onClose={() => setShowInputTokenModal(false)}
            selectedToken={inputToken}
            onSelect={(token) => setInputTokenAddress(token.address)}
            filterTokens={(token) => token.address !== outputTokenAddress}
          />
          <TokenModal
            isOpen={showOutputTokenModal}
            onClose={() => setShowOutputTokenModal(false)}
            selectedToken={outputToken}
            onSelect={(token) => setOutputTokenAddress(token.address)}
            filterTokens={(token) => token.address !== inputTokenAddress}
          />
        </>
      )}
    </>
  );
}
