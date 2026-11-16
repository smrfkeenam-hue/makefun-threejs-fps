// world.js — Kestrel Yard, an original map. A desert-industrial yard, 64 m wide
// (x: -32..32) and 44 m deep (z: -22..22). Sable spawns south, Ember north.
// Site A "Crane Bay" sits west, Site B "Silo Row" sits east; three lanes run
// north-south: West Lane, Mid (through the container canyon) and East Lane.
// Nothing here copies a commercial map: the layout, names and palette are ours.
//
// Colliders are axis-aligned boxes {x, z, w, d, h} (footprint + height).
// The sim uses them for movement (circle vs box) and for line of sight
// (ray vs box); render.js builds the visible meshes from the same list, so
// what you see is exactly what blocks you.

export const MAP = { x0: -32, x1: 32, z0: -22, z1: 22 };

// Walls and crates. h is height; the player eye is 1.62 m, so h >= 2 blocks sight.
export const BOXES = [
  // perimeter (h = 4)
  { x: 0, z: -22.5, w: 66, d: 1, h: 4, c: 0x8a6f4d },   // north wall
  { x: 0, z: 22.5, w: 66, d: 1, h: 4, c: 0x8a6f4d },    // south wall
  { x: -32.5, z: 0, w: 1, d: 46, h: 4, c: 0x8a6f4d },   // west wall
  { x: 32.5, z: 0, w: 1, d: 46, h: 4, c: 0x8a6f4d },    // east wall
  // Site A — Crane Bay (west): crane legs, stacked containers, a low wall
  { x: -26, z: -14, w: 8, d: 2, h: 3.2, c: 0x3d6b8a },
  { x: -20, z: -18, w: 2, d: 8, h: 3.2, c: 0x3d6b8a },
  { x: -27, z: -6, w: 3, d: 3, h: 1.2, c: 0xc2703a },   // low crate (vaultable cover)
  { x: -18, z: -8, w: 4, d: 1.4, h: 2.6, c: 0x7a5a34 },
  { x: -24, z: -17, w: 1.6, d: 1.6, h: 5.5, c: 0x555c66 }, // crane leg
  // Site B — Silo Row (east): two silos, pipe stack, sandbag line
  { x: 26, z: -14, w: 8, d: 2, h: 3.2, c: 0x4d7a52 },
  { x: 20, z: -18, w: 2, d: 8, h: 3.2, c: 0x4d7a52 },
  { x: 27, z: -6, w: 3, d: 3, h: 1.2, c: 0xc2703a },
  { x: 18, z: -8, w: 4, d: 1.4, h: 2.6, c: 0x7a5a34 },
  { x: 24, z: -17, w: 2.4, d: 2.4, h: 6.5, c: 0x9aa0a8 }, // silo
  // Mid — container canyon: staggered containers force crossfire angles
  { x: -6, z: -2, w: 6, d: 2.4, h: 2.6, c: 0xb3542f },
  { x: 6, z: 2, w: 6, d: 2.4, h: 2.6, c: 0x2f6b8a },
  { x: -4, z: 8, w: 2.4, d: 6, h: 2.6, c: 0x8a7a3d },
  { x: 4, z: -8, w: 2.4, d: 6, h: 2.6, c: 0x8a7a3d },
  { x: 0, z: -14, w: 8, d: 1.6, h: 1.1, c: 0x6b5a44 },  // low mid wall (crouch cover)
  { x: 0, z: 0, w: 4, d: 2.4, h: 3.0, c: 0x8a3d2f },   // Kestrel block: breaks the spawn-to-spawn sightline
  // West Lane — forklift bay and pallet stacks
  { x: -16, z: 2, w: 5, d: 2, h: 2.4, c: 0x5d6b7a },
  { x: -14, z: 12, w: 2, d: 5, h: 2.4, c: 0x7a5a34 },
  { x: -22, z: 8, w: 3, d: 3, h: 1.2, c: 0xc2703a },
  // East Lane — pipe racks and a generator block
  { x: 16, z: 2, w: 5, d: 2, h: 2.4, c: 0x5d6b7a },
  { x: 14, z: 12, w: 2, d: 5, h: 2.4, c: 0x7a5a34 },
  { x: 22, z: 8, w: 3, d: 3, h: 1.2, c: 0xc2703a },
  // South (Sable spawn) — sandbags and a truck bed
  { x: -8, z: 18, w: 6, d: 1.6, h: 1.1, c: 0x6b5a44 },
  { x: 8, z: 18, w: 6, d: 1.6, h: 1.1, c: 0x6b5a44 },
  { x: 0, z: 20, w: 5, d: 2, h: 1.6, c: 0x4a4f55 },
  // North (Ember spawn) — watchtower base and crates
  { x: -8, z: -20, w: 2, d: 2, h: 4.5, c: 0x555c66 },
  { x: 8, z: -20, w: 2, d: 2, h: 4.5, c: 0x555c66 },
  { x: 0, z: -19, w: 6, d: 1.6, h: 1.1, c: 0x6b5a44 },
];

// Spawn points: Sable south, Ember north, spread across x.
export const SPAWNS = {
  sable: [
    { x: -12, z: 19 }, { x: -6, z: 20 }, { x: 0, z: 19 }, { x: 6, z: 20 }, { x: 12, z: 19 },
  ],
  ember: [
    { x: -12, z: -19 }, { x: -6, z: -20 }, { x: 0, z: -19 }, { x: 6, z: -20 }, { x: 12, z: -19 },
  ],
};

// Waypoint graph for bots. Nodes are open ground; edges join nodes that are
// close and have a clear 2D line between them (checked at load, not by hand).
export const WAYPOINTS = [
  { x: 0, z: 19 }, { x: -12, z: 16 }, { x: 12, z: 16 },          // 0-2 south
  { x: -10, z: 8 }, { x: 10, z: 8 }, { x: 0, z: 10 },            // 3-5 lower mid
  { x: -10, z: -2 }, { x: 10, z: -2 }, { x: 0, z: 6 },           // 6-8 mid
  { x: -18, z: -2 }, { x: 18, z: -2 },                           // 9-10 lanes
  { x: -23, z: -11 }, { x: 23, z: -11 },                         // 11-12 sites A/B
  { x: -16, z: -12 }, { x: 16, z: -12 },                         // 13-14 site approach
  { x: 0, z: -10 }, { x: -6, z: -16 }, { x: 6, z: -16 },         // 15-17 upper mid
  { x: 0, z: -19 }, { x: -12, z: -16 }, { x: 12, z: -16 },       // 18-20 north
  { x: -24, z: 4 }, { x: 24, z: 4 },                             // 21-22 lane bends
];

export const SITE_NODES = { A: 11, B: 12 };

function boxContains(b, x, z) {
  return Math.abs(x - b.x) <= b.w / 2 && Math.abs(z - b.z) <= b.d / 2;
}
function segmentBlocked(x0, z0, x1, z1) {
  // true if the 2D segment crosses any box footprint
  for (const b of BOXES) {
    if (segHitsBox(x0, z0, x1, z1, b)) return true;
  }
  return false;
}
function segHitsBox(x0, z0, x1, z1, b) {
  const minX = b.x - b.w / 2, maxX = b.x + b.w / 2;
  const minZ = b.z - b.d / 2, maxZ = b.z + b.d / 2;
  // slab test in 2D
  const dx = x1 - x0, dz = z1 - z0;
  let t0 = 0, t1 = 1;
  for (const [p, d, lo, hi] of [[x0, dx, minX, maxX], [z0, dz, minZ, maxZ]]) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return false; }
    else {
      let ta = (lo - p) / d, tb = (hi - p) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) return false;
    }
  }
  return true;
}

// Adjacency built once: neighbours within 13 m with a clear line.
export const EDGES = (() => {
  const edges = WAYPOINTS.map(() => []);
  for (let i = 0; i < WAYPOINTS.length; i++) {
    for (let j = i + 1; j < WAYPOINTS.length; j++) {
      const a = WAYPOINTS[i], b = WAYPOINTS[j];
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < 13 && !segmentBlocked(a.x, a.z, b.x, b.z)) {
        edges[i].push(j); edges[j].push(i);
      }
    }
  }
  return edges;
})();

export function nearestWaypoint(x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i++) {
    const d = (WAYPOINTS[i].x - x) ** 2 + (WAYPOINTS[i].z - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// Breadth-first path over the waypoint graph.
export function findPath(from, to) {
  if (from === to) return [to];
  const prev = new Array(WAYPOINTS.length).fill(-1);
  const queue = [from]; prev[from] = from;
  while (queue.length) {
    const n = queue.shift();
    for (const m of EDGES[n]) {
      if (prev[m] === -1) {
        prev[m] = n;
        if (m === to) {
          const path = [to]; let c = to;
          while (c !== from) { c = prev[c]; path.unshift(c); }
          return path;
        }
        queue.push(m);
      }
    }
  }
  return [to];
}

// --- collision + ray helpers (shared by sim and bots) ---------------------

// Circle (radius r) vs boxes, axis-separated so the actor slides along walls.
export function collide(x, z, r) {
  let nx = Math.max(MAP.x0 + r, Math.min(MAP.x1 - r, x));
  let nz = Math.max(MAP.z0 + r, Math.min(MAP.z1 - r, z));
  for (const b of BOXES) {
    const minX = b.x - b.w / 2 - r, maxX = b.x + b.w / 2 + r;
    const minZ = b.z - b.d / 2 - r, maxZ = b.z + b.d / 2 + r;
    if (nx > minX && nx < maxX && nz > minZ && nz < maxZ) {
      const dxl = nx - minX, dxr = maxX - nx, dzl = nz - minZ, dzr = maxZ - nz;
      const m = Math.min(dxl, dxr, dzl, dzr);
      if (m === dxl) nx = minX; else if (m === dxr) nx = maxX;
      else if (m === dzl) nz = minZ; else nz = maxZ;
    }
  }
  return { x: nx, z: nz };
}

// Ray (origin, dir normalized) vs all boxes: nearest hit distance, or Infinity.
// y is included: a low crate (h 1.1) does not block a shot over it.
export function rayWalls(ox, oy, oz, dx, dy, dz, maxDist) {
  let best = Infinity;
  for (const b of BOXES) {
    const t = rayBox(ox, oy, oz, dx, dy, dz,
      b.x - b.w / 2, 0, b.z - b.d / 2, b.x + b.w / 2, b.h, b.z + b.d / 2);
    if (t !== null && t < best && t <= maxDist) best = t;
  }
  return best;
}

export function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let t0 = 0, t1 = Infinity;
  const o = [ox, oy, oz], d = [dx, dy, dz], lo = [x0, y0, z0], hi = [x1, y1, z1];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) return null; }
    else {
      let ta = (lo[i] - o[i]) / d[i], tb = (hi[i] - o[i]) / d[i];
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) return null;
    }
  }
  return t0;
}

// Ray vs sphere (head). Returns distance or null.
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return null;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return null;
  return tca - Math.sqrt(r * r - d2);
}

// 2D line of sight at eye height, ignoring low cover below 1.4 m.
export function hasLOS(x0, z0, x1, z1, eyeY = 1.5) {
  const dx = x1 - x0, dz = z1 - z0;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.01) return true;
  const t = rayWalls(x0, eyeY, z0, dx / dist, 0, dz / dist, dist);
  return t === Infinity;
}

export function inSite(pos, site) {
  const c = site === 'A' ? { x: -23, z: -11 } : { x: 23, z: -11 };
  return Math.abs(pos.x - c.x) <= 5.5 && Math.abs(pos.z - c.z) <= 5.5;
}
