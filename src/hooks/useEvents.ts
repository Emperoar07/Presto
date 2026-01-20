import { useState, useEffect, useRef } from 'react';
import { usePublicClient } from 'wagmi';
import { parseAbiItem } from 'viem';
import { Token } from '@/config/tokens';
import { formatUnitsCached } from '@/lib/format';

export interface Trade {
    hash: string;
    blockNumber: bigint;
    type: 'Buy' | 'Sell';
    amountIn: string;
    amountOut: string;
    price: string;
    timestamp?: number;
}

export function usePairEvents(pairAddress: `0x${string}`, tokenA: Token, tokenB: Token) {
    const publicClient = usePublicClient();
    const [trades, setTrades] = useState<Trade[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const lastBlockRef = useRef<bigint | null>(null);
    const seenRef = useRef<Set<string>>(new Set());
    const workerRef = useRef<Worker | null>(null);
    const rafRef = useRef<number | null>(null);
    const pendingRef = useRef<Trade[]>([]);
    const lastUpdateRef = useRef<number>(0);

    useEffect(() => {
        if (!pairAddress || !publicClient || !tokenA || !tokenB) return;

        const scheduleTrades = (nextTrades: Trade[]) => {
            const now = Date.now();
            if (now - lastUpdateRef.current < 250) return;
            lastUpdateRef.current = now;
            pendingRef.current = [...nextTrades, ...pendingRef.current];
            if (rafRef.current !== null) return;
            rafRef.current = requestAnimationFrame(() => {
                setTrades((prev) => {
                    const merged = [...pendingRef.current.reverse(), ...prev];
                    pendingRef.current = [];
                    return merged.slice(0, 200);
                });
                rafRef.current = null;
            });
        };

        const fetchLogs = async () => {
            setIsLoading(true);
            try {
                const latestBlock = await publicClient.getBlockNumber();
                const maxRange = 10000n;
                const toBlock = latestBlock;
                const fromBlock =
                    lastBlockRef.current !== null
                        ? lastBlockRef.current + 1n
                        : latestBlock > (maxRange - 1n)
                            ? latestBlock - (maxRange - 1n)
                            : 0n;

                // Event Signature: event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)
                // Note: We need to handle the case where tokens might be flipped in the pair relative to our tokenA/tokenB
                // But typically we assume standard ordering or check token0/token1. 
                // For simplicity here, we'll assume the Pair logic matches the order or we'll decipher it.
                // Actually, to be precise, we should know which is token0.
                
                // Let's just fetch and format raw for now.
                const logs = await publicClient.getLogs({
                    address: pairAddress,
                    event: parseAbiItem('event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)'),
                    fromBlock,
                    toBlock
                });

                // We also need timestamps, but getting block details for every log is heavy.
                // We'll skip timestamps for the list or just use block number for now.

                const filteredLogs = logs
                    .filter((log) => {
                        const hash = log.transactionHash;
                        if (seenRef.current.has(hash)) return false;
                        seenRef.current.add(hash);
                        return true;
                    });

                lastBlockRef.current = latestBlock;
                if (seenRef.current.size > 5000) {
                    seenRef.current.clear();
                }

                if (filteredLogs.length > 0) {
                    const applyTrades = (formattedTrades: Trade[]) => {
                        if (formattedTrades.length === 0) return;
                        scheduleTrades(formattedTrades.reverse());
                    };

                    if (!workerRef.current && typeof Worker !== 'undefined') {
                        workerRef.current = new Worker(new URL('../workers/tradeParser.ts', import.meta.url), { type: 'module' });
                        workerRef.current.onmessage = (message) => applyTrades(message.data as Trade[]);
                    }

                    if (workerRef.current) {
                        workerRef.current.postMessage({
                            logs: filteredLogs,
                            tokenA: { address: tokenA.address, decimals: tokenA.decimals },
                            tokenB: { address: tokenB.address, decimals: tokenB.decimals },
                        });
                    } else {
                        const formattedTrades = filteredLogs.map(log => {
                            const { amount0In, amount1In, amount0Out, amount1Out } = log.args;
                            const sorted = tokenA.address.toLowerCase() < tokenB.address.toLowerCase();
                            const token0 = sorted ? tokenA : tokenB;
                            const token1 = sorted ? tokenB : tokenA;

                            let type: 'Buy' | 'Sell' = 'Buy';
                            let amountInVal = 0n;
                            let amountOutVal = 0n;

                            if (amount0In && amount0In > 0n) {
                                type = sorted ? 'Sell' : 'Buy';
                                amountInVal = amount0In;
                                amountOutVal = amount1Out || 0n;
                            } else {
                                type = sorted ? 'Buy' : 'Sell';
                                amountInVal = amount1In || 0n;
                                amountOutVal = amount0Out || 0n;
                            }

                            const formattedAmountIn = formatUnitsCached(amountInVal, sorted ? token0.decimals : token1.decimals);
                            const formattedAmountOut = formatUnitsCached(amountOutVal, sorted ? token1.decimals : token0.decimals);

                            const numIn = Number(formattedAmountIn);
                            const numOut = Number(formattedAmountOut);

                            let displayPrice = '0';
                            if (numIn > 0 && numOut > 0) {
                                displayPrice = type === 'Buy' ? (numIn / numOut).toFixed(6) : (numOut / numIn).toFixed(6);
                            }

                            return {
                                hash: log.transactionHash,
                                blockNumber: log.blockNumber,
                                type,
                                amountIn: type === 'Buy' ? formatUnitsCached(amountInVal, token1.decimals) : formatUnitsCached(amountInVal, token0.decimals),
                                amountOut: type === 'Buy' ? formatUnitsCached(amountOutVal, token0.decimals) : formatUnitsCached(amountOutVal, token1.decimals),
                                price: displayPrice
                            };
                        });
                        applyTrades(formattedTrades);
                    }
                }
            } catch (error) {
                console.error("Failed to fetch logs:", error);
            } finally {
                setIsLoading(false);
            }
        };

        let eventSource: EventSource | null = null;
        const startPolling = () => {
            fetchLogs();
            return setInterval(fetchLogs, 10000);
        };

        let interval: ReturnType<typeof setInterval> | null = startPolling();

        try {
            eventSource = new EventSource(
                `/api/trades/stream?pair=${pairAddress}&tokenA=${tokenA.address}&tokenB=${tokenB.address}&decimalsA=${tokenA.decimals}&decimalsB=${tokenB.decimals}`
            );
            eventSource.onopen = () => {
                if (interval) {
                    clearInterval(interval);
                    interval = null;
                }
            };
            eventSource.onmessage = (event) => {
                const data = JSON.parse(event.data) as Trade[];
                if (data.length > 0) {
                    scheduleTrades(data.reverse());
                }
            };
            eventSource.onerror = () => {
                if (eventSource) {
                    eventSource.close();
                    eventSource = null;
                }
                if (!interval) {
                    interval = startPolling();
                }
            };
        } catch (error) {
            console.error("Failed to start trade stream:", error);
        }

        return () => {
            if (eventSource) eventSource.close();
            if (interval) clearInterval(interval);
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
            }
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };

    }, [pairAddress, publicClient, tokenA, tokenB]);

    return { trades, isLoading };
}
