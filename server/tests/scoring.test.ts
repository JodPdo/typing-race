import {
  computeWpm,
  computeAccuracy,
  clampProgress,
  assignRanks,
  Rankable,
} from '../src/game/scoring';

describe('computeWpm', () => {
  it('returns 0 for the zero/invalid case', () => {
    expect(computeWpm(0, 1000)).toBe(0); // no progress
    expect(computeWpm(100, 0)).toBe(0); // no time
    expect(computeWpm(100, -50)).toBe(0); // negative time
  });

  it('computes WPM with the 5-chars-per-word convention', () => {
    // 250 chars in 60s = 50 words in 1 min = 50 WPM
    expect(computeWpm(250, 60000)).toBe(50);
    // 50 chars in 30s = 10 words in 0.5 min = 20 WPM
    expect(computeWpm(50, 30000)).toBe(20);
  });
});

describe('computeAccuracy', () => {
  it('returns 100 when there are no keystrokes', () => {
    expect(computeAccuracy(0, 0)).toBe(100);
  });

  it('computes a 2-decimal percentage and clamps to 100', () => {
    expect(computeAccuracy(1, 3)).toBe(33.33);
    expect(computeAccuracy(99, 100)).toBe(99);
    expect(computeAccuracy(120, 100)).toBe(100); // clamped
  });
});

describe('clampProgress', () => {
  it('never rewinds below the previous position', () => {
    // reported (30) is behind prev (50) → keep 50
    expect(clampProgress(50, 30, 200, 5000, 20)).toBe(50);
  });

  it('caps at the text length', () => {
    // plenty of time, but text is only 100 chars long
    expect(clampProgress(0, 999, 100, 100000, 20)).toBe(100);
  });

  it('rejects a superhuman jump', () => {
    // 1s elapsed, 20 cps → humanMax = floor(1*20)+2 = 22; reported 1000 is impossible
    expect(clampProgress(0, 1000, 500, 1000, 20)).toBe(22);
  });

  it('ignores non-finite input by keeping the previous position', () => {
    expect(clampProgress(10, NaN, 100, 1000, 20)).toBe(10);
    expect(clampProgress(10, Infinity, 100, 1000, 20)).toBe(10);
  });
});

describe('assignRanks', () => {
  it('ranks an earlier finisher ahead of a slower finisher, and finishers ahead of non-finishers', () => {
    const players: Rankable[] = [
      { seatId: 'slow-finisher', finishedAt: 2000, position: 100 },
      { seatId: 'fast-finisher', finishedAt: 1000, position: 100 },
      { seatId: 'still-typing', finishedAt: null, position: 40 },
    ];

    const ranks = assignRanks(players);

    expect(ranks.get('fast-finisher')).toBe(1);
    expect(ranks.get('slow-finisher')).toBe(2);
    expect(ranks.get('still-typing')).toBe(3);
    // finisher beats slower finisher
    expect(ranks.get('fast-finisher')! < ranks.get('slow-finisher')!).toBe(true);
  });

  it('among non-finishers, the furthest position wins', () => {
    const players: Rankable[] = [
      { seatId: 'near', finishedAt: null, position: 40 },
      { seatId: 'far', finishedAt: null, position: 80 },
    ];

    const ranks = assignRanks(players);

    expect(ranks.get('far')).toBe(1);
    expect(ranks.get('near')).toBe(2);
  });
});
