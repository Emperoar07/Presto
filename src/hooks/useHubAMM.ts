import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { HUB_AMM_ABI, getContractAddresses } from '@/config/contracts';
import { Token, getTokens, getHubToken } from '@/config/tokens';
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

export function useHubSwap(
  tokenIn: Token,
  tokenOut: Token,
  amountIn: string,
  amountOutMin: string,
  deadlineMinutes = 20
) {
  const chainId = useChainId();
  const { HUB_AMM_ADDRESS } = getContractAddresses(chainId);
  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const swap = () => {
    if (!amountIn || !amountOutMin) return;
    
    const parsedAmountIn = parseUnits(amountIn, tokenIn.decimals);
    const parsedAmountOutMin = parseUnits(amountOutMin, tokenOut.decimals);
    const deadlineTimestamp = BigInt(Math.floor(Date.now() / 1000) + (deadlineMinutes * 60));

    writeContract({
      address: HUB_AMM_ADDRESS as `0x${string}`,
      abi: HUB_AMM_ABI,
      functionName: 'swap',
      args: [tokenIn.address, tokenOut.address, parsedAmountIn, parsedAmountOutMin, deadlineTimestamp],
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
    const pathToken = getHubToken(chainId);
    const { HUB_AMM_ADDRESS } = getContractAddresses(chainId);
    const { writeContract, data: hash, isPending, error } = useWriteContract();
  
    const addLiquidity = (tokenAmount: string, deadlineMinutes = 20) => {
        if (!tokenAmount || !pathToken) return;
        
        const parsedTokenAmount = parseUnits(tokenAmount, token.decimals);
        const deadlineTimestamp = BigInt(Math.floor(Date.now() / 1000) + (deadlineMinutes * 60));
    
        writeContract({
          address: HUB_AMM_ADDRESS as `0x${string}`,
          abi: HUB_AMM_ABI,
          functionName: 'addLiquidity',
          args: [token.address, pathToken.address, parsedTokenAmount, deadlineTimestamp],
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
