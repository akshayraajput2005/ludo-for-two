import { randomBytes } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { botMove, forfeit, move, roll, currentColor } from '../game/engine.ts';
import {
  addPlayer, createRoom, drawCard, getRoom, owns, pickCard, Player, publicState, removePlayer, resetToLobby, Room, startGame,
} from '../rooms/rooms.ts';
import { TOT_CATEGORIES, TotCategory } from '../../../shared/questions.ts';

export const AVATARS = ['🦊', '🐼', '🐱', '🐶', '🐰', '🦁', '🐸', '🐧', '🦄', '🐻', '🌸', '⭐'];
export const REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👏', '🔥', '😘'];
const MAX_CHAT = 50;

type Ack = (res: { ok: boolean; error?: string; [k: string]: unknown }) => void;

// Token bucket per socket per kind.
function limiter(capacity: number, perMs: number) {
  let tokens = capacity;
  let last = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(capacity, tokens + ((now - last) / perMs) * capacity);
    last = now;
    if (tokens < 1) return false;
    tokens--;
    return true;
  };
}

export function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\p{C}<>]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 20);
  return s.length ? s : null;
}

export function cleanText(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\p{C}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  return s.length ? s : null;
}

const cleanCode = (v: unknown) => (typeof v === 'string' ? v.trim().toUpperCase().slice(0, 12) : '');
const cleanAvatar = (v: unknown) => (typeof v === 'string' && AVATARS.includes(v) ? v : AVATARS[0]);

export interface HandlerOptions {
  rollDie: () => number;
  botDelayMs?: number;
}

// Only a player with this name gets the Manual / Bot switch.
export const BOT_NAME = 'kuttaakshay';
export const canUseBot = (name: string) => name.toLowerCase().replace(/\s+/g, '') === BOT_NAME;

export function registerHandlers(io: Server, opts: HandlerOptions) {
  let chatSeq = 0;
  const botTimers = new WeakMap<Room, ReturnType<typeof setTimeout>>();
  const botDelay = opts.botDelayMs ?? 1300; // lets the clients' dice/step animations finish
  const broadcast = (room: Room) => {
    room.lastActivity = Date.now();
    io.to(room.code).emit('room:state', publicState(room));
    scheduleBot(room);
  };

  // If the seat whose turn it is has Bot on, act for it after a short pause.
  function scheduleBot(room: Room) {
    clearTimeout(botTimers.get(room));
    const g = room.game;
    if (room.status !== 'playing' || !g || g.phase === 'over') return;
    const p = room.players.find((x) => owns(x, currentColor(g)));
    if (!p?.auto || p.left) return;
    const version = g.version;
    botTimers.set(room, setTimeout(() => {
      if (getRoom(room.code) !== room || room.game !== g || g.version !== version || !p.auto) return;
      const c = currentColor(g);
      const res = g.phase === 'roll' ? roll(g, c, opts.rollDie()) : move(g, c, botMove(g, c));
      if (res.ok) {
        if (g.phase === 'over') room.status = 'finished';
        broadcast(room);
      }
    }, botDelay));
  }

  io.on('connection', (socket: Socket) => {
    const actionOk = limiter(10, 1000);
    const chatOk = limiter(5, 5000);
    const joinOk = limiter(5, 10_000);

    // Which room/player this socket is bound to. Set only by create/join/rejoin.
    let room: Room | undefined;
    let me: Player | undefined;

    const bind = (r: Room, p: Player) => {
      if (room && room !== r) socket.leave(room.code);
      // A second tab/device with the same token takes over the seat.
      if (p.socketId && p.socketId !== socket.id) io.sockets.sockets.get(p.socketId)?.disconnect(true);
      room = r;
      me = p;
      p.socketId = socket.id;
      p.connected = true;
      socket.join(r.code);
    };
    const you = () => ({ code: room!.code, playerId: me!.id, secret: me!.secret, auto: me!.auto });
    const safe = (fn: (args: any, ack: Ack) => void) => (args: any, ack?: Ack) => {
      const reply: Ack = typeof ack === 'function' ? ack : () => {};
      try {
        fn(args ?? {}, reply);
      } catch (err) {
        console.error('handler error', err instanceof Error ? err.message : err);
        reply({ ok: false, error: 'Server error' });
      }
    };
    // Every room event goes through this: rejects sockets that are not a seated player.
    const member = (fn: (r: Room, p: Player, args: any, ack: Ack) => void) =>
      safe((args, ack) => {
        if (!room || !me || me.left || getRoom(room.code) !== room) return ack({ ok: false, error: 'Not in a room' });
        if (!actionOk()) return ack({ ok: false, error: 'Slow down' });
        fn(room, me, args, ack);
      });

    socket.on('room:create', safe((args, ack) => {
      if (!joinOk()) return ack({ ok: false, error: 'Too many attempts, wait a moment' });
      const name = cleanName(args.name);
      if (!name) return ack({ ok: false, error: 'Enter your name' });
      const kind = args.kind === 'tot' ? 'tot' : 'ludo';
      const max = kind === 'ludo' && [2, 3, 4].includes(args.maxPlayers) ? args.maxPlayers : 2;
      const r = createRoom(max, kind);
      bind(r, addPlayer(r, name, cleanAvatar(args.avatar)));
      ack({ ok: true, ...you() });
      broadcast(r);
    }));

    socket.on('room:join', safe((args, ack) => {
      if (!joinOk()) return ack({ ok: false, error: 'Too many attempts, wait a moment' });
      const name = cleanName(args.name);
      if (!name) return ack({ ok: false, error: 'Enter your name' });
      const r = getRoom(cleanCode(args.code));
      if (!r) return ack({ ok: false, error: 'Room not found. Check the code — rooms expire when empty.' });
      // Permanent room: joining with your old name takes your seat back (only if that seat is offline).
      const mine = r.permanent && r.players.find((p) => !p.connected && p.name.toLowerCase() === name.toLowerCase());
      if (mine) {
        mine.secret = randomBytes(24).toString('base64url'); // old devices lose the seat
        mine.left = false;
        mine.avatar = cleanAvatar(args.avatar);
        bind(r, mine);
        ack({ ok: true, ...you() });
        return broadcast(r);
      }
      if (r.status !== 'lobby') return ack({ ok: false, error: 'This game has already started' });
      if (r.players.length >= r.maxPlayers) {
        return ack({ ok: false, error: r.permanent ? 'Room is full — join with the same name you used before' : 'This room is full' });
      }
      bind(r, addPlayer(r, name, cleanAvatar(args.avatar)));
      ack({ ok: true, ...you() });
      broadcast(r);
    }));

    socket.on('room:rejoin', safe((args, ack) => {
      if (!joinOk()) return ack({ ok: false, error: 'Too many attempts, wait a moment' });
      const r = getRoom(cleanCode(args.code));
      const p = r?.players.find((x) => typeof args.secret === 'string' && x.secret === args.secret);
      if (!r || !p) return ack({ ok: false, error: 'That game is no longer available' });
      if (p.left) return ack({ ok: false, error: 'You left this game' });
      bind(r, p);
      ack({ ok: true, ...you() });
      broadcast(r);
    }));

    socket.on('room:ready', member((r, p, args, ack) => {
      if (r.kind !== 'ludo') return ack({ ok: false, error: 'This room is for This or That' });
      if (r.status !== 'lobby') return ack({ ok: false, error: 'Game already started' });
      p.ready = !!args.ready;
      const all = r.players.every((x) => x.ready);
      if (all && r.players.length === r.maxPlayers) startGame(r);
      ack({ ok: true });
      broadcast(r);
    }));

    socket.on('room:start', member((r, p, _args, ack) => {
      if (r.kind !== 'ludo') return ack({ ok: false, error: 'This room is for This or That' });
      if (r.status !== 'lobby') return ack({ ok: false, error: 'Game already started' });
      if (r.hostId !== p.id) return ack({ ok: false, error: 'Only the host can start' });
      if (r.players.length < 2 || !r.players.every((x) => x.ready)) {
        return ack({ ok: false, error: 'Need at least 2 players, all ready' });
      }
      startGame(r);
      ack({ ok: true });
      broadcast(r);
    }));

    // Switch this room between Ludo and This or That (not during a running Ludo game).
    socket.on('room:kind', member((r, _p, args, ack) => {
      if (r.status === 'playing') return ack({ ok: false, error: 'Finish the Ludo game first' });
      const kind = args.kind === 'tot' ? 'tot' : 'ludo';
      if (kind === 'tot' && r.players.length > 2) return ack({ ok: false, error: 'This or That is for 2 players' });
      resetToLobby(r);
      r.kind = kind;
      if (kind === 'tot') r.maxPlayers = 2;
      r.tot = null;
      ack({ ok: true });
      broadcast(r);
    }));

    socket.on('room:pairs', member((r, _p, args, ack) => {
      if (r.kind !== 'ludo' || r.maxPlayers !== 2) return ack({ ok: false, error: 'Only for 2-player Ludo' });
      if (r.status === 'playing') return ack({ ok: false, error: 'Finish the Ludo game first' });
      r.pairs = !!args.on;
      ack({ ok: true });
      broadcast(r);
    }));

    socket.on('room:lobby', member((r, _p, _args, ack) => {
      if (r.status !== 'finished') return ack({ ok: false, error: 'Game is still running' });
      resetToLobby(r);
      ack({ ok: true });
      broadcast(r);
    }));

    socket.on('room:leave', member((r, p, _args, ack) => {
      socket.leave(r.code);
      room = undefined;
      me = undefined;
      if (r.status === 'lobby') {
        removePlayer(r, p.id);
      } else {
        p.left = true;
        p.connected = false;
        p.socketId = null;
        if (r.status === 'playing' && r.game) {
          forfeit(r.game, p.color);
          if (p.color2) forfeit(r.game, p.color2);
          if (r.game.phase === 'over') r.status = 'finished';
        }
        if (r.hostId === p.id) r.hostId = r.players.find((x) => !x.left)?.id ?? p.id;
      }
      ack({ ok: true });
      broadcast(r);
    }));

    socket.on('player:auto', member((r, p, args, ack) => {
      if (!canUseBot(p.name)) return ack({ ok: false, error: 'Not available' });
      p.auto = !!args.on;
      ack({ ok: true, auto: p.auto });
      scheduleBot(r);
    }));

    socket.on('game:roll', member((r, p, _args, ack) => {
      const g = r.game;
      if (r.status !== 'playing' || !g) return ack({ ok: false, error: 'No game in progress' });
      if (!owns(p, currentColor(g))) return ack({ ok: false, error: 'Not your turn' });
      const res = roll(g, currentColor(g), opts.rollDie());
      ack(res);
      if (res.ok) broadcast(r);
    }));

    socket.on('game:move', member((r, p, args, ack) => {
      const g = r.game;
      if (r.status !== 'playing' || !g) return ack({ ok: false, error: 'No game in progress' });
      if (args.version !== g.version) return ack({ ok: false, error: 'Out of date, try again' });
      if (!owns(p, currentColor(g))) return ack({ ok: false, error: 'Not your turn' });
      const res = move(g, currentColor(g), Number(args.token));
      if (res.ok && g.phase === 'over') r.status = 'finished';
      ack(res);
      if (res.ok) broadcast(r);
    }));

    socket.on('game:rematch', member((r, p, _args, ack) => {
      if (r.kind !== 'ludo') return ack({ ok: false, error: 'No Ludo game here' });
      if (r.status !== 'finished') return ack({ ok: false, error: 'Game is not over' });
      const active = r.players.filter((x) => !x.left);
      if (active.length < 2) return ack({ ok: false, error: 'Not enough players for a rematch' });
      if (!r.rematch.includes(p.id)) r.rematch.push(p.id);
      if (active.every((x) => r.rematch.includes(x.id))) startGame(r);
      ack({ ok: true });
      broadcast(r);
    }));

    // ---- This or That ----
    socket.on('tot:draw', member((r, _p, args, ack) => {
      if (r.kind !== 'tot') return ack({ ok: false, error: 'This room is for Ludo' });
      if (r.status === 'playing') return ack({ ok: false, error: 'Finish the Ludo game first' });
      const cat = args.category ?? r.tot?.category;
      if (!TOT_CATEGORIES.includes(cat)) return ack({ ok: false, error: 'Unknown category' });
      drawCard(r, cat as TotCategory);
      ack({ ok: true });
      broadcast(r);
    }));

    socket.on('tot:pick', member((r, p, args, ack) => {
      const t = r.tot;
      if (!t) return ack({ ok: false, error: 'No question open' });
      if (t.revealed) return ack({ ok: false, error: 'Already revealed' });
      if (p.id in t.picks) return ack({ ok: false, error: 'You already picked' });
      if (args.choice !== 0 && args.choice !== 1) return ack({ ok: false, error: 'Invalid choice' });
      pickCard(r, p.id, args.choice);
      ack({ ok: true });
      broadcast(r);
    }));

    socket.on('tot:close', member((r, _p, _args, ack) => {
      r.tot = null;
      ack({ ok: true });
      broadcast(r);
    }));

    socket.on('chat:send', member((r, p, args, ack) => {
      if (!chatOk()) return ack({ ok: false, error: 'Slow down' });
      const text = cleanText(args.text);
      if (!text) return ack({ ok: false, error: 'Empty message' });
      r.chat.push({ id: ++chatSeq, playerId: p.id, text, at: Date.now() });
      if (r.chat.length > MAX_CHAT) r.chat.shift();
      ack({ ok: true });
      broadcast(r);
    }));

    socket.on('chat:react', member((r, p, args, ack) => {
      if (!chatOk()) return ack({ ok: false, error: 'Slow down' });
      if (!REACTIONS.includes(args.emoji)) return ack({ ok: false, error: 'Unknown reaction' });
      io.to(r.code).emit('chat:reaction', { playerId: p.id, emoji: args.emoji, id: ++chatSeq });
      ack({ ok: true });
    }));

    socket.on('disconnect', () => {
      if (!room || !me || me.socketId !== socket.id) return; // replaced by a newer socket
      me.connected = false;
      me.socketId = null;
      if (getRoom(room.code) === room) broadcast(room);
    });
  });
}
