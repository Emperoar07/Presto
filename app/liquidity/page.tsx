'use client';

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
import {
  createLocalActivityItem,
  patchLocalActivityItem,
  upsertLocalActivityHistoryItem,
} from '@/lib/activityHistory';

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

function formatEditableAmount(value: number, decimals: number) {
  if (!Number.isFinite(value) || value <= 0) return '0';
  return value
    .toFixed(Math.min(decimals, 6))
    .replace(/\.?0+$/, '');
}

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
        <CompactPositionManagerInline
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

function PoolListRow({
  token,
  hubToken,
  poolStat,
  walletAddress,
  isActive,
  onManage,
}: {
  token: Token;
  hubToken: Token;
  poolStat: PoolStat;
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
  const sharePercent =
    liquidity && totalShares && totalShares > 0n
      ? Number((liquidity * 10000n) / totalShares) / 100
      : 0;
  const reserveUserValue = pool?.reserveUserToken ? Number(formatUnits(pool.reserveUserToken, token.decimals)) : 0;
  const reserveHubValue = pool?.reserveValidatorToken ? Number(formatUnits(pool.reserveValidatorToken, hubToken.decimals)) : 0;
  const estimatedValue = reserveUserValue + reserveHubValue > 0 ? ((reserveUserValue + reserveHubValue) * sharePercent) / 100 : 0;

  return (
    <div
      className="border-b border-white/[0.04] last:border-b-0"
      style={{ background: isActive ? 'rgba(37,192,244,0.04)' : 'transparent' }}
    >
      <button
        type="button"
        onClick={() => onManage(token.address)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.02] md:grid md:gap-3.5 md:px-5"
        style={{ gridTemplateColumns: 'auto 1fr 140px 140px 124px' }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative flex h-6 w-10 flex-shrink-0">
            {[{ bg: poolStat.color, lbl: poolStat.label }, { bg: USDC_COLOR, lbl: USDC_LABEL }].map((ic, idx) => (
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
            <p className="text-[13px] font-bold text-slate-100">{poolStat.pair}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">{poolStat.hasLiquidity ? poolStat.liquidity : 'No liquidity'}</p>
          </div>
        </div>

        <div className="hidden md:block">
          <p className="text-[13px] font-bold text-slate-100">{poolStat.pair}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {poolStat.hasLiquidity ? 'Stable hub / 0.3%' : 'No liquidity seeded'}
          </p>
        </div>

        <div className="hidden md:block">
          <p className="text-[13px] font-semibold text-slate-100">{poolStat.liquidity}</p>
          <p className="text-[11px] text-slate-500">Liquidity</p>
        </div>

        <div className="hidden md:block">
          <p className="text-[13px] font-semibold text-slate-100">{poolStat.vol24h}</p>
          <p className="text-[11px] text-slate-500">24h Vol</p>
        </div>

        <div className="flex items-center justify-end gap-3">
          <div className="text-right">
            <span
              className="inline-block rounded-full px-2 py-0.5 text-[11px] font-bold"
              style={{
                color: poolStat.hasLiquidity ? '#34d399' : '#64748b',
                background: poolStat.hasLiquidity ? 'rgba(34,197,94,0.12)' : 'rgba(100,116,139,0.12)',
              }}
            >
              {poolStat.hasLiquidity ? `${poolStat.swapCount} swaps` : 'No activity'}
            </span>
            <p className="mt-0.5 hidden text-[11px] text-slate-500 md:block">{poolStat.vol24h}</p>
          </div>
          <span className="hidden rounded-[10px] bg-[#25c0f4] px-3 py-2 text-[12px] font-bold text-[#0f172a] md:inline-block">
            {isActive ? 'Hide Manager' : lpBalance > 0 ? 'Manage' : 'Add Liquidity'}
          </span>
        </div>
      </button>

      {isActive ? (
        <div className="px-4 pb-4 md:px-5">
          <CompactPositionManagerInline
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
        </div>
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
  const [actionMode, setActionMode] = useState<'add' | 'remove'>('add');
  const [requiredHubAmount, setRequiredHubAmount] = useState('0');
  const [userTokenBalance, setUserTokenBalance] = useState('0');
  const [hubTokenBalance, setHubTokenBalance] = useState('0');
  const [isApproving, setIsApproving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const userReserveValue = Number(formatUnits(reserveUserToken, token.decimals));
  const hubReserveValue = Number(formatUnits(reserveHubToken, hubToken.decimals));
  const poolRatio = userReserveValue > 0 ? hubReserveValue / userReserveValue : null;
  const numericUserBalance = Number.parseFloat(userTokenBalance || '0');
  const numericHubBalance = Number.parseFloat(hubTokenBalance || '0');
  const maxAddAmount = (() => {
    if (isTempoChain) return validatorTokenBalance;
    if (!Number.isFinite(numericUserBalance) || numericUserBalance <= 0) return '0';
    if (!Number.isFinite(numericHubBalance) || numericHubBalance <= 0) return '0';
    if (!Number.isFinite(userReserveValue) || !Number.isFinite(hubReserveValue) || userReserveValue <= 0 || hubReserveValue <= 0) {
      return formatEditableAmount(numericUserBalance, token.decimals);
    }
    const affordableByHub = numericHubBalance * (userReserveValue / hubReserveValue);
    return formatEditableAmount(Math.min(numericUserBalance, affordableByHub), token.decimals);
  })();

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

  const estimatedRemoval = (() => {
    const inputValue = Number.parseFloat(removeAmount);
    const currentTotal = Number(formatUnits(totalShares, 18));
    if (!Number.isFinite(inputValue) || inputValue <= 0 || !Number.isFinite(currentTotal) || currentTotal <= 0) {
      return null;
    }

    const removalFraction = inputValue / currentTotal;
    if (!Number.isFinite(removalFraction) || removalFraction <= 0) return null;

    return {
      userToken: userReserveValue * removalFraction,
      hubToken: hubReserveValue * removalFraction,
      nextShare: Math.max(sharePercent - removalFraction * 100, 0),
    };
  })();

  const handleAddLiquidity = async () => {
    if (!address || !walletClient || !publicClient || !addAmount) return;
    setIsAdding(true);
    setIsApproving(false);
    let activityId: string | null = null;
    let hash: `0x${string}` | undefined;

    try {
      hash = await addFeeLiquidity(
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

      const pendingActivity = createLocalActivityItem({
        category: 'liquidity',
        title: `Add Liquidity ${token.symbol}/${hubToken.symbol}`,
        subtitle: `${addAmount} ${isTempoChain ? hubToken.symbol : token.symbol}`,
        status: 'pending',
        hash,
      });
      activityId = pendingActivity.id;
      upsertLocalActivityHistoryItem(pendingActivity);

      toast.custom(() => <TxToast hash={hash} title="Liquidity added" />);
      await publicClient.waitForTransactionReceipt({ hash });
      if (activityId) {
        patchLocalActivityItem(activityId, {
          status: 'success',
          hash,
        });
      }
      setAddAmount('');
    } catch (error: unknown) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to add liquidity';
      if (activityId) {
        patchLocalActivityItem(activityId, {
          status: 'error',
          hash: hash ?? null,
          errorMessage,
        });
      } else {
        upsertLocalActivityHistoryItem(
          createLocalActivityItem({
            category: 'liquidity',
            title: `Add Liquidity ${token.symbol}/${hubToken.symbol}`,
            subtitle: `${addAmount || '0'} ${isTempoChain ? hubToken.symbol : token.symbol}`,
            status: 'error',
            hash: hash ?? null,
            errorMessage,
          }),
        );
      }
      toast.error(error instanceof Error ? error.message.slice(0, 100) : 'Failed to add liquidity');
    } finally {
      setIsAdding(false);
      setIsApproving(false);
    }
  };

  const handleRemoveLiquidity = async () => {
    if (!address || !removeAmount) return;
    let activityId: string | null = null;
    let hash: `0x${string}` | undefined;
    const payload = {
      userTokenAddress: token.address as `0x${string}`,
      validatorTokenAddress: hubToken.address as `0x${string}`,
      liquidityAmount: parseUnits(removeAmount, 18),
      to: address,
      feeToken: hubToken.address as `0x${string}`,
    };

    try {
      if (typeof burnLiquidity.mutateAsync === 'function') {
        hash = await burnLiquidity.mutateAsync(payload);
      } else {
        burnLiquidity.mutate(payload);
      }

      const pendingActivity = createLocalActivityItem({
        category: 'liquidity',
        title: `Remove Liquidity ${token.symbol}/${hubToken.symbol}`,
        subtitle: `${removeAmount} LP`,
        status: 'pending',
        hash: hash ?? null,
      });
      activityId = pendingActivity.id;
      upsertLocalActivityHistoryItem(pendingActivity);

      if (hash) {
        toast.custom(() => <TxToast hash={hash} title="Liquidity removal submitted" />);
        await publicClient?.waitForTransactionReceipt({ hash });
        patchLocalActivityItem(activityId, {
          status: 'success',
          hash,
        });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to remove liquidity';
      if (activityId) {
        patchLocalActivityItem(activityId, {
          status: 'error',
          hash: hash ?? null,
          errorMessage,
        });
      } else {
        upsertLocalActivityHistoryItem(
          createLocalActivityItem({
            category: 'liquidity',
            title: `Remove Liquidity ${token.symbol}/${hubToken.symbol}`,
            subtitle: `${removeAmount || '0'} LP`,
            status: 'error',
            hash: hash ?? null,
            errorMessage,
          }),
        );
      }
      toast.error(errorMessage);
    }
  };

  const presetRemoval = (fraction: number) => {
    if (!liquidity) return;
    const nextAmount = Number(formatUnits(liquidity, 18)) * fraction;
    setRemoveAmount(nextAmount.toFixed(4));
    setActionMode('remove');
  };

  const BG = '#172234';
  const BDR_INNER = '1px solid rgba(255,255,255,0.06)';
  const FIELD = { background: '#0f172a', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 12px' };

  return (
    <div className="mt-3 overflow-hidden rounded-[12px]" style={{ background: BG, border: BDR_INNER }}>

      {/* ── Stat strip ── */}
      <div className="flex border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        {[
          { label: 'LP', value: lpBalance.toFixed(4), color: '#f1f5f9' },
          { label: 'Share', value: `${sharePercent.toFixed(2)}%`, color: '#25c0f4' },
          { label: 'Value', value: `$${estimatedValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: '#f1f5f9' },
          { label: 'Ratio', value: poolRatio ? `1 ${token.symbol} ~ ${poolRatio.toFixed(2)} ${hubToken.symbol}` : '--', color: '#f1f5f9' },
        ].map((item, i, arr) => (
          <div key={item.label} className="flex-1 px-4 py-2.5" style={{ borderRight: i < arr.length - 1 ? 'rgba(255,255,255,0.05) 1px solid' : 'none' }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{item.label}</p>
            <p className="mt-1 text-[13px] font-extrabold" style={{ color: item.color }}>{item.value}</p>
          </div>
        ))}
        {/* snapshot + swap count */}
        <div className="flex flex-1 items-center justify-between gap-3 px-4 py-2.5" style={{ borderLeft: '1px solid rgba(255,255,255,0.05)' }}>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Pool snapshot</p>
            <p className="mt-1 text-[11px] text-slate-400">{userReserveValue.toFixed(4)} {token.symbol} · {hubReserveValue.toFixed(4)} {hubToken.symbol}</p>
          </div>
          <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold text-slate-400" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {poolStat?.swapCount ?? 0} swaps
          </span>
        </div>
      </div>

      {/* ── Action header (tab toggle) ── */}
      <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: BDR_INNER }}>
        <p className="text-[12px] font-bold text-slate-300">
          {actionMode === 'add' ? 'Top up position' : 'Trim position'}
        </p>
        <div className="flex gap-1 rounded-[8px] p-0.5" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.07)' }}>
          {(['add', 'remove'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setActionMode(mode)}
              className="rounded-[6px] px-3 py-1 text-[11px] font-bold transition-all"
              style={actionMode === mode
                ? { background: mode === 'add' ? '#25c0f4' : 'rgba(239,68,68,0.18)', color: mode === 'add' ? '#09111d' : '#fca5a5' }
                : { color: '#64748b' }}
            >
              {mode === 'add' ? 'Add' : 'Remove'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Add form ── */}
      {actionMode === 'add' ? (
        <div className="flex flex-wrap items-end gap-3 px-4 py-3">
          {/* wallet balances */}
          <div style={{ ...FIELD, minWidth: 130 }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">{token.symbol} wallet</p>
            <p className="mt-1 text-[13px] font-semibold text-slate-100">{Number(userTokenBalance).toFixed(4)} {token.symbol}</p>
          </div>
          <div style={{ ...FIELD, minWidth: 130 }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">{hubToken.symbol} wallet</p>
            <p className="mt-1 text-[13px] font-semibold text-slate-100">{Number(hubTokenBalance).toFixed(4)} {hubToken.symbol}</p>
          </div>

          {/* amount input */}
          <div className="flex min-w-[140px] flex-1 items-center gap-2 rounded-[8px] px-3 py-2" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <input
              type="number"
              value={addAmount}
              onChange={(e) => setAddAmount(e.target.value)}
              placeholder="0.0"
              className="w-full bg-transparent text-[18px] font-semibold text-slate-100 outline-none placeholder:text-slate-700"
            />
            <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold text-slate-200" style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)' }}>{token.symbol}</span>
          </div>

          {/* outputs */}
          {!isTempoChain && (
            <div style={{ ...FIELD, minWidth: 110 }}>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">{hubToken.symbol} required</p>
              <p className="mt-1 text-[13px] font-semibold text-slate-100">{Number(requiredHubAmount || '0').toFixed(4)}</p>
            </div>
          )}
          <div style={{ ...FIELD, minWidth: 90 }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Est. LP</p>
            <p className="mt-1 text-[13px] font-semibold text-slate-100">{estimatedLpTokens === null ? '--' : estimatedLpTokens.toFixed(4)}</p>
          </div>
          <div style={{ ...FIELD, minWidth: 90 }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">New share</p>
            <p className="mt-1 text-[13px] font-semibold text-[#25c0f4]">{projectedShare === null ? '--' : `${projectedShare.toFixed(2)}%`}</p>
          </div>

          {/* max + action */}
          <button type="button" onClick={() => setAddAmount(userTokenBalance)}
            className="shrink-0 rounded-[8px] px-3 py-2 text-[11px] font-bold text-[#25c0f4]"
            style={{ background: 'rgba(37,192,244,0.08)', border: '1px solid rgba(37,192,244,0.2)' }}>
            Max
          </button>
          <button type="button" onClick={handleAddLiquidity} disabled={isAdding || !addAmount}
            className="shrink-0 rounded-[8px] px-4 py-2 text-[13px] font-bold text-[#09111d] transition-all disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: '#25c0f4' }}>
            {isApproving ? 'Approving...' : isAdding ? 'Adding...' : `Add ${token.symbol}`}
          </button>
        </div>
      ) : (
        /* ── Remove form ── */
        <div className="flex flex-wrap items-end gap-3 px-4 py-3">
          {/* presets */}
          <div className="flex gap-1.5">
            {[0.25, 0.5, 1].map((f) => (
              <button key={f} type="button" onClick={() => presetRemoval(f)}
                className="rounded-[8px] px-3 py-2 text-[11px] font-bold text-slate-300"
                style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.07)' }}>
                {f === 1 ? 'Max' : `${f * 100}%`}
              </button>
            ))}
          </div>

          {/* lp amount input */}
          <div className="flex min-w-[140px] flex-1 items-center gap-2 rounded-[8px] px-3 py-2" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.07)' }}>
            <input
              type="number"
              value={removeAmount}
              onChange={(e) => setRemoveAmount(e.target.value)}
              placeholder="0.0"
              className="w-full bg-transparent text-[18px] font-semibold text-slate-100 outline-none placeholder:text-slate-700"
            />
            <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold text-slate-200" style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)' }}>LP</span>
          </div>

          {/* current position readouts */}
          <div style={{ ...FIELD, minWidth: 110 }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Current LP</p>
            <p className="mt-1 text-[13px] font-semibold text-slate-100">{lpBalance.toFixed(4)}</p>
          </div>
          <div style={{ ...FIELD, minWidth: 110 }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Current share</p>
            <p className="mt-1 text-[13px] font-semibold text-slate-100">{sharePercent.toFixed(2)}%</p>
          </div>

          {/* action */}
          <button type="button" onClick={handleRemoveLiquidity} disabled={burnLiquidity.isPending || !removeAmount}
            className="shrink-0 rounded-[8px] px-4 py-2 text-[13px] font-bold text-red-300 transition-all disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)' }}>
            {burnLiquidity.isPending ? 'Removing...' : 'Remove Position'}
          </button>
        </div>
      )}
    </div>
  );
}

// Removed — now using shared usePoolStats from React Query hooks

function CompactPositionManagerInline({
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
  const [actionMode, setActionMode] = useState<'add' | 'remove'>('add');
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
      if (!publicClient || isTempoChain || !addAmount || Number(addAmount) <= 0) {
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

  const estimatedRemoval = (() => {
    const inputValue = Number.parseFloat(removeAmount);
    const currentTotal = Number(formatUnits(totalShares, 18));
    if (!Number.isFinite(inputValue) || inputValue <= 0 || !Number.isFinite(currentTotal) || currentTotal <= 0) {
      return null;
    }

    const removalFraction = inputValue / currentTotal;
    if (!Number.isFinite(removalFraction) || removalFraction <= 0) return null;

    return {
      userToken: userReserveValue * removalFraction,
      hubToken: hubReserveValue * removalFraction,
      nextShare: Math.max(sharePercent - removalFraction * 100, 0),
    };
  })();

  const handleAddLiquidity = async () => {
    if (!address || !walletClient || !publicClient || !addAmount) return;
    setIsAdding(true);
    setIsApproving(false);

    try {
      const numericAddAmount = Number.parseFloat(addAmount);
      const availableInputBalance = isTempoChain ? numericHubBalance : numericUserBalance;
      if (!Number.isFinite(numericAddAmount) || numericAddAmount <= 0) {
        toast.error('Enter a valid amount');
        return;
      }
      if (!Number.isFinite(availableInputBalance) || numericAddAmount > availableInputBalance + 1e-8) {
        toast.error(`Insufficient ${isTempoChain ? hubToken.symbol : token.symbol} balance`);
        return;
      }
      if (!isTempoChain) {
        const quotedHubAmount = Number.parseFloat(requiredHubAmount || '0');
        const fallbackHubAmount =
          Number.isFinite(poolRatio) && poolRatio && poolRatio > 0 ? numericAddAmount * poolRatio : 0;
        const effectiveHubNeeded = quotedHubAmount > 0 ? quotedHubAmount : fallbackHubAmount;
        if (!Number.isFinite(numericHubBalance) || effectiveHubNeeded > numericHubBalance + 1e-8) {
          toast.error(`Need ${effectiveHubNeeded.toFixed(4)} ${hubToken.symbol} but only ${numericHubBalance.toFixed(4)} is available`);
          return;
        }
      }

      const hash = await addFeeLiquidity(
        walletClient,
        publicClient as PublicClient,
        address,
        token.address,
        hubToken.address,
        parseUnits(addAmount, isTempoChain ? hubToken.decimals : token.decimals),
        (stage) => setIsApproving(stage === 'approving'),
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
    setActionMode('remove');
  };

  const reserveSummary = `${userReserveValue.toFixed(2)} ${token.symbol} · ${hubReserveValue.toFixed(2)} ${hubToken.symbol}`;
  const receiveSummary = estimatedRemoval
    ? `${estimatedRemoval.userToken.toFixed(2)} ${token.symbol} · ${estimatedRemoval.hubToken.toFixed(2)} ${hubToken.symbol}`
    : '--';
  const statItems = [
    {
      label: 'Value',
      value: `$${estimatedValue.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
    },
    { label: 'Liquidity', value: poolStat?.liquidity ?? '$0' },
    { label: '24h Vol', value: poolStat?.vol24h ?? '$0' },
    { label: 'Reserves', value: reserveSummary },
    {
      label: 'Rate',
      value: poolRatio ? `1 ${token.symbol} ≈ ${poolRatio.toFixed(2)} ${hubToken.symbol}` : '--',
    },
  ];

  return (
    <div className="mt-2 overflow-hidden rounded-[12px] border border-white/[0.08] bg-[#182336]">
      <div className="flex flex-col gap-2 px-3 py-2.5">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative flex h-6 w-9 flex-shrink-0">
              {[{ bg: poolStat?.color ?? '#6366f1', lbl: poolStat?.label ?? token.symbol.slice(0, 2) }, { bg: USDC_COLOR, lbl: USDC_LABEL }].map((ic, idx) => (
                <div
                  key={idx}
                  className="absolute flex h-6 w-6 items-center justify-center rounded-full text-[8px] font-extrabold text-white"
                  style={{
                    background: ic.bg,
                    left: idx === 0 ? 0 : 14,
                    zIndex: idx === 0 ? 1 : 0,
                    border: '2px solid #182336',
                  }}
                >
                  {ic.lbl}
                </div>
              ))}
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-extrabold text-slate-50">{token.symbol} / {hubToken.symbol}</p>
              <p className="text-[10px] text-slate-500">Stable hub · 0.3%</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex rounded-full bg-[#153b37] px-2 py-0.5 text-[10px] font-bold text-emerald-400">
              LP {lpBalance.toFixed(4)}
            </span>
            <span className="inline-flex rounded-full bg-[#16384b] px-2 py-0.5 text-[10px] font-bold text-[#25c0f4]">
              {sharePercent.toFixed(2)}%
            </span>
            <div className="flex rounded-[8px] border border-white/[0.08] bg-[#1e293b] p-0.5">
              {(['add', 'remove'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setActionMode(mode)}
                  className="rounded-[6px] px-2.5 py-1 text-[11px] font-bold transition-all"
                  style={actionMode === mode
                    ? {
                        background: mode === 'add' ? '#25c0f4' : '#f87171',
                        color: mode === 'add' ? '#09111d' : '#130d12',
                      }
                    : {
                        color: '#94a3b8',
                      }}
                >
                  {mode === 'add' ? 'Add' : 'Remove'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-[8px] border border-white/[0.06] bg-[#172134]">
          <div className="grid divide-y divide-white/[0.06] md:grid-cols-5 md:divide-x md:divide-y-0">
            {statItems.map((item) => (
              <div key={item.label} className="px-3 py-1.5">
                <p className="text-[9px] text-slate-500">{item.label}</p>
                <p className="mt-0.5 text-[12px] font-bold text-slate-50">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {actionMode === 'add' ? (
          <div className="overflow-hidden rounded-[8px] border border-white/[0.06] bg-[#172134]">
            <div className="grid gap-2 border-b border-white/[0.06] px-3 py-2 md:grid-cols-2">
              <div className="rounded-[8px] border border-white/[0.06] bg-[#11192a] px-3 py-1.5">
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">{token.symbol} wallet</p>
                <p className="mt-0.5 text-[13px] font-extrabold text-slate-50">{Number(userTokenBalance).toFixed(4)}</p>
              </div>
              <div className="rounded-[8px] border border-white/[0.06] bg-[#11192a] px-3 py-1.5">
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">{hubToken.symbol} wallet</p>
                <p className="mt-0.5 text-[13px] font-extrabold text-slate-50">{Number(hubTokenBalance).toFixed(4)}</p>
              </div>
            </div>

            <div className="grid gap-2 px-3 py-2 xl:grid-cols-[minmax(0,1fr)_140px_90px_130px] xl:items-end">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-[10px] text-slate-500">{token.symbol} amount</label>
                  <button
                    type="button"
                    onClick={() => setAddAmount(maxAddAmount)}
                    className="rounded-full border border-[#25c0f4]/25 bg-[#0d2237] px-2 py-0.5 text-[10px] font-bold text-[#25c0f4]"
                  >
                    Max
                  </button>
                </div>
                <div className="flex items-center gap-2 rounded-[8px] border border-white/[0.08] bg-[#101827] px-3 py-2">
                  <input
                    type="number"
                    value={addAmount}
                    onChange={(e) => setAddAmount(e.target.value)}
                    placeholder="0.0"
                    className="w-full bg-transparent text-[14px] font-extrabold text-slate-100 outline-none placeholder:text-slate-700"
                  />
                  <span className="shrink-0 rounded-full border border-white/10 bg-[#1e293b] px-2.5 py-1 text-[10px] font-bold text-slate-100">
                    {token.symbol}
                  </span>
                </div>
              </div>

              <div>
                <p className="mb-1 text-[10px] text-slate-500">{hubToken.symbol} required</p>
                <div className="rounded-[8px] border border-white/[0.08] bg-[#101827] px-3 py-2 text-[12px] font-bold text-slate-100">
                  {Number(requiredHubAmount || '0').toFixed(4)} {hubToken.symbol}
                </div>
              </div>

              <div>
                <p className="mb-1 text-[10px] text-slate-500">Est. LP</p>
                <div className="rounded-[8px] border border-white/[0.08] bg-[#101827] px-3 py-2 text-[12px] font-bold text-slate-100">
                  {estimatedLpTokens === null ? '--' : estimatedLpTokens.toFixed(4)}
                </div>
              </div>

              <button
                type="button"
                onClick={handleAddLiquidity}
                disabled={isAdding || !addAmount}
                className="rounded-[8px] bg-[#25c0f4] px-3 py-2 text-[12px] font-extrabold text-[#09111d] transition-all disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isApproving ? 'Approving...' : isAdding ? 'Adding...' : `Add ${token.symbol}`}
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[8px] border border-white/[0.06] bg-[#172134]">
            <div className="flex flex-wrap gap-1.5 border-b border-white/[0.06] px-3 py-2">
              {[0.25, 0.5, 1].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => presetRemoval(f)}
                  className="rounded-[6px] border border-white/[0.08] bg-[#1a2435] px-3 py-1 text-[11px] font-bold text-slate-300"
                >
                  {f === 1 ? 'Max' : `${f * 100}%`}
                </button>
              ))}
            </div>

            <div className="grid gap-2 px-3 py-2 xl:grid-cols-[minmax(0,1fr)_140px_100px_130px] xl:items-end">
              <div>
                <p className="mb-1 text-[10px] text-slate-500">LP amount · current {lpBalance.toFixed(4)}</p>
                <div className="flex items-center gap-2 rounded-[8px] border border-white/[0.08] bg-[#101827] px-3 py-2">
                  <input
                    type="number"
                    value={removeAmount}
                    onChange={(e) => setRemoveAmount(e.target.value)}
                    placeholder="0.0"
                    className="w-full bg-transparent text-[14px] font-extrabold text-slate-100 outline-none placeholder:text-slate-700"
                  />
                </div>
              </div>

              <div>
                <p className="mb-1 text-[10px] text-slate-500">Current share</p>
                <div className="rounded-[8px] border border-white/[0.08] bg-[#101827] px-3 py-2 text-[12px] font-bold text-slate-100">
                  {sharePercent.toFixed(2)}%
                </div>
              </div>

              <div>
                <p className="mb-1 text-[10px] text-slate-500">You receive</p>
                <div className="rounded-[8px] border border-white/[0.08] bg-[#101827] px-3 py-2 text-[12px] font-bold text-slate-100">
                  {receiveSummary}
                </div>
              </div>

              <button
                type="button"
                onClick={handleRemoveLiquidity}
                disabled={burnLiquidity.isPending || !removeAmount}
                className="rounded-[8px] border border-red-400/20 bg-[rgba(127,29,29,0.18)] px-3 py-2 text-[12px] font-extrabold text-red-300 transition-all disabled:cursor-not-allowed disabled:opacity-50"
              >
                {burnLiquidity.isPending ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const USDC_COLOR = '#3b82f6';
const USDC_LABEL = 'US';

export default function LiquidityPage() {
  const [activeTab, setActiveTab] = useState<'pools' | 'positions'>('pools');
  const [selectedPoolToken, setSelectedPoolToken] = useState<string | undefined>(undefined);
  const { data, isLoading: loading } = usePoolStats();
  const { address } = useAccount();
  const chainId = useChainId();
  const tokens = useMemo(() => getTokens(chainId), [chainId]);
  const hubToken = useMemo(() => getHubToken(chainId) || tokens[0], [chainId, tokens]);

  const pools = data?.pools ?? [];
  const activePools = pools.filter((pool) => pool.hasLiquidity);
  const availablePositionTokens = tokens.filter((token) => !isHubToken(token, chainId));

  return (
    <div className="w-full px-4 py-5 md:px-7 md:py-7" style={{ maxWidth: 1140 }}>
      <div className="mb-5 grid grid-cols-3 gap-3">
        {[
          { label: 'Total Value Locked', value: loading ? '--' : (data?.totalLiquidityUsdc ?? '$0'), sub: 'Stable liquidity' },
          { label: 'Total Volume', value: loading ? '--' : (data?.totalVolumeUsdc ?? '$0'), sub: `${data?.totalSwaps ?? 0} swaps` },
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

      {activeTab === 'pools' && (
        <div className="overflow-hidden rounded-[16px]" style={{ background: SURF, border: BDR }}>
          <div className="flex items-center justify-between px-5 py-[14px]" style={{ borderBottom: BDR }}>
            <p className="text-[14px] font-bold text-slate-100">Liquidity Pools</p>
            <button
              onClick={() =>
                setSelectedPoolToken((current) =>
                  current ? undefined : availablePositionTokens[0]?.address
                )
              }
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
              {pools.map((pool) => {
                const token = availablePositionTokens.find(
                  (item) => item.address.toLowerCase() === pool.tokenAddress.toLowerCase()
                );
                if (!token) return null;

                return (
                  <PoolListRow
                    key={pool.pair}
                    token={token}
                    hubToken={hubToken}
                    poolStat={pool}
                    walletAddress={address}
                    isActive={selectedPoolToken?.toLowerCase() === token.address.toLowerCase()}
                    onManage={(tokenAddress) =>
                      setSelectedPoolToken((current) =>
                        current?.toLowerCase() === tokenAddress.toLowerCase() ? undefined : tokenAddress
                      )
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'positions' && (
        <div className="space-y-5">
          <div className="overflow-hidden rounded-[16px]" style={{ background: SURF, border: BDR }}>
            <div className="flex items-center justify-between px-5 py-[14px]" style={{ borderBottom: BDR }}>
              <p className="text-[14px] font-bold text-slate-100">My Positions</p>
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
