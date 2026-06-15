// Client-side mirrors of the server payloads. These must stay in sync with the server's
// src/types.ts — the client only ever *reflects* these shapes, it never invents fields.

/** Broadcast projection of a player. No token / socketId (server keeps those private). */
export interface PublicPlayer {
  seatId: string;
  name: string;
  isBot: boolean;
  connected: boolean;
  position: number;
  wpm: number;
}

/** A single final-results row, fully computed and ranked by the (authoritative) server. */
export interface ResultRow {
  seatId: string;
  name: string;
  rank: number;
  wpm: number;
  accuracy: number;
  timeMs: number;
}
