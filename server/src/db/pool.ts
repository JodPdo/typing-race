// Phase 6B: optional PostgreSQL connection. Persistence is a bolt-on, not a dependency —
// when DATABASE_URL is unset, `pool` is null and every db helper becomes a no-op so the
// game runs exactly as before. Only FINISHED results are ever written here; live race
// state always stays in memory (see Room / socket layer).

import { Pool } from 'pg';
import { config } from '../config';

export const pool: Pool | null = config.databaseUrl
  ? new Pool({ connectionString: config.databaseUrl })
  : null;

/**
 * Create the results table + indexes if they don't exist. Idempotent: safe to run on every
 * boot. No-op when the DB is disabled.
 */
export async function initDb(): Promise<void> {
  if (!pool) {
    console.log('DB disabled (no DATABASE_URL) — results will not be persisted.');
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS race_result (
      id          BIGSERIAL PRIMARY KEY,
      room_code   TEXT        NOT NULL,
      mode        TEXT        NOT NULL,
      player_name TEXT        NOT NULL,
      wpm         INTEGER     NOT NULL,
      accuracy    NUMERIC(5,2) NOT NULL,
      rank        INTEGER     NOT NULL,
      finished_ms INTEGER     NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_race_result_wpm ON race_result (wpm DESC);');
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_race_result_created_at ON race_result (created_at DESC);',
  );

  console.log('DB ready');
}
