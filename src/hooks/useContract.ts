import { useAccount, useReadContract, useWriteContract, useBalance, useChainId } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { Token } from '@/config/tokens';
import { getContractAddresses, ROUTER_ABI, ERC20_ABI, FACTORY_ABI, PAIR_ABI, ZERO_ADDRESS } from '@/config/contracts';
import toast from 'react-hot-toast';

export function useTokenBalance(token: Token) {
  const { address } = useAccount();
  
  // For Native ETH
  const { data: ethBalance, isLoading: isEthLoading, refetch: refetchEth } = useBalance({
    address,
    query: {
        enabled: !!address && token.address === ZERO_ADDRESS,
    }
  });

  // For ERC20
  const { data: tokenBalance, isLoading: isTokenLoading, refetch: refetchToken } = useReadContract({
    address: token.address === ZERO_ADDRESS ? undefined : token.address,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
        enabled: !!address && token.address !== ZERO_ADDRESS,
    }
  });

  const isLoading = token.address === ZERO_ADDRESS ? isEthLoading : isTokenLoading;
  
  let formattedBalance = '0.0';
  if (token.address === ZERO_ADDRESS && ethBalance) {
      formattedBalance = parseFloat(formatUnits(ethBalance.value, ethBalance.decimals)).toFixed(4);
  } else if (tokenBalance !== undefined) {
      formattedBalance = parseFloat(formatUnits(tokenBalance as bigint, token.decimals)).toFixed(4);
  }

  const refetch = () => {
      if (token.address === ZERO_ADDRESS) refetchEth();
      else refetchToken();
  }

  return { balance: formattedBalance, isLoading, refetch };
}

export function useApproval(token: Token, amount: string, spenderAddress: string) {
    const { address } = useAccount();
    const { writeContractAsync, isPending: isApproving } = useWriteContract();
    
    // Check Allowance
    const { data: allowance, refetch: refetchAllowance } = useReadContract({
        address: token.address === ZERO_ADDRESS ? undefined : token.address,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: address ? [address, spenderAddress] : undefined,
        query: {
            enabled: !!address && token.address !== ZERO_ADDRESS,
        }
    });

    const isApproved = (() => {
        if (token.address === ZERO_ADDRESS) return true;
        if (!amount || !allowance) return false;
        try {
            const amountBI = parseUnits(amount, token.decimals);
            return (allowance as bigint) >= amountBI;
        } catch {
            return false;
        }
    })();

    const approve = async () => {
        if (!address || token.address === ZERO_ADDRESS) return;
        
        try {
            const amountBI = parseUnits(amount, token.decimals); // Or use MaxUint256
            const txHash = await writeContractAsync({
                address: token.address,
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [spenderAddress, amountBI],
            });
            
            toast.promise(
                // We would ideally wait for receipt here, but basic implementation:
                Promise.resolve(txHash),
                {
                    loading: 'Approving...',
                    success: 'Transaction sent!',
                    error: 'Approval failed',
                }
            );
            
            // In a real app, use useWaitForTransactionReceipt to wait for confirmation
            // and then refetchAllowance()
            
        } catch (error) {
            console.error(error);
            toast.error('Approval failed');
        }
    };

    return { isApproved, isApproving, approve, refetchAllowance };
}

export function useAmountsOut(
  inputToken: Token,
  outputToken: Token,
  amountIn: string
) {
  const chainId = useChainId();
  const { ROUTER_ADDRESS, WETH_ADDRESS } = getContractAddresses(chainId);

  const parsedAmountIn = parseUnits(amountIn || '0', inputToken.decimals);
  const path = [
    inputToken.address === ZERO_ADDRESS ? WETH_ADDRESS : inputToken.address,
    outputToken.address === ZERO_ADDRESS ? WETH_ADDRESS : outputToken.address
  ] as const;

  const { data } = useReadContract({
    address: ROUTER_ADDRESS as `0x${string}`,
    abi: ROUTER_ABI,
    functionName: 'getAmountsOut',
    args: [parsedAmountIn, path],
    query: {
      enabled: !!amountIn && Number(amountIn) > 0,
    }
  });

  return { 
    amounts: data as readonly bigint[] | undefined,
    amountOut: data ? (data as readonly bigint[])[1] : 0n
  };
}

export function useReserves(tokenA: Token, tokenB: Token) {
  const chainId = useChainId();
  const { FACTORY_ADDRESS } = getContractAddresses(chainId);

  // 1. Get Pair Address
  const { data: pairAddress } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'getPair',
    args: [tokenA.address, tokenB.address],
  });

  // 2. Get Reserves
  const { data: reserves, isLoading } = useReadContract({
    address: pairAddress as `0x${string}`,
    abi: PAIR_ABI,
    functionName: 'getReserves',
    query: {
      enabled: !!pairAddress && pairAddress !== ZERO_ADDRESS,
    }
  });

  // Sort reserves based on token address to match Uniswap logic
  const sorted = tokenA.address.toLowerCase() < tokenB.address.toLowerCase();
  const reservesTuple = reserves as readonly [bigint, bigint, bigint] | undefined;
  const reserveA = reservesTuple ? (sorted ? reservesTuple[0] : reservesTuple[1]) : 0n;
  const reserveB = reservesTuple ? (sorted ? reservesTuple[1] : reservesTuple[0]) : 0n;

  return {
    reserves,
    reserveA,
    reserveB,
    isLoading,
    pairAddress
  };
}

export function useSwap(
  inputToken: Token,
  outputToken: Token,
  amountIn: string,
  amountOutMin: bigint,
  deadlineMinutes: string
) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { ROUTER_ADDRESS, WETH_ADDRESS } = getContractAddresses(chainId);
  const { writeContractAsync, isPending } = useWriteContract();

  const swap = async () => {
    if (!address) {
        toast.error('Please connect wallet');
        return;
    }
    if (!amountIn || Number(amountIn) <= 0) {
        toast.error('Please enter an amount');
        return;
    }

    try {
        const amountInBI = parseUnits(amountIn, inputToken.decimals);
        const deadline = BigInt(Math.floor(Date.now() / 1000) + Number(deadlineMinutes) * 60);
        
        // Path Construction
        let path: readonly `0x${string}`[] = [];
        if (inputToken.address === ZERO_ADDRESS) {
            path = [WETH_ADDRESS, outputToken.address];
        } else if (outputToken.address === ZERO_ADDRESS) {
            path = [inputToken.address, WETH_ADDRESS];
        } else {
            path = [inputToken.address, outputToken.address];
        }
        
        const txHash =
          inputToken.address === ZERO_ADDRESS
            ? await writeContractAsync({
                address: ROUTER_ADDRESS as `0x${string}`,
                abi: ROUTER_ABI,
                functionName: 'swapExactETHForTokens',
                args: [amountOutMin, path, address, deadline],
                value: amountInBI,
              })
            : outputToken.address === ZERO_ADDRESS
              ? await writeContractAsync({
                  address: ROUTER_ADDRESS as `0x${string}`,
                  abi: ROUTER_ABI,
                  functionName: 'swapExactTokensForETH',
                  args: [amountInBI, amountOutMin, path, address, deadline],
                })
              : await writeContractAsync({
                  address: ROUTER_ADDRESS as `0x${string}`,
                  abi: ROUTER_ABI,
                  functionName: 'swapExactTokensForTokens',
                  args: [amountInBI, amountOutMin, path, address, deadline],
                });

        toast.success('Swap submitted!');
        return txHash;

    } catch (error) {
        console.error(error);
        toast.error('Swap failed');
    }
  };

  return { swap, isPending };
}

export function useAddLiquidity(
  tokenA: Token,
  tokenB: Token,
  amountA: string,
  amountB: string
) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { ROUTER_ADDRESS } = getContractAddresses(chainId);
  const { writeContractAsync, isPending } = useWriteContract();

  const addLiquidity = async () => {
    if (!address) {
        toast.error('Please connect wallet');
        return;
    }
    if (!amountA || !amountB) {
        toast.error('Please enter amounts');
        return;
    }

    try {
        const amountABI = parseUnits(amountA, tokenA.decimals);
        const amountBBI = parseUnits(amountB, tokenB.decimals);
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60); // 20 mins

        // Min amounts (slippage) - 0 for now
        const amountAMin = 0n;
        const amountBMin = 0n;
        
        const txHash =
          tokenA.address === ZERO_ADDRESS
            ? await writeContractAsync({
                address: ROUTER_ADDRESS as `0x${string}`,
                abi: ROUTER_ABI,
                functionName: 'addLiquidityETH',
                args: [tokenB.address, amountBBI, amountBMin, amountAMin, address, deadline],
                value: amountABI,
              })
            : tokenB.address === ZERO_ADDRESS
              ? await writeContractAsync({
                  address: ROUTER_ADDRESS as `0x${string}`,
                  abi: ROUTER_ABI,
                  functionName: 'addLiquidityETH',
                  args: [tokenA.address, amountABI, amountAMin, amountBMin, address, deadline],
                  value: amountBBI,
                })
              : await writeContractAsync({
                  address: ROUTER_ADDRESS as `0x${string}`,
                  abi: ROUTER_ABI,
                  functionName: 'addLiquidity',
                  args: [tokenA.address, tokenB.address, amountABI, amountBBI, amountAMin, amountBMin, address, deadline],
                });

        toast.success('Liquidity transaction submitted!');
        return txHash;

    } catch (error) {
        console.error(error);
        toast.error('Failed to add liquidity');
    }
  };

  return { addLiquidity, isPending };
}
