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
| `server/` | `npm test` | Run the Jest test suite (unit + API) |
| `server/` | `npm run test:coverage` | Run the suite with a coverage report |
| `server/` | `npm run build` | Compile TypeScript to `dist/` |
| `client/` | `npm run dev` | Vite dev server |
| `client/` | `npm run build` | Type-check + production build |

## Testing

The server ships with an automated test suite (Jest + ts-jest) covering the transport-free
game core and the HTTP API — **60 tests across 7 suites**. Run `npm test` in `server/`
(or `npm run test:coverage` for a coverage report).

| Layer | What it covers |
|-------|----------------|
| **Unit** | `scoring` (`computeWpm`, `computeAccuracy`, `clampProgress`, `assignRanks`), the `Room` / `RoomManager` state machine, bot pacing, and passage selection |
| **Anti-cheat / integrity** | `clampProgress` asserts the client can never rewind progress, overshoot the passage, or exceed a human-plausible max speed |
| **API (Supertest)** | `GET /health` and `GET /api/leaderboard` — limit clamping (1–100, default 20) and the graceful DB-disabled fallback (`DATABASE_URL=''`) |

Tests are kept **deterministic**: time is injected and bot output is asserted by range/ordering
(never exact positions), so the real-time suite doesn't flake. The full plan — scope, a
risk register (P1–P3), entry/exit criteria, and a requirements traceability matrix — lives in
**[QA_TEST_STRATEGY.md](QA_TEST_STRATEGY.md)**.

CI runs the suite on every push to `main`; a red suite blocks the build and the VPS deploy
never runs (see [Deploy](#deploy)).

## Deploy

Live at **https://race.aiklaotrip.com**. Pushing to `main` runs CI (tests + typecheck +
build) and, on success, deploys to the VPS via PM2 behind nginx. See **[DEPLOY.md](DEPLOY.md)**
for the one-time setup (PostgreSQL, GitHub secrets, nginx, PM2) and the pipeline details.

## Status

Feature-complete: real-time solo/versus play, server-authoritative scoring + anti-cheat,
bots, reconnect/presence, optional PostgreSQL leaderboard, and CI/CD deploy.
