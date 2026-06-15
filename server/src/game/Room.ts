// In-memory game model for a single race. Deliberately transport-free: it imports
// NOTHING from socket.io or pg. The Phase 4 socket layer will drive this class
// (addPlayer, applyProgress, advanceBots, finish) and broadcast publicPlayers().
// Keeping it pure-ish (only crypto for ids) is what makes it unit-testable.

import { randomUUID } from 'crypto';
import { Phase, Mode, Player, PublicPlayer, ResultRow } from '../types';
import { computeWpm, clampProgress, assignRanks } from './scoring';
import { botName, pickBotWpm, botPosition } from './Bot';

const MAX_NAME_LEN = 20;

export class Room {
  phase: Phase = 'lobby';
  startedAt: number | null = null;
  players: Map<string, Player> = new Map();

  constructor(
    public readonly code: string,
    public readonly mode: Mode,
    public readonly text: string,
    private readonly opts: { maxCharsPerSec: number },
  ) {}

  addPlayer(name: string, socketId: string | null, isBot = false): Player {
    const player: Player = {
      seatId: randomUUID(),
      token: randomUUID(),
      name: (name ?? '').slice(0, MAX_NAME_LEN),
      socketId,
      connected: socketId !== null,
      isBot,
      botWpm: isBot ? pickBotWpm() : 0,
      position: 0,
      wpm: 0,
      accuracy: 100,
      finishedAt: null,
      rank: null,
    };
    this.players.set(player.seatId, player);
    return player;
  }

  addBot(): Player {
    const bot = this.addPlayer(botName(), null, true);
    bot.connected = true; // a bot is always "present" even with no socket
    return bot;
  }

  getByToken(token: string): Player | undefined {
    for (const player of this.players.values()) {
      if (player.token === token) return player;
    }
    return undefined;
  }

  startCountdown(): void {
    this.phase = 'countdown';
  }

  startRace(now: number = Date.now()): void {
    this.phase = 'racing';
    this.startedAt = now;
  }

  /**
   * Apply a client-reported caret position. Only honored while racing and before the
   * player has finished. The reported value is never trusted directly — it is run
   * through the scoring.ts anti-cheat validator. Returns the accepted position.
   */
  applyProgress(seatId: string, reported: number, now: number = Date.now()): number {
    const player = this.players.get(seatId);
    if (!player) return 0;
    if (this.phase !== 'racing') return player.position;
    if (player.finishedAt !== null) return player.position;

    const elapsedMs = this.startedAt !== null ? now - this.startedAt : 0;
    const accepted = clampProgress(
      player.position,
      reported,
      this.text.length,
      elapsedMs,
      this.opts.maxCharsPerSec,
    );

    player.position = accepted;
    player.wpm = computeWpm(accepted, elapsedMs);
    if (accepted >= this.text.length) {
      player.finishedAt = now;
    }
    return accepted;
  }

  /** Move every unfinished bot to its expected position for the elapsed time. */
  advanceBots(now: number = Date.now()): void {
    if (this.phase !== 'racing') return;
    const elapsedMs = this.startedAt !== null ? now - this.startedAt : 0;

    for (const player of this.players.values()) {
      if (!player.isBot || player.finishedAt !== null) continue;

      const target = botPosition(player.botWpm, elapsedMs, this.text.length);
      // never rewind a bot, never overshoot the text
      player.position = Math.min(this.text.length, Math.max(player.position, target));
      player.wpm = computeWpm(player.position, elapsedMs);
      if (player.position >= this.text.length) {
        player.finishedAt = now;
      }
    }
  }

  allFinished(): boolean {
    if (this.players.size === 0) return false;
    for (const player of this.players.values()) {
      if (player.finishedAt === null) return false;
    }
    return true;
  }

  /** End the race: set ranks (via scoring.ts) and return rows sorted by rank. */
  finish(): ResultRow[] {
    this.phase = 'finished';

    const ranks = assignRanks([...this.players.values()]);
    for (const player of this.players.values()) {
      player.rank = ranks.get(player.seatId) ?? null;
    }

    const rows: ResultRow[] = [...this.players.values()].map((player) => ({
      seatId: player.seatId,
      name: player.name,
      rank: player.rank ?? 0,
      wpm: player.wpm,
      accuracy: player.accuracy,
      timeMs:
        player.finishedAt !== null && this.startedAt !== null
          ? player.finishedAt - this.startedAt
          : 0,
    }));

    rows.sort((a, b) => a.rank - b.rank);
    return rows;
  }

  /** Projection safe to broadcast: no token, no socketId. */
  publicPlayers(): PublicPlayer[] {
    return [...this.players.values()].map((player) => ({
      seatId: player.seatId,
      name: player.name,
      isBot: player.isBot,
      connected: player.connected,
      position: player.position,
      wpm: player.wpm,
    }));
  }
}
