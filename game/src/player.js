// player.js — the human controller. Acceleration-based movement: velocity
// builds toward the wish direction instead of snapping, so stopping, turning
// and crouching all take a beat — and the spread model in weapons.js can
// tell a moving shooter from a still one. Collision slides along walls
// (world.collide), and the player can never leave the yard.

import { collide } from './world.js';

const WALK_SPEED = 4.2;     // m/s
const CROUCH_SPEED = 2.1;
const SLOW_SPEED = 2.4;     // holding Shift: walk slow, steadier aim
const ACCEL = 34;           // how fast velocity approaches the wish velocity
const RADIUS = 0.38;

export function createInput() {
  return {
    fwd: false, back: false, left: false, right: false,
    crouch: false, slow: false, fire: false, reload: false,
    use: false, grenade: false,
    mouseDX: 0, mouseDY: 0,
    slot: 0,                 // 1..4 weapon slots, 0 = none
    buyKey: 0,               // 1..6 buy menu key pressed this frame
    buyToggle: false,
  };
}

// Apply one fixed step of movement + look. `input` is drained of its
// per-frame fields (mouse deltas, one-shot keys) by the caller afterwards.
export function tickPlayer(m, input, dt) {
  const p = m.player;
  if (!p.alive) return;

  // look: mouse deltas, sensitivity, pitch clamped so you cannot flip over
  p.yaw -= input.mouseDX * 0.0021;
  p.pitch -= input.mouseDY * 0.0021;
  p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch));

  p.crouched = !!input.crouch;
  const speed = p.crouched ? CROUCH_SPEED : input.slow ? SLOW_SPEED : WALK_SPEED;

  // wish direction in world space (yaw 0 faces -Z, north)
  let wx = 0, wz = 0;
  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
  if (input.fwd) { wx -= sin; wz -= cos; }
  if (input.back) { wx += sin; wz += cos; }
  if (input.left) { wx -= cos; wz += sin; }
  if (input.right) { wx += cos; wz -= sin; }
  const wl = Math.hypot(wx, wz);
  if (wl > 0) { wx = (wx / wl) * speed; wz = (wz / wl) * speed; }

  // accelerate toward the wish velocity (exponential approach, no snap)
  const k = 1 - Math.exp(-ACCEL * dt / speed * 4.2);
  p.vel.x += (wx - p.vel.x) * Math.min(1, k * 4);
  p.vel.z += (wz - p.vel.z) * Math.min(1, k * 4);
  // friction when no key is held
  if (wl === 0) {
    const f = Math.exp(-9 * dt);
    p.vel.x *= f; p.vel.z *= f;
    if (Math.hypot(p.vel.x, p.vel.z) < 0.05) { p.vel.x = 0; p.vel.z = 0; }
  }

  const nx = p.pos.x + p.vel.x * dt;
  const nz = p.pos.z + p.vel.z * dt;
  const c = collide(nx, nz, RADIUS);
  p.pos.x = c.x; p.pos.z = c.z;
  p.speed = Math.hypot(p.vel.x, p.vel.z);
  p.moving = p.speed > 0.4;

  // recoil recovery: the pitch kick decays back over ~0.4 s
  p.recoil *= Math.exp(-6 * dt);
  p.spread *= Math.exp(-3.5 * dt);
}
