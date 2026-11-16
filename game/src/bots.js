// bots.js — the nine AI actors. Each bot runs a small state machine on the
// waypoint graph in world.js:
//
//   route      walk the graph toward its site (attackers) or hold point (defenders)
//   hold       sit on a lane corner and watch an angle
//   engage     an enemy is visible: strafe, burst-fire with aim error, chase
//   investigate walk toward the last gunshot heard
//   plant      the spike carrier channels the plant at a site
//   defuse     a defender channels the defuse on a planted spike
//
// Bots see with a 120-degree cone out to 42 m through hasLOS, hear shots
// within 26 m, miss on purpose (aim error shrinks as they watch longer), and
// fire in bursts with pauses — so a duel is winnable and a crossfire is not.
// Friendly bots stick near the player; enemy bots push the sites.

import {
  WAYPOINTS, nearestWaypoint, findPath,
  collide, hasLOS, inSite,
} from './world.js';
import { WEAPONS, currentSpread, timeBetweenShots, armActor } from './weapons.js';
import { fireWeapon, spreadDir, eyeHeight, headY } from './combat.js';
import { PLANT_TIME, DEFUSE_TIME, attackerOf, defenderOf, bombSitePos } from './state.js';

const SPEED = 3.6;
const RADIUS = 0.38;
const SEE_DIST = 42;
const HEAR_DIST = 26;

export function armBots(m) {
  // Bots buy with the same table as the player: rifles for most, a mix so
  // the player meets different fire patterns.
  for (const b of m.bots) {
    const roll = Math.random();
    const id = roll < 0.55 ? 'rifle' : roll < 0.8 ? 'smg' : roll < 0.9 ? 'shotgun' : 'sniper';
    armActor(b, id);
    b.armor = Math.random() < 0.4 ? 50 : 0;
    b.frags = Math.random() < 0.25 ? 1 : 0;
  }
  // The attacking carrier is one of the attackers (the player if Sable attacks).
  const atk = attackerOf(m.round);
  if (atk === 'sable') {
    m.bomb.carrier = 'player';
  } else {
    const carriers = m.bots.filter((b) => b.team === 'ember');
    m.bomb.carrier = carriers[Math.floor(Math.random() * carriers.length)].name;
  }
  m.bomb.state = 'carried';
  m.bomb.site = null;
  m.bomb.timer = 0;
}

export function tickBot(m, b, dt) {
  const ai = b.ai;
  if (!b.alive) { ai.state = 'dead'; return; }
  if (m.phase !== 'live') return;

  ai.repathT -= dt;
  ai.strafeT -= dt;
  b.spread *= Math.exp(-3.5 * dt);
  b.recoil *= Math.exp(-6 * dt);

  // reload: an empty magazine ends the fight until the bot has reloaded
  if (b.mag[b.weapon] === 0 && !b.reloading && b.reserve[b.weapon] > 0) {
    b.reloading = true;
    b.reloadT = WEAPONS[b.weapon].reload;
  }
  if (b.reloading) {
    b.reloadT -= dt;
    if (b.reloadT <= 0) {
      const w = WEAPONS[b.weapon];
      const need = w.mag - b.mag[b.weapon];
      const take = Math.min(need, b.reserve[b.weapon]);
      b.mag[b.weapon] += take;
      b.reserve[b.weapon] -= take;
      b.reloading = false;
    }
  }

  // --- perception: nearest visible enemy ----------------------------------
  const eye = { x: b.pos.x, y: eyeHeight(b), z: b.pos.z };
  let seen = null, seenD = Infinity;
  for (const e of [m.player, ...m.bots]) {
    if (!e.alive || e.team === b.team) continue;
    const d = Math.hypot(e.pos.x - b.pos.x, e.pos.z - b.pos.z);
    if (d > SEE_DIST) continue;
    const ang = Math.abs(angleDiff(Math.atan2(-(e.pos.x - b.pos.x), -(e.pos.z - b.pos.z)), b.yaw));
    if (ang > 1.05 && d > 6) continue; // 120-degree cone (point-blank hears all)
    if (!hasLOS(b.pos.x, b.pos.z, e.pos.x, e.pos.z)) continue;
    if (d < seenD) { seen = e; seenD = d; }
  }
  if (seen) {
    ai.enemy = seen;
    ai.lastSeen = { x: seen.pos.x, z: seen.pos.z, t: m.time };
    if (ai.state !== 'engage') { ai.state = 'engage'; ai.burstLeft = 0; ai.burstWait = 0.2; ai.watchT = 0; }
    ai.watchT = (ai.watchT ?? 0) + dt;
  } else if (ai.state === 'engage' && m.time - ai.lastSeen.t > 2.5) {
    ai.state = 'investigate';
    ai.enemy = null;
  }

  // --- hearing: the last loud noise pulls bots toward it -------------------
  if (ai.state !== 'engage' && ai.state !== 'plant' && ai.state !== 'defuse') {
    for (const n of m.noise) {
      if (m.time - n.t > 0.4) continue;
      const d = Math.hypot(n.x - b.pos.x, n.z - b.pos.z);
      if (d < n.radius && d > 4) {
        ai.state = 'investigate';
        ai.lastSeen = { x: n.x, z: n.z, t: m.time };
        ai.path = []; ai.pathI = 0;
        break;
      }
    }
  }

  // --- bomb duties override everything else -------------------------------
  if (m.bomb.state === 'planted' && b.team === defenderOf(m.round)) {
    const d = Math.hypot(m.bomb.pos.x - b.pos.x, m.bomb.pos.z - b.pos.z);
    if (d < 2.2 && !seen) {
      ai.state = 'defuse';
    } else if (ai.state === 'defuse') {
      ai.state = 'route';
    } else if (ai.state !== 'engage') {
      ai.state = 'route';
      ai.targetSite = m.bomb.site;
      steerTo(m, b, bombSitePos(m.bomb.site), dt, SPEED);
    }
  }
  if (m.bomb.state === 'carried' && m.bomb.carrier === b.name && !seen) {
    const site = ai.targetSite;
    if (inSite(b.pos, site)) { ai.state = 'plant'; }
    else if (ai.state !== 'engage') {
      ai.state = 'route';
      steerTo(m, b, bombSitePos(site), dt, SPEED);
    }
  }
  if (m.bomb.state === 'dropped' && b.team === attackerOf(m.round) && !seen) {
    const d = Math.hypot(m.bomb.pos.x - b.pos.x, m.bomb.pos.z - b.pos.z);
    if (d < 1.2) {
      m.bomb.state = 'carried';
      m.bomb.carrier = b.name;
      m.events.push({ type: 'bombPickup', actor: b });
    } else if (ai.state !== 'engage') {
      ai.state = 'route';
      steerTo(m, b, m.bomb.pos, dt, SPEED);
    }
  }

  // --- state behaviours -----------------------------------------------------
  switch (ai.state) {
    case 'engage': tickEngage(m, b, seen, seenD, dt); break;
    case 'plant': tickChannel(m, b, PLANT_TIME, dt, 'plant'); break;
    case 'defuse': tickChannel(m, b, b.hasKit ? DEFUSE_TIME / 2 : DEFUSE_TIME, dt, 'defuse'); break;
    case 'investigate': {
      const arrived = steerTo(m, b, ai.lastSeen, dt, SPEED);
      if (arrived || m.time - ai.lastSeen.t > 6) { ai.state = 'hold'; ai.holdUntil = m.time + 2 + Math.random() * 3; }
      break;
    }
    case 'hold': {
      if (m.time > ai.holdUntil) {
        ai.state = 'route';
        ai.targetSite = Math.random() < 0.5 ? 'A' : 'B';
      }
      // scan: slow yaw sweep while holding an angle
      b.yaw += Math.sin(m.time * 0.5 + ai.index) * 0.15 * dt;
      b.speed = 0; b.moving = false;
      break;
    }
    case 'route': default: {
      const atk = attackerOf(m.round);
      let dest;
      if (b.team === atk) {
        dest = bombSitePos(ai.targetSite);
      } else {
        // defenders hold near their site, spread across both
        const site = ai.index % 2 === 0 ? 'A' : 'B';
        dest = bombSitePos(site);
        dest = { x: dest.x + (ai.index - 2) * 2, z: dest.z + 5 + (ai.index % 3) };
      }
      // friendly bots: two of them shadow the player instead of roaming
      if (b.team === 'sable' && ai.index < 2 && m.player.alive) {
        dest = { x: m.player.pos.x + (ai.index === 0 ? 2.5 : -2.5), z: m.player.pos.z + 2 };
      }
      if (dest) {
        const arrived = steerTo(m, b, dest, dt, SPEED);
        if (arrived) { ai.state = 'hold'; ai.holdUntil = m.time + 2 + Math.random() * 4; }
      }
      break;
    }
  }

  // stuck detection: if the bot barely moved while routing, pick a new node
  const moved = Math.hypot(b.pos.x - ai.lastPos.x, b.pos.z - ai.lastPos.z);
  if (ai.state === 'route' && moved < 0.02) {
    ai.stuckT += dt;
    if (ai.stuckT > 1.2) { ai.path = []; ai.pathI = 0; ai.stuckT = 0; ai.waypoint = nearestWaypoint(b.pos.x, b.pos.z); }
  } else ai.stuckT = 0;
  ai.lastPos = { x: b.pos.x, z: b.pos.z };
}

function tickEngage(m, b, seen, seenD, dt) {
  const ai = b.ai;
  // face the enemy (or the last seen spot) with a tracking lag
  const tx = seen ? seen.pos.x : ai.lastSeen.x;
  const tz = seen ? seen.pos.z : ai.lastSeen.z;
  const wantYaw = Math.atan2(-(tx - b.pos.x), -(tz - b.pos.z));
  b.yaw = turnToward(b.yaw, wantYaw, 6 * dt);
  const targetPitch = seen ? Math.atan2(headY(seen) - eyeHeight(b), seenD) : 0;
  b.pitch += (targetPitch - b.pitch) * Math.min(1, 5 * dt);

  // strafe sideways while fighting, so duels are not statue-vs-statue.
  // Far away, close the distance instead: a rifle duel at 35 m is a lottery,
  // a push to 12 m is a fight.
  if (seenD > 18 && seen) {
    const dx = tx - b.pos.x, dz = tz - b.pos.z;
    const l = Math.hypot(dx, dz) || 1;
    const c = collide(b.pos.x + (dx / l) * SPEED * dt, b.pos.z + (dz / l) * SPEED * dt, RADIUS);
    b.pos.x = c.x; b.pos.z = c.z;
    b.speed = SPEED; b.moving = true;
  } else {
    if (ai.strafeT <= 0) { ai.strafeDir *= -1; ai.strafeT = 0.7 + Math.random() * 0.9; }
    const strafe = ai.strafeDir * (seenD < 14 ? 1.6 : 0.7);
    const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
    const rx = -fz, rz = fx;
    const mvx = rx * strafe, mvz = rz * strafe;
    const c = collide(b.pos.x + mvx * dt, b.pos.z + mvz * dt, RADIUS);
    b.pos.x = c.x; b.pos.z = c.z;
    b.speed = Math.abs(strafe); b.moving = true;
  }

  // fire in bursts: 3-6 shots, then a pause. Aim error shrinks the longer
  // the bot has watched this target, and grows with distance.
  if (!seen) return;
  ai.burstWait -= dt;
  if (ai.burstLeft <= 0 && ai.burstWait <= 0) {
    ai.burstLeft = 3 + Math.floor(Math.random() * 4);
    ai.burstWait = 0.45 + Math.random() * 0.5;
  }
  const w = WEAPONS[b.weapon];
  if (ai.burstLeft > 0 && !b.reloading && m.time - b.lastShot >= timeBetweenShots(w)) {
    ai.burstLeft--;
    const watchTime = Math.min(2.5, ai.watchT ?? 0);
    const err = 0.022 + seenD * 0.0009 - Math.min(0.012, watchTime * 0.005);
    const yawErr = (Math.random() * 2 - 1) * err;
    const pitchErr = (Math.random() * 2 - 1) * err * 0.7;
    b.spread = currentSpread(b, w);
    fireWeapon(m, b, () => spreadDir(b.yaw + yawErr, b.pitch + pitchErr, b.spread));
  }
}

function tickChannel(m, b, need, dt, kind) {
  const ai = b.ai;
  ai.channelT += dt;
  b.speed = 0; b.moving = false;
  m.events.push({ type: kind === 'plant' ? 'planting' : 'defusing', actor: b, frac: ai.channelT / need });
  if (ai.channelT >= need) {
    ai.channelT = 0;
    if (kind === 'plant') {
      m.bomb.state = 'planted';
      m.bomb.site = ai.targetSite;
      m.bomb.pos = { x: b.pos.x, z: b.pos.z };
      m.bomb.timer = 40;
      m.events.push({ type: 'bombPlanted', actor: b, site: ai.targetSite });
    } else {
      m.bomb.state = 'defused';
      m.events.push({ type: 'bombDefused', actor: b });
    }
    ai.state = 'route';
  }
}

// Walk toward `dest` along the waypoint graph. Returns true when arrived.
export function steerTo(m, b, dest, dt, speed) {
  const ai = b.ai;
  const d = Math.hypot(dest.x - b.pos.x, dest.z - b.pos.z);
  if (d < 1.1) { b.speed = 0; b.moving = false; return true; }
  if (ai.path.length === 0 || ai.repathT <= 0) {
    const from = nearestWaypoint(b.pos.x, b.pos.z);
    const to = nearestWaypoint(dest.x, dest.z);
    ai.path = findPath(from, to);
    ai.pathI = 0;
    ai.repathT = 2.5;
  }
  // next node on the path, or the destination itself if it is nearer
  let node = WAYPOINTS[ai.path[Math.min(ai.pathI, ai.path.length - 1)]];
  const nd = Math.hypot(node.x - b.pos.x, node.z - b.pos.z);
  if (nd < 1.2 && ai.pathI < ai.path.length - 1) { ai.pathI++; node = WAYPOINTS[ai.path[ai.pathI]]; }
  const target = d < 6 && hasLOS(b.pos.x, b.pos.z, dest.x, dest.z) ? dest : node;
  const dx = target.x - b.pos.x, dz = target.z - b.pos.z;
  const l = Math.hypot(dx, dz) || 1;
  const vx = (dx / l) * speed, vz = (dz / l) * speed;
  const c = collide(b.pos.x + vx * dt, b.pos.z + vz * dt, RADIUS);
  b.pos.x = c.x; b.pos.z = c.z;
  b.yaw = turnToward(b.yaw, Math.atan2(-dx, -dz), 5 * dt);
  b.speed = speed; b.moving = true;
  return false;
}

export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function turnToward(cur, want, maxStep) {
  const d = angleDiff(want, cur);
  return cur + Math.max(-maxStep, Math.min(maxStep, d));
}
