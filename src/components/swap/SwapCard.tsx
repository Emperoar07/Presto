'use client';

import { useState, useEffect, useCallback } from 'react';
import { getTokens } from '@/config/tokens';
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi'; 
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { formatUnits, parseUnits } from 'viem';
import { executeSwap, getTokenBalancesBatch, simulateSwap, quoteSwapExactAmountIn } from '@/lib/tempoClient';
import toast from 'react-hot-toast';
import { useFeeToken } from '@/context/FeeTokenContext';
import { TxToast } from '@/components/common/TxToast';

export function SwapCard() {
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
  // Token State - Default to first two tokens
  const [inputTokenAddress, setInputTokenAddress] = useState(tokens[0]?.address);
  const [outputTokenAddress, setOutputTokenAddress] = useState(tokens[1]?.address);

  // Sync state with tokens if chain changes
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
    } finally {
      setIsBalanceLoading(false);
    }
  }, [address, inputTokenAddress, outputTokenAddress, publicClient, tokens]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);
  
  // Quote Logic
  const safeParseUnits = (value: string, decimals: number) => {
      try {
          if (!value || value === '.' || isNaN(Number(value))) return 0n;
          return parseUnits(value, decimals);
      } catch {
          return 0n;
      }
  };

  const amountIn = exactField === 'input' && inputAmount ? safeParseUnits(inputAmount, inputToken.decimals) : 0n;

  const handleSimulate = async () => {
    if (!publicClient || !address) {
      toast.error('Connect wallet to simulate');
      return;
    }
    try {
      const amt = exactField === 'input' ? amountIn : 0n;
      if (amt === 0n) {
        toast.error('Enter an input amount to simulate');
        return;
      }
      const result = await simulateSwap(
        publicClient,
        address,
        inputToken.address,
        outputToken.address,
        amt,
        0n
      );
      toast.success(`Simulation Valid: Output ${formatUnits(result, outputToken.decimals)}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Simulation failed';
      toast.error(msg);
    }
  };

  // Quote State
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<Error | null>(null);

  // Debounce Quote Fetching
  useEffect(() => {
    const fetchQuote = async () => {
        if (!publicClient || !inputToken.address || !outputToken.address) return;
        
        // 1. Exact Input (Sell)
        if (exactField === 'input') {
            if (!inputAmount || parseFloat(inputAmount) === 0) {
                setOutputAmount('');
                setQuoteError(null);
                return;
            }

            setQuoteLoading(true);
            setQuoteError(null);
            try {
                const amount = safeParseUnits(inputAmount, inputToken.decimals);
                const result = await quoteSwapExactAmountIn(
                    publicClient,
                    inputToken.address,
                    outputToken.address,
                    amount
                );
                setOutputAmount(formatUnits(result, outputToken.decimals));
                setQuoteError(null);
            } catch (e) {
                console.error("Quote failed", e);
                const err = e instanceof Error ? e : new Error(String(e));
                setQuoteError(err);
            } finally {
                setQuoteLoading(false);
            }
        }
    };

    const timer = setTimeout(fetchQuote, 500); // 500ms debounce
    return () => clearTimeout(timer);
  }, [inputAmount, inputToken, outputToken, exactField, publicClient, address, tokens]); // Added dependencies

  // Note: Exact Output (Buy) simulation is harder because swapExactAmountIn is the main function. 
  // We'll stick to Exact Input for now as per Tempo Native DEX usually favoring exact input swaps.
  
  const handleSwap = async () => {
    if (!walletClient || !address || !inputAmount) return;
    
    // Prevent same token
    if (inputToken.address === outputToken.address) {
        toast.error("Cannot swap the same token");
        return;
    }

    setIsSwapping(true);
    try {
        const amount = parseUnits(inputAmount, inputToken.decimals);
        // Min amount out with 0.5% slippage
        const expectedOut = outputAmount ? safeParseUnits(outputAmount, outputToken.decimals) : 0n;
        const minOut = expectedOut * 995n / 1000n;

        const hash = await executeSwap(
            walletClient,
            address,
            inputToken.address,
            outputToken.address,
            amount,
            minOut,
            false,
            publicClient ?? undefined
        );
        toast.custom(() => <TxToast hash={hash as `0x${string}`} title="Swap submitted" />);
        setInputAmount('');
    } catch (e: unknown) {
        console.error(e);
        const message = e instanceof Error ? e.message : "Unknown error";
        toast.error("Swap failed: " + message);
    } finally {
        setIsSwapping(false);
    }
  };

  return (
    <div className="w-full max-w-xl p-7 rounded-2xl shadow-2xl border border-white/10 bg-black/40 backdrop-blur-md relative">
      <button
        onClick={handleSimulate}
        className="absolute top-3 right-3 text-xs px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700"
        aria-label="Debug / Simulate"
        title="Debug / Simulate"
      >
        🐛
      </button>
      <div className="mb-7">
        <h2 className="text-2xl font-bold text-white mb-1">Swap</h2>
        <p className="text-sm text-zinc-400">Instant swaps on Tempo</p>
        
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
                    
                    // Set Input to the previous Output (so we sell what we were buying)
                    setInputAmount(outputAmount);
                    setOutputAmount(''); // Will be recalculated
                    
                    // Force input mode to trigger simulation
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
                    value={quoteLoading ? '...' : outputAmount}
                    onChange={(e) => {
                        setOutputAmount(e.target.value);
                        setExactField('output');
                    }}
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

        {/* Error Message */}
        {quoteError && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm">
             {(quoteError.message?.includes('InsufficientLiquidity') || quoteError.message?.includes('reverted'))
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
                disabled={isSwapping || !inputAmount || !!quoteError}
                className="w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-[#00F3FF] to-[#BC13FE] text-black hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(0,243,255,0.3)]"
            >
                {isSwapping ? 'Swapping...' : 'Swap'}
            </button>
        )}
      </div>
    </div>
  );
}
