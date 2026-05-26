import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Bridge | Presto',
  description: 'Transfer USDC securely across Arc, Base, Ethereum, and Solana networks via Circle CCTP.',
};

export default function BridgeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
