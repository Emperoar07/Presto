import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Analytics | Presto',
  description: 'Track trade volume, unique traders, active pools, and live order books on Arc Testnet.',
};

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
