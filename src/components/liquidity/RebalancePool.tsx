'use client';

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
      if (!pool || !address) return;
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
        to: address as `0x${string}`,
      });
  };

  return (
    <div className="rounded-[12px] p-4 space-y-3" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex justify-between items-center">
        <h3 className="text-[15px] font-extrabold text-slate-100">Pool Rebalancing</h3>
        <span className="text-[11px] text-[#25c0f4]">Restore Reserves</span>
      </div>

      <div className="flex justify-between text-[12px] text-slate-500">
        <span>User Reserves:</span>
        <span className="text-slate-300">{pool ? formatUnits(pool.reserveUserToken, userTokenDecimals) : '0'}</span>
      </div>
      <div className="flex justify-between text-[12px] text-slate-500">
        <span>Validator Reserves:</span>
        <span className="text-slate-300">{pool ? formatUnits(pool.reserveValidatorToken, validatorTokenDecimals) : '0'}</span>
      </div>
      {!canRebalance && (
        <div className="text-[11px] text-slate-500">
          Enter an amount to swap user reserves back into balance.
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={amountOut}
          onChange={(e) => setAmountOut(e.target.value)}
          placeholder="Amount out"
          className="w-full rounded-[9px] px-3 py-2 text-[12px] text-slate-100 outline-none placeholder:text-slate-600"
          style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.07)' }}
        />
        <button
          type="button"
          onClick={() => {
            if (pool) setAmountOut(formatUnits(pool.reserveUserToken, userTokenDecimals));
          }}
          className="px-3 py-2 rounded-[9px] text-[11px] font-bold text-[#25c0f4] transition-all"
          style={{ border: '1px solid rgba(37,192,244,0.2)', background: 'rgba(37,192,244,0.08)' }}
        >
          Max
        </button>
      </div>

      <button
        type="button"
        onClick={handleRebalance}
        disabled={!canRebalance || rebalance.isPending}
        className="w-full py-2.5 rounded-[9px] text-[12px] font-bold text-[#25c0f4] transition-all disabled:opacity-50"
        style={{ border: '1px solid rgba(37,192,244,0.2)', background: 'rgba(37,192,244,0.08)' }}
      >
        {rebalance.isPending ? 'Rebalancing...' : 'Rebalance Pool'}
      </button>
    </div>
  );
}
