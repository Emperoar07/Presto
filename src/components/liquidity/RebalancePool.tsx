import { Hooks } from '@/lib/tempo';
import { formatUnits, parseUnits } from 'viem';
import toast from 'react-hot-toast';
import { useState } from 'react';
import { useAccount } from 'wagmi';

interface RebalancePoolProps {
  userToken: string;
  validatorToken: string;
  userTokenDecimals?: number;
  validatorTokenDecimals?: number;
}

export function RebalancePool({ 
    userToken, 
    validatorToken,
    userTokenDecimals = 18,
    validatorTokenDecimals = 18 
}: RebalancePoolProps) {
  const { address } = useAccount();
  const [amountOut, setAmountOut] = useState('');

  const { data: pool } = (Hooks.amm.usePool
    ? Hooks.amm.usePool({
        userToken: userToken as `0x${string}`,
        validatorToken: validatorToken as `0x${string}`,
      })
    : { data: null }) as { data: { reserveUserToken: bigint; reserveValidatorToken: bigint } | null };

  const rebalance = Hooks.amm.useRebalanceSwapSync ? Hooks.amm.useRebalanceSwapSync() : { mutate: () => {}, isPending: false };

  const safeParseUnits = (value: string, decimals: number) => {
    try {
      if (!value || value === '.' || isNaN(Number(value))) return 0n;
      return parseUnits(value, decimals);
    } catch {
      return 0n;
    }
  };

  const parsedAmountOut = pool ? safeParseUnits(amountOut, userTokenDecimals) : 0n;
  const canRebalance =
    !!address &&
    !!pool &&
    pool.reserveUserToken > 0n &&
    pool.reserveValidatorToken > 0n &&
    parsedAmountOut > 0n &&
    parsedAmountOut <= pool.reserveUserToken;

  const handleRebalance = () => {
      if (!pool) return;
      if (parsedAmountOut === 0n) {
        toast.error('Enter a valid rebalance amount');
        return;
      }
      if (parsedAmountOut > pool.reserveUserToken) {
        toast.error('Rebalance amount exceeds user reserves');
        return;
      }
      rebalance.mutate({
        userToken: userToken as `0x${string}`,
        validatorToken: validatorToken as `0x${string}`,
        amountOut: parsedAmountOut, 
        to: address,
      });
  };

  return (
    <div className="p-4 rounded-xl bg-black/20 border border-white/5 text-sm space-y-3 mt-4">
        <div className="flex justify-between items-center">
             <h3 className="font-bold text-white">Pool Rebalancing</h3>
             <span className="text-xs text-[#00F3FF]">Restore Reserves</span>
        </div>
      
      <div className="flex justify-between text-xs text-zinc-300">
          <span>User Reserves:</span>
          <span>{pool ? formatUnits(pool.reserveUserToken, userTokenDecimals) : '0'}</span>
      </div>
      <div className="flex justify-between text-xs text-zinc-300">
          <span>Validator Reserves:</span>
          <span>{pool ? formatUnits(pool.reserveValidatorToken, validatorTokenDecimals) : '0'}</span>
      </div>
      {!canRebalance && (
        <div className="text-[11px] text-zinc-500">
          Enter an amount to swap user reserves back into balance.
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={amountOut}
          onChange={(e) => setAmountOut(e.target.value)}
          placeholder="Amount out"
          className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white outline-none focus:border-[#00F3FF]/50"
        />
        <button
          type="button"
          onClick={() => {
            if (pool) setAmountOut(formatUnits(pool.reserveUserToken, userTokenDecimals));
          }}
          className="px-2 py-2 rounded-lg border border-white/10 text-zinc-300 hover:text-white hover:border-white/30 text-xs"
        >
          Max
        </button>
      </div>
      
      <button 
        type="button" 
        onClick={handleRebalance}
        disabled={!canRebalance || rebalance.isPending}
        className="w-full py-2 bg-[#BC13FE]/20 hover:bg-[#BC13FE]/30 text-[#BC13FE] border border-[#BC13FE]/50 font-bold rounded-lg transition-all disabled:opacity-50 text-xs"
      >
        {rebalance.isPending ? 'Rebalancing...' : 'Rebalance Pool'}
      </button>
    </div>
  );
}
