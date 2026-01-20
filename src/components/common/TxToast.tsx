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
    <div className="rounded-lg border border-white/10 bg-black/80 px-4 py-3 shadow-xl backdrop-blur-md">
      <div className="text-sm text-white">{title}</div>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex text-xs text-[#00F3FF] hover:text-[#7CFFFE]"
        >
          View on explorer
        </a>
      )}
    </div>
  );
}
