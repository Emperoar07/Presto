'use client';

import { useMemo, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { getTokens } from '@/config/tokens';
import { useTokenBalances } from '@/hooks/useApiQueries';

const SURF = '#1e293b';
const SURF_2 = '#263347';
const BDR = '1px solid rgba(255,255,255,0.07)';

const TOKEN_COLORS = ['#3b82f6', '#8b5cf6', '#25c0f4', '#f59e0b', '#ec4899', '#22c55e'];

const isStableLikeToken = (symbol: string) => {
  const upper = symbol.toUpperCase();
  return ['USDC', 'USDT', 'EURC', 'WUSDC'].includes(upper) || upper.includes('USD');
};

export default function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const tokens = getTokens(chainId);
  const [activeTab, setActiveTab] = useState<'tokens' | 'lp'>('tokens');

  // Multicall-batched balance fetch, auto-polls every 15s, no loading flash on refetch
  const { data: balances = {}, isLoading } = useTokenBalances();

  const assetRows = useMemo(() => {
    return tokens.map((token, index) => {
      const numericBalance = Number.parseFloat((balances as Record<string, string>)[token.address] ?? '0');
      const stable = isStableLikeToken(token.symbol);
      const estimatedValue = stable ? numericBalance : 0;

      return {
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        balance: numericBalance,
        priceLabel: stable ? '$1.00' : 'N/A',
        valueLabel:
          estimatedValue > 0
            ? `$${estimatedValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : '--',
        color: TOKEN_COLORS[index % TOKEN_COLORS.length],
      };
    });
  }, [balances, tokens]);

  const totalBalance = useMemo(() => {
    return assetRows.reduce((sum, asset) => {
      if (asset.valueLabel === '--') return sum;
      return sum + Number.parseFloat(asset.valueLabel.replace(/[$,]/g, ''));
    }, 0);
  }, [assetRows]);

  if (!isConnected || !address) {
    return (
      <div className="px-4 py-5 md:px-7 md:py-7" style={{ maxWidth: 1140 }}>
        <div className="rounded-[16px] p-8 text-center" style={{ background: SURF, border: BDR }}>
          <p className="text-[15px] font-bold text-slate-100">Portfolio</p>
          <p className="mt-2 text-[13px] text-slate-400">Connect your wallet to view balances and positions.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-5 md:px-7 md:py-7" style={{ maxWidth: 1140 }}>
      <div className="mb-5 grid grid-cols-3 gap-3">
        {[
          {
            label: 'Total Balance',
            value: isLoading ? '--' : `$${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            sub: 'Wallet holdings',
          },
          { label: 'LP Positions', value: '$0.00', sub: '0 active' },
          { label: 'Fees Earned', value: '$0.00', sub: 'No LP activity yet' },
        ].map(({ label, value, sub }) => (
          <div key={label} className="rounded-[16px] px-3 py-4 md:px-5 md:py-5" style={{ background: SURF, border: BDR }}>
            <p className="mb-1 text-[10px] font-medium text-slate-500 md:mb-1.5 md:text-[11px]">{label}</p>
            <p className="text-[15px] font-extrabold leading-none tracking-tight text-slate-100 md:text-[20px]">{value}</p>
            <p className="mt-1 text-[10px] font-semibold text-emerald-400 md:text-[11px]">{sub}</p>
          </div>
        ))}
      </div>

      <div className="mb-[18px] flex w-fit gap-1 rounded-[10px] p-1" style={{ background: SURF_2 }}>
        {[
          { key: 'tokens', label: 'Token Holdings' },
          { key: 'lp', label: 'LP Positions' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key as 'tokens' | 'lp')}
            className={`rounded-[8px] px-[14px] py-[6px] text-[13px] font-semibold transition-all ${
              activeTab === tab.key ? 'text-slate-100 shadow' : 'text-slate-500'
            }`}
            style={activeTab === tab.key ? { background: SURF } : {}}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'tokens' ? (
        <div className="overflow-hidden rounded-[16px]" style={{ background: SURF, border: BDR }}>
          <table className="hidden w-full border-collapse md:table">
            <thead>
              <tr>
                {['Asset', 'Price', 'Balance', 'Value'].map((label, index) => (
                  <th
                    key={label}
                    className={`border-b px-5 py-[10px] text-[10.5px] font-semibold uppercase tracking-[0.06em] text-slate-500 ${
                      index === 3 ? 'text-right' : 'text-left'
                    }`}
                    style={{ borderBottom: BDR }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assetRows.map((asset) => (
                <tr key={asset.address} className="border-b border-white/[0.03] hover:bg-white/[0.025]">
                  <td className="px-5 py-[13px]">
                    <div className="flex items-center gap-3">
                      <span
                        className="flex size-8 items-center justify-center rounded-full text-[10px] font-extrabold text-white"
                        style={{ background: asset.color }}
                      >
                        {asset.symbol.slice(0, 4)}
                      </span>
                      <div>
                        <p className="text-[13px] font-extrabold text-slate-100">{asset.name}</p>
                        <p className="text-[11px] text-slate-500">{asset.symbol}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-[13px] text-[13px] text-slate-300">{asset.priceLabel}</td>
                  <td className="px-5 py-[13px] text-[13px] font-semibold text-slate-100">
                    {asset.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {asset.symbol}
                  </td>
                  <td className="px-5 py-[13px] text-right text-[13px] font-bold text-slate-100">{asset.valueLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="divide-y divide-white/[0.04] md:hidden">
            {assetRows.map((asset) => (
              <div key={asset.address} className="flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <span
                    className="flex size-9 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold text-white"
                    style={{ background: asset.color }}
                  >
                    {asset.symbol.slice(0, 4)}
                  </span>
                  <div>
                    <p className="text-[13px] font-extrabold text-slate-100">{asset.symbol}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {asset.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-bold text-slate-100">{asset.valueLabel}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{asset.priceLabel}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-[16px] p-6" style={{ background: SURF, border: BDR }}>
          <p className="text-[14px] font-bold text-slate-100">LP Positions</p>
          <p className="mt-2 text-[12px] text-slate-400">Open liquidity positions from the Pools page to surface them here.</p>
        </div>
      )}
    </div>
  );
}
