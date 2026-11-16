// Focused test: plant + defuse + grenade + buy, without a browser.
import { createMatch, TICK, SIDES } from './game/src/state.js';
import { startMatch, tick } from './game/src/sim.js';
import { createInput } from './game/src/player.js';
import { WEAPONS } from './game/src/weapons.js';

function assert(c, msg) { if (!c) { console.error('FAIL:', msg); process.exit(1); } console.log('ok:', msg); }
const m = createMatch();
const input = createInput();
startMatch(m);
// skip the buy phase
for (let i = 0; i < 60 * 15; i++) tick(m, input, TICK);
assert(m.phase === 'live', 'round goes live after buy phase');
assert(m.bomb.carrier === 'player' && m.bomb.state === 'carried', 'player carries spike on attack round');

// buy: give money, buy rifle via buy phase of next round instead — test purchase now
m.phase = 'buy'; m.phaseT = 0;
m.player.money = 5000;
input.buyKey = 1; tick(m, input, TICK); input.buyKey = 0;
assert(m.player.owned.rifle && m.player.weapon === 'rifle', 'rifle bought for $2700');
assert(m.player.money === 2300, 'money deducted ($5000 -> $2300)');
input.buyKey = 5; tick(m, input, TICK); input.buyKey = 0;
assert(m.player.frags === 1 && m.player.money === 2000, 'frag bought for $300');

// plant: stand in Site A, hold E (disarm the defenders so the test player survives)
for (const b of m.bots) if (b.team === 'ember') { b.mag[b.weapon] = 0; b.reserve[b.weapon] = 0; }
m.phase = 'live'; m.phaseT = 20;
m.player.alive = true; m.player.hp = 100;
m.player.pos.x = -23; m.player.pos.z = -11;
input.use = true;
for (let i = 0; i < 60 * 5; i++) tick(m, input, TICK);
input.use = false;
assert(m.bomb.state === 'planted' && m.bomb.site === 'A', 'spike planted at Site A after 4s channel');
assert(m.bomb.timer > 30 && m.bomb.timer <= 40, 'fuse ticking from 40s');

// grenade: throw, it explodes after the fuse
const fragsBefore = m.player.frags;
input.grenade = true; tick(m, input, TICK); input.grenade = false;
assert(m.player.frags === fragsBefore - 1, 'frag thrown');
let exploded = false;
for (let i = 0; i < 60 * 3; i++) { tick(m, input, TICK); if (m.events.some((e) => e.type === 'explosion')) exploded = true; m.events.length = 0; }
assert(exploded, 'frag explodes after fuse');

// defuse: round 5 (Ember attacks), bomb planted, player defends
m.round = 5;
m.phase = 'live'; m.phaseT = 20;
for (const b of m.bots) { if (b.team === 'ember') { b.mag[b.weapon] = 0; b.reserve[b.weapon] = 0; } }
m.bomb.state = 'planted'; m.bomb.site = 'B'; m.bomb.pos = { x: 23, z: -11 }; m.bomb.timer = 30;
m.player.pos.x = 23; m.player.pos.z = -10;
m.player.alive = true; m.player.hp = 100;
input.use = true;
for (let i = 0; i < 60 * 6; i++) { tick(m, input, TICK); if (m.bomb.state === 'defused') break; }
input.use = false;
assert(m.bomb.state === 'defused', 'spike defused after 5s channel');
assert(m.phase === 'roundEnd' && m.roundWinner === 'sable', 'defuse wins the round for Sable');

// shooting: player fires rifle at a bot standing in front, headshot math
const target = m.bots.find((b) => b.team === 'ember');
target.alive = true; target.hp = 100; target.pos.x = m.player.pos.x; target.pos.z = m.player.pos.z - 3; target.crouched = false;
m.player.yaw = 0; m.player.pitch = 0; // facing -Z, north, straight at the bot
m.player.weapon = 'rifle'; m.player.mag.rifle = 30;
const hpBefore = target.hp;
m.phase = 'live';
input.fire = true;
for (let i = 0; i < 60; i++) { tick(m, input, TICK); if (target.hp < hpBefore) break; }
input.fire = false;
assert(target.hp < hpBefore, `player rifle hits a bot 5m ahead (hp ${hpBefore} -> ${Math.round(target.hp)})`);
console.log('ALL FLOW TESTS OK');
