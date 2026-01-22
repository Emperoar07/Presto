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
  height = 180,
  withWordmark = true,
  className,
}: Props) {
  return (
    <div className={className} style={{ width, height }}>
      <svg
        viewBox="0 0 900 280"
        width="100%"
        height="100%"
        role="img"
        aria-label="PrestoDEX Motion Staff Logo"
      >
        <defs>
          <linearGradient id="flowGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--accent-primary, #7c3aed)" />
            <stop offset="60%" stopColor="var(--accent-secondary, #22d3ee)" />
            <stop offset="100%" stopColor="var(--accent-primary, #7c3aed)" />
          </linearGradient>

          <filter id="softGlow" x="-40%" y="-80%" width="180%" height="260%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <path
            id="staffCurve"
            d="M 90 90
               C 220 55, 340 55, 460 90
               S 700 135, 830 85"
          />

          {/* Text curve - follows the staff with offset for text placement */}
          <path
            id="textCurve"
            d="M 90 118
               C 220 82, 340 82, 460 118
               S 700 162, 830 112"
          />

          <style>{`
            .staff {
              fill: none;
              stroke: url(#flowGrad);
              stroke-width: 8;
              stroke-linecap: round;
              opacity: 0.9;
              filter: url(#softGlow);
            }

            .staff.muted {
              opacity: 0.45;
              stroke-width: 7;
            }

            .flow {
              stroke-dasharray: 20 26;
              animation: dash 1.4s linear infinite;
            }

            @keyframes dash {
              to { stroke-dashoffset: -92; }
            }

            .node {
              filter: url(#softGlow);
              animation: pulse 1.3s ease-in-out infinite;
            }

            @keyframes pulse {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.15); }
            }

            .wordmark {
              font-family: ui-sans-serif, system-ui;
              font-weight: 800;
              fill: var(--text-primary, #e5e7eb);
              letter-spacing: -0.02em;
            }

            .dex {
              fill: var(--accent-primary, #7c3aed);
            }
          `}</style>
        </defs>

        <use href="#staffCurve" className="staff muted" />
        <use href="#staffCurve" className="staff muted" transform="translate(0, 18)" />
        <use href="#staffCurve" className="staff" transform="translate(0, 36)" />
        <use href="#staffCurve" className="staff muted" transform="translate(0, 54)" />
        <use href="#staffCurve" className="staff muted" transform="translate(0, 72)" />

        <use href="#staffCurve" className="staff flow" transform="translate(0, 36)" />

        <g className="node">
          <circle cx="470" cy="126" r="16" fill="url(#flowGrad)" />
          <circle cx="510" cy="112" r="7" fill="var(--accent-secondary, #22d3ee)" />
          <path
            d="M 483 121 Q 498 114 507 113"
            stroke="var(--accent-secondary, #22d3ee)"
            strokeWidth="5"
            strokeLinecap="round"
            fill="none"
          />
        </g>

        {withWordmark && (
          <text fontSize="56" className="wordmark">
            <textPath href="#textCurve" startOffset="18%">
              Presto<tspan className="dex" dy="-8" dx="-2">DEX</tspan>
            </textPath>
          </text>
        )}
      </svg>
    </div>
  );
}
