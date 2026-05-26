import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Liquidity Pools | Presto',
  description: 'Provide liquidity to stable swap pools, manage positions, and earn trading fees on Arc Testnet.',
};

export default function LiquidityLayout({ children }: { children: React.ReactNode }) {
  return children;
}
