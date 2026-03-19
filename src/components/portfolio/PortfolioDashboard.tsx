'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAccount, useChainId, useBalance, useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import Link from 'next/link';
import { getHubToken, getTokens, isHubToken, type Token } from '@/config/tokens';
import { getExplorerTxUrl } from '@/lib/explorer';
import { Hooks } from '@/lib/tempo';
import { getContractAddresses, isArcChain, ZERO_ADDRESS } from '@/config/contracts';

const ERC20_BALANCE_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const TOKEN_COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-primary',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
];

const isStableLikeToken = (symbol: string) => {
  const upper = symbol.toUpperCase();
  return (
    upper.includes('USD') ||
    upper === 'USDC' ||
    upper === 'USDT' ||
    upper === 'EURC' ||
    upper === 'WUSDC'
  );
};

function TokenRow({
  symbol,
  name,
  address,
  decimals,
  colorClass,
  walletAddress,
}: {
  symbol: string;
  name: string;
  address: `0x${string}`;
  decimals: number;
  colorClass: string;
  walletAddress: `0x${string}`;
}) {
  const isNative = address === '0x0000000000000000000000000000000000000000';

  const { data: nativeBal } = useBalance({
    address: walletAddress,
    query: { enabled: isNative },
  });

  const { data: tokenBal } = useReadContract({
    address,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: [walletAddress],
    query: { enabled: !isNative },
  });

  const balanceFormatted = useMemo(() => {
    if (isNative && nativeBal) {
      return parseFloat(formatUnits(nativeBal.value, decimals)).toFixed(4);
    }
    if (!isNative && tokenBal !== undefined) {
      return parseFloat(formatUnits(tokenBal as bigint, decimals)).toFixed(decimals <= 6 ? 2 : 4);
    }
    return '--';
  }, [isNative, nativeBal, tokenBal, decimals]);

  const numericBalance = useMemo(() => {
    if (balanceFormatted === '--') return null;
    const parsed = Number.parseFloat(balanceFormatted.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }, [balanceFormatted]);

  const priceDisplay = isStableLikeToken(symbol) ? '$1.00' : 'N/A';
  const valueDisplay = numericBalance === null
    ? '--'
    : `$${numericBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <tr className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/30">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div
            className={`size-9 ${colorClass} flex items-center justify-center rounded-full text-xs font-bold text-white`}
          >
            {symbol.slice(0, 4)}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{name}</p>
            <p className="text-xs text-slate-500">{symbol}</p>
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <p className="text-sm text-slate-700 dark:text-slate-300">{priceDisplay}</p>
      </td>
      <td className="px-6 py-4">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {balanceFormatted} {symbol}
        </p>
      </td>
      <td className="px-6 py-4 text-right">
        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{valueDisplay}</p>
      </td>
    </tr>
  );
}

type TabId = 'tokens' | 'lp';

function LpPositionRow({
  token,
  validatorToken,
  walletAddress,
  chainId,
}: {
  token: Token;
  validatorToken: Token;
  walletAddress: `0x${string}`;
  chainId: number;
}) {
  const { data: liquidity } = (Hooks.amm.useLiquidityBalance
    ? Hooks.amm.useLiquidityBalance({
        address: walletAddress,
        userToken: token.address,
        validatorToken: validatorToken.address,
      })
    : { data: null }) as { data: bigint | null };

  const amount = liquidity ? Number(formatUnits(liquidity, 18)) : 0;

  if (amount <= 0) return null;

  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/40">
      <div>
        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
          {token.symbol} / {validatorToken.symbol}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {isArcChain(chainId) ? 'Stable liquidity position' : 'Fee liquidity position'}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{amount.toFixed(4)}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">LP balance</p>
      </div>
    </div>
  );
}

function LpPositionsView({
  chainId,
  tokens,
  walletAddress,
}: {
  chainId: number;
  tokens: Token[];
  walletAddress: `0x${string}`;
}) {
  const validatorToken = getHubToken(chainId);
  const isArcTestnet = isArcChain(chainId);
  const hasArcDeployment = getContractAddresses(chainId).HUB_AMM_ADDRESS !== ZERO_ADDRESS;
  const positionTokens = tokens.filter((token) => !isHubToken(token, chainId));

  if (isArcTestnet && !hasArcDeployment) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-600">water_drop</span>
        <p className="font-medium text-slate-500 dark:text-slate-400">Arc liquidity is not deployed in this environment yet</p>
        <Link
          href="/liquidity"
          className="rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-background-dark transition-colors hover:bg-primary/90"
        >
          Open Liquidity Page
        </Link>
      </div>
    );
  }

  if (!validatorToken) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white p-12 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-600">water_drop</span>
        <p className="font-medium text-slate-500 dark:text-slate-400">No LP positions found</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Your LP Positions</h3>
        <Link
          href="/liquidity"
          className="text-sm font-semibold text-primary transition-colors hover:text-primary/80"
        >
          Manage
        </Link>
      </div>
      <div className="space-y-3">
        {positionTokens.map((token) => (
          <LpPositionRow
            key={token.address}
            token={token}
            validatorToken={validatorToken}
            walletAddress={walletAddress}
            chainId={chainId}
          />
        ))}
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
          Only pairs with a non-zero LP balance will appear here.
        </div>
      </div>
    </div>
  );
}

export function PortfolioDashboard() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const tokens = getTokens(chainId);
  const [activeTab, setActiveTab] = useState<TabId>('tokens');
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'tokens', label: 'Tokens', icon: 'token' },
    { id: 'lp', label: 'LP Positions', icon: 'water_drop' },
  ];

  if (!isConnected || !address) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
          <span className="material-symbols-outlined text-5xl text-primary">account_balance_wallet</span>
        </div>
        <div>
          <h2 className="mb-2 text-2xl font-bold text-slate-900 dark:text-white">Connect Your Wallet</h2>
          <p className="max-w-sm text-slate-500 dark:text-slate-400">
            Connect your wallet to view your portfolio, balances, and transaction history.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 md:py-7">
      <div className="mb-8">
        <div className="flex flex-col justify-center gap-4 rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <p className="text-base font-medium text-slate-500 dark:text-slate-400">Portfolio Summary</p>
            <span className="rounded-full bg-green-500/10 px-2.5 py-1 text-xs font-bold text-green-600 dark:text-green-500">
              On-chain
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-5xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
              {tokens.length}
            </p>
            <span className="text-lg font-semibold text-slate-500 dark:text-slate-400">assets tracked</span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Wallet balances and protocol activity for the connected network.
          </p>
          <div className="mt-2 flex gap-2">
            <Link
              href="/swap"
              className="flex-1 rounded-xl bg-primary py-2.5 text-center text-sm font-bold text-background-dark transition-transform hover:bg-primary/90 active:scale-95"
            >
              Swap
            </Link>
            <Link
              href="/liquidity"
              className="flex-1 rounded-xl bg-slate-100 py-2.5 text-center text-sm font-bold text-slate-900 transition-transform hover:bg-slate-200 active:scale-95 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              Add Liquidity
            </Link>
          </div>
        </div>
      </div>

      <div className="mb-6 flex overflow-x-auto border-b border-slate-200 dark:border-slate-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-primary font-bold text-primary'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {activeTab === 'tokens' && (
            <>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Your Assets</h3>
                <span className="flex items-center gap-1 text-sm font-medium text-primary">
                  <span className="material-symbols-outlined text-sm">filter_list</span>
                  {tokens.length} tokens
                </span>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
                    <tr>
                      <th className="px-6 py-4">Asset</th>
                      <th className="px-6 py-4">Price</th>
                      <th className="px-6 py-4">Balance</th>
                      <th className="px-6 py-4 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {tokens.map((token, i) => (
                      <TokenRow
                        key={token.address}
                        symbol={token.symbol}
                        name={token.name}
                        address={token.address}
                        decimals={token.decimals}
                        colorClass={TOKEN_COLORS[i % TOKEN_COLORS.length]}
                        walletAddress={address}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeTab === 'lp' && (
            <LpPositionsView chainId={chainId} tokens={tokens} walletAddress={address} />
          )}

        </div>

        <div className="space-y-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Recent History</h3>
            <Link href="/transactions" className="text-xs font-bold uppercase text-primary hover:underline">
              View All
            </Link>
          </div>

          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            <RecentHistoryFeed address={address} chainId={chainId} />
          </div>

        </div>
      </div>
    </div>
  );
}

function RecentHistoryFeed({ address, chainId }: { address: `0x${string}`; chainId: number }) {
  const [items, setItems] = useState<
    { hash: string; type: string; status: string; block: string }[]
  >([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/transactions?address=${address}&chainId=${chainId}&limit=3`)
      .then((r) => r.json())
      .then((data) => {
        setItems(data.items ?? []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [address, chainId]);

  const txIcon: Record<string, string> = {
    swap: 'swap_horiz',
    order: 'candlestick_chart',
    liquidity: 'water_drop',
    mint: 'add_circle',
    burn: 'remove_circle',
    cancel: 'cancel',
  };

  const getIcon = (type: string) => {
    const lower = type.toLowerCase();
    for (const [key, icon] of Object.entries(txIcon)) {
      if (lower.includes(key)) return icon;
    }
    return 'receipt_long';
  };

  const isPrimary = (type: string) => type.toLowerCase().includes('swap');

  if (!loaded) {
    return (
      <div className="space-y-3 p-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 animate-pulse">
            <div className="size-10 rounded-full bg-slate-200 dark:bg-slate-700" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
              <div className="h-2.5 w-1/2 rounded bg-slate-100 dark:bg-slate-800" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
        No recent transactions
      </div>
    );
  }

  return (
    <>
      {items.map((item) => (
        <a
          key={item.hash}
          href={getExplorerTxUrl(chainId, item.hash as `0x${string}`)}
          target="_blank"
          rel="noreferrer"
          className="flex cursor-pointer items-center justify-between rounded-xl p-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/30"
        >
          <div className="flex items-center gap-3">
            <div
              className={`size-10 rounded-full flex items-center justify-center ${
                isPrimary(item.type)
                  ? 'bg-primary/10 text-primary dark:bg-primary/20'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">{getIcon(item.type)}</span>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{item.type}</p>
              <p className="text-xs text-slate-500">Block {item.block}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-mono text-xs text-slate-500">
              {item.hash.slice(0, 6)}...{item.hash.slice(-4)}
            </p>
            <p
              className={`text-[10px] font-bold uppercase ${
                item.status === 'Success' || item.status === 'Confirmed'
                  ? 'text-green-600 dark:text-green-500'
                  : item.status === 'Failed'
                    ? 'text-red-500'
                    : 'text-amber-500'
              }`}
            >
              {item.status}
            </p>
          </div>
        </a>
      ))}
    </>
  );
}
