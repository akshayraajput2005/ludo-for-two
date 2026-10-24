import express from 'express';
import { createServer as createHttp } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { rollDie } from './game/dice.ts';
import { roomCount, sweep } from './rooms/rooms.ts';
import { registerHandlers, type HandlerOptions } from './sockets/handlers.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(here, '../../client/dist');

// ALLOWED_ORIGINS: comma-separated, only needed when the client is hosted on a different domain.
const origins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
  .split(',').map((s) => s.trim()).filter(Boolean);

export function createServer(opts: HandlerOptions = { rollDie }) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/health', (_req, res) => { res.json({ ok: true, rooms: roomCount() }); });
  if (existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST, { maxAge: '1h', index: false }));
    app.get(/.*/, (_req, res) => { res.sendFile(path.join(CLIENT_DIST, 'index.html')); });
  }
  const http = createHttp(app);
  const io = new Server(http, {
    cors: { origin: origins },
    maxHttpBufferSize: 10_000, // our messages are tiny
    pingInterval: 10_000,
    pingTimeout: 8_000,
  });
  registerHandlers(io, opts);
  return { http, io };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { http } = createServer();
  setInterval(() => sweep(), 60_000).unref();
  const port = Number(process.env.PORT) || 3001;
  http.listen(port, () => console.log(`Ludo server on http://localhost:${port}`));
}
