import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Portfolio | Presto',
  description: 'View token balances, active LP positions, and swap history in one dashboard.',
};

export default function PortfolioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
