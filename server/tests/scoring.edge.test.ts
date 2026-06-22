// Phase 1 — edge cases for the pure scoring/anti-cheat core that the original
// scoring.test.ts (happy paths) did not cover. Maps to risks R1 (anti-cheat) and
// R2 (ranking); traceability T-03, T-04.

import { computeWpm, computeAccuracy, clampProgress, assignRanks, Rankable } from '../src/game/scoring';

describe('computeWpm — rounding', () => {
  it('rounds to the nearest integer', () => {
    // 30 chars / 5 = 6 words in 1 min => 6 WPM (exact)
    expect(computeWpm(30, 60000)).toBe(6);
    // 33 chars / 5 = 6.6 words in 1 min => round(6.6) = 7
    expect(computeWpm(33, 60000)).toBe(7);
  });
});

describe('computeAccuracy — lower clamp', () => {
  it('never returns below 0 even for nonsensical negative input', () => {
    expect(computeAccuracy(-5, 100)).toBe(0);
  });
});

describe('clampProgress — non-finite arguments', () => {
  // ANY non-finite argument must make the validator a no-op that keeps prevPosition.
  it.each([
    ['reported', (p: number) => clampProgress(p, NaN, 100, 1000, 20)],
    ['textLength', (p: number) => clampProgress(p, 50, NaN, 1000, 20)],
    ['elapsedMs', (p: number) => clampProgress(p, 50, 100, NaN, 20)],
    ['maxCharsPerSec', (p: number) => clampProgress(p, 50, 100, 1000, NaN)],
    ['reported=Infinity', (p: number) => clampProgress(p, Infinity, 100, 1000, 20)],
  ])('keeps prevPosition when %s is non-finite', (_label, run) => {
    expect(run(10)).toBe(10);
  });
});

describe('clampProgress — human-speed boundary', () => {
  // 1s elapsed at 20 cps => humanMax = floor(1*20)+2 = 22.
  it('accepts a report exactly at the human max', () => {
    expect(clampProgress(0, 22, 500, 1000, 20)).toBe(22);
  });

  it('clamps a report one past the human max', () => {
    expect(clampProgress(0, 23, 500, 1000, 20)).toBe(22);
  });
});

describe('assignRanks — degenerate inputs', () => {
  it('returns an empty map for no players', () => {
    expect(assignRanks([]).size).toBe(0);
  });

  it('ranks a single player first', () => {
    const ranks = assignRanks([{ seatId: 'solo', finishedAt: 1000, position: 50 }]);
    expect(ranks.get('solo')).toBe(1);
  });

  it('assigns distinct ranks 1 and 2 to two players who finished at the same time', () => {
    const players: Rankable[] = [
      { seatId: 'a', finishedAt: 1000, position: 100 },
      { seatId: 'b', finishedAt: 1000, position: 100 },
    ];
    const ranks = assignRanks(players);
    expect(new Set([ranks.get('a'), ranks.get('b')])).toEqual(new Set([1, 2]));
  });
});
