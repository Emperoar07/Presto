import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Swap | Presto',
  description: 'Swap tokens instantly on Arc Testnet with minimal slippage and optimal routing.',
};

export default function SwapLayout({ children }: { children: React.ReactNode }) {
  return children;
}
