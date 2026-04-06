'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getTokens } from '@/config/tokens';
import { useAccount, useChainId, usePublicClient, useWalletClient, useReadContracts } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { formatUnits, parseUnits } from 'viem';
import { approveToken, getTokenBalancesBatch, toUint128 } from '@/lib/tempoClient';
import toast from 'react-hot-toast';
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
import {
  createLocalActivityItem,
  patchLocalActivityItem,
  upsertLocalActivityHistoryItem,
} from '@/lib/activityHistory';

const DEFAULT_SLIPPAGE = 0.5; // 0.5%
const DEFAULT_DEADLINE = 20; // 20 minutes

export function SwapCardEnhanced() {
  const chainId = useChainId();
  // Memoize tokens to prevent unnecessary re-renders
  const tokens = useMemo(() => getTokens(chainId), [chainId]);
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
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
            // Price impact = difference between spot rate and effective rate.
            // Spot rate: output for an infinitely small trade (reserves ratio).
            // Effective rate: actual output / input from the on-chain quote.
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

    const timer = setTimeout(fetchQuote, 500); // 500ms debounce — avoids RPC calls mid-typing
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

    let hash: `0x${string}` | undefined;
    let activityId: string | null = null;

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

      const pendingActivity = createLocalActivityItem({
        category: 'swaps',
        title: `Swap ${inputToken.symbol} to ${outputToken.symbol}`,
        subtitle: `${inputAmount} ${inputToken.symbol} to ${outputAmount || '--'} ${outputToken.symbol}`,
        status: 'pending',
        hash,
      });
      activityId = pendingActivity.id;
      upsertLocalActivityHistoryItem(pendingActivity);

      toast.custom(() => <TxToast hash={hash} title="Swap submitted" />);

      // Wait for transaction confirmation
      await publicClient.waitForTransactionReceipt({ hash });

      if (activityId) {
        patchLocalActivityItem(activityId, {
          status: 'success',
          hash,
        });
      }

      // Clear inputs, invalidate cache, and refresh balances
      setInputAmount('');
      setOutputAmount('');
      invalidateQuoteCache(); // Clear quote cache after successful swap
      await fetchBalances();

      toast.success('Swap completed successfully!');
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
            subtitle: `${inputAmount || '0'} ${inputToken.symbol} to ${outputAmount || '--'} ${outputToken.symbol}`,
            status: 'error',
            hash: hash ?? null,
            errorMessage,
          }),
        );
      }

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
  return (
    <>
      <div className="relative w-full max-w-[381px]">
        <div className="overflow-hidden rounded-[14px] border border-white/[0.07] bg-[#1e293b] shadow-[0_18px_48px_rgba(2,6,23,0.34)]">
          <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
            <div>
              <p className="text-[13px] font-bold text-slate-100">Swap Tokens</p>
              <p className="mt-0.5 text-[11px] text-slate-400">Instant onchain execution</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowSettings(true)}
                className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] border border-white/[0.07] bg-[#263347] text-slate-400 transition-colors hover:border-primary/30 hover:text-primary"
              >
                <span className="material-symbols-outlined text-[16px]">tune</span>
              </button>
              <button
                onClick={fetchBalances}
                className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] border border-white/[0.07] bg-[#263347] text-slate-400 transition-colors hover:border-primary/30 hover:text-primary"
              >
                <span className="material-symbols-outlined text-[16px]">refresh</span>
              </button>
            </div>
          </div>

          <div className="space-y-3 p-4">
            <div className="rounded-[12px] border border-white/[0.07] bg-[#263347] px-4 py-3">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[10px] font-medium text-slate-500">You pay</span>
              </div>
              <div className="flex justify-between items-center">
                <input
                  type="text"
                  value={inputAmount}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^\d*\.?\d*$/.test(val)) {
                      setInputAmount(val);
                      setExactField('input');
                    }
                  }}
                  placeholder="0.0"
                  className="w-full bg-transparent p-0 text-[24px] font-semibold leading-none tracking-tight text-white placeholder:text-white/30 border-none focus:ring-0"
                />
                <button
                  type="button"
                  onClick={() => setShowInputTokenModal(true)}
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-[8px] border border-white/[0.07] bg-[#1e293b] px-2.5 py-1.5 text-[12px] font-bold text-white transition-colors hover:border-primary/30"
                >
                  <span>{inputToken.symbol}</span>
                  <span className="material-symbols-outlined text-[14px] text-slate-400">keyboard_arrow_down</span>
                </button>
              </div>
              <div className="mt-2 flex justify-between">
                <span className="text-[11px] font-semibold text-primary">
                  Balance: {isBalanceLoading ? '...' : Number(balanceIn).toFixed(4)} {inputToken.symbol}
                </span>
                <button
                  type="button"
                  onClick={() => { setInputAmount(balanceIn); setExactField('input'); }}
                  className="text-[11px] font-bold uppercase text-primary hover:text-primary/80"
                >
                  Max
                </button>
              </div>
            </div>

            <div className="flex justify-center -my-2 relative z-10">
              <button
                onClick={() => {
                  const tempToken = inputTokenAddress;
                  setInputTokenAddress(outputTokenAddress);
                  setOutputTokenAddress(tempToken);
                  setInputAmount(outputAmount);
                  setOutputAmount('');
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
              </div>
              <div className="flex justify-between items-center">
                <input
                  type="text"
                  value={quoteLoading ? '...' : outputAmount}
                  readOnly
                  placeholder="0.0"
                  className={`w-full bg-transparent p-0 text-[24px] font-semibold leading-none tracking-tight placeholder:text-white/30 border-none focus:ring-0 ${quoteLoading ? 'text-slate-400 animate-pulse' : 'text-white'}`}
                />
                <button
                  type="button"
                  onClick={() => setShowOutputTokenModal(true)}
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-[8px] border border-white/[0.07] bg-[#1e293b] px-2.5 py-1.5 text-[12px] font-bold text-white transition-colors hover:border-primary/30"
                >
                  <span>{outputToken.symbol}</span>
                  <span className="material-symbols-outlined text-[14px]">keyboard_arrow_down</span>
                </button>
              </div>
              <div className="mt-2">
                <span className="text-[11px] font-semibold text-primary">
                  Balance: {isBalanceLoading ? '...' : Number(balanceOut).toFixed(4)} {outputToken.symbol}
                </span>
              </div>
            </div>

            {(inputAmount && outputAmount) && (
              <div className="rounded-[12px] border border-white/[0.07] bg-[#263347] px-3.5 py-3">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Rate</span>
                  <span className="font-medium text-slate-200">
                    1 {inputToken.symbol} = {inputAmount && outputAmount && Number(inputAmount) > 0 ? (Number(outputAmount) / Number(inputAmount)).toFixed(6) : '...'} {outputToken.symbol}
                  </span>
                </div>
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
                  <span className="font-medium text-slate-200">{inputUsdEstimate || '~ $0.00'}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Minimum received</span>
                  <span className="font-medium text-slate-200">
                    {outputAmount ? Number(Number(outputAmount) * (1 - slippageTolerance / 100)).toFixed(4) : '0'} {outputToken.symbol}
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
                  !inputAmount ||
                  !outputAmount ||
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
                    {swapStage === 'approving' ? 'Approving...' : 'Swapping...'}
                  </span>
                ) : needsConfirmation ? 'Swap Anyway' : 'Swap Tokens'}
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
  );
}
