'use client';

import { useEffect, useState } from 'react';
import { useChainId } from 'wagmi';
import { Token, getTokens } from '@/config/tokens';
import { formatUnitsFixed } from '@/lib/format';
import { getExplorerTxUrl } from '@/lib/explorer';

type OrderbookEntry = { tick: number; amount: bigint };
type RecentTrade = { price: number; amount: bigint; side: 'buy' | 'sell'; hash: `0x${string}`; block: bigint };
type OrderbookData = { bids: OrderbookEntry[]; asks: OrderbookEntry[]; recentTrades: RecentTrade[] };

export function MultiOrderbooks() {
  const chainId = useChainId();
  const tokens = getTokens(chainId);
  const baseTokens = tokens.filter((token) => token.symbol !== 'pathUSD');
  const quoteToken = tokens.find((token) => token.symbol === 'pathUSD') ?? tokens[0];

  const [data, setData] = useState<Record<string, OrderbookData | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchAll = async () => {
      setLoading(true);
      const entries = await Promise.all(
        baseTokens.map(async (token) => {
          try {
            const response = await fetch(`/api/orderbook?token=${token.address}&depth=5`);
            if (!response.ok) return [token.address, null] as const;
            const payload = (await response.json()) as OrderbookData;
            return [token.address, payload] as const;
          } catch {
            return [token.address, null] as const;
          }
        })
      );
      if (!active) return;
      const next: Record<string, OrderbookData | null> = {};
      for (const [address, payload] of entries) {
        next[address] = payload;
      }
      setData(next);
      setLoading(false);
    };

    fetchAll();
    const interval = setInterval(fetchAll, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [baseTokens]);

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-black/40 p-6 shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-white">All Orderbooks</h3>
          <p className="text-xs text-zinc-500">Read-only snapshots for each token vs {quoteToken.symbol}</p>
        </div>
        <span className="text-xs text-zinc-500">{loading ? 'Refreshing...' : 'Updated'}</span>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {baseTokens.map((token) => {
          const book = data[token.address];
          const bids = book?.bids ?? [];
          const asks = book?.asks ?? [];
          const trades = book?.recentTrades ?? [];
          return (
            <div key={token.address} className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-white">{token.symbol} / {quoteToken.symbol}</span>
                <span className="text-[11px] text-zinc-500">{book ? 'Live' : 'No data'}</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <div className="flex justify-between text-zinc-500 mb-2">
                    <span>Asks</span>
                    <span>Amt</span>
                  </div>
                  {asks.length === 0 ? (
                    <div className="text-zinc-600">No asks</div>
                  ) : (
                    asks.slice(0, 3).map((ask, idx) => (
                      <div key={idx} className="flex justify-between text-red-400">
                        <span>{ask.tick}</span>
                        <span>{formatUnitsFixed(ask.amount, token.decimals)}</span>
                      </div>
                    ))
                  )}
                </div>
                <div>
                  <div className="flex justify-between text-zinc-500 mb-2">
                    <span>Bids</span>
                    <span>Amt</span>
                  </div>
                  {bids.length === 0 ? (
                    <div className="text-zinc-600">No bids</div>
                  ) : (
                    bids.slice(0, 3).map((bid, idx) => (
                      <div key={idx} className="flex justify-between text-green-400">
                        <span>{bid.tick}</span>
                        <span>{formatUnitsFixed(bid.amount, token.decimals)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="mt-3 border-t border-white/10 pt-3 text-xs">
                <div className="flex justify-between text-zinc-500 mb-2">
                  <span>Recent Trades</span>
                  <span>Tx</span>
                </div>
                {trades.length === 0 ? (
                  <div className="text-zinc-600">No recent trades</div>
                ) : (
                  trades.slice(0, 3).map((trade, idx) => (
                    <div key={idx} className="flex justify-between text-zinc-300">
                      <span className={trade.side === 'buy' ? 'text-green-400' : 'text-red-400'}>
                        {trade.side} @ {trade.price}
                      </span>
                      <a
                        href={getExplorerTxUrl(chainId, trade.hash)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 hover:text-blue-300"
                      >
                        {trade.hash.slice(0, 6)}...
                      </a>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
