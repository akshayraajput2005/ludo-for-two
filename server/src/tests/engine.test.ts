import { describe, expect, it } from 'vitest';
import { BASE, FINISH, absSquare } from '../../../shared/board.ts';
import { createGame, currentColor, forfeit, move, roll } from '../game/engine.ts';
import { RULES } from '../game/rules.ts';
import { rollDie } from '../game/dice.ts';

const twoPlayer = () => createGame(['red', 'yellow']);

describe('dice', () => {
  it('server die is always an integer 1..6 and hits every face', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const d = rollDie();
      expect(Number.isInteger(d) && d >= 1 && d <= 6).toBe(true);
      seen.add(d);
    }
    expect(seen.size).toBe(6);
  });

  it('engine rejects impossible dice values', () => {
    const g = twoPlayer();
    for (const bad of [0, 7, 2.5, NaN, -1]) expect(roll(g, 'red', bad).ok).toBe(false);
    expect(g.version).toBe(0);
  });
});

describe('leaving base', () => {
  it('a token needs a 6 to leave base; with nothing out, a non-six passes the turn', () => {
    const g = twoPlayer();
    roll(g, 'red', 3);
    expect(g.legal).toEqual([]);
    expect(currentColor(g)).toBe('yellow');
  });

  it('a six brings a token to its start square and gives another roll', () => {
    const g = twoPlayer();
    roll(g, 'red', 6);
    expect(g.phase).toBe('move');
    expect(g.legal).toEqual([0, 1, 2, 3]);
    expect(move(g, 'red', 2).ok).toBe(true);
    expect(g.tokens.red[2]).toBe(0);
    expect(currentColor(g)).toBe('red');
  });

  it('"a six moves nothing, any number leaves base" rule still works when switched on', () => {
    const g = twoPlayer();
    const rules = { ...RULES, sixToLeaveBase: false, sixRerolls: true };
    g.tokens.red = [5, BASE, BASE, BASE];
    roll(g, 'red', 6, rules);
    expect(g.phase).toBe('roll');
    expect(currentColor(g)).toBe('red');
    roll(g, 'red', 3, rules);
    expect(g.legal).toEqual([0, 1, 2, 3]);
    move(g, 'red', 1, rules);
    expect(g.tokens.red[1]).toBe(0);
    expect(currentColor(g)).toBe('yellow');
  });
});

describe('movement', () => {
  it('moves forward by the dice value and passes the turn', () => {
    const g = twoPlayer();
    g.tokens.red = [5, BASE, BASE, BASE];
    roll(g, 'red', 4);
    expect(g.legal).toEqual([0]); // base tokens need a 6
    move(g, 'red', 0);
    expect(g.tokens.red[0]).toBe(9);
    expect(currentColor(g)).toBe('yellow');
  });

  it('rejects moving a token that is not legal', () => {
    const g = twoPlayer();
    g.tokens.red = [5, 54, FINISH, FINISH];
    roll(g, 'red', 4);
    expect(move(g, 'red', 1).ok).toBe(false); // 54 + 4 overshoots home
    expect(move(g, 'red', 9).ok).toBe(false); // no such token
    expect(g.tokens.red).toEqual([5, 54, FINISH, FINISH]);
  });

  it('rejects moving before rolling and rolling twice', () => {
    const g = twoPlayer();
    g.tokens.red = [5, BASE, BASE, BASE];
    expect(move(g, 'red', 0).ok).toBe(false);
    roll(g, 'red', 2);
    expect(roll(g, 'red', 2).ok).toBe(false);
  });

  it('enters the home column after progress 50', () => {
    const g = twoPlayer();
    g.tokens.red = [48, BASE, BASE, BASE];
    roll(g, 'red', 5);
    move(g, 'red', 0);
    expect(g.tokens.red[0]).toBe(53); // home column, not wrapped onto the main track
  });

  it('needs the exact roll to finish', () => {
    const g = twoPlayer();
    g.tokens.red = [54, FINISH, FINISH, FINISH];
    roll(g, 'red', 3); // 57 overshoots
    expect(g.legal).toEqual([]);
    expect(currentColor(g)).toBe('yellow');
  });
});

describe('capture and safe squares', () => {
  it('landing on an opponent sends it to base and gives an extra turn', () => {
    const g = twoPlayer();
    // yellow progress p sits at abs (26+p)%52; red progress 30 is abs 30 -> yellow progress 4
    g.tokens.red = [27, BASE, BASE, BASE];
    g.tokens.yellow = [4, BASE, BASE, BASE];
    expect(absSquare('red', 30)).toBe(absSquare('yellow', 4));
    roll(g, 'red', 3);
    move(g, 'red', 0);
    expect(g.tokens.yellow[0]).toBe(BASE);
    expect(g.events.some((e) => e.type === 'capture' && e.victim === 'yellow')).toBe(true);
    expect(currentColor(g)).toBe('red');
  });

  it('no capture on a safe square', () => {
    const g = twoPlayer();
    // abs 34 is a star: red progress 34, yellow progress 8
    g.tokens.red = [31, BASE, BASE, BASE];
    g.tokens.yellow = [8, BASE, BASE, BASE];
    roll(g, 'red', 3);
    move(g, 'red', 0);
    expect(g.tokens.yellow[0]).toBe(8);
    expect(currentColor(g)).toBe('yellow');
  });

  it('no capture on an opponent start square', () => {
    const g = twoPlayer();
    g.tokens.red = [24, BASE, BASE, BASE]; // red 26 == abs 26 == yellow start
    g.tokens.yellow = [0, BASE, BASE, BASE];
    roll(g, 'red', 2);
    move(g, 'red', 0);
    expect(g.tokens.yellow[0]).toBe(0);
  });

  it('tokens in the home column are never captured', () => {
    const g = twoPlayer();
    // red progress 51 is home column; naive (0+51)%52 = abs 51 = yellow progress 25
    g.tokens.red = [51, BASE, BASE, BASE];
    g.tokens.yellow = [22, BASE, BASE, BASE];
    g.current = 1;
    roll(g, 'yellow', 3);
    move(g, 'yellow', 0);
    expect(g.tokens.yellow[0]).toBe(25);
    expect(g.tokens.red[0]).toBe(51);
  });
});

describe('extra turns and three sixes', () => {
  it('finishing a token gives an extra turn', () => {
    const g = twoPlayer();
    g.tokens.red = [54, 10, BASE, BASE];
    roll(g, 'red', 2);
    move(g, 'red', 0);
    expect(g.tokens.red[0]).toBe(FINISH);
    expect(currentColor(g)).toBe('red');
  });

  it('third six in a row forfeits the turn', () => {
    const g = twoPlayer();
    g.tokens.red = [10, BASE, BASE, BASE];
    roll(g, 'red', 6); move(g, 'red', 0);
    roll(g, 'red', 6); move(g, 'red', 0);
    const before = [...g.tokens.red];
    roll(g, 'red', 6);
    expect(g.events.some((e) => e.type === 'three-sixes')).toBe(true);
    expect(g.tokens.red).toEqual(before);
    expect(currentColor(g)).toBe('yellow');
  });

  it('three-sixes rule can be switched off', () => {
    const g = twoPlayer();
    const rules = { ...RULES, threeSixesForfeit: false };
    g.tokens.red = [10, BASE, BASE, BASE];
    for (let i = 0; i < 3; i++) { roll(g, 'red', 6, rules); move(g, 'red', 0, rules); }
    expect(g.tokens.red[0]).toBe(28);
    expect(g.phase).toBe('roll');
    expect(currentColor(g)).toBe('red');
  });

  it('a non-six resets the streak', () => {
    const g = twoPlayer();
    g.tokens.red = [10, BASE, BASE, BASE];
    roll(g, 'red', 6); move(g, 'red', 0);
    roll(g, 'red', 6); move(g, 'red', 0);
    g.tokens.yellow = [1, BASE, BASE, BASE];
    expect(g.sixStreak).toBe(2);
    roll(g, 'red', 2); move(g, 'red', 0);
    expect(g.sixStreak).toBe(0);
  });
});

describe('turns and winning', () => {
  it('rejects out-of-turn roll and move', () => {
    const g = twoPlayer();
    expect(roll(g, 'yellow', 6).ok).toBe(false);
    roll(g, 'red', 6);
    expect(move(g, 'yellow', 0).ok).toBe(false);
  });

  it('detects the winner when all four tokens are home', () => {
    const g = twoPlayer();
    g.tokens.red = [FINISH, FINISH, FINISH, 55];
    roll(g, 'red', 1);
    move(g, 'red', 3);
    expect(g.phase).toBe('over');
    expect(g.winner).toBe('red');
    expect(roll(g, 'yellow', 3).ok).toBe(false);
  });

  it('forfeit by the only opponent ends the game', () => {
    const g = twoPlayer();
    forfeit(g, 'red');
    expect(g.winner).toBe('yellow');
  });

  it('4-player: a forfeited color is skipped', () => {
    const g = createGame(['red', 'green', 'yellow', 'blue']);
    forfeit(g, 'green');
    roll(g, 'red', 2);
    move(g, 'red', 0); // next turn skips green
    expect(currentColor(g)).toBe('yellow');
  });
});

describe('2 colours each', () => {
  const pairGame = () => createGame(['red', 'yellow', 'green', 'blue'], [['red', 'green'], ['yellow', 'blue']]);

  it('one colour home is not a win; both colours home is', () => {
    const g = pairGame();
    g.tokens.red = [FINISH, FINISH, FINISH, 55];
    roll(g, 'red', 1);
    move(g, 'red', 3);
    expect(g.phase).not.toBe('over');
    g.tokens.green = [FINISH, FINISH, FINISH, 55];
    g.current = 2;
    g.phase = 'roll';
    roll(g, 'green', 1);
    move(g, 'green', 3);
    expect(g.phase).toBe('over');
    expect(g.winner).toBe('green');
  });

  it('game ends only when both colours of the other person are out', () => {
    const g = pairGame();
    forfeit(g, 'yellow');
    expect(g.phase).not.toBe('over');
    forfeit(g, 'blue');
    expect(g.winner).toBe('red');
  });
});

describe('full random games', () => {
  it('200 games (2 and 4 players) always finish with a valid winner and sane state', () => {
    for (let n = 0; n < 200; n++) {
      const g = createGame(n % 2 ? ['red', 'yellow'] : ['red', 'green', 'yellow', 'blue']);
      let steps = 0;
      while (g.phase !== 'over') {
        const c = currentColor(g);
        const r = g.phase === 'roll' ? roll(g, c, rollDie()) : move(g, c, g.legal[Math.floor(Math.random() * g.legal.length)]);
        if (!r.ok) throw new Error(r.error);
        for (const col of g.order) for (const p of g.tokens[col]) if (p < BASE || p > FINISH) throw new Error(`bad position ${p}`);
        if (++steps > 20000) throw new Error('game never ended');
      }
      expect(g.tokens[g.winner!].every((p) => p === FINISH)).toBe(true);
      expect(g.order.filter((c) => g.tokens[c].every((p) => p === FINISH))).toEqual([g.winner]);
    }
  });
});

describe('bot', () => {
  it('prefers a capture, then finishing, then leaving base', async () => {
    const { botMove } = await import('../game/engine.ts');
    const g = twoPlayer();
    g.tokens.red = [27, 10, BASE, BASE];
    g.tokens.yellow = [4, BASE, BASE, BASE]; // red 30 captures yellow 4
    roll(g, 'red', 3);
    expect(botMove(g, 'red')).toBe(0);

    const h = twoPlayer();
    h.tokens.red = [53, 10, BASE, BASE];
    roll(h, 'red', 3);
    expect(botMove(h, 'red')).toBe(0); // 53 + 3 = finish

    const k = twoPlayer();
    k.tokens.red = [20, BASE, BASE, BASE];
    roll(k, 'red', 6);
    expect([1, 2, 3]).toContain(botMove(k, 'red')); // bring a new token out
  });

  it('a bot-vs-bot game always finishes', async () => {
    const { botMove } = await import('../game/engine.ts');
    for (let n = 0; n < 50; n++) {
      const g = twoPlayer();
      let steps = 0;
      while (g.phase !== 'over' && steps++ < 20000) {
        const c = currentColor(g);
        if (g.phase === 'roll') roll(g, c, rollDie());
        else if (!move(g, c, botMove(g, c)).ok) throw new Error('bot picked an illegal move');
      }
      expect(g.phase).toBe('over');
    }
  });
});
