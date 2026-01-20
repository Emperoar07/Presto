'use client';

import { useAccount, useChainId } from 'wagmi';
import { getTokens, Token } from '@/config/tokens';
import { useReserves } from '@/hooks/useContract';
import { formatUnitsCached } from '@/lib/format';
import { VirtualList } from '@/components/common/VirtualList';

// Helper component for a single pool row
function PoolRow({ tokenA, tokenB }: { tokenA: Token, tokenB: Token }) {
    const { reserveA, reserveB, pairAddress, isLoading } = useReserves(tokenA, tokenB);
    const pairAddressText = pairAddress ? String(pairAddress) : '';

    if (isLoading) {
        return <div className="p-4 animate-pulse bg-white/5 rounded-xl border border-white/5 h-24"></div>;
    }

    if (!reserveA || !reserveB || (reserveA === 0n && reserveB === 0n)) {
        return null; // Don't show empty pools
    }

    return (
        <div className="p-4 bg-black/40 backdrop-blur-md rounded-xl border border-white/10 shadow-lg flex flex-col md:flex-row justify-between items-center gap-4 hover:bg-black/50 transition-colors">
            <div className="flex items-center space-x-4">
                <div className="flex -space-x-2">
                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold border-2 border-black">
                        {tokenA.symbol[0]}
                    </div>
                    <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white text-xs font-bold border-2 border-black">
                        {tokenB.symbol[0]}
                    </div>
                </div>
                <div>
                    <h3 className="font-bold text-lg text-white">{tokenA.symbol} / {tokenB.symbol}</h3>
                    <p className="text-xs text-zinc-500 break-all">{pairAddressText}</p>
                </div>
            </div>

            <div className="flex space-x-8 text-sm">
                <div className="text-right">
                    <p className="text-zinc-400">Reserves</p>
                    <p className="text-white font-mono">{parseFloat(formatUnitsCached(reserveA, tokenA.decimals)).toFixed(2)} {tokenA.symbol}</p>
                    <p className="text-white font-mono">{parseFloat(formatUnitsCached(reserveB, tokenB.decimals)).toFixed(2)} {tokenB.symbol}</p>
                </div>
                <div className="text-right">
                    <p className="text-zinc-400">Price</p>
                    <p className="text-[#00F3FF] font-mono">1 {tokenA.symbol} = {(Number(formatUnitsCached(reserveB, tokenB.decimals)) / Number(formatUnitsCached(reserveA, tokenA.decimals))).toFixed(4)} {tokenB.symbol}</p>
                    <p className="text-[#BC13FE] font-mono">1 {tokenB.symbol} = {(Number(formatUnitsCached(reserveA, tokenA.decimals)) / Number(formatUnitsCached(reserveB, tokenB.decimals))).toFixed(4)} {tokenA.symbol}</p>
                </div>
            </div>
        </div>
    );
}

export function PoolList() {
    const chainId = useChainId();
    const tokens = getTokens(chainId);
    const { isConnected } = useAccount();

    // Generate unique pairs
    const pairs: { tokenA: Token, tokenB: Token }[] = [];
    for (let i = 0; i < tokens.length; i++) {
        for (let j = i + 1; j < tokens.length; j++) {
            pairs.push({ tokenA: tokens[i], tokenB: tokens[j] });
        }
    }

    const rowHeight = 120;
    const listHeight = Math.min(640, pairs.length * rowHeight);

    return (
        <div className="w-full max-w-4xl space-y-4">
            <h2 className="text-2xl font-bold mb-6 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">Active Pools</h2>
            
            {!isConnected ? (
                 <div className="p-8 text-center bg-black/40 backdrop-blur-md border border-white/10 rounded-xl">
                    <p className="text-zinc-400">Connect your wallet to view pools.</p>
                 </div>
            ) : pairs.length === 0 ? (
                <div className="p-8 text-center bg-black/40 backdrop-blur-md border border-white/10 rounded-xl">
                    <p className="text-zinc-400">No tokens configured for this network.</p>
                </div>
            ) : (
                <VirtualList
                    items={pairs}
                    height={listHeight}
                    rowHeight={rowHeight}
                    keyExtractor={(pair) => `${pair.tokenA.address}-${pair.tokenB.address}`}
                    renderRow={(pair) => (
                        <PoolRow tokenA={pair.tokenA} tokenB={pair.tokenB} />
                    )}
                />
            )}
        </div>
    );
}
