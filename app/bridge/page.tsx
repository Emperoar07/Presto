'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const BridgeSolanaProvider = dynamic(
  () => import('@/components/bridge/BridgeSolanaProvider').then((m) => ({ default: m.BridgeSolanaProvider })),
  { ssr: false },
);

const BridgeWorkspace = dynamic(
  () => import('@/components/bridge/BridgeWorkspace').then((m) => ({ default: m.BridgeWorkspace })),
  { ssr: false },
);

export default function BridgePage() {
  return (
    <main className="px-4 py-8 md:px-6 md:py-10">
      <div className="mx-auto max-w-6xl">
        <BridgeSolanaProvider>
          <Suspense fallback={null}>
            <BridgeWorkspace />
          </Suspense>
        </BridgeSolanaProvider>
      </div>
    </main>
  );
}
