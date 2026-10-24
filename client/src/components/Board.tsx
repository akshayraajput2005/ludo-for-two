import { COLORS, SAFE_SQUARES, START, type Color } from '../../../shared/board.ts';
import { BASE_ORIGIN, HOME_COL, TRACK, tokenPoint } from '../game/geometry';
import { COLOR_HEX, COLOR_SOFT } from '../game/types';

interface Props {
  tokens: Record<string, number[]>;
  activeColors: Color[];
  current: Color | null;
  legal: number[]; // token indices clickable for `myColor`
  myColor: Color | null;
  onPick: (token: number) => void;
}

const START_SQUARES = new Map(COLORS.map((c) => [START[c], c]));

function starPath(cx: number, cy: number, r: number) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    d += `${i ? 'L' : 'M'}${(cx + rr * Math.cos(a)).toFixed(3)},${(cy + rr * Math.sin(a)).toFixed(3)}`;
  }
  return d + 'Z';
}

export default function Board({ tokens, activeColors, current, legal, myColor, onPick }: Props) {
  // Group tokens by board point so stacked ones fan out instead of hiding each other.
  const placed = activeColors.flatMap((color) =>
    (tokens[color] ?? []).map((progress, index) => ({ color, index, progress, pt: tokenPoint(color, progress, index) })),
  );
  const stacks = new Map<string, number>();
  const withOffset = placed.map((t) => {
    const key = t.pt.join(',');
    const n = stacks.get(key) ?? 0;
    stacks.set(key, n + 1);
    return { ...t, key, slot: n };
  });
  const OFFS: [number, number][] = [[0, 0], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2], [-0.2, -0.2]];
  // Draw the moving player's tokens on top.
  withOffset.sort((a, b) => Number(a.color === current) - Number(b.color === current));

  return (
    <svg viewBox="-0.15 -0.15 15.3 15.3" className="w-full h-full select-none" role="img" aria-label="Ludo board">
      <rect x="-0.15" y="-0.15" width="15.3" height="15.3" rx="0.7" fill="var(--board)" />

      {/* bases */}
      {COLORS.map((c) => {
        const [ox, oy] = BASE_ORIGIN[c];
        const on = activeColors.includes(c);
        return (
          <g key={c} opacity={on ? 1 : 0.35}>
            <rect x={ox + 0.1} y={oy + 0.1} width={5.8} height={5.8} rx={0.55} fill={COLOR_HEX[c]} />
            <rect x={ox + 0.85} y={oy + 0.85} width={4.3} height={4.3} rx={0.6} fill="#fff" />
            {[[2, 2], [4, 2], [2, 4], [4, 4]].map(([sx, sy]) => (
              <circle key={`${sx}${sy}`} cx={ox + sx} cy={oy + sy} r={0.62} fill={COLOR_SOFT[c]} stroke={COLOR_HEX[c]} strokeWidth={0.06} />
            ))}
            {current === c && (
              <rect x={ox + 0.1} y={oy + 0.1} width={5.8} height={5.8} rx={0.55} fill="none" stroke="#fff" strokeWidth={0.12} strokeDasharray="0.4 0.25" opacity={0.9} />
            )}
          </g>
        );
      })}

      {/* main track */}
      {TRACK.map(([x, y], i) => {
        const startOf = START_SQUARES.get(i);
        return (
          <g key={i}>
            <rect x={x} y={y} width={1} height={1} fill={startOf ? COLOR_HEX[startOf] : '#fff'} stroke="var(--cell-line)" strokeWidth={0.035} />
            {SAFE_SQUARES.has(i) && (
              <path d={starPath(x + 0.5, y + 0.5, 0.36)} fill={startOf ? '#ffffffcc' : '#d6c6cf'} />
            )}
          </g>
        );
      })}

      {/* home columns */}
      {COLORS.map((c) => HOME_COL[c].map(([x, y], i) => (
        <rect key={`${c}${i}`} x={x} y={y} width={1} height={1} fill={COLOR_HEX[c]} stroke="var(--cell-line)" strokeWidth={0.035} />
      )))}

      {/* center */}
      <polygon points="6,6 6,9 7.5,7.5" fill={COLOR_HEX.red} />
      <polygon points="6,6 9,6 7.5,7.5" fill={COLOR_HEX.green} />
      <polygon points="9,6 9,9 7.5,7.5" fill={COLOR_HEX.yellow} />
      <polygon points="6,9 9,9 7.5,7.5" fill={COLOR_HEX.blue} />
      <text x="7.5" y="7.82" textAnchor="middle" fontSize="0.9" opacity={0.9}>❤️</text>

      {/* tokens */}
      {withOffset.map(({ color, index, pt, slot, key }) => {
        const n = stacks.get(key) ?? 1;
        const [dx, dy] = n > 1 ? OFFS[slot % OFFS.length] : [0, 0];
        const scale = n > 1 ? 0.78 : 1;
        const canPick = color === myColor && legal.includes(index);
        const hex = COLOR_HEX[color];
        return (
          <g
            key={`${color}-${index}`}
            className={`token ${canPick ? 'token-legal' : ''}`}
            style={{ transform: `translate(${pt[0] + dx}px, ${pt[1] + dy}px) scale(${scale})` }}
            onClick={canPick ? () => onPick(index) : undefined}
            onKeyDown={canPick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(index); } } : undefined}
            role={canPick ? 'button' : undefined}
            tabIndex={canPick ? 0 : undefined}
            aria-label={canPick ? `Move ${color} token ${index + 1}` : undefined}
          >
            {canPick && <circle r={0.75} fill="transparent" /> /* bigger touch target */}
            <ellipse cx={0} cy={0.3} rx={0.34} ry={0.12} fill="#000" opacity={0.18} />
            <circle r={0.38} fill={hex} stroke="#fff" strokeWidth={0.09} />
            <circle r={0.17} fill="#fff" opacity={0.55} />
            {canPick && <circle className="ring" r={0.55} fill="none" stroke={hex} strokeWidth={0.1} />}
          </g>
        );
      })}
    </svg>
  );
}
