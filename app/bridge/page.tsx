'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const BridgeWorkspace = dynamic(
  () => import('@/components/bridge/BridgeWorkspace').then((m) => ({ default: m.BridgeWorkspace })),
  { ssr: false },
);

export default function BridgePage() {
  return (
    <div className="w-full px-4 py-5 md:px-7 md:py-7" style={{ maxWidth: 1140 }}>
      <Suspense fallback={null}>
        <BridgeWorkspace />
      </Suspense>
    </div>
  );
}
