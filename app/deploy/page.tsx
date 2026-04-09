'use client';

import Link from 'next/link';
import { useAccount } from 'wagmi';
import { loadDeployments, type DeploymentRecord } from '@/lib/deployUtils';
import { useEffect, useState } from 'react';
import { getExplorerBaseUrl } from '@/lib/explorer';

const SURF = '#1e293b';
const SURF_2 = '#263347';
const BDR = '1px solid rgba(255,255,255,0.07)';
const ARC_CHAIN_ID = 5042002;

const DEPLOY_OPTIONS = [
  {
    href: '/deploy/token',
    icon: 'token',
    title: 'Token / Memecoin',
    description: 'Deploy an ERC20 token with custom name, symbol, and supply. Seed liquidity on Hub AMM.',
    color: '#25c0f4',
    bg: 'rgba(37,192,244,0.10)',
  },
  {
    href: '/deploy/nft',
    icon: 'image',
    title: 'NFT Collection',
    description: 'Deploy an ERC721 NFT with metadata, max supply, and mint price. Get a unique mint page link.',
    color: '#a78bfa',
    bg: 'rgba(167,139,250,0.10)',
  },
  {
    href: '/deploy/contract',
    icon: 'code',
    title: 'Smart Contract',
    description: 'Deploy any smart contract from ABI and bytecode. Use templates or paste your own.',
    color: '#22c55e',
    bg: 'rgba(34,197,94,0.10)',
  },
];

function formatRelativeTime(timestamp: number) {
  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSeconds < 60) return 'Just now';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

const TYPE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  token: { label: 'Token', color: '#25c0f4', bg: 'rgba(37,192,244,0.12)' },
  nft: { label: 'NFT', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  contract: { label: 'Contract', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
};

export default function DeployPage() {
  const { address } = useAccount();
  const [deployments, setDeployments] = useState<DeploymentRecord[]>([]);

  useEffect(() => {
    if (address) setDeployments(loadDeployments(address));
  }, [address]);

  const explorerBase = getExplorerBaseUrl(ARC_CHAIN_ID);

  return (
    <div className="w-full px-4 py-5 md:px-7 md:py-7" style={{ maxWidth: 1140 }}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DEPLOY_OPTIONS.map((opt) => (
          <Link
            key={opt.href}
            href={opt.href}
            className="group overflow-hidden rounded-[16px] transition-all duration-200 hover:scale-[1.02]"
            style={{ background: SURF, border: BDR }}
          >
            <div className="p-5">
              <div className="mb-3 flex items-center gap-3">
                <span
                  className="flex size-10 items-center justify-center rounded-[12px]"
                  style={{ background: opt.bg, color: opt.color }}
                >
                  <span className="material-symbols-outlined text-[20px]">{opt.icon}</span>
                </span>
                <span className="material-symbols-outlined text-[16px] text-slate-600 transition-transform duration-200 group-hover:translate-x-1 ml-auto">
                  arrow_forward
                </span>
              </div>
              <h3 className="text-[14px] font-bold text-slate-100">{opt.title}</h3>
              <p className="mt-1.5 text-[12px] leading-relaxed text-slate-500">{opt.description}</p>
            </div>
          </Link>
        ))}
      </div>

      {deployments.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-[15px] font-bold text-slate-100">My Deployments</h2>
          <div className="overflow-hidden rounded-[16px]" style={{ background: SURF, border: BDR }}>
            {deployments.map((d, i) => {
              const badge = TYPE_BADGE[d.type] ?? TYPE_BADGE.contract;
              const manageHref = d.type === 'contract' ? null : `/deploy/${d.type}/${d.address}`;
              return (
                <div
                  key={`${d.address}-${i}`}
                  className="flex items-center gap-3 px-5 py-3"
                  style={i < deployments.length - 1 ? { borderBottom: BDR } : {}}
                >
                  <span
                    className="flex size-8 items-center justify-center rounded-[8px] text-[10px] font-bold"
                    style={{ background: badge.bg, color: badge.color }}
                  >
                    {badge.label.slice(0, 2)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-slate-100">
                      {d.name}{d.symbol ? ` (${d.symbol})` : ''}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500">
                      {d.address.slice(0, 6)}...{d.address.slice(-4)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span>{formatRelativeTime(d.createdAt)}</span>
                    <a
                      href={`${explorerBase}/address/${d.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-500 hover:text-primary"
                    >
                      <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                    </a>
                    {manageHref && (
                      <Link href={manageHref} className="rounded-md px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10" style={{ background: SURF_2 }}>
                        Manage
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
