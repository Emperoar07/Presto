'use client';

import React from 'react';

type Props = {
  width?: number;
  height?: number;
  withWordmark?: boolean;
  className?: string;
};

export function PrestoDexMotionStaffLogo({
  width = 320,
  height = 120,
  withWordmark = true,
  className,
}: Props) {
  return (
    <div className={className} style={{ width, height }}>
      <svg
        viewBox="0 0 400 150"
        width="100%"
        height="100%"
        role="img"
        aria-label="PrestoDEX Motion Staff Logo"
      >
        <defs>
          {/* Main gradient - cyan to purple */}
          <linearGradient id="staffGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00F3FF" />
            <stop offset="50%" stopColor="#BC13FE" />
            <stop offset="100%" stopColor="#00F3FF" />
          </linearGradient>

          {/* Node gradient */}
          <linearGradient id="nodeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00F3FF" />
            <stop offset="100%" stopColor="#BC13FE" />
          </linearGradient>

          {/* Glow filter for nodes */}
          <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Soft glow for staff lines */}
          <filter id="staffGlow" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <style>{`
            @keyframes flowPulse {
              0%, 100% { opacity: 0.6; }
              50% { opacity: 1; }
            }

            @keyframes nodePulse {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.1); }
            }

            @keyframes noteFloat {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-2px); }
            }

            .staff-line {
              fill: none;
              stroke: url(#staffGradient);
              stroke-linecap: round;
              filter: url(#staffGlow);
            }

            .staff-line.flow {
              animation: flowPulse 2s ease-in-out infinite;
            }

            .main-node {
              filter: url(#nodeGlow);
              transform-origin: center;
              animation: nodePulse 2s ease-in-out infinite;
            }

            .small-note {
              transform-origin: center;
              animation: noteFloat 3s ease-in-out infinite;
            }

            .small-note.delay-1 { animation-delay: 0.5s; }
            .small-note.delay-2 { animation-delay: 1s; }
            .small-note.delay-3 { animation-delay: 1.5s; }

            .wordmark-text {
              font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
              font-weight: 700;
              fill: currentColor;
              letter-spacing: -0.02em;
            }

            .dex-text {
              fill: #00F3FF;
            }
          `}</style>
        </defs>

        {/* Music Staff - 5 curved parallel lines */}
        <g className="staff-group">
          {/* Line 1 - Top */}
          <path
            className="staff-line"
            d="M 40 25 C 100 15, 180 15, 240 30 S 340 55, 380 40"
            strokeWidth="2.5"
            opacity="0.5"
          />
          {/* Line 2 */}
          <path
            className="staff-line"
            d="M 40 35 C 100 25, 180 25, 240 40 S 340 65, 380 50"
            strokeWidth="2.5"
            opacity="0.6"
          />
          {/* Line 3 - Center (main flow line) */}
          <path
            className="staff-line flow"
            d="M 40 45 C 100 35, 180 35, 240 50 S 340 75, 380 60"
            strokeWidth="3"
            opacity="0.9"
          />
          {/* Line 4 */}
          <path
            className="staff-line"
            d="M 40 55 C 100 45, 180 45, 240 60 S 340 85, 380 70"
            strokeWidth="2.5"
            opacity="0.6"
          />
          {/* Line 5 - Bottom */}
          <path
            className="staff-line"
            d="M 40 65 C 100 55, 180 55, 240 70 S 340 95, 380 80"
            strokeWidth="2.5"
            opacity="0.5"
          />
        </g>

        {/* Main Note/Node - Large circle (swap point) */}
        <g className="main-node">
          <circle
            cx="85"
            cy="38"
            r="14"
            fill="url(#nodeGradient)"
          />
          {/* Inner highlight */}
          <circle
            cx="82"
            cy="35"
            r="4"
            fill="white"
            opacity="0.4"
          />
        </g>

        {/* Secondary Notes - Smaller dots along the staff */}
        <g className="notes-group">
          {/* Note 2 - Quarter note style */}
          <circle
            className="small-note delay-1"
            cx="200"
            cy="42"
            r="6"
            fill="url(#nodeGradient)"
            filter="url(#nodeGlow)"
          />

          {/* Note 3 - Eighth note style */}
          <circle
            className="small-note delay-2"
            cx="260"
            cy="55"
            r="5"
            fill="#00F3FF"
            filter="url(#nodeGlow)"
          />

          {/* Note 4 - On lower line */}
          <circle
            className="small-note delay-3"
            cx="310"
            cy="72"
            r="4"
            fill="#BC13FE"
            filter="url(#nodeGlow)"
          />
        </g>

        {/* DEX Node - Hexagon at the end (representing the exchange) */}
        <g className="main-node" style={{ animationDelay: '0.5s' }}>
          <polygon
            points="365,52 375,46 385,52 385,64 375,70 365,64"
            fill="url(#nodeGradient)"
            filter="url(#nodeGlow)"
          />
        </g>

        {/* Wordmark below the staff */}
        {withWordmark && (
          <text
            x="200"
            y="125"
            textAnchor="middle"
            className="wordmark-text"
            fontSize="32"
          >
            Presto<tspan className="dex-text">DEX</tspan>
          </text>
        )}
      </svg>
    </div>
  );
}
