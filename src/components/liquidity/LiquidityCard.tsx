'use client';

import { useState, useEffect } from 'react';
import { TokenModal } from '../common/TokenModal';
import { Orderbook } from './Orderbook';
import { Token, getTokens } from '@/config/tokens';
import { ManageFeeLiquidity } from './ManageFeeLiquidity';
import { useAccount, useChainId, useWalletClient, usePublicClient } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { BaseError, ContractFunctionRevertedError, formatUnits, parseAbi, parseUnits } from 'viem';
import toast from 'react-hot-toast';
import { Hooks } from '@/lib/tempo';
import { getDexAddressForChain, getDexBalancesBatch, placeOrder, getTokenBalancesBatch, toUint128 } from '@/lib/tempoClient';
import { useFeeToken } from '@/context/FeeTokenContext';
import { DexAccount } from './DexAccount';
import type { PublicClient } from 'viem';
import { TxToast } from '@/components/common/TxToast';
import { isUserCancellation } from '@/lib/errorHandling';

export function LiquidityCard() {
  const DEX_PLACE_ABI = parseAbi([
    'function place(address token, uint128 amount, bool isBid, int16 tick) external returns (uint128 id)',
  ]);
  const DEX_PLACE_FLIP_ABI = parseAbi([
    'function placeFlip(address token, uint128 amount, bool isBid, int16 tick, int16 flipTick) external returns (uint128 id)',
  ]);
  const ERC20_ALLOWANCE_ABI = parseAbi([
    'function allowance(address owner, address spender) external view returns (uint256)',
    'function balanceOf(address owner) external view returns (uint256)',
  ]);
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
  const showOrderDebug = process.env.NEXT_PUBLIC_DEBUG_ORDERS === 'true';
  const chainId = useChainId();
  const tokens = getTokens(chainId);
  const { address } = useAccount();
  const { isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { feeToken } = useFeeToken();
  const walletChainId = (walletClient as { chain?: { id?: number } } | null)?.chain?.id;
  const publicChainId = (publicClient as { chain?: { id?: number } } | null)?.chain?.id;

  const [activeTab, setActiveTab] = useState<'fee' | 'order'>('order');

  // Token State
  const [selectedToken, setSelectedToken] = useState<Token>(tokens.find(t => t.symbol !== 'pathUSD') || tokens[1]); 
  const pathToken = tokens.find(t => t.symbol === 'pathUSD') || tokens[0];
  const quoteToken = tokens.find(t => t.id && t.id === selectedToken.quoteTokenId) || pathToken;

  // Reset tokens on chain change
  useEffect(() => {
    const nextToken = tokens.find(t => t.symbol !== 'pathUSD') || tokens[1];
    setSelectedToken(nextToken);
  }, [chainId, tokens]);

  // Balances
  const [tokenBalance, setTokenBalance] = useState('0.00');
  const [pathBalance, setPathBalance] = useState('0.00');

  useEffect(() => {
    const fetchBalances = async () => {
        if (!publicClient || !address) return;
        const balances = await getTokenBalancesBatch(publicClient, address, [
          { address: selectedToken.address, decimals: selectedToken.decimals },
          { address: quoteToken.address, decimals: quoteToken.decimals },
        ]);
        setTokenBalance(balances[selectedToken.address] ?? '0.00');
        setPathBalance(balances[quoteToken.address] ?? '0.00');
    };
    
    fetchBalances();
  }, [publicClient, address, selectedToken, quoteToken]);

  // FEE LIQUIDITY STATE
  const [lpAmount, setLpAmount] = useState('');
  
  const burnLiquidity = Hooks.amm.useBurnSync ? Hooks.amm.useBurnSync() : { mutate: () => {}, isPending: false };
  const { data: lpBalance } = (Hooks.amm.useLiquidityBalance
    ? Hooks.amm.useLiquidityBalance({
        address,
        userToken: selectedToken.address as `0x${string}`,
        validatorToken: pathToken.address as `0x${string}`,
      })
    : { data: null }) as { data: bigint | null };

  // ORDER LIQUIDITY STATE
  const [orderAmount, setOrderAmount] = useState('');
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');
  const [tick, setTick] = useState('0');
  const [isFlip, setIsFlip] = useState(false);
  const [isOrdering, setIsOrdering] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [depositTokenAddress, setDepositTokenAddress] = useState<string>(quoteToken.address);
  const [orderDebug, setOrderDebug] = useState<{
    message: string;
    data?: string;
    params?: Record<string, unknown>;
  } | null>(null);
  const [dexSpendBalance, setDexSpendBalance] = useState('0');
  const [dexBalances, setDexBalances] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchAllDexBalances = async () => {
      if (!publicClient || !address) return;
      const dexMap = await getDexBalancesBatch(
        publicClient,
        address,
        tokens.map((token) => ({ address: token.address, decimals: token.decimals })),
        chainId
      );
      const formattedMap: Record<string, string> = {};
      Object.entries(dexMap).forEach(([key, value]) => {
        formattedMap[key] = value.formatted;
      });
      setDexBalances(formattedMap);
      const spendToken = orderType === 'buy' ? quoteToken : selectedToken;
      setDexSpendBalance(dexMap[spendToken.address]?.formatted ?? '0.00');
    };
    fetchAllDexBalances();
  }, [publicClient, address, tokens, isOrdering, chainId, orderType, selectedToken, quoteToken]);

  useEffect(() => {
    const spendToken = orderType === 'buy' ? quoteToken : selectedToken;
    setDepositTokenAddress(spendToken.address);
  }, [orderType, selectedToken, quoteToken]);
  
  const handleRemoveFeeLiquidity = () => {
      if (!address || !lpAmount) return;
      burnLiquidity.mutate({
          userTokenAddress: selectedToken.address,
          validatorTokenAddress: pathToken.address,
          liquidityAmount: parseUnits(lpAmount, 18), 
          to: address,
          feeToken: feeToken?.address || pathToken.address,
      });
  };

  const getRevertReason = (error: unknown) => {
      if (error instanceof BaseError) {
          const revertError = error.walk((err) => err instanceof ContractFunctionRevertedError);
          if (revertError instanceof ContractFunctionRevertedError) {
              return revertError.shortMessage ?? revertError.message;
          }
          return error.shortMessage ?? error.message;
      }
      if (error instanceof Error) return error.message;
      return 'Unknown error';
  };

  const getRevertData = (error: unknown) => {
      const anyError = error as { data?: string; cause?: unknown };
      if (anyError?.data && typeof anyError.data === 'string') return anyError.data;
      const cause = anyError?.cause as { data?: string; cause?: unknown } | undefined;
      if (cause?.data && typeof cause.data === 'string') return cause.data;
      const nested = cause?.cause as { data?: string } | undefined;
      if (nested?.data && typeof nested.data === 'string') return nested.data;
      return undefined;
  };

  const checkCrossedOrder = async (tickVal: number, type: 'buy' | 'sell') => {
      try {
          const response = await fetch(`/api/orderbook?token=${selectedToken.address}&depth=1&chainId=${chainId}`);
          if (!response.ok) return null;
          const data = (await response.json()) as { bids: { tick: number }[]; asks: { tick: number }[] };
          const bestBid = data.bids?.[0]?.tick;
          const bestAsk = data.asks?.[0]?.tick;
          if (type === 'buy' && typeof bestAsk === 'number' && tickVal >= bestAsk) {
              return `Buy tick ${tickVal} crosses best ask ${bestAsk}`;
          }
          if (type === 'sell' && typeof bestBid === 'number' && tickVal <= bestBid) {
              return `Sell tick ${tickVal} crosses best bid ${bestBid}`;
          }
          return null;
      } catch {
          return null;
      }
  };

  const handlePlaceOrder = async () => {
      if (!orderAmount || !walletClient || !publicClient || !address) return;
      if (chainId !== 42431) {
          toast.error('Orderbook is only supported on Tempo testnet');
          return;
      }
      if (selectedToken.symbol === 'pathUSD') {
          toast.error('pathUSD cannot be used as the base token for limit orders');
          return;
      }
      if (walletChainId && walletChainId !== chainId) {
          toast.error('Wrong network selected');
          return;
      }
      if (publicChainId && publicChainId !== chainId) {
          toast.error('Network mismatch');
          return;
      }
      const amount = parseUnits(orderAmount, selectedToken.decimals);
      if (amount <= 0n) {
          toast.error('Amount must be greater than zero');
          return;
      }

      setIsApproving(false);
      setIsOrdering(true);
      setOrderDebug(null);
      try {
          const tickVal = isNaN(parseInt(tick)) ? 0 : parseInt(tick);
          if (tickVal % 10 !== 0) {
              toast.error('Tick must be a multiple of 10');
              return;
          }
          if (tickVal < -2000 || tickVal > 2000) {
              toast.error('Tick must be between -2000 and 2000');
              return;
          }
          const crossed = await checkCrossedOrder(tickVal, orderType);
          if (crossed) {
              toast(crossed, { icon: '⚠️' });
              setOrderDebug({ message: crossed, params: { tick: tickVal, side: orderType } });
          }
          const isBid = orderType === 'buy';
          const spendToken = orderType === 'buy' ? quoteToken : selectedToken;
          const tokenToSpend = spendToken.address;
          const spendAmount = parseUnits(orderAmount, spendToken.decimals);
          if (tokenToSpend !== ZERO_ADDRESS) {
              const balance = (await publicClient.readContract({
                  address: tokenToSpend as `0x${string}`,
                  abi: ERC20_ALLOWANCE_ABI,
                  functionName: 'balanceOf',
                  args: [address as `0x${string}`]
              })) as bigint;
              if (balance < spendAmount) {
                  toast.error('Insufficient wallet balance for this order');
                  return;
              }
          }
          const flipTick = isFlip ? (isBid ? tickVal + 10 : tickVal - 10) : undefined;
          if (showOrderDebug) {
              try {
                  if (tokenToSpend !== ZERO_ADDRESS) {
                      const allowance = (await publicClient.readContract({
                          address: tokenToSpend as `0x${string}`,
                          abi: ERC20_ALLOWANCE_ABI,
                          functionName: 'allowance',
                          args: [address as `0x${string}`, getDexAddressForChain(chainId)],
                      })) as bigint;
                      if (allowance < spendAmount) {
                          const params = {
                              token: selectedToken.address,
                              amount: amount.toString(),
                              isBid,
                              tick: tickVal,
                              flipTick,
                              spendToken: tokenToSpend,
                              spendAmount: spendAmount.toString(),
                              dex: getDexAddressForChain(chainId),
                              allowance: allowance.toString(),
                          };
                          setOrderDebug({ message: 'Approval required; skipping simulation', params });
                      } else if (isFlip) {
                          if (typeof flipTick !== 'number' || flipTick < -2000 || flipTick > 2000) {
                              toast.error('Flip tick is out of bounds');
                              return;
                          }
                          await publicClient.simulateContract({
                              address: getDexAddressForChain(chainId),
                              abi: DEX_PLACE_FLIP_ABI,
                              functionName: 'placeFlip',
                              args: [selectedToken.address, toUint128(amount), isBid, tickVal, flipTick],
                              account: address as `0x${string}`
                          });
                      } else {
                          await publicClient.simulateContract({
                              address: getDexAddressForChain(chainId),
                              abi: DEX_PLACE_ABI,
                              functionName: 'place',
                              args: [selectedToken.address, toUint128(amount), isBid, tickVal],
                              account: address as `0x${string}`
                          });
                      }
                  } else if (isFlip) {
                      if (typeof flipTick !== 'number' || flipTick < -2000 || flipTick > 2000) {
                          toast.error('Flip tick is out of bounds');
                          return;
                      }
                      await publicClient.simulateContract({
                          address: getDexAddressForChain(chainId),
                          abi: DEX_PLACE_FLIP_ABI,
                          functionName: 'placeFlip',
                          args: [selectedToken.address, toUint128(amount), isBid, tickVal, flipTick],
                          account: address as `0x${string}`
                      });
                  } else {
                      await publicClient.simulateContract({
                          address: getDexAddressForChain(chainId),
                          abi: DEX_PLACE_ABI,
                          functionName: 'place',
                          args: [selectedToken.address, toUint128(amount), isBid, tickVal],
                          account: address as `0x${string}`
                      });
                  }
              } catch (e) {
                  const reason = getRevertReason(e);
                  const data = getRevertData(e);
                  const params = {
                      token: selectedToken.address,
                      amount: amount.toString(),
                      isBid,
                      tick: tickVal,
                      flipTick,
                      spendToken: tokenToSpend,
                      spendAmount: spendAmount.toString(),
                      dex: getDexAddressForChain(chainId),
                  };
                  setOrderDebug({ message: reason, data, params });
                  console.error('Order simulation failed', { reason, data, params, error: e });
                  toast.error(`Order simulation failed: ${reason}${data ? ` (data: ${data})` : ''}`);
                  return;
              }
          }
          const hash = await placeOrder(
            walletClient,
            publicClient as unknown as PublicClient,
            address,
            selectedToken.address,
            amount,
            isBid,
            tickVal,
            isFlip,
            (stage) => {
              if (stage === 'approving') {
                setIsApproving(true);
              } else {
                setIsApproving(false);
              }
            },
            chainId,
            flipTick
          );
          toast.custom(() => <TxToast hash={hash} title="Order submitted" />);
          setOrderAmount('');
      } catch (e: unknown) {
          if (isUserCancellation(e)) {
              return;
          }
          console.error(e);
          const msg = e instanceof Error ? e.message : 'Order placement failed';
          const detail = msg.length > 200 ? `${msg.slice(0, 200)}...` : msg;
          toast.error(detail);
      } finally {
           setIsOrdering(false);
           setIsApproving(false);
       }
   };

  // Modal State
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6 w-full max-w-md">
      {/* Glass Card Container */}
      <div className="relative w-full group">
        {/* Outer glow effect */}
        <div className="absolute -inset-[1px] rounded-3xl bg-gradient-to-r from-[#BC13FE]/20 via-[#00F3FF]/20 to-[#BC13FE]/20 opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-500" />

        {/* Main card */}
        <div className="relative p-6 rounded-3xl border border-white/10 bg-black/60 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          {/* Tabs */}
          <div className="flex gap-2 mb-6 p-1.5 rounded-2xl bg-white/[0.03] border border-white/5">
            <button
              onClick={() => setActiveTab('fee')}
              className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                activeTab === 'fee'
                  ? 'bg-gradient-to-r from-[#00F3FF]/15 to-[#BC13FE]/15 text-white border border-[#00F3FF]/30 shadow-[0_0_15px_rgba(0,243,255,0.15)]'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
              }`}
            >
              Fee Liquidity
            </button>
            <button
              onClick={() => setActiveTab('order')}
              className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                activeTab === 'order'
                  ? 'bg-gradient-to-r from-[#00F3FF]/15 to-[#BC13FE]/15 text-white border border-[#00F3FF]/30 shadow-[0_0_15px_rgba(0,243,255,0.15)]'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
              }`}
            >
              Orderbook (Limit)
            </button>
          </div>

          {/* Header */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#BC13FE]/20 to-[#00F3FF]/20 flex items-center justify-center border border-white/10">
              {activeTab === 'fee' ? (
                <svg className="w-4 h-4 text-[#BC13FE]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-[#00F3FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-white">{activeTab === 'fee' ? 'Manage Fee Liquidity' : 'Place Limit Order'}</h2>
              <p className="text-[10px] text-zinc-500">{activeTab === 'fee' ? 'Add or remove liquidity' : 'Set your price'}</p>
            </div>
          </div>

          {activeTab === 'fee' && (
            <div className="space-y-5">
              <ManageFeeLiquidity
                userToken={selectedToken.address}
                validatorToken={pathToken.address}
                userTokenDecimals={selectedToken.decimals}
                validatorTokenDecimals={pathToken.decimals}
                userTokenSymbol={selectedToken.symbol}
                validatorTokenSymbol={pathToken.symbol}
                showMaintenance
              />

              {/* Remove Liquidity Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-medium text-zinc-400">Remove Liquidity</span>
                  <span className="text-[10px] text-zinc-600">LP burn uses validator ratio</span>
                </div>
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Amount</span>
                    <span className="text-[10px] text-zinc-500">
                      Available: <span className="text-zinc-400">{lpBalance ? Number(formatUnits(lpBalance, 18)).toFixed(4) : '0'}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={lpAmount}
                      onChange={(e) => setLpAmount(e.target.value)}
                      placeholder="0.0"
                      className="w-full bg-transparent text-xl font-bold text-white outline-none placeholder-zinc-700"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (lpBalance) setLpAmount(formatUnits(lpBalance, 18));
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:border-white/20 text-xs transition-all"
                    >
                      Max
                    </button>
                  </div>
                  <button
                    onClick={handleRemoveFeeLiquidity}
                    disabled={burnLiquidity.isPending || !lpAmount}
                    className="w-full py-2.5 bg-red-500/10 hover:bg-red-500/15 border border-red-500/30 text-red-400 font-semibold text-sm rounded-xl transition-all disabled:opacity-40"
                  >
                    {burnLiquidity.isPending ? 'Removing...' : 'Remove Liquidity'}
                  </button>
                </div>
              </div>
              <DexAccount />
            </div>
          )}

          {activeTab === 'order' && (
            <div className="space-y-4">
              {/* Order Type */}
              <div className="flex gap-2">
                <button
                  onClick={() => setOrderType('buy')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    orderType === 'buy'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40'
                      : 'bg-white/[0.03] text-zinc-500 border border-white/5 hover:bg-white/5 hover:text-zinc-300'
                  }`}
                >
                  Buy {selectedToken.symbol}
                </button>
                <button
                  onClick={() => setOrderType('sell')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    orderType === 'sell'
                      ? 'bg-red-500/15 text-red-400 border border-red-500/40'
                      : 'bg-white/[0.03] text-zinc-500 border border-white/5 hover:bg-white/5 hover:text-zinc-300'
                  }`}
                >
                  Sell {selectedToken.symbol}
                </button>
              </div>

              {/* DEX Balance */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wide">DEX Balance</span>
                  <span className="text-xs font-medium text-zinc-300">{Number(dexSpendBalance).toFixed(4)}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[quoteToken, selectedToken]
                    .filter((token, index, self) =>
                      self.findIndex(t => t.address === token.address) === index
                    )
                    .map((token, index) => (
                      <button
                        key={`${token.address}-${index}`}
                        type="button"
                        onClick={() => setDepositTokenAddress(token.address)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${
                          depositTokenAddress === token.address
                            ? 'bg-[#00F3FF]/10 text-[#00F3FF] border border-[#00F3FF]/30'
                            : 'bg-white/5 text-zinc-500 border border-white/5 hover:text-zinc-300'
                        }`}
                      >
                        {token.symbol}
                      </button>
                    ))}
                </div>
                <div className="text-[10px] text-zinc-600">
                  Orders use DEX balance first; flip execution requires DEX balance
                </div>
              </div>

              {/* Order Details */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Order Details</span>
                  <span className="text-[10px] text-zinc-500">
                    Wallet: <span className="text-zinc-400">{orderType === 'sell' ? Number(tokenBalance).toFixed(4) : `${Number(pathBalance).toFixed(4)} ${quoteToken.symbol}`}</span>
                  </span>
                </div>

                {/* Amount Input */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={orderAmount}
                    onChange={(e) => setOrderAmount(e.target.value)}
                    placeholder="0.0"
                    className="w-full bg-transparent text-xl font-bold text-white outline-none placeholder-zinc-700"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const max = orderType === 'buy' ? pathBalance : tokenBalance;
                      if (max && Number(max) > 0) setOrderAmount(max);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-400 hover:text-white text-[10px] transition-all"
                  >
                    Max
                  </button>
                  <button
                    onClick={() => setIsTokenModalOpen(true)}
                    className="flex items-center gap-1 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-xl transition-all border border-white/10 hover:border-white/20"
                  >
                    <span className="text-sm font-medium text-white">{selectedToken.symbol}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                </div>

                {/* Price Tick */}
                <div className="pt-2 border-t border-white/5">
                  <div className="flex justify-between mb-2">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Price Tick</span>
                    <span className="text-[10px] text-zinc-600">0 = 1:1 peg</span>
                  </div>
                  <input
                    type="number"
                    value={tick}
                    onChange={(e) => setTick(e.target.value)}
                    className="w-full bg-transparent text-lg font-bold text-white outline-none placeholder-zinc-700"
                  />
                  <p className="text-[10px] text-zinc-600 mt-1">Higher tick = higher price</p>
                </div>
              </div>

              {/* Flip Order Toggle */}
              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-white/[0.02] border border-white/5 cursor-pointer hover:bg-white/[0.04] transition-all">
                <input
                  type="checkbox"
                  id="flipOrder"
                  checked={isFlip}
                  onChange={(e) => setIsFlip(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-700 bg-black/40 text-[#00F3FF] focus:ring-[#00F3FF]/50"
                />
                <div className="flex-1">
                  <span className="text-xs text-zinc-300 font-medium">Flip Order</span>
                  <p className="text-[10px] text-zinc-600">Auto-reverse when filled to earn spread</p>
                </div>
              </label>

              {/* Place Order Button */}
              {!isConnected ? (
                <div className="w-full [&_button]:w-full [&_button]:py-3 [&_button]:rounded-2xl [&_button]:font-bold [&_button]:text-sm [&_button]:bg-gradient-to-r [&_button]:from-[#00F3FF] [&_button]:to-[#BC13FE] [&_button]:text-black [&_button]:hover:opacity-90 [&_button]:transition-all [&_button]:shadow-[0_0_20px_rgba(0,243,255,0.2)]">
                  <ConnectButton />
                </div>
              ) : (
                <button
                  onClick={handlePlaceOrder}
                  disabled={isOrdering || !orderAmount}
                  className={`w-full py-3 rounded-2xl font-bold text-sm transition-all disabled:opacity-40 shadow-[0_0_20px_rgba(0,243,255,0.2)] hover:shadow-[0_0_30px_rgba(0,243,255,0.3)] ${
                    orderType === 'buy'
                      ? 'bg-gradient-to-r from-emerald-500 to-[#00F3FF] text-black'
                      : 'bg-gradient-to-r from-red-500 to-[#BC13FE] text-white'
                  }`}
                >
                  {isApproving
                    ? `Approving ${orderType === 'buy' ? quoteToken.symbol : selectedToken.symbol}...`
                    : isOrdering
                    ? 'Placing Order...'
                    : `Place ${orderType === 'buy' ? 'Buy' : 'Sell'} Order`}
                </button>
              )}

              {showOrderDebug && orderDebug && (
                <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20 text-red-400 text-[10px] space-y-1">
                  <div>{orderDebug.message}</div>
                  {orderDebug.data && <div className="font-mono break-all">data: {orderDebug.data}</div>}
                  {orderDebug.params && (
                    <pre className="text-[10px] text-red-300 whitespace-pre-wrap">
                      {JSON.stringify(orderDebug.params, null, 2)}
                    </pre>
                  )}
                </div>
              )}

              <Orderbook baseToken={selectedToken} quoteToken={quoteToken} />
            </div>
          )}

          <TokenModal
            isOpen={isTokenModalOpen}
            onClose={() => setIsTokenModalOpen(false)}
            onSelect={setSelectedToken}
            selectedToken={selectedToken}
            filterTokens={(token) => token.symbol !== 'pathUSD'}
          />
        </div>
      </div>
    </div>
  );
}
