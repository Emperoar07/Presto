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
      <div className="absolute inset-0 opacity-60" aria-hidden="true">
        <div className="absolute -left-20 top-1/3 h-72 w-[120%] rotate-[-4deg] rounded-[999px] bg-gradient-to-r from-[#00F3FF]/10 via-[#2E0249]/10 to-[#BC13FE]/10 blur-[2px]" />
        <div className="absolute -right-24 top-[55%] h-56 w-[120%] rotate-[3deg] rounded-[999px] bg-gradient-to-r from-[#BC13FE]/10 via-[#00F3FF]/10 to-[#2E0249]/10 blur-[2px]" />
        <div className="absolute inset-0 opacity-40 mix-blend-screen">
          <div className="h-full w-full bg-[radial-gradient(circle_at_20%_40%,rgba(0,243,255,0.2),transparent_55%),radial-gradient(circle_at_80%_30%,rgba(188,19,254,0.16),transparent_50%),radial-gradient(circle_at_50%_75%,rgba(46,2,73,0.2),transparent_60%)]" />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.04),transparent_40%,rgba(255,255,255,0.02))] opacity-60" />
      </div>
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
