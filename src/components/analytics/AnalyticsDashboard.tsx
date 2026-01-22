'use client';

import { useEffect, useMemo, useState } from 'react';
import { TokenModal } from '../common/TokenModal';
import { Orderbook } from '../liquidity/Orderbook';
import { Token, getTokens } from '@/config/tokens';
import { useChainId } from 'wagmi';
import { formatUnitsFixed } from '@/lib/format';
import { Hooks } from '@/lib/tempo';

type Trade = { price: number; amount: bigint; side: 'buy' | 'sell'; hash: `0x${string}`; block: bigint };
type OrderbookEntry = { tick: number; amount: bigint };

export function AnalyticsDashboard({ initialOrderbookView }: { initialOrderbookView?: 'book' | 'trades' | 'transactions' | 'cancelled' }) {
  const chainId = useChainId();
  const tokens = getTokens(chainId);

  // Token State
  const [selectedToken, setSelectedToken] = useState<Token>(tokens.find(t => t.symbol !== 'pathUSD') || tokens[1]);
  const pathToken = tokens.find(t => t.symbol === 'pathUSD') || tokens[0];

  // Reset tokens on chain change
  useEffect(() => {
    const nextToken = tokens.find(t => t.symbol !== 'pathUSD') || tokens[1];
    setSelectedToken(nextToken);
  }, [chainId, tokens]);

  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const orderbookHook = (Hooks.dex.useOrderbook
    ? Hooks.dex.useOrderbook({
        token: selectedToken.address as `0x${string}`,
        depth: 25,
      })
    : { data: null, isLoading: false, status: 'live', pollingMs: 0, lastUpdated: null, error: null }) as {
      data: { recentTrades: Trade[]; bids: OrderbookEntry[]; asks: OrderbookEntry[] } | null;
      isLoading: boolean;
      status: 'live' | 'slow' | 'retrying';
      pollingMs: number;
      lastUpdated: number | null;
      error: string | null;
    };

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

    // Calculate spread
    const bestBid = bids.length > 0 ? bids[0].tick : 0;
    const bestAsk = asks.length > 0 ? asks[0].tick : 0;
    const spread = bestAsk > bestBid ? ((bestAsk - bestBid) / 100).toFixed(2) : '0.00';

    // Calculate total liquidity
    let bidLiquidity = 0n;
    let askLiquidity = 0n;
    for (const bid of bids) bidLiquidity += bid.amount;
    for (const ask of asks) askLiquidity += ask.amount;

    return {
      volume: formatUnitsFixed(volume, selectedToken.decimals),
      buyVolume: formatUnitsFixed(buyVolume, selectedToken.decimals),
      sellVolume: formatUnitsFixed(sellVolume, selectedToken.decimals),
      count: trades.length,
      spread,
      bidLiquidity: formatUnitsFixed(bidLiquidity, selectedToken.decimals),
      askLiquidity: formatUnitsFixed(askLiquidity, selectedToken.decimals),
      buyPercent: volume > 0n ? Number((buyVolume * 100n) / volume) : 50,
    };
  }, [orderbookHook.data, selectedToken]);

  // Status indicator
  const statusConfig = {
    live: { color: 'bg-emerald-500', text: 'Live' },
    slow: { color: 'bg-yellow-500', text: 'Slow' },
    retrying: { color: 'bg-red-500', text: 'Reconnecting' },
  };
  const status = statusConfig[orderbookHook.status];

  return (
    <div className="w-full max-w-2xl p-6 rounded-2xl shadow-2xl border border-white/10 bg-black/40 backdrop-blur-md mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Market Analytics</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className={`w-2 h-2 rounded-full ${status.color} animate-pulse`} />
            <span className="text-xs text-zinc-500">{status.text}</span>
            {orderbookHook.lastUpdated && (
              <span className="text-xs text-zinc-600">
                • {Math.floor((Date.now() - orderbookHook.lastUpdated) / 1000)}s ago
              </span>
            )}
          </div>
        </div>

        <button
            onClick={() => setIsTokenModalOpen(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-[#00F3FF]/10 to-[#BC13FE]/10 hover:from-[#00F3FF]/20 hover:to-[#BC13FE]/20 border border-white/10 px-4 py-2 rounded-xl transition-all"
        >
            <span className="font-semibold text-white">{selectedToken.symbol}</span>
            <span className="text-zinc-500">/</span>
            <span className="text-zinc-400">{pathToken.symbol}</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400"><path d="m6 9 6 6 6-6"/></svg>
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="p-4 rounded-xl bg-gradient-to-br from-[#00F3FF]/10 to-transparent border border-[#00F3FF]/20">
          <p className="text-xs text-zinc-400 mb-1">24h Volume</p>
          <p className="text-lg font-bold text-white">{snapshotStats.volume}</p>
        </div>
        <div className="p-4 rounded-xl bg-black/30 border border-white/5">
          <p className="text-xs text-zinc-400 mb-1">Spread</p>
          <p className="text-lg font-bold text-white">{snapshotStats.spread}%</p>
        </div>
        <div className="p-4 rounded-xl bg-black/30 border border-white/5">
          <p className="text-xs text-zinc-400 mb-1">Trades</p>
          <p className="text-lg font-bold text-white">{snapshotStats.count}</p>
        </div>
        <div className="p-4 rounded-xl bg-black/30 border border-white/5">
          <p className="text-xs text-zinc-400 mb-1">Bid Liquidity</p>
          <p className="text-lg font-bold text-emerald-400">{snapshotStats.bidLiquidity}</p>
        </div>
      </div>

      {/* Buy/Sell Ratio Bar */}
      <div className="mb-6">
        <div className="flex justify-between text-xs mb-2">
          <span className="text-emerald-400">Buy {snapshotStats.buyVolume}</span>
          <span className="text-red-400">Sell {snapshotStats.sellVolume}</span>
        </div>
        <div className="h-2 rounded-full bg-red-500/30 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
            style={{ width: `${snapshotStats.buyPercent}%` }}
          />
        </div>
      </div>

      {/* Token Info */}
      <div className="bg-black/20 border border-white/5 p-4 rounded-xl mb-6">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-xs text-zinc-500 mb-1">Contract</p>
            <p className="font-mono text-xs text-[#00F3FF] break-all">{selectedToken.address}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-500 mb-1">Decimals</p>
            <p className="font-mono text-sm text-white">{selectedToken.decimals}</p>
          </div>
        </div>
      </div>

      {/* Reusing Orderbook component which now includes Trades and Cancelled Orders */}
      <Orderbook
        baseToken={selectedToken}
        quoteToken={pathToken}
        initialView={initialOrderbookView}
        prefetched={{
          data: orderbookHook.data as any,
          isLoading: orderbookHook.isLoading,
          status: orderbookHook.status,
          pollingMs: orderbookHook.pollingMs,
          lastUpdated: orderbookHook.lastUpdated,
          error: orderbookHook.error,
        }}
      />

      <TokenModal
        isOpen={isTokenModalOpen}
        onClose={() => setIsTokenModalOpen(false)}
        onSelect={setSelectedToken}
        selectedToken={selectedToken}
      />
    </div>
  );
}
