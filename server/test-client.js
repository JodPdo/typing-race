// Manual Phase 4 verification client. Not part of the build (plain JS, outside src/).
//
//   1. start the server:   npm run dev
//   2. in another shell:   node test-client.js
//
// It opens a solo room (human + bot), then simulates a human typing to the end so the
// race can actually finish. It logs the countdown, race:start, every race:tick (watch the
// BOT's position climb), and the final race:finished results with server-assigned ranks.

const { io } = require('socket.io-client');

const URL = process.env.URL || 'http://localhost:3004';
const socket = io(URL);

let typer = null; // interval that simulates the human typing

socket.on('connect', () => {
  console.log(`connected as ${socket.id}`);
  socket.emit('room:createSolo', { name: 'Tester' });
});

socket.on('room:joined', (d) => {
  console.log(`room:joined code=${d.code} seat=${d.seatId.slice(0, 8)} phase=${d.phase}`);
});

socket.on('race:countdown', (d) => {
  console.log(`countdown: ${d.secondsLeft}`);
});

socket.on('race:start', (d) => {
  console.log(`race:start (${d.text.length} chars): "${d.text}"`);

  // Simulate typing: advance ~15 chars/sec, comfortably under the 20 char/sec anti-cheat
  // cap, emitting race:progress. The server clamps and decides the real position.
  let pos = 0;
  const len = d.text.length;
  typer = setInterval(() => {
    pos += 3;
    socket.emit('race:progress', { position: Math.min(pos, len) });
    if (pos >= len) {
      clearInterval(typer);
      typer = null;
    }
  }, 200);
});

socket.on('race:tick', (d) => {
  const line = d.players
    .map((p) => `${p.seatId.slice(0, 4)}=${p.position}(${p.wpm}wpm)`)
    .join('  ');
  console.log(`tick  ${line}`);
});

socket.on('race:finished', (d) => {
  console.log('race:finished');
  for (const r of d.results) {
    console.log(`  #${r.rank} ${r.name}  ${r.wpm} wpm  acc ${r.accuracy}%  ${r.timeMs}ms`);
  }
  if (typer) clearInterval(typer);
  socket.close();
  process.exit(0);
});

socket.on('error', (e) => console.error('server error:', e));
socket.on('connect_error', (e) => console.error('connect_error:', e.message));
