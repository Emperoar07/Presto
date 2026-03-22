'use client';

import { memo } from 'react';

interface BridgeLogoProps {
  size?: number;
  className?: string;
}

/**
 * Animated Token Bridge logo — two nodes connected by flowing data paths.
 * Supports dark/light themes via currentColor.
 */
export const BridgeLogo = memo(function BridgeLogo({ size = 32, className = '' }: BridgeLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 400 400"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="PrestoDEX logo"
    >
      <defs>
        <linearGradient id="bridgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
        <filter id="bridgeGlow">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      <style>{`
        @keyframes flowDot1 {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        @keyframes flowDot2 {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes flowDot3 {
          0%, 100% { opacity: 0.5; }
          25% { opacity: 1; }
          75% { opacity: 0.2; }
        }
        @keyframes pulseNode {
          0%, 100% { r: 8; opacity: 0.6; }
          50% { r: 10; opacity: 0.9; }
        }
        @keyframes orbitDash {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: -50.27; }
        }
        @keyframes flowPath {
          from { stroke-dashoffset: 40; }
          to { stroke-dashoffset: 0; }
        }
        .flow-dot-1 { animation: flowDot1 2s ease-in-out infinite; }
        .flow-dot-2 { animation: flowDot2 2s ease-in-out infinite; }
        .flow-dot-3 { animation: flowDot3 2.5s ease-in-out infinite; }
        .pulse-node-l { animation: pulseNode 3s ease-in-out infinite; }
        .pulse-node-r { animation: pulseNode 3s ease-in-out 1.5s infinite; }
        .orbit-l { animation: orbitDash 4s linear infinite; }
        .orbit-r { animation: orbitDash 4s linear infinite reverse; }
        .flow-main { animation: flowPath 1.5s linear infinite; }
      `}</style>

      {/* Background shape */}
      <rect x="40" y="40" width="320" height="320" rx="48" fill="currentColor" opacity="0.06" />
      <rect x="40" y="40" width="320" height="320" rx="48" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.1" />

      {/* Subtle background circles */}
      <circle cx="140" cy="140" r="40" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.04" />
      <circle cx="280" cy="280" r="50" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.04" />

      <g filter="url(#bridgeGlow)" transform="translate(200,200)">
        {/* Left node */}
        <circle cx="-55" cy="-20" r="22" fill="none" stroke="url(#bridgeGrad)" strokeWidth="4" />
        <circle cx="-55" cy="-20" className="pulse-node-l" fill="url(#bridgeGrad)" opacity="0.6" />

        {/* Right node */}
        <circle cx="55" cy="20" r="22" fill="none" stroke="url(#bridgeGrad)" strokeWidth="4" />
        <circle cx="55" cy="20" className="pulse-node-r" fill="url(#bridgeGrad)" opacity="0.6" />

        {/* Primary bridge path (animated dashes) */}
        <path
          d="M-33,-12 C-10,-30 10,30 33,12"
          fill="none"
          stroke="url(#bridgeGrad)"
          strokeWidth="4"
          strokeLinecap="round"
          className="flow-main"
          strokeDasharray="10 30"
        />
        {/* Solid bridge path underneath */}
        <path
          d="M-33,-12 C-10,-30 10,30 33,12"
          fill="none"
          stroke="url(#bridgeGrad)"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.4"
        />

        {/* Secondary bridge */}
        <path
          d="M-33,-28 C-5,-50 5,50 33,28"
          fill="none"
          stroke="url(#bridgeGrad)"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.25"
        />

        {/* Animated data dots flowing along bridge */}
        <circle cx="-14" cy="-10" r="3.5" fill="url(#bridgeGrad)" className="flow-dot-1" />
        <circle cx="0" cy="0" r="3" fill="url(#bridgeGrad)" className="flow-dot-3" />
        <circle cx="14" cy="10" r="3.5" fill="url(#bridgeGrad)" className="flow-dot-2" />

        {/* Orbiting dashed rings */}
        <circle
          cx="-55" cy="-20" r="32"
          fill="none"
          stroke="url(#bridgeGrad)"
          strokeWidth="1"
          opacity="0.2"
          strokeDasharray="8 8"
          className="orbit-l"
        />
        <circle
          cx="55" cy="20" r="32"
          fill="none"
          stroke="url(#bridgeGrad)"
          strokeWidth="1"
          opacity="0.2"
          strokeDasharray="8 8"
          className="orbit-r"
        />
      </g>
    </svg>
  );
});
