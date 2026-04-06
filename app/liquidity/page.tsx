'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useMemo } from 'react';
import { formatUnits, parseUnits, type PublicClient } from 'viem';
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi';
import toast from 'react-hot-toast';
import { Token, getHubToken, getTokens, isHubToken } from '@/config/tokens';
import { Hooks } from '@/lib/tempo';
import { addFeeLiquidity, getTokenBalance, quoteHubLiquidityPathAmount } from '@/lib/tempoClient';
import { TxToast } from '@/components/common/TxToast';
import { isTempoNativeChain } from '@/config/contracts';
import { usePoolStats } from '@/hooks/useApiQueries';

const LiquidityCard = dynamic(
  () => import('@/components/liquidity/LiquidityCard').then((m) => m.LiquidityCard),
  { ssr: false, loading: () => null }
);

const SURF = '#1e293b';
const BDR = '1px solid rgba(255,255,255,0.07)';

type PoolStat = {
  pair: string;
  token: string;
  tokenAddress: string;
  color: string;
  label: string;
  liquidity: string;
  liquidityRaw: string;
  vol24h: string;
  swapCount: number;
  hasLiquidity: boolean;
};

type PoolStatsResponse = {
  pools: PoolStat[];
  totalLiquidityUsdc: string;
  totalSwaps: number;
  totalVolumeUsdc: string;
  scannedBlocks: number;
  updatedAt: number;
};

function MyPositionRow({
  token,
  hubToken,
  poolStat,
  walletAddress,
  isActive,
  onManage,
}: {
  token: Token;
  hubToken: Token;
  poolStat?: PoolStat;
  walletAddress?: `0x${string}`;
  isActive: boolean;
  onManage: (tokenAddress: string) => void;
}) {
  const { data: liquidity } = (Hooks.amm.useLiquidityBalance
    ? Hooks.amm.useLiquidityBalance({
        address: walletAddress,
        userToken: token.address as `0x${string}`,
        validatorToken: hubToken.address as `0x${string}`,
      })
    : { data: null }) as { data: bigint | null };

  const { data: totalShares } = (Hooks.amm.useTotalShares
    ? Hooks.amm.useTotalShares({
        userToken: token.address as `0x${string}`,
        validatorToken: hubToken.address as `0x${string}`,
      })
    : { data: null }) as { data: bigint | null };
  const { data: pool } = (Hooks.amm.usePool
    ? Hooks.amm.usePool({
        userToken: token.address as `0x${string}`,
        validatorToken: hubToken.address as `0x${string}`,
      })
    : { data: null }) as {
    data:
      | {
          reserveUserToken: bigint;
          reserveValidatorToken: bigint;
        }
      | null;
  };

  const lpBalance = liquidity ? Number(formatUnits(liquidity, 18)) : 0;
  if (lpBalance <= 0) return null;

  const sharePercent =
    liquidity && totalShares && totalShares > 0n
      ? Number((liquidity * 10000n) / totalShares) / 100
      : 0;

  const reserveUserValue = pool?.reserveUserToken ? Number(formatUnits(pool.reserveUserToken, token.decimals)) : 0;
  const reserveHubValue = pool?.reserveValidatorToken ? Number(formatUnits(pool.reserveValidatorToken, hubToken.decimals)) : 0;
  const poolTvlUsd = reserveUserValue + reserveHubValue;
  const estimatedValue = poolTvlUsd > 0 ? (poolTvlUsd * sharePercent) / 100 : 0;

  return (
    <div
      className="rounded-[16px] px-5 py-4"
      style={{
        background: isActive ? '#263347' : SURF,
        border: isActive ? '1px solid rgba(37,192,244,0.22)' : BDR,
      }}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="relative flex h-8 w-12 flex-shrink-0">
              {[{ bg: poolStat?.color ?? '#25c0f4', lbl: poolStat?.label ?? token.symbol.slice(0, 2).toUpperCase() }, { bg: USDC_COLOR, lbl: USDC_LABEL }].map((ic, idx) => (
                <div
                  key={idx}
                  className="absolute flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-extrabold text-white"
                  style={{
                    background: ic.bg,
                    left: idx === 0 ? 0 : 18,
                    zIndex: idx === 0 ? 1 : 0,
                    border: `2px solid ${isActive ? '#263347' : SURF}`,
                  }}
                >
                  {ic.lbl}
                </div>
              ))}
            </div>
            <div>
              <p className="text-[16px] font-bold text-slate-100">
                {token.symbol} / {hubToken.symbol}
              </p>
              <p className="mt-0.5 text-[12px] text-slate-500">Stable liquidity position</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 text-left sm:grid-cols-3 sm:text-right">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">LP Balance</p>
            <p className="mt-1 text-[18px] font-extrabold tracking-tight text-slate-100">{lpBalance.toFixed(4)}</p>
          </div>
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">Pool Share</p>
            <p className="mt-1 text-[18px] font-extrabold tracking-tight text-[#25c0f4]">{sharePercent.toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">Est. Value</p>
            <p className="mt-1 text-[18px] font-extrabold tracking-tight text-slate-100">
              ${estimatedValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-slate-400" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            {poolStat?.vol24h ?? '$0'} 24h volume
          </span>
          <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-slate-400" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            {poolStat?.swapCount ?? 0} swaps
          </span>
        </div>
        <button
          type="button"
          onClick={() => onManage(token.address)}
          className="rounded-[10px] px-3.5 py-2 text-[12px] font-bold text-[#0f172a]"
          style={{ background: '#25c0f4' }}
        >
          {isActive ? 'Hide Manager' : 'Manage Position'}
        </button>
      </div>

      {isActive ? (
        <PositionManagerInline
          token={token}
          hubToken={hubToken}
          poolStat={poolStat}
          liquidity={liquidity ?? 0n}
          totalShares={totalShares ?? 0n}
          reserveUserToken={pool?.reserveUserToken ?? 0n}
          reserveHubToken={pool?.reserveValidatorToken ?? 0n}
          lpBalance={lpBalance}
          sharePercent={sharePercent}
          estimatedValue={estimatedValue}
        />
      ) : null}
    </div>
  );
}

function PositionManagerInline({
  token,
  hubToken,
  poolStat,
  liquidity,
  totalShares,
  reserveUserToken,
  reserveHubToken,
  lpBalance,
  sharePercent,
  estimatedValue,
}: {
  token: Token;
  hubToken: Token;
  poolStat?: PoolStat;
  liquidity: bigint;
  totalShares: bigint;
  reserveUserToken: bigint;
  reserveHubToken: bigint;
  lpBalance: number;
  sharePercent: number;
  estimatedValue: number;
}) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const isTempoChain = isTempoNativeChain(chainId);
  const burnLiquidity = Hooks.amm.useBurnSync
    ? Hooks.amm.useBurnSync()
    : { mutate: () => {}, isPending: false };

  const [addAmount, setAddAmount] = useState('');
  const [removeAmount, setRemoveAmount] = useState('');
  const [requiredHubAmount, setRequiredHubAmount] = useState('0');
  const [userTokenBalance, setUserTokenBalance] = useState('0');
  const [hubTokenBalance, setHubTokenBalance] = useState('0');
  const [isApproving, setIsApproving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const userReserveValue = Number(formatUnits(reserveUserToken, token.decimals));
  const hubReserveValue = Number(formatUnits(reserveHubToken, hubToken.decimals));
  const poolRatio = userReserveValue > 0 ? hubReserveValue / userReserveValue : null;

  useEffect(() => {
    const fetchBalances = async () => {
      if (!publicClient || !address) return;
      try {
        const [userBalance, hubBalance] = await Promise.all([
          getTokenBalance(publicClient as PublicClient, address, token.address, token.decimals),
          getTokenBalance(publicClient as PublicClient, address, hubToken.address, hubToken.decimals),
        ]);
        setUserTokenBalance(userBalance);
        setHubTokenBalance(hubBalance);
      } catch (error) {
        console.error('Failed to fetch inline position balances', error);
      }
    };

    fetchBalances();
  }, [address, hubToken.address, hubToken.decimals, publicClient, token.address, token.decimals, isAdding, burnLiquidity.isPending]);

  useEffect(() => {
    const fetchRequirement = async () => {
      if (
        !publicClient ||
        isTempoChain ||
        !addAmount ||
        Number(addAmount) <= 0 ||
        !token.address ||
        !hubToken.address
      ) {
        setRequiredHubAmount('0');
        return;
      }

      try {
        const nextRequiredAmount = await quoteHubLiquidityPathAmount(
          publicClient as PublicClient,
          token.address,
          hubToken.address,
          parseUnits(addAmount, token.decimals),
          chainId
        );
        setRequiredHubAmount(formatUnits(nextRequiredAmount, hubToken.decimals));
      } catch (error) {
        console.error('Failed to quote inline liquidity path', error);
        setRequiredHubAmount('0');
      }
    };

    fetchRequirement();
  }, [addAmount, chainId, hubToken.address, hubToken.decimals, isTempoChain, publicClient, token.address, token.decimals]);

  const estimatedLpTokens = (() => {
    if (!addAmount) return null;
    const inputValue = Number.parseFloat(addAmount);
    if (!Number.isFinite(inputValue) || inputValue <= 0) return null;

    const currentTotalShares = Number(formatUnits(totalShares, 18));
    if (!Number.isFinite(currentTotalShares) || currentTotalShares <= 0) return null;

    if (isTempoChain) {
      const reserveForMint = Number.parseFloat(hubTokenBalance || '0');
      if (!Number.isFinite(reserveForMint) || reserveForMint <= 0) return null;
      const minted = (inputValue / reserveForMint) * currentTotalShares;
      return Number.isFinite(minted) ? minted : null;
    }

    if (userReserveValue <= 0) return null;
    const minted = (inputValue / userReserveValue) * currentTotalShares;
    return Number.isFinite(minted) ? minted : null;
  })();

  const projectedShare = (() => {
    if (estimatedLpTokens === null) return null;
    const currentTotal = Number(formatUnits(totalShares, 18));
    if (!Number.isFinite(currentTotal) || currentTotal <= 0) return null;
    const newTotal = currentTotal + estimatedLpTokens;
    const newUserShares = lpBalance + estimatedLpTokens;
    if (!Number.isFinite(newTotal) || newTotal <= 0) return null;
    return (newUserShares / newTotal) * 100;
  })();

  const handleAddLiquidity = async () => {
    if (!address || !walletClient || !publicClient || !addAmount) return;
    setIsAdding(true);
    setIsApproving(false);

    try {
      const hash = await addFeeLiquidity(
        walletClient,
        publicClient as PublicClient,
        address,
        token.address,
        hubToken.address,
        parseUnits(addAmount, isTempoChain ? hubToken.decimals : token.decimals),
        (stage) => {
          setIsApproving(stage === 'approving');
        },
        chainId
      );

      toast.custom(() => <TxToast hash={hash} title="Liquidity added" />);
      await publicClient.waitForTransactionReceipt({ hash });
      setAddAmount('');
    } catch (error: unknown) {
      console.error(error);
      toast.error(error instanceof Error ? error.message.slice(0, 100) : 'Failed to add liquidity');
    } finally {
      setIsAdding(false);
      setIsApproving(false);
    }
  };

  const handleRemoveLiquidity = () => {
    if (!address || !removeAmount) return;

    burnLiquidity.mutate({
      userTokenAddress: token.address as `0x${string}`,
      validatorTokenAddress: hubToken.address as `0x${string}`,
      liquidityAmount: parseUnits(removeAmount, 18),
      to: address,
      feeToken: hubToken.address as `0x${string}`,
    });
  };

  const presetRemoval = (fraction: number) => {
    if (!liquidity) return;
    const nextAmount = Number(formatUnits(liquidity, 18)) * fraction;
    setRemoveAmount(nextAmount.toFixed(4));
  };

  return (
    <div
      className="mt-4 rounded-[14px] p-4"
      style={{ background: '#1b2638', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'LP', value: lpBalance.toFixed(4), tone: 'text-slate-100' },
            { label: 'Share', value: `${sharePercent.toFixed(2)}%`, tone: 'text-[#25c0f4]' },
            {
              label: 'Value',
              value: `$${estimatedValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              tone: 'text-slate-100',
            },
            {
              label: 'Ratio',
              value: poolRatio ? `1 ${token.symbol} ~ ${poolRatio.toFixed(2)} ${hubToken.symbol}` : '--',
              tone: 'text-slate-100',
            },
          ].map((item) => (
            <div
              key={item.label}
              className="min-w-[132px] rounded-[11px] px-3 py-2.5"
              style={{ background: '#243247', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                {item.label}
              </p>
              <p className={`mt-1.5 text-[15px] font-extrabold tracking-tight ${item.tone}`}>{item.value}</p>
            </div>
          ))}
        </div>

        <div
          className="rounded-[11px] px-4 py-3"
          style={{ background: '#111b2d', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Pool snapshot</p>
              <p className="mt-1 text-[12px] text-slate-400">
                {userReserveValue.toFixed(4)} {token.symbol} and {hubReserveValue.toFixed(4)} {hubToken.symbol} in reserve
              </p>
            </div>
            <span
              className="rounded-full px-2.5 py-1 text-[10px] font-semibold text-slate-400"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              {poolStat?.swapCount ?? 0} swaps
            </span>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div
            className="rounded-[12px] p-4"
            style={{ background: '#111b2d', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Add</p>
                <p className="mt-1 text-[14px] font-extrabold text-slate-100">Top up position</p>
              </div>
              <button
                type="button"
                onClick={() => setAddAmount(userTokenBalance)}
                className="rounded-full px-2.5 py-1 text-[11px] font-bold text-[#25c0f4]"
                style={{ background: 'rgba(37,192,244,0.08)', border: '1px solid rgba(37,192,244,0.2)' }}
              >
                Max
              </button>
            </div>

            <div className="mb-3 grid gap-2 sm:grid-cols-2">
              <div
                className="rounded-[10px] px-3 py-2"
                style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{token.symbol} wallet</p>
                <p className="mt-1 text-[13px] font-semibold text-slate-100">
                  {Number(userTokenBalance).toFixed(4)} {token.symbol}
                </p>
              </div>
              <div
                className="rounded-[10px] px-3 py-2"
                style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{hubToken.symbol} wallet</p>
                <p className="mt-1 text-[13px] font-semibold text-slate-100">
                  {Number(hubTokenBalance).toFixed(4)} {hubToken.symbol}
                </p>
              </div>
            </div>

            <div
              className="rounded-[10px] px-3 py-3"
              style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}
            >
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                  {token.symbol} amount
                </p>
                <input
                  type="number"
                  value={addAmount}
                  onChange={(event) => setAddAmount(event.target.value)}
                  placeholder="0.0"
                  className="w-full bg-transparent text-[24px] font-semibold tracking-tight text-slate-100 outline-none placeholder:text-slate-700"
                />
              </div>

            <div className="mt-3 space-y-1.5 text-[12px]">
              {!isTempoChain ? (
                <div className="flex items-center justify-between text-slate-400">
                  <span>{hubToken.symbol} required</span>
                  <span className="font-semibold text-slate-100">
                    {Number(requiredHubAmount || '0').toFixed(4)} {hubToken.symbol}
                  </span>
                </div>
              ) : null}
              <div className="flex items-center justify-between text-slate-400">
                <span>Est. LP</span>
                <span className="font-semibold text-slate-100">
                  {estimatedLpTokens === null ? '--' : estimatedLpTokens.toFixed(4)}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>New share</span>
                <span className="font-semibold text-[#25c0f4]">
                  {projectedShare === null ? '--' : `${projectedShare.toFixed(2)}%`}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleAddLiquidity}
              disabled={isAdding || !addAmount}
              className="mt-4 w-full rounded-[10px] px-4 py-2.5 text-[13px] font-bold text-[#09111d] transition-all disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: '#25c0f4' }}
            >
              {isApproving ? 'Approving...' : isAdding ? 'Adding...' : `Add ${token.symbol}`}
            </button>
          </div>

          <div
            className="rounded-[12px] p-4"
            style={{ background: '#111b2d', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Remove</p>
                <p className="mt-1 text-[14px] font-extrabold text-slate-100">Trim position</p>
              </div>
              <div className="flex gap-2">
                {[0.25, 0.5, 1].map((fraction) => (
                  <button
                    key={fraction}
                    type="button"
                    onClick={() => presetRemoval(fraction)}
                    className="rounded-full px-2.5 py-1 text-[11px] font-bold text-slate-300"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    {fraction === 1 ? 'Max' : `${fraction * 100}%`}
                  </button>
                ))}
              </div>
            </div>

            <div
              className="rounded-[10px] px-3 py-3"
              style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}
            >
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">LP amount</p>
                <input
                  type="number"
                  value={removeAmount}
                  onChange={(event) => setRemoveAmount(event.target.value)}
                  placeholder="0.0"
                  className="w-full bg-transparent text-[24px] font-semibold tracking-tight text-slate-100 outline-none placeholder:text-slate-700"
                />
              </div>

            <div className="mt-3 rounded-[10px] px-3 py-3 text-[12px]" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center justify-between text-slate-400">
                <span>Current LP</span>
                <span className="font-semibold text-slate-100">{lpBalance.toFixed(4)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-slate-400">
                <span>Current share</span>
                <span className="font-semibold text-slate-100">{sharePercent.toFixed(2)}%</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRemoveLiquidity}
              disabled={burnLiquidity.isPending || !removeAmount}
              className="mt-4 w-full rounded-[10px] px-4 py-2.5 text-[13px] font-bold text-red-300 transition-all disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)' }}
            >
              {burnLiquidity.isPending ? 'Removing...' : 'Remove Position'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Removed — now using shared usePoolStats from React Query hooks

const USDC_COLOR = '#3b82f6';
const USDC_LABEL = 'US';

export default function LiquidityPage() {
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'pools' | 'positions'>('pools');
  const [selectedPoolToken, setSelectedPoolToken] = useState<string | undefined>(undefined);
  const { data, isLoading: loading } = usePoolStats();
  const { address } = useAccount();
  const chainId = useChainId();
  const tokens = useMemo(() => getTokens(chainId), [chainId]);
  const hubToken = useMemo(() => getHubToken(chainId) || tokens[0], [chainId, tokens]);

  const handlePoolClick = (tokenAddress: string) => {
    setSelectedPoolToken(tokenAddress);
    setShowForm(true);
    setActiveTab('pools');
  };

  const pools = data?.pools ?? [];
  const activePools = pools.filter((pool) => pool.hasLiquidity);
  const availablePositionTokens = tokens.filter((token) => !isHubToken(token, chainId));

  return (
    <div className="w-full px-4 py-5 md:px-7 md:py-7" style={{ maxWidth: 1140 }}>
      <div className="mb-5 grid grid-cols-3 gap-3">
        {[
          { label: 'Total Value Locked', value: loading ? '--' : (data?.totalLiquidityUsdc ?? '$0'), sub: 'Stable liquidity' },
          { label: '24h Volume', value: loading ? '--' : (data?.totalVolumeUsdc ?? '$0'), sub: `${data?.totalSwaps ?? 0} swaps` },
          { label: 'Active Pools', value: loading ? '--' : String(activePools.length), sub: `${activePools.length} live now` },
        ].map(({ label, value, sub }) => (
          <div key={label} className="rounded-[16px] px-3 py-4 md:px-5 md:py-5" style={{ background: SURF, border: BDR }}>
            <p className="mb-1 text-[10px] font-medium text-slate-500 md:mb-1.5 md:text-[11px]">{label}</p>
            <p className="text-[15px] font-extrabold leading-none tracking-tight text-slate-100 md:text-[20px]">{value}</p>
            <p className="mt-1 text-[10px] font-semibold text-emerald-400 md:text-[11px]">{sub}</p>
          </div>
        ))}
      </div>

      <div className="mb-[18px] flex w-fit gap-1 rounded-[10px] p-1" style={{ background: '#263347' }}>
        {(['pools', 'positions'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-all ${
              activeTab === tab ? 'text-slate-100 shadow' : 'text-slate-500'
            }`}
            style={activeTab === tab ? { background: SURF } : {}}
          >
            {tab === 'pools' ? 'All Pools' : 'My Positions'}
          </button>
        ))}
      </div>

      {activeTab === 'pools' && !showForm && (
        <div className="overflow-hidden rounded-[16px]" style={{ background: SURF, border: BDR }}>
          <div className="flex items-center justify-between px-5 py-[14px]" style={{ borderBottom: BDR }}>
            <p className="text-[14px] font-bold text-slate-100">Liquidity Pools</p>
            <button
              onClick={() => setShowForm(true)}
              className="rounded-lg px-3.5 py-1.5 text-[12px] font-bold text-[#0f172a]"
              style={{ background: '#25c0f4' }}
            >
              + Add Liquidity
            </button>
          </div>

          {loading && pools.length === 0 ? (
            <div className="px-5 py-8 text-center text-[13px] text-slate-500">Loading pools...</div>
          ) : pools.length === 0 ? (
            <div className="px-5 py-8 text-center text-[13px] text-slate-500">No pool data available</div>
          ) : (
            <div>
              {pools.map(({ pair, color, label, liquidity, vol24h, swapCount, hasLiquidity, tokenAddress }) => (
                <div
                  key={pair}
                  onClick={() => handlePoolClick(tokenAddress)}
                  className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.025] md:grid md:gap-3.5 md:px-5"
                  style={{
                    gridTemplateColumns: 'auto 1fr 140px 140px 96px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="relative flex h-6 w-10 flex-shrink-0">
                      {[{ bg: color, lbl: label }, { bg: USDC_COLOR, lbl: USDC_LABEL }].map((ic, idx) => (
                        <div
                          key={idx}
                          className="absolute flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-extrabold text-white"
                          style={{
                            background: ic.bg,
                            left: idx === 0 ? 0 : 14,
                            zIndex: idx === 0 ? 1 : 0,
                            border: `2px solid ${SURF}`,
                          }}
                        >
                          {ic.lbl}
                        </div>
                      ))}
                    </div>
                    <div className="min-w-0 md:hidden">
                      <p className="text-[13px] font-bold text-slate-100">{pair}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">{hasLiquidity ? liquidity : 'No liquidity'}</p>
                    </div>
                  </div>

                  <div className="hidden md:block">
                    <p className="text-[13px] font-bold text-slate-100">{pair}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {hasLiquidity ? 'Stable hub / 0.3%' : 'No liquidity seeded'}
                    </p>
                  </div>

                  <div className="hidden md:block">
                    <p className="text-[13px] font-semibold text-slate-100">{liquidity}</p>
                    <p className="text-[11px] text-slate-500">Liquidity</p>
                  </div>

                  <div className="hidden md:block">
                    <p className="text-[13px] font-semibold text-slate-100">{vol24h}</p>
                    <p className="text-[11px] text-slate-500">24h Vol</p>
                  </div>

                  <div className="text-right">
                    <span
                      className="inline-block rounded-full px-2 py-0.5 text-[11px] font-bold"
                      style={{
                        color: hasLiquidity ? '#34d399' : '#64748b',
                        background: hasLiquidity ? 'rgba(34,197,94,0.12)' : 'rgba(100,116,139,0.12)',
                      }}
                    >
                      {hasLiquidity ? `${swapCount} swaps` : 'No activity'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div>
          <button
            onClick={() => { setShowForm(false); setSelectedPoolToken(undefined); }}
            className="mb-4 flex items-center gap-1.5 text-[13px] font-medium text-slate-400 transition-colors hover:text-slate-200"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Back to pools
          </button>
          <LiquidityCard initialTokenAddress={showForm ? selectedPoolToken : undefined} />
        </div>
      )}

      {activeTab === 'positions' && !showForm && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Available Pairs', value: String(availablePositionTokens.length), sub: 'Manageable liquidity pairs' },
              { label: 'Hub Asset', value: hubToken.symbol, sub: 'Stable route base' },
              { label: 'Focus', value: 'Manage LP', sub: 'Add or remove from one place' },
            ].map(({ label, value, sub }) => (
              <div key={label} className="rounded-[16px] px-3 py-4 md:px-5 md:py-5" style={{ background: SURF, border: BDR }}>
                <p className="mb-1.5 text-[11px] font-medium text-slate-500">{label}</p>
                <p className="text-[20px] font-extrabold leading-none tracking-tight text-slate-100">{value}</p>
                <p className="mt-1 text-[11px] font-semibold text-slate-400">{sub}</p>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-[16px]" style={{ background: SURF, border: BDR }}>
            <div className="flex items-center justify-between px-5 py-[14px]" style={{ borderBottom: BDR }}>
              <div>
                <p className="text-[14px] font-bold text-slate-100">My Positions</p>
                <p className="mt-1 text-[12px] text-slate-500">Review each live LP position and expand a simple manager when you want to add or remove liquidity.</p>
              </div>
            </div>

            <div className="space-y-3 px-5 py-5">
              {availablePositionTokens.map((token) => (
                <MyPositionRow
                  key={token.address}
                  token={token}
                  hubToken={hubToken}
                  poolStat={pools.find((pool) => pool.tokenAddress.toLowerCase() === token.address.toLowerCase())}
                  walletAddress={address}
                  isActive={selectedPoolToken?.toLowerCase() === token.address.toLowerCase()}
                  onManage={(tokenAddress) =>
                    setSelectedPoolToken((current) =>
                      current?.toLowerCase() === tokenAddress.toLowerCase() ? undefined : tokenAddress
                    )
                  }
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
