// Phase 1 — pure bot pacing helpers (previously untested). Because the bot uses
// Math.random for name, wpm, and jitter, assertions are over ranges/invariants run many
// times, never exact values.

import { botName, pickBotWpm, botPosition } from '../src/game/Bot';

describe('botName', () => {
  it('returns a non-empty string', () => {
    for (let i = 0; i < 50; i++) {
      const name = botName();
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    }
  });
});

describe('pickBotWpm', () => {
  it('always returns an integer within [45, 70]', () => {
    for (let i = 0; i < 200; i++) {
      const wpm = pickBotWpm();
      expect(Number.isInteger(wpm)).toBe(true);
      expect(wpm).toBeGreaterThanOrEqual(45);
      expect(wpm).toBeLessThanOrEqual(70);
    }
  });
});

describe('botPosition', () => {
  it('is 0 at or before the start', () => {
    expect(botPosition(60, 0, 100)).toBe(0);
    expect(botPosition(60, -100, 100)).toBe(0);
  });

  it('never exceeds the text length even after a long time', () => {
    for (let i = 0; i < 50; i++) {
      expect(botPosition(70, 10_000_000, 100)).toBe(100);
    }
  });

  it('stays within [0, textLength] for arbitrary elapsed times', () => {
    for (let i = 0; i < 200; i++) {
      const pos = botPosition(45 + (i % 26), 1000 + i * 50, 80);
      expect(pos).toBeGreaterThanOrEqual(0);
      expect(pos).toBeLessThanOrEqual(80);
    }
  });

  it('progresses further over more elapsed time on average', () => {
    // Average out the ±2 jitter so the comparison is stable.
    const avg = (elapsed: number) => {
      let sum = 0;
      for (let i = 0; i < 100; i++) sum += botPosition(60, elapsed, 1000);
      return sum / 100;
    };
    expect(avg(4000)).toBeGreaterThan(avg(1000));
  });
});
