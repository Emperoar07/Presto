'use client';

import { useMemo } from 'react';
import { useBalance, useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { getHubToken, Token } from '@/config/tokens';

const ERC20_BALANCE_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

function AssetCard({
  token,
  walletAddress,
  isHubAsset,
}: {
  token: Token;
  walletAddress: `0x${string}`;
  isHubAsset: boolean;
}) {
  const isNative = token.address === '0x0000000000000000000000000000000000000000';

  const { data: nativeBal } = useBalance({
    address: walletAddress,
    query: { enabled: isNative },
  });

  const { data: tokenBal } = useReadContract({
    address: token.address,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: [walletAddress],
    query: { enabled: !isNative },
  });

  const balanceFormatted = useMemo(() => {
    if (isNative && nativeBal) {
      return Number(formatUnits(nativeBal.value, token.decimals)).toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
      });
    }

    if (!isNative && tokenBal !== undefined) {
      return Number(formatUnits(tokenBal as bigint, token.decimals)).toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
      });
    }

    return '--';
  }, [isNative, nativeBal, tokenBal, token.decimals]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/85 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-sm font-bold text-primary">
            {token.symbol.slice(0, 4).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">{token.symbol}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{token.name}</p>
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${isHubAsset ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-500 dark:bg-white/[0.05] dark:text-slate-300'}`}>
          {isHubAsset ? 'Hub asset' : 'Tracked asset'}
        </span>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Wallet Balance
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {balanceFormatted}
          </p>
        </div>
        <div className="text-right text-xs text-slate-500 dark:text-slate-400">
          <p>{token.decimals} decimals</p>
          <p>{isNative ? 'Native asset' : 'Token contract'}</p>
        </div>
      </div>
    </div>
  );
}

export function PortfolioAssetList({
  chainId,
  tokens,
  walletAddress,
}: {
  chainId: number;
  tokens: Token[];
  walletAddress: `0x${string}`;
}) {
  const hubToken = getHubToken(chainId);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Assets
          </p>
          <h3 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">Tracked balances</h3>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {tokens.length} supported assets on this network
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {tokens.map((token) => (
          <AssetCard
            key={token.address}
            token={token}
            walletAddress={walletAddress}
            isHubAsset={hubToken?.address.toLowerCase() === token.address.toLowerCase()}
          />
        ))}
      </div>
    </div>
  );
}
