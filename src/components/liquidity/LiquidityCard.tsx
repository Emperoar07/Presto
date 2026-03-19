'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { BaseError, ContractFunctionRevertedError, formatUnits, parseAbi, parseUnits } from 'viem';
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi';
import toast from 'react-hot-toast';
import { TokenModal } from '../common/TokenModal';
import { ManageFeeLiquidity } from './ManageFeeLiquidity';
import { DexAccount } from './DexAccount';
import { Token, getHubToken, getTokens, isHubToken } from '@/config/tokens';
import { getContractAddresses, isArcChain, isTempoNativeChain, ZERO_ADDRESS as CONTRACT_ZERO_ADDRESS } from '@/config/contracts';
import { Hooks } from '@/lib/tempo';
import { getDexAddressForChain, getDexBalancesBatch, getTokenBalancesBatch, placeOrder, toUint128 } from '@/lib/tempoClient';
import { useFeeToken } from '@/context/FeeTokenContext';
import { TxToast } from '@/components/common/TxToast';
import { isUserCancellation } from '@/lib/errorHandling';
import type { PublicClient } from 'viem';

const DEX_PLACE_ABI = parseAbi(['function place(address token, uint128 amount, bool isBid, int16 tick) external returns (uint128 id)']);
const DEX_PLACE_FLIP_ABI = parseAbi(['function placeFlip(address token, uint128 amount, bool isBid, int16 tick, int16 flipTick) external returns (uint128 id)']);
const ERC20_ALLOWANCE_ABI = parseAbi([
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address owner) external view returns (uint256)',
]);

export function LiquidityCard() {
  const chainId = useChainId();
  const isTempoChain = isTempoNativeChain(chainId);
  const isArcTestnet = isArcChain(chainId);
  const contractAddresses = getContractAddresses(chainId);
  const hasHubAmmDeployment = isTempoChain || contractAddresses.HUB_AMM_ADDRESS !== CONTRACT_ZERO_ADDRESS;
  const supportsLimitOrders = isTempoChain;
  const tokens = useMemo(() => getTokens(chainId), [chainId]);
  const pathToken = getHubToken(chainId) || tokens[0];
  const [selectedToken, setSelectedToken] = useState<Token>(tokens.find((t) => !isHubToken(t, chainId)) || tokens[1]);
  const quoteToken = tokens.find((t) => t.id && t.id === selectedToken.quoteTokenId) || pathToken;
  const [activeTab, setActiveTab] = useState<'fee' | 'order'>(supportsLimitOrders ? 'order' : 'fee');
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { feeToken } = useFeeToken();
  const walletChainId = (walletClient as { chain?: { id?: number } } | null)?.chain?.id;
  const publicChainId = (publicClient as { chain?: { id?: number } } | null)?.chain?.id;

  const [tokenBalance, setTokenBalance] = useState('0.00');
  const [pathBalance, setPathBalance] = useState('0.00');
  const balanceRequestId = useRef(0);
  const [lpAmount, setLpAmount] = useState('');
  const [orderAmount, setOrderAmount] = useState('');
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');
  const [tick, setTick] = useState('0');
  const [isFlip, setIsFlip] = useState(false);
  const [isOrdering, setIsOrdering] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [depositTokenAddress, setDepositTokenAddress] = useState<string>(quoteToken.address);
  const [orderDebug, setOrderDebug] = useState<{ message: string; data?: string; params?: Record<string, unknown> } | null>(null);
  const [dexSpendBalance, setDexSpendBalance] = useState('0');
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);

  const burnLiquidity = Hooks.amm.useBurnSync ? Hooks.amm.useBurnSync() : { mutate: () => {}, isPending: false };
  const { data: lpBalance } = (Hooks.amm.useLiquidityBalance
    ? Hooks.amm.useLiquidityBalance({
        address,
        userToken: selectedToken.address as `0x${string}`,
        validatorToken: pathToken.address as `0x${string}`,
      })
    : { data: null }) as { data: bigint | null };

  useEffect(() => {
    const nextToken = tokens.find((t) => !isHubToken(t, chainId)) || tokens[1];
    setSelectedToken(nextToken);
  }, [chainId, tokens]);

  useEffect(() => {
    if (!supportsLimitOrders && activeTab === 'order') setActiveTab('fee');
  }, [activeTab, supportsLimitOrders]);

  useEffect(() => {
    const fetchBalances = async () => {
      if (!publicClient || !address) return;
      const currentRequestId = ++balanceRequestId.current;
      const balances = await getTokenBalancesBatch(publicClient, address, [
        { address: selectedToken.address, decimals: selectedToken.decimals },
        { address: quoteToken.address, decimals: quoteToken.decimals },
      ]);
      if (currentRequestId !== balanceRequestId.current) return;
      setTokenBalance(balances[selectedToken.address] ?? '0.00');
      setPathBalance(balances[quoteToken.address] ?? '0.00');
    };
    const timer = setTimeout(fetchBalances, 200);
    return () => clearTimeout(timer);
  }, [address, publicClient, quoteToken.address, quoteToken.decimals, selectedToken.address, selectedToken.decimals]);

  useEffect(() => {
    const fetchDexBalances = async () => {
      if (!publicClient || !address) return;
      const spendToken = orderType === 'buy' ? quoteToken : selectedToken;
      const dexMap = await getDexBalancesBatch(
        publicClient,
        address,
        [{ address: spendToken.address, decimals: spendToken.decimals }],
        chainId
      );
      setDexSpendBalance(dexMap[spendToken.address]?.formatted ?? '0.00');
    };
    const timer = setTimeout(fetchDexBalances, 250);
    return () => clearTimeout(timer);
  }, [address, chainId, orderType, publicClient, quoteToken, selectedToken]);

  useEffect(() => {
    const spendToken = orderType === 'buy' ? quoteToken : selectedToken;
    setDepositTokenAddress(spendToken.address);
  }, [orderType, quoteToken, selectedToken]);

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
      if (revertError instanceof ContractFunctionRevertedError) return revertError.shortMessage ?? revertError.message;
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
    return nested?.data;
  };

  const handlePlaceOrder = async () => {
    if (!orderAmount || !walletClient || !publicClient || !address) return;
    if (chainId !== 42431) return toast.error('Orderbook is only supported on Tempo testnet');
    if (isHubToken(selectedToken, chainId)) return toast.error(`${selectedToken.symbol} cannot be used as the base token for limit orders`);
    if (walletChainId && walletChainId !== chainId) return toast.error('Wrong network selected');
    if (publicChainId && publicChainId !== chainId) return toast.error('Network mismatch');

    const amount = parseUnits(orderAmount, selectedToken.decimals);
    if (amount <= 0n) return toast.error('Amount must be greater than zero');

    setIsApproving(false);
    setIsOrdering(true);
    setOrderDebug(null);

    try {
      const tickVal = Number.parseInt(tick, 10) || 0;
      if (tickVal % 10 !== 0) return toast.error('Tick must be a multiple of 10');
      if (tickVal < -2000 || tickVal > 2000) return toast.error('Tick must be between -2000 and 2000');
      const isBid = orderType === 'buy';
      const spendToken = orderType === 'buy' ? quoteToken : selectedToken;
      const spendAmount = parseUnits(orderAmount, spendToken.decimals);

      if (spendToken.address !== CONTRACT_ZERO_ADDRESS) {
        const balance = (await publicClient.readContract({
          address: spendToken.address as `0x${string}`,
          abi: ERC20_ALLOWANCE_ABI,
          functionName: 'balanceOf',
          args: [address as `0x${string}`],
        })) as bigint;
        if (balance < spendAmount) return toast.error('Insufficient wallet balance for this order');
      }

      const flipTick = isFlip ? (isBid ? tickVal + 10 : tickVal - 10) : undefined;
      const placeArgs = [selectedToken.address, toUint128(amount), isBid, tickVal] as const;

      const hash = await placeOrder(
        walletClient,
        publicClient as unknown as PublicClient,
        address,
        selectedToken.address,
        amount,
        isBid,
        tickVal,
        isFlip,
        (stage) => setIsApproving(stage === 'approving'),
        chainId,
        flipTick
      );
      toast.custom(() => <TxToast hash={hash} title="Order submitted" />);
      setOrderAmount('');
    } catch (e: unknown) {
      if (!isUserCancellation(e)) {
        const msg = e instanceof Error ? e.message : 'Order placement failed';
        toast.error(msg.length > 200 ? `${msg.slice(0, 200)}...` : msg);
      }
    } finally {
      setIsOrdering(false);
      setIsApproving(false);
    }
  };

  return (
    <div className="w-full">
      <div className="glass-panel overflow-hidden rounded-[28px] p-5 shadow-xl md:p-7">
        {!hasHubAmmDeployment && (
          <div className="mb-5 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            Arc liquidity contracts are not configured in this environment yet, so pool actions are shown in preview mode only.
          </div>
        )}

        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              {isArcTestnet ? 'Arc Stable Liquidity' : 'Tempo Fee Liquidity'}
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                {isArcTestnet ? 'Stable liquidity workspace' : 'Fee liquidity workspace'}
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                {isArcTestnet ? `Keep ${pathToken.symbol} liquidity organized around the Arc hub model.` : `Manage ${pathToken.symbol}-routed fee pools and maintenance from one surface.`}
              </p>
            </div>
          </div>
          {supportsLimitOrders && (
            <div className="flex gap-2 rounded-2xl border border-slate-200 bg-slate-100/90 p-1.5 dark:border-white/5 dark:bg-white/[0.03]">
              <button
                onClick={() => setActiveTab('fee')}
                className={`rounded-xl px-4 py-2.5 text-xs font-semibold transition-all ${activeTab === 'fee' ? 'border border-primary/20 bg-white text-primary shadow-sm dark:bg-white/10' : 'text-slate-500 dark:text-slate-400'}`}
              >
                Fee Liquidity
              </button>
              <button
                onClick={() => setActiveTab('order')}
                className={`rounded-xl px-4 py-2.5 text-xs font-semibold transition-all ${activeTab === 'order' ? 'border border-primary/20 bg-white text-primary shadow-sm dark:bg-white/10' : 'text-slate-500 dark:text-slate-400'}`}
              >
                Place Limit Order
              </button>
            </div>
          )}
        </div>

        {activeTab === 'fee' && (
          <>
            {isTempoChain && (
              <div className="mb-6 grid gap-3 md:grid-cols-2">
                {[
                  { label: 'Mode', value: 'Fee-routed pools' },
                  { label: 'Hub asset', value: pathToken.symbol },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-slate-200 bg-white/75 px-4 py-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{item.label}</p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-900 dark:text-white">{item.value}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="mb-6 rounded-2xl border border-slate-200 bg-white/75 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    Pool Pair
                  </p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Choose the asset you want to pair against {pathToken.symbol}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsTokenModalOpen(true)}
                  className="inline-flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition-colors hover:border-primary/30 dark:border-white/10 dark:bg-slate-950/40"
                >
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      Active pair
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                      {selectedToken.symbol} / {pathToken.symbol}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-base text-slate-400">expand_more</span>
                </button>
              </div>
            </div>

            <div className={`grid gap-5 ${isTempoChain ? 'xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.72fr)]' : 'grid-cols-1'}`}>
              <ManageFeeLiquidity
                userToken={selectedToken.address}
                validatorToken={pathToken.address}
                userTokenDecimals={selectedToken.decimals}
                validatorTokenDecimals={pathToken.decimals}
                userTokenSymbol={selectedToken.symbol}
                validatorTokenSymbol={pathToken.symbol}
                showMaintenance={isTempoChain}
              />

              {isTempoChain && (
                <div className="space-y-5">
                  <div className="rounded-[28px] border border-slate-200 bg-white/85 p-5 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.4)] dark:border-white/10 dark:bg-white/[0.04]">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Remove Liquidity</p>
                        <h3 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">Exit fee-side position</h3>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-right dark:border-white/10 dark:bg-white/[0.03]">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">LP available</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{lpBalance ? Number(formatUnits(lpBalance, 18)).toFixed(4) : '0.0000'}</p>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-slate-950/40">
                      <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                        <span>Amount</span>
                        <button type="button" onClick={() => lpBalance && setLpAmount(formatUnits(lpBalance, 18))} className="rounded-full border border-primary/20 px-2.5 py-1 text-primary hover:bg-primary/10">
                          Max
                        </button>
                      </div>
                      <input
                        type="text"
                        value={lpAmount}
                        onChange={(e) => setLpAmount(e.target.value)}
                        placeholder="0.0"
                        className="w-full bg-transparent text-3xl font-semibold tracking-tight text-slate-900 outline-none placeholder:text-slate-300 dark:text-white dark:placeholder:text-slate-700"
                      />
                    </div>
                    <button
                      onClick={handleRemoveFeeLiquidity}
                      disabled={burnLiquidity.isPending || !lpAmount}
                      className="mt-5 w-full rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-500 transition-all hover:bg-red-500/15 disabled:opacity-40 dark:text-red-400"
                    >
                      {burnLiquidity.isPending ? 'Removing...' : 'Remove Liquidity'}
                    </button>
                  </div>

                  <div className="rounded-[28px] border border-slate-200 bg-white/85 p-5 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.4)] dark:border-white/10 dark:bg-white/[0.04]">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">DEX Account</p>
                        <h3 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">Operational balances</h3>
                      </div>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400">
                        Tempo only
                      </span>
                    </div>
                    <DexAccount className="p-0" />
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'order' && supportsLimitOrders && (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              {[
                { label: 'Order mode', value: orderType === 'buy' ? 'Bid' : 'Ask' },
                { label: 'Base asset', value: selectedToken.symbol },
                { label: 'Funding balance', value: Number(dexSpendBalance).toFixed(4) },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-slate-200 bg-white/75 px-4 py-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{item.label}</p>
                  <p className="mt-2 text-lg font-bold text-slate-900 dark:text-white">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400">
              Tempo limit orders are funded from your DEX balance and priced with ticks around the stable 1:1 center. Build the order on the left, then sanity-check funding and optional flip behavior on the right.
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white/85 p-5 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.4)] dark:border-white/10 dark:bg-white/[0.04]">
              <div className="flex gap-2">
                <button onClick={() => setOrderType('buy')} className={`flex-1 rounded-xl py-2.5 text-sm font-semibold ${orderType === 'buy' ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'border border-slate-200 bg-slate-100 text-slate-500 dark:border-white/5 dark:bg-white/[0.03] dark:text-slate-400'}`}>Buy {selectedToken.symbol}</button>
                <button onClick={() => setOrderType('sell')} className={`flex-1 rounded-xl py-2.5 text-sm font-semibold ${orderType === 'sell' ? 'border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400' : 'border border-slate-200 bg-slate-100 text-slate-500 dark:border-white/5 dark:bg-white/[0.03] dark:text-slate-400'}`}>Sell {selectedToken.symbol}</button>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-slate-950/40">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Order Amount</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">Wallet: {orderType === 'sell' ? Number(tokenBalance).toFixed(4) : `${Number(pathBalance).toFixed(4)} ${quoteToken.symbol}`}</span>
                    </div>
                    <div className="flex items-end gap-2">
                      <input type="text" value={orderAmount} onChange={(e) => setOrderAmount(e.target.value)} placeholder="0.0" className="w-full bg-transparent text-3xl font-semibold tracking-tight text-slate-900 outline-none placeholder:text-slate-300 dark:text-white dark:placeholder:text-slate-700" />
                      <button type="button" onClick={() => { const max = orderType === 'buy' ? pathBalance : tokenBalance; if (max && Number(max) > 0) setOrderAmount(max); }} className="rounded-full border border-primary/20 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10">Max</button>
                      <button onClick={() => setIsTokenModalOpen(true)} className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 dark:border-white/10 dark:bg-white/[0.06] dark:text-white">{selectedToken.symbol}<span className="material-symbols-outlined text-sm text-slate-400">expand_more</span></button>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-slate-950/40">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Price Tick</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">0 = 1:1 peg</span>
                    </div>
                    <input type="number" value={tick} onChange={(e) => setTick(e.target.value)} className="w-full bg-transparent text-2xl font-semibold tracking-tight text-slate-900 outline-none dark:text-white" />
                    <div className="mt-3 flex items-center gap-2">
                      {[0, 10, 20, 30].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setTick(String(preset))}
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all ${
                            tick === String(preset)
                              ? 'border border-primary/30 bg-primary/10 text-primary'
                              : 'border border-slate-200 bg-white text-slate-500 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-400'
                          }`}
                        >
                          {preset > 0 ? `+${preset}` : `${preset}`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-slate-950/40">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">DEX Balance</span>
                      <span className="text-sm font-medium text-slate-900 dark:text-white">{Number(dexSpendBalance).toFixed(4)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[quoteToken, selectedToken].filter((token, index, self) => self.findIndex((t) => t.address === token.address) === index).map((token, index) => (
                        <button key={`${token.address}-${index}`} type="button" onClick={() => setDepositTokenAddress(token.address)} className={`rounded-lg px-2.5 py-1 text-[10px] font-medium ${depositTokenAddress === token.address ? 'border border-primary/30 bg-primary/10 text-primary' : 'border border-slate-200 bg-white text-slate-500 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-400'}`}>
                          {token.symbol}
                        </button>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Orders use DEX balance first; flip execution requires DEX balance.</p>
                  </div>
                  <label className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-slate-950/40">
                    <input type="checkbox" checked={isFlip} onChange={(e) => setIsFlip(e.target.checked)} className="h-4 w-4 rounded border-slate-300 bg-white text-primary focus:ring-primary/50 dark:border-slate-700 dark:bg-black/40" />
                    <div className="flex-1">
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Flip Order</span>
                      <p className="text-[10px] text-slate-500 dark:text-slate-500">Auto-reverse when filled to earn spread.</p>
                    </div>
                  </label>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-slate-950/40">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Execution Summary</p>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Funding asset</span>
                        <span className="font-medium text-slate-900 dark:text-white">{orderType === 'buy' ? quoteToken.symbol : selectedToken.symbol}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Base asset</span>
                        <span className="font-medium text-slate-900 dark:text-white">{selectedToken.symbol}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Flip enabled</span>
                        <span className="font-medium text-slate-900 dark:text-white">{isFlip ? 'Yes' : 'No'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {!isConnected ? (
                <div className="mt-5 w-full [&_button]:w-full [&_button]:rounded-2xl [&_button]:bg-primary [&_button]:py-3 [&_button]:text-sm [&_button]:font-bold [&_button]:text-white [&_button]:hover:bg-primary/90 [&_button]:dark:text-background-dark">
                  <ConnectButton />
                </div>
              ) : (
                <button onClick={handlePlaceOrder} disabled={isOrdering || !orderAmount} className={`mt-5 w-full rounded-2xl py-3 text-sm font-bold text-white transition-all disabled:opacity-40 ${orderType === 'buy' ? 'bg-emerald-500 hover:bg-emerald-500/90' : 'bg-red-500 hover:bg-red-500/90'}`}>
                  {isApproving ? `Approving ${orderType === 'buy' ? quoteToken.symbol : selectedToken.symbol}...` : isOrdering ? 'Placing Order...' : `Place ${orderType === 'buy' ? 'Buy' : 'Sell'} Order`}
                </button>
              )}

              {orderDebug && (
                <div className="mt-4 space-y-1 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-[10px] text-red-500 dark:text-red-400">
                  <div>{orderDebug.message}</div>
                  {orderDebug.data && <div className="break-all font-mono">data: {orderDebug.data}</div>}
                </div>
              )}
            </div>
          </div>
        )}

        <TokenModal
          isOpen={isTokenModalOpen}
          onClose={() => setIsTokenModalOpen(false)}
          onSelect={setSelectedToken}
          selectedToken={selectedToken}
          filterTokens={(token) => !isHubToken(token, chainId)}
        />
      </div>
    </div>
  );
}
