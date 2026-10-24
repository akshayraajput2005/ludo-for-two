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
      className={`relative shrink-0 size-16 sm:size-[4.5rem] rounded-2xl transition-transform ${rolling ? 'dice-rolling' : ''} ${canRoll ? 'hover:scale-105 cursor-pointer' : 'cursor-default'}`}
      style={{ filter: canRoll ? `drop-shadow(0 0 12px ${color})` : undefined }}
    >
      <svg viewBox="0 0 100 100" className="size-full">
        <rect x="4" y="4" width="92" height="92" rx="22" fill="#fff" stroke={color} strokeWidth={canRoll ? 7 : 4} />
        {(PIPS[face] ?? []).map(([x, y], i) => <circle key={i} cx={x} cy={y} r="9" fill={face === 1 ? '#e8577e' : '#2a1d2e'} />)}
      </svg>
      {canRoll && !rolling && (
        <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-extrabold uppercase tracking-wider bg-[var(--card)] px-1.5 rounded-full">Tap</span>
      )}
    </button>
  );
}
