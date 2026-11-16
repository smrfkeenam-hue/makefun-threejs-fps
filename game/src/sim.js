// sim.js — the fixed-step simulation. tick(m, input, dt) advances the match
// by exactly one 1/60 s step and nothing else in the program mutates state.
// Phases: menu -> buy (14 s, shop open) -> live (100 s or until the round
// is decided) -> roundEnd (4 s banner) -> buy ... -> matchEnd (first to 5).
// The player fires, reloads, plants and defuses here; bots tick here too.

import { TICK, ROUND_TIME, BUY_TIME, BOMB_TIME, PLANT_TIME, DEFUSE_TIME,
  WIN_ROUNDS, MAX_ROUNDS, SIDES, attackerOf, defenderOf, bombSitePos,
  aliveCount, playerIsAttacker } from './state.js';
import { SPAWNS, inSite } from './world.js';
import { WEAPONS, BUY_ROWS, GRENADE_PRICE, ARMOR_PRICE, KIT_PRICE,
  timeBetweenShots, armActor, resetAmmo } from './weapons.js';
import { tickPlayer } from './player.js';
import { tickBot, armBots } from './bots.js';
import { fireWeapon, spreadDir, throwGrenade, tickGrenades, applyDamage, eyeHeight } from './combat.js';

export function startMatch(m) {
  m.phase = 'buy';
  m.phaseT = 0;
  m.round = 1;
  m.score = { sable: 0, ember: 0 };
  m.winner = null;
  m.player.money = 800;
  m.player.owned = { pistol: true };
  m.player.hasKit = false;
  m.player.frags = 0;
  m.player.kills = 0; m.player.deaths = 0;
  for (const b of m.bots) { b.kills = 0; b.deaths = 0; b.owned = { pistol: true }; b.hasKit = false; b.frags = 0; }
  setupRound(m);
}

function setupRound(m) {
  // positions: player first spawn, bots spread across the rest
  const sSpawns = SPAWNS.sable, eSpawns = SPAWNS.ember;
  place(m.player, sSpawns[0], Math.PI); // face north (-Z) toward the sites
  let si = 1, ei = 0;
  for (const b of m.bots) {
    if (b.team === SIDES.SABLE) { place(b, sSpawns[si++ % sSpawns.length], Math.PI); }
    else { place(b, eSpawns[ei++ % eSpawns.length], 0); } // face south
  }
  for (const a of [m.player, ...m.bots]) {
    a.hp = 100; a.alive = true;
    a.crouched = false; a.vel = { x: 0, z: 0 }; a.speed = 0;
    a.spread = 0; a.recoil = 0;
    if (a.ai) { a.ai.state = 'route'; a.ai.path = []; a.ai.pathI = 0; a.ai.enemy = null; a.ai.channelT = 0; }
  }
  // keep owned weapons, refill ammo; the spike goes to the attacking side
  resetAmmo(m.player);
  for (const b of m.bots) resetAmmo(b);
  armBots(m);
  // defenders get a free defuse kit on alternate rounds; attackers get none
  for (const b of m.bots) b.hasKit = b.team === defenderOf(m.round) && Math.random() < 0.5;
  m.bomb.timer = 0;
  m.events.push({ type: 'roundStart', round: m.round, attacker: attackerOf(m.round) });
  m.phase = 'buy';
  m.phaseT = 0;
}

function place(a, s, yaw) {
  a.pos.x = s.x; a.pos.z = s.z; a.pos.y = 0;
  a.yaw = yaw; a.pitch = 0;
}

export function tick(m, input, dt) {
  m.time += dt;
  m.tick++;
  // decay transient visuals
  m.tracers = m.tracers.filter((t) => m.time - t.t < t.life);
  m.puffs = m.puffs.filter((p) => m.time - p.t < p.life);
  m.noise = m.noise.filter((n) => m.time - n.t < 0.5);

  if (m.phase === 'buy') {
    m.phaseT += dt;
    handleBuy(m, input);
    tickPlayer(m, input, dt); // let the player look around the spawn
    if (m.phaseT >= BUY_TIME) { m.phase = 'live'; m.phaseT = 0; m.events.push({ type: 'roundLive' }); }
    return;
  }
  if (m.phase === 'roundEnd' || m.phase === 'matchEnd') {
    m.phaseT += dt;
    if (m.phase === 'roundEnd' && m.phaseT >= 4) {
      if (m.round >= MAX_ROUNDS || m.score.sable >= WIN_ROUNDS || m.score.ember >= WIN_ROUNDS) {
        endMatch(m);
      } else {
        m.round++;
        setupRound(m);
      }
    }
    return;
  }
  if (m.phase !== 'live') return;

  m.phaseT += dt;
  const p = m.player;

  // --- player actions -------------------------------------------------------
  tickPlayer(m, input, dt);
  if (p.alive) {
    const w = WEAPONS[p.weapon];
    if (input.fire && m.time - p.lastShot >= timeBetweenShots(w) && !p.reloading) {
      fireWeapon(m, p, () => spreadDir(p.yaw, p.pitch, currentSpreadOf(p)));
    }
    if (input.reload || (input.fire && p.mag[p.weapon] === 0 && p.reserve[p.weapon] > 0)) {
      startReload(m, p);
    }
    if (p.reloading) {
      p.reloadT -= dt;
      if (p.reloadT <= 0) finishReload(p);
    }
    if (input.grenade) throwGrenade(m, p);
    if (input.slot >= 1 && input.slot <= 5) {
      const ids = ['pistol', 'rifle', 'smg', 'shotgun', 'sniper'].filter((id) => p.owned[id]);
      const id = ids[input.slot - 1];
      if (id) { p.weapon = id; m.events.push({ type: 'switch', actor: p, weapon: id }); }
    }
    // plant / defuse channel (hold E)
    tickChannel(m, p, input, dt);
  }
  if (input.buyToggle && m.phase === 'live') {
    // buy menu is only for the buy phase; mid-round B does nothing
    m.events.push({ type: 'note', text: 'The armory opens between rounds (B).' });
  }

  // --- bots, grenades, bomb timer -------------------------------------------
  for (const b of m.bots) tickBot(m, b, dt);
  tickGrenades(m, dt);
  if (m.bomb.state === 'planted') {
    m.bomb.timer -= dt;
    if (m.bomb.timer <= 0) endRound(m, attackerOf(m.round), 'The spike detonated — Kestrel Yard burns.');
  }

  // --- round end checks -------------------------------------------------------
  // While the spike is planted the fuse decides the round: eliminations do
  // not end it (the defenders must still defuse, or it detonates).
  const sAlive = aliveCount(m, SIDES.SABLE);
  const eAlive = aliveCount(m, SIDES.EMBER);
  const timeLeft = ROUND_TIME - m.phaseT;
  if (m.bomb.state !== 'planted') {
    if (sAlive === 0) endRound(m, SIDES.EMBER, 'Sable team eliminated.');
    else if (eAlive === 0) endRound(m, SIDES.SABLE, 'Ember team eliminated.');
    else if (timeLeft <= 0) endRound(m, defenderOf(m.round), 'Time expired — the defenders hold the yard.');
  }
}

function currentSpreadOf(p) {
  const w = WEAPONS[p.weapon];
  let s = w.spread + p.spread;
  if (p.speed > 0.5) s += w.moveSpread * Math.min(1, p.speed / 4.2);
  if (p.crouched) s *= 0.55;
  return s;
}

function startReload(m, p) {
  const w = WEAPONS[p.weapon];
  if (p.reloading || p.mag[p.weapon] >= w.mag || p.reserve[p.weapon] <= 0) return;
  p.reloading = true;
  p.reloadT = w.reload;
  m.events.push({ type: 'reload', actor: p });
}
function finishReload(p) {
  const w = WEAPONS[p.weapon];
  const need = w.mag - p.mag[p.weapon];
  const take = Math.min(need, p.reserve[p.weapon]);
  p.mag[p.weapon] += take;
  p.reserve[p.weapon] -= take;
  p.reloading = false;
}

function tickChannel(m, p, input, dt) {
  // planting: the player carries the spike, stands in a site, holds E
  const atk = playerIsAttacker(m);
  const inSiteNow = inSite(p.pos, 'A') || inSite(p.pos, 'B');
  const site = inSite(p.pos, 'A') ? 'A' : inSite(p.pos, 'B') ? 'B' : null;
  if (atk && m.bomb.state === 'carried' && m.bomb.carrier === 'player' && inSiteNow && input.use) {
    p.channel = (p.channel ?? 0) + dt;
    m.events.push({ type: 'planting', actor: p, frac: p.channel / PLANT_TIME });
    if (p.channel >= PLANT_TIME) {
      m.bomb.state = 'planted';
      m.bomb.site = site;
      m.bomb.pos = { x: p.pos.x, z: p.pos.z };
      m.bomb.timer = BOMB_TIME;
      m.events.push({ type: 'bombPlanted', actor: p, site });
      p.channel = 0;
    }
    return;
  }
  if (!atk && m.bomb.state === 'planted' && input.use) {
    const d = Math.hypot(m.bomb.pos.x - p.pos.x, m.bomb.pos.z - p.pos.z);
    if (d < 2.2) {
      p.channel = (p.channel ?? 0) + dt;
      const need = p.hasKit ? DEFUSE_TIME / 2 : DEFUSE_TIME;
      m.events.push({ type: 'defusing', actor: p, frac: p.channel / need });
      if (p.channel >= need) {
        m.bomb.state = 'defused';
        m.events.push({ type: 'bombDefused', actor: p });
        endRound(m, defenderOf(m.round), 'Spike defused — the defenders hold the yard.');
        p.channel = 0;
      }
      return;
    }
  }
  p.channel = 0;
}

function handleBuy(m, input) {
  const p = m.player;
  if (!input.buyKey) return;
  // key 7: defuse kit (only worth anything on a defending half)
  if (input.buyKey === 7) {
    if (p.money >= KIT_PRICE && !p.hasKit) {
      p.money -= KIT_PRICE; p.hasKit = true;
      m.events.push({ type: 'buy', what: 'Defuse kit' });
    } else m.events.push({ type: 'note', text: 'Not enough credits, or already carrying a kit.' });
    return;
  }
  const row = BUY_ROWS[input.buyKey - 1];
  if (!row) return;
  if (row.id === 'frag') {
    if (p.money >= GRENADE_PRICE && p.frags < 2) {
      p.money -= GRENADE_PRICE; p.frags++;
      m.events.push({ type: 'buy', what: 'Frag charge' });
    } else m.events.push({ type: 'note', text: 'Not enough credits, or carrying two frags already.' });
    return;
  }
  if (row.id === 'armor') {
    if (p.money >= ARMOR_PRICE && p.armor < 100) {
      p.money -= ARMOR_PRICE; p.armor = 100;
      m.events.push({ type: 'buy', what: 'Plate vest' });
    } else m.events.push({ type: 'note', text: 'Not enough credits, or already armored.' });
    return;
  }
  const w = WEAPONS[row.id];
  if (p.owned[row.id]) { p.weapon = row.id; return; } // already owned: just equip
  if (p.money >= w.price) {
    p.money -= w.price;
    armActor(p, row.id);
    m.events.push({ type: 'buy', what: w.name });
  } else {
    m.events.push({ type: 'note', text: `Need $${w.price} for the ${w.name}.` });
  }
}

export function endRound(m, winner, reason) {
  if (m.phase !== 'live') return;
  m.score[winner]++;
  m.roundWinner = winner;
  m.roundReason = reason;
  // economy: winners +3250, losers +1900, plus a plant bonus for the planter
  const winPay = 3250, losePay = 1900;
  m.player.money += winner === SIDES.SABLE ? winPay : losePay;
  if (m.bomb.state === 'planted' && winner === attackerOf(m.round)) m.player.money += 300;
  m.phase = 'roundEnd';
  m.phaseT = 0;
  m.events.push({ type: 'roundEnd', winner, reason });
}

function endMatch(m) {
  m.winner = m.score.sable > m.score.ember ? SIDES.SABLE : SIDES.EMBER;
  m.phase = 'matchEnd';
  m.phaseT = 0;
  m.events.push({ type: 'matchEnd', winner: m.winner });
}

// --- helpers the HUD and the demo camera use ---------------------------------
export function roundTimeLeft(m) {
  if (m.phase === 'buy') return BUY_TIME - m.phaseT;
  if (m.phase === 'live') return Math.max(0, ROUND_TIME - m.phaseT);
  return 0;
}
export function phaseLabel(m) {
  if (m.phase === 'buy') return `BUY PHASE — ROUND ${m.round}`;
  if (m.phase === 'live') return playerIsAttacker(m) ? `ROUND ${m.round} — PLANT THE SPIKE` : `ROUND ${m.round} — DEFEND THE SITES`;
  if (m.phase === 'roundEnd') return `ROUND ${m.round} OVER`;
  if (m.phase === 'matchEnd') return 'MATCH OVER';
  return '';
}
