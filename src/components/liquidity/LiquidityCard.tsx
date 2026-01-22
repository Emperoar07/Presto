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
          { address: pathToken.address, decimals: pathToken.decimals },
        ]);
        setTokenBalance(balances[selectedToken.address] ?? '0.00');
        setPathBalance(balances[pathToken.address] ?? '0.00');
    };
    
    fetchBalances();
  }, [publicClient, address, selectedToken, pathToken]);

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
  const [depositTokenAddress, setDepositTokenAddress] = useState<string>(pathToken.address);
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
      const spendToken = orderType === 'buy' ? pathToken : selectedToken;
      setDexSpendBalance(dexMap[spendToken.address]?.formatted ?? '0.00');
    };
    fetchAllDexBalances();
  }, [publicClient, address, tokens, isOrdering, chainId, orderType, selectedToken, pathToken]);

  useEffect(() => {
    const spendToken = orderType === 'buy' ? pathToken : selectedToken;
    setDepositTokenAddress(spendToken.address);
  }, [orderType, selectedToken, pathToken]);
  
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
              toast.error(crossed);
              setOrderDebug({ message: crossed, params: { tick: tickVal, side: orderType } });
              return;
          }
          const isBid = orderType === 'buy';
          const spendToken = orderType === 'buy' ? pathToken : selectedToken;
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
    <div className="flex flex-col gap-7 w-full max-w-md">
       <div className="w-full p-7 rounded-2xl shadow-2xl border border-white/10 bg-black/40 backdrop-blur-md">
      
      {/* Tabs */}
       <div className="flex space-x-3 mb-7 bg-black/20 p-2 rounded-xl border border-white/5">
           <button 
             onClick={() => setActiveTab('fee')}
            className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${activeTab === 'fee' ? 'bg-[#00F3FF]/20 text-[#00F3FF] shadow-[0_0_10px_rgba(0,243,255,0.2)]' : 'text-zinc-400 hover:text-white'}`}
           >
             Fee Liquidity
           </button>
           <button 
             onClick={() => setActiveTab('order')}
            className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${activeTab === 'order' ? 'bg-[#00F3FF]/20 text-[#00F3FF] shadow-[0_0_10px_rgba(0,243,255,0.2)]' : 'text-zinc-400 hover:text-white'}`}
           >
             Orderbook (Limit)
           </button>
       </div>

       <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-white">{activeTab === 'fee' ? 'Manage Fee Liquidity' : 'Place Limit Order'}</h2>
      </div>

      {activeTab === 'fee' && (
          <div className="space-y-7">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white/80">Pool status</span>
                <span className="text-xs text-zinc-500">Validator token: {pathToken.symbol}</span>
              </div>
              <ManageFeeLiquidity 
                  userToken={selectedToken.address} 
                  validatorToken={pathToken.address} 
                  userTokenDecimals={selectedToken.decimals}
                  validatorTokenDecimals={pathToken.decimals}
                  showMaintenance
              />
            </div>

             <div className="space-y-4">
               <div className="flex items-center justify-between">
                 <span className="text-sm font-semibold text-white/80">Liquidity actions</span>
                 <span className="text-xs text-zinc-500">LP burn uses the validator ratio</span>
               </div>
               <div className="p-5 rounded-xl bg-black/20 border border-white/5 space-y-4">
                  <div className="flex justify-between items-center">
                      <span className="text-sm text-zinc-400">Remove liquidity</span>
                      <span className="text-xs text-zinc-500">
                        Available LP: {lpBalance ? formatUnits(lpBalance, 18) : '0'}
                      </span>
                  </div>
                  <div className="flex items-center space-x-2">
                      <input
                      type="text"
                      value={lpAmount}
                      onChange={(e) => setLpAmount(e.target.value)}
                      placeholder="0.0"
                      className="w-full bg-transparent text-2xl font-bold text-white outline-none placeholder-zinc-600"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (lpBalance) setLpAmount(formatUnits(lpBalance, 18));
                        }}
                        className="px-2 py-2 rounded-lg border border-white/10 text-zinc-300 hover:text-white hover:border-white/30 text-xs"
                      >
                        Max
                      </button>
                  </div>
                   <button 
                      onClick={handleRemoveFeeLiquidity}
                      disabled={burnLiquidity.isPending || !lpAmount}
                      className="w-full py-3 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-500 font-bold rounded-xl transition-all disabled:opacity-50"
                   >
                       {burnLiquidity.isPending ? 'Removing...' : 'Remove Liquidity'}
                   </button>
              </div>
             </div>
             <DexAccount />
          </div>
      )}

       {activeTab === 'order' && (
           <div className="space-y-8">
               {/* Order Type */}
               <div className="flex space-x-3">
                    <button 
                      onClick={() => setOrderType('buy')}
                      className={`flex-1 py-3 rounded-xl font-bold transition-all ${orderType === 'buy' ? 'bg-green-500/20 text-green-400 border border-green-500/50' : 'bg-black/20 text-zinc-400 border border-white/5 hover:bg-black/40'}`}
                    >
                        Buy {selectedToken.symbol}
                    </button>
                    <button 
                      onClick={() => setOrderType('sell')}
                      className={`flex-1 py-3 rounded-xl font-bold transition-all ${orderType === 'sell' ? 'bg-red-500/20 text-red-400 border border-red-500/50' : 'bg-black/20 text-zinc-400 border border-white/5 hover:bg-black/40'}`}
                    >
                        Sell {selectedToken.symbol}
                    </button>
               </div>

                {/* DEX Balance */}
                <div className="p-5 rounded-xl bg-black/20 border border-white/5 space-y-4">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-zinc-400">DEX Balance (used first for orders)</span>
                        <span className="text-sm text-zinc-300">{Number(dexSpendBalance).toFixed(4)}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-3">
                        {[pathToken, selectedToken]
                          .filter((token, index, self) =>
                            self.findIndex(t => t.address === token.address) === index
                          )
                          .map((token, index) => (
                          <button
                            key={`${token.address}-${index}`}
                            type="button"
                            onClick={() => setDepositTokenAddress(token.address)}
                            className={`px-3 py-1 rounded-full border text-xs transition-colors ${
                              depositTokenAddress === token.address
                                ? 'border-[#00F3FF]/50 text-[#00F3FF] bg-[#00F3FF]/10'
                                : 'border-white/10 text-zinc-400 hover:text-white hover:border-white/30'
                            }`}
                          >
                            {token.symbol}
                          </button>
                        ))}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-zinc-500">
                            Orders auto-pull from wallet if DEX balance is low.
                        </span>
                        <span className="text-xs text-zinc-500">
                            Tab DEX Bal: {Number(dexBalances[depositTokenAddress] ?? 0).toFixed(4)}
                        </span>
                    </div>
                    <div className="text-xs text-zinc-500">
                        DEX balances are credited by DEX contract actions, not raw token transfers.
                    </div>
                </div>

                <div className="p-6 rounded-xl bg-black/20 border border-white/5 space-y-5">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-zinc-400">Order details</span>
                        <span className="text-xs text-zinc-500">
                            {orderType === 'sell' ? `Wallet: ${Number(tokenBalance).toFixed(4)}` : `Wallet: ${Number(pathBalance).toFixed(4)} pathUSD`}
                        </span>
                    </div>
                    <div className="space-y-4">
                        <div className="flex items-center space-x-2">
                            <input
                            type="text"
                            value={orderAmount}
                            onChange={(e) => setOrderAmount(e.target.value)}
                            placeholder="Amount"
                            className="w-full bg-transparent text-2xl font-bold text-white outline-none placeholder-zinc-600"
                            />
                            <button
                                type="button"
                                onClick={() => {
                                  const max = orderType === 'buy' ? pathBalance : tokenBalance;
                                  if (max && Number(max) > 0) setOrderAmount(max);
                                }}
                                className="px-2 py-2 rounded-lg border border-white/10 text-zinc-300 hover:text-white hover:border-white/30 text-xs"
                            >
                                Max
                            </button>
                             <button 
                                onClick={() => setIsTokenModalOpen(true)}
                                className="flex items-center space-x-1 bg-zinc-800 hover:bg-zinc-700 px-3 py-1 rounded-full transition-colors border border-zinc-700"
                            >
                                <span className="font-semibold text-white">{selectedToken.symbol}</span>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400"><path d="m6 9 6 6 6-6"/></svg>
                            </button>
                        </div>
                        <div>
                            <div className="flex justify-between mb-2">
                                <span className="text-sm text-zinc-400">Price tick</span>
                                <span className="text-xs text-zinc-500">0 = 1:1 peg</span>
                            </div>
                            <input
                                type="number"
                                value={tick}
                                onChange={(e) => setTick(e.target.value)}
                                className="w-full bg-transparent text-xl font-bold text-white outline-none placeholder-zinc-600"
                            />
                            <p className="text-xs text-zinc-500 mt-1">Higher tick means higher price.</p>
                        </div>
                    </div>
                </div>

                {/* Flip Order Toggle */}
                <div className="flex items-center space-x-3 px-1">
                    <input 
                        type="checkbox" 
                        id="flipOrder" 
                        checked={isFlip} 
                        onChange={(e) => setIsFlip(e.target.checked)}
                        className="w-4 h-4 rounded border-zinc-600 bg-black/20 text-[#00F3FF] focus:ring-[#00F3FF]"
                    />
                    <label htmlFor="flipOrder" className="text-sm text-zinc-400 select-none cursor-pointer flex items-center gap-1">
                        Flip Order (Earn Spread)
                        <span className="text-xs text-zinc-600 bg-zinc-800 rounded-full w-4 h-4 flex items-center justify-center cursor-help" title="Automatically places a reverse order when filled to earn trading fees.">?</span>
                    </label>
                </div>

                {/* Place Order Button */}
                {!isConnected ? (
                     <div className="w-full [&_button]:w-full [&_button]:py-4 [&_button]:rounded-xl [&_button]:font-bold [&_button]:text-lg [&_button]:bg-gradient-to-r [&_button]:from-[#00F3FF] [&_button]:to-[#BC13FE] [&_button]:text-black [&_button]:hover:opacity-90 [&_button]:transition-opacity">
                         <ConnectButton />
                     </div>
                ) : (
                    <button 
                        onClick={handlePlaceOrder}
                        disabled={isOrdering || !orderAmount}
                        className="w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-[#00F3FF] to-[#BC13FE] text-black hover:opacity-90 transition-opacity disabled:opacity-50 shadow-[0_0_20px_rgba(0,243,255,0.3)]"
                    >
                        {isApproving ? `Approving ${orderType === 'buy' ? pathToken.symbol : selectedToken.symbol}...` 
                          : isOrdering ? 'Placing Order...' 
                          : `Place ${orderType === 'buy' ? 'Buy' : 'Sell'} Order`}
                    </button>
                )}

                {showOrderDebug && orderDebug && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs space-y-1">
                    <div>{orderDebug.message}</div>
                    {orderDebug.data && <div className="font-mono break-all">data: {orderDebug.data}</div>}
                    {orderDebug.params && (
                      <pre className="text-[11px] text-red-300 whitespace-pre-wrap">
{JSON.stringify(orderDebug.params, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
                
                <Orderbook baseToken={selectedToken} quoteToken={pathToken} />
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
  );
}
