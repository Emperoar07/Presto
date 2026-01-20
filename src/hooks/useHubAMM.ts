import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { HUB_AMM_ABI, getContractAddresses } from '@/config/contracts';
import { Token } from '@/config/tokens';
import { parseUnits, formatUnits } from 'viem';
import { useChainId } from 'wagmi';

export function useHubQuote(tokenIn: Token, tokenOut: Token, amountIn: string) {
  const chainId = useChainId();
  const { HUB_AMM_ADDRESS } = getContractAddresses(chainId);
  
  const parsedAmount = amountIn && !isNaN(Number(amountIn)) 
    ? parseUnits(amountIn, tokenIn.decimals) 
    : 0n;

  const { data: quoteAmount, isLoading, isError, refetch } = useReadContract({
    address: HUB_AMM_ADDRESS as `0x${string}`,
    abi: HUB_AMM_ABI,
    functionName: 'getQuote',
    args: [tokenIn.address, tokenOut.address, parsedAmount],
    query: {
        enabled: parsedAmount > 0n && tokenIn.address !== tokenOut.address,
    }
  });

  return {
    quoteAmount: quoteAmount ? formatUnits(quoteAmount as bigint, tokenOut.decimals) : '',
    rawQuoteAmount: quoteAmount as bigint | undefined,
    isLoading,
    isError,
    refetch
  };
}

export function useHubSwap(tokenIn: Token, tokenOut: Token, amountIn: string, amountOutMin: string) {
  const chainId = useChainId();
  const { HUB_AMM_ADDRESS } = getContractAddresses(chainId);
  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const swap = () => {
    if (!amountIn || !amountOutMin) return;
    
    const parsedAmountIn = parseUnits(amountIn, tokenIn.decimals);
    const parsedAmountOutMin = parseUnits(amountOutMin, tokenOut.decimals);

    writeContract({
      address: HUB_AMM_ADDRESS as `0x${string}`,
      abi: HUB_AMM_ABI,
      functionName: 'swap',
      args: [tokenIn.address, tokenOut.address, parsedAmountIn, parsedAmountOutMin],
    });
  };

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  return {
    swap,
    isPending,
    isConfirming,
    isConfirmed,
    error,
    hash
  };
}

export function useHubLiquidity(token: Token) {
    const chainId = useChainId();
    const { HUB_AMM_ADDRESS } = getContractAddresses(chainId);
    const { writeContract, data: hash, isPending, error } = useWriteContract();
  
    const addLiquidity = (tokenAmount: string, pathAmount: string) => {
        if (!tokenAmount || !pathAmount) return;
        
        const parsedTokenAmount = parseUnits(tokenAmount, token.decimals);
        const parsedPathAmount = parseUnits(pathAmount, 18); // pathUSD is 18 decimals
    
        writeContract({
          address: HUB_AMM_ADDRESS as `0x${string}`,
          abi: HUB_AMM_ABI,
          functionName: 'addLiquidity',
          args: [token.address, parsedTokenAmount, parsedPathAmount],
        });
      };
    
      const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
        hash,
      });
    
      return {
        addLiquidity,
        isPending,
        isConfirming,
        isConfirmed,
        error,
        hash
      };
}
