// main.js — bootstrap and the frame loop. Input is gathered from the DOM
// (keyboard, pointer lock, clicks) into one input object; the fixed-step
// sim consumes it at 60 Hz; render.js and hud.js draw the result. The loop
// is the only place requestAnimationFrame lives, and it never mutates state
// itself — it only hands the sim its input and drains the event queue.
//
// ?shot=1..4 starts a scripted demo camera for screenshots: the same game,
// the same renderer, no pointer lock needed. It exists so the entry's
// screenshots can be taken headlessly; the game underneath is untouched.

import { createMatch, TICK, SIDES } from './state.js';
import { startMatch, tick as simTick } from './sim.js';
import { createInput } from './player.js';
import { initRenderer, renderFrame, flashMuzzle } from './render.js';
import { initHud, updateHud, pushFeed, clearFeed, showBanner, hideBanner,
  showChannel, hideChannel, flashHitmark, flashDamage } from './hud.js';
import { ensureAudio, sfx } from './audio.js';
import { WEAPONS } from './weapons.js';

const app = document.getElementById('app');
const match = createMatch();
const input = createInput();
input.buyOpen = false;

initHud();
initRenderer(app);
hideBanner();

// --- demo / screenshot mode ----------------------------------------------------
// ?shot=1  buy phase at Sable spawn, armory open, rifle in hand
// ?shot=2  live round, mid lane firefight with tracers and bots in view
// ?shot=3  live round, planting the spike at Site A (Crane Bay)
// ?shot=4  round-end banner after a Sable round win at Site B
const params = new URLSearchParams(location.search);
const shot = Number(params.get('shot') || 0);
let demoCam = null;
let demoSetup = false;

function setupShot(n) {
  // Screenshot mode skips the menu entirely: hide it so the HUD + game show.
  document.getElementById('menu').classList.add('hidden');
  startMatch(match);
  const p = match.player;
  if (n === 1) {
    match.phase = 'buy'; match.phaseT = 2;
    input.buyOpen = true;
    match.player.money = 4700;
    demoCam = { x: p.pos.x + 1.5, y: 1.7, z: p.pos.z + 3.5, yaw: Math.PI + 0.35, pitch: -0.06 };
  } else if (n === 2) {
    match.phase = 'live'; match.phaseT = 21;
    p.weapon = 'rifle'; p.mag.rifle = 30; p.reserve.rifle = 90; p.owned.rifle = true;
    p.pos.x = -2; p.pos.z = 12; p.yaw = 0.14; p.pitch = 0.01; // facing north, up Mid
    // enemies in the open mid ground, visible past the lane containers
    const e1 = match.bots[4]; e1.pos.x = -1; e1.pos.z = 4; e1.yaw = Math.PI;
    const e2 = match.bots[5]; e2.pos.x = 4; e2.pos.z = 6; e2.yaw = Math.PI * 0.7;
    const a1 = match.bots[0]; a1.pos.x = -6; a1.pos.z = 9; a1.yaw = Math.PI;
    match.tracers.push({ from: { x: -2, y: 1.6, z: 11 }, to: { x: -1, y: 1.4, z: 4 }, t: match.time, life: 0.4, color: 0xffd27a });
    match.puffs.push({ x: -1, y: 1.4, z: 4, t: match.time, life: 0.5, color: 0xffd27a, size: 0.2 });
    demoCam = { x: p.pos.x, y: 1.62, z: p.pos.z, yaw: p.yaw, pitch: p.pitch };
    pushFeed('<span class="sable">YOU</span> ▸ <span class="ember">CINDER</span> — 34');
    pushFeed('<span class="sable">WREN</span> ▸ <span class="ember">ASH</span> — HEADSHOT');
  } else if (n === 3) {
    match.phase = 'live'; match.phaseT = 34;
    p.pos.x = -20; p.pos.z = -7; p.yaw = 0.75; p.pitch = -0.06; // facing the Site A ring
    p.channel = 2.1;
    match.bomb.state = 'carried'; match.bomb.carrier = 'player';
    const a1 = match.bots[0]; a1.pos.x = -24; a1.pos.z = -14; a1.yaw = Math.PI * 0.6;
    const e1 = match.bots[6]; e1.pos.x = -16; e1.pos.z = -15; e1.yaw = Math.PI;
    demoCam = { x: p.pos.x, y: 1.62, z: p.pos.z, yaw: p.yaw, pitch: p.pitch };
    showChannel('PLANTING SPIKE…', 0.52);
  } else if (n === 4) {
    match.phase = 'roundEnd'; match.phaseT = 1;
    match.bomb.state = 'planted'; match.bomb.site = 'B';
    match.bomb.pos = { x: 22, z: -10 }; match.bomb.timer = 12;
    p.pos.x = 14; p.pos.z = -4; p.yaw = -0.9; p.pitch = -0.03; // facing the planted spike at Silo Row
    match.score.sable = 2; match.score.ember = 1;
    const e1 = match.bots[7]; e1.pos.x = 20; e1.pos.z = -8; e1.yaw = Math.PI * 0.5;
    demoCam = { x: p.pos.x, y: 1.62, z: p.pos.z, yaw: p.yaw, pitch: p.pitch };
    showBanner('ROUND WON', 'Spike planted at Silo Row — Ember team eliminated.', 'win');
    pushFeed('<span class="sable">YOU</span> ▸ <span class="ember">VEX</span> — HEADSHOT');
  }
  // drop the startMatch events (roundStart etc.): the tableau is already set
  // and the event drain would otherwise hide the banner / rewrite the feed
  match.events.length = 0;
  demoSetup = true;
}

// --- input -----------------------------------------------------------------------
const keys = {};
let locked = false;
let firing = false;

function refreshLock() {
  locked = document.pointerLockElement === rendererDom();
}
function rendererDom() { return document.querySelector('canvas.game'); }

document.addEventListener('pointerlockchange', refreshLock);
document.addEventListener('mousemove', (e) => {
  if (!locked || shot) return;
  input.mouseDX += e.movementX || 0;
  input.mouseDY += e.movementY || 0;
});
document.addEventListener('mousedown', (e) => {
  if (e.button === 0 && (locked || shot)) { firing = true; input.fire = true; ensureAudio(); }
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) { firing = false; input.fire = false; }
});
document.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  syncKeys();
  if (e.code === 'KeyB') { input.buyToggle = true; if (match.phase === 'buy') input.buyOpen = !input.buyOpen; }
  if (e.code === 'KeyR') input.reload = true;
  if (e.code === 'Digit1') input.slot = 1;
  if (e.code === 'Digit2') input.slot = 2;
  if (e.code === 'Digit3') input.slot = 3;
  if (e.code === 'Digit4') input.slot = 4;
  if (e.code === 'Digit5') input.slot = 5;
  if (e.code === 'KeyQ') input.grenade = true;
  if (e.code === 'KeyE') input.use = true;
  if (match.phase === 'buy' && input.buyOpen && /^Digit[1-7]$/.test(e.code)) {
    input.buyKey = Number(e.code.slice(5));
  }
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; syncKeys(); });

function syncKeys() {
  input.fwd = !!keys.KeyW || !!keys.ArrowUp;
  input.back = !!keys.KeyS || !!keys.ArrowDown;
  input.left = !!keys.KeyA || !!keys.ArrowLeft;
  input.right = !!keys.KeyD || !!keys.ArrowRight;
  input.crouch = !!keys.KeyC || !!keys.ControlLeft;
  input.slow = !!keys.ShiftLeft || !!keys.ShiftRight;
  input.use = !!keys.KeyE;
  input.fire = firing;
}

document.getElementById('deployBtn').addEventListener('click', () => {
  ensureAudio();
  document.getElementById('menu').classList.add('hidden');
  startMatch(match);
  clearFeed();
  rendererDom().requestPointerLock();
  sfx.click();
});

// --- event drain: sim events -> HUD + audio -------------------------------------
function drainEvents() {
  for (const ev of match.events) {
    switch (ev.type) {
      case 'shot':
        if (ev.actor.isPlayer) flashMuzzle();
        if (ev.actor.isPlayer || nearPlayer(ev.actor, 30)) sfx.shot(ev.weapon);
        break;
      case 'dry': if (ev.actor.isPlayer) sfx.dry(); break;
      case 'reload': if (ev.actor.isPlayer) sfx.reload(); break;
      case 'hit':
        if (ev.shooter.isPlayer) { flashHitmark(ev.kill); sfx.hit(ev.headshot); if (ev.kill) sfx.kill(); }
        if (ev.target.isPlayer) { flashDamage(); sfx.hurt(); }
        break;
      case 'kill': {
        const kc = ev.killer.team === SIDES.SABLE ? 'sable' : 'ember';
        const vc = ev.victim.team === SIDES.SABLE ? 'sable' : 'ember';
        pushFeed(`<span class="${kc}">${ev.killer.name}</span> ▸ <span class="${vc}">${ev.victim.name}</span>${ev.headshot ? ' — HEADSHOT' : ''}`);
        break;
      }
      case 'planting':
        if (ev.actor.isPlayer) showChannel('PLANTING SPIKE…', ev.frac);
        else if (ev.frac > 0 && ev.frac < 0.05) sfx.plantBeep();
        break;
      case 'defusing':
        if (ev.actor.isPlayer) showChannel('DEFUSING SPIKE…', ev.frac);
        break;
      case 'bombPlanted':
        pushFeed(`SPIKE PLANTED AT SITE ${ev.site} — ${ev.actor.name}`);
        sfx.plantBeep();
        break;
      case 'bombDefused':
        pushFeed(`SPIKE DEFUSED — ${ev.actor.name}`);
        break;
      case 'bombDropped': pushFeed('SPIKE DROPPED'); break;
      case 'bombPickup': pushFeed(`${ev.actor.name} picked up the spike`); break;
      case 'explosion':
        sfx.explosion();
        if (nearPlayerXY(ev.x, ev.z, 18)) flashDamage();
        break;
      case 'roundStart':
        hideBanner(); hideChannel();
        pushFeed(`ROUND ${ev.round} — ${ev.attacker === SIDES.SABLE ? 'SABLE ATTACKS' : 'EMBER ATTACKS'}`);
        break;
      case 'roundLive': pushFeed('ROUND LIVE — good hunting.'); break;
      case 'roundEnd': {
        const won = ev.winner === SIDES.SABLE;
        showBanner(won ? 'ROUND WON' : 'ROUND LOST', ev.reason, won ? 'win' : 'lose');
        if (won) sfx.roundWin(); else sfx.roundLose();
        break;
      }
      case 'matchEnd': {
        const won = ev.winner === SIDES.SABLE;
        showBanner(won ? 'VICTORY' : 'DEFEAT', `Final score ${match.score.sable} — ${match.score.ember}. First to ${5}.`, won ? 'win' : 'lose');
        break;
      }
      case 'buy': if (true) { pushFeed(`Bought ${ev.what}`); sfx.buy(); } break;
      case 'reward': pushFeed(`+$${ev.amount} — ${ev.why}`); break;
      case 'note': pushFeed(ev.text); break;
      case 'throw': if (ev.actor.isPlayer) sfx.click(); break;
      default: break;
    }
  }
  match.events.length = 0;
}
function nearPlayer(a, d) {
  return Math.hypot(a.pos.x - match.player.pos.x, a.pos.z - match.player.pos.z) < d;
}
function nearPlayerXY(x, z, d) {
  return Math.hypot(x - match.player.pos.x, z - match.player.pos.z) < d;
}

// --- frame loop ------------------------------------------------------------------
let last = performance.now();
let acc = 0;
let channeling = false;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25; // tab was in the background: don't spiral

  if (shot && !demoSetup) setupShot(shot);

  if (match.phase !== 'menu' && !shot) {
    // In screenshot mode the tableau is frozen: the same game, held still
    // so the frame can be captured with tracers and banners in place.
    acc += dt;
    while (acc >= TICK) {
      // one-shot keys are consumed by the sim tick
      simTick(match, input, TICK);
      input.mouseDX = 0; input.mouseDY = 0;
      input.reload = false; input.slot = 0; input.buyKey = 0;
      input.grenade = false; input.buyToggle = false;
      acc -= TICK;
    }
    // channel bar follows the live channel state
    channeling = match.events.some((e) => e.type === 'planting' || e.type === 'defusing');
    drainEvents();
    if (!channeling && match.phase === 'live') hideChannel();
  }

  updateHud(match, input);
  renderFrame(match, dt, shot ? demoCam : null);
}

requestAnimationFrame(frame);
