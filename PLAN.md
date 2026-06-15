# Typing Race — Project Plan

A real-time multiplayer typing race web application. Players race to type the same
passage; live progress and WPM sync across players over WebSockets. Default mode pits a
lone visitor against a server-controlled bot (over the same real-time pipeline), so the
app is instantly playable solo; a room-code mode enables human-vs-human play.

Built as a portfolio project to demonstrate React (web), WebSocket/real-time, server
design, concurrency, and production deployment.

## Stack

- Client: React + TypeScript (Vite)
- Real-time: Socket.IO over WebSocket
- Server: Node.js + Express + TypeScript
- Persistence: PostgreSQL (final results / leaderboard only; live state in memory)
- Ops: PM2 + nginx on an Ubuntu VPS, GitHub Actions CI/CD
- Tests: Jest (server-authoritative logic)

Deployment target: `race.aiklaotrip.com` (Node service on port 3004 behind nginx).

## Design principles

- Server-authoritative: the server owns the canonical text and decides progress, WPM,
  and the winner. The client never declares outcomes.
- Transport-free game core: scoring + Room logic import no Socket.IO and no DB, so they
  stay unit-testable.
- In-memory live state; PostgreSQL only for finished results. Redis only if/when scaling
  to multiple processes.
- No authentication. Anonymous display names. Reconnect uses an ephemeral per-seat token
  (not a login).
- Ship over scope: a finished, deployed app beats an ambitious unfinished one.

## Status

| Phase | Scope | Status |
|------|-------|--------|
| 1 | Server skeleton: Express + HTTP + Socket.IO on :3004, `/health` | Done |
| 2 | Server-authoritative core (scoring + anti-cheat) + Jest tests | Done |
| 3 | Room state machine + RoomManager + Bot (transport-free) | Done |
| 4 | WebSocket wiring + tick loop + solo/bot — playable locally | Next |
| 5 | React client (Home + Race screens) | Not started |
| 6 | Reconnect + presence + PostgreSQL + deploy (PM2/nginx/CI) | Not started |

## Phases

### Phase 1 — Server skeleton (Done)
Express + raw HTTP server + Socket.IO sharing one port (3004). `GET /health` returns
`{status:'ok'}`. Connection/disconnection logging proves the WebSocket pipe works.
Acceptance: `npm run dev` boots; `/health` responds; a connecting client logs on server.

### Phase 2 — Server-authoritative core + tests (Done)
`src/game/scoring.ts` pure functions: `computeWpm`, `computeAccuracy`, `clampProgress`
(anti-cheat: no rewind, cap at text length, reject superhuman speed), `assignRanks`.
Jest configured; `tests/scoring.test.ts` green.
Acceptance: `npm test` passes; functions import nothing from socket.io/pg.

### Phase 3 — Room state machine + RoomManager (Done)
`types.ts` (Player/PublicPlayer/ResultRow/Phase/Mode), `passages.ts`, `Bot.ts` (pure
bot pacing helpers), `Room.ts` (state machine `lobby → countdown → racing → finished`,
`applyProgress` via clampProgress, `advanceBots`, `finish` via assignRanks,
`publicPlayers`), `RoomManager.ts` (unique 4-char codes excluding 0/O/1/I).
Acceptance: `npm test` (Phase 2 + 3) green; Room/RoomManager import no socket.io/pg.

### Phase 4 — WebSocket wiring + tick loop + bot (Next)
Socket handlers map events to RoomManager/Room: `room:createSolo`, `room:create`,
`room:join`, `player:ready`, `race:progress`. Server emits `room:joined`, `room:state`,
`race:countdown`, `race:start`, `race:tick` (~10 Hz), `race:finished`. One tick loop per
active room advances bots and broadcasts validated state. Solo+bot playable end-to-end.
Acceptance: a scripted client can create a solo room, receive ticks including the bot,
and reach `race:finished` with server-assigned ranks.

### Phase 5 — React client (Not started)
Vite + TS app. `socket.ts` singleton. Home (play solo / create / join by code). Race
(countdown, text pane with typed/cursor highlight, per-player progress + live WPM,
result modal). Renders purely from server events.
Acceptance: a recruiter can open the URL, click Play, and complete a race vs the bot.

### Phase 6 — Reconnect + DB + deploy (Not started)
Reconnect: `room:reconnect {code, token}` reattaches a seat within a 30s grace window;
presence reflects connected/disconnected. PostgreSQL: `race_result` table + leaderboard
query + `GET /api/leaderboard`. Deploy: PM2 ecosystem (port 3004, fork), nginx reverse
proxy with WebSocket upgrade headers, GitHub Actions (build + test + SSH deploy + pm2
reload).
Acceptance: deployed and playable at the public URL; reconnect resumes mid-race; results
persist and appear on the leaderboard.

## Out of scope (MVP)

No user accounts, login, JWT, or profiles. No matchmaking beyond room codes. No
inventory, economy, character movement, or physics.

## Target resume bullet

Built a real-time multiplayer typing race web application using React, TypeScript,
Socket.IO, and Node.js. Implemented room-based play, live state synchronization,
server-controlled bot opponents, reconnect/presence handling, and server-authoritative
score validation over WebSockets, with Jest tests in CI. Deployed a full-stack real-time
app to a Linux VPS behind an nginx WebSocket proxy with automated CI/CD via GitHub
Actions.