// Phase 6B: HTTP API for persisted data. Mounted at /api by index.ts.

import { Router } from 'express';
import { getLeaderboard } from '../db/results';

export const router = Router();

// GET /api/leaderboard?limit=20  — top results by WPM (limit clamped to 1..100, default 20).
// Returns { leaderboard: [] } when the DB is disabled.
router.get('/leaderboard', async (req, res) => {
  const raw = Number(req.query.limit);
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(100, Math.floor(raw)) : 20;

  try {
    const leaderboard = await getLeaderboard(limit);
    res.json({ leaderboard });
  } catch (err) {
    console.error('leaderboard query failed', err);
    res.status(500).json({ error: 'leaderboard query failed' });
  }
});
