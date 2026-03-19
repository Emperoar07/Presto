'use client';

import { useChainId } from 'wagmi';
import { TransactionsExplorer } from '@/components/transactions/TransactionsExplorer';
import { isArcChain, isTempoNativeChain } from '@/config/contracts';

function getTransactionsPageContent(chainId: number) {
  if (isTempoNativeChain(chainId)) {
    return {
      networkLabel: 'Tempo Testnet',
      eyebrow: 'Swaps, orders, and fee-side activity',
      title: 'Activity on Tempo',
      description:
        'Tempo activity includes native swaps, order placement, and liquidity movements around pathUSD-routed pools.',
    };
  }

  if (isArcChain(chainId)) {
    return {
      networkLabel: 'Arc Testnet',
      eyebrow: 'Stable swap and liquidity activity',
      title: 'Activity on Arc',
      description:
        'Arc activity is centered on stable swaps and liquidity actions around the deployed hub AMM, without Tempo-native orderbook flows.',
    };
  }

  return {
    networkLabel: 'Supported Network',
    eyebrow: 'Chain-aware activity',
    title: 'Transactions',
    description:
      'This activity page adapts to the connected network so it only describes flows the current deployment actually supports.',
  };
}

export default function TransactionsPage() {
  const chainId = useChainId();
  const content = getTransactionsPageContent(chainId);

  return (
    <div className="flex flex-col items-center px-6 py-10 md:py-14">
      <div className="w-full max-w-5xl">
        <div className="mb-8 space-y-3 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {content.networkLabel}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
              {content.eyebrow}
            </p>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{content.title}</h1>
            <p className="mx-auto max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              {content.description}
            </p>
          </div>
        </div>
        <TransactionsExplorer />
      </div>
    </div>
  );
}
