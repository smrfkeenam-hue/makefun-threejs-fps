// Headless sim test: runs the fixed-step simulation without a browser.
// Usage: node --experimental-vm-modules test-sim.mjs (or plain node on 22+)
import { createMatch, TICK, SIDES } from './game/src/state.js';
import { startMatch, tick } from './game/src/sim.js';
import { createInput } from './game/src/player.js';
import { WEAPONS } from './game/src/weapons.js';

const m = createMatch();
const input = createInput();
startMatch(m);

let kills = 0, shots = 0, plants = 0, roundEnds = 0;
const seenPhases = new Set();
// drive: walk forward, fire at nothing in particular, hold E near sites sometimes
for (let i = 0; i < 60 * 400; i++) {
  input.fwd = i % 600 < 300;
  input.fire = i % 90 < 12;
  input.mouseDX = (Math.random() - 0.5) * 4;
  input.use = false;
  tick(m, input, TICK);
  for (const ev of m.events) {
    if (ev.type === 'shot') shots++;
    if (ev.type === 'kill') kills++;
    if (ev.type === 'bombPlanted') plants++;
    if (ev.type === 'roundEnd') roundEnds++;
  }
  m.events.length = 0;
  seenPhases.add(m.phase);
  if (i % 3600 === 0) {
    console.log(`t=${(i / 60).toFixed(0)}s phase=${m.phase} round=${m.round} score=${m.score.sable}-${m.score.ember} ` +
      `alive S=${m.bots.filter((b) => b.team === 'sable' && b.alive).length + (m.player.alive ? 1 : 0)} ` +
      `E=${m.bots.filter((b) => b.team === 'ember' && b.alive).length} money=$${m.player.money}`);
  }
  if (m.phase === 'matchEnd') break;
}
console.log('---');
console.log('phases seen:', [...seenPhases].join(', '));
console.log(`shots=${shots} kills=${kills} plants=${plants} roundEnds=${roundEnds}`);
console.log(`final score SABLE ${m.score.sable} - EMBER ${m.score.ember}, phase=${m.phase}, round=${m.round}`);
console.log('player kills:', m.player.kills, 'bot kills:', m.bots.map((b) => `${b.name}:${b.kills}`).join(' '));
console.log('player pos:', m.player.pos.x.toFixed(1), m.player.pos.z.toFixed(1), 'hp:', Math.round(m.player.hp));
const botMoved = m.bots.some((b) => Math.hypot(b.pos.x, b.pos.z) > 1);
console.log('bots moved from spawn:', botMoved);
if (roundEnds === 0) { console.error('FAIL: no round ever ended'); process.exit(1); }
if (kills === 0) { console.error('FAIL: no kills in 400s'); process.exit(1); }
if (!botMoved) { console.error('FAIL: bots never moved'); process.exit(1); }
console.log('SIM OK');
