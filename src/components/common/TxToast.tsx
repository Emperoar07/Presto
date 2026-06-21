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
    <div className="rounded-xl border border-white/[0.08] bg-[#0c121d] px-4 py-3 shadow-2xl backdrop-blur-md max-w-[380px]">
      <div className="text-sm font-medium text-slate-100 flex items-center gap-2">
        <span className="text-[#2ff0a2] font-bold">✓</span>
        {title}
      </div>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 ml-5 inline-flex text-xs text-primary hover:text-primary/80 font-semibold"
        >
          View on explorer ↗
        </a>
      )}
    </div>
  );
}
