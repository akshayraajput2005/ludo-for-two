import { io } from 'socket.io-client';

// Empty = same origin (server serves the client, or Vite dev proxy). Set VITE_SERVER_URL if hosted separately.
const URL = import.meta.env.VITE_SERVER_URL || undefined;

export const socket = io(URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 500,
  reconnectionDelayMax: 4000,
});

// `transient` = network problem, not an answer from the server.
export type Ack = { ok: boolean; error?: string; transient?: boolean; code?: string; playerId?: string; secret?: string };

export function emit(event: string, args: object = {}): Promise<Ack> {
  return new Promise((resolve) => {
    if (!socket.connected) return resolve({ ok: false, transient: true, error: 'Not connected — retrying…' });
    socket.timeout(8000).emit(event, args, (err: Error | null, res: Ack) =>
      resolve(err ? { ok: false, transient: true, error: 'Server did not respond' } : res),
    );
  });
}

const SESSION_KEY = 'ludo:session';
export type Session = { code: string; playerId: string; secret: string };

// sessionStorage keeps two tabs in one browser as two separate players (handy for testing);
// localStorage lets a phone reopen the link after the tab was closed.
export const session = {
  get(): Session | null {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY) || 'null');
    } catch { return null; }
  },
  set(s: Session) {
    try {
      const v = JSON.stringify(s);
      sessionStorage.setItem(SESSION_KEY, v);
      localStorage.setItem(SESSION_KEY, v);
    } catch { /* private mode */ }
  },
  clear() {
    try { sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_KEY); } catch { /* private mode */ }
  },
};
