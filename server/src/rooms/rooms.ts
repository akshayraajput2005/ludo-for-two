// In-memory room store. Everything is lost on server restart (see README "Limitations").
// ponytail: single-process Map; swap these few functions for Redis/DB calls if you need persistence or >1 instance.
import { randomBytes, randomInt } from 'node:crypto';
import { Color, SEATS } from '../../../shared/board.ts';
import { createGame, Game } from '../game/engine.ts';
import { QUESTIONS, TotCategory } from '../../../shared/questions.ts';

export interface Player {
  id: string; // public id, shown to others
  secret: string; // reconnect token, only ever sent to its owner
  name: string;
  avatar: string;
  color: Color;
  ready: boolean;
  connected: boolean;
  left: boolean;
  auto: boolean; // server plays this seat (only allowed for BOT_NAME)
  socketId: string | null;
}

export interface ChatMessage {
  id: number;
  playerId: string;
  text: string;
  at: number;
}

// "This or That": both pick secretly, picks are revealed once everyone has chosen.
export interface Tot {
  category: TotCategory;
  q: number; // index into QUESTIONS[category]
  picks: Record<string, 0 | 1>; // playerId -> choice; hidden from clients until revealed
  revealed: boolean;
  matches: number;
  rounds: number;
  decks: Partial<Record<TotCategory, number[]>>; // remaining shuffled cards per category
}

export type RoomKind = 'ludo' | 'tot';

export interface Room {
  code: string;
  kind: RoomKind; // which game this room is for, chosen by the creator
  permanent: boolean; // fixed code from PERMANENT_ROOMS: recreated on boot, never expires
  maxPlayers: number;
  hostId: string;
  status: 'lobby' | 'playing' | 'finished';
  players: Player[];
  game: Game | null;
  chat: ChatMessage[];
  rematch: string[]; // player ids who voted
  tot: Tot | null;
  lastActivity: number;
}

const rooms = new Map<string, Room>();
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
export const IDLE_TTL_MS = 30 * 60_000; // room with nobody connected
export const MAX_TTL_MS = 12 * 60 * 60_000; // any room

const token = (bytes: number) => randomBytes(bytes).toString('base64url');

export function createRoom(maxPlayers: number, kind: RoomKind = 'ludo', fixedCode?: string): Room {
  let code = fixedCode ?? '';
  while (!code || rooms.has(code)) code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  const room: Room = {
    code, kind, permanent: !!fixedCode, maxPlayers, hostId: '', status: 'lobby', players: [], game: null,
    chat: [], rematch: [], tot: null, lastActivity: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

export const getRoom = (code: string) => rooms.get(code);
export const deleteRoom = (code: string) => rooms.delete(code);
export const roomCount = () => rooms.size;

export function addPlayer(room: Room, name: string, avatar: string): Player {
  const taken = new Set(room.players.map((p) => p.color));
  const color = SEATS[room.maxPlayers].find((c) => !taken.has(c))!;
  const player: Player = {
    id: token(9), secret: token(24), name, avatar, color,
    ready: false, connected: true, left: false, auto: false, socketId: null,
  };
  room.players.push(player);
  if (!room.hostId) room.hostId = player.id;
  return player;
}

export function removePlayer(room: Room, playerId: string) {
  room.players = room.players.filter((p) => p.id !== playerId);
  if (room.players.length === 0) {
    if (!room.permanent) deleteRoom(room.code);
    return;
  }
  if (room.hostId === playerId) room.hostId = room.players[0].id;
}

export function startGame(room: Room) {
  const active = room.players.filter((p) => !p.left);
  // keep clockwise seat order regardless of join order
  const order = SEATS[4].filter((c) => active.some((p) => p.color === c));
  room.game = createGame(order);
  room.status = 'playing';
  room.rematch = [];
  room.tot = null;
}

// What clients see. Never includes secrets or socket ids.
export function publicState(room: Room) {
  return {
    code: room.code,
    kind: room.kind,
    permanent: room.permanent,
    maxPlayers: room.maxPlayers,
    hostId: room.hostId,
    status: room.status,
    players: room.players.map(({ id, name, avatar, color, ready, connected, left }) => ({
      id, name, avatar, color, ready, connected, left,
    })),
    game: room.game,
    chat: room.chat,
    rematch: room.rematch,
    tot: room.tot && {
      category: room.tot.category,
      q: room.tot.q,
      picked: Object.keys(room.tot.picks),
      picks: room.tot.revealed ? room.tot.picks : {}, // never leak a pick early
      revealed: room.tot.revealed,
      matches: room.tot.matches,
      rounds: room.tot.rounds,
    },
  };
}

export function sweep(now = Date.now()) {
  for (const room of rooms.values()) {
    if (room.permanent) continue;
    const nobodyHere = room.players.every((p) => !p.connected);
    if ((nobodyHere && now - room.lastActivity > IDLE_TTL_MS) || now - room.lastActivity > MAX_TTL_MS) {
      rooms.delete(room.code);
    }
  }
}

// Next card from a shuffled deck; reshuffles when a deck runs out.
export function drawCard(room: Room, category: TotCategory) {
  room.tot ??= { category, q: 0, picks: {}, revealed: false, matches: 0, rounds: 0, decks: {} };
  const t = room.tot;
  let deck = t.decks[category];
  if (!deck?.length) {
    deck = QUESTIONS[category].map((_, i) => i);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    t.decks[category] = deck;
  }
  t.category = category;
  t.q = deck.pop()!;
  t.picks = {};
  t.revealed = false;
}

export function pickCard(room: Room, playerId: string, choice: 0 | 1) {
  const t = room.tot!;
  t.picks[playerId] = choice;
  const active = room.players.filter((p) => !p.left);
  if (active.every((p) => p.id in t.picks)) {
    t.revealed = true;
    t.rounds++;
    if (new Set(active.map((p) => t.picks[p.id])).size === 1) t.matches++;
  }
}

// Rooms whose code never changes (env PERMANENT_ROOMS="ABC123,XYZ789"). Recreated empty on every boot.
export function ensurePermanentRooms(codes: string[]) {
  for (const raw of codes) {
    const code = raw.trim().toUpperCase();
    if (/^[A-Z0-9]{4,12}$/.test(code) && !rooms.has(code)) createRoom(2, 'ludo', code);
  }
}

// Back to the lobby after a finished game (or to switch games): clears the board and ready flags.
export function resetToLobby(room: Room) {
  room.players = room.players.filter((p) => !p.left);
  if (!room.players.some((p) => p.id === room.hostId) && room.players[0]) room.hostId = room.players[0].id;
  room.players.forEach((p) => { p.ready = false; });
  room.status = 'lobby';
  room.game = null;
  room.rematch = [];
}
