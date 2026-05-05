"use client";

export function LoadingScreen() {
  return (
    <div className="pristine-loader-container" role="alert" aria-busy="true" aria-label="Loading data">
      <div className="pristine-loader">
        <svg className="pristine-loader__svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="blue-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0066ff" />
              <stop offset="50%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#60a5fa" />
            </linearGradient>
            <linearGradient id="glass-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity={1} />
              <stop offset="50%" stopColor="#e0f2fe" stopOpacity={0.6} />
              <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Ambient Glow Layer */}
          <circle className="pristine-loader__glow" cx="50" cy="50" r="44" />

          {/* Core 3D Line */}
          <circle className="pristine-loader__core" cx="50" cy="50" r="44" />

          {/* Glassy Specular Highlight */}
          <circle className="pristine-loader__highlight" cx="50" cy="50" r="44" />
        </svg>
      </div>
    </div>
  );
}

// candle data: [x, bodyY, bodyH, wickTop, wickBottom, isGreen]
const CANDLES: [number, number, number, number, number, boolean][] = [
  [14,  52, 28, 44, 88, true],
  [40,  38, 30, 28, 78, false],
  [66,  46, 24, 36, 82, true],
  [92,  34, 36, 22, 80, false],
  [118, 50, 20, 42, 84, true],
  [144, 40, 32, 30, 86, false],
  [170, 44, 26, 34, 80, true],
  [196, 36, 34, 24, 82, false],
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
        viewBox="0 0 220 110"
        xmlns="http://www.w3.org/2000/svg"
      >
        {CANDLES.map(([x, bodyY, bodyH, wickTop, wickBottom, isGreen], i) => {
          const color = isGreen ? "#22c55e" : "#ef4444";
          const glowColor = isGreen ? "#16a34a" : "#dc2626";
          const candleCenterX = x;
          return (
            <g key={i} className="candle-group">
              {/* Glow filter via shadow rect */}
              <line
                className="candle-wick"
                x1={candleCenterX}
                y1={wickTop}
                x2={candleCenterX}
                y2={wickBottom}
                stroke={glowColor}
                strokeWidth={1.5}
                strokeLinecap="round"
              />
              <rect
                className="candle-body"
                x={candleCenterX - 7}
                y={bodyY}
                width={14}
                height={bodyH}
                rx={2}
                fill={color}
                fillOpacity={0.9}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
