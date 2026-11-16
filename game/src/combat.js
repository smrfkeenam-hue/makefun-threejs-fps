// combat.js — shooting, damage and explosives. All hit checks are analytic
// (ray vs sphere for the head, ray vs box for the body, ray vs wall boxes for
// cover), so the sim never depends on the renderer: the same tick in a
// headless test resolves exactly like the one in the browser.
//
// Body box: 0.55 m wide, 1.05 m tall (feet to shoulders). Head sphere:
// radius 0.16 m at 1.52 m standing, 1.05 m crouched. A shot that clears a
// low crate (h 1.1) can still hit a standing head; a crouched actor hides
// behind it.

import { WEAPONS, damageAt, currentSpread } from './weapons.js';
import { rayWalls, raySphere, rayBox, hasLOS } from './world.js';

export const EYE_STAND = 1.62, EYE_CROUCH = 1.12;
export const HEAD_Y_STAND = 1.52, HEAD_Y_CROUCH = 1.02;

export function eyeHeight(a) { return a.crouched ? EYE_CROUCH : EYE_STAND; }
export function headY(a) { return a.crouched ? HEAD_Y_CROUCH : HEAD_Y_STAND; }

// Fire one trigger pull from `shooter` toward a direction. `dirFn` supplies a
// (possibly spread) unit direction per pellet. Resolves hits, writes tracers
// and events, returns {hit, kill, headshot}.
export function fireWeapon(m, shooter, dirFn) {
  const w = WEAPONS[shooter.weapon];
  if (shooter.mag[shooter.weapon] <= 0) {
    m.events.push({ type: 'dry', actor: shooter });
    return { hit: false };
  }
  shooter.mag[shooter.weapon]--;
  shooter.lastShot = m.time;
  shooter.spread = Math.min(0.09, shooter.spread + w.recoil * 0.9);
  shooter.recoil += w.recoil;
  const ox = shooter.pos.x, oy = eyeHeight(shooter), oz = shooter.pos.z;
  const pellets = w.pellets ?? 1;
  let result = { hit: false, kill: false, headshot: false };
  for (let p = 0; p < pellets; p++) {
    const d = dirFn(p);
    const r = resolveShot(m, shooter, ox, oy, oz, d);
    if (r.hit) {
      result.hit = true;
      if (r.headshot) result.headshot = true;
      if (r.kill) result.kill = true;
    }
  }
  m.noise.push({ x: ox, z: oz, radius: 26, t: m.time });
  m.events.push({ type: 'shot', actor: shooter, weapon: shooter.weapon });
  return result;
}

// One pellet: find the nearest thing the ray meets — wall, head or body.
export function resolveShot(m, shooter, ox, oy, oz, d) {
  const w = WEAPONS[shooter.weapon];
  const wallT = rayWalls(ox, oy, oz, d.x, d.y, d.z, w.range);
  let best = null; // {t, target, headshot}
  for (const target of [m.player, ...m.bots]) {
    if (target === shooter || !target.alive) continue;
    const hx = target.pos.x, hy = headY(target), hz = target.pos.z;
    const ht = raySphere(ox, oy, oz, d.x, d.y, d.z, hx, hy, hz, 0.17);
    if (ht !== null && ht < wallT && (best === null || ht < best.t)) {
      best = { t: ht, target, headshot: true };
    }
    const bt = rayBox(ox, oy, oz, d.x, d.y, d.z,
      hx - 0.28, 0, hz - 0.28, hx + 0.28, headY(target) - 0.12, hz + 0.28);
    if (bt !== null && bt < wallT && (best === null || bt < best.t)) {
      best = { t: bt, target, headshot: false };
    }
  }
  const endT = best ? best.t : Math.min(wallT, w.range);
  m.tracers.push({
    from: { x: ox, y: oy, z: oz },
    to: { x: ox + d.x * endT, y: oy + d.y * endT, z: oz + d.z * endT },
    t: m.time, life: 0.07, color: w.tracer,
  });
  if (!best) {
    m.puffs.push({ x: ox + d.x * endT, y: oy + d.y * endT, z: oz + d.z * endT, t: m.time, life: 0.25, color: 0xcfc4a8, size: 0.12 });
    return { hit: false };
  }
  const dmg = damageAt(w, best.t) * (best.headshot ? w.headMul : 1);
  const killed = applyDamage(m, best.target, dmg, shooter, best.headshot);
  m.puffs.push({ x: ox + d.x * best.t, y: oy + d.y * best.t, z: oz + d.z * best.t, t: m.time, life: 0.3, color: best.headshot ? 0xff5040 : 0xffd27a, size: 0.16 });
  m.events.push({ type: 'hit', shooter, target: best.target, headshot: best.headshot, kill: killed, dmg: Math.round(dmg) });
  return { hit: true, headshot: best.headshot, kill: killed };
}

export function applyDamage(m, target, dmg, attacker, headshot) {
  // Armor absorbs half of the damage until it is spent.
  let rest = dmg;
  if (target.armor > 0) {
    const absorbed = Math.min(target.armor, rest * 0.5);
    target.armor -= absorbed;
    rest -= absorbed;
  }
  target.hp -= rest;
  target.lastDamageT = m.time;
  if (target.hp > 0) return false;
  target.hp = 0;
  target.alive = false;
  target.deaths++;
  if (attacker) attacker.kills++;
  m.events.push({ type: 'kill', killer: attacker, victim: target, headshot });
  if (attacker && attacker.isPlayer) {
    attacker.money += 300;
    m.events.push({ type: 'reward', actor: attacker, amount: 300, why: 'elimination' });
  }
  // The spike drops where its carrier falls.
  if (m.bomb.state === 'carried' && m.bomb.carrier === (target.isPlayer ? 'player' : target.name)) {
    m.bomb.state = 'dropped';
    m.bomb.pos = { x: target.pos.x, z: target.pos.z };
    m.events.push({ type: 'bombDropped' });
  }
  return true;
}

// --- grenades ----------------------------------------------------------------
export function throwGrenade(m, actor) {
  if (actor.frags <= 0) return false;
  actor.frags--;
  const yaw = actor.yaw, pitch = actor.pitch;
  const speed = 13;
  m.grenades.push({
    pos: { x: actor.pos.x, y: eyeHeight(actor), z: actor.pos.z },
    vel: {
      x: -Math.sin(yaw) * Math.cos(pitch) * speed,
      y: Math.sin(pitch) * speed + 2.5,
      z: -Math.cos(yaw) * Math.cos(pitch) * speed,
    },
    t: 0, fuse: 1.6, owner: actor,
  });
  m.events.push({ type: 'throw', actor });
  return true;
}

export function tickGrenades(m, dt) {
  for (const g of m.grenades) {
    g.t += dt;
    g.vel.y -= 14 * dt;
    g.pos.x += g.vel.x * dt;
    g.pos.y += g.vel.y * dt;
    g.pos.z += g.vel.z * dt;
    if (g.pos.y < 0.05) { g.pos.y = 0.05; g.vel.y *= -0.4; g.vel.x *= 0.7; g.vel.z *= 0.7; }
    if (g.t >= g.fuse) g.dead = true;
  }
  for (const g of m.grenades.filter((g) => g.dead)) {
    explode(m, g);
  }
  m.grenades = m.grenades.filter((g) => !g.dead);
}

function explode(m, g) {
  m.events.push({ type: 'explosion', x: g.pos.x, z: g.pos.z });
  m.noise.push({ x: g.pos.x, z: g.pos.z, radius: 40, t: m.time });
  m.puffs.push({ x: g.pos.x, y: 0.6, z: g.pos.z, t: m.time, life: 0.7, color: 0xff8c3d, size: 1.6 });
  for (const a of [m.player, ...m.bots]) {
    if (!a.alive) continue;
    const d = Math.hypot(a.pos.x - g.pos.x, a.pos.z - g.pos.z);
    if (d < 7) {
      // line of sight halves the blast through walls
      const los = hasLOS(g.pos.x, g.pos.z, a.pos.x, a.pos.z);
      const dmg = (150 - d * 18) * (los ? 1 : 0.35);
      if (dmg > 0) applyDamage(m, a, dmg, g.owner, false);
    }
  }
}

// Spread a unit direction by `spread` radians in a random cone.
export function spreadDir(yaw, pitch, spread) {
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * spread;
  const yaw2 = yaw + Math.cos(a) * r;
  const pitch2 = pitch + Math.sin(a) * r;
  return {
    x: -Math.sin(yaw2) * Math.cos(pitch2),
    y: Math.sin(pitch2),
    z: -Math.cos(yaw2) * Math.cos(pitch2),
  };
}

export { currentSpread };
