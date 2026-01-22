'use client';

import { Token } from '@/config/tokens';
import { useMemo, useState } from 'react';
import { useChainId } from 'wagmi';
import { formatUnitsFixed } from '@/lib/format';
import { getExplorerTxUrl } from '@/lib/explorer';
import { Hooks } from '@/lib/tempo';
 

type OrderbookEntry = { tick: number; amount: bigint };
type RecentTrade = { price: number; amount: bigint; side: 'buy' | 'sell'; hash: `0x${string}`; block: bigint };
type CancelledOrder = { orderId: string; price: number; amount: bigint; isBid: boolean; hash: `0x${string}`; block: bigint };
type OrderbookData = { bids: OrderbookEntry[]; asks: OrderbookEntry[]; recentTrades: RecentTrade[]; cancelledOrders: CancelledOrder[] };

interface OrderbookProps {
  baseToken: Token;
  quoteToken: Token;
  initialView?: 'book' | 'trades' | 'transactions' | 'cancelled';
  prefetched?: {
    data: OrderbookData | null;
    isLoading: boolean;
    status?: 'live' | 'slow' | 'retrying';
    pollingMs?: number;
    lastUpdated?: number | null;
    error?: string | null;
  };
}

export function Orderbook({ baseToken, quoteToken, prefetched, initialView }: OrderbookProps) {

  const [view, setView] = useState<'book' | 'trades' | 'transactions' | 'cancelled'>(initialView ?? 'book');
  const [depth, setDepth] = useState(10);
  const chainId = useChainId();
  const hookResult = (Hooks.dex.useOrderbook
    ? Hooks.dex.useOrderbook({
        token: baseToken.address as `0x${string}`,
        depth,
      })
    : { data: null, isLoading: false, status: 'live', pollingMs: 0, lastUpdated: null, error: null }) as { data: OrderbookData | null; isLoading: boolean; status: 'live' | 'slow' | 'retrying'; pollingMs: number; lastUpdated: number | null; error: string | null };

  const orderbook = prefetched?.data ?? hookResult.data;
  const isLoading = prefetched?.isLoading ?? hookResult.isLoading;
  const status = prefetched?.status ?? hookResult.status;
  const pollingMs = prefetched?.pollingMs ?? hookResult.pollingMs;
  const lastUpdated = prefetched?.lastUpdated ?? hookResult.lastUpdated;
  const error = prefetched?.error ?? hookResult.error;

  const statusLabel =
    status === 'retrying' ? 'Retrying' : status === 'slow' ? 'Slow' : 'Live';
  const statusClass =
    status === 'retrying'
      ? 'text-red-400'
      : status === 'slow'
      ? 'text-amber-400'
      : 'text-green-400';
  const updatedAgo =
    lastUpdated ? Math.max(0, Math.floor((Date.now() - lastUpdated) / 1000)) : null;

  const safeOrderbook = orderbook ?? {
    bids: [],
    asks: [],
    recentTrades: [],
    cancelledOrders: [],
  };
  const { bids, asks, recentTrades, cancelledOrders } = safeOrderbook;

  const asksDisplay = useMemo(
    () => asks?.map((ask) => ({ ...ask, amountDisplay: formatUnitsFixed(ask.amount, baseToken.decimals) })) ?? [],
    [asks, baseToken.decimals]
  );
  const bidsDisplay = useMemo(
    () => bids?.map((bid) => ({ ...bid, amountDisplay: formatUnitsFixed(bid.amount, baseToken.decimals) })) ?? [],
    [bids, baseToken.decimals]
  );
  const tradesDisplay = useMemo(
    () =>
      recentTrades?.map((trade) => ({
        ...trade,
        amountDisplay: formatUnitsFixed(trade.amount, baseToken.decimals),
      })) ?? [],
    [recentTrades, baseToken.decimals]
  );
  const transactionsDisplay = useMemo(
    () =>
      recentTrades?.map((trade) => ({
        ...trade,
        amountDisplay: formatUnitsFixed(trade.amount, baseToken.decimals),
        status: 'Confirmed',
      })) ?? [],
    [recentTrades, baseToken.decimals]
  );
  const cancelledDisplay = useMemo(
    () =>
      cancelledOrders?.map((order) => ({
        ...order,
        amountDisplay: formatUnitsFixed(order.amount, baseToken.decimals),
      })) ?? [],
    [cancelledOrders, baseToken.decimals]
  );

  if (isLoading) {
    return <div className="text-center text-sm text-zinc-500 py-4">Loading orderbook...</div>;
  }

  if (!orderbook) {
    return (
      <div className="text-center text-sm text-zinc-500 py-4">
        Orderbook unavailable{error ? `: ${error}` : ''}
      </div>
    );
  }

  return (
    <div className="mt-6 border-t border-white/10 pt-4">
      <div className="flex items-center justify-between mb-5">
        <div className="flex space-x-5 text-xs font-semibold">
          <button 
            onClick={() => setView('book')}
            className={`${view === 'book' ? 'text-[#00F3FF] underline decoration-[#00F3FF]/50 underline-offset-4' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Orderbook
          </button>
          <button 
            onClick={() => setView('trades')}
            className={`${view === 'trades' ? 'text-[#BC13FE] underline decoration-[#BC13FE]/50 underline-offset-4' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Recent Trades
          </button>
          <button 
            onClick={() => setView('transactions')}
            className={`${view === 'transactions' ? 'text-[#F3C969] underline decoration-[#F3C969]/50 underline-offset-4' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Past Transactions
          </button>
          <button 
            onClick={() => setView('cancelled')}
            className={`${view === 'cancelled' ? 'text-zinc-300 underline decoration-zinc-500/50 underline-offset-4' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Cancelled
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
            <span className={statusClass}>{statusLabel}</span>
            {updatedAgo !== null && <span>Updated {updatedAgo}s ago</span>}
            {pollingMs > 0 && <span>Polling {Math.round(pollingMs / 1000)}s</span>}
          </div>
          <button
            onClick={() => setDepth((prev) => (prev === 10 ? 25 : 10))}
            className="text-[11px] text-zinc-500 hover:text-zinc-300 border border-white/10 rounded px-2 py-1"
          >
            Depth: {depth}
          </button>
        </div>
      </div>
      
      {view === 'book' && (
      <div className="grid grid-cols-2 gap-4">
        {/* Asks (Sells) */}
        <div>
          <div className="text-xs font-medium text-zinc-500 mb-2 flex justify-between">
            <span>Price (Tick)</span>
            <span>Amt</span>
          </div>
          <div className="space-y-1">
            {asksDisplay.length === 0 && <div className="text-xs text-zinc-600">No asks</div>}
            {asksDisplay.map((ask, i) => (
              <div key={i} className="flex justify-between text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded border border-red-500/20">
                <span>{ask.tick}</span>
                <span>{ask.amountDisplay}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bids (Buys) */}
        <div>
          <div className="text-xs font-medium text-zinc-500 mb-2 flex justify-between">
            <span>Price (Tick)</span>
            <span>Amt</span>
          </div>
          <div className="space-y-1">
             {bidsDisplay.length === 0 && <div className="text-xs text-zinc-600">No bids</div>}
             {bidsDisplay.map((bid, i) => (
              <div key={i} className="flex justify-between text-xs text-green-400 bg-green-500/10 px-2 py-1 rounded border border-green-500/20">
                <span>{bid.tick}</span>
                <span>{bid.amountDisplay}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      )}

      {view === 'trades' && (
          <div className="space-y-2">
              <div className="grid grid-cols-4 text-xs font-medium text-zinc-500 mb-2">
                  <span>Price ({quoteToken.symbol})</span>
                  <span>Amount</span>
                  <span>Side</span>
                  <span>Tx</span>
              </div>
              {tradesDisplay.length === 0 && <div className="text-xs text-zinc-600 text-center py-2">No recent trades</div>}
              {tradesDisplay.map((trade, i) => (
                   <div key={i} className="grid grid-cols-4 text-xs py-1 border-b border-white/5 last:border-0 text-zinc-300">
                        <span className="font-mono">{trade.price}</span>
                        <span className="font-mono">{trade.amountDisplay}</span>
                        <span className={trade.side === 'buy' ? 'text-green-400' : 'text-red-400'}>{trade.side === 'buy' ? 'Buy' : 'Sell'}</span>
                        <a href={getExplorerTxUrl(chainId, trade.hash)} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 truncate">
                            {trade.hash.slice(0, 6)}...
                        </a>
                   </div>
              ))}
          </div>
      )}

      {view === 'transactions' && (
          <div className="space-y-2">
              <div className="grid grid-cols-4 text-xs font-medium text-zinc-500 mb-2">
                  <span>Type</span>
                  <span>Amount</span>
                  <span>Status</span>
                  <span>Tx</span>
              </div>
              {transactionsDisplay.length === 0 && <div className="text-xs text-zinc-600 text-center py-2">No transactions</div>}
              {transactionsDisplay.map((trade, i) => (
                   <div key={i} className="grid grid-cols-4 text-xs py-1 border-b border-white/5 last:border-0 text-zinc-300">
                        <span className={trade.side === 'buy' ? 'text-green-400' : 'text-red-400'}>
                          {trade.side === 'buy' ? 'Buy' : 'Sell'}
                        </span>
                        <span className="font-mono">{trade.amountDisplay}</span>
                        <span className="text-green-400">{trade.status}</span>
                        <a href={getExplorerTxUrl(chainId, trade.hash)} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 truncate">
                            {trade.hash.slice(0, 6)}...
                        </a>
                   </div>
              ))}
          </div>
      )}

      {view === 'cancelled' && (
          <div className="space-y-2">
               <div className="grid grid-cols-3 text-xs font-medium text-zinc-500 mb-2">
                  <span>Price</span>
                  <span>Amount</span>
                  <span>Tx</span>
              </div>
              {cancelledDisplay.length === 0 && <div className="text-xs text-zinc-600 text-center py-2">No cancelled orders</div>}
               {cancelledDisplay.map((order, i) => (
                   <div key={i} className="grid grid-cols-3 text-xs py-1 border-b border-white/5 last:border-0 text-zinc-400">
                        <span className="font-mono">{order.price}</span>
                        <span className="font-mono">{order.amountDisplay}</span>
                        <a href={getExplorerTxUrl(chainId, order.hash)} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 truncate">
                            {order.hash.slice(0, 6)}...
                        </a>
                   </div>
              ))}
          </div>
      )}
    </div>
  );
}
