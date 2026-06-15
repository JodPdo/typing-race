// The single bridge between Socket.IO and React. It owns ALL server-event listeners and
// turns them into React state; components read that state and call the action emitters.
//
// Design rule (Phase 5): this hook never computes outcomes. WPM, ranks, accuracy and even
// each player's authoritative position all arrive from the server. The client only stores
// and displays them. The one thing the client computes is its OWN typed prefix length,
// which it reports to the server as `position` — the server still validates it.

import { useCallback, useEffect, useState } from 'react';
import { socket } from './socket';
import type { PublicPlayer, ResultRow } from './types';

export type Screen = 'home' | 'lobby' | 'countdown' | 'racing' | 'finished';

export interface RaceError {
  code: string;
  message: string;
}

interface RoomJoined {
  code: string;
  seatId: string;
  token: string;
  phase: string;
  players: PublicPlayer[];
}

interface RoomState {
  phase: string;
  players: PublicPlayer[];
}

interface Countdown {
  secondsLeft: number;
}

interface RaceStart {
  text: string;
  startedAt: number;
}

interface RaceTick {
  players: Array<{ seatId: string; position: number; wpm: number }>;
}

interface RaceFinished {
  results: ResultRow[];
}

/** Map a server phase string to the screen we render. */
function screenForPhase(phase: string): Screen {
  switch (phase) {
    case 'lobby':
      return 'lobby';
    case 'countdown':
      return 'countdown';
    case 'racing':
      return 'racing';
    case 'finished':
      return 'finished';
    default:
      return 'home';
  }
}

export function useRace() {
  const [screen, setScreen] = useState<Screen>('home');
  const [code, setCode] = useState<string>('');
  const [seatId, setSeatId] = useState<string>('');
  const [text, setText] = useState<string>('');
  const [players, setPlayers] = useState<PublicPlayer[]>([]);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [error, setError] = useState<RaceError | null>(null);

  useEffect(() => {
    function onJoined(d: RoomJoined) {
      setCode(d.code);
      setSeatId(d.seatId);
      setPlayers(d.players);
      setError(null);
      // Stored for Phase 6 reconnect (re-binding this client to its seat). Unused for now.
      sessionStorage.setItem('typingRaceToken', d.token);
      sessionStorage.setItem('typingRaceCode', d.code);
      setScreen(screenForPhase(d.phase));
    }

    function onState(d: RoomState) {
      setPlayers(d.players);
      setScreen(screenForPhase(d.phase));
    }

    function onCountdown(d: Countdown) {
      setSecondsLeft(d.secondsLeft);
      setScreen('countdown');
    }

    function onStart(d: RaceStart) {
      setText(d.text);
      setScreen('racing');
    }

    function onTick(d: RaceTick) {
      // Merge the authoritative position/wpm into the existing list, keeping names/flags
      // (the tick payload is lean and omits name/isBot/connected).
      setPlayers((prev) => {
        const byId = new Map(prev.map((p) => [p.seatId, p]));
        for (const u of d.players) {
          const existing = byId.get(u.seatId);
          if (existing) {
            byId.set(u.seatId, { ...existing, position: u.position, wpm: u.wpm });
          }
        }
        // Preserve original ordering.
        return prev.map((p) => byId.get(p.seatId) ?? p);
      });
    }

    function onFinished(d: RaceFinished) {
      setResults(d.results);
      setScreen('finished');
    }

    function onError(d: RaceError) {
      setError(d);
    }

    socket.on('room:joined', onJoined);
    socket.on('room:state', onState);
    socket.on('race:countdown', onCountdown);
    socket.on('race:start', onStart);
    socket.on('race:tick', onTick);
    socket.on('race:finished', onFinished);
    socket.on('error', onError);

    return () => {
      socket.off('room:joined', onJoined);
      socket.off('room:state', onState);
      socket.off('race:countdown', onCountdown);
      socket.off('race:start', onStart);
      socket.off('race:tick', onTick);
      socket.off('race:finished', onFinished);
      socket.off('error', onError);
    };
  }, []);

  // --- action emitters -----------------------------------------------------------

  const playSolo = useCallback((name: string) => {
    setError(null);
    socket.emit('room:createSolo', { name });
  }, []);

  const createRoom = useCallback((name: string) => {
    setError(null);
    socket.emit('room:create', { name });
  }, []);

  const joinRoom = useCallback((joinCode: string, name: string) => {
    setError(null);
    socket.emit('room:join', { code: joinCode, name });
  }, []);

  const ready = useCallback(() => {
    socket.emit('player:ready');
  }, []);

  const sendProgress = useCallback((position: number) => {
    socket.emit('race:progress', { position });
  }, []);

  return {
    // state
    screen,
    code,
    seatId,
    text,
    players,
    secondsLeft,
    results,
    error,
    // actions
    playSolo,
    createRoom,
    joinRoom,
    ready,
    sendProgress,
  };
}
