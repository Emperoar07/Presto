'use client';

import { memo } from 'react';
import clsx from 'clsx';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
}

/**
 * Lightweight skeleton loading component
 * Uses CSS animation for smooth loading states
 */
export const Skeleton = memo(function Skeleton({
  className,
  variant = 'rectangular',
  width,
  height,
}: SkeletonProps) {
  const baseStyles = 'animate-skeleton rounded';

  const variantStyles = {
    text: 'h-4 rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  };

  return (
    <div
      className={clsx(baseStyles, variantStyles[variant], className)}
      style={{
        width: width ?? '100%',
        height: height ?? (variant === 'text' ? '1rem' : '100%'),
      }}
    />
  );
});

/**
 * Skeleton for swap card loading state
 */
export const SwapCardSkeleton = memo(function SwapCardSkeleton() {
  return (
    <div className="w-full p-7 rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md animate-fade-in">
      {/* Header */}
      <div className="mb-7">
        <Skeleton width={100} height={28} className="mb-2" />
        <Skeleton width={180} height={16} />
      </div>

      {/* Input field */}
      <div className="p-5 rounded-xl bg-black/20 border border-white/5 mb-4">
        <div className="flex justify-between mb-3">
          <Skeleton width={60} height={14} />
          <Skeleton width={100} height={14} />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton width="60%" height={32} />
          <Skeleton width={80} height={36} variant="rectangular" />
        </div>
      </div>

      {/* Swap button placeholder */}
      <div className="flex justify-center my-4">
        <Skeleton width={40} height={40} variant="circular" />
      </div>

      {/* Output field */}
      <div className="p-5 rounded-xl bg-black/20 border border-white/5 mb-6">
        <div className="flex justify-between mb-3">
          <Skeleton width={60} height={14} />
          <Skeleton width={100} height={14} />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton width="60%" height={32} />
          <Skeleton width={80} height={36} variant="rectangular" />
        </div>
      </div>

      {/* Action button */}
      <Skeleton height={52} className="rounded-xl" />
    </div>
  );
});

/**
 * Skeleton for balance display
 */
export const BalanceSkeleton = memo(function BalanceSkeleton() {
  return <Skeleton width={60} height={14} className="inline-block" />;
});

/**
 * Skeleton for orderbook rows
 */
export const OrderbookRowSkeleton = memo(function OrderbookRowSkeleton() {
  return (
    <div className="flex justify-between py-1">
      <Skeleton width={60} height={14} />
      <Skeleton width={80} height={14} />
    </div>
  );
});
