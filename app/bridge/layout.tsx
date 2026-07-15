import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Bridge | Presto',
  description: 'Transfer USDC across Arc, Ethereum, Base, Avalanche, Arbitrum, and Optimism testnets with Circle CCTP.',
};

export default function BridgeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
