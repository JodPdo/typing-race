# Typing Race — QA Test Strategy & Test Plan

> Phase 0 of the QA automation effort. This document defines **what** we test, **why**,
> **at which layer**, and **how we decide it passed** — before any new test code is written.
> It is the contract the later automation phases (unit → integration → API → E2E → CI gate)
> are built against.

| | |
|---|---|
| **Application** | Typing Race — real-time multiplayer typing game |
| **Architecture** | React + TS client (Vite) · Node + TS server (Express + Socket.IO, port 3004) · PostgreSQL (results only) |
| **Live URL** | https://race.aiklaotrip.com |
| **Test owner** | QA Automation (solo) |
| **Status** | Phase 0 — strategy approved, automation not yet started |
| **Last updated** | 2026-06-22 |

---

## 1. Purpose & objectives

The product already ships with feature-complete gameplay and a CI/CD pipeline, but its
automated safety net is thin: only two server-side unit files
(`tests/scoring.test.ts`, `tests/room.test.ts`). The goal of this QA effort is to build a
**layered, risk-based automated test suite** that:

1. Proves the **server-authoritative guarantees** hold — the client can never declare a
   winner, rewind progress, or fake superhuman speed.
2. Protects the **real-time pipeline** (WebSocket events, tick loop, countdown, finish)
   from regressions as the code evolves.
3. Verifies the **user-facing flows** end-to-end the way a real player experiences them.
4. Acts as a **CI quality gate**: a red suite blocks deploy to the VPS.

Success = a deploy can only reach `race.aiklaotrip.com` if every layer of the pyramid is
green, and the suite produces an artifact (coverage + Playwright report) a reviewer can open.

---

## 2. Quality characteristics in scope

Prioritised by the nature of the app (real-time, anonymous, server-authoritative):

| Characteristic | Why it matters here | Primary test layer |
|---|---|---|
| **Functional correctness** | Scoring, ranking, room lifecycle must be exact | Unit + integration |
| **Integrity / anti-cheat** | Server must reject rewind, overshoot, superhuman speed | Unit (`clampProgress`) + WS integration |
| **Real-time behaviour** | Ticks (~10 Hz), countdown, synchronised state | WS integration + E2E |
| **Reliability / resilience** | Reconnect grace window, DB-down must not break gameplay | WS integration + API |
| **Concurrency** | Many rooms / two humans by code, unique room codes | Integration |
| **Compatibility / UX** | Recruiter opens URL → plays vs bot → sees result | E2E (Playwright) |

Performance/load and security pen-testing are **out of scope** for this phase (noted in §10).

---

## 3. Test strategy — the pyramid mapped to this codebase

A deliberate pyramid: many fast, deterministic tests at the bottom; a few slow, realistic
ones at the top. The app's "transport-free game core" design makes this natural — scoring
and Room logic import no Socket.IO and no DB, so they are pure-unit-testable.

```
            ╱╲          E2E (Playwright)         few   ~5–8 specs
           ╱  ╲         user flows in a browser
          ╱────╲        API tests                 some  ~6–10 cases
         ╱      ╲       /health, /api/leaderboard
        ╱────────╲      WS integration            many  ~15–20 cases
       ╱          ╲     socket events ↔ Room
      ╱────────────╲    Unit (Jest)               most  ~40+ cases
     ╱______________╲   scoring / Room / Bot / RoomManager
```

### Layer 1 — Unit (Jest, already present, to be expanded)
Targets the pure modules. No network, no DB, deterministic clock (`now` is injectable in
`Room`).

- `scoring.ts` — `computeWpm`, `computeAccuracy`, `clampProgress`, `assignRanks`
- `Room.ts` — `addPlayer`/`addBot`, `applyProgress`, `advanceBots`, `allFinished`,
  `finish`, `publicPlayers`, `markDisconnected`, `reconnect`
- `RoomManager.ts` — unique-code generation, case-insensitive `get`, `remove`
- `Bot.ts` — `botName`, `pickBotWpm`, `botPosition` pacing
- `passages.ts` — `pickPassage`

### Layer 2 — WebSocket integration (new)
Boots the real Socket.IO server in-process and drives it with a scripted
`socket.io-client`. Asserts the **event contract**, not internals.

Client→server events: `room:createSolo`, `room:create`, `room:join`, `room:reconnect`,
`player:ready`, `race:progress`, `disconnect`.
Server→client events: `room:joined`, `room:state`, `race:countdown`, `race:start`,
`race:tick`, `race:finished`, `error`.

### Layer 3 — API (new)
HTTP surface via Supertest against the Express app.

- `GET /health` → `{status:'ok'}`
- `GET /api/leaderboard?limit=N` → `{leaderboard:[...]}`, limit clamped 1..100 (default 20),
  and graceful behaviour when the DB is disabled (`DATABASE_URL=''` → `{leaderboard:[]}`).
- DB-backed cases use **Testcontainers Postgres** so the leaderboard query runs against
  real Postgres, not a mock.

### Layer 4 — E2E (new, Playwright)
Real browser against the built client + server. Records trace/video on failure.

- Solo vs bot: open → enter name → Play solo → race completes → result modal shows ranks.
- Versus by code: two browser contexts, create + join, both ready, both finish.
- Reconnect: drop one context mid-race, rejoin within grace, racing screen rebuilds.

---

## 4. Scope

### In scope
- All server game logic (scoring, room state machine, bot, room manager).
- The full Socket.IO event contract and the tick/countdown/finish loop.
- `GET /health` and `GET /api/leaderboard`.
- Core user journeys: solo-vs-bot, versus-by-code, reconnect/presence.
- CI integration of all of the above as a deploy gate.

### Out of scope (this phase)
- Load / stress / soak testing of the WebSocket layer.
- Security testing beyond the built-in anti-cheat assertions.
- Visual pixel-diff regression (basic a11y/role checks only in E2E).
- nginx / PM2 / infrastructure testing (covered by DEPLOY.md, not this suite).
- Mobile-native clients (separate repo).

---

## 5. Risk-based prioritisation

Tests are written in risk order, not file order. Highest risk = server-authoritative
guarantees and the real-time loop, because a defect there is silent and corrupts outcomes.

| # | Risk | Likelihood | Impact | Priority | Covered by |
|---|---|---|---|---|---|
| R1 | Anti-cheat bypass — client rewinds, overshoots, or fakes speed | Med | High | **P1** | Unit `clampProgress` + WS `race:progress` |
| R2 | Wrong ranking at finish (tie, DNF, finish order) | Med | High | **P1** | Unit `assignRanks`/`finish` + WS `race:finished` |
| R3 | Tick loop never ends or double-fires `race:finished` | Low | High | **P1** | WS integration |
| R4 | Reconnect grace window drops a live seat (or fails to drop a dead one) | Med | Med | **P2** | Unit `markDisconnected`/`reconnect` + WS |
| R5 | Room code collision / case-sensitivity on join | Low | Med | **P2** | Unit `RoomManager` |
| R6 | DB outage breaks gameplay instead of degrading | Low | High | **P2** | API + WS (saveResults is fire-and-forget) |
| R7 | Join after race started succeeds (should be rejected) | Med | Med | **P2** | WS `room:join` error path |
| R8 | Leaderboard limit not clamped / ordering wrong | Low | Low | **P3** | API |
| R9 | Client renders state it computed itself (not server-provided) | Low | Med | **P3** | E2E |

---

## 6. Test environment & data

| Concern | Decision |
|---|---|
| **Unit / WS / API runtime** | Node 20 (matches CI), Jest + ts-jest |
| **Clock** | Inject `now` into `Room` methods for deterministic time; fake timers for tick/countdown |
| **Real-time client** | `socket.io-client` already a devDependency |
| **DB for API tests** | Testcontainers Postgres (ephemeral, per-run); `DATABASE_URL=''` path tested separately for the disabled case |
| **E2E** | Playwright against `vite build` preview + server on an ephemeral port |
| **Test data** | Passages from `passages.ts`; bot WPM is randomised, so assert ranges/ordering, never exact bot positions |
| **Config under test** | Defaults from `config.ts`: `tickMs=100`, `countdownSeconds=3`, `maxCharsPerSec=20`, `reconnectGraceMs=30000`. Override via env in tests to keep them fast (e.g. shorter grace). |

**Determinism rule:** never assert exact bot positions or wall-clock timings. Assert
invariants (monotonic progress, finisher-before-DNF ordering, event arrival) and inject
time where possible.

---

## 7. Tooling

| Layer | Tool | Notes |
|---|---|---|
| Unit | Jest + ts-jest | already configured in `server/` |
| Coverage | Jest `--coverage` | thresholds enforced (see §8) |
| WS integration | Jest + `socket.io` + `socket.io-client` | boot server on ephemeral port |
| API | Supertest + Testcontainers | real Postgres for leaderboard |
| E2E | Playwright (`@playwright/test`) | trace + video on failure, HTML report |
| CI | GitHub Actions (`.github/workflows/deploy.yml`) | new `qa` job gating `deploy` |
| Reporting | Jest coverage summary + Playwright HTML report | uploaded as CI artifacts |

---

## 8. Entry & exit criteria + quality gates

### Entry criteria (before automation starts on a feature)
- The feature's expected server→client event contract is documented (this file / PLAN.md).
- The relevant module builds and existing tests are green.

### Exit criteria (a phase is "done")
- All planned cases for the layer written and passing in CI.
- No P1 risk left without at least one automated test.
- Coverage thresholds met (below).
- Playwright report generates with zero failing specs.

### Coverage targets (enforced in CI; start realistic, ratchet up)
| Scope | Statements | Branches | Functions |
|---|---|---|---|
| `src/game/**` (core logic) | ≥ 90% | ≥ 85% | ≥ 90% |
| `src/socket/**`, `src/http/**` | ≥ 75% | ≥ 65% | ≥ 75% |
| Project total | ≥ 80% | ≥ 70% | ≥ 80% |

### Quality gate (CI)
`deploy` already depends on `ci`. The new `qa` job runs unit + WS + API + E2E; if **any**
fails, the artifact is never built and the VPS deploy never runs. Green pyramid is a
hard precondition for production.

---

## 9. Defect management

Lightweight, suited to a solo portfolio repo but written the way a team would read it.

**Logged as GitHub Issues** with: title, steps to reproduce, expected vs actual,
affected layer, severity, and a link to the failing test/CI run.

| Severity | Definition | Example | SLA target |
|---|---|---|---|
| **S1 Critical** | Corrupts outcomes / blocks play for all users | Anti-cheat bypass; wrong winner; tick never ends | Fix before next deploy |
| **S2 Major** | Core flow broken for some users | Reconnect drops live seat; join-after-start accepted | Fix this sprint |
| **S3 Minor** | Degraded but usable | Leaderboard limit not clamped | Backlog |
| **S4 Trivial** | Cosmetic / docs | Wrong label in result modal | Opportunistic |

Every fixed S1/S2 must ship **with a regression test** that fails before the fix.

---

## 10. Risks to the test effort & mitigations

| Risk to QA | Mitigation |
|---|---|
| Flaky timing in WS/E2E (real intervals) | Inject `now`, use fake timers, override `tickMs`/grace via env, assert invariants not timings |
| Randomised bot makes assertions brittle | Assert ranges/ordering; never hard-code bot positions |
| Testcontainers slow / unavailable in CI | Keep DB tests in a separate job; `DATABASE_URL=''` disabled-path covered without a container |
| E2E maintenance cost | Few high-value journeys only; keep selectors role-based |
| Scope creep into perf/security | Explicitly deferred here; reopen as a later phase |

---

## 11. Deliverables & phase plan

| Phase | Deliverable | Exit |
|---|---|---|
| **0 (this doc)** | QA Test Strategy & Test Plan | Approved |
| 1 | Expanded Jest unit suite + coverage thresholds | Core logic ≥ 90% |
| 2 | API tests (`/health`, `/api/leaderboard`) incl. DB-disabled + Testcontainers | All API cases green |
| 3 | WebSocket integration suite (full event contract) | All P1 real-time risks covered |
| 4 | Playwright E2E (solo, versus-by-code, reconnect) | Journeys green with report |
| 5 | CI `qa` gate + artifact upload (coverage + Playwright HTML) | Deploy blocked on red |
| 6 | README "Testing" section + coverage badge + resume bullet | Portfolio-ready |

---

## 12. Requirements traceability (seed)

Maps each tested behaviour to its source and intended layer — expanded as cases are written.

| ID | Requirement (server-authoritative behaviour) | Source | Layer |
|---|---|---|---|
| T-01 | WPM = chars/5 per minute; 0 on non-positive time/position | `scoring.computeWpm` | Unit |
| T-02 | Accuracy 0..100, 100 with no keystrokes | `scoring.computeAccuracy` | Unit |
| T-03 | Progress cannot rewind, overshoot text, or exceed human max | `scoring.clampProgress` | Unit + WS |
| T-04 | Ranks: finishers before DNF; finishers by time; DNF by position | `scoring.assignRanks` / `Room.finish` | Unit + WS |
| T-05 | Room codes unique, exclude 0/O/1/I, case-insensitive lookup | `RoomManager` | Unit |
| T-06 | Solo room: human + bot, auto countdown → start → tick → finish | `socket` + `Room` | WS |
| T-07 | Join rejected when room missing or not in `lobby` | `socket room:join` | WS |
| T-08 | Versus starts only when ≥2 humans all ready | `socket player:ready` | WS |
| T-09 | Disconnect keeps seat for grace window; reconnect by token restores it | `Room.markDisconnected`/`reconnect` + grace timer | Unit + WS |
| T-10 | `race:finished` fires exactly once; tick loop clears | `socket startTick` | WS |
| T-11 | Results persist for humans only; DB failure never breaks the game | `saveResults` (fire-and-forget) | API + WS |
| T-12 | `GET /api/leaderboard` clamps limit 1..100, default 20 | `http/routes` | API |
| T-13 | `GET /health` returns `{status:'ok'}` | `http` | API |
| T-14 | Client renders only server-provided state (no client-side winner) | client `useRace` | E2E |

---

## 13. Target resume bullet (Phase 6 output)

> Designed and implemented a layered automated test strategy for a real-time multiplayer
> web app: risk-based test plan, Jest unit + WebSocket integration tests for
> server-authoritative scoring/anti-cheat, Supertest + Testcontainers API tests, and
> Playwright E2E journeys — all wired into a GitHub Actions quality gate that blocks
> production deploys on failure, with coverage and HTML test reports as CI artifacts.
