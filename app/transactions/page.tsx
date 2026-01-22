import { TransactionsExplorer } from '@/components/transactions/TransactionsExplorer';

export default function TransactionsPage() {
  return (
    <div className="min-h-screen px-6 py-10 flex flex-col items-center">
      <div className="w-full max-w-5xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Transactions</h1>
          <p className="text-zinc-400 mt-2">Recent activity and status for selected tokens.</p>
        </div>
        <TransactionsExplorer />
      </div>
    </div>
  );
}
