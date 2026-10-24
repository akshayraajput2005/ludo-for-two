// 15x15 board, units = cells. Same geometry on every screen; the SVG scales.
import { absSquare, BASE, FINISH, LAST_TRACK, type Color } from '../../../shared/board.ts';

type XY = [number, number];

// Main track, clockwise from red's start square (index = absolute square).
export const TRACK: XY[] = (() => {
  const t: XY[] = [];
  for (let c = 1; c <= 5; c++) t.push([c, 6]);
  for (let r = 5; r >= 0; r--) t.push([6, r]);
  t.push([7, 0]);
  for (let r = 0; r <= 5; r++) t.push([8, r]);
  for (let c = 9; c <= 14; c++) t.push([c, 6]);
  t.push([14, 7]);
  for (let c = 14; c >= 9; c--) t.push([c, 8]);
  for (let r = 9; r <= 14; r++) t.push([8, r]);
  t.push([7, 14]);
  for (let r = 14; r >= 9; r--) t.push([6, r]);
  for (let c = 5; c >= 0; c--) t.push([c, 8]);
  t.push([0, 7], [0, 6]);
  return t;
})();

// Home column cells (progress 51..55) per color.
export const HOME_COL: Record<Color, XY[]> = {
  red: [1, 2, 3, 4, 5].map((c) => [c, 7]),
  green: [1, 2, 3, 4, 5].map((r) => [7, r]),
  yellow: [13, 12, 11, 10, 9].map((c) => [c, 7]),
  blue: [13, 12, 11, 10, 9].map((r) => [7, r]),
};

export const BASE_ORIGIN: Record<Color, XY> = { red: [0, 0], green: [9, 0], yellow: [9, 9], blue: [0, 9] };
const BASE_SLOTS: XY[] = [[2, 2], [4, 2], [2, 4], [4, 4]];
const FINISH_SPOT: Record<Color, XY> = { red: [6.75, 7.5], green: [7.5, 6.75], yellow: [8.25, 7.5], blue: [7.5, 8.25] };

/** Center point (board units) of a token. */
export function tokenPoint(color: Color, progress: number, index: number): XY {
  if (progress === BASE) {
    const [ox, oy] = BASE_ORIGIN[color];
    const [sx, sy] = BASE_SLOTS[index];
    return [ox + sx, oy + sy];
  }
  if (progress === FINISH) return FINISH_SPOT[color];
  const [c, r] = progress <= LAST_TRACK ? TRACK[absSquare(color, progress)] : HOME_COL[color][progress - LAST_TRACK - 1];
  return [c + 0.5, r + 0.5];
}

/** Progress values a token passes through, for step animation. */
export function stepPath(from: number, to: number): number[] {
  if (from === BASE) return [0];
  const out: number[] = [];
  for (let p = from + 1; p <= to; p++) out.push(p);
  return out;
}
