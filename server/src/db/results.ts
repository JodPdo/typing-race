// Phase 6B: read/write helpers for persisted race results. All queries are parameterized
// ($1, $2, …) — user-supplied values (names, etc.) are NEVER concatenated into SQL. Every
// function degrades to a no-op / empty result when the DB is disabled (pool === null).

import { pool } from './pool';
import { ResultRow } from '../types';

// Columns written per result row (created_at uses its DEFAULT).
const COLS = ['room_code', 'mode', 'player_name', 'wpm', 'accuracy', 'rank', 'finished_ms'];

/**
 * Persist a finished race's results in ONE parameterized multi-row INSERT. No-op when the
 * DB is disabled or there is nothing to save.
 */
export async function saveResults(
  roomCode: string,
  mode: string,
  results: ResultRow[],
): Promise<void> {
  if (!pool || results.length === 0) return;

  const values: unknown[] = [];
  const tuples = results.map((r, i) => {
    const base = i * COLS.length;
    values.push(roomCode, mode, r.name, r.wpm, r.accuracy, r.rank, r.timeMs);
    // -> ($1,$2,$3,$4,$5,$6,$7), ($8,...), ...
    const placeholders = COLS.map((_, c) => `$${base + c + 1}`).join(',');
    return `(${placeholders})`;
  });

  const sql = `INSERT INTO race_result (${COLS.join(', ')}) VALUES ${tuples.join(', ')}`;
  await pool.query(sql, values);
}

export interface LeaderboardRow {
  player_name: string;
  wpm: number;
  accuracy: string; // pg returns NUMERIC as a string to preserve precision
  created_at: Date;
}

/** Top results by WPM. Returns [] when the DB is disabled. */
export async function getLeaderboard(limit: number): Promise<LeaderboardRow[]> {
  if (!pool) return [];
  const result = await pool.query<LeaderboardRow>(
    'SELECT player_name, wpm, accuracy, created_at FROM race_result ORDER BY wpm DESC LIMIT $1',
    [limit],
  );
  return result.rows;
}
