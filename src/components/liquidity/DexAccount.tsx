'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi';
import { getTokens, Token } from '@/config/tokens';
import { getDexBalancesBatch, withdrawDexBalance } from '@/lib/tempoClient';
import { TxToast } from '@/components/common/TxToast';
import { formatUnits } from 'viem';
import toast from 'react-hot-toast';

export function DexAccount({ className }: { className?: string }) {
    const chainId = useChainId();
    const tokens = getTokens(chainId);
    const { address } = useAccount();
    const publicClient = usePublicClient();
    const { data: walletClient } = useWalletClient();
    
    const [balances, setBalances] = useState<Record<string, { raw: bigint; formatted: string }>>({});
    const [loading, setLoading] = useState(false);
    const [withdrawing, setWithdrawing] = useState<string | null>(null);

    const fetchBalances = useCallback(async () => {
        if (!publicClient || !address) return;
        setLoading(true);
        const newBalances: Record<string, { raw: bigint; formatted: string }> = {};
        
        try {
            const results = await getDexBalancesBatch(
                publicClient,
                address,
                tokens.map((token) => ({ address: token.address, decimals: token.decimals })),
                chainId
            );
            tokens.forEach((token) => {
                const entry = results[token.address];
                const raw = entry?.raw ?? 0n;
                newBalances[token.address] = {
                    raw,
                    formatted: entry?.formatted ?? formatUnits(raw, token.decimals),
                };
            });
            setBalances(newBalances);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [publicClient, address, tokens, chainId]);

    useEffect(() => {
        fetchBalances();
    }, [fetchBalances]); // Fetch on mount and changes

    const handleWithdraw = async (token: Token) => {
        if (!walletClient || !address || !publicClient) return;
        
        const balanceEntry = balances[token.address];
        if (!balanceEntry || balanceEntry.raw === 0n) return;

        setWithdrawing(token.address);
        const toastId = toast.loading(`Claiming ${token.symbol}...`);

        try {
            // Withdraw full balance
            const hash = await withdrawDexBalance(walletClient, publicClient, address, token.address, balanceEntry.raw, chainId);
            toast.custom(() => <TxToast hash={hash} title="DEX withdrawal submitted" />);
            toast.success("Success!", { id: toastId });
            fetchBalances(); // Refresh
        } catch (e) {
            console.error(e);
            const msg = e instanceof Error ? e.message : 'Unknown error';
            toast.error("Failed: " + msg, { id: toastId });
        } finally {
            setWithdrawing(null);
        }
    };

    const hasFunds = Object.values(balances).some(b => b.raw > 0n);

    if (!address) return null;

    return (
        <div className={`w-full p-6 rounded-2xl shadow-2xl border border-white/10 bg-black/40 backdrop-blur-md ${className ?? 'max-w-md mt-6'}`}>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white">Unclaimed DEX Earnings</h3>
                <button 
                    onClick={fetchBalances}
                    className="text-xs text-zinc-500 hover:text-white transition-colors"
                >
                    Refresh
                </button>
            </div>
            
            {loading && Object.keys(balances).length === 0 ? (
                <div className="text-zinc-500 text-sm text-center py-4">Loading balances...</div>
            ) : !hasFunds ? (
                <div className="text-zinc-500 text-sm text-center py-4">No unclaimed funds.</div>
            ) : (
                <div className="space-y-3">
                    {tokens.map(token => {
                        const entry = balances[token.address];
                        if (!entry || entry.raw === 0n) return null;
                        
                        return (
                            <div key={token.address} className="flex justify-between items-center bg-black/20 p-3 rounded-lg border border-white/5">
                                <div className="flex items-center gap-2">
                                    <span className="text-zinc-200 font-medium">{token.symbol}</span>
                                    <span className="text-zinc-400 text-sm">{Number(entry.formatted).toFixed(4)}</span>
                                </div>
                                <button
                                    onClick={() => handleWithdraw(token)}
                                    disabled={withdrawing === token.address}
                                    className="px-3 py-1 bg-[#00F3FF]/10 text-[#00F3FF] border border-[#00F3FF]/30 rounded-md text-xs hover:bg-[#00F3FF]/20 transition-all disabled:opacity-50"
                                >
                                    {withdrawing === token.address ? 'Claiming...' : 'Claim / Withdraw'}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
