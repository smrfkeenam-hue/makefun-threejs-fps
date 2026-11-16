import { createMatch, TICK } from './game/src/state.js';
import { startMatch, tick } from './game/src/sim.js';
import { createInput } from './game/src/player.js';

const m = createMatch();
const input = createInput();
startMatch(m);
const states = {};
for (let i = 0; i < 60 * 150; i++) {
  input.fwd = false;
  tick(m, input, TICK);
  for (const b of m.bots) states[b.ai.state] = (states[b.ai.state] || 0) + 1;
  m.events.length = 0;
  if (i % 600 === 0) {
    console.log(`t=${(i / 60).toFixed(0)}s phase=${m.phase} round=${m.round} score=${m.score.sable}-${m.score.ember}`);
    for (const b of m.bots) {
      console.log(`  ${b.team.slice(0, 1)} ${b.name.padEnd(7)} ${b.ai.state.padEnd(11)} pos=(${b.pos.x.toFixed(0)},${b.pos.z.toFixed(0)}) hp=${Math.round(b.hp)} wp=${b.weapon}`);
    }
  }
  if (m.phase === 'matchEnd') break;
}
console.log('state-ticks:', states);
