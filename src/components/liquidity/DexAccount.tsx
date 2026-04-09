'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi';
import { getTokens, Token } from '@/config/tokens';
import { getDexBalancesBatch, withdrawDexBalance } from '@/lib/tempoClient';
import { TxToast } from '@/components/common/TxToast';
import { formatUnits } from 'viem';
import toast from 'react-hot-toast';
import { isUserCancellation } from '@/lib/errorHandling';

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
            if (!isUserCancellation(e)) {
                const msg = e instanceof Error ? e.message : 'Unknown error';
                toast.error("Failed: " + msg, { id: toastId });
            } else {
                toast.dismiss(toastId);
            }
        } finally {
            setWithdrawing(null);
        }
    };

    const hasFunds = Object.values(balances).some(b => b.raw > 0n);

    if (!address) return null;

    const wrapperClassName = className ?? 'max-w-md mt-6';
    const isEmbedded = !!className;

    return (
        <div className={`w-full rounded-[12px] p-4 ${wrapperClassName}`} style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex justify-between items-center mb-4">
                <div>
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">DEX Earnings</p>
                    <h3 className="text-[15px] font-extrabold text-slate-100">Unclaimed balances</h3>
                </div>
                <button
                    onClick={fetchBalances}
                    className="rounded-full px-2.5 py-1 text-[11px] font-bold text-[#25c0f4] transition-colors"
                    style={{ border: '1px solid rgba(37,192,244,0.2)', background: 'rgba(37,192,244,0.08)' }}
                >
                    Refresh
                </button>
            </div>

            {loading && Object.keys(balances).length === 0 ? (
                <div className="text-slate-500 text-[13px] text-center py-4">Loading balances...</div>
            ) : !hasFunds ? (
                <div className="text-slate-500 text-[13px] text-center py-4">No unclaimed funds.</div>
            ) : (
                <div className="space-y-3">
                    {tokens.map(token => {
                        const entry = balances[token.address];
                        if (!entry || entry.raw === 0n) return null;

                        return (
                            <div key={token.address} className="flex justify-between items-center rounded-[10px] p-3" style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.07)' }}>
                                <div className="flex items-center gap-2">
                                    <span className="text-slate-100 text-[13px] font-medium">{token.symbol}</span>
                                    <span className="text-slate-500 text-[12px]">{Number(entry.formatted).toFixed(4)}</span>
                                </div>
                                <button
                                    onClick={() => handleWithdraw(token)}
                                    disabled={withdrawing === token.address}
                                    className="rounded-full px-3 py-1 text-[11px] font-bold text-[#25c0f4] transition-all disabled:opacity-50"
                                    style={{ border: '1px solid rgba(37,192,244,0.2)', background: 'rgba(37,192,244,0.08)' }}
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
