// Mirrors what the server's publicState() sends.
import type { Color } from '../../../shared/board.ts';

export type { Color };

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
  order: Color[];
  out: Color[];
  current: number;
  phase: 'roll' | 'move' | 'over';
  dice: number | null;
  sixStreak: number;
  tokens: Record<string, number[]>;
  legal: number[];
  winner: Color | null;
  version: number;
  events: GameEvent[];
  lastMove: GameEvent | null;
}

export interface PublicPlayer {
  id: string;
  name: string;
  avatar: string;
  color: Color;
  ready: boolean;
  connected: boolean;
  left: boolean;
}

export interface RoomState {
  code: string;
  maxPlayers: number;
  hostId: string;
  status: 'lobby' | 'playing' | 'finished';
  players: PublicPlayer[];
  game: Game | null;
  chat: { id: number; playerId: string; text: string; at: number }[];
  rematch: string[];
}

export const AVATARS = ['🦊', '🐼', '🐱', '🐶', '🐰', '🦁', '🐸', '🐧', '🦄', '🐻', '🌸', '⭐'];
export const REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👏', '🔥', '😘'];
export const QUICK_CHAT = ['❤️ Love you!', '😂 Nice move!', '🎲 Your turn!', "😈 I'm going to win!", '🥰 Playing with you is the best!'];

export const COLOR_HEX: Record<Color, string> = {
  red: '#e5484d', green: '#2f9e65', yellow: '#f0a800', blue: '#3e63dd',
};
export const COLOR_SOFT: Record<Color, string> = {
  red: '#fde3e3', green: '#dcf3e6', yellow: '#fff1c7', blue: '#e1e8ff',
};
