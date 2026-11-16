// state.js — the single source of truth. Every mutable fact of a match lives in
// the object createMatch() returns; the fixed-step simulation in sim.js is the
// only code that mutates it, and render.js / hud.js only read it. No module
// keeps a second copy of health, money, ammo or the round clock.

export const TICK = 1 / 60;          // fixed simulation step (seconds)
export const ROUND_TIME = 100;       // seconds of live play per round
export const BUY_TIME = 14;          // seconds of buy phase before a round
export const BOMB_TIME = 40;         // seconds from plant to detonation
export const PLANT_TIME = 4;         // seconds to plant the spike
export const DEFUSE_TIME = 5;        // seconds to defuse (2.5 with a kit)
export const WIN_ROUNDS = 5;         // first team to this many rounds wins
export const MAX_ROUNDS = 9;

export const SIDES = { SABLE: 'sable', EMBER: 'ember' };

// Attacking side per round: Sable attacks rounds 1-4, Ember attacks 5-8,
// round 9 (if needed) Sable attacks again. The player is always Sable.
export function attackerOf(round) { return round <= 4 || round === 9 ? SIDES.SABLE : SIDES.EMBER; }
export function defenderOf(round) { return attackerOf(round) === SIDES.SABLE ? SIDES.EMBER : SIDES.SABLE; }

const ALLY_NAMES = ['BISHOP', 'WREN', 'DAGGER', 'FABLE'];
const ENEMY_NAMES = ['CINDER', 'ASH', 'ROOK', 'VEX', 'HALE'];

export function createMatch() {
  const bots = [];
  for (let i = 0; i < 4; i++) {
    bots.push(makeBot(SIDES.SABLE, ALLY_NAMES[i], i));
  }
  for (let i = 0; i < 5; i++) {
    bots.push(makeBot(SIDES.EMBER, ENEMY_NAMES[i], i));
  }
  return {
    time: 0, tick: 0,
    phase: 'menu',           // menu | buy | live | roundEnd | matchEnd
    phaseT: 0,               // seconds spent in the current phase
    round: 1,
    score: { sable: 0, ember: 0 },
    winner: null,            // 'sable' | 'ember' once the match ends
    roundWinner: null,
    roundReason: '',
    // the player is always Sable, always index 0 of the actors list
    player: makeActor(SIDES.SABLE, 'YOU', true),
    bots,
    bomb: { state: 'carried', site: null, pos: { x: 0, z: 0 }, timer: 0, carrier: 'player' },
    // transient per-tick events the HUD / audio drain each frame
    events: [],
    noise: [],               // {x, z, radius, t} gunshots bots can hear
    tracers: [],             // {from:{x,y,z}, to:{x,y,z}, t, life}
    puffs: [],               // {x, y, z, t, life, color, size} impact / explosion particles
    grenades: [],            // live frag charges in flight
    // per-round bookkeeping
    killsThisRound: 0,
    freezeNote: '',
  };
}

function makeActor(team, name, isPlayer) {
  return {
    team, name, isPlayer,
    pos: { x: 0, y: 0, z: 0 },       // feet position on the ground plane
    vel: { x: 0, z: 0 },
    yaw: 0, pitch: 0,                // yaw: radians, 0 = facing -Z (north)
    hp: 100, armor: 0, alive: true,
    crouched: false, moving: false, speed: 0,
    weapon: 'pistol',                // current weapon id
    owned: { pistol: true },         // weapons owned this match (persist across rounds)
    mag: {}, reserve: {},            // ammo per weapon id
    spread: 0,                       // current bloom in radians
    recoil: 0,                       // accumulated pitch kick waiting to decay
    lastShot: -99, lastDamageT: -99,
    money: isPlayer ? 800 : 0,
    hasKit: false,                   // defuse kit (defenders only)
    frags: 0,
    kills: 0, deaths: 0,
    // bot-only fields (ignored for the player)
    ai: null,
  };
}

function makeBot(team, name, index) {
  const a = makeActor(team, name, false);
  a.ai = {
    index,
    state: 'route',        // route | hold | engage | plant | defuse | investigate | dead
    waypoint: 0,           // current waypoint node id
    targetSite: Math.random() < 0.5 ? 'A' : 'B',
    holdUntil: 0,
    enemy: null,           // actor currently engaged
    lastSeen: { x: 0, z: 0, t: -99 },
    burstLeft: 0, burstWait: 0,
    aimErr: 0,             // current aim error in radians
    repathT: 0,
    path: [], pathI: 0,
    strafeDir: 1, strafeT: 0,
    channelT: 0,           // plant / defuse progress
    stuckT: 0, lastPos: { x: 0, z: 0 },
  };
  return a;
}

// --- small helpers the sim and HUD share ---------------------------------
export function aliveActors(m) {
  return [m.player, ...m.bots].filter((a) => a.alive);
}
export function aliveCount(m, team) {
  return aliveActors(m).filter((a) => a.team === team).length;
}
export function attackerSide(m) { return attackerOf(m.round); }
export function playerIsAttacker(m) { return attackerSide(m) === SIDES.SABLE; }
export function bombSitePos(site) {
  // Site A = Crane Bay (west), Site B = Silo Row (east). World coords in world.js.
  return site === 'A' ? { x: -23, z: -11 } : { x: 23, z: -11 };
}
