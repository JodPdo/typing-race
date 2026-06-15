// Pure helpers for computer-controlled racers. No state, no I/O — easy to test and
// safe to call from Room without coupling the model to anything.

const BOT_NAMES = ['Ada', 'Turing', 'Hopper', 'Lovelace', 'Dijkstra', 'Knuth', 'Babbage'];

/** A random display name for a bot. */
export function botName(): string {
  return BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
}

/** A target pace for a bot: a random integer WPM in [45, 70]. */
export function pickBotWpm(): number {
  return 45 + Math.floor(Math.random() * (70 - 45 + 1));
}

/**
 * Expected caret position for a bot running at `botWpm` after `elapsedMs`, using the
 * 5-chars-per-word convention, with a mild ±2 char jitter so motion looks human.
 * Clamped to [0, textLength].
 */
export function botPosition(botWpm: number, elapsedMs: number, textLength: number): number {
  if (elapsedMs <= 0) return 0;
  const charsPerMs = (botWpm * 5) / 60000;
  const expected = charsPerMs * elapsedMs;
  const jitter = Math.random() * 4 - 2; // -2 .. +2
  const pos = Math.round(expected + jitter);
  return Math.max(0, Math.min(textLength, pos));
}
