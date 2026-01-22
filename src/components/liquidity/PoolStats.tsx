'use client';

import { useMemo } from 'react';
import { formatUnits } from 'viem';

interface PoolStatsProps {
  userTokenSymbol: string;
  validatorTokenSymbol: string;
  reserveUserToken: bigint | null;
  reserveValidatorToken: bigint | null;
  userTokenDecimals: number;
  validatorTokenDecimals: number;
  totalShares: bigint | null;
  userShares: bigint | null;
  inputAmount?: string;
}

export function PoolStats({
  userTokenSymbol,
  validatorTokenSymbol,
  reserveUserToken,
  reserveValidatorToken,
  userTokenDecimals,
  validatorTokenDecimals,
  totalShares,
  userShares,
  inputAmount,
}: PoolStatsProps) {
  // Calculate pool share percentage
  const poolSharePercent = useMemo(() => {
    if (!totalShares || totalShares === 0n || !userShares) return 0;
    return Number((userShares * 10000n) / totalShares) / 100;
  }, [totalShares, userShares]);

  // Calculate TVL
  const tvl = useMemo(() => {
    if (!reserveValidatorToken) return '0';
    // Assuming validator token is a stablecoin, TVL ≈ 2x validator reserves
    const validatorValue = Number(formatUnits(reserveValidatorToken, validatorTokenDecimals));
    return (validatorValue * 2).toFixed(2);
  }, [reserveValidatorToken, validatorTokenDecimals]);

  // Calculate pool ratio
  const poolRatio = useMemo(() => {
    if (!reserveUserToken || !reserveValidatorToken || reserveUserToken === 0n) {
      return null;
    }
    const userReserve = Number(formatUnits(reserveUserToken, userTokenDecimals));
    const validatorReserve = Number(formatUnits(reserveValidatorToken, validatorTokenDecimals));
    if (userReserve === 0) return null;
    return validatorReserve / userReserve;
  }, [reserveUserToken, reserveValidatorToken, userTokenDecimals, validatorTokenDecimals]);

  // Estimate LP tokens to receive
  const estimatedLpTokens = useMemo(() => {
    if (!inputAmount || !reserveValidatorToken || reserveValidatorToken === 0n || !totalShares) {
      return null;
    }
    try {
      const inputValue = parseFloat(inputAmount);
      if (isNaN(inputValue) || inputValue <= 0) return null;

      const validatorReserve = Number(formatUnits(reserveValidatorToken, validatorTokenDecimals));
      const currentTotalShares = Number(formatUnits(totalShares, 18));

      if (validatorReserve === 0) {
        // First LP provider
        return inputValue.toFixed(4);
      }

      // LP tokens = (input / reserve) * totalShares
      const lpTokens = (inputValue / validatorReserve) * currentTotalShares;
      return lpTokens.toFixed(4);
    } catch {
      return null;
    }
  }, [inputAmount, reserveValidatorToken, totalShares, validatorTokenDecimals]);

  // Estimate pool share after adding liquidity
  const estimatedPoolShare = useMemo(() => {
    if (!estimatedLpTokens || !totalShares) return null;
    const newLp = parseFloat(estimatedLpTokens);
    const currentTotal = Number(formatUnits(totalShares, 18));
    const currentUserShares = userShares ? Number(formatUnits(userShares, 18)) : 0;
    const newTotal = currentTotal + newLp;
    const newUserShares = currentUserShares + newLp;
    if (newTotal === 0) return null;
    return ((newUserShares / newTotal) * 100).toFixed(2);
  }, [estimatedLpTokens, totalShares, userShares]);

  return (
    <div className="space-y-4">
      {/* Pool Overview Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-black/30 border border-white/5">
          <div className="text-xs text-zinc-500 mb-1">TVL</div>
          <div className="text-lg font-bold text-white">${tvl}</div>
        </div>
        <div className="p-3 rounded-lg bg-black/30 border border-white/5">
          <div className="text-xs text-zinc-500 mb-1">Your Pool Share</div>
          <div className="text-lg font-bold text-[#00F3FF]">{poolSharePercent.toFixed(2)}%</div>
        </div>
      </div>

      {/* Pool Reserves */}
      <div className="p-3 rounded-lg bg-black/30 border border-white/5">
        <div className="text-xs text-zinc-500 mb-2">Pool Reserves</div>
        <div className="flex justify-between text-sm">
          <span className="text-zinc-400">{userTokenSymbol}</span>
          <span className="text-white font-medium">
            {reserveUserToken ? Number(formatUnits(reserveUserToken, userTokenDecimals)).toFixed(4) : '0'}
          </span>
        </div>
        <div className="flex justify-between text-sm mt-1">
          <span className="text-zinc-400">{validatorTokenSymbol}</span>
          <span className="text-white font-medium">
            {reserveValidatorToken ? Number(formatUnits(reserveValidatorToken, validatorTokenDecimals)).toFixed(4) : '0'}
          </span>
        </div>
        {poolRatio && (
          <div className="mt-2 pt-2 border-t border-white/5 text-xs text-zinc-500">
            1 {userTokenSymbol} ≈ {poolRatio.toFixed(4)} {validatorTokenSymbol}
          </div>
        )}
      </div>

      {/* LP Preview - only show when input amount is provided */}
      {inputAmount && parseFloat(inputAmount) > 0 && (
        <div className="p-3 rounded-lg bg-[#00F3FF]/5 border border-[#00F3FF]/20">
          <div className="text-xs text-[#00F3FF] mb-2 font-medium">LP Preview</div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Est. LP Tokens</span>
              <span className="text-white font-medium">{estimatedLpTokens || '—'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">New Pool Share</span>
              <span className="text-[#00F3FF] font-medium">
                {estimatedPoolShare ? `${estimatedPoolShare}%` : '—'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
