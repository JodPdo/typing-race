// Phase 4 runtime config. Every value has a sane default and can be overridden via an
// environment variable, so the same build runs in dev and (later) prod without edits.

export interface Config {
  port: number;
  countdownSeconds: number;
  tickMs: number;
  maxCharsPerSec: number;
  corsOrigin: string;
  reconnectGraceMs: number;
  databaseUrl: string;
}

/** Parse an env var as a number, falling back when it is unset/blank/non-numeric. */
function num(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const config: Config = {
  port: num(process.env.PORT, 3004),
  countdownSeconds: num(process.env.COUNTDOWN_SECONDS, 3),
  tickMs: num(process.env.TICK_MS, 100),
  maxCharsPerSec: num(process.env.MAX_CHARS_PER_SEC, 20),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  // Phase 6A: how long a dropped player's seat (and progress) is held for reconnect.
  reconnectGraceMs: num(process.env.RECONNECT_GRACE_MS, 30000),
  // Phase 6B: PostgreSQL connection string. Empty = persistence disabled (game still runs).
  databaseUrl: process.env.DATABASE_URL ?? '',
};
