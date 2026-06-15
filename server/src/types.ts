// Shared domain types for the Typing Race game model. Pure data shapes — no transport.

export type Phase = 'lobby' | 'countdown' | 'racing' | 'finished';

export type Mode = 'solo' | 'versus';

/** Full internal player record. `token` is a secret used to re-bind a reconnecting
 *  client to its seat — it must never be sent to other players (see PublicPlayer). */
export interface Player {
  seatId: string;
  token: string;
  name: string;
  socketId: string | null;
  connected: boolean;
  isBot: boolean;
  botWpm: number; // 0 for humans
  position: number;
  wpm: number;
  accuracy: number;
  finishedAt: number | null;
  rank: number | null;
}

/** Safe projection broadcast to everyone — no token, no socketId. */
export interface PublicPlayer {
  seatId: string;
  name: string;
  isBot: boolean;
  connected: boolean;
  position: number;
  wpm: number;
}

/** A single row of the final results table. */
export interface ResultRow {
  seatId: string;
  name: string;
  rank: number;
  wpm: number;
  accuracy: number;
  timeMs: number;
}
