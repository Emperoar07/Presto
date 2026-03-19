'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { formatUnits } from 'viem';
import { useAccount, useChainId } from 'wagmi';
import { Hooks } from '@/lib/tempo';
import { getContractAddresses, isArcChain, isTempoNativeChain, ZERO_ADDRESS } from '@/config/contracts';
import { getHubToken, isHubToken, Token } from '@/config/tokens';

function LpPositionCard({
  token,
  validatorToken,
}: {
  token: Token;
  validatorToken: Token;
}) {
  const { address } = useAccount();
  const { data: balance } = (Hooks.amm.useLiquidityBalance
    ? Hooks.amm.useLiquidityBalance({
        address,
        userToken: token.address as `0x${string}`,
        validatorToken: validatorToken.address as `0x${string}`,
      })
    : { data: null }) as { data: bigint | null };

  const lpBalance = balance ? Number(formatUnits(balance, 18)) : 0;

  if (lpBalance <= 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/85 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-900 dark:text-white">
            {token.symbol} / {validatorToken.symbol}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Fee-side liquidity position
          </p>
        </div>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
          Active
        </span>
      </div>
      <div className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          LP balance
        </p>
        <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {lpBalance.toLocaleString('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 4,
          })}
        </p>
      </div>
    </div>
  );
}

export function PortfolioLiquidityPanel({ tokens }: { tokens: Token[] }) {
  const chainId = useChainId();
  const hubToken = getHubToken(chainId);
  const isTempoChain = isTempoNativeChain(chainId);
  const isArcTestnet = isArcChain(chainId);
  const hasArcDeployment = getContractAddresses(chainId).HUB_AMM_ADDRESS !== ZERO_ADDRESS;

  const positionTokens = useMemo(() => {
    return tokens.filter((token) => !isHubToken(token, chainId));
  }, [chainId, tokens]);

  if (!hubToken) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Liquidity
          </p>
          <h3 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">Pool positions</h3>
        </div>
        <Link
          href="/liquidity"
          className="text-sm font-semibold text-primary transition-colors hover:text-primary/80"
        >
          Open liquidity workspace
        </Link>
      </div>

      {isArcTestnet && !hasArcDeployment ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-700 dark:text-amber-300">
          Arc portfolio tracking is live for wallet balances, but LP positions stay in preview until the Arc hub AMM is deployed in this environment.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {positionTokens.map((token) => (
            <LpPositionCard key={token.address} token={token} validatorToken={hubToken} />
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
        Positions appear here once you add liquidity for supported pairs on this network.
      </div>

      {isTempoChain && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
          Tempo positions are tied to {hubToken.symbol}-routed fee pools. If a position looks missing here, check the liquidity workspace for parked DEX balances or recent maintenance actions.
        </div>
      )}
    </div>
  );
}
