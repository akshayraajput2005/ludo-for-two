// Board constants shared by server (rules) and client (drawing).
// Token position is "progress" relative to its own color:
//   -1        = in base
//   0..50     = on the shared 52-square main track
//   51..55    = in its own home column
//   56        = finished (center)

export const COLORS = ['red', 'green', 'yellow', 'blue'] as const;
export type Color = (typeof COLORS)[number];

export const TRACK_LEN = 52;
export const LAST_TRACK = 50; // last main-track progress before turning into the home column
export const FINISH = 56;
export const BASE = -1;

// Absolute track index where each color enters the board (clockwise order).
export const START: Record<Color, number> = { red: 0, green: 13, yellow: 26, blue: 39 };

// Start squares + star squares (8 ahead of each start). Nobody can be captured here.
export const SAFE_SQUARES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

// Seat colors by room size: 2 players sit opposite each other.
export const SEATS: Record<number, Color[]> = {
  2: ['red', 'yellow'],
  3: ['red', 'green', 'yellow'],
  4: ['red', 'green', 'yellow', 'blue'],
};

export function absSquare(color: Color, progress: number): number {
  return (START[color] + progress) % TRACK_LEN;
}
