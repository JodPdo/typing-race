// Pure, server-authoritative scoring + anti-cheat logic for Typing Race.
//
// Every function here is a pure function: deterministic, no I/O, no shared mutable
// state, and NO imports from socket.io, pg, or the Room layer. That isolation is what
// makes this the trustworthy "truth" the server uses to decide outcomes — and what
// makes it trivial to unit-test (give inputs, assert outputs).

/** Minimal shape a player must have to be ranked. Kept generic so the Room/Player
 *  type (a later phase) can satisfy it without this module depending on it. */
export interface Rankable {
  seatId: string;
  finishedAt: number | null;
  position: number;
}

/**
 * Words-per-minute. Convention: 5 characters = 1 word.
 * Returns 0 for non-positive time or position (avoids divide-by-zero / negatives).
 * Rounded to the nearest integer.
 */
export function computeWpm(position: number, elapsedMs: number): number {
  if (elapsedMs <= 0 || position <= 0) return 0;
  const words = position / 5;
  const minutes = elapsedMs / 60000;
  return Math.round(words / minutes);
}

/**
 * Accuracy as a percentage (0..100) with 2 decimal places.
 * With no keystrokes yet there is nothing wrong, so it returns 100.
 */
export function computeAccuracy(correctChars: number, totalKeystrokes: number): number {
  if (totalKeystrokes <= 0) return 100;
  const pct = (correctChars / totalKeystrokes) * 100;
  const clamped = Math.min(100, Math.max(0, pct));
  return Math.round(clamped * 100) / 100;
}

/**
 * Anti-cheat validator for a progress update. The server never trusts the client's
 * reported caret position directly — it clamps it to what is actually possible:
 *   - non-finite input is ignored (keep the previous position)
 *   - cannot rewind below the previous position
 *   - cannot exceed the text length
 *   - cannot exceed a humanly plausible max for the elapsed time
 *     (= floor(seconds * maxCharsPerSec) + 2, the +2 absorbs rounding/jitter)
 */
export function clampProgress(
  prevPosition: number,
  reportedPosition: number,
  textLength: number,
  elapsedMs: number,
  maxCharsPerSec: number,
): number {
  if (
    !Number.isFinite(prevPosition) ||
    !Number.isFinite(reportedPosition) ||
    !Number.isFinite(textLength) ||
    !Number.isFinite(elapsedMs) ||
    !Number.isFinite(maxCharsPerSec)
  ) {
    return prevPosition;
  }

  const humanMax = Math.floor((elapsedMs / 1000) * maxCharsPerSec) + 2;
  const upperBound = Math.min(textLength, humanMax);
  const capped = Math.min(reportedPosition, upperBound);

  // never rewind: the accepted position only ever moves forward
  return Math.max(prevPosition, capped);
}

/**
 * Assign 1-based ranks. Ordering:
 *   1) finishers before non-finishers
 *   2) finishers by earliest finishedAt (first to finish ranks higher)
 *   3) non-finishers by furthest position (more progress ranks higher)
 * Returns a Map keyed by seatId → rank.
 */
export function assignRanks<T extends Rankable>(players: T[]): Map<string, number> {
  const sorted = [...players].sort((a, b) => {
    const aTime = a.finishedAt;
    const bTime = b.finishedAt;

    if (aTime !== null && bTime !== null) return aTime - bTime; // both finished
    if (aTime !== null) return -1; // only a finished → a first
    if (bTime !== null) return 1; // only b finished → b first
    return b.position - a.position; // neither finished → furthest first
  });

  const ranks = new Map<string, number>();
  sorted.forEach((player, index) => ranks.set(player.seatId, index + 1));
  return ranks;
}
