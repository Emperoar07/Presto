'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi';
import { formatUnits, parseAbi, parseUnits } from 'viem';
import Link from 'next/link';
import { getHubToken, getTokens, isHubToken, type Token } from '@/config/tokens';
import { getExplorerTxUrl } from '@/lib/explorer';
import { getContractAddresses, getFeeManagerAddress, HUB_AMM_ABI, isArcChain, isTempoNativeChain, ZERO_ADDRESS } from '@/config/contracts';
import { addFeeLiquidity, getTokenBalance } from '@/lib/tempoClient';
import { Hooks } from '@/lib/tempo';
import toast from 'react-hot-toast';
import { TxToast } from '@/components/common/TxToast';
import { isUserCancellation } from '@/lib/errorHandling';

const TOKEN_COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-primary',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
];

const TEMPO_LIQUIDITY_ABI = parseAbi([
  'function getPool(address userToken, address validatorToken) external view returns (uint128 reserveUserToken, uint128 reserveValidatorToken)',
  'function liquidityOf(address userToken, address validatorToken, address provider) external view returns (uint256)',
]);

const isStableLikeToken = (symbol: string) => {
  const upper = symbol.toUpperCase();
  return (
    upper.includes('USD') ||
    upper === 'USDC' ||
    upper === 'USDT' ||
    upper === 'USYC' ||
    upper === 'EURC' ||
    upper === 'WUSDC'
  );
};

function TokenRow({
  symbol,
  name,
  colorClass,
  balanceFormatted,
}: {
  symbol: string;
  name: string;
  colorClass: string;
  balanceFormatted: string;
}) {
  const numericBalance = useMemo(() => {
    if (balanceFormatted === '--') return null;
    const parsed = Number.parseFloat(balanceFormatted.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }, [balanceFormatted]);

  const priceDisplay = isStableLikeToken(symbol) ? '$1.00' : 'N/A';
  const valueDisplay = numericBalance === null
    ? '--'
    : `$${numericBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <tr className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/30">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div
            className={`size-9 ${colorClass} flex items-center justify-center rounded-full text-xs font-bold text-white`}
          >
            {symbol.slice(0, 4)}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{name}</p>
            <p className="text-xs text-slate-500">{symbol}</p>
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <p className="text-sm text-slate-700 dark:text-slate-300">{priceDisplay}</p>
      </td>
      <td className="px-6 py-4">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {balanceFormatted} {symbol}
        </p>
      </td>
      <td className="px-6 py-4 text-right">
        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{valueDisplay}</p>
      </td>
    </tr>
  );
}

type TabId = 'tokens' | 'lp';

type LpPositionSnapshot = {
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  hubTokenAddress: string;
  hubTokenSymbol: string;
  hubTokenDecimals: number;
  pairLabel: string;
  lpBalance: number;
  estimatedValue: number;
};

function LpPositionInlineActions({
  snapshot,
}: {
  snapshot: LpPositionSnapshot;
}) {
  const chainId = useChainId();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [amount, setAmount] = useState('');
  const [walletBalance, setWalletBalance] = useState('0');
  const [requiredHubAmount, setRequiredHubAmount] = useState('0');
  const [isApproving, setIsApproving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const burnLiquidity = Hooks.amm.useBurnSync ? Hooks.amm.useBurnSync() : { mutate: () => {}, isPending: false };

  useEffect(() => {
    let cancelled = false;

    const fetchWalletBalance = async () => {
      if (!publicClient || !address) return;
      try {
        const nextBalance = await getTokenBalance(publicClient, address, snapshot.tokenAddress, snapshot.tokenDecimals);
        if (!cancelled) {
          setWalletBalance(nextBalance);
        }
      } catch (error) {
        console.error('Failed to fetch LP action wallet balance', error);
      }
    };

    fetchWalletBalance();
    return () => {
      cancelled = true;
    };
  }, [address, publicClient, snapshot.tokenAddress, snapshot.tokenDecimals]);

  useEffect(() => {
    if (isTempoNativeChain(chainId)) {
      setRequiredHubAmount(amount);
      return;
    }

    let cancelled = false;

    const fetchRequiredHubAmount = async () => {
      if (!publicClient || !amount || Number(amount) <= 0) {
        if (!cancelled) setRequiredHubAmount('0');
        return;
      }

      try {
        const { quoteHubLiquidityPathAmount } = await import('@/lib/tempoClient');
        const result = await quoteHubLiquidityPathAmount(
          publicClient,
          snapshot.tokenAddress,
          snapshot.hubTokenAddress,
          parseUnits(amount, snapshot.tokenDecimals),
          chainId
        );
        if (!cancelled) {
          setRequiredHubAmount(formatUnits(result, snapshot.hubTokenDecimals));
        }
      } catch (error) {
        console.error('Failed to fetch required hub amount', error);
        if (!cancelled) {
          setRequiredHubAmount('0');
        }
      }
    };

    fetchRequiredHubAmount();
    return () => {
      cancelled = true;
    };
  }, [amount, chainId, publicClient, snapshot.hubTokenAddress, snapshot.hubTokenDecimals, snapshot.tokenAddress, snapshot.tokenDecimals]);

  const handleAdd = async () => {
    if (!address || !walletClient || !publicClient || !amount || Number(amount) <= 0) return;

    setIsAdding(true);
    setIsApproving(false);
    try {
      const hash = await addFeeLiquidity(
        walletClient,
        publicClient,
        address as `0x${string}`,
        snapshot.tokenAddress,
        snapshot.hubTokenAddress,
        parseUnits(amount, isTempoNativeChain(chainId) ? snapshot.hubTokenDecimals : snapshot.tokenDecimals),
        (stage) => setIsApproving(stage === 'approving'),
        chainId
      );
      toast.custom(() => <TxToast hash={hash} title="Liquidity added" />);
      await publicClient.waitForTransactionReceipt({ hash });
      setAmount('');
    } catch (error) {
      if (!isUserCancellation(error)) {
        const msg = error instanceof Error ? error.message : 'Failed to add liquidity';
        toast.error(msg);
      }
    } finally {
      setIsAdding(false);
      setIsApproving(false);
    }
  };

  const handleRemove = (percent: number) => {
    if (!address || percent <= 0) return;
    const rawLiquidity = parseUnits(snapshot.lpBalance.toString(), 18);
    const removeAmount = (rawLiquidity * BigInt(percent)) / 100n;
    if (removeAmount <= 0n) return;

    burnLiquidity.mutate({
      userTokenAddress: snapshot.tokenAddress as `0x${string}`,
      validatorTokenAddress: snapshot.hubTokenAddress as `0x${string}`,
      liquidityAmount: removeAmount,
      to: address as `0x${string}`,
      feeToken: snapshot.hubTokenAddress as `0x${string}`,
    });
  };

  return (
    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="rounded-xl border border-slate-200 bg-white/70 px-3 py-3 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            <span>Add {snapshot.tokenSymbol}</span>
            <button
              type="button"
              onClick={() => setAmount(walletBalance)}
              className="rounded-full border border-primary/20 px-2.5 py-1 text-primary transition-colors hover:bg-primary/10"
            >
              Max
            </button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              className="w-full bg-transparent text-2xl font-semibold tracking-tight text-slate-900 outline-none placeholder:text-slate-300 dark:text-white dark:placeholder:text-slate-700"
            />
            <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              {snapshot.tokenSymbol}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Wallet: {Number(walletBalance || '0').toFixed(4)} {snapshot.tokenSymbol}</span>
            <span>Hub required: {Number(requiredHubAmount || '0').toFixed(4)} {snapshot.hubTokenSymbol}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={isAdding || !amount || Number(amount) <= 0}
          className="rounded-full bg-primary px-4 py-3 text-sm font-bold text-background-dark transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isApproving ? 'Approving...' : isAdding ? 'Adding...' : 'Add Liquidity'}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {[25, 50, 100].map((percent) => (
          <button
            key={percent}
            type="button"
            onClick={() => handleRemove(percent)}
            disabled={burnLiquidity.isPending}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
              percent === 100
                ? 'border border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500/15 dark:text-red-400'
                : 'border border-slate-200 text-slate-700 hover:border-primary/20 hover:text-primary dark:border-white/10 dark:text-slate-200'
            }`}
          >
            {burnLiquidity.isPending ? 'Removing...' : `Remove ${percent}%`}
          </button>
        ))}
      </div>
    </div>
  );
}

function LpPositionsView({
  chainId,
  snapshots,
}: {
  chainId: number;
  snapshots: LpPositionSnapshot[];
}) {
  const [expandedPair, setExpandedPair] = useState<string | null>(null);
  const isArcTestnet = isArcChain(chainId);
  const hasArcDeployment = getContractAddresses(chainId).HUB_AMM_ADDRESS !== ZERO_ADDRESS;

  if (isArcTestnet && !hasArcDeployment) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-600">water_drop</span>
        <p className="font-medium text-slate-500 dark:text-slate-400">Arc liquidity is not deployed in this environment yet</p>
        <Link
          href="/liquidity"
          className="rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-background-dark transition-colors hover:bg-primary/90"
        >
          Open Liquidity Page
        </Link>
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white p-12 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-600">water_drop</span>
        <p className="font-medium text-slate-500 dark:text-slate-400">No LP positions found</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Your LP Positions</h3>
        <span className="text-sm font-semibold text-primary">
          ${snapshots.reduce((sum, snapshot) => sum + snapshot.estimatedValue, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
      <div className="space-y-3">
        {snapshots.map((snapshot) => (
          <div
            key={snapshot.tokenAddress}
            className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-4 dark:border-slate-800 dark:bg-slate-800/40"
          >
            <button
              type="button"
              onClick={() => setExpandedPair((current) => (current === snapshot.tokenAddress ? null : snapshot.tokenAddress))}
              className="flex w-full flex-col gap-4 text-left md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{snapshot.pairLabel}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isArcChain(chainId) ? 'Stable liquidity position' : 'Fee liquidity position'}
                </p>
              </div>
              <div className="flex items-center gap-4 md:justify-end">
                <div className="grid gap-1 text-left md:text-right">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{snapshot.lpBalance.toFixed(4)} LP</p>
                  <p className="text-sm font-semibold text-primary">
                    ${snapshot.estimatedValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <span className="material-symbols-outlined text-slate-400">
                  {expandedPair === snapshot.tokenAddress ? 'expand_less' : 'expand_more'}
                </span>
              </div>
            </button>
            {expandedPair === snapshot.tokenAddress && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                <LpPositionInlineActions snapshot={snapshot} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PortfolioDashboard() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const tokens = getTokens(chainId);
  const [activeTab, setActiveTab] = useState<TabId>('tokens');
  const [mounted, setMounted] = useState(false);
  const [walletBalances, setWalletBalances] = useState<Record<string, string>>({});
  const [liquiditySnapshots, setLiquiditySnapshots] = useState<LpPositionSnapshot[]>([]);
  const stableTokens = useMemo(() => tokens.filter((token) => isStableLikeToken(token.symbol)), [tokens]);
  const hubToken = useMemo(() => getHubToken(chainId), [chainId]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchWalletBalances = async () => {
      if (!publicClient || !address) {
        if (!cancelled) setWalletBalances({});
        return;
      }

      try {
        const balanceEntries = await Promise.all(
          tokens.map(async (token) => [
            token.address,
            await getTokenBalance(publicClient, address, token.address, token.decimals),
          ] as const)
        );
        const balances = Object.fromEntries(balanceEntries);

        if (!cancelled) {
          setWalletBalances(balances);
        }
      } catch (error) {
        console.error('Failed to fetch portfolio balances', error);
        if (!cancelled) {
          setWalletBalances({});
        }
      }
    };

    fetchWalletBalances();
    const intervalId = setInterval(fetchWalletBalances, 10000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [address, publicClient, tokens]);

  useEffect(() => {
    let cancelled = false;

    const fetchLiquiditySnapshots = async () => {
      if (!publicClient || !address || !hubToken) {
        if (!cancelled) setLiquiditySnapshots([]);
        return;
      }

      try {
        const nextSnapshots: Array<LpPositionSnapshot | null> = await Promise.all(
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
                    args: [token.address, hubToken.address, address],
                  }) as Promise<bigint>,
                  publicClient.readContract({
                    address: getFeeManagerAddress(chainId),
                    abi: TEMPO_LIQUIDITY_ABI,
                    functionName: 'getPool',
                    args: [token.address, hubToken.address],
                  }) as Promise<readonly [bigint, bigint]>,
                ]);

                const lpBalance = Number(formatUnits(liquidityRaw, 18));
                if (!Number.isFinite(lpBalance) || lpBalance <= 0) return null;

                const reserveUser = Number(formatUnits(poolData[0], token.decimals));
                const reserveHub = Number(formatUnits(poolData[1], hubToken.decimals));
                const estimatedTotalShares = poolData[1] > 0n ? Number(formatUnits(poolData[1] * 2n, 18)) : 0;
                const shareRatio = estimatedTotalShares > 0 ? lpBalance / estimatedTotalShares : 0;
                const estimatedValue = shareRatio > 0 ? (reserveUser + reserveHub) * shareRatio : 0;

                return {
                  tokenAddress: token.address,
                  tokenSymbol: token.symbol,
                  tokenDecimals: token.decimals,
                  hubTokenAddress: hubToken.address,
                  hubTokenSymbol: hubToken.symbol,
                  hubTokenDecimals: hubToken.decimals,
                  pairLabel: `${token.symbol} / ${hubToken.symbol}`,
                  lpBalance,
                  estimatedValue,
                } satisfies LpPositionSnapshot;
              }

              const [liquidityRaw, reserveUserRaw, reserveHubRaw, totalSharesRaw] = await Promise.all([
                publicClient.readContract({
                  address: getContractAddresses(chainId).HUB_AMM_ADDRESS,
                  abi: HUB_AMM_ABI,
                  functionName: 'liquidityOf',
                  args: [token.address, address],
                }) as Promise<bigint>,
                publicClient.readContract({
                  address: getContractAddresses(chainId).HUB_AMM_ADDRESS,
                  abi: HUB_AMM_ABI,
                  functionName: 'tokenReserves',
                  args: [token.address],
                }) as Promise<bigint>,
                publicClient.readContract({
                  address: getContractAddresses(chainId).HUB_AMM_ADDRESS,
                  abi: HUB_AMM_ABI,
                  functionName: 'pathReserves',
                  args: [token.address],
                }) as Promise<bigint>,
                publicClient.readContract({
                  address: getContractAddresses(chainId).HUB_AMM_ADDRESS,
                  abi: HUB_AMM_ABI,
                  functionName: 'totalShares',
                  args: [token.address],
                }) as Promise<bigint>,
              ]);

              const lpBalance = Number(formatUnits(liquidityRaw, 18));
              if (!Number.isFinite(lpBalance) || lpBalance <= 0) return null;

              const reserveUser = Number(formatUnits(reserveUserRaw, token.decimals));
              const reserveHub = Number(formatUnits(reserveHubRaw, hubToken.decimals));
              const totalShares = Number(formatUnits(totalSharesRaw, 18));
              const shareRatio = totalShares > 0 ? lpBalance / totalShares : 0;
              const estimatedValue = shareRatio > 0 ? (reserveUser + reserveHub) * shareRatio : 0;

              return {
                tokenAddress: token.address,
                tokenSymbol: token.symbol,
                tokenDecimals: token.decimals,
                hubTokenAddress: hubToken.address,
                hubTokenSymbol: hubToken.symbol,
                hubTokenDecimals: hubToken.decimals,
                pairLabel: `${token.symbol} / ${hubToken.symbol}`,
                lpBalance,
                estimatedValue,
              } satisfies LpPositionSnapshot;
              } catch {
                return null;
              }
            })
        );

        if (!cancelled) {
          setLiquiditySnapshots(nextSnapshots.filter((item): item is LpPositionSnapshot => Boolean(item)));
        }
      } catch (error) {
        console.error('Failed to fetch liquidity snapshots', error);
        if (!cancelled) {
          setLiquiditySnapshots([]);
        }
      }
    };

    fetchLiquiditySnapshots();
    const intervalId = setInterval(fetchLiquiditySnapshots, 12000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [address, chainId, hubToken, publicClient, tokens]);

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'tokens', label: 'Tokens', icon: 'token' },
    { id: 'lp', label: 'LP Positions', icon: 'water_drop' },
  ];

  const totalStableValue = useMemo(() => {
    return stableTokens.reduce((sum, token) => {
      const rawBalance = walletBalances[token.address] ?? '0';
      const numericBalance = Number.parseFloat(rawBalance);
      return Number.isFinite(numericBalance) ? sum + numericBalance : sum;
    }, 0);
  }, [stableTokens, walletBalances]);

  const totalLiquidityValue = useMemo(() => {
    return liquiditySnapshots.reduce((sum, snapshot) => sum + snapshot.estimatedValue, 0);
  }, [liquiditySnapshots]);

  const portfolioTotalValue = useMemo(() => {
    return totalStableValue + totalLiquidityValue;
  }, [totalLiquidityValue, totalStableValue]);

  const totalStableValueDisplay = useMemo(() => {
    return portfolioTotalValue.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, [portfolioTotalValue]);

  if (!mounted) return null;

  if (!isConnected || !address) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
          <span className="material-symbols-outlined text-5xl text-primary">account_balance_wallet</span>
        </div>
        <div>
          <h2 className="mb-2 text-2xl font-bold text-slate-900 dark:text-white">Connect Your Wallet</h2>
          <p className="max-w-sm text-slate-500 dark:text-slate-400">
            Connect your wallet to view your portfolio, balances, and transaction history.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 md:py-7">
      <div className="mb-8">
        <div className="flex flex-col justify-center gap-4 rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <p className="text-base font-medium text-slate-500 dark:text-slate-400">Portfolio Summary</p>
            <span className="rounded-full bg-green-500/10 px-2.5 py-1 text-xs font-bold text-green-600 dark:text-green-500">
              On-chain
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-5xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
              ${totalStableValueDisplay}
            </p>
            <span className="text-lg font-semibold text-slate-500 dark:text-slate-400">total value</span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {tokens.length} assets tracked plus ${totalLiquidityValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} in provided liquidity.
          </p>
          <div className="mt-2 flex gap-2">
            <Link
              href="/swap"
              className="flex-1 rounded-xl bg-primary py-2.5 text-center text-sm font-bold text-background-dark transition-transform hover:bg-primary/90 active:scale-95"
            >
              Swap
            </Link>
            <Link
              href="/liquidity"
              className="flex-1 rounded-xl bg-slate-100 py-2.5 text-center text-sm font-bold text-slate-900 transition-transform hover:bg-slate-200 active:scale-95 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              Add Liquidity
            </Link>
          </div>
        </div>
      </div>

      <div className="mb-6 flex overflow-x-auto border-b border-slate-200 dark:border-slate-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-primary font-bold text-primary'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {activeTab === 'tokens' && (
            <>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Your Assets</h3>
                <span className="flex items-center gap-1 text-sm font-medium text-primary">
                  <span className="material-symbols-outlined text-sm">filter_list</span>
                  {tokens.length} tokens
                </span>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
                    <tr>
                      <th className="px-6 py-4">Asset</th>
                      <th className="px-6 py-4">Price</th>
                      <th className="px-6 py-4">Balance</th>
                      <th className="px-6 py-4 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {tokens.map((token, i) => (
                      <TokenRow
                        key={token.address}
                        symbol={token.symbol}
                        name={token.name}
                        colorClass={TOKEN_COLORS[i % TOKEN_COLORS.length]}
                        balanceFormatted={walletBalances[token.address] ?? '--'}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeTab === 'lp' && (
            <LpPositionsView chainId={chainId} snapshots={liquiditySnapshots} />
          )}

        </div>

        <div className="space-y-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Recent History</h3>
            <Link href="/transactions" className="text-xs font-bold uppercase text-primary hover:underline">
              View All
            </Link>
          </div>

          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            <RecentHistoryFeed address={address} chainId={chainId} />
          </div>

        </div>
      </div>
    </div>
  );
}

function RecentHistoryFeed({ address, chainId }: { address: `0x${string}`; chainId: number }) {
  const [items, setItems] = useState<
    { hash: string; type: string; status: string; block: string }[]
  >([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/transactions?address=${address}&chainId=${chainId}&limit=3`)
      .then((r) => r.json())
      .then((data) => {
        setItems(data.items ?? []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [address, chainId]);

  const txIcon: Record<string, string> = {
    swap: 'swap_horiz',
    order: 'candlestick_chart',
    liquidity: 'water_drop',
    mint: 'add_circle',
    burn: 'remove_circle',
    cancel: 'cancel',
  };

  const getIcon = (type: string) => {
    const lower = type.toLowerCase();
    for (const [key, icon] of Object.entries(txIcon)) {
      if (lower.includes(key)) return icon;
    }
    return 'receipt_long';
  };

  const isPrimary = (type: string) => type.toLowerCase().includes('swap');

  if (!loaded) {
    return (
      <div className="space-y-3 p-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 animate-pulse">
            <div className="size-10 rounded-full bg-slate-200 dark:bg-slate-700" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
              <div className="h-2.5 w-1/2 rounded bg-slate-100 dark:bg-slate-800" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
        No recent transactions
      </div>
    );
  }

  return (
    <>
      {items.map((item) => (
        <a
          key={item.hash}
          href={getExplorerTxUrl(chainId, item.hash as `0x${string}`)}
          target="_blank"
          rel="noreferrer"
          className="flex cursor-pointer items-center justify-between rounded-xl p-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/30"
        >
          <div className="flex items-center gap-3">
            <div
              className={`size-10 rounded-full flex items-center justify-center ${
                isPrimary(item.type)
                  ? 'bg-primary/10 text-primary dark:bg-primary/20'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">{getIcon(item.type)}</span>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{item.type}</p>
              <p className="text-xs text-slate-500">Block {item.block}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-mono text-xs text-slate-500">
              {item.hash.slice(0, 6)}...{item.hash.slice(-4)}
            </p>
            <p
              className={`text-[10px] font-bold uppercase ${
                item.status === 'Success' || item.status === 'Confirmed'
                  ? 'text-green-600 dark:text-green-500'
                  : item.status === 'Failed'
                    ? 'text-red-500'
                    : 'text-amber-500'
              }`}
            >
              {item.status}
            </p>
          </div>
        </a>
      ))}
    </>
  );
}
