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
    <div className="w-full px-4 py-5 md:px-7 md:py-7" style={{ maxWidth: 1140 }}>
      <BridgeSolanaProvider>
        <Suspense fallback={null}>
          <BridgeWorkspace />
        </Suspense>
      </BridgeSolanaProvider>
    </div>
  );
}
