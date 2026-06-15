// Phase 4 — the transport layer. This is the ONLY file that knows about both Socket.IO
// and the game model; it wires real WebSocket events to the transport-free Room /
// RoomManager from Phases 2–3. It reimplements no game rules: WPM, anti-cheat clamping,
// and ranking all live in scoring.ts and are reached only through Room.

import { Server, Socket } from 'socket.io';
import { config } from '../config';
import { RoomManager } from '../game/RoomManager';
import { Room } from '../game/Room';
import { saveResults } from '../db/results';

// What we stash on each socket so later events know which seat the socket owns.
interface SocketData {
  code?: string;
  seatId?: string;
}

export function registerSocket(io: Server): void {
  const manager = new RoomManager({ maxCharsPerSec: config.maxCharsPerSec });

  // One repeating tick loop per active race, keyed by room code so we can clear it
  // when the race ends or a solo room is abandoned.
  const ticks = new Map<string, NodeJS.Timeout>();

  // Ready-tracking for versus lobbies: code -> set of human seatIds that pressed ready.
  const ready = new Map<string, Set<string>>();

  // Phase 6A: pending seat-removal timers, keyed by `${code}:${seatId}`. A disconnect
  // starts one; a reconnect within the grace window clears it.
  const graceTimers = new Map<string, NodeJS.Timeout>();

  // --- helpers -------------------------------------------------------------------

  /** Push the current lobby/room snapshot to everyone in the room. */
  function broadcastState(room: Room): void {
    io.to(room.code).emit('room:state', {
      phase: room.phase,
      players: room.publicPlayers(),
    });
  }

  /**
   * The single broadcaster. On a fixed interval it advances the bots through the same
   * Room API humans use, emits one batched 'race:tick' for the whole room, and ends the
   * race once every player (humans + bots) has finished.
   */
  function startTick(room: Room): void {
    const interval = setInterval(() => {
      room.advanceBots();

      io.to(room.code).emit('race:tick', {
        players: room.publicPlayers().map((p) => ({
          seatId: p.seatId,
          position: p.position,
          wpm: p.wpm,
        })),
      });

      if (room.allFinished()) {
        clearInterval(interval);
        ticks.delete(room.code);
        ready.delete(room.code);

        const results = room.finish();

        // Phase 6B: persist HUMAN results only (bots excluded). Best-effort and
        // fire-and-forget — a DB failure (or a disabled DB) must never break the game,
        // so we never await it and always catch.
        const humanResults = results.filter((r) => !room.players.get(r.seatId)?.isBot);
        saveResults(room.code, room.mode, humanResults).catch((err) =>
          console.error('saveResults failed', err),
        );

        io.to(room.code).emit('race:finished', { results });
      }
    }, config.tickMs);

    ticks.set(room.code, interval);
  }

  /**
   * Run the pre-race countdown, then flip the room into racing and start the tick loop.
   * Emits 'race:countdown' once per second (config.countdownSeconds .. 1), then
   * 'race:start' with the passage, then begins ticking.
   */
  function startCountdownThenRace(room: Room): void {
    room.startCountdown();

    let secondsLeft = config.countdownSeconds;
    io.to(room.code).emit('race:countdown', { secondsLeft });

    const countdown = setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft > 0) {
        io.to(room.code).emit('race:countdown', { secondsLeft });
        return;
      }
      clearInterval(countdown);
      room.startRace();
      io.to(room.code).emit('race:start', { text: room.text, startedAt: room.startedAt });
      startTick(room);
    }, 1000);
  }

  // --- connection handlers -------------------------------------------------------

  io.on('connection', (socket: Socket) => {
    const data = socket.data as SocketData;

    // Solo: human + one bot, auto-starts immediately. This is the end-to-end demo path.
    socket.on('room:createSolo', ({ name }: { name?: string }) => {
      const room = manager.create('solo');
      const human = room.addPlayer(name ?? 'Player', socket.id);
      room.addBot();

      data.code = room.code;
      data.seatId = human.seatId;
      socket.join(room.code);

      socket.emit('room:joined', {
        code: room.code,
        seatId: human.seatId,
        token: human.token,
        phase: room.phase,
        players: room.publicPlayers(),
      });

      startCountdownThenRace(room);
    });

    // Versus: create a lobby and wait for others to join + ready up.
    socket.on('room:create', ({ name }: { name?: string }) => {
      const room = manager.create('versus');
      const human = room.addPlayer(name ?? 'Player', socket.id);

      data.code = room.code;
      data.seatId = human.seatId;
      socket.join(room.code);

      socket.emit('room:joined', {
        code: room.code,
        seatId: human.seatId,
        token: human.token,
        phase: room.phase,
        players: room.publicPlayers(),
      });

      broadcastState(room);
    });

    // Versus: join an existing lobby by code (only while it is still in 'lobby').
    socket.on('room:join', ({ code, name }: { code: string; name?: string }) => {
      const room = manager.get(code);
      if (!room || room.phase !== 'lobby') {
        socket.emit('error', { code: 'JOIN_FAILED', message: 'Room not found or already started.' });
        return;
      }

      const human = room.addPlayer(name ?? 'Player', socket.id);
      data.code = room.code;
      data.seatId = human.seatId;
      socket.join(room.code);

      socket.emit('room:joined', {
        code: room.code,
        seatId: human.seatId,
        token: human.token,
        phase: room.phase,
        players: room.publicPlayers(),
      });

      broadcastState(room);
    });

    // Phase 6A: re-bind a returning client to its existing seat using the secret token.
    socket.on('room:reconnect', ({ code, token }: { code: string; token: string }) => {
      const room = manager.get(code);
      if (!room) {
        socket.emit('error', { code: 'ROOM_GONE', message: 'That room no longer exists.' });
        return;
      }

      const player = room.reconnect(token, socket.id);
      if (!player) {
        socket.emit('error', { code: 'SEAT_GONE', message: 'Your seat is no longer available.' });
        return;
      }

      // Cancel the pending seat-removal timer for this seat.
      const key = `${room.code}:${player.seatId}`;
      const timer = graceTimers.get(key);
      if (timer) {
        clearTimeout(timer);
        graceTimers.delete(key);
      }

      data.code = room.code;
      data.seatId = player.seatId;
      socket.join(room.code);

      socket.emit('room:joined', {
        code: room.code,
        seatId: player.seatId,
        token: player.token,
        phase: room.phase,
        players: room.publicPlayers(),
      });

      // A mid-race returner needs the passage + start time to rebuild the racing screen.
      if (room.phase === 'racing') {
        socket.emit('race:start', { text: room.text, startedAt: room.startedAt });
      }

      broadcastState(room);
    });

    // Versus: a player marks ready. Start once >= 2 humans are present and all are ready.
    socket.on('player:ready', () => {
      if (!data.code || !data.seatId) return;
      const room = manager.get(data.code);
      if (!room || room.phase !== 'lobby') return;

      let set = ready.get(room.code);
      if (!set) {
        set = new Set<string>();
        ready.set(room.code, set);
      }
      set.add(data.seatId);
      broadcastState(room);

      const humans = [...room.players.values()].filter((p) => !p.isBot);
      const allReady = humans.length >= 2 && humans.every((p) => set.has(p.seatId));
      if (allReady) {
        startCountdownThenRace(room);
      }
    });

    // A caret update. Validation/clamping happens inside Room.applyProgress (scoring.ts).
    // Deliberately silent: the tick loop is the single source of 'race:tick' broadcasts,
    // so a fast typist cannot flood the room with one emit per keystroke.
    socket.on('race:progress', ({ position }: { position: number }) => {
      if (!data.code || !data.seatId) return;
      const room = manager.get(data.code);
      if (!room) return;
      room.applyProgress(data.seatId, position);
    });

    // Phase 6A: a disconnect no longer deletes the seat immediately. It flips the seat to
    // disconnected (keeping progress), broadcasts presence, and starts a grace timer; the
    // seat is only removed if nobody reconnects to it before reconnectGraceMs elapses.
    socket.on('disconnect', () => {
      if (!data.code || !data.seatId) return;
      const room = manager.get(data.code);
      if (!room) return;

      const player = room.markDisconnected(socket.id);
      if (!player) return;
      broadcastState(room);

      const key = `${room.code}:${player.seatId}`;
      const timer = setTimeout(() => {
        graceTimers.delete(key);

        const liveRoom = manager.get(room.code);
        if (!liveRoom) return;

        const seat = liveRoom.players.get(player.seatId);
        // Reconnected in the meantime → nothing to do.
        if (!seat || seat.connected) return;

        // Grace expired with no reconnect: drop the seat (and its progress).
        liveRoom.players.delete(player.seatId);
        ready.get(liveRoom.code)?.delete(player.seatId);

        // If no connected human remains, tear the whole room down.
        const humansLeft = [...liveRoom.players.values()].filter((p) => !p.isBot && p.connected);
        if (humansLeft.length === 0) {
          const interval = ticks.get(liveRoom.code);
          if (interval) {
            clearInterval(interval);
            ticks.delete(liveRoom.code);
          }
          ready.delete(liveRoom.code);
          manager.remove(liveRoom.code);
        } else {
          broadcastState(liveRoom);
        }
      }, config.reconnectGraceMs);

      graceTimers.set(key, timer);
    });
  });
}
