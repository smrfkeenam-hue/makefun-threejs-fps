// weapons.js — the armory. One table drives the buy menu, the HUD and the
// firing model, so a price or damage change lands everywhere at once.
// Damage is per hit at close range and falls off with distance; headshots
// multiply. Spread (radians) is the cone half-angle; recoil is the pitch kick
// added per shot. Movement and firing both widen the cone, crouching and
// standing still narrow it — stopping to aim pays.

export const WEAPONS = {
  pistol: {
    name: 'P9 SIDEARM', price: 0, auto: false, rpm: 320,
    damage: 26, headMul: 3, falloffStart: 18, falloffEnd: 45, falloffMin: 0.55,
    mag: 12, reserve: 36, reload: 1.5, spread: 0.011, moveSpread: 0.020,
    recoil: 0.011, kick: 0.35, range: 60, tracer: 0xffe9a8,
  },
  rifle: {
    name: 'VK-7 LONGSHOT', price: 2700, auto: true, rpm: 600,
    damage: 34, headMul: 3, falloffStart: 22, falloffEnd: 55, falloffMin: 0.6,
    mag: 30, reserve: 90, reload: 2.4, spread: 0.009, moveSpread: 0.030,
    recoil: 0.014, kick: 0.55, range: 90, tracer: 0xffd27a,
  },
  smg: {
    name: 'ROOK-9', price: 1500, auto: true, rpm: 800,
    damage: 22, headMul: 3, falloffStart: 12, falloffEnd: 32, falloffMin: 0.45,
    mag: 32, reserve: 96, reload: 2.0, spread: 0.014, moveSpread: 0.026,
    recoil: 0.009, kick: 0.4, range: 55, tracer: 0xffe9a8,
  },
  shotgun: {
    name: 'BREACHER-12', price: 1200, auto: false, rpm: 75,
    damage: 13, headMul: 2, pellets: 8, falloffStart: 8, falloffEnd: 22, falloffMin: 0.3,
    mag: 6, reserve: 24, reload: 2.8, spread: 0.045, moveSpread: 0.030,
    recoil: 0.05, kick: 1.4, range: 35, tracer: 0xffc46b,
  },
  sniper: {
    name: 'FALCON-50', price: 4200, auto: false, rpm: 50,
    damage: 92, headMul: 2.2, falloffStart: 30, falloffEnd: 90, falloffMin: 0.8,
    mag: 5, reserve: 15, reload: 3.2, spread: 0.002, moveSpread: 0.06,
    recoil: 0.07, kick: 2.2, range: 120, tracer: 0xfff2cc,
  },
};

export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;
export const KIT_PRICE = 400;

// Buy menu rows, in the order the HUD shows them (keys 1-6).
export const BUY_ROWS = [
  { key: '1', id: 'rifle', label: 'VK-7 Longshot — automatic rifle, 30 rounds' },
  { key: '2', id: 'smg', label: 'Rook-9 — fast SMG, 32 rounds' },
  { key: '3', id: 'shotgun', label: 'Breacher-12 — 8-pellet shotgun' },
  { key: '4', id: 'sniper', label: 'Falcon-50 — bolt sniper, one-shot body at range' },
  { key: '5', id: 'frag', label: 'Frag charge — thrown explosive, 1 per buy' },
  { key: '6', id: 'armor', label: 'Plate vest — absorbs half of incoming damage' },
];

export function damageAt(w, dist) {
  if (dist <= w.falloffStart) return w.damage;
  if (dist >= w.falloffEnd) return w.damage * w.falloffMin;
  const f = (dist - w.falloffStart) / (w.falloffEnd - w.falloffStart);
  return w.damage * (1 - f * (1 - w.falloffMin));
}

// Current spread for an actor: base + movement + firing bloom, crouch halves it.
export function currentSpread(actor, w) {
  let s = w.spread + actor.spread;
  if (actor.speed > 0.5) s += w.moveSpread * Math.min(1, actor.speed / 4.2);
  if (actor.crouched) s *= 0.55;
  return s;
}

export function timeBetweenShots(w) { return 60 / w.rpm; }

// Give a fresh weapon to an actor (used at round start and on purchase).
export function armActor(actor, id) {
  const w = WEAPONS[id];
  actor.owned[id] = true;
  actor.weapon = id;
  actor.mag[id] = w.mag;
  actor.reserve[id] = w.reserve;
}

export function resetAmmo(actor) {
  for (const id of Object.keys(actor.owned)) {
    if (!actor.owned[id]) continue;
    actor.mag[id] = WEAPONS[id].mag;
    actor.reserve[id] = WEAPONS[id].reserve;
  }
}
