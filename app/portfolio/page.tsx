'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { formatUnits, parseAbi } from 'viem';
import { useAccount, useChainId, usePublicClient } from 'wagmi';
import { getHubToken, getTokens, isHubToken } from '@/config/tokens';
import {
  getContractAddresses,
  getFeeManagerAddress,
  HUB_AMM_ABI,
  isTempoNativeChain,
} from '@/config/contracts';
import { useTokenBalances } from '@/hooks/useApiQueries';

const SURF = '#1e293b';
const SURF_2 = '#263347';
const BDR = '1px solid rgba(255,255,255,0.07)';

const TOKEN_COLORS = ['#3b82f6', '#8b5cf6', '#25c0f4', '#f59e0b', '#ec4899', '#22c55e'];

const TEMPO_LIQUIDITY_ABI = parseAbi([
  'function getPool(address userToken, address validatorToken) external view returns (uint128 reserveUserToken, uint128 reserveValidatorToken)',
  'function liquidityOf(address userToken, address validatorToken, address provider) external view returns (uint256)',
]);

type LpPositionSnapshot = {
  tokenAddress: string;
  pairLabel: string;
  lpBalance: number;
  sharePercent: number;
  estimatedValue: number;
};

const isStableLikeToken = (symbol: string) => {
  const upper = symbol.toUpperCase();
  return ['USDC', 'USDT', 'EURC', 'WUSDC'].includes(upper) || upper.includes('USD');
};

function formatUsd(value: number) {
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const tokens = useMemo(() => getTokens(chainId), [chainId]);
  const hubToken = useMemo(() => getHubToken(chainId), [chainId]);
  const [activeTab, setActiveTab] = useState<'tokens' | 'lp'>('tokens');
  const [liquiditySnapshots, setLiquiditySnapshots] = useState<LpPositionSnapshot[]>([]);

  const { data: balances = {}, isLoading } = useTokenBalances();

  useEffect(() => {
    let cancelled = false;

    const fetchLiquiditySnapshots = async () => {
      if (!publicClient || !address || !hubToken) {
        if (!cancelled) setLiquiditySnapshots([]);
        return;
      }

      try {
        const snapshots = await Promise.all(
          tokens
            .filter((token) => !isHubToken(token, chainId))
            .map(async (token) => {
              try {
              if (isTempoNativeChain(chainId)) {
                const [liquidityRaw, poolData] = await Promise.all([
                  publicClient.readContract({
                    address: getFeeManagerAddress(chainId),
                    abi: TEMPO_LIQUIDITY_ABI,
                    functionName: 'liquidityOf',
                    args: [token.address as `0x${string}`, hubToken.address as `0x${string}`, address],
                  }) as Promise<bigint>,
                  publicClient.readContract({
                    address: getFeeManagerAddress(chainId),
                    abi: TEMPO_LIQUIDITY_ABI,
                    functionName: 'getPool',
                    args: [token.address as `0x${string}`, hubToken.address as `0x${string}`],
                  }) as Promise<readonly [bigint, bigint]>,
                ]);

                const lpBalance = Number(formatUnits(liquidityRaw, 18));
                if (!Number.isFinite(lpBalance) || lpBalance <= 0) return null;

                const reserveUser = Number(formatUnits(poolData[0], token.decimals));
                const reserveHub = Number(formatUnits(poolData[1], hubToken.decimals));
                const estimatedTotalShares = poolData[1] > 0n ? Number(formatUnits(poolData[1] * 2n, 18)) : 0;
                const sharePercent = estimatedTotalShares > 0 ? (lpBalance / estimatedTotalShares) * 100 : 0;
                const estimatedValue = sharePercent > 0 ? (reserveUser + reserveHub) * (sharePercent / 100) : 0;

                return {
                  tokenAddress: token.address,
                  pairLabel: `${token.symbol} / ${hubToken.symbol}`,
                  lpBalance,
                  sharePercent,
                  estimatedValue,
                } satisfies LpPositionSnapshot;
              }

              const [liquidityRaw, reserveUserRaw, reserveHubRaw, totalSharesRaw] = await Promise.all([
                publicClient.readContract({
                  address: getContractAddresses(chainId).HUB_AMM_ADDRESS,
                  abi: HUB_AMM_ABI,
                  functionName: 'liquidityOf',
                  args: [token.address as `0x${string}`, address],
                }) as Promise<bigint>,
                publicClient.readContract({
                  address: getContractAddresses(chainId).HUB_AMM_ADDRESS,
                  abi: HUB_AMM_ABI,
                  functionName: 'tokenReserves',
                  args: [token.address as `0x${string}`],
                }) as Promise<bigint>,
                publicClient.readContract({
                  address: getContractAddresses(chainId).HUB_AMM_ADDRESS,
                  abi: HUB_AMM_ABI,
                  functionName: 'pathReserves',
                  args: [token.address as `0x${string}`],
                }) as Promise<bigint>,
                publicClient.readContract({
                  address: getContractAddresses(chainId).HUB_AMM_ADDRESS,
                  abi: HUB_AMM_ABI,
                  functionName: 'totalShares',
                  args: [token.address as `0x${string}`],
                }) as Promise<bigint>,
              ]);

              const lpBalance = Number(formatUnits(liquidityRaw, 18));
              if (!Number.isFinite(lpBalance) || lpBalance <= 0) return null;

              const reserveUser = Number(formatUnits(reserveUserRaw, token.decimals));
              const reserveHub = Number(formatUnits(reserveHubRaw, hubToken.decimals));
              const totalShares = Number(formatUnits(totalSharesRaw, 18));
              const sharePercent = totalShares > 0 ? (lpBalance / totalShares) * 100 : 0;
              const estimatedValue = sharePercent > 0 ? (reserveUser + reserveHub) * (sharePercent / 100) : 0;

              return {
                tokenAddress: token.address,
                pairLabel: `${token.symbol} / ${hubToken.symbol}`,
                lpBalance,
                sharePercent,
                estimatedValue,
              } satisfies LpPositionSnapshot;
              } catch {
                // Token pool may not exist on-chain (e.g. USYC) — skip silently
                return null;
              }
            }),
        );

        if (!cancelled) {
          setLiquiditySnapshots(snapshots.filter((snapshot): snapshot is LpPositionSnapshot => Boolean(snapshot)));
        }
      } catch (error) {
        console.error('Failed to fetch portfolio LP snapshots', error);
        if (!cancelled) setLiquiditySnapshots([]);
      }
    };

    void fetchLiquiditySnapshots();
    const intervalId = window.setInterval(fetchLiquiditySnapshots, 12_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [address, chainId, hubToken, publicClient, tokens]);

  const assetRows = useMemo(() => {
    return tokens.map((token, index) => {
      const numericBalance = Number.parseFloat((balances as Record<string, string>)[token.address] ?? '0');
      const stable = isStableLikeToken(token.symbol);
      const estimatedValue = stable ? numericBalance : 0;

      return {
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        balance: numericBalance,
        priceLabel: stable ? '$1.00' : 'N/A',
        valueNumber: estimatedValue,
        valueLabel: estimatedValue > 0 ? formatUsd(estimatedValue) : '--',
        color: TOKEN_COLORS[index % TOKEN_COLORS.length],
      };
    });
  }, [balances, tokens]);

  const tokenHoldingsValue = useMemo(() => {
    return assetRows.reduce((sum, asset) => sum + asset.valueNumber, 0);
  }, [assetRows]);

  const lpPositionsValue = useMemo(() => {
    return liquiditySnapshots.reduce((sum, snapshot) => sum + snapshot.estimatedValue, 0);
  }, [liquiditySnapshots]);

  const totalBalance = tokenHoldingsValue + lpPositionsValue;

  if (!isConnected || !address) {
    return (
      <div className="px-4 py-5 md:px-7 md:py-7" style={{ maxWidth: 1140 }}>
        <div className="rounded-[16px] p-8 text-center" style={{ background: SURF, border: BDR }}>
          <p className="text-[15px] font-bold text-slate-100">Portfolio</p>
          <p className="mt-2 text-[13px] text-slate-400">Connect your wallet to view balances and positions.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-5 md:px-7 md:py-7" style={{ maxWidth: 1140 }}>
      <div className="mb-5 grid grid-cols-3 gap-3">
        {[
          {
            label: 'Total Balance',
            value: isLoading ? '--' : formatUsd(totalBalance),
            sub: 'Wallet plus LP value',
          },
          {
            label: 'LP Positions',
            value: formatUsd(lpPositionsValue),
            sub: `${liquiditySnapshots.length} active`,
          },
          {
            label: 'Managed Pairs',
            value: String(liquiditySnapshots.length),
            sub: liquiditySnapshots.length ? 'Live onchain positions' : 'No LP positions yet',
          },
        ].map(({ label, value, sub }) => (
          <div key={label} className="rounded-[16px] px-3 py-4 md:px-5 md:py-5" style={{ background: SURF, border: BDR }}>
            <p className="mb-1 text-[10px] font-medium text-slate-500 md:mb-1.5 md:text-[11px]">{label}</p>
            <p className="text-[15px] font-extrabold leading-none tracking-tight text-slate-100 md:text-[20px]">{value}</p>
            <p className="mt-1 text-[10px] font-semibold text-emerald-400 md:text-[11px]">{sub}</p>
          </div>
        ))}
      </div>

      <div className="mb-[18px] flex w-fit gap-1 rounded-[10px] p-1" style={{ background: SURF_2 }}>
        {[
          { key: 'tokens', label: 'Token Holdings' },
          { key: 'lp', label: 'LP Positions' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key as 'tokens' | 'lp')}
            className={`rounded-[8px] px-[14px] py-[6px] text-[13px] font-semibold transition-all ${
              activeTab === tab.key ? 'text-slate-100 shadow' : 'text-slate-500'
            }`}
            style={activeTab === tab.key ? { background: SURF } : {}}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'tokens' ? (
        <div className="overflow-hidden rounded-[16px]" style={{ background: SURF, border: BDR }}>
          <table className="hidden w-full border-collapse md:table">
            <thead>
              <tr>
                {['Asset', 'Price', 'Balance', 'Value'].map((label, index) => (
                  <th
                    key={label}
                    className={`border-b px-5 py-[10px] text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 ${
                      index === 3 ? 'text-right' : 'text-left'
                    }`}
                    style={{ borderBottom: BDR }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assetRows.map((asset) => (
                <tr key={asset.address} className="border-b border-white/[0.03] hover:bg-white/[0.025]">
                  <td className="px-5 py-[13px]">
                    <div className="flex items-center gap-3">
                      <span
                        className="flex size-8 items-center justify-center rounded-full text-[10px] font-extrabold text-white"
                        style={{ background: asset.color }}
                      >
                        {asset.symbol.slice(0, 4)}
                      </span>
                      <div>
                        <p className="text-[13px] font-extrabold text-slate-100">{asset.name}</p>
                        <p className="text-[11px] text-slate-500">{asset.symbol}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-[13px] text-[13px] text-slate-300">{asset.priceLabel}</td>
                  <td className="px-5 py-[13px] text-[13px] font-semibold text-slate-100">
                    {asset.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {asset.symbol}
                  </td>
                  <td className="px-5 py-[13px] text-right text-[13px] font-bold text-slate-100">{asset.valueLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="divide-y divide-white/[0.04] md:hidden">
            {assetRows.map((asset) => (
              <div key={asset.address} className="flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <span
                    className="flex size-9 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold text-white"
                    style={{ background: asset.color }}
                  >
                    {asset.symbol.slice(0, 4)}
                  </span>
                  <div>
                    <p className="text-[13px] font-extrabold text-slate-100">{asset.symbol}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {asset.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-bold text-slate-100">{asset.valueLabel}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{asset.priceLabel}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[16px]" style={{ background: SURF, border: BDR }}>
          <div className="flex items-center justify-between border-b px-5 py-[14px]" style={{ borderBottom: BDR }}>
            <div>
              <p className="text-[14px] font-bold text-slate-100">LP Positions</p>
              <p className="mt-1 text-[12px] text-slate-500">Live liquidity positions detected from the pools contracts on this network.</p>
            </div>
            <Link
              href="/liquidity"
              className="rounded-[10px] px-3.5 py-2 text-[12px] font-bold text-[#0f172a]"
              style={{ background: '#25c0f4' }}
            >
              Open Pools
            </Link>
          </div>

          {liquiditySnapshots.length === 0 ? (
            <div className="px-5 py-10 text-[13px] text-slate-400">No LP positions found for this wallet on the current network.</div>
          ) : (
            <div>
              {liquiditySnapshots.map((snapshot) => (
                <div key={snapshot.tokenAddress} className="flex flex-col gap-4 border-b border-white/[0.05] px-5 py-4 last:border-b-0 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-[15px] font-bold text-slate-100">{snapshot.pairLabel}</p>
                    <p className="mt-1 text-[12px] text-slate-500">
                      {snapshot.lpBalance.toFixed(4)} LP • {snapshot.sharePercent.toFixed(2)}% share
                    </p>
                  </div>
                  <div className="grid gap-3 text-left md:grid-cols-2 md:text-right">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Value</p>
                      <p className="mt-1 text-[16px] font-extrabold tracking-tight text-slate-100">{formatUsd(snapshot.estimatedValue)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Status</p>
                      <p className="mt-1 text-[12px] font-semibold text-emerald-400">Live position</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
