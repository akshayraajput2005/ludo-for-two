import { useEffect, useState } from 'react';

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 25], [72, 25], [28, 50], [72, 50], [28, 75], [72, 75]],
};

interface Props {
  value: number | null;
  rolling: boolean;
  canRoll: boolean;
  color: string;
  onRoll: () => void;
}

export default function Dice({ value, rolling, canRoll, color, onRoll }: Props) {
  // While rolling, flicker random faces (purely visual; the real value comes from the server).
  const [face, setFace] = useState(value ?? 1);
  useEffect(() => {
    if (!rolling) { if (value) setFace(value); return; }
    const t = setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 80);
    return () => clearInterval(t);
  }, [rolling, value]);

  return (
    <button
      type="button"
      onClick={onRoll}
      disabled={!canRoll}
      aria-label={canRoll ? 'Roll the dice' : `Dice shows ${value ?? 'nothing yet'}`}
      className={`relative shrink-0 size-[4.5rem] sm:size-20 rounded-full transition-transform ${rolling ? 'dice-rolling' : ''} ${canRoll ? 'hover:scale-105 cursor-pointer' : 'cursor-default'}`}
      style={{ filter: canRoll ? `drop-shadow(0 0 10px ${color})` : undefined }}
    >
      {/* 3D cube in a ring: dark side face behind a glossy front face */}
      <svg viewBox="0 0 100 100" className="size-full">
        <defs>
          <linearGradient id="dice-face" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#e6dfe9" />
          </linearGradient>
          <radialGradient id="dice-pip" cx=".4" cy=".35" r=".7">
            <stop offset="0" stopColor="#4a3a50" />
            <stop offset="1" stopColor="#120a16" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="46" fill={color} fillOpacity={0.14} stroke={color} strokeWidth={canRoll ? 5 : 2.5} />
        <ellipse cx="54" cy="83" rx="27" ry="5" fill="#000" opacity={0.18} />
        <rect x="23" y="23" width="58" height="58" rx="15" fill="#c9bfce" />
        <rect x="19" y="18" width="58" height="58" rx="15" fill="url(#dice-face)" />
        <ellipse cx="35" cy="27" rx="11" ry="5" fill="#fff" opacity={0.9} />
        <g transform="translate(19 18) scale(.58)">
          {(PIPS[face] ?? []).map(([x, y], i) => <circle key={i} cx={x} cy={y} r="10" fill={face === 1 ? '#e5484d' : 'url(#dice-pip)'} />)}
        </g>
      </svg>
      {canRoll && !rolling && (
        <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-extrabold uppercase tracking-wider bg-[var(--card)] px-1.5 rounded-full">Tap</span>
      )}
    </button>
  );
}
