'use client';

import { useChainId } from 'wagmi';
import { usePairEvents } from '@/hooks/useEvents';
import { Token } from '@/config/tokens';
import { VirtualList } from '@/components/common/VirtualList';
import { getExplorerTxUrl } from '@/lib/explorer';

interface RecentTradesProps {
    pairAddress: `0x${string}`;
    tokenA: Token;
    tokenB: Token;
}

export function RecentTrades({ pairAddress, tokenA, tokenB }: RecentTradesProps) {
    const chainId = useChainId();
    const { trades, isLoading } = usePairEvents(pairAddress, tokenA, tokenB);
    const rowHeight = 44;
    const listHeight = Math.min(360, trades.length * rowHeight);

    if (isLoading && trades.length === 0) {
        return <div className="p-6 text-center text-zinc-500">Loading trades...</div>;
    }

    if (trades.length === 0) {
        return <div className="p-6 text-center text-zinc-500">No trades yet.</div>;
    }

    return (
        <div>
            <div className="grid grid-cols-5 gap-2 px-4 py-3 text-xs text-zinc-500 uppercase bg-zinc-50 dark:bg-zinc-900/50">
                <span>Type</span>
                <span>Price ({tokenB.symbol})</span>
                <span>Amount ({tokenA.symbol})</span>
                <span>Total ({tokenB.symbol})</span>
                <span>Tx</span>
            </div>
            <VirtualList
                items={trades}
                height={listHeight}
                rowHeight={rowHeight}
                keyExtractor={(trade) => `${trade.hash}-${trade.blockNumber}`}
                renderRow={(trade) => (
                    <div className="grid grid-cols-5 gap-2 px-4 py-3 text-sm border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                        <span className={`font-medium ${trade.type === 'Buy' ? 'text-green-500' : 'text-red-500'}`}>
                            {trade.type}
                        </span>
                        <span>{trade.price}</span>
                        <span>{trade.amountOut}</span>
                        <span>{trade.amountIn}</span>
                        <span>
                            <a 
                                href={getExplorerTxUrl(chainId, trade.hash)} 
                                target="_blank" 
                                rel="noreferrer"
                                className="text-blue-500 hover:underline"
                            >
                                View
                            </a>
                        </span>
                    </div>
                )}
            />
        </div>
    );
}
