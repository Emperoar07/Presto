'use client';

import React, { memo } from 'react';

/**
 * Optimized Background Component
 * - Uses GPU-accelerated transforms instead of expensive blur filters
 * - Reduces paint operations with will-change hints
 * - Simplified gradient for better performance
 */
export const Background = memo(function Background() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-black">
      {/* Optimized gradient orbs - using opacity and gradients instead of blur */}
      <div
        className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-30"
        style={{
          background: 'radial-gradient(circle, #2E0249 0%, transparent 70%)',
          willChange: 'transform',
          transform: 'translateZ(0)',
        }}
      />
      <div
        className="absolute top-1/4 -right-32 w-80 h-80 rounded-full opacity-20"
        style={{
          background: 'radial-gradient(circle, #00F3FF 0%, transparent 70%)',
          willChange: 'transform',
          transform: 'translateZ(0)',
        }}
      />
      <div
        className="absolute -bottom-32 left-1/4 w-[28rem] h-[28rem] rounded-full opacity-25"
        style={{
          background: 'radial-gradient(circle, #2E0249 0%, transparent 70%)',
          willChange: 'transform',
          transform: 'translateZ(0)',
        }}
      />

      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '50px 50px',
        }}
      />
    </div>
  );
});
