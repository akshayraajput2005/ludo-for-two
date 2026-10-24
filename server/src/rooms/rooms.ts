// In-memory room store. Everything is lost on server restart (see README "Limitations").
// ponytail: single-process Map; swap these few functions for Redis/DB calls if you need persistence or >1 instance.
import { randomBytes, randomInt } from 'node:crypto';
import { Color, SEATS } from '../../../shared/board.ts';
import { createGame, Game } from '../game/engine.ts';

export interface Player {
  id: string; // public id, shown to others
  secret: string; // reconnect token, only ever sent to its owner
  name: string;
  avatar: string;
  color: Color;
  ready: boolean;
  connected: boolean;
  left: boolean;
  socketId: string | null;
}

export interface ChatMessage {
  id: number;
  playerId: string;
  text: string;
  at: number;
}

export interface Room {
  code: string;
  maxPlayers: number;
  hostId: string;
  status: 'lobby' | 'playing' | 'finished';
  players: Player[];
  game: Game | null;
  chat: ChatMessage[];
  rematch: string[]; // player ids who voted
  lastActivity: number;
}

const rooms = new Map<string, Room>();
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
export const IDLE_TTL_MS = 30 * 60_000; // room with nobody connected
export const MAX_TTL_MS = 12 * 60 * 60_000; // any room

const token = (bytes: number) => randomBytes(bytes).toString('base64url');

export function createRoom(maxPlayers: number): Room {
  let code: string;
  do code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  while (rooms.has(code));
  const room: Room = {
    code, maxPlayers, hostId: '', status: 'lobby', players: [], game: null,
    chat: [], rematch: [], lastActivity: Date.now(),
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
    ready: false, connected: true, left: false, socketId: null,
  };
  room.players.push(player);
  if (!room.hostId) room.hostId = player.id;
  return player;
}

export function removePlayer(room: Room, playerId: string) {
  room.players = room.players.filter((p) => p.id !== playerId);
  if (room.players.length === 0) return deleteRoom(room.code);
  if (room.hostId === playerId) room.hostId = room.players[0].id;
}

export function startGame(room: Room) {
  const active = room.players.filter((p) => !p.left);
  // keep clockwise seat order regardless of join order
  const order = SEATS[4].filter((c) => active.some((p) => p.color === c));
  room.game = createGame(order);
  room.status = 'playing';
  room.rematch = [];
}

// What clients see. Never includes secrets or socket ids.
export function publicState(room: Room) {
  return {
    code: room.code,
    maxPlayers: room.maxPlayers,
    hostId: room.hostId,
    status: room.status,
    players: room.players.map(({ id, name, avatar, color, ready, connected, left }) => ({
      id, name, avatar, color, ready, connected, left,
    })),
    game: room.game,
    chat: room.chat,
    rematch: room.rematch,
  };
}

export function sweep(now = Date.now()) {
  for (const room of rooms.values()) {
    const nobodyHere = room.players.every((p) => !p.connected);
    if ((nobodyHere && now - room.lastActivity > IDLE_TTL_MS) || now - room.lastActivity > MAX_TTL_MS) {
      rooms.delete(room.code);
    }
  }
}
