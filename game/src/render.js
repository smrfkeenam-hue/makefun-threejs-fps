// render.js — the three.js view. It reads state and draws it, nothing more:
// the sim never asks the renderer a question. One directional sun with
// shadows, a dusk sky, fog, and a procedural ground texture (drawn on a
// canvas at load — no image files, no network). Map meshes are built from
// the same BOXES list the sim collides with, so sight lines match cover.
//
// Hot-loop discipline: meshes, materials and geometries are created once in
// init(); per frame we only move them and update a handful of opacities.
// No allocations in the frame loop.

import * as THREE from 'three';
import { MAP, BOXES, SPAWNS } from './world.js';
import { SIDES, bombSitePos } from './state.js';
import { eyeHeight } from './combat.js';

let renderer, scene, camera, sun;
const botMeshes = new Map();   // actor -> {group, body, head, name}
const tracerLines = [];
const puffSprites = [];
const grenadeMeshes = new Map();
let gunGroup, muzzle, muzzleLight, bombMesh, bombLight;
let groundMat;
const tmpV = new THREE.Vector3();

export function initRenderer(canvasHost) {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.classList.add('game');
  canvasHost.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x3a4556);
  scene.fog = new THREE.Fog(0x3a4556, 35, 110);

  camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 220);
  scene.add(camera); // the camera carries the gun + muzzle light

  // dusk sun, low from the west so the long shadows point across the lanes
  const hemi = new THREE.HemisphereLight(0x9db1d6, 0x6a5238, 1.15);
  scene.add(hemi);
  sun = new THREE.DirectionalLight(0xffb36b, 2.4);
  sun.position.set(-38, 30, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x5a7bbf, 0.6);
  fill.position.set(30, 20, -20);
  scene.add(fill);

  buildGround();
  buildMap();
  buildSites();
  buildGun();
  buildBomb();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  return { renderer, scene, camera };
}

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#6f5b3f'; g.fillRect(0, 0, 512, 512);
  // dusty speckle
  for (let i = 0; i < 5200; i++) {
    const v = 90 + Math.random() * 60;
    g.fillStyle = `rgba(${v},${v * 0.82 | 0},${v * 0.55 | 0},0.25)`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  // cracked concrete grid + a faded lane line
  g.strokeStyle = 'rgba(40,32,20,0.35)'; g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i * 128); g.lineTo(512, i * 128); g.stroke();
  }
  g.strokeStyle = 'rgba(232,163,61,0.5)'; g.lineWidth = 4;
  g.setLineDash([26, 18]);
  g.beginPath(); g.moveTo(256, 0); g.lineTo(256, 512); g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 6);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function buildGround() {
  groundMat = new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95, metalness: 0 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 110), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  // distant dunes so the horizon is not a void
  const duneMat = new THREE.MeshStandardMaterial({ color: 0x7a6242, roughness: 1 });
  for (const [x, z, s] of [[-70, -30, 34], [70, -40, 40], [0, -70, 55], [-75, 35, 30], [75, 30, 32]]) {
    const dune = new THREE.Mesh(new THREE.SphereGeometry(s, 12, 8), duneMat);
    dune.scale.y = 0.22;
    dune.position.set(x, -1, z);
    scene.add(dune);
  }
}

function buildMap() {
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x1a140d, transparent: true, opacity: 0.5 });
  for (const b of BOXES) {
    const mat = new THREE.MeshStandardMaterial({ color: b.c, roughness: 0.85, metalness: 0.08 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat);
    mesh.position.set(b.x, b.h / 2, b.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edgeMat);
    edges.position.copy(mesh.position);
    scene.add(edges);
    // hazard stripe on low cover so it reads as cover at a glance
    if (b.h <= 1.2) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(b.w + 0.02, 0.08, b.d + 0.02),
        new THREE.MeshStandardMaterial({ color: 0xe8a33d, roughness: 0.6 }));
      stripe.position.set(b.x, b.h + 0.02, b.z);
      scene.add(stripe);
    }
  }
}

function textSprite(text, color, size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = `bold ${size}px Arial`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = color;
  g.shadowColor = '#000'; g.shadowBlur = 10;
  g.fillText(text, 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // bot name tags occlude like everything else (depthTest on) so a bot
  // behind a wall does not shout its name through it
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  spr.scale.set(2.2, 2.2, 1);
  return spr;
}

function buildSites() {
  for (const site of ['A', 'B']) {
    const pos = bombSitePos(site);
    // glowing floor ring marking the plant zone
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(4.2, 5.2, 40),
      new THREE.MeshBasicMaterial({ color: 0xe8a33d, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.03, pos.z);
    scene.add(ring);
    const label = textSprite(site, '#e8a33d', 84);
    label.scale.set(1.5, 1.5, 1);
    label.position.set(pos.x, 5.2, pos.z);
    scene.add(label);
    // corner posts
    for (const [dx, dz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.09, 1.6, 8),
        new THREE.MeshStandardMaterial({ color: 0xe8a33d, emissive: 0xe8a33d, emissiveIntensity: 0.7 }));
      post.position.set(pos.x + dx, 0.8, pos.z + dz);
      scene.add(post);
    }
  }
}

function buildGun() {
  gunGroup = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.5, metalness: 0.6 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xe8a33d, roughness: 0.4, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.62), dark);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.34, 10), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.46);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.1), dark);
  grip.position.set(0, -0.14, 0.12);
  grip.rotation.x = 0.3;
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.1), accent);
  mag.position.set(0, -0.16, -0.12);
  mag.rotation.x = 0.12;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.1), accent);
  sight.position.set(0, 0.1, -0.1);
  gunGroup.add(body, barrel, grip, mag, sight);
  gunGroup.position.set(0.26, -0.24, -0.5);
  camera.add(gunGroup);
  muzzle = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.3),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  muzzle.position.set(0.26, -0.2, -1.0);
  camera.add(muzzle);
  muzzleLight = new THREE.PointLight(0xffc46b, 0, 9);
  muzzleLight.position.set(0.26, -0.2, -1.0);
  camera.add(muzzleLight);
}

function buildBomb() {
  bombMesh = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.24, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.4, metalness: 0.7 }));
  const core = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.1, 0.2),
    new THREE.MeshStandardMaterial({ color: 0xff3d2e, emissive: 0xff3d2e, emissiveIntensity: 1.4 }));
  core.position.y = 0.15;
  bombMesh.add(body, core);
  bombLight = new THREE.PointLight(0xff3d2e, 0, 8);
  bombLight.position.y = 0.5;
  bombMesh.add(bombLight);
  bombMesh.visible = false;
  scene.add(bombMesh);
}

// --- bot meshes ---------------------------------------------------------------
function makeBotMesh(actor) {
  const group = new THREE.Group();
  const color = actor.team === SIDES.SABLE ? 0x2f6fd0 : 0xd0542a;
  const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.72, 4, 10), cloth);
  body.position.y = 0.95;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0x8a6f52, roughness: 0.7 }));
  head.position.y = 1.52;
  head.castShadow = true;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark);
  helmet.position.y = 1.55;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.2, metalness: 0.8 }));
  visor.position.set(0, 1.52, -0.15);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.55), dark);
  gun.position.set(0.2, 1.15, -0.3);
  const label = textSprite(actor.name, actor.team === SIDES.SABLE ? '#7db8ff' : '#ff9a7a', 40);
  label.scale.set(1.05, 1.05, 1);
  label.position.y = 2.05;
  group.add(body, head, helmet, visor, gun, label);
  scene.add(group);
  return { group, body, head, label };
}

function getBotMesh(actor) {
  let m = botMeshes.get(actor);
  if (!m) { m = makeBotMesh(actor); botMeshes.set(actor, m); }
  return m;
}

// --- per-frame sync -------------------------------------------------------------
export function renderFrame(m, dt, demoCam) {
  const p = m.player;

  // camera: first person, or spectate a teammate when dead
  if (demoCam) {
    camera.position.set(demoCam.x, demoCam.y, demoCam.z);
    camera.rotation.set(demoCam.pitch, demoCam.yaw, 0, 'YXZ');
  } else if (p.alive) {
    camera.position.set(p.pos.x, eyeHeight(p) + p.recoil * 0.4, p.pos.z);
    camera.rotation.set(p.pitch + p.recoil, p.yaw, 0, 'YXZ');
  } else {
    const mate = [p, ...m.bots].find((a) => a.alive && a.team === SIDES.SABLE);
    if (mate) {
      camera.position.set(mate.pos.x - Math.sin(mate.yaw) * -2.2, 2.6, mate.pos.z - Math.cos(mate.yaw) * -2.2);
      camera.lookAt(mate.pos.x, 1.3, mate.pos.z);
    }
  }

  // gun kick + muzzle flash decay
  gunGroup.position.z = -0.5 + p.recoil * 0.35;
  gunGroup.position.y = -0.24 + p.recoil * 0.12;
  if (muzzle.material.opacity > 0) {
    muzzle.material.opacity = Math.max(0, muzzle.material.opacity - dt * 9);
    muzzleLight.intensity = muzzle.material.opacity * 14;
    muzzle.rotation.z = Math.random() * Math.PI;
  }

  // bots
  for (const b of m.bots) {
    const mesh = getBotMesh(b);
    mesh.group.visible = b.alive;
    if (!b.alive) continue;
    mesh.group.position.set(b.pos.x, 0, b.pos.z);
    mesh.group.rotation.y = b.yaw;
    mesh.group.scale.y = b.crouched ? 0.72 : 1;
    mesh.body.position.y = b.crouched ? 0.7 : 0.95;
    // walk bob
    const bob = b.moving ? Math.sin(m.time * 11) * 0.03 : 0;
    mesh.group.position.y = bob;
    mesh.label.material.opacity = 1;
  }

  // tracers: one reusable line per active tracer
  while (tracerLines.length < m.tracers.length) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true }));
    scene.add(line);
    tracerLines.push(line);
  }
  m.tracers.forEach((t, i) => {
    const line = tracerLines[i];
    line.visible = true;
    line.material.color.setHex(t.color);
    line.material.opacity = Math.max(0, 1 - (m.time - t.t) / t.life);
    const pos = line.geometry.attributes.position;
    pos.setXYZ(0, t.from.x, t.from.y, t.from.z);
    pos.setXYZ(1, t.to.x, t.to.y, t.to.z);
    pos.needsUpdate = true;
  });
  for (let i = m.tracers.length; i < tracerLines.length; i++) tracerLines[i].visible = false;

  // impact puffs
  while (puffSprites.length < m.puffs.length) {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
    scene.add(spr);
    puffSprites.push(spr);
  }
  m.puffs.forEach((pf, i) => {
    const spr = puffSprites[i];
    spr.visible = true;
    spr.material.color.setHex(pf.color);
    spr.material.opacity = Math.max(0, 1 - (m.time - pf.t) / pf.life);
    const s = pf.size * (1 + (m.time - pf.t) * 3);
    spr.scale.set(s, s, 1);
    spr.position.set(pf.x, pf.y, pf.z);
  });
  for (let i = m.puffs.length; i < puffSprites.length; i++) puffSprites[i].visible = false;

  // grenades
  for (const g of m.grenades) {
    let mesh = grenadeMeshes.get(g);
    if (!mesh) {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0x2a2d33, emissive: 0xff3d2e, emissiveIntensity: 0.8 }));
      scene.add(mesh);
      grenadeMeshes.set(g, mesh);
    }
    mesh.position.set(g.pos.x, g.pos.y, g.pos.z);
  }
  for (const [g, mesh] of [...grenadeMeshes.entries()]) {
    if (!m.grenades.includes(g)) { scene.remove(mesh); grenadeMeshes.delete(g); }
  }

  // the spike: blinking on the ground when planted or dropped
  if (m.bomb.state === 'planted' || m.bomb.state === 'dropped') {
    bombMesh.visible = true;
    bombMesh.position.set(m.bomb.pos.x, 0.13, m.bomb.pos.z);
    const blink = m.bomb.state === 'planted' ? (Math.sin(m.time * 9) > 0 ? 2.2 : 0.2) : 0.6;
    bombLight.intensity = blink;
  } else {
    bombMesh.visible = false;
  }

  renderer.render(scene, camera);
}

export function flashMuzzle() {
  muzzle.material.opacity = 0.95;
  muzzleLight.intensity = 14;
}
