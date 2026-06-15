import { Room } from '../src/game/Room';
import { RoomManager } from '../src/game/RoomManager';

const OPTS = { maxCharsPerSec: 20 };

describe('Room', () => {
  it('addPlayer increases players.size', () => {
    const room = new Room('TEST', 'versus', 'hello world here we go', OPTS);
    expect(room.players.size).toBe(0);
    room.addPlayer('Alice', 'sock-1');
    room.addPlayer('Bob', 'sock-2');
    expect(room.players.size).toBe(2);
  });

  it('truncates names to 20 chars', () => {
    const room = new Room('TEST', 'versus', 'hello world', OPTS);
    const p = room.addPlayer('A'.repeat(40), 'sock-1');
    expect(p.name).toHaveLength(20);
  });

  it('applyProgress is ignored while phase is lobby', () => {
    const room = new Room('TEST', 'versus', 'hello world here we go', OPTS);
    const p = room.addPlayer('Alice', 'sock-1');

    const accepted = room.applyProgress(p.seatId, 5, 1000);

    expect(room.phase).toBe('lobby');
    expect(p.position).toBe(0);
    expect(accepted).toBe(0);
  });

  it('marks a player finished when they reach the text length', () => {
    const text = 'hello'; // length 5
    const room = new Room('TEST', 'versus', text, OPTS);
    const p = room.addPlayer('Alice', 'sock-1');
    room.startRace(0);

    room.applyProgress(p.seatId, 5, 2000); // plenty of elapsed time → clamp allows 5

    expect(p.position).toBe(5);
    expect(p.finishedAt).not.toBeNull();
  });

  it('finish() assigns rank 1 to the earliest finisher', () => {
    const room = new Room('TEST', 'versus', 'hello', OPTS);
    const alice = room.addPlayer('Alice', 'sock-1');
    const bob = room.addPlayer('Bob', 'sock-2');
    room.startRace(0);

    room.applyProgress(alice.seatId, 5, 1000); // Alice finishes at t=1000
    room.applyProgress(bob.seatId, 5, 2000); // Bob finishes at t=2000

    const rows = room.finish();

    expect(room.phase).toBe('finished');
    expect(rows[0].seatId).toBe(alice.seatId);
    expect(rows[0].rank).toBe(1);
    expect(alice.rank).toBe(1);
    expect(bob.rank).toBe(2);
  });

  it('publicPlayers() does not leak the token', () => {
    const room = new Room('TEST', 'versus', 'hello world', OPTS);
    room.addPlayer('Alice', 'sock-1');
    const pub = room.publicPlayers();
    expect(pub).toHaveLength(1);
    expect(pub[0]).not.toHaveProperty('token');
  });
});

describe('RoomManager', () => {
  it('create returns retrievable rooms with unique 4-char codes', () => {
    const mgr = new RoomManager(OPTS);
    const r1 = mgr.create('versus');
    const r2 = mgr.create('solo');

    expect(r1.code).not.toBe(r2.code);
    expect(r1.code).toHaveLength(4);
    expect(mgr.get(r1.code)).toBe(r1);
    expect(mgr.get(r2.code)).toBe(r2);
  });

  it('get is case-insensitive and code excludes confusable chars', () => {
    const mgr = new RoomManager(OPTS);
    const room = mgr.create('versus');

    expect(mgr.get(room.code.toLowerCase())).toBe(room);
    expect(room.code).not.toMatch(/[0O1I]/); // no 0, O, 1, I
  });

  it('remove deletes the room', () => {
    const mgr = new RoomManager(OPTS);
    const room = mgr.create('solo');
    mgr.remove(room.code);
    expect(mgr.get(room.code)).toBeUndefined();
  });
});
