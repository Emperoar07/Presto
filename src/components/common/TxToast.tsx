'use client';

import { useChainId } from 'wagmi';
import { getExplorerTxUrl } from '@/lib/explorer';

type TxToastProps = {
  hash: `0x${string}` | string;
  title?: string;
};

export function TxToast({ hash, title = 'Transaction submitted' }: TxToastProps) {
  const chainId = useChainId();
  const url = getExplorerTxUrl(chainId, hash);

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 shadow-xl backdrop-blur-md">
      <div className="text-sm text-slate-900 dark:text-white">{title}</div>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex text-xs text-primary hover:text-primary/80"
        >
          View on explorer
        </a>
      )}
    </div>
  );
}
