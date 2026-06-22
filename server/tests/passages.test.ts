// Phase 1 — the passage picker. Pure and tiny, but covering it keeps the game/ module
// at 100% function coverage and guards against an empty/garbage passage reaching a race.

import { pickPassage } from '../src/game/passages';

describe('pickPassage', () => {
  it('always returns a non-empty string', () => {
    for (let i = 0; i < 50; i++) {
      const passage = pickPassage();
      expect(typeof passage).toBe('string');
      expect(passage.trim().length).toBeGreaterThan(0);
    }
  });

  it('returns more than one distinct passage across many draws', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(pickPassage());
    expect(seen.size).toBeGreaterThan(1);
  });
});
