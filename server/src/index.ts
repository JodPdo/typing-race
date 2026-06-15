// Typing Race — server entrypoint.
// Boots Express + HTTP + Socket.IO on one shared listener and hands the Socket.IO server
// to registerSocket(), which owns all game wiring. Config is env-driven (src/config.ts).

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { config } from './config';
import { registerSocket } from './socket';
import { initDb } from './db/pool';
import { router as apiRouter } from './http/routes';

const app = express();
app.use(express.json());

// One shared server: Express builds the request handler, http.createServer(app) is the
// actual TCP server, and Socket.IO attaches to it. HTTP routes and WebSocket upgrades
// both ride the single listener on config.port.
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: config.corsOrigin },
});

// HTTP health check — confirms the Express pipe is alive.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Phase 6B HTTP API (leaderboard, …).
app.use('/api', apiRouter);

// All rooms, ticks, and game events live here.
registerSocket(io);

// Best-effort DB init: if it fails (or the DB is disabled), the game still runs.
initDb().catch((err) => console.error('initDb failed', err));

server.listen(config.port, () => {
  console.log(`typing-race server listening on :${config.port}`);
});
