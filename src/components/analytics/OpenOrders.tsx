'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAccount, usePublicClient, useWalletClient, useChainId } from 'wagmi';
import { getOpenOrders, cancelOrder } from '@/lib/tempoClient';
import { TxToast } from '@/components/common/TxToast';
import { formatUnitsFixed } from '@/lib/format';
import toast from 'react-hot-toast';
import { getTokens } from '@/config/tokens';
import { VirtualList } from '@/components/common/VirtualList';

interface Order {
    id: bigint;
    token: string;
    amount: bigint;
    type: number;
    tick: number;
}

export const OpenOrders = () => {
    const { address } = useAccount();
    const chainId = useChainId();
    const tokens = getTokens(chainId);
    const publicClient = usePublicClient();
    const { data: walletClient } = useWalletClient();
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(false);
    const [cancelling, setCancelling] = useState<bigint | null>(null);
    const publicChainId = (publicClient as { chain?: { id?: number } } | null)?.chain?.id;
    const walletChainId = (walletClient as { chain?: { id?: number } } | null)?.chain?.id;

    const fetchOrders = useCallback(async () => {
        if (!publicClient || !address) return;
        if (publicChainId && publicChainId !== chainId) return;
        setLoading(true);
        try {
            const data = await getOpenOrders(publicClient, address, chainId);
            if (data && Array.isArray(data)) {
                setOrders([...data].sort((a, b) => Number(b.id - a.id)));
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [publicClient, address]);

    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);

    const handleCancel = async (order: Order) => {
        if (!walletClient || !publicClient || !address) return;
        if (walletChainId && walletChainId !== chainId) {
            toast.error('Wrong network selected');
            return;
        }
        setCancelling(order.id);
        const toastId = toast.loading('Cancelling order...');
        try {
            const hash = await cancelOrder(walletClient, publicClient, address, order.id, chainId);
            toast.custom(() => <TxToast hash={hash} title="Order cancelled" />);
            toast.success('Order cancelled', { id: toastId });
            fetchOrders();
        } catch (error) {
            toast.error('Failed to cancel', { id: toastId });
            console.error(error);
        } finally {
            setCancelling(null);
        }
    };

    const getTokenInfo = (addr: string) => {
        return tokens.find(t => t.address.toLowerCase() === addr.toLowerCase());
    };

    const getOrderType = (type: number) => {
        // type: 0=Buy Limit, 1=Sell Limit, 2=Buy Flip, 3=Sell Flip
        const isSell = (type & 1) === 1;
        const isFlip = (type & 2) === 2;
        return `${isSell ? 'Sell' : 'Buy'} ${isFlip ? '(Flip)' : ''}`;
    };

    const rowHeight = 44;
    const listHeight = Math.min(360, orders.length * rowHeight);
    const displayOrders = useMemo(() => {
        return orders.map((order) => {
            const tokenInfo = getTokenInfo(order.token);
            return {
                order,
                tokenSymbol: tokenInfo ? tokenInfo.symbol : order.token.slice(0, 6),
                amountDisplay: tokenInfo ? formatUnitsFixed(order.amount, tokenInfo.decimals) : order.amount.toString(),
                typeLabel: getOrderType(order.type),
                isSell: (order.type & 1) === 1,
            };
        });
    }, [orders, tokens]);

    return (
        <div className="w-full max-w-4xl p-6 rounded-2xl shadow-2xl border border-white/10 bg-black/40 backdrop-blur-md mt-6">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-white">Open Orders</h2>
                <button 
                    onClick={fetchOrders}
                    className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-sm"
                >
                    Refresh
                </button>
            </div>

            {loading && orders.length === 0 ? (
                <div className="text-zinc-400">Loading...</div>
            ) : orders.length === 0 ? (
                <div className="text-zinc-400">No open orders</div>
            ) : (
                <div>
                    <div className="grid grid-cols-5 gap-2 px-4 py-2 text-zinc-500 uppercase font-bold text-xs">
                        <span>Token</span>
                        <span>Type</span>
                        <span>Tick</span>
                        <span>Amount</span>
                        <span>Action</span>
                    </div>
                    <div className="border-t border-white/5">
                        <VirtualList
                            items={displayOrders}
                            height={listHeight}
                            rowHeight={rowHeight}
                            keyExtractor={(item) => item.order.id.toString()}
                            renderRow={(item) => {
                                const order = item.order;
                                return (
                                    <div className="grid grid-cols-5 gap-2 px-4 py-2 text-sm text-zinc-300 items-center hover:bg-white/5">
                                        <span className="font-medium text-white">
                                            {item.tokenSymbol}
                                        </span>
                                        <span>
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${
                                                item.isSell ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'
                                            }`}>
                                                {item.typeLabel}
                                            </span>
                                        </span>
                                        <span>{order.tick}</span>
                                        <span className="font-mono">
                                            {item.amountDisplay}
                                        </span>
                                        <span>
                                            <button
                                                onClick={() => handleCancel(order)}
                                                disabled={!!cancelling}
                                                className="text-red-400 hover:text-red-300 disabled:opacity-50 font-bold"
                                            >
                                                {cancelling === order.id ? '...' : 'Cancel'}
                                            </button>
                                        </span>
                                    </div>
                                );
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
