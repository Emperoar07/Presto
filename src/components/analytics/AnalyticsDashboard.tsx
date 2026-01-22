'use client';

import { useEffect, useMemo, useState } from 'react';
import { TokenModal } from '../common/TokenModal';
import { Orderbook } from '../liquidity/Orderbook';
import { Token, getTokens } from '@/config/tokens';
import { useChainId } from 'wagmi';
import { formatUnitsFixed } from '@/lib/format';
import { Hooks } from '@/lib/tempo';

type Trade = { price: number; amount: bigint; side: 'buy' | 'sell'; hash: `0x${string}`; block: bigint };

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
      data: { recentTrades: Trade[] } | null;
      isLoading: boolean;
      status: 'live' | 'slow' | 'retrying';
      pollingMs: number;
      lastUpdated: number | null;
      error: string | null;
    };

  const snapshotStats = useMemo(() => {
    const trades = (orderbookHook.data?.recentTrades ?? []) as Trade[];
    if (!trades || trades.length === 0) return { volume: '0.0000', count: 0, updatedAt: null as number | null };
    let volume = 0n;
    for (const trade of trades) volume += trade.amount;
    return {
      volume: formatUnitsFixed(volume, selectedToken.decimals),
      count: trades.length,
      updatedAt: null as number | null,
    };
  }, [orderbookHook.data, selectedToken]);

  return (
    <div className="w-full max-w-2xl p-6 rounded-2xl shadow-2xl border border-white/10 bg-black/40 backdrop-blur-md mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-white">Market Analytics</h2>
        
        <button 
            onClick={() => setIsTokenModalOpen(true)}
            className="flex items-center space-x-2 bg-black/20 hover:bg-black/40 border border-white/10 px-4 py-2 rounded-full transition-all"
        >
            <span className="font-semibold text-white">{selectedToken.symbol}</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400"><path d="m6 9 6 6 6-6"/></svg>
        </button>
      </div>

      <div className="bg-black/20 border border-white/5 p-4 rounded-xl mb-6">
          <div className="flex justify-between items-center">
             <div>
                <p className="text-sm text-zinc-400">Token Contract</p>
                <p className="font-mono text-xs text-[#00F3FF] break-all">{selectedToken.address}</p>
             </div>
             <div className="text-right">
                <p className="text-sm text-zinc-400">Decimals</p>
                <p className="font-mono text-sm text-white">{selectedToken.decimals}</p>
             </div>
          </div>
      </div>

      <div className="bg-black/20 border border-white/5 p-4 rounded-xl mb-6">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-zinc-400">Recent Volume</p>
            <p className="text-lg font-semibold text-white">{snapshotStats.volume}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-zinc-400">Recent Trades</p>
            <p className="text-lg font-semibold text-white">{snapshotStats.count}</p>
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
