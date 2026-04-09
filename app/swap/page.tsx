'use client';

import dynamic from 'next/dynamic';

const SwapCardEnhanced = dynamic(
  () => import('@/components/swap/SwapCardEnhanced').then((m) => ({ default: m.SwapCardEnhanced })),
  { ssr: false, loading: () => <div className="h-[480px] w-full max-w-[381px] rounded-[14px] bg-[#1e293b] animate-pulse" /> }
);

export default function SwapPage() {
  return (
    <div className="w-full px-4 py-5 md:px-7 md:py-7" style={{ maxWidth: 1140 }}>
      <div className="flex min-h-[calc(100vh-180px)] items-start justify-center pt-2 md:pt-6">
        <div className="w-full max-w-[520px]">
          <SwapCardEnhanced />
        </div>
      </div>
    </div>
  );
}
