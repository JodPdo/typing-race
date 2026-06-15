# Typing Race

Real-time multiplayer typing game. A server-authoritative race where you type a passage
against other players or a bot — progress, WPM, and ranks are all decided by the server
and streamed to clients over WebSockets.

This is a monorepo:

- **`server/`** — Node + TypeScript, Express + Socket.IO (port `3004`). Holds the
  transport-free game core (rooms, scoring, anti-cheat, bots) and the socket layer with a
  fixed tick loop that is the single broadcaster of race state.
- **`client/`** — Vite + React + TypeScript. A thin client that only reflects
  server-provided state (it never computes WPM or winners).

## Quick start

```bash
# 1. Server
cd server
npm install
npm run dev        # listens on http://localhost:3004

# 2. Client (in another terminal)
cd client
npm install
npm run dev        # serves http://localhost:5173
```

Open the client, enter a name, and click **Play solo (vs bot)** to race.

## Scripts

| Location | Command | What it does |
|----------|---------|--------------|
| `server/` | `npm run dev` | Run the server with live reload |
| `server/` | `npm test` | Unit tests for scoring / room logic |
| `server/` | `npm run build` | Compile TypeScript to `dist/` |
| `client/` | `npm run dev` | Vite dev server |
| `client/` | `npm run build` | Type-check + production build |

## Deploy

Live at **https://race.aiklaotrip.com**. Pushing to `main` runs CI (tests + typecheck +
build) and, on success, deploys to the VPS via PM2 behind nginx. See **[DEPLOY.md](DEPLOY.md)**
for the one-time setup (PostgreSQL, GitHub secrets, nginx, PM2) and the pipeline details.

## Status

Feature-complete: real-time solo/versus play, server-authoritative scoring + anti-cheat,
bots, reconnect/presence, optional PostgreSQL leaderboard, and CI/CD deploy.
