'use client';

import { useChainId } from 'wagmi';
import { getExplorerTxUrl } from '@/lib/explorer';

type TxToastProps = {
  hash?: `0x${string}` | string;
  title?: string;
  status?: 'pending' | 'success' | 'error';
};

export function TxToast({ hash, title = 'Transaction submitted', status = 'success' }: TxToastProps) {
  const chainId = useChainId();
  const url = hash ? getExplorerTxUrl(chainId, hash) : null;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#0c121d]/95 px-4 py-3 shadow-2xl backdrop-blur-md max-w-[380px] flex flex-col gap-1 transition-all duration-300">
      <div className="text-sm font-medium text-slate-100 flex items-center gap-2">
        {status === 'pending' && (
          <span className="relative flex h-2 w-2 mr-1">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
          </span>
        )}
        {status === 'success' && (
          <span className="text-[#2ff0a2] font-bold text-base leading-none">✓</span>
        )}
        {status === 'error' && (
          <span className="text-rose-500 font-bold text-base leading-none">✕</span>
        )}
        <span className="leading-snug">{title}</span>
      </div>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="ml-5 inline-flex text-xs text-primary hover:text-primary/80 font-semibold transition-colors"
        >
          View on explorer ↗
        </a>
      )}
    </div>
  );
}
