'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTransactions } from '@/hooks/useApiQueries';
import type { BridgeHistoryItem } from '@/components/bridge/types';
import { BRIDGE_HISTORY_STORAGE_KEY, NETWORKS, isValidBridgeHistoryItem } from '@/components/bridge/constants';
import {
  LOCAL_ACTIVITY_STORAGE_KEY,
  type LocalActivityRecord,
  readLocalActivityHistory,
} from '@/lib/activityHistory';

const SURF = '#1e293b';
const SURF_2 = '#263347';
const BDR = '1px solid rgba(255,255,255,0.07)';

type TxItem = {
  hash: string;
  block: string;
  type: string;
  status: string;
  amount: string;
  timestamp?: number;
};

type ActivityCategory = 'swaps' | 'liquidity' | 'bridge' | 'send';

type ActivityItem = {
  id: string;
  category: ActivityCategory;
  title: string;
  subtitle: string;
  statusLabel: string;
  statusTone: string;
  timeLabel: string;
  timestamp: number;
  hashLabel?: string;
  hash?: string;
  icon: string;
  iconBg: string;
  iconColor: string;
};

function formatRelativeTime(timestamp: number) {
  if (!timestamp) return 'Recent';
  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

  if (diffSeconds < 5) return 'Just now';
  if (diffSeconds < 60) return `${diffSeconds}s ago`;

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

function buildApiActivity(item: TxItem): ActivityItem {
  const normalized = item.type.toLowerCase();
  const category: ActivityCategory = normalized.includes('swap')
    ? 'swaps'
    : normalized.includes('bridge')
      ? 'bridge'
      : 'liquidity';

  const success = item.status === 'Success' || item.status === 'Confirmed';
  const failed = item.status === 'Failed';
  const statusLabel = success ? 'Confirmed' : failed ? 'Failed' : item.status || 'Pending';
  const statusTone = success ? 'text-emerald-400' : failed ? 'text-rose-400' : 'text-amber-400';

  const visual =
    category === 'swaps'
      ? { icon: 'swap_horiz', bg: 'rgba(37,192,244,0.12)', color: '#25c0f4' }
      : category === 'bridge'
        ? { icon: 'sync_alt', bg: 'rgba(139,92,246,0.12)', color: '#a78bfa' }
        : { icon: 'water', bg: 'rgba(34,197,94,0.12)', color: '#22c55e' };

  return {
    id: `api-${item.hash}-${item.block}`,
    category,
    title: item.type,
    subtitle: item.amount && item.amount !== '0' ? `Amount ${item.amount}` : `Block ${item.block}`,
    statusLabel,
    statusTone,
    timeLabel: formatRelativeTime(item.timestamp ?? 0),
    timestamp: item.timestamp ?? 0,
    hashLabel: `${item.hash.slice(0, 6)}...${item.hash.slice(-4)}`,
    hash: item.hash,
    icon: visual.icon,
    iconBg: visual.bg,
    iconColor: visual.color,
  };
}

function buildBridgeActivity(item: BridgeHistoryItem): ActivityItem {
  const effectiveState = item.liveState ?? item.state;
  const success = effectiveState === 'success';
  const failed = effectiveState === 'error';
  const sourceLabel = NETWORKS[item.sourceKey]?.shortLabel ?? item.sourceKey;
  const destinationLabel = NETWORKS[item.destinationKey]?.shortLabel ?? item.destinationKey;

  return {
    id: `bridge-${item.id}`,
    category: 'bridge',
    title: `${sourceLabel} to ${destinationLabel}`,
    subtitle: `${item.amount} USDC`,
    statusLabel: success ? 'Completed' : failed ? 'Failed' : 'Pending',
    statusTone: success ? 'text-emerald-400' : failed ? 'text-rose-400' : 'text-amber-400',
    timeLabel: formatRelativeTime(item.createdAt),
    timestamp: item.createdAt,
    hashLabel: item.sourceTxHash ? `${item.sourceTxHash.slice(0, 6)}...${item.sourceTxHash.slice(-4)}` : undefined,
    hash: item.sourceTxHash ?? undefined,
    icon: failed ? 'error' : 'sync_alt',
    iconBg: failed ? 'rgba(244,63,94,0.10)' : success ? 'rgba(167,139,250,0.12)' : 'rgba(245,158,11,0.12)',
    iconColor: failed ? '#f43f5e' : success ? '#a78bfa' : '#fbbf24',
  };
}

function buildLocalActivity(item: LocalActivityRecord): ActivityItem {
  const success = item.status === 'success';
  const failed = item.status === 'error';
  const visual =
    item.category === 'swaps'
      ? { icon: 'swap_horiz', bg: 'rgba(37,192,244,0.12)', color: '#25c0f4' }
      : { icon: 'water', bg: 'rgba(34,197,94,0.12)', color: '#22c55e' };

  return {
    id: `local-${item.id}`,
    category: item.category,
    title: item.title,
    subtitle: failed && item.errorMessage ? item.errorMessage : item.subtitle,
    statusLabel: success ? 'Confirmed' : failed ? 'Failed' : 'Pending',
    statusTone: success ? 'text-emerald-400' : failed ? 'text-rose-400' : 'text-amber-400',
    timeLabel: formatRelativeTime(item.updatedAt || item.createdAt),
    timestamp: item.updatedAt || item.createdAt,
    hashLabel: item.hash ? `${item.hash.slice(0, 6)}...${item.hash.slice(-4)}` : undefined,
    hash: item.hash ?? undefined,
    icon: visual.icon,
    iconBg: visual.bg,
    iconColor: visual.color,
  };
}

export default function TransactionsPage() {
  const [filter, setFilter] = useState<'all' | 'swaps' | 'liquidity' | 'bridge'>('all');
  const [bridgeHistory, setBridgeHistory] = useState<BridgeHistoryItem[]>([]);
  const [localActivity, setLocalActivity] = useState<LocalActivityRecord[]>([]);
  const { data: items = [], isLoading } = useTransactions();

  useEffect(() => {
    const syncLocalActivity = () => {
      try {
        setLocalActivity(readLocalActivityHistory());
      } catch {
        setLocalActivity([]);
      }
    };

    const readBridgeHistory = () => {
      try {
        const raw = localStorage.getItem(BRIDGE_HISTORY_STORAGE_KEY);
        if (!raw) {
          setBridgeHistory([]);
        } else {
          const parsed = JSON.parse(raw) as unknown[];
          setBridgeHistory(Array.isArray(parsed) ? parsed.filter(isValidBridgeHistoryItem) : []);
        }
      } catch {
        setBridgeHistory([]);
      }

      syncLocalActivity();
    };

    readBridgeHistory();
    const intervalId = window.setInterval(readBridgeHistory, 10_000);
    const onStorage = (event: StorageEvent) => {
      if (event.key === BRIDGE_HISTORY_STORAGE_KEY || event.key === LOCAL_ACTIVITY_STORAGE_KEY) {
        readBridgeHistory();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const activityItems = useMemo(() => {
    const apiItems = (items as TxItem[]).map(buildApiActivity);
    const bridgeItems = bridgeHistory.map(buildBridgeActivity);
    const apiHashes = new Set(apiItems.map((item) => item.hash).filter(Boolean));
    const localItems = localActivity
      .map(buildLocalActivity)
      .filter((item) => {
        if (item.hash && apiHashes.has(item.hash) && item.statusLabel === 'Confirmed') return false;
        return true;
      });
    return [...localItems, ...apiItems, ...bridgeItems].sort((a, b) => b.timestamp - a.timestamp);
  }, [bridgeHistory, items, localActivity]);

  const filteredItems = useMemo(() => {
    if (filter === 'all') return activityItems;
    return activityItems.filter((item) => item.category === filter);
  }, [activityItems, filter]);

  return (
    <div className="w-full px-4 py-5 md:px-7 md:py-7" style={{ maxWidth: 1140 }}>
      <div className="overflow-hidden rounded-[16px]" style={{ background: SURF, border: BDR }}>
        <div className="flex flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5 md:py-[14px]" style={{ borderBottom: BDR }}>
          <p className="text-[14px] font-bold text-slate-100">Transaction History</p>
          <div className="flex gap-1 rounded-[10px] p-1" style={{ background: SURF_2 }}>
            {[
              { key: 'all', label: 'All' },
              { key: 'swaps', label: 'Swaps' },
              { key: 'liquidity', label: 'Liquidity' },
              { key: 'bridge', label: 'Bridge' },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key as typeof filter)}
                className={`rounded-[8px] px-[14px] py-[6px] text-[13px] font-semibold transition-all ${
                  filter === tab.key ? 'text-slate-100 shadow' : 'text-slate-500'
                }`}
                style={filter === tab.key ? { background: SURF } : {}}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading && filteredItems.length === 0 ? (
          <div className="px-5 py-10 text-[13px] text-slate-500">Loading activity...</div>
        ) : filteredItems.length === 0 ? (
          <div className="px-5 py-10 text-[13px] text-slate-400">No transactions found for this wallet yet.</div>
        ) : (
          <div>
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 border-b px-5 py-3 last:border-b-0"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
              >
                <span
                  className="flex size-8 items-center justify-center rounded-[10px]"
                  style={{ background: item.iconBg, color: item.iconColor }}
                >
                  <span className="material-symbols-outlined text-[16px]">{item.icon}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-slate-100">{item.title}</p>
                  <p className="mt-0.5 truncate text-[11.5px] text-slate-500">{item.subtitle}</p>
                </div>
                <div className="text-right">
                  <p className={`text-[13px] font-bold ${item.statusTone}`}>{item.statusLabel}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{item.timeLabel}</p>
                  {item.hashLabel ? <p className="mt-0.5 text-[10px] text-slate-600">{item.hashLabel}</p> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
