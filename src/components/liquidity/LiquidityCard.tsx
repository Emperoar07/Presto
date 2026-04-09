'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { BaseError, ContractFunctionRevertedError, formatUnits, parseAbi, parseUnits } from 'viem';
import { useSearchParams } from 'next/navigation';
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
import {
  createLocalActivityItem,
  patchLocalActivityItem,
  upsertLocalActivityHistoryItem,
} from '@/lib/activityHistory';
import { emitPrestoDataRefresh, refreshPrestoQueries, subscribePrestoDataRefresh } from '@/lib/appDataRefresh';

const DEX_PLACE_ABI = parseAbi(['function place(address token, uint128 amount, bool isBid, int16 tick) external returns (uint128 id)']);
const DEX_PLACE_FLIP_ABI = parseAbi(['function placeFlip(address token, uint128 amount, bool isBid, int16 tick, int16 flipTick) external returns (uint128 id)']);
const ERC20_ALLOWANCE_ABI = parseAbi([
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address owner) external view returns (uint256)',
]);

type BurnLiquidityArgs = {
  userTokenAddress: `0x${string}`;
  validatorTokenAddress: `0x${string}`;
  liquidityAmount: bigint;
  to: `0x${string}`;
  feeToken: `0x${string}`;
};

type BurnLiquidityAction = {
  mutate: (args: BurnLiquidityArgs) => void;
  mutateAsync?: (args: BurnLiquidityArgs) => Promise<`0x${string}`>;
  isPending: boolean;
};

function ProvidedLiquidityRow({
  token,
  hubToken,
  walletAddress,
  isActive,
  onApplyRemovePercent,
  onFocusAdd,
  isExpanded,
  onToggle,
}: {
  token: Token;
  hubToken: Token;
  walletAddress?: `0x${string}`;
  isActive: boolean;
  onApplyRemovePercent: (token: Token, percent: number, rawLiquidity: bigint) => void;
  onFocusAdd: (token: Token) => void;
  isExpanded: boolean;
  onToggle: (tokenAddress: string) => void;
}) {
  const { data: liquidity } = (Hooks.amm.useLiquidityBalance
    ? Hooks.amm.useLiquidityBalance({
        address: walletAddress,
        userToken: token.address as `0x${string}`,
        validatorToken: hubToken.address as `0x${string}`,
      })
    : { data: null }) as { data: bigint | null };

  const formattedBalance = liquidity ? Number(formatUnits(liquidity, 18)) : 0;

  if (formattedBalance <= 0) return null;

  return (
    <div
      className={`rounded-[12px] px-4 py-3 transition-all ${isActive ? '' : ''}`}
      style={{
        border: isActive ? '1px solid rgba(37,192,244,0.25)' : '1px solid rgba(255,255,255,0.07)',
        background: isActive ? 'rgba(37,192,244,0.08)' : '#0f172a',
      }}
    >
      <button
        type="button"
        onClick={() => onToggle(token.address)}
        className="flex w-full flex-col gap-4 text-left md:flex-row md:items-center md:justify-between"
      >
        <div>
          <p className="text-[13px] font-semibold text-slate-100">
            {token.symbol} / {hubToken.symbol}
          </p>
          <p className="text-[11px] text-slate-500">Provided liquidity</p>
        </div>
        <div className="flex items-center gap-4 md:justify-end">
          <p className="text-[13px] font-bold text-slate-100">{formattedBalance.toFixed(4)} LP</p>
          <span className="material-symbols-outlined text-slate-500">
            {isExpanded ? 'expand_less' : 'expand_more'}
          </span>
        </div>
      </button>
      {isExpanded && (
        <div className="mt-3 flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <button
            type="button"
            onClick={() => onFocusAdd(token)}
            className="rounded-[8px] px-3 py-1.5 text-[11px] font-bold text-[#090e1a] transition-colors"
            style={{ background: '#25c0f4' }}
          >
            Add Liquidity
          </button>
          {[25, 50, 100].map((percent) => (
            <button
              key={percent}
              type="button"
              onClick={() => onApplyRemovePercent(token, percent, liquidity ?? 0n)}
              className={`rounded-[8px] px-3 py-1.5 text-[11px] font-bold transition-colors ${
                percent === 100
                  ? 'text-red-400'
                  : 'text-slate-300'
              }`}
              style={{
                border: percent === 100 ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(255,255,255,0.07)',
                background: percent === 100 ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)',
              }}
            >
              Remove {percent}%
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function LiquidityCard({
  initialTokenAddress,
}: {
  initialTokenAddress?: string;
} = {}) {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const chainId = useChainId();
  const isTempoChain = isTempoNativeChain(chainId);
  const isArcTestnet = isArcChain(chainId);
  const contractAddresses = getContractAddresses(chainId);
  const hasHubAmmDeployment = isTempoChain || contractAddresses.HUB_AMM_ADDRESS !== CONTRACT_ZERO_ADDRESS;
  const supportsLimitOrders = isTempoChain;
  const tokens = useMemo(() => getTokens(chainId), [chainId]);
  const pathToken = getHubToken(chainId) || tokens[0];
  const [selectedToken, setSelectedToken] = useState<Token>(() => {
    if (initialTokenAddress) {
      const match = tokens.find((t) => t.address.toLowerCase() === initialTokenAddress.toLowerCase());
      if (match && !isHubToken(match, chainId)) return match;
    }
    return tokens.find((t) => !isHubToken(t, chainId)) || tokens[1];
  });
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
  const [balanceRefreshTick, setBalanceRefreshTick] = useState(0);
  const [removeAmount, setRemoveAmount] = useState('');
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
  const [expandedProvidedPair, setExpandedProvidedPair] = useState<string | null>(null);
  const addActionRef = useRef<HTMLDivElement | null>(null);
  const removeActionRef = useRef<HTMLDivElement | null>(null);

  const burnLiquidity: BurnLiquidityAction = Hooks.amm.useBurnSync ? Hooks.amm.useBurnSync() : { mutate: () => {}, isPending: false };
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
    const pairParam = searchParams.get('pair');
    if (!pairParam) return;

    const matchedToken = tokens.find(
      (token) =>
        token.address.toLowerCase() === pairParam.toLowerCase() ||
        token.symbol.toLowerCase() === pairParam.toLowerCase()
    );

    if (matchedToken && !isHubToken(matchedToken, chainId)) {
      setSelectedToken(matchedToken);
      setActiveTab('fee');
    }
  }, [chainId, searchParams, tokens]);

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
  }, [address, publicClient, quoteToken.address, quoteToken.decimals, selectedToken.address, selectedToken.decimals, balanceRefreshTick]);

  useEffect(() => {
    return subscribePrestoDataRefresh(() => {
      setBalanceRefreshTick((v) => v + 1);
    });
  }, []);

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

  useEffect(() => {
    const action = searchParams.get('action');
    const percentParam = searchParams.get('percent');
    if (action !== 'remove' || !percentParam || !lpBalance) return;

    const parsedPercent = Number.parseInt(percentParam, 10);
    if (!Number.isFinite(parsedPercent) || parsedPercent <= 0) return;

    const boundedPercent = Math.min(parsedPercent, 100);
    const nextAmount = formatUnits((lpBalance * BigInt(boundedPercent)) / 100n, 18);
    setRemoveAmount(nextAmount);
    setActiveTab('fee');
  }, [lpBalance, searchParams]);

  const handleRemoveFeeLiquidity = async () => {
    if (!address || !removeAmount) return;
    let activityId: string | null = null;
    let hash: `0x${string}` | undefined;
    const payload = {
      userTokenAddress: selectedToken.address,
      validatorTokenAddress: pathToken.address,
      liquidityAmount: parseUnits(removeAmount, 18),
      to: address as `0x${string}`,
      feeToken: feeToken?.address || pathToken.address,
    };

    try {
      if (typeof burnLiquidity.mutateAsync === 'function') {
        hash = await burnLiquidity.mutateAsync(payload);
      } else {
        burnLiquidity.mutate(payload);
      }

      const pendingActivity = createLocalActivityItem({
        category: 'liquidity',
        title: `Remove Liquidity ${selectedToken.symbol}/${pathToken.symbol}`,
        subtitle: `${removeAmount} LP`,
        status: 'pending',
        hash: hash ?? null,
      });
      activityId = pendingActivity.id;
      upsertLocalActivityHistoryItem(pendingActivity);

      if (hash) {
        const h = hash;
        toast.custom(() => <TxToast hash={h} title="Liquidity removal submitted" />);
        await publicClient?.waitForTransactionReceipt({ hash: h });
        patchLocalActivityItem(activityId, {
          status: 'success',
          hash,
        });
        await refreshPrestoQueries(queryClient, { address, chainId });
        emitPrestoDataRefresh('liquidity');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to remove liquidity';
      if (activityId) {
        patchLocalActivityItem(activityId, {
          status: 'error',
          hash: hash ?? null,
          errorMessage: message,
        });
      } else {
        upsertLocalActivityHistoryItem(
          createLocalActivityItem({
            category: 'liquidity',
            title: `Remove Liquidity ${selectedToken.symbol}/${pathToken.symbol}`,
            subtitle: `${removeAmount || '0'} LP`,
            status: 'error',
            hash: hash ?? null,
            errorMessage: message,
          }),
        );
      }
      if (!isUserCancellation(error)) toast.error(message);
    }
  };

  const handleApplyRemovePercent = (token: Token, percent: number, rawLiquidity: bigint) => {
    setSelectedToken(token);
    const nextAmount = rawLiquidity > 0n
      ? formatUnits((rawLiquidity * BigInt(percent)) / 100n, 18)
      : '0';
    setRemoveAmount(nextAmount);
    setActiveTab('fee');
    setTimeout(() => {
      removeActionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  const handleFocusAddForPair = (token: Token) => {
    setSelectedToken(token);
    setActiveTab('fee');
    setTimeout(() => {
      addActionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  const providedPairsPanel = isConnected && address ? (
    <div className="rounded-[12px] p-4" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="mb-3">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Your Provided Pairs
        </p>
        <p className="mt-1 text-[13px] text-slate-500">
          Select a pair to add more liquidity, or prefill removal by percentage.
        </p>
      </div>
      <div className="grid gap-3">
        {tokens
          .filter((token) => !isHubToken(token, chainId))
          .map((token) => (
            <ProvidedLiquidityRow
              key={token.address}
              token={token}
              hubToken={pathToken}
              walletAddress={address}
              isActive={selectedToken.address.toLowerCase() === token.address.toLowerCase()}
              onApplyRemovePercent={handleApplyRemovePercent}
              onFocusAdd={handleFocusAddForPair}
              isExpanded={expandedProvidedPair === token.address}
              onToggle={(tokenAddress) =>
                setExpandedProvidedPair((current) => (current === tokenAddress ? null : tokenAddress))
              }
            />
          ))}
      </div>
    </div>
  ) : null;

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
    if (chainId !== 42431) return toast.error('Orderbook is only supported on the native testnet');
    if (isHubToken(selectedToken, chainId)) return toast.error(`${selectedToken.symbol} cannot be used as the base token for limit orders`);
    if (walletChainId && walletChainId !== chainId) return toast.error('Wrong network selected');
    if (publicChainId && publicChainId !== chainId) return toast.error('Network mismatch');

    const amount = parseUnits(orderAmount, selectedToken.decimals);
    if (amount <= 0n) return toast.error('Amount must be greater than zero');

    const tickVal = Number.parseInt(tick, 10) || 0;
    if (tickVal % 10 !== 0) return toast.error('Tick must be a multiple of 10');
    if (tickVal < -2000 || tickVal > 2000) return toast.error('Tick must be between -2000 and 2000');

    setIsApproving(false);
    setIsOrdering(true);
    setOrderDebug(null);
    let activityId: string | null = null;
    let hash: `0x${string}` | undefined;

    try {
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

      hash = await placeOrder(
        walletClient,
        publicClient as unknown as PublicClient,
        address as `0x${string}`,
        selectedToken.address,
        amount,
        isBid,
        tickVal,
        isFlip,
        (stage) => setIsApproving(stage === 'approving'),
        chainId,
        flipTick
      );
      const pendingActivity = createLocalActivityItem({
        category: 'liquidity',
        title: `${orderType === 'buy' ? 'Buy' : 'Sell'} Limit Order ${selectedToken.symbol}`,
        subtitle: `${orderAmount} ${selectedToken.symbol} at tick ${tickVal}`,
        status: 'pending',
        hash,
      });
      activityId = pendingActivity.id;
      upsertLocalActivityHistoryItem(pendingActivity);
      toast.custom(() => <TxToast hash={hash!} title="Order submitted" />);
      setOrderAmount('');
      await publicClient.waitForTransactionReceipt({ hash: hash! });
      if (activityId) {
        patchLocalActivityItem(activityId, {
          status: 'success',
          hash,
        });
      }
      await refreshPrestoQueries(queryClient, { address, chainId });
      emitPrestoDataRefresh('liquidity');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Order placement failed';
      if (activityId) {
        patchLocalActivityItem(activityId, {
          status: 'error',
          hash: hash ?? null,
          errorMessage: msg,
        });
      } else {
        upsertLocalActivityHistoryItem(
          createLocalActivityItem({
            category: 'liquidity',
            title: `${orderType === 'buy' ? 'Buy' : 'Sell'} Limit Order ${selectedToken.symbol}`,
            subtitle: `${orderAmount || '0'} ${selectedToken.symbol}`,
            status: 'error',
            hash: hash ?? null,
            errorMessage: msg,
          }),
        );
      }
      if (!isUserCancellation(e)) {
        toast.error(msg.length > 200 ? `${msg.slice(0, 200)}...` : msg);
      }
    } finally {
      setIsOrdering(false);
      setIsApproving(false);
    }
  };

  return (
    <div className="w-full">
      <div className="overflow-hidden rounded-[16px] p-5 md:p-6" style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.07)' }}>
        {!hasHubAmmDeployment && (
          <div className="mb-5 rounded-[10px] px-4 py-3 text-[13px] text-amber-300" style={{ border: '1px solid rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.08)' }}>
            Arc liquidity contracts are not configured in this environment yet, so pool actions are shown in preview mode only.
          </div>
        )}

        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#25c0f4]" style={{ border: '1px solid rgba(37,192,244,0.2)', background: 'rgba(37,192,244,0.08)' }}>
              <span className="h-1.5 w-1.5 rounded-full bg-[#25c0f4]" />
              {isArcTestnet ? 'Arc Stable Liquidity' : 'Fee Liquidity'}
            </div>
            <div>
              <h2 className="text-[18px] font-extrabold tracking-tight text-slate-100">
                {isArcTestnet
                  ? 'Stable liquidity workspace'
                  : 'Fee liquidity workspace'}
              </h2>
              <p className="mt-1 text-[13px] leading-[1.6] text-slate-500">
                {isArcTestnet
                  ? `Keep ${pathToken.symbol} liquidity organized around the Arc hub model.`
                  : `Manage ${pathToken.symbol}-routed fee pools and maintenance from one surface.`}
              </p>
            </div>
          </div>
          {supportsLimitOrders && (
            <div className="flex gap-1 rounded-[10px] p-1" style={{ background: '#263347' }}>
              <button
                onClick={() => setActiveTab('fee')}
                disabled
                aria-disabled="true"
                title="Fee liquidity is temporarily unavailable"
                className="cursor-not-allowed rounded-[8px] px-4 py-2 text-[12px] font-semibold text-slate-600 opacity-50"
              >
                Fee Liquidity
              </button>
              <button
                onClick={() => setActiveTab('order')}
                className={`rounded-[8px] px-4 py-2 text-[12px] font-semibold transition-all ${activeTab === 'order' ? 'text-slate-100 shadow' : 'text-slate-500'}`}
                style={activeTab === 'order' ? { background: '#1e293b' } : {}}
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
                  <div key={item.label} className="rounded-[12px] px-4 py-4" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-100">{item.value}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="mb-5 rounded-[12px] p-4" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Pool Pair
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {`Choose the asset you want to pair against ${pathToken.symbol}.`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsTokenModalOpen(true)}
                  className="inline-flex min-w-[220px] items-center justify-between gap-3 rounded-[12px] px-4 py-3 text-left transition-colors"
                  style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Active pair
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-100">
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
              removeAmount={removeAmount}
              onRemoveAmountChange={setRemoveAmount}
              pairManagementPanel={providedPairsPanel}
              addActionRef={addActionRef}
              removeActionRef={removeActionRef}
            />

              {isTempoChain && (
                <div className="space-y-5">
                  <div className="rounded-[14px] p-5" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Remove Liquidity</p>
                        <h3 className="mt-1 text-lg font-bold text-slate-100">Exit fee-side position</h3>
                      </div>
                      <div className="rounded-[10px] px-3 py-2 text-right" style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">LP available</p>
                        <p className="mt-1 text-sm font-semibold text-slate-100">{lpBalance ? Number(formatUnits(lpBalance, 18)).toFixed(4) : '0.0000'}</p>
                      </div>
                    </div>
                    <div className="rounded-[10px] p-4" style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div className="mb-2 flex items-center justify-between text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500">
                        <span>Amount</span>
                        <button type="button" onClick={() => lpBalance && setRemoveAmount(formatUnits(lpBalance, 18))} className="rounded-full px-2.5 py-1 text-[11px] font-bold text-[#25c0f4]" style={{ border: '1px solid rgba(37,192,244,0.2)', background: 'rgba(37,192,244,0.08)' }}>
                          Max
                        </button>
                      </div>
                      <input
                        type="text"
                        value={removeAmount}
                        onChange={(e) => setRemoveAmount(e.target.value)}
                        placeholder="0.0"
                        className="w-full bg-transparent text-3xl font-semibold tracking-tight text-slate-100 outline-none placeholder:text-slate-700"
                      />
                    </div>
                    <button
                      onClick={handleRemoveFeeLiquidity}
                      disabled={burnLiquidity.isPending || !removeAmount}
                      className="mt-5 w-full rounded-[10px] px-4 py-3 text-[13px] font-bold text-red-400 transition-all disabled:opacity-40"
                      style={{ border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.08)' }}
                    >
                      {burnLiquidity.isPending ? 'Removing...' : 'Remove Liquidity'}
                    </button>
                  </div>

                  <div className="rounded-[14px] p-5" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">DEX Account</p>
                        <h3 className="mt-1 text-lg font-bold text-slate-100">Operational balances</h3>
                      </div>
                      <span className="rounded-full px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500" style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)' }}>
                        Testnet only
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
                <div key={item.label} className="rounded-[12px] px-4 py-4" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                  <p className="mt-2 text-lg font-bold text-slate-100">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-[12px] px-4 py-4 text-[13px] leading-[1.65] text-slate-500" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}>
              Limit orders are funded from your DEX balance and priced with ticks around the stable 1:1 center. Build the order on the left, then sanity-check funding and optional flip behavior on the right.
            </div>

            <div className="rounded-[14px] p-5" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex gap-2">
                <button onClick={() => setOrderType('buy')} className="flex-1 rounded-[9px] py-2.5 text-[13px] font-semibold transition-all" style={orderType === 'buy' ? { border: '1px solid rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.1)', color: '#4ade80' } : { border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)', color: '#64748b' }}>Buy {selectedToken.symbol}</button>
                <button onClick={() => setOrderType('sell')} className="flex-1 rounded-[9px] py-2.5 text-[13px] font-semibold transition-all" style={orderType === 'sell' ? { border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.08)', color: '#f87171' } : { border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)', color: '#64748b' }}>Sell {selectedToken.symbol}</button>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                <div className="space-y-4">
                  <div className="rounded-[12px] p-4" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Order Amount</span>
                      <span className="text-[11px] text-slate-500">Wallet: {orderType === 'sell' ? Number(tokenBalance).toFixed(4) : `${Number(pathBalance).toFixed(4)} ${quoteToken.symbol}`}</span>
                    </div>
                    <div className="flex items-end gap-2">
                      <input type="text" value={orderAmount} onChange={(e) => setOrderAmount(e.target.value)} placeholder="0.0" className="w-full bg-transparent text-3xl font-semibold tracking-tight text-slate-900 outline-none placeholder:text-slate-300 dark:text-white dark:placeholder:text-slate-700" />
                      <button type="button" onClick={() => { const max = orderType === 'buy' ? pathBalance : tokenBalance; if (max && Number(max) > 0) setOrderAmount(max); }} className="rounded-full border border-primary/20 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10">Max</button>
                      <button onClick={() => setIsTokenModalOpen(true)} className="flex items-center gap-1 rounded-[9px] px-3 py-2 text-[13px] font-medium text-slate-100" style={{ border: '1px solid rgba(255,255,255,0.1)', background: '#1e293b' }}>{selectedToken.symbol}<span className="material-symbols-outlined text-[14px] text-slate-500">expand_more</span></button>
                    </div>
                  </div>
                  <div className="rounded-[12px] p-4" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Price Tick</span>
                      <span className="text-[11px] text-slate-500">0 = 1:1 peg</span>
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
                              ? 'text-[#25c0f4]'
                              : 'text-slate-500'
                          }`}
                        >
                          {preset > 0 ? `+${preset}` : `${preset}`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-[12px] p-4" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">DEX Balance</span>
                      <span className="text-sm font-medium text-slate-100">{Number(dexSpendBalance).toFixed(4)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[quoteToken, selectedToken].filter((token, index, self) => self.findIndex((t) => t.address === token.address) === index).map((token, index) => (
                        <button key={`${token.address}-${index}`} type="button" onClick={() => setDepositTokenAddress(token.address)} className="rounded-[7px] px-2.5 py-1 text-[11px] font-medium transition-all" style={depositTokenAddress === token.address ? { border: '1px solid rgba(37,192,244,0.25)', background: 'rgba(37,192,244,0.1)', color: '#25c0f4' } : { border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)', color: '#94a3b8' }}>
                          {token.symbol}
                        </button>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-slate-500">Orders use DEX balance first; flip execution requires DEX balance.</p>
                  </div>
                  <label className="flex items-center gap-2.5 rounded-[12px] p-4 cursor-pointer" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <input type="checkbox" checked={isFlip} onChange={(e) => setIsFlip(e.target.checked)} className="h-4 w-4 rounded accent-[#25c0f4]" />
                    <div className="flex-1">
                      <span className="text-[13px] font-medium text-slate-300">Flip Order</span>
                      <p className="text-[11px] text-slate-500">Auto-reverse when filled to earn spread.</p>
                    </div>
                  </label>
                  <div className="rounded-[12px] p-4" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Execution Summary</p>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Funding asset</span>
                        <span className="font-medium text-slate-100">{orderType === 'buy' ? quoteToken.symbol : selectedToken.symbol}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Base asset</span>
                        <span className="font-medium text-slate-100">{selectedToken.symbol}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Flip enabled</span>
                        <span className="font-medium text-slate-100">{isFlip ? 'Yes' : 'No'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {!isConnected ? (
                <div className="mt-5 w-full">
                  <ConnectButton.Custom>
                    {({ openConnectModal }) => (
                      <button
                        type="button"
                        onClick={openConnectModal}
                        className="w-full rounded-[10px] bg-primary py-3 text-[13px] font-bold text-[#0f172a] transition-all hover:opacity-90"
                      >
                        Connect Wallet
                      </button>
                    )}
                  </ConnectButton.Custom>
                </div>
              ) : (
                <button onClick={handlePlaceOrder} disabled={isOrdering || !orderAmount} className={`mt-5 w-full rounded-[10px] py-3 text-[13px] font-bold text-white transition-all disabled:opacity-40 ${orderType === 'buy' ? 'bg-emerald-500 hover:bg-emerald-500/90' : 'bg-red-500 hover:bg-red-500/90'}`}>
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
