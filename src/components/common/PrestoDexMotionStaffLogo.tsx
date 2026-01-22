'use client';

import React from 'react';

type Props = {
  width?: number;
  height?: number;
  withWordmark?: boolean;
  className?: string;
};

export function PrestoDexMotionStaffLogo({
  width = 520,
  height = 160,
  withWordmark = true,
  className,
}: Props) {
  return (
    <div className={className} style={{ width, height }}>
      <svg
        viewBox="0 0 900 260"
        width="100%"
        height="100%"
        role="img"
        aria-label="PrestoDEX Motion Staff logo"
      >
        <defs>
          <linearGradient id="pdGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--pd-primary, #7c3aed)" />
            <stop offset="60%" stopColor="var(--pd-secondary, #06b6d4)" />
            <stop offset="100%" stopColor="var(--pd-primary, #7c3aed)" />
          </linearGradient>

          <filter id="pdGlow" x="-40%" y="-80%" width="180%" height="260%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="
                1 0 0 0 0
                0 1 0 0 0
                0 0 1 0 0
                0 0 0 .35 0
              "
              result="glow"
            />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <mask id="pdSweepMask">
            <rect width="900" height="260" fill="black" />
            <rect x="-220" y="0" width="220" height="260" fill="white">
              <animate
                attributeName="x"
                from="-220"
                to="900"
                dur="2.6s"
                repeatCount="indefinite"
              />
            </rect>
          </mask>

          <path
            id="pdCurve"
            d="M 90 90
               C 210 58, 320 58, 435 90
               S 660 132, 810 86"
          />
          <style>{`
            .pd-staff {
              fill: none;
              stroke: url(#pdGrad);
              stroke-width: 8;
              stroke-linecap: round;
              stroke-linejoin: round;
              filter: url(#pdGlow);
              opacity: .95;
            }
            .pd-staff--muted {
              opacity: .55;
              stroke-width: 7;
            }
            .pd-flowDash {
              stroke-dasharray: 18 22;
              animation: pdDash 1.35s linear infinite;
            }
            @keyframes pdDash {
              to { stroke-dashoffset: -80; }
            }

            .pd-node {
              filter: url(#pdGlow);
              transform-origin: center;
              animation: pdPulse 1.25s ease-in-out infinite;
            }
            @keyframes pdPulse {
              0%, 100% { transform: scale(1); opacity: .95; }
              50% { transform: scale(1.12); opacity: 1; }
            }

            .pd-wordmark {
              font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
              font-weight: 800;
              letter-spacing: -0.02em;
              fill: var(--pd-text, #0b1220);
            }
            .pd-wordmark .dex {
              fill: var(--pd-primary, #7c3aed);
            }
          `}</style>
        </defs>

        <g>
          <use href="#pdCurve" className="pd-staff pd-staff--muted" transform="translate(0, 0)" />
          <use href="#pdCurve" className="pd-staff pd-staff--muted" transform="translate(0, 18)" />
          <use href="#pdCurve" className="pd-staff" transform="translate(0, 36)" />
          <use href="#pdCurve" className="pd-staff pd-staff--muted" transform="translate(0, 54)" />
          <use href="#pdCurve" className="pd-staff pd-staff--muted" transform="translate(0, 72)" />
        </g>

        <g opacity="0.95">
          <use
            href="#pdCurve"
            className="pd-staff pd-flowDash"
            transform="translate(0, 36)"
            mask="url(#pdSweepMask)"
          />
        </g>

        <g className="pd-node">
          <circle cx="470" cy="126" r="16" fill="url(#pdGrad)" />
          <circle cx="512" cy="112" r="7" fill="var(--pd-secondary, #06b6d4)" opacity="0.95" />
          <path
            d="M 483 121 Q 498 114 507 113"
            stroke="var(--pd-secondary, #06b6d4)"
            strokeWidth="5"
            strokeLinecap="round"
            fill="none"
            opacity="0.9"
          />
        </g>

        {withWordmark && (
          <g transform="translate(90, 210)">
            <text className="pd-wordmark" fontSize="64">
              Presto<tspan className="dex">DEX</tspan>
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
