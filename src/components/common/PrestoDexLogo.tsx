'use client';

import React from 'react';

export function PrestoDexLogo() {
  return (
    <svg viewBox="0 0 900 260" width="100%" height="100%" role="img" aria-label="PrestoDEX logo">
      <defs>
        <linearGradient id="flowGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="60%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>

        <filter id="glow">
          <feGaussianBlur stdDeviation="3" />
        </filter>

        <path
          id="staffCurve"
          d="
            M 80 130
            C 220 95, 360 95, 500 130
            S 740 175, 860 130
          "
        />

        <path
          id="textCurve"
          d="
            M 80 110
            C 220 75, 360 75, 500 110
            S 740 155, 860 110
          "
        />

        <style>{`
          .staff {
            fill: none;
            stroke: url(#flowGrad);
            stroke-width: 7;
            opacity: 0.85;
          }
          .staff.muted {
            opacity: 0.45;
          }
          .word {
            font-family: ui-sans-serif, system-ui;
            font-weight: 800;
            letter-spacing: -0.02em;
            fill: #f3f4f6;
          }
          .dex {
            fill: #8b5cf6;
          }
        `}</style>
      </defs>

      <use href="#staffCurve" className="staff muted" transform="translate(0,-20)" />
      <use href="#staffCurve" className="staff muted" transform="translate(0,-10)" />
      <use href="#staffCurve" className="staff" />
      <use href="#staffCurve" className="staff muted" transform="translate(0,10)" />
      <use href="#staffCurve" className="staff muted" transform="translate(0,20)" />

      <circle cx="520" cy="128" r="9" fill="#22d3ee" filter="url(#glow)" />

      <text fontSize="42" className="word">
        <textPath href="#textCurve" startOffset="18%">
          Presto
          <tspan className="dex" dy="6" dx="-2">
            DEX
          </tspan>
        </textPath>
      </text>
    </svg>
  );
}
