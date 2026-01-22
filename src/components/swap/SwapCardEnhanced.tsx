'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getTokens } from '@/config/tokens';
import { useAccount, useChainId, usePublicClient, useWalletClient, useReadContracts } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { formatUnits, parseUnits } from 'viem';
import { getTokenBalancesBatch, toUint128 } from '@/lib/tempoClient';
import toast from 'react-hot-toast';
import { useFeeToken } from '@/context/FeeTokenContext';
import { TxToast } from '@/components/common/TxToast';
import { SlippageSettings } from './SlippageSettings';
import {
  calculatePriceImpact,
  getPriceImpactColor,
  getPriceImpactWarning,
  requiresPriceImpactConfirmation,
  formatPriceImpact,
  calculateMinAmountOut
} from '@/lib/priceImpact';
import { parseContractError, logError, isUserCancellation } from '@/lib/errorHandling';
import {
  HUB_AMM_ABI,
  TEMPO_DEX_ABI,
  isTempoNativeChain,
  getDexAddress
} from '@/config/contracts';
import { writeContractWithRetry } from '@/lib/txRetry';
import { readContractWithFallback } from '@/lib/rpc';

const DEFAULT_SLIPPAGE = 0.5; // 0.5%
const DEFAULT_DEADLINE = 20; // 20 minutes

export function SwapCardEnhanced() {
  const chainId = useChainId();
  const tokens = getTokens(chainId);
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { feeToken, setFeeToken } = useFeeToken();

  const [inputAmount, setInputAmount] = useState('');
  const [outputAmount, setOutputAmount] = useState('');
  const [exactField, setExactField] = useState<'input' | 'output'>('input');
  const [isSwapping, setIsSwapping] = useState(false);

  // Token State
  const [inputTokenAddress, setInputTokenAddress] = useState(tokens[0]?.address);
  const [outputTokenAddress, setOutputTokenAddress] = useState(tokens[1]?.address);

  // Settings State
  const [slippageTolerance, setSlippageTolerance] = useState(DEFAULT_SLIPPAGE);
  const [deadline, setDeadline] = useState(DEFAULT_DEADLINE);
  const [showSettings, setShowSettings] = useState(false);

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
        functionName: 'tokenReserves',
        args: [outputTokenAddress],
      },
    ],
    query: {
      enabled: !isTempoChain && !!dexAddress && !!inputTokenAddress && !!outputTokenAddress,
    },
  });

  const inputReserves = reservesData?.[0]?.result as bigint | undefined;
  const outputReserves = reservesData?.[1]?.result as bigint | undefined;

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

  // Quote fetching with price impact
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<Error | null>(null);
  const [priceImpact, setPriceImpact] = useState<number>(0);
  const [tempoLiquidityStatus, setTempoLiquidityStatus] = useState<'unknown' | 'available' | 'empty' | 'error'>('unknown');

  useEffect(() => {
    const fetchQuote = async () => {
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

          setOutputAmount(formatUnits(result, outputToken.decimals));

          // Calculate price impact (only for non-Tempo chains where we have reserves)
          if (!isTempoChain && inputReserves && outputReserves) {
            const impact = calculatePriceImpact(
              amount,
              inputReserves as bigint,
              outputReserves as bigint
            );
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

    const timer = setTimeout(fetchQuote, 500);
    return () => clearTimeout(timer);
  }, [inputAmount, inputToken, outputToken, exactField, publicClient, dexAddress, isTempoChain, inputReserves, outputReserves]);

  useEffect(() => {
    if (!isTempoChain) {
      setTempoLiquidityStatus('available');
      return;
    }
    if (!inputToken.address || !outputToken.address) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const baseToken = outputToken.symbol === 'pathUSD' ? inputToken.address : outputToken.address;

    const checkLiquidity = async () => {
      try {
        const response = await fetch(`/api/orderbook?token=${baseToken}&depth=1&chainId=${chainId}`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!response.ok) {
          setTempoLiquidityStatus('error');
          return;
        }
        const result = await response.json();
        const bids = Array.isArray(result?.bids) ? result.bids : [];
        const asks = Array.isArray(result?.asks) ? result.asks : [];
        setTempoLiquidityStatus(bids.length + asks.length > 0 ? 'available' : 'empty');
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setTempoLiquidityStatus('error');
      }
    };

    checkLiquidity();
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [chainId, inputToken.address, outputToken.address, outputToken.symbol, inputToken.symbol, isTempoChain]);

  // Swap execution
  const handleSwap = async () => {
    if (!walletClient || !address || !inputAmount || !publicClient) return;

    if (inputToken.address === outputToken.address) {
      toast.error("Cannot swap the same token");
      return;
    }

    setIsSwapping(true);

    try {
      const amount = parseUnits(inputAmount, inputToken.decimals);
      const expectedOut = outputAmount ? safeParseUnits(outputAmount, outputToken.decimals) : 0n;
      const minOut = calculateMinAmountOut(expectedOut, slippageTolerance);

      let hash: `0x${string}`;

      if (isTempoChain) {
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

      // Clear inputs and refresh balances
      setInputAmount('');
      setOutputAmount('');
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
    }
  };

  // Price impact warning
  const priceImpactWarning = useMemo(() => {
    return getPriceImpactWarning(priceImpact);
  }, [priceImpact]);

  const needsConfirmation = useMemo(() => {
    return requiresPriceImpactConfirmation(priceImpact);
  }, [priceImpact]);

  return (
    <>
      <div className="w-full max-w-xl p-7 rounded-2xl shadow-2xl border border-white/10 bg-black/40 backdrop-blur-md relative">
        {/* Settings button */}
        <button
          onClick={() => setShowSettings(true)}
          className="absolute top-3 right-3 p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors"
          aria-label="Settings"
          title="Transaction Settings"
        >
          <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        <div className="mb-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Swap</h2>
              <p className="text-sm text-zinc-400">Instant swaps on Tempo</p>
            </div>
          </div>

          {/* Fee Token Selector */}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-zinc-500">Fee Token:</span>
            <select
              value={feeToken?.address}
              onChange={(e) => {
                const token = tokens.find(t => t.address === e.target.value);
                if (token) setFeeToken(token);
              }}
              className="bg-transparent text-xs text-zinc-400 outline-none border-b border-zinc-700 hover:border-zinc-500 transition-colors cursor-pointer"
            >
              {tokens.map(t => (
                <option key={t.address} value={t.address} className="bg-zinc-900 text-zinc-300">
                  {t.symbol}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-6">
          {/* Input Field */}
          <div className="p-5 rounded-xl bg-black/20 border border-white/5">
            <div className="flex justify-between mb-2">
              <span className="text-sm text-zinc-400">Pay</span>
              <span className="text-sm text-zinc-400 flex items-center gap-2">
                Balance: {isBalanceLoading ? '...' : Number(balanceIn).toFixed(4)}
                <button
                  type="button"
                  onClick={fetchBalances}
                  className="inline-flex items-center justify-center rounded-md p-1 text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                  aria-label="Refresh balances"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 1 1-2.64-6.36"/>
                    <path d="M21 3v6h-6"/>
                  </svg>
                </button>
              </span>
            </div>
            <div className="flex gap-5">
              <input
                type="text"
                value={inputAmount}
                onChange={(e) => {
                  setInputAmount(e.target.value);
                  setExactField('input');
                }}
                placeholder="0.0"
                className="w-full bg-transparent text-3xl font-bold text-white outline-none placeholder-zinc-600"
              />
              <select
                value={inputTokenAddress}
                onChange={(e) => setInputTokenAddress(e.target.value as `0x${string}`)}
                className="bg-zinc-800 text-white rounded-lg px-3 py-1 outline-none border border-zinc-700 focus:border-[#00F3FF]"
              >
                {tokens.map(t => (
                  <option key={t.address} value={t.address} disabled={t.address === outputTokenAddress}>
                    {t.symbol}
                  </option>
                ))}
              </select>
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
              className="p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 transition-colors shadow-lg group"
              aria-label="Switch tokens"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-zinc-400 group-hover:text-white transition-colors"
              >
                <path d="m3 16 4 4 4-4"/>
                <path d="M7 20V4"/>
                <path d="m21 8-4-4-4 4"/>
                <path d="M17 4v16"/>
              </svg>
            </button>
          </div>

          {/* Output Field */}
          <div className="p-5 rounded-xl bg-black/20 border border-white/5">
            <div className="flex justify-between mb-2">
              <span className="text-sm text-zinc-400">Receive</span>
              <span className="text-sm text-zinc-400 flex items-center gap-2">
                Balance: {isBalanceLoading ? '...' : Number(balanceOut).toFixed(4)}
              </span>
            </div>
            <div className="flex gap-5">
              <input
                type="text"
                value={quoteLoading ? '...' : outputAmount}
                readOnly
                placeholder="0.0"
                className={`w-full bg-transparent text-3xl font-bold outline-none placeholder-zinc-600 ${quoteLoading ? 'text-zinc-500 animate-pulse' : 'text-white'}`}
              />
              <select
                value={outputTokenAddress}
                onChange={(e) => setOutputTokenAddress(e.target.value as `0x${string}`)}
                className="bg-zinc-800 text-white rounded-lg px-3 py-1 outline-none border border-zinc-700 focus:border-[#00F3FF]"
              >
                {tokens.map(t => (
                  <option key={t.address} value={t.address} disabled={t.address === inputTokenAddress}>
                    {t.symbol}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Price Impact Display */}
          {priceImpact > 0 && (
            <div className={`p-3 rounded-lg border ${
              priceImpact < 1 ? 'bg-green-500/10 border-green-500/20' :
              priceImpact < 3 ? 'bg-yellow-500/10 border-yellow-500/20' :
              priceImpact < 5 ? 'bg-orange-500/10 border-orange-500/20' :
              'bg-red-500/10 border-red-500/20'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">Price Impact</span>
                <span className={`text-sm font-semibold ${getPriceImpactColor(priceImpact)}`}>
                  {formatPriceImpact(priceImpact)}
                </span>
              </div>
              {priceImpactWarning && (
                <p className={`text-xs mt-2 ${getPriceImpactColor(priceImpact)}`}>
                  {priceImpactWarning}
                </p>
              )}
            </div>
          )}

          {/* Error Message */}
          {(quoteError || (isTempoChain && tempoLiquidityStatus === 'empty')) && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm">
              {isTempoChain && tempoLiquidityStatus === 'empty'
                ? 'No orderbook liquidity available for this pair on Tempo testnet.'
                : (quoteError?.message?.includes('InsufficientLiquidity') || quoteError?.message?.includes('reverted'))
                  ? 'Not enough liquidity available.'
                  : 'Error fetching quote.'}
            </div>
          )}

          {/* Swap Button */}
          {!isConnected ? (
            <div className="w-full [&_button]:w-full [&_button]:py-4 [&_button]:rounded-xl [&_button]:font-bold [&_button]:text-lg [&_button]:bg-gradient-to-r [&_button]:from-[#00F3FF] [&_button]:to-[#BC13FE] [&_button]:text-black [&_button]:hover:opacity-90 [&_button]:transition-opacity">
              <ConnectButton />
            </div>
          ) : (
            <button
              onClick={handleSwap}
              disabled={isSwapping || !inputAmount || !!quoteError || (isTempoChain && tempoLiquidityStatus === 'empty') || (needsConfirmation && !confirm('This swap has high price impact. Are you sure you want to continue?'))}
              className="w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-[#00F3FF] to-[#BC13FE] text-black hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(0,243,255,0.3)]"
            >
              {isSwapping ? 'Swapping...' : needsConfirmation ? 'Swap Anyway (High Impact)' : 'Swap'}
            </button>
          )}

          {/* Transaction Details */}
          <div className="text-xs text-zinc-500 space-y-1">
            <div className="flex justify-between">
              <span>Slippage Tolerance</span>
              <span>{slippageTolerance}%</span>
            </div>
            <div className="flex justify-between">
              <span>Transaction Deadline</span>
              <span>{deadline} minutes</span>
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
    </>
  );
}
