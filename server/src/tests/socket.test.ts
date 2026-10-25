import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { io as connect, Socket } from 'socket.io-client';
import { createServer } from '../index.ts';
import { ensurePermanentRooms, getRoom } from '../rooms/rooms.ts';

// Scripted dice so the flows are deterministic.
const diceQueue: number[] = [];
const { http, io } = createServer({ rollDie: () => diceQueue.shift() ?? 1, botDelayMs: 10 });
let url = '';
const sockets: Socket[] = [];

beforeAll(() => new Promise<void>((done) => {
  http.listen(0, () => { url = `http://localhost:${(http.address() as AddressInfo).port}`; done(); });
}));
afterAll(() => { sockets.forEach((s) => s.disconnect()); io.close(); });

function client(): Promise<Socket> {
  const s = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  sockets.push(s);
  return new Promise((ok) => s.on('connect', () => ok(s)));
}
const call = (s: Socket, ev: string, args: object = {}): Promise<any> =>
  new Promise((ok) => s.emit(ev, args, ok));
const nextState = (s: Socket): Promise<any> => new Promise((ok) => s.once('room:state', ok));
// Resolve on the first state matching pred (skips stale broadcasts still in flight).
const waitState = (s: Socket, pred: (st: any) => boolean): Promise<any> =>
  new Promise((ok) => {
    const h = (st: any) => { if (pred(st)) { s.off('room:state', h); ok(st); } };
    s.on('room:state', h);
  });

async function startedGame() {
  const a = await client();
  const b = await client();
  const created = await call(a, 'room:create', { name: 'Akshay', avatar: '🦊' });
  const joined = await call(b, 'room:join', { code: created.code, name: 'Her', avatar: '🐰' });
  await call(a, 'room:ready', { ready: true });
  const started = waitState(a, (st) => st.status === 'playing');
  await call(b, 'room:ready', { ready: true });
  return { a, b, created, joined, state: await started };
}

describe('private rooms', () => {
  it('creates a room and lets a second player join by code', async () => {
    const { created, joined, state } = await startedGame();
    expect(created.ok && joined.ok).toBe(true);
    expect(created.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(state.status).toBe('playing');
    expect(state.players.map((p: any) => p.color)).toEqual(['red', 'yellow']);
    expect(JSON.stringify(state)).not.toContain(created.secret); // secrets never broadcast
  });

  it('rejects a third player in a full room', async () => {
    const a = await client();
    const b = await client();
    const c = await client();
    const { code } = await call(a, 'room:create', { name: 'A' });
    expect((await call(b, 'room:join', { code, name: 'B' })).ok).toBe(true);
    const res = await call(c, 'room:join', { code, name: 'C' });
    expect(res).toMatchObject({ ok: false, error: 'This room is full' });
  });

  it('rejects unknown rooms, empty names, and non-members', async () => {
    const c = await client();
    expect((await call(c, 'room:join', { code: 'NOPE99', name: 'X' })).ok).toBe(false);
    const { code } = await call(await client(), 'room:create', { name: 'A' });
    expect((await call(c, 'room:join', { code, name: '   ' })).error).toBe('Enter your name');
    expect((await call(c, 'game:roll')).error).toBe('Not in a room');
    expect((await call(c, 'chat:send', { text: 'hi' })).error).toBe('Not in a room');
  });

  it('cannot impersonate with a forged secret', async () => {
    const { created } = await startedGame();
    const c = await client();
    const res = await call(c, 'room:rejoin', { code: created.code, secret: 'forged' });
    expect(res.ok).toBe(false);
  });
});

describe('turns', () => {
  it('only the current player can roll; dice comes from the server', async () => {
    const { b, a } = await startedGame();
    expect((await call(b, 'game:roll')).error).toBe('Not your turn');
    diceQueue.push(3);
    const st = waitState(b, (x) => x.game.dice !== null);
    expect((await call(a, 'game:roll', { dice: 1 })).ok).toBe(true); // client dice ignored
    const s = await st;
    expect(s.game.dice).toBe(3);
    expect(s.game.legal).toEqual([0, 1, 2, 3]);
  });

  it('duplicate / simultaneous move attempts apply once', async () => {
    const { a } = await startedGame();
    diceQueue.push(3);
    const s = await new Promise<any>((ok) => { a.once('room:state', ok); a.emit('game:roll', {}, () => {}); });
    const v = s.game.version;
    const [r1, r2, r3] = await Promise.all([
      call(a, 'game:move', { token: 0, version: v }),
      call(a, 'game:move', { token: 0, version: v }),
      call(a, 'game:move', { token: 1, version: v }),
    ]);
    expect([r1.ok, r2.ok, r3.ok].filter(Boolean).length).toBe(1);
  });
});

describe('2 colours each', () => {
  it('each player gets two colours and plays both turns', async () => {
    const a = await client();
    const b = await client();
    const created = await call(a, 'room:create', { name: 'A' });
    await call(b, 'room:join', { code: created.code, name: 'B' });
    expect((await call(b, 'room:pairs', { on: true })).ok).toBe(true);
    await call(a, 'room:ready', { ready: true });
    const started = waitState(a, (st) => st.status === 'playing');
    await call(b, 'room:ready', { ready: true });
    const s = await started;
    expect(s.game.order).toEqual(['red', 'yellow', 'green', 'blue']);
    expect(s.players.map((p: any) => [p.color, p.color2])).toEqual([['red', 'green'], ['yellow', 'blue']]);

    const g = getRoom(created.code)!.game!;
    diceQueue.push(2, 2);
    await call(a, 'game:roll'); // red: any non-six leaves base
    await call(a, 'game:move', { token: 0, version: g.version });
    await call(b, 'game:roll'); // yellow
    await call(b, 'game:move', { token: 0, version: g.version });
    expect(g.order[g.current]).toBe('green');
    expect((await call(b, 'game:roll')).error).toBe('Not your turn');
    diceQueue.push(4);
    expect((await call(a, 'game:roll')).ok).toBe(true); // A plays green too
  });
});

describe('reconnection', () => {
  it('rejoin with secret restores the same seat and latest state, no duplicate player', async () => {
    const { a, b, created } = await startedGame();
    diceQueue.push(3);
    await call(a, 'game:roll');
    const seenDisconnect = waitState(b, (st) => !st.players[0].connected);
    a.disconnect();
    const mid = await seenDisconnect;
    expect(mid.players.find((p: any) => p.id === created.playerId).connected).toBe(false);

    const a2 = await client();
    const st = nextState(a2);
    const res = await call(a2, 'room:rejoin', { code: created.code, secret: created.secret });
    expect(res).toMatchObject({ ok: true, playerId: created.playerId });
    const s = await st;
    expect(s.players).toHaveLength(2);
    expect(s.players[0].connected).toBe(true);
    expect(s.game.phase).toBe('move'); // the pending move survived
    expect((await call(a2, 'game:move', { token: 0, version: s.game.version })).ok).toBe(true);
  });

  it('leaving mid-game forfeits and the other player wins', async () => {
    const { a, b, joined } = await startedGame();
    const st = waitState(a, (x) => x.status === 'finished');
    await call(b, 'room:leave');
    const s = await st;
    expect(s.status).toBe('finished');
    expect(s.game.winner).toBe('red');
    expect(s.players.find((p: any) => p.id === joined.playerId).left).toBe(true);
  });

  it('rematch starts a fresh game when everyone votes', async () => {
    const g = await startedGame();
    let a = g.a;
    const { b, created } = g;
    expect((await call(a, 'game:rematch')).error).toBe('Game is not over');
    // Seed red one step from winning, then play the winning move over the socket.
    getRoom(created.code)!.game!.tokens.red = [56, 56, 56, 55];
    diceQueue.push(1);
    await call(a, 'game:roll');
    const over = waitState(b, (st) => st.status === 'finished');
    const v = getRoom(created.code)!.game!.version;
    expect((await call(a, 'game:move', { token: 3, version: v })).ok).toBe(true);
    const s = await over;
    expect(s.status).toBe('finished');
    expect(s.game.winner).toBe('red');
    expect((await call(b, 'game:roll')).ok).toBe(false);

    // refresh on the game-over screen keeps the seat
    a.disconnect();
    const a2 = await client();
    expect((await call(a2, 'room:rejoin', { code: created.code, secret: created.secret })).ok).toBe(true);
    a = a2;

    await call(a, 'game:rematch');
    const fresh = waitState(a, (st) => st.status === 'playing');
    await call(b, 'game:rematch');
    const f = await fresh;
    expect(f.status).toBe('playing');
    expect(f.game.tokens.red).toEqual([-1, -1, -1, -1]);
  });
});

describe('chat', () => {
  it('sanitizes and broadcasts messages and reactions', async () => {
    const { a, b } = await startedGame();
    const st = waitState(b, (x) => x.chat.length > 0);
    await call(a, 'chat:send', { text: '  ❤️ Love you!\u0000  ' });
    const s = await st;
    expect(s.chat.at(-1).text).toBe('❤️ Love you!');
    const r = new Promise<any>((ok) => b.once('chat:reaction', ok));
    await call(a, 'chat:react', { emoji: '😘' });
    expect((await r).emoji).toBe('😘');
    expect((await call(a, 'chat:react', { emoji: '<script>' })).ok).toBe(false);
  });
});

describe('this or that', () => {
  it('Ludo and This or That are separate room types', async () => {
    const a = await client();
    const b = await client();
    const ludo = await call(a, 'room:create', { name: 'A' });
    await call(b, 'room:join', { code: ludo.code, name: 'B' });
    expect((await call(a, 'tot:draw', { category: 'romantic' })).error).toBe('This room is for Ludo');
    const c = await client();
    const d = await client();
    const tot = await call(c, 'room:create', { name: 'C', kind: 'tot', maxPlayers: 4 });
    const st = waitState(d, (x) => x.players.length === 2);
    await call(d, 'room:join', { code: tot.code, name: 'D' });
    const s = await st;
    expect(s).toMatchObject({ kind: 'tot', maxPlayers: 2 }); // always 2 players
    expect((await call(c, 'room:ready', { ready: true })).error).toBe('This room is for This or That');
  });

  it('hides picks until both choose, then reveals and counts matches', async () => {
    const a = await client();
    const b = await client();
    const { code } = await call(a, 'room:create', { name: 'A', kind: 'tot' });
    await call(b, 'room:join', { code, name: 'B' });
    expect((await call(a, 'tot:draw', { category: 'nope' })).ok).toBe(false);
    expect((await call(a, 'tot:draw', { category: 'naughty' })).ok).toBe(true);

    const afterA = waitState(b, (st) => st.tot?.picked.length === 1);
    await call(a, 'tot:pick', { choice: 1 });
    const s1 = await afterA;
    expect(s1.tot.revealed).toBe(false);
    expect(s1.tot.picks).toEqual({}); // B can't see A's answer yet
    expect((await call(a, 'tot:pick', { choice: 0 })).error).toBe('You already picked');

    const done = waitState(a, (st) => st.tot?.revealed);
    await call(b, 'tot:pick', { choice: 1 });
    const s2 = await done;
    expect(Object.values(s2.tot.picks)).toEqual([1, 1]);
    expect(s2.tot).toMatchObject({ matches: 1, rounds: 1, category: 'naughty' });

    const next = waitState(a, (st) => st.tot && !st.tot.revealed);
    await call(b, 'tot:draw', {});
    expect((await next).tot.picked).toEqual([]);
  });
});

describe('bot mode', () => {
  it('only kuttaakshay can turn it on, and then the server plays that seat', async () => {
    const a = await client();
    const b = await client();
    const created = await call(a, 'room:create', { name: 'Kutta Akshay' });
    await call(b, 'room:join', { code: created.code, name: 'Her' });
    expect((await call(b, 'player:auto', { on: true })).error).toBe('Not available');
    const on = await call(a, 'player:auto', { on: true });
    expect(on).toMatchObject({ ok: true, auto: true });

    await call(a, 'room:ready', { ready: true });
    diceQueue.push(6, 3); // bot: roll 6 -> roll again -> 3 brings a token out
    const played = waitState(b, (st) => st.game && st.game.tokens.red.some((t: number) => t === 0));
    await call(b, 'room:ready', { ready: true });
    const s = await played;
    expect(s.game.order[s.game.current]).toBe('yellow'); // turn passed to her
    expect(JSON.stringify(s)).not.toContain('auto'); // she can't see bot mode

    // rejoin reports the current setting so the switch shows correctly
    const a2 = await client();
    expect((await call(a2, 'room:rejoin', { code: created.code, secret: created.secret })).auto).toBe(true);
  });
});

describe('permanent room', () => {
  it('survives being empty, gives your seat back by name, and switches games', async () => {
    ensurePermanentRooms(['LOVE22']);
    const a = await client();
    const b = await client();
    expect((await call(a, 'room:join', { code: 'love22', name: 'Akshay' })).ok).toBe(true);
    await call(b, 'room:join', { code: 'LOVE22', name: 'Her' });

    // both leave the lobby -> room still exists
    await call(a, 'room:leave');
    await call(b, 'room:leave');
    expect(getRoom('LOVE22')).toBeTruthy();

    // start Ludo; she drops mid-game and comes back by name on a new device
    const a2 = await client();
    const b2 = await client();
    await call(a2, 'room:join', { code: 'LOVE22', name: 'Akshay' });
    await call(b2, 'room:join', { code: 'LOVE22', name: 'Her' });
    await call(a2, 'room:ready', { ready: true });
    const started = waitState(a2, (s) => s.status === 'playing');
    await call(b2, 'room:ready', { ready: true });
    await started;
    const offline = waitState(a2, (s) => s.players.some((p: any) => !p.connected));
    b2.disconnect();
    await offline;
    const stranger = await client();
    expect((await call(stranger, 'room:join', { code: 'LOVE22', name: 'Someone' })).ok).toBe(false);
    const b3 = await client();
    expect((await call(b3, 'room:join', { code: 'LOVE22', name: 'her' })).ok).toBe(true);
    expect(getRoom('LOVE22')!.players).toHaveLength(2); // same seat, no duplicate

    // a seat that is online can't be taken by typing its name
    const imp = await client();
    expect((await call(imp, 'room:join', { code: 'LOVE22', name: 'Akshay' })).ok).toBe(false);

    // finish the game -> back to lobby -> switch to This or That
    expect((await call(a2, 'room:kind', { kind: 'tot' })).error).toBe('Finish the Ludo game first');
    const g = getRoom('LOVE22')!.game!;
    g.tokens.red = [56, 56, 56, 55];
    g.current = 0;
    g.phase = 'roll';
    diceQueue.push(1);
    await call(a2, 'game:roll');
    await call(a2, 'game:move', { token: 3, version: getRoom('LOVE22')!.game!.version });
    expect(getRoom('LOVE22')!.status).toBe('finished');
    expect((await call(a2, 'room:lobby')).ok).toBe(true);
    expect((await call(a2, 'room:kind', { kind: 'tot' })).ok).toBe(true);
    expect((await call(b3, 'tot:draw', { category: 'intimacy' })).ok).toBe(true);
  });
});
