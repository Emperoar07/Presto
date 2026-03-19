'use client';

import { useEffect, useMemo, useState } from 'react';
import { useChainId } from 'wagmi';
import { TokenModal } from '../common/TokenModal';
import { Token, getHubToken, getTokens, isHubToken } from '@/config/tokens';
import { Hooks } from '@/lib/tempo';
import { formatUnitsFixed } from '@/lib/format';
import { isArcChain, isTempoNativeChain } from '@/config/contracts';

type Trade = { price: number; amount: bigint; side: 'buy' | 'sell'; hash: `0x${string}`; block: bigint };
type OrderbookEntry = { tick: number; amount: bigint };
type AggregateAnalytics = {
  totalVolume?: string;
  totalTrades?: number;
  totalLiquidity?: string;
  lastUpdated?: number | null;
  message?: string;
};

export function AnalyticsDashboard({
  initialOrderbookView,
}: {
  initialOrderbookView?: 'book' | 'trades' | 'transactions' | 'cancelled';
}) {
  void initialOrderbookView;

  const chainId = useChainId();
  const tokens = getTokens(chainId);
  const isTempoChain = isTempoNativeChain(chainId);
  const isArcTestnet = isArcChain(chainId);

  const [selectedToken, setSelectedToken] = useState<Token>(
    tokens.find((t) => !isHubToken(t, chainId)) || tokens[1]
  );
  const pathToken = getHubToken(chainId) || tokens[0];
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [aggregate, setAggregate] = useState<AggregateAnalytics | null>(null);
  const [aggregateLoaded, setAggregateLoaded] = useState(false);

  useEffect(() => {
    const nextToken = tokens.find((t) => !isHubToken(t, chainId)) || tokens[1];
    setSelectedToken(nextToken);
  }, [chainId, tokens]);

  useEffect(() => {
    let cancelled = false;

    if (!isTempoChain) {
      setAggregate(null);
      setAggregateLoaded(true);
      return () => {
        cancelled = true;
      };
    }

    fetch('/api/analytics/aggregate')
      .then((r) => r.json())
      .then((data: AggregateAnalytics) => {
        if (cancelled) return;
        setAggregate(data);
        setAggregateLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setAggregateLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isTempoChain]);

  const orderbookHook = (Hooks.dex.useOrderbook
    ? Hooks.dex.useOrderbook({
        token: selectedToken.address as `0x${string}`,
        depth: 25,
      })
    : {
        data: null,
        isLoading: false,
        status: 'live',
        pollingMs: 0,
        lastUpdated: null,
        error: null,
      }) as {
    data: { recentTrades: Trade[]; bids: OrderbookEntry[]; asks: OrderbookEntry[] } | null;
    isLoading: boolean;
    status: 'live' | 'slow' | 'retrying';
    pollingMs: number;
    lastUpdated: number | null;
    error: string | null;
  };

  const aggregateStats = useMemo(() => {
    return {
      totalVolume: aggregate?.totalVolume ? formatUnitsFixed(BigInt(aggregate.totalVolume), selectedToken.decimals) : '--',
      totalLiquidity: aggregate?.totalLiquidity ? formatUnitsFixed(BigInt(aggregate.totalLiquidity), selectedToken.decimals) : '--',
      totalTrades: aggregate?.totalTrades ?? 0,
      lastUpdated: aggregate?.lastUpdated ?? null,
      message: aggregate?.message ?? null,
    };
  }, [aggregate, selectedToken.decimals]);

  const snapshotStats = useMemo(() => {
    const trades = (orderbookHook.data?.recentTrades ?? []) as Trade[];
    const bids = (orderbookHook.data?.bids ?? []) as OrderbookEntry[];
    const asks = (orderbookHook.data?.asks ?? []) as OrderbookEntry[];

    let volume = 0n;
    let buyVolume = 0n;
    let sellVolume = 0n;
    for (const trade of trades) {
      volume += trade.amount;
      if (trade.side === 'buy') buyVolume += trade.amount;
      else sellVolume += trade.amount;
    }

    const bestBid = bids.length > 0 ? bids[0].tick : 0;
    const bestAsk = asks.length > 0 ? asks[0].tick : 0;
    const spread = bestAsk > bestBid ? ((bestAsk - bestBid) / 100).toFixed(2) : '0.00';

    let bidLiquidity = 0n;
    for (const bid of bids) bidLiquidity += bid.amount;

    return {
      volume: formatUnitsFixed(volume, selectedToken.decimals),
      buyVolume: formatUnitsFixed(buyVolume, selectedToken.decimals),
      sellVolume: formatUnitsFixed(sellVolume, selectedToken.decimals),
      count: trades.length,
      spread,
      bidLiquidity: formatUnitsFixed(bidLiquidity, selectedToken.decimals),
      buyPercent: volume > 0n ? Number((buyVolume * 100n) / volume) : 50,
    };
  }, [orderbookHook.data, selectedToken]);

  const statusConfig = {
    live: { color: 'bg-emerald-500', text: 'Live' },
    slow: { color: 'bg-yellow-500', text: 'Slow' },
    retrying: { color: 'bg-red-500', text: 'Reconnecting' },
  };
  const status = statusConfig[orderbookHook.status];
  const supportsOrderbookAnalytics = isTempoChain;

  return (
    <div className="mx-auto w-full max-w-2xl rounded-2xl glass-panel p-6 shadow-xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Market Analytics</h2>
          <div className="mt-1 flex items-center gap-2">
            {supportsOrderbookAnalytics ? (
              <>
                <span className={`h-2 w-2 rounded-full ${status.color} animate-pulse`} />
                <span className="text-xs text-slate-500 dark:text-slate-400">{status.text}</span>
                {orderbookHook.lastUpdated && (
                  <span className="text-xs text-slate-500">
                    • {Math.floor((Date.now() - orderbookHook.lastUpdated) / 1000)}s ago
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-primary" />
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {isArcTestnet ? 'Arc stable analytics' : 'Summary mode'}
                </span>
              </>
            )}
          </div>
        </div>

        <button
          onClick={() => setIsTokenModalOpen(true)}
          className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-4 py-2 transition-all hover:bg-primary/20"
        >
          <span className="font-semibold text-slate-900 dark:text-white">{selectedToken.symbol}</span>
          <span className="text-slate-400">/</span>
          <span className="text-slate-500 dark:text-slate-400">{pathToken.symbol}</span>
          <span className="material-symbols-outlined text-sm text-slate-400">expand_more</span>
        </button>
      </div>

      {!supportsOrderbookAnalytics && (
        <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
          {isArcTestnet
            ? 'Arc does not expose the same native orderbook analytics flow as Tempo, so this page stays focused on lightweight market summaries.'
            : 'This network does not support the full Tempo orderbook analytics flow, so only summary metrics are shown here.'}
        </div>
      )}

      {aggregateStats.message && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">
          {aggregateStats.message}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">
            {supportsOrderbookAnalytics ? 'Snapshot Volume' : 'Indexed Volume'}
          </p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">
            {supportsOrderbookAnalytics ? snapshotStats.volume : '--'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 p-4 token-input-bg dark:border-slate-800">
          <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">
            {supportsOrderbookAnalytics ? 'Spread' : 'Indexed Liquidity'}
          </p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">
            {supportsOrderbookAnalytics ? `${snapshotStats.spread}%` : '--'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 p-4 token-input-bg dark:border-slate-800">
          <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">
            {supportsOrderbookAnalytics ? 'Trades' : 'Indexed Trades'}
          </p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">
            {supportsOrderbookAnalytics ? snapshotStats.count : '--'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 p-4 token-input-bg dark:border-slate-800">
          <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">
            {supportsOrderbookAnalytics ? 'Bid Liquidity' : 'Last Updated'}
          </p>
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
            {supportsOrderbookAnalytics
              ? snapshotStats.bidLiquidity
              : aggregateLoaded
                ? '--'
                : '...'}
          </p>
        </div>
      </div>

      {supportsOrderbookAnalytics && (
        <div className="mb-6">
          <div className="mb-2 flex justify-between text-xs">
            <span className="text-emerald-400">Buy {snapshotStats.buyVolume}</span>
            <span className="text-red-400">Sell {snapshotStats.sellVolume}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-red-500/30">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${snapshotStats.buyPercent}%` }}
            />
          </div>
        </div>
      )}

      <div className="mb-6 rounded-xl border border-slate-200 p-4 token-input-bg dark:border-slate-800">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Contract</p>
            <p className="break-all font-mono text-xs text-primary">{selectedToken.address}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Decimals</p>
            <p className="font-mono text-sm text-slate-900 dark:text-white">{selectedToken.decimals}</p>
          </div>
        </div>
      </div>

      {!supportsOrderbookAnalytics && (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
          Live orderbook analytics are only available on Tempo testnet.
        </div>
      )}

      <TokenModal
        isOpen={isTokenModalOpen}
        onClose={() => setIsTokenModalOpen(false)}
        onSelect={setSelectedToken}
        selectedToken={selectedToken}
      />
    </div>
  );
}
