// Pure, server-authoritative Ludo engine. No I/O; the socket layer calls these.
import { absSquare, BASE, Color, FINISH, LAST_TRACK, SAFE_SQUARES } from '../../../shared/board.ts';
import { RULES, Rules } from './rules.ts';

export type Phase = 'roll' | 'move' | 'over';

export interface GameEvent {
  id: number;
  type: 'roll' | 'move' | 'capture' | 'finish' | 'no-move' | 'three-sixes' | 'turn' | 'win' | 'forfeit';
  color: Color;
  dice?: number;
  token?: number;
  from?: number;
  to?: number;
  victim?: Color;
}

export interface Game {
  order: Color[]; // turn order
  out: Color[]; // players who left the match
  current: number; // index into order
  phase: Phase;
  dice: number | null; // last roll (kept for display)
  sixStreak: number;
  tokens: Record<string, number[]>; // color -> 4 progress values
  legal: number[]; // token indices that may move with `dice`
  winner: Color | null;
  version: number; // bumps on every accepted action
  events: GameEvent[]; // recent history, newest last
  lastMove: GameEvent | null; // for client step animation
}

export type Result = { ok: true } | { ok: false; error: string };

const MAX_EVENTS = 30;

export function createGame(order: Color[]): Game {
  const tokens: Record<string, number[]> = {};
  for (const c of order) tokens[c] = [BASE, BASE, BASE, BASE];
  return {
    order, out: [], current: 0, phase: 'roll', dice: null, sixStreak: 0,
    tokens, legal: [], winner: null, version: 0, events: [], lastMove: null,
  };
}

export const currentColor = (g: Game) => g.order[g.current];

export function canMove(pos: number, dice: number, rules: Rules = RULES): boolean {
  if (pos === BASE) return !rules.sixToLeaveBase || dice === 6;
  return pos + dice <= FINISH; // exact roll needed to finish
}

export function legalMoves(g: Game, color: Color, dice: number, rules: Rules = RULES): number[] {
  return g.tokens[color].flatMap((p, i) => (canMove(p, dice, rules) ? [i] : []));
}

let eventSeq = 0;
function log(g: Game, e: Omit<GameEvent, 'id'>): GameEvent {
  const ev = { id: ++eventSeq, ...e };
  g.events.push(ev);
  if (g.events.length > MAX_EVENTS) g.events.shift();
  return ev;
}

function nextTurn(g: Game) {
  g.sixStreak = 0;
  g.legal = [];
  g.phase = 'roll';
  do g.current = (g.current + 1) % g.order.length;
  while (g.out.includes(g.order[g.current]));
  log(g, { type: 'turn', color: currentColor(g) });
}

function sameTurnAgain(g: Game) {
  g.legal = [];
  g.phase = 'roll';
}

export function roll(g: Game, color: Color, dice: number, rules: Rules = RULES): Result {
  if (g.phase === 'over') return { ok: false, error: 'Game is over' };
  if (currentColor(g) !== color) return { ok: false, error: 'Not your turn' };
  if (g.phase !== 'roll') return { ok: false, error: 'Move a token first' };
  if (!Number.isInteger(dice) || dice < 1 || dice > 6) return { ok: false, error: 'Invalid dice' };

  g.version++;
  g.dice = dice;
  g.lastMove = null;
  g.sixStreak = dice === 6 ? g.sixStreak + 1 : 0;
  log(g, { type: 'roll', color, dice });

  if (rules.threeSixesForfeit && g.sixStreak === 3) {
    log(g, { type: 'three-sixes', color });
    nextTurn(g);
    return { ok: true };
  }
  g.legal = legalMoves(g, color, dice, rules);
  if (g.legal.length === 0) {
    log(g, { type: 'no-move', color, dice });
    if (dice === 6 && rules.extraTurnOnSix) sameTurnAgain(g);
    else nextTurn(g);
    return { ok: true };
  }
  g.phase = 'move';
  return { ok: true };
}

export function move(g: Game, color: Color, token: number, rules: Rules = RULES): Result {
  if (g.phase === 'over') return { ok: false, error: 'Game is over' };
  if (currentColor(g) !== color) return { ok: false, error: 'Not your turn' };
  if (g.phase !== 'move' || g.dice === null) return { ok: false, error: 'Roll the dice first' };
  if (!g.legal.includes(token)) return { ok: false, error: 'That token cannot move' };

  g.version++;
  const dice = g.dice;
  const from = g.tokens[color][token];
  const to = from === BASE ? 0 : from + dice;
  g.tokens[color][token] = to;
  g.lastMove = log(g, { type: 'move', color, token, from, to, dice });

  let captured = false;
  if (to <= LAST_TRACK) {
    const sq = absSquare(color, to);
    if (!SAFE_SQUARES.has(sq)) {
      for (const other of g.order) {
        if (other === color) continue;
        g.tokens[other].forEach((p, i) => {
          if (p >= 0 && p <= LAST_TRACK && absSquare(other as Color, p) === sq) {
            g.tokens[other][i] = BASE;
            captured = true;
            log(g, { type: 'capture', color, victim: other as Color, token: i });
          }
        });
      }
    }
  }

  const finished = to === FINISH;
  if (finished) log(g, { type: 'finish', color, token });

  if (g.tokens[color].every((p) => p === FINISH)) {
    endGame(g, color);
    return { ok: true };
  }

  const extra =
    (dice === 6 && rules.extraTurnOnSix) ||
    (captured && rules.extraTurnOnCapture) ||
    (finished && rules.extraTurnOnFinish);
  if (extra) sameTurnAgain(g);
  else nextTurn(g);
  return { ok: true };
}

function endGame(g: Game, winner: Color) {
  g.phase = 'over';
  g.legal = [];
  g.winner = winner;
  log(g, { type: 'win', color: winner });
}

// A player left mid-game. Last one standing wins.
export function forfeit(g: Game, color: Color) {
  if (g.phase === 'over' || g.out.includes(color)) return;
  g.version++;
  g.out.push(color);
  log(g, { type: 'forfeit', color });
  const remaining = g.order.filter((c) => !g.out.includes(c));
  if (remaining.length === 1) return endGame(g, remaining[0]);
  if (currentColor(g) === color) nextTurn(g);
}

// Simple bot: pick the best legal token for the current dice.
// Priorities: capture > finish > leave base > reach home column > safe square > advance, avoiding squares an opponent can hit.
export function botMove(g: Game, color: Color): number {
  const dice = g.dice!;
  let best = g.legal[0];
  let bestScore = -Infinity;
  for (const t of g.legal) {
    const from = g.tokens[color][t];
    const to = from === BASE ? 0 : from + dice;
    let score = to; // prefer advancing further tokens a little
    if (to === FINISH) score += 800;
    else if (from === BASE) score += 600;
    else if (to > LAST_TRACK && from <= LAST_TRACK) score += 400;
    if (to <= LAST_TRACK) {
      const sq = absSquare(color, to);
      const safe = SAFE_SQUARES.has(sq);
      for (const other of g.order) {
        if (other === color || g.out.includes(other)) continue;
        for (const p of g.tokens[other]) {
          if (p < 0 || p > LAST_TRACK) continue;
          const osq = absSquare(other as Color, p);
          if (osq === sq && !safe) score += 1000; // capture
          const behind = (sq - osq + 52) % 52; // opponent can reach us next turn
          if (!safe && behind >= 1 && behind <= 6) score -= 300;
        }
      }
      if (safe) score += 200;
    }
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return best;
}
