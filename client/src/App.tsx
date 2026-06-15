// Phase 5 client UI. Screens are driven entirely by the server-derived `screen` value
// from useRace; this file contains no game rules — only input handling and rendering.

import { useState } from 'react';
import { useRace } from './useRace';
import type { PublicPlayer } from './types';
import './App.css';

/**
 * Count of correctly typed *leading* characters: the length of the longest prefix of
 * `text` that `typed` matches exactly. The first mismatch stops the count, so a wrong
 * keystroke freezes progress until it is corrected. This integer is exactly the
 * `position` the server expects in 'race:progress' (its position-based progress model).
 */
export function correctPrefix(typed: string, text: string): number {
  const max = Math.min(typed.length, text.length);
  let i = 0;
  while (i < max && typed[i] === text[i]) i++;
  return i;
}

export default function App() {
  const race = useRace();

  switch (race.screen) {
    case 'lobby':
      return <Lobby race={race} />;
    case 'countdown':
      return <Countdown secondsLeft={race.secondsLeft} />;
    case 'racing':
      return <Race race={race} />;
    case 'finished':
      return <Finished results={race.results} />;
    case 'home':
    default:
      return <Home race={race} />;
  }
}

type RaceHook = ReturnType<typeof useRace>;

function Home({ race }: { race: RaceHook }) {
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const playerName = name.trim() || 'Player';

  return (
    <div className="screen">
      <h1>⌨️ Typing Race</h1>

      <label className="field">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          maxLength={20}
        />
      </label>

      <div className="actions">
        <button onClick={() => race.playSolo(playerName)}>Play solo (vs bot)</button>
        <button onClick={() => race.createRoom(playerName)}>Create room</button>
      </div>

      <div className="join">
        <input
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          placeholder="Room code"
          maxLength={4}
        />
        <button
          disabled={joinCode.trim().length === 0}
          onClick={() => race.joinRoom(joinCode.trim(), playerName)}
        >
          Join
        </button>
      </div>

      {race.error && <p className="error">{race.error.message}</p>}
    </div>
  );
}

function Lobby({ race }: { race: RaceHook }) {
  return (
    <div className="screen">
      <h1>Lobby</h1>
      <p className="code">
        Room code: <strong>{race.code}</strong>
      </p>

      <ul className="players">
        {race.players.map((p) => (
          <li key={p.seatId}>
            {p.name}
            {p.isBot ? ' 🤖' : ''}
            {p.seatId === race.seatId ? ' (you)' : ''}
            {!p.connected && !p.isBot ? ' — disconnected' : ''}
          </li>
        ))}
      </ul>

      <button onClick={race.ready}>Ready</button>
      <p className="hint">The race starts when at least 2 players are ready.</p>
    </div>
  );
}

function Countdown({ secondsLeft }: { secondsLeft: number }) {
  return (
    <div className="screen center">
      <h1>Get ready…</h1>
      <div className="countdown">{secondsLeft}</div>
    </div>
  );
}

function Finished({ results }: { results: RaceHook['results'] }) {
  return (
    <div className="screen">
      <h1>Results</h1>
      <ol className="results">
        {results.map((r) => (
          <li key={r.seatId}>
            <span className="rank">#{r.rank}</span>
            <span className="rname">{r.name}</span>
            <span className="rstat">{r.wpm} wpm</span>
            <span className="rstat">{r.accuracy}% acc</span>
          </li>
        ))}
      </ol>
      <button onClick={() => window.location.reload()}>Play again</button>
    </div>
  );
}

function Race({ race }: { race: RaceHook }) {
  const { text, players, seatId, sendProgress } = race;
  const [typed, setTyped] = useState('');

  const position = correctPrefix(typed, text);

  function onChange(next: string) {
    setTyped(next);
    // Report the correct-prefix length only when it actually changes; the server is the
    // single broadcaster and re-validates this number anyway.
    const nextPos = correctPrefix(next, text);
    if (nextPos !== position) sendProgress(nextPos);
  }

  return (
    <div className="screen">
      <h1>Race!</h1>

      <Passage text={text} typed={typed} />

      <input
        className="typing"
        autoFocus
        value={typed}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Start typing the passage above…"
      />

      <div className="bars">
        {players.map((p) => (
          <ProgressBar
            key={p.seatId}
            player={p}
            textLength={text.length}
            isLocal={p.seatId === seatId}
          />
        ))}
      </div>
    </div>
  );
}

function Passage({ text, typed }: { text: string; typed: string }) {
  const correct = correctPrefix(typed, text);
  return (
    <p className="passage">
      {text.split('').map((ch, i) => {
        let cls = 'rem';
        if (i < correct) cls = 'ok';
        else if (i === correct) cls = 'cur';
        return (
          <span key={i} className={cls}>
            {ch}
          </span>
        );
      })}
    </p>
  );
}

function ProgressBar({
  player,
  textLength,
  isLocal,
}: {
  player: PublicPlayer;
  textLength: number;
  isLocal: boolean;
}) {
  // Bars derive purely from the SERVER-sent position, not from local typing.
  const pct = textLength > 0 ? Math.min(100, (player.position / textLength) * 100) : 0;
  return (
    <div className={`bar-row${isLocal ? ' local' : ''}`}>
      <span className="bar-name">
        {player.name}
        {player.isBot ? ' 🤖' : ''}
        {isLocal ? ' (you)' : ''}
        {!player.connected && !player.isBot ? ' — disconnected' : ''}
      </span>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="bar-wpm">{player.wpm} wpm</span>
    </div>
  );
}
