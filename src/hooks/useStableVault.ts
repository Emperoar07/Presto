import { useReadContract, useWriteContract, useChainId, useAccount } from 'wagmi';
import { parseUnits } from 'viem';
import { getContractAddresses, STABLE_VAULT_ABI, ZERO_ADDRESS } from '@/config/contracts';
import { Token } from '@/config/tokens';
import toast from 'react-hot-toast';

export function useStableVaultBalance(token: Token) {
  const chainId = useChainId();
  const { STABLE_VAULT_ADDRESS } = getContractAddresses(chainId);

  const { data: balance, isLoading, refetch } = useReadContract({
    address: STABLE_VAULT_ADDRESS as `0x${string}`,
    abi: STABLE_VAULT_ABI,
    functionName: 'getBalance',
    args: [token.address],
    query: {
        enabled: !!token.address && STABLE_VAULT_ADDRESS !== ZERO_ADDRESS,
    }
  });

  return { 
    balance: balance as bigint | undefined, 
    isLoading, 
    refetch 
  };
}

export function useStableSwap(
  inputToken: Token,
  outputToken: Token,
  amountIn: string
) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { STABLE_VAULT_ADDRESS } = getContractAddresses(chainId);
  const { writeContractAsync, isPending } = useWriteContract();

  const swap = async () => {
    if (!address) {
        toast.error('Please connect wallet');
        return;
    }
    if (STABLE_VAULT_ADDRESS === ZERO_ADDRESS) {
        toast.error('Stable vault is not available on this network');
        return;
    }
    if (!amountIn || Number(amountIn) <= 0) {
        toast.error('Please enter an amount');
        return;
    }

    try {
        const amountInBI = parseUnits(amountIn, inputToken.decimals);
        
        const txHash = await writeContractAsync({
            address: STABLE_VAULT_ADDRESS as `0x${string}`,
            abi: STABLE_VAULT_ABI,
            functionName: 'swap',
            args: [inputToken.address, outputToken.address, amountInBI],
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
