"use client";

import React from 'react';

/**
 * LoadingScreen
 * -------------
 * A high-performance, full-screen loading state featuring a 
 * synchronized candle "printing" animation.
 */
export function LoadingScreen() {
  return <CandleAnimation />;
}

const CANDLES: [number, number, number, number, number, boolean][] = [
  // [x, bodyTop, bodyHeight, wickTop, wickBottom, isGreen]
  [32, 42, 28, 32, 78, true],
  [60, 52, 18, 44, 76, false],
  [88, 34, 32, 24, 72, true],
  [116, 24, 24, 14, 58, true],
  [144, 38, 16, 30, 64, false],
  [172, 48, 22, 40, 82, false],
];

interface CandleAnimationProps {
  onTouchStart?: React.TouchEventHandler<HTMLDivElement>;
  onTouchMove?: React.TouchEventHandler<HTMLDivElement>;
  onTouchEnd?: React.TouchEventHandler<HTMLDivElement>;
  onTouchCancel?: React.TouchEventHandler<HTMLDivElement>;
}

export function CandleAnimation({ onTouchStart, onTouchMove, onTouchEnd, onTouchCancel }: CandleAnimationProps) {
  return (
    <div
      className="candle-anim-container"
      role="presentation"
      aria-hidden="true"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
    >
      <svg
        className="candle-anim-chart"
        viewBox="0 0 200 90"
        xmlns="http://www.w3.org/2000/svg"
      >
        <line className="candle-baseline" x1="8" y1="84" x2="192" y2="84" />
        
        {CANDLES.map(([x, bodyTop, bodyH, wickTop, wickBottom, isGreen], i) => (
          <g key={i} className={`candle-group candle-group--${i + 1}`}>
            <line
              className="candle-wick"
              x1={x} y1={wickTop}
              x2={x} y2={wickBottom}
              stroke={isGreen ? "var(--card-positive)" : "var(--card-negative)"}
              strokeWidth={1}
              strokeLinecap="round"
            />
            <rect
              className="candle-body"
              x={x - 3} y={bodyTop}
              width={6} height={bodyH}
              rx={1}
              fill={isGreen ? "var(--card-positive)" : "var(--card-negative)"}
            />
          </g>
        ))}
      </svg>
      
      <p className="candle-anim-footer">Analytic 6.0</p>
    </div>
  );
}
