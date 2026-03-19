'use client';

import { TransactionsExplorer } from '@/components/transactions/TransactionsExplorer';

export default function TransactionsPage() {
  return (
    <div className="flex flex-col items-center px-6 py-5 md:py-7">
      <div className="w-full max-w-5xl">
        <TransactionsExplorer />
      </div>
    </div>
  );
}
