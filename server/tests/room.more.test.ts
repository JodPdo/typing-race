// Phase 1 — Room methods the original room.test.ts did not exercise: bot seating,
// post-finish progress rejection, in-Room anti-cheat, bot advancement, allFinished,
// DNF ranking, and the reconnect/presence lifecycle. Time is injected (the `now` arg)
// so these stay deterministic. Maps to risks R1–R4; traceability T-03/T-04/T-09.

import { Room } from '../src/game/Room';

const OPTS = { maxCharsPerSec: 20 };
// A passage long enough that the human-speed clamp (not the text length) is the binding
// limit in the anti-cheat test below.
const LONG = 'x'.repeat(200);

describe('Room.addBot', () => {
  it('seats a bot that is always present and paces between 45 and 70 wpm', () => {
    const room = new Room('TEST', 'solo', LONG, OPTS);
    const bot = room.addBot();
    expect(bot.isBot).toBe(true);
    expect(bot.socketId).toBeNull();
    expect(bot.connected).toBe(true); // present even with no socket
    expect(bot.botWpm).toBeGreaterThanOrEqual(45);
    expect(bot.botWpm).toBeLessThanOrEqual(70);
  });
});

describe('Room.applyProgress — guards', () => {
  it('ignores progress once the player has finished', () => {
    const room = new Room('TEST', 'versus', 'hello', OPTS); // length 5
    const p = room.addPlayer('Alice', 'sock-1');
    room.startRace(0);
    room.applyProgress(p.seatId, 5, 2000); // finishes
    expect(p.finishedAt).not.toBeNull();

    const after = room.applyProgress(p.seatId, 3, 3000); // should be a no-op
    expect(after).toBe(5);
    expect(p.position).toBe(5);
  });

  it('clamps a superhuman caret jump via scoring.clampProgress', () => {
    const room = new Room('TEST', 'versus', LONG, OPTS);
    const p = room.addPlayer('Alice', 'sock-1');
    room.startRace(0);
    // 1s elapsed, 20 cps => humanMax = 22; a reported 1000 must be rejected down to 22.
    const accepted = room.applyProgress(p.seatId, 1000, 1000);
    expect(accepted).toBe(22);
    expect(p.position).toBe(22);
  });

  it('returns 0 for an unknown seat', () => {
    const room = new Room('TEST', 'versus', LONG, OPTS);
    room.startRace(0);
    expect(room.applyProgress('no-such-seat', 5, 1000)).toBe(0);
  });
});

describe('Room.advanceBots', () => {
  it('does nothing when the room is not racing', () => {
    const room = new Room('TEST', 'solo', LONG, OPTS);
    const bot = room.addBot();
    room.advanceBots(5000); // still in lobby
    expect(bot.position).toBe(0);
  });

  it('moves an unfinished bot forward without overshooting the text', () => {
    const room = new Room('TEST', 'solo', LONG, OPTS); // length 200
    const bot = room.addBot();
    room.startRace(0);
    room.advanceBots(1000); // ~1s => only a few chars at 45-70 wpm
    expect(bot.position).toBeGreaterThan(0);
    expect(bot.position).toBeLessThan(LONG.length);
    expect(bot.finishedAt).toBeNull();
  });

  it('marks the bot finished once it reaches the end', () => {
    const room = new Room('TEST', 'solo', 'hello', OPTS); // length 5
    const bot = room.addBot();
    room.startRace(0);
    room.advanceBots(60000); // 60s is far more than enough to type 5 chars
    expect(bot.position).toBe(5);
    expect(bot.finishedAt).not.toBeNull();
  });
});

describe('Room.allFinished', () => {
  it('is false for an empty room', () => {
    const room = new Room('TEST', 'versus', 'hello', OPTS);
    expect(room.allFinished()).toBe(false);
  });

  it('is false while anyone is still racing, true once everyone is done', () => {
    const room = new Room('TEST', 'versus', 'hello', OPTS);
    const a = room.addPlayer('A', 's1');
    const b = room.addPlayer('B', 's2');
    room.startRace(0);

    room.applyProgress(a.seatId, 5, 1000); // A done
    expect(room.allFinished()).toBe(false); // B not yet

    room.applyProgress(b.seatId, 5, 2000); // B done
    expect(room.allFinished()).toBe(true);
  });
});

describe('Room.finish — DNF handling', () => {
  it('still ranks a non-finisher and gives them timeMs 0', () => {
    const room = new Room('TEST', 'versus', 'hello', OPTS);
    const winner = room.addPlayer('Winner', 's1');
    const dnf = room.addPlayer('Dnf', 's2');
    room.startRace(0);
    room.applyProgress(winner.seatId, 5, 1000); // only winner finishes

    const rows = room.finish();
    const dnfRow = rows.find((r) => r.seatId === dnf.seatId)!;
    expect(dnfRow.rank).toBe(2);
    expect(dnfRow.timeMs).toBe(0);
    expect(rows[0].seatId).toBe(winner.seatId); // sorted by rank
  });
});

describe('Room reconnect lifecycle', () => {
  it('markDisconnected keeps the seat + progress but flips presence', () => {
    const room = new Room('TEST', 'versus', 'hello', OPTS);
    const p = room.addPlayer('Alice', 'sock-1');
    room.startRace(0);
    room.applyProgress(p.seatId, 3, 1000);

    const gone = room.markDisconnected('sock-1');
    expect(gone).toBe(p);
    expect(p.connected).toBe(false);
    expect(p.socketId).toBeNull();
    expect(p.position).toBe(3); // progress preserved
    expect(room.players.size).toBe(1); // seat NOT removed
  });

  it('markDisconnected returns undefined for an unknown socket', () => {
    const room = new Room('TEST', 'versus', 'hello', OPTS);
    room.addPlayer('Alice', 'sock-1');
    expect(room.markDisconnected('ghost')).toBeUndefined();
  });

  it('reconnect re-binds the seat by token and restores presence', () => {
    const room = new Room('TEST', 'versus', 'hello', OPTS);
    const p = room.addPlayer('Alice', 'sock-1');
    room.markDisconnected('sock-1');

    const back = room.reconnect(p.token, 'sock-2');
    expect(back).toBe(p);
    expect(p.connected).toBe(true);
    expect(p.socketId).toBe('sock-2');
  });

  it('reconnect returns null for a token that matches no seat', () => {
    const room = new Room('TEST', 'versus', 'hello', OPTS);
    room.addPlayer('Alice', 'sock-1');
    expect(room.reconnect('bogus-token', 'sock-9')).toBeNull();
  });

  it('getByToken finds the right seat and misses cleanly', () => {
    const room = new Room('TEST', 'versus', 'hello', OPTS);
    const p = room.addPlayer('Alice', 'sock-1');
    expect(room.getByToken(p.token)).toBe(p);
    expect(room.getByToken('nope')).toBeUndefined();
  });
});

describe('Room.startCountdown', () => {
  it('moves the room into the countdown phase', () => {
    const room = new Room('TEST', 'versus', 'hello', OPTS);
    room.startCountdown();
    expect(room.phase).toBe('countdown');
  });
});

describe('Room — default (real-clock) parameters', () => {
  it('startRace/applyProgress/advanceBots work without an injected clock', () => {
    const room = new Room('TEST', 'solo', 'hello world here we go now', OPTS);
    const human = room.addPlayer('Alice', 'sock-1');
    const bot = room.addBot();
    room.startRace(); // uses Date.now()
    expect(room.phase).toBe('racing');

    const accepted = room.applyProgress(human.seatId, 3); // uses Date.now()
    expect(accepted).toBeGreaterThanOrEqual(0);

    room.advanceBots(); // uses Date.now()
    expect(bot.position).toBeGreaterThanOrEqual(0);
  });

  it('tolerates a null name by storing an empty string', () => {
    const room = new Room('TEST', 'versus', 'hello', OPTS);
    const p = room.addPlayer(null as unknown as string, 'sock-1');
    expect(p.name).toBe('');
  });
});
