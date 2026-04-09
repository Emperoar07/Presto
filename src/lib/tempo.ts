import { useReadContract, useReadContracts, useWriteContract, useWatchContractEvent, usePublicClient, useChainId } from 'wagmi';
import { encodeFunctionData, parseAbi } from 'viem';
import { useState, useEffect } from 'react';
import { getContractAddresses, HUB_AMM_ABI, isTempoNativeChain, ZERO_ADDRESS } from '@/config/contracts';

// --- Configuration ---

// Tempo Native DEX precompile (Tempo testnet)
export const TEMPO_DEX_ADDRESS = '0xdec0000000000000000000000000000000000000';
const TEMPO_PRECOMPILE_DEX_ADDRESS = '0xdec0000000000000000000000000000000000000';
const FEE_MANAGER_ADDRESS = '0xfeec000000000000000000000000000000000000';
const getDexAddressForChain = (chainId?: number) => (chainId === 42431 ? TEMPO_PRECOMPILE_DEX_ADDRESS : TEMPO_DEX_ADDRESS);
const getFeeManagerAddressForChain = (chainId?: number) => (chainId === 42431 ? FEE_MANAGER_ADDRESS : TEMPO_DEX_ADDRESS);

export const Addresses = {
    stablecoinDex: TEMPO_DEX_ADDRESS,
};

// --- ABIs ---

const DEX_ABI = parseAbi([
    // Structs
    'struct Order { int24 tick; uint256 amount; }',
    // Swap
    'function swapExactAmountIn(address tokenIn, address tokenOut, uint128 amountIn, uint128 minAmountOut) external returns (uint128 amountOut)',
    'function swapExactAmountOut(address tokenIn, address tokenOut, uint256 amountOut, uint256 maxAmountIn) external returns (uint256 amountIn)',
    'function quoteSwapExactAmountIn(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256)',
    'function quoteSwapExactAmountOut(address tokenIn, address tokenOut, uint256 amountOut) external view returns (uint256)',
    // DEX Balance
    'function balanceOf(address user, address token) external view returns (uint256)',
    'function withdraw(address token, uint128 amount) external',
    // Orderbook / Liquidity
    'function place(address token, uint128 amount, uint8 type, int24 tick) external',
    // Fee Liquidity (AMM)
    'function addLiquidity(address userToken, address validatorToken, uint128 validatorTokenAmount) external',
    'function removeLiquidity(address userToken, address validatorToken, uint256 liquidityAmount) external',
    'function getPool(address userToken, address validatorToken) external view returns (uint256 reserveUserToken, uint256 reserveValidatorToken)',
    'function liquidityOf(address userToken, address validatorToken, address provider) external view returns (uint256)',
    'function balanceOf(address account) external view returns (uint256)', // For LP tokens?
    // Orderbook View
    'function getOrderbook(address token, uint8 depth) external view returns (Order[] bids, Order[] asks)',
    // Events
    'event FeeSwap(address indexed userToken, address indexed validatorToken, uint256 amountIn, uint256 amountOut)',
    'event OrderPlaced(uint256 indexed orderId, int24 tick, bool isBid, uint256 amount, address maker, address indexed token, bool isFlipOrder, int24 flipTick)',
    'event OrderFilled(uint256 indexed orderId, uint256 amountFilled, bool partialFill)',
    'event OrderCancelled(uint256 indexed orderId)',
    // Rebalance
    'function rebalance(address userToken, address validatorToken, uint256 amountOut) external'
]);

const FEE_AMM_ABI = parseAbi([
    'function getPool(address userToken, address validatorToken) external view returns (uint128 reserveUserToken, uint128 reserveValidatorToken)',
    'function mint(address userToken, address validatorToken, uint256 amountValidatorToken, address to) external returns (uint256 liquidity)',
    'function mint(address userToken, address validatorToken, uint256 amountUserToken, uint256 amountValidatorToken, address to) external returns (uint256 liquidity)',
    'function burn(address userToken, address validatorToken, uint256 liquidity, address to) external returns (uint256 amountUserToken, uint256 amountValidatorToken)',
    'function rebalanceSwap(address userToken, address validatorToken, uint256 amountOut, address to) external returns (uint256 amountIn)',
    'function liquidityOf(address userToken, address validatorToken, address provider) external view returns (uint256)',
    'event FeeSwap(address indexed userToken, address indexed validatorToken, uint256 amountIn, uint256 amountOut)'
]);

const ERC20_ABI = parseAbi([
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function allowance(address owner, address spender) external view returns (uint256)'
]);

// --- Actions (Viem/Call Data Generators) ---

export const Actions = {
    token: {
        approve: {
            call: ({ spender, amount, token }: { spender: `0x${string}`; amount: bigint; token: `0x${string}` }) => {
                return {
                    to: token,
                    data: encodeFunctionData({
                        abi: ERC20_ABI,
                        functionName: 'approve',
                        args: [spender, amount],
                    }),
                    value: 0n,
                };
            },
        },
    },
    dex: {
        swapExactAmountIn: {
            call: ({ amountIn, minAmountOut, tokenIn, tokenOut, chainId }: { amountIn: bigint; minAmountOut: bigint; tokenIn: `0x${string}`; tokenOut: `0x${string}`; chainId?: number }) => {
                const isNative = tokenIn === '0x0000000000000000000000000000000000000000';
                const dexAddress = getDexAddressForChain(chainId ?? 42431);
                return {
                    to: dexAddress,
                    data: encodeFunctionData({
                        abi: DEX_ABI,
                        functionName: 'swapExactAmountIn',
                        args: [tokenIn, tokenOut, BigInt.asUintN(128, amountIn), BigInt.asUintN(128, minAmountOut)],
                    }),
                    value: isNative ? amountIn : 0n,
                };
            },
        },
        swapExactAmountOut: {
            call: ({ amountOut, maxAmountIn, tokenIn, tokenOut, chainId }: { amountOut: bigint; maxAmountIn: bigint; tokenIn: `0x${string}`; tokenOut: `0x${string}`; chainId?: number }) => {
                const isNative = tokenIn === '0x0000000000000000000000000000000000000000';
                const dexAddress = getDexAddressForChain(chainId ?? 42431);
                return {
                    to: dexAddress,
                    data: encodeFunctionData({
                        abi: DEX_ABI,
                        functionName: 'swapExactAmountOut',
                        args: [tokenIn, tokenOut, amountOut, maxAmountIn],
                    }),
                    value: isNative ? maxAmountIn : 0n,
                };
            },
        },
        withdraw: {
            call: ({ token, amount, chainId }: { token: `0x${string}`; amount: bigint; chainId?: number }) => {
                const dexAddress = getDexAddressForChain(chainId ?? 42431);
                return {
                    to: dexAddress,
                    data: encodeFunctionData({
                        abi: DEX_ABI,
                        functionName: 'withdraw',
                        args: [token, BigInt.asUintN(128, amount)],
                    }),
                    value: 0n,
                };
            },
        },
        place: {
            call: ({ token, amount, type, tick, chainId }: { token: `0x${string}`; amount: bigint; type: 'buy' | 'sell'; tick: number; chainId?: number }) => {
                // Map 'buy'/'sell' to uint8 (e.g., 0=buy, 1=sell)
                const typeInt = type === 'buy' ? 0 : 1;
                const dexAddress = getDexAddressForChain(chainId ?? 42431);
                return {
                    to: dexAddress,
                    data: encodeFunctionData({
                        abi: DEX_ABI,
                        functionName: 'place',
                        args: [token, BigInt.asUintN(128, amount), typeInt, tick],
                    }),
                    value: 0n,
                };
            },
        },
    },
    amm: {
        addLiquidity: {
            call: ({ userToken, validatorToken, amount, chainId }: { userToken: `0x${string}`; validatorToken: `0x${string}`; amount: bigint; chainId?: number }) => {
                const dexAddress = getDexAddressForChain(chainId ?? 42431);
                return {
                    to: dexAddress,
                    data: encodeFunctionData({
                        abi: DEX_ABI,
                        functionName: 'addLiquidity',
                        args: [userToken, validatorToken, BigInt.asUintN(128, amount)],
                    }),
                    value: 0n,
                };
            },
        },
        removeLiquidity: {
             call: ({ userToken, validatorToken, amount, chainId }: { userToken: `0x${string}`; validatorToken: `0x${string}`; amount: bigint; chainId?: number }) => {
                const dexAddress = getDexAddressForChain(chainId ?? 42431);
                return {
                    to: dexAddress,
                    data: encodeFunctionData({
                        abi: DEX_ABI,
                        functionName: 'removeLiquidity',
                        args: [userToken, validatorToken, amount],
                    }),
                    value: 0n,
                };
            },
        }
    }
};

// --- Hooks (Wagmi Wrappers) ---

export const Hooks = {
    token: {
        useAllowance: ({ token, owner, spender }: { token: `0x${string}`; owner: `0x${string}`; spender: `0x${string}` }) => {
            return useReadContract({
                address: token,
                abi: ERC20_ABI,
                functionName: 'allowance',
                args: [owner, spender],
                query: {
                    enabled: !!token && !!owner && !!spender && token !== '0x0000000000000000000000000000000000000000',
                }
            });
        }
    },
    dex: {
        useQuoteSwapExactAmountIn: ({ tokenIn, tokenOut, amountIn }: { tokenIn: `0x${string}`; tokenOut: `0x${string}`; amountIn: bigint }) => {
            const chainId = useChainId();
            return useReadContract({
                address: getDexAddressForChain(chainId) as `0x${string}`,
                abi: DEX_ABI,
                functionName: 'quoteSwapExactAmountIn',
                args: [tokenIn, tokenOut, amountIn],
                query: {
                    enabled: !!tokenIn && !!tokenOut && amountIn > 0n,
                }
            });
        },
        useQuoteSwapExactAmountOut: ({ tokenIn, tokenOut, amountOut }: { tokenIn: `0x${string}`; tokenOut: `0x${string}`; amountOut: bigint }) => {
            const chainId = useChainId();
            return useReadContract({
                address: getDexAddressForChain(chainId) as `0x${string}`,
                abi: DEX_ABI,
                functionName: 'quoteSwapExactAmountOut',
                args: [tokenIn, tokenOut, amountOut],
                query: {
                    enabled: !!tokenIn && !!tokenOut && amountOut > 0n,
                }
            });
        },
        useDexBalance: ({ user, token }: { user: `0x${string}`; token: `0x${string}` }) => {
            const chainId = useChainId();
            return useReadContract({
                address: getDexAddressForChain(chainId) as `0x${string}`,
                abi: DEX_ABI,
                functionName: 'balanceOf',
                args: [user, token],
                query: {
                    enabled: !!user && !!token,
                }
            });
        },
        /**
         * Fetch orderbook data via API route (uses event-based indexing)
         * The direct contract call to getOrderbook() doesn't work on all DEX versions,
         * so we use the API which indexes OrderPlaced/OrderFilled/OrderCancelled events.
         */
        useOrderbook: ({ token, depth }: { token: `0x${string}`; depth: number }) => {
             const chainId = useChainId();
             type OrderbookEntry = { tick: number; amount: bigint };
             type RecentTrade = { price: number; amount: bigint; side: 'buy' | 'sell'; hash: `0x${string}`; block: bigint };
             type CancelledOrder = { orderId: string; price: number; amount: bigint; isBid: boolean; hash: `0x${string}`; block: bigint };

             const [data, setData] = useState<{
                 bids: OrderbookEntry[];
                 asks: OrderbookEntry[];
                 recentTrades: RecentTrade[];
                 cancelledOrders: CancelledOrder[];
             } | null>(null);
             const [isLoading, setIsLoading] = useState(false);
             const [error, setError] = useState<string | null>(null);
             const [pollingMs, setPollingMs] = useState(4000);
             const [status, setStatus] = useState<'live' | 'slow' | 'retrying'>('live');
             const [lastUpdated, setLastUpdated] = useState<number | null>(null);

             useEffect(() => {
                 if (!token) return;
                 if (chainId !== 42431) {
                     setError('Orderbook is only available on Tempo testnet');
                     setStatus('retrying');
                     setIsLoading(false);
                     return;
                 }
                 let mounted = true;
                 let timer: ReturnType<typeof setTimeout> | null = null;
                 const safeDepth = Math.max(1, Math.min(depth, 50));
                 const basePollMs = 4000;
                 const idlePollMs = 12000;
                 const maxPollMs = 30000;

                 const fetchOrderbook = async (nextDelay?: number) => {
                     if (!mounted) return;
                     if (nextDelay !== undefined) {
                        if (timer) clearTimeout(timer);
                        timer = setTimeout(fetchOrderbook, nextDelay);
                        return;
                     }

                     setIsLoading(true);
                     try {
                         const controller = new AbortController();
                         const timeout = setTimeout(() => controller.abort(), 8000);
                         const response = await fetch(
                             `/api/orderbook?token=${token}&depth=${safeDepth}&chainId=${chainId}`,
                             { signal: controller.signal }
                         );
                         clearTimeout(timeout);

                         if (!response.ok) {
                             throw new Error(`API error: ${response.status}`);
                         }

                         const result = await response.json();

                         if (!mounted) return;

                         // Convert amounts from string to bigint (JSON doesn't support bigint)
                         const bids: OrderbookEntry[] = (result.bids || []).map((order: { tick: number; amount: string }) => ({
                             tick: order.tick,
                             amount: BigInt(order.amount)
                         }));

                         const asks: OrderbookEntry[] = (result.asks || []).map((order: { tick: number; amount: string }) => ({
                             tick: order.tick,
                             amount: BigInt(order.amount)
                         }));

                         const recentTrades: RecentTrade[] = (result.recentTrades || []).map((trade: { price: number; amount: string; side: 'buy' | 'sell'; hash: `0x${string}`; block: string }) => ({
                             price: trade.price,
                             amount: BigInt(trade.amount),
                             side: trade.side,
                             hash: trade.hash,
                             block: BigInt(trade.block)
                         }));

                         const cancelledOrders: CancelledOrder[] = (result.cancelledOrders || []).map((order: { orderId: string; price: number; amount: string; isBid: boolean; hash: `0x${string}`; block: string }) => ({
                             orderId: order.orderId,
                             price: order.price,
                             amount: BigInt(order.amount),
                             isBid: order.isBid,
                             hash: order.hash,
                             block: BigInt(order.block)
                         }));

                         setData({
                             bids,
                             asks,
                             recentTrades,
                             cancelledOrders
                         });
                         setError(null);
                         setLastUpdated(Date.now());

                         const hasData = bids.length + asks.length + recentTrades.length + cancelledOrders.length > 0;
                         const isVisible = typeof document === 'undefined' ? true : document.visibilityState === 'visible';
                         const nextPoll = isVisible ? (hasData ? basePollMs : idlePollMs) : Math.max(idlePollMs, basePollMs * 2);
                         setPollingMs(nextPoll);
                         setStatus(nextPoll > basePollMs ? 'slow' : 'live');
                         fetchOrderbook(nextPoll);
                     } catch (e) {
                         if (!mounted) return;
                         if (e instanceof DOMException && e.name === 'AbortError') {
                             // Abort is expected on slow networks; don't spam console.
                             const nextPoll = Math.min(maxPollMs, Math.max(pollingMs * 2, idlePollMs));
                             setPollingMs(nextPoll);
                             setStatus('retrying');
                             fetchOrderbook(nextPoll);
                             return;
                         }
                         const message = e instanceof Error ? e.message : 'Failed to fetch orderbook';
                         console.error('Error fetching orderbook:', e);
                         setError(message);
                         setStatus('retrying');
                         const nextPoll = Math.min(maxPollMs, Math.max(pollingMs * 2, idlePollMs));
                         setPollingMs(nextPoll);
                         fetchOrderbook(nextPoll);
                     } finally {
                         if (mounted) {
                             setIsLoading(false);
                         }
                     }
                 };

                 fetchOrderbook();
                 return () => {
                     mounted = false;
                     if (timer) clearTimeout(timer);
                 };
            }, [token, depth, chainId, pollingMs]);

             return { data, isLoading, error, status, pollingMs, lastUpdated };
        }
    },
    amm: {
        usePool: ({ userToken, validatorToken }: { userToken: `0x${string}`; validatorToken: `0x${string}` }) => {
            const chainId = useChainId();
            const isTempoChain = isTempoNativeChain(chainId);
            const arcHubAddress = getContractAddresses(chainId).HUB_AMM_ADDRESS;

            const tempoPool = useReadContract({
                address: getFeeManagerAddressForChain(chainId),
                abi: FEE_AMM_ABI,
                functionName: 'getPool',
                args: [userToken, validatorToken],
                query: {
                    enabled: isTempoChain && !!userToken && !!validatorToken,
                }
            });

            const arcPool = useReadContracts({
                contracts: [
                    {
                        address: arcHubAddress,
                        abi: HUB_AMM_ABI,
                        functionName: 'tokenReserves',
                        args: [userToken],
                    },
                    {
                        address: arcHubAddress,
                        abi: HUB_AMM_ABI,
                        functionName: 'pathReserves',
                        args: [userToken],
                    },
                ],
                query: {
                    enabled: !isTempoChain && arcHubAddress !== ZERO_ADDRESS && !!userToken,
                }
            });

            if (isTempoChain) {
                const formattedData = tempoPool.data ? {
                    reserveUserToken: (tempoPool.data as readonly [bigint, bigint])[0],
                    reserveValidatorToken: (tempoPool.data as readonly [bigint, bigint])[1],
                } : undefined;

                return { ...tempoPool, data: formattedData };
            }

            const arcData = arcPool.data ? {
                reserveUserToken: (arcPool.data[0]?.result as bigint | undefined) ?? 0n,
                reserveValidatorToken: (arcPool.data[1]?.result as bigint | undefined) ?? 0n,
            } : undefined;

            return {
                data: arcData,
                isLoading: arcPool.isLoading,
                error: arcPool.error,
                refetch: arcPool.refetch,
            };
        },
        useLiquidityBalance: ({ address, userToken, validatorToken }: { address?: `0x${string}`; userToken: `0x${string}`; validatorToken: `0x${string}` }) => {
             const chainId = useChainId();
             const isTempoChain = isTempoNativeChain(chainId);
             const arcHubAddress = getContractAddresses(chainId).HUB_AMM_ADDRESS;

            return useReadContract({
                address: (isTempoChain ? getFeeManagerAddressForChain(chainId) : arcHubAddress) as `0x${string}`,
                abi: isTempoChain ? FEE_AMM_ABI : HUB_AMM_ABI,
                functionName: 'liquidityOf',
                args: address
                    ? (isTempoChain ? [userToken, validatorToken, address as `0x${string}`] : [userToken, address as `0x${string}`])
                    : undefined,
                query: {
                    enabled: !!address && !!userToken && !!validatorToken && (isTempoChain || arcHubAddress !== ZERO_ADDRESS),
                    refetchInterval: 10000,
                }
            });
        },
        useTotalShares: ({ userToken, validatorToken }: { userToken: `0x${string}`; validatorToken: `0x${string}` }) => {
            const chainId = useChainId();
            const isTempoChain = isTempoNativeChain(chainId);
            const arcHubAddress = getContractAddresses(chainId).HUB_AMM_ADDRESS;

            const arcTotalShares = useReadContract({
                address: arcHubAddress as `0x${string}`,
                abi: HUB_AMM_ABI,
                functionName: 'totalShares',
                args: [userToken],
                query: {
                    enabled: !isTempoChain && arcHubAddress !== ZERO_ADDRESS && !!userToken && !!validatorToken,
                    refetchInterval: 10000,
                }
            });

            if (isTempoChain) {
                return {
                    data: null,
                    isLoading: false,
                    error: null,
                    refetch: async () => null,
                };
            }

            return arcTotalShares;
        },
        useMintSync: () => {
             const { writeContract, writeContractAsync, isPending } = useWriteContract();
             const chainId = useChainId();
             const buildConfig = (args: { userTokenAddress: `0x${string}`; validatorTokenAddress: `0x${string}`; validatorTokenAmount: bigint; to: `0x${string}` }) => ({
                address: getFeeManagerAddressForChain(chainId) as `0x${string}`,
                abi: FEE_AMM_ABI,
                functionName: 'mint' as const,
                args: [args.userTokenAddress, args.validatorTokenAddress, args.validatorTokenAmount, args.to] as const,
             });
             return {
                mutate: (args: { userTokenAddress: `0x${string}`; validatorTokenAddress: `0x${string}`; validatorTokenAmount: bigint; to: `0x${string}`; feeToken: `0x${string}` }) => {
                    writeContract(buildConfig(args) as any);
                },
                 mutateAsync: (args: { userTokenAddress: `0x${string}`; validatorTokenAddress: `0x${string}`; validatorTokenAmount: bigint; to: `0x${string}`; feeToken: `0x${string}` }) =>
                    writeContractAsync(buildConfig(args) as any),
                 isPending
             };
        },
        useBurnSync: () => {
             const { writeContract, writeContractAsync, isPending } = useWriteContract();
             const chainId = useChainId();
             const isTempoChain = isTempoNativeChain(chainId);
             const arcHubAddress = getContractAddresses(chainId).HUB_AMM_ADDRESS;
             const buildConfig = (args: { userTokenAddress: `0x${string}`; validatorTokenAddress: `0x${string}`; liquidityAmount: bigint; to: `0x${string}`; feeToken: `0x${string}` }) => {
                if (isTempoChain) {
                    return {
                       address: getFeeManagerAddressForChain(chainId) as `0x${string}`,
                       abi: FEE_AMM_ABI,
                       functionName: 'burn' as const,
                       args: [args.userTokenAddress, args.validatorTokenAddress, args.liquidityAmount, args.to] as const,
                    };
                 }

                 const deadlineTimestamp = BigInt(Math.floor(Date.now() / 1000) + (20 * 60));
                 return {
                    address: arcHubAddress as `0x${string}`,
                    abi: HUB_AMM_ABI,
                    functionName: 'removeLiquidity' as const,
                    args: [args.userTokenAddress, args.validatorTokenAddress, args.liquidityAmount, 0n, 0n, deadlineTimestamp] as const,
                 };
             };
             return {
                 mutate: (args: { userTokenAddress: `0x${string}`; validatorTokenAddress: `0x${string}`; liquidityAmount: bigint; to: `0x${string}`; feeToken: `0x${string}` }) => {
                     writeContract(buildConfig(args) as any);
                 },
                 mutateAsync: (args: { userTokenAddress: `0x${string}`; validatorTokenAddress: `0x${string}`; liquidityAmount: bigint; to: `0x${string}`; feeToken: `0x${string}` }) =>
                    writeContractAsync(buildConfig(args) as any),
                 isPending
             };
        },
        useWatchFeeSwap: ({ userToken, validatorToken, onLogs }: { userToken: `0x${string}`; validatorToken: `0x${string}`; onLogs: (logs: unknown[]) => void }) => {
            const chainId = useChainId();
            useWatchContractEvent({
                address: getFeeManagerAddressForChain(chainId) as `0x${string}`,
                abi: FEE_AMM_ABI,
                eventName: 'FeeSwap',
                args: { userToken, validatorToken },
                onLogs: onLogs
            });
        },
        useRebalanceSwapSync: () => {
            const { writeContract, isPending } = useWriteContract();
            const chainId = useChainId();
            return {
                mutate: (args: { userToken: `0x${string}`; validatorToken: `0x${string}`; amountOut: bigint; to: `0x${string}` }) => {
                    writeContract({
                        address: getFeeManagerAddressForChain(chainId) as `0x${string}`,
                        abi: FEE_AMM_ABI,
                        functionName: 'rebalanceSwap',
                        args: [args.userToken, args.validatorToken, args.amountOut, args.to]
                    });
                },
                isPending
            };
        }
    }
};
