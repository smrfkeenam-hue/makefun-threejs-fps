// hud.js — the DOM overlay: health, ammo, timer, score, kill feed, buy menu
// and the top-down minimap. It reads state only (never mutates it) and
// touches the DOM only when a value actually changed, so the 60 Hz render
// loop does not churn the layout.
//
// The buy menu is built from the same BUY_ROWS table the sim uses, so the
// prices on screen are the prices the sim charges.

import { WEAPONS, BUY_ROWS, GRENADE_PRICE, ARMOR_PRICE, KIT_PRICE } from './weapons.js';
import { roundTimeLeft, phaseLabel } from './sim.js';
import { aliveCount, SIDES, bombSitePos } from './state.js';
import { MAP, BOXES } from './world.js';

const $ = (id) => document.getElementById(id);
const els = {};
let last = {};
let feedItems = [];

export function initHud() {
  for (const id of ['hud', 'timer', 'scoreS', 'scoreE', 'phaseLabel', 'feed', 'crosshair',
    'hitmark', 'dmgVin', 'hpVal', 'armorVal', 'moneyVal', 'wName', 'magVal', 'resVal',
    'fireMode', 'teamBox', 'bombBox', 'bombTimer', 'banner', 'bannerTitle', 'bannerSub',
    'hint', 'plantBar', 'plantLbl', 'plantFill', 'spec', 'buy', 'buyMoney', 'buyTable',
    'menu', 'deployBtn', 'minimap', 'help']) {
    els[id] = $(id);
  }
  // buy menu rows, one per BUY_ROWS entry
  els.buyTable.innerHTML = BUY_ROWS.map((r) => {
    const price = r.id === 'frag' ? GRENADE_PRICE : r.id === 'armor' ? ARMOR_PRICE : WEAPONS[r.id].price;
    return `<tr><td class="key">${r.key}</td><td>${r.label}</td><td class="price" id="buyPrice-${r.id}">$${price}</td></tr>`;
  }).join('') +
    `<tr><td class="key">7</td><td>Defuse kit — halves defuse time (defenders only)</td><td class="price" id="buyPrice-kit">$${KIT_PRICE}</td></tr>`;
  els.minimap.width = 170; els.minimap.height = 118;
}

function setText(el, key, v) {
  if (last[key] !== v) { last[key] = v; el.textContent = v; }
}
function show(el, on) { el.classList.toggle('hidden', !on); }

function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function updateHud(m, input) {
  const p = m.player;
  show(els.hud, m.phase !== 'menu');
  if (m.phase === 'menu') return;

  // timer + score
  const t = roundTimeLeft(m);
  setText(els.timer, 'timer', fmtTime(t));
  els.timer.classList.toggle('low', m.phase === 'live' && t <= 15);
  setText(els.scoreS, 'sS', String(m.score.sable));
  setText(els.scoreE, 'sE', String(m.score.ember));
  setText(els.phaseLabel, 'ph', phaseLabel(m));

  // health / armor / money
  setText(els.hpVal, 'hp', String(Math.max(0, Math.ceil(p.hp))));
  els.hpVal.classList.toggle('low', p.hp <= 30);
  setText(els.armorVal, 'ar', `ARMOR ${Math.ceil(p.armor)}`);
  setText(els.moneyVal, 'mo', `$${p.money}`);

  // weapon + ammo
  const w = WEAPONS[p.weapon];
  setText(els.wName, 'wn', w.name + (p.frags > 0 ? `  ·  FRAG ×${p.frags}` : ''));
  setText(els.magVal, 'mg', String(p.mag[p.weapon] ?? 0));
  els.magVal.classList.toggle('empty', (p.mag[p.weapon] ?? 0) === 0);
  setText(els.resVal, 'rs', ` / ${p.reserve[p.weapon] ?? 0}`);
  setText(els.fireMode, 'fm', p.reloading ? 'RELOADING…' : w.auto ? 'AUTO' : 'SEMI');

  // team status lines
  const line = (a) => `${a.alive ? '●' : '✕'} ${a.name} ${a.alive ? Math.ceil(a.hp) : ''}`;
  const teamHtml = [
    ...[p, ...m.bots.filter((b) => b.team === SIDES.SABLE)].map((a) => `<span style="color:#4da3ff">${line(a)}</span>`),
    ...m.bots.filter((b) => b.team === SIDES.EMBER).map((a) => `<span style="color:#ff6a3d">${line(a)}</span>`),
  ].join('<br>');
  if (last.team !== teamHtml) { last.team = teamHtml; els.teamBox.innerHTML = teamHtml; }

  // bomb
  show(els.bombBox, m.bomb.state === 'planted');
  if (m.bomb.state === 'planted') setText(els.bombTimer, 'bt', String(Math.ceil(m.bomb.timer)));

  // crosshair gap grows with spread: gap px = 6 + spread * 900
  const gap = 6 + (w.spread + p.spread) * 900;
  const ch = els.crosshair;
  ch.querySelector('.t').style.top = `${-gap - 9}px`;
  ch.querySelector('.b').style.top = `${gap}px`;
  ch.querySelector('.l').style.left = `${-gap - 9}px`;
  ch.querySelector('.r').style.left = `${gap}px`;

  // hints: plant / defuse / buy prompts
  let hint = '';
  if (m.phase === 'buy') hint = 'Buy phase — press B for the armory, then the round starts.';
  else if (m.phase === 'live' && p.alive) {
    const atk = m.round <= 4 || m.round === 9;
    const inA = Math.abs(p.pos.x + 23) <= 5.5 && Math.abs(p.pos.z + 11) <= 5.5;
    const inB = Math.abs(p.pos.x - 23) <= 5.5 && Math.abs(p.pos.z + 11) <= 5.5;
    if (atk && m.bomb.state === 'carried' && m.bomb.carrier === 'player' && (inA || inB) && !p.channel) {
      hint = 'Hold E to plant the spike';
    } else if (!atk && m.bomb.state === 'planted' && Math.hypot(m.bomb.pos.x - p.pos.x, m.bomb.pos.z - p.pos.z) < 2.2 && !p.channel) {
      hint = 'Hold E to defuse the spike';
    } else if (m.bomb.state === 'dropped') {
      hint = 'The spike is on the ground — walk over it to pick it up.';
    }
  }
  show(els.hint, hint !== '');
  if (hint) setText(els.hint, 'hint', hint);

  // spectate line when dead
  const specTarget = !p.alive ? [p, ...m.bots].find((a) => a.alive && a.team === SIDES.SABLE) : null;
  show(els.spec, !!specTarget);
  if (specTarget) setText(els.spec, 'spec', `SPECTATING ${specTarget.name} — wait for the next round`);

  drawMinimap(m);
  updateBuyMenu(m, input);
}

function updateBuyMenu(m, input) {
  const open = m.phase === 'buy' && input.buyOpen;
  show(els.buy, open);
  if (!open) return;
  setText(els.buyMoney, 'bm', `$${m.player.money} — press 1–7 to buy, B or ESC to close`);
  for (const r of BUY_ROWS) {
    const el = document.getElementById(`buyPrice-${r.id}`);
    if (!el) continue;
    const owned = r.id === 'frag' ? false : r.id === 'armor' ? false : !!m.player.owned[r.id];
    el.textContent = owned ? 'OWNED' : el.textContent;
  }
}

// --- kill feed ---------------------------------------------------------------
export function pushFeed(html) {
  feedItems.unshift(html);
  feedItems = feedItems.slice(0, 5);
  els.feed.innerHTML = feedItems.map((f) => `<div>${f}</div>`).join('');
}
export function clearFeed() { feedItems = []; els.feed.innerHTML = ''; }

// --- banner / plant bar / hitmarker / damage ---------------------------------
export function showBanner(title, sub, cls) {
  els.bannerTitle.textContent = title;
  els.bannerTitle.className = cls;
  els.bannerSub.textContent = sub;
  show(els.banner, true);
}
export function hideBanner() { show(els.banner, false); }

export function showChannel(label, frac) {
  show(els.plantBar, true);
  setText(els.plantLbl, 'pl', label);
  els.plantFill.style.width = `${Math.round(frac * 100)}%`;
}
export function hideChannel() { show(els.plantBar, false); }

let hitT = 0;
export function flashHitmark(kill) {
  els.hitmark.style.opacity = '1';
  els.hitmark.classList.toggle('kill', !!kill);
  hitT = performance.now();
  setTimeout(() => { if (performance.now() - hitT > 90) els.hitmark.style.opacity = '0'; }, 120);
}
export function flashDamage() {
  els.dmgVin.style.opacity = '1';
  setTimeout(() => { els.dmgVin.style.opacity = '0'; }, 180);
}

// --- minimap -------------------------------------------------------------------
function drawMinimap(m) {
  const c = els.minimap.getContext('2d');
  const W = 170, H = 118;
  const sx = (x) => ((x - MAP.x0) / (MAP.x1 - MAP.x0)) * W;
  const sy = (z) => ((z - MAP.z0) / (MAP.z1 - MAP.z0)) * H;
  c.clearRect(0, 0, W, H);
  c.fillStyle = '#1a1d20'; c.fillRect(0, 0, W, H);
  for (const b of BOXES) {
    c.fillStyle = '#5a5148';
    c.fillRect(sx(b.x - b.w / 2), sy(b.z - b.d / 2), Math.max(1, (b.w / 64) * W), Math.max(1, (b.d / 44) * H));
  }
  // sites
  for (const [site, pos] of [['A', bombSitePos('A')], ['B', bombSitePos('B')]]) {
    c.fillStyle = m.bomb.state === 'planted' && m.bomb.site === site ? '#ff3d2e' : '#e8a33d';
    c.font = 'bold 10px sans-serif'; c.textAlign = 'center';
    c.fillText(site, sx(pos.x), sy(pos.z) + 3);
    c.strokeStyle = c.fillStyle; c.strokeRect(sx(pos.x) - 8, sy(pos.z) - 8, 16, 16);
  }
  // actors: player white arrow, allies blue. Enemies stay off the map —
  // you find them with your eyes, not a radar.
  const dot = (x, z, color, r = 2.5) => { c.fillStyle = color; c.beginPath(); c.arc(sx(x), sy(z), r, 0, 7); c.fill(); };
  for (const b of m.bots) {
    if (!b.alive || b.team !== SIDES.SABLE) continue;
    dot(b.pos.x, b.pos.z, '#4da3ff');
  }
  if (m.player.alive) {
    const px = sx(m.player.pos.x), pz = sy(m.player.pos.z);
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(px, pz - 5); c.lineTo(px + 4, pz + 4); c.lineTo(px - 4, pz + 4); c.closePath(); c.fill();
  }
  if (m.bomb.state === 'dropped') dot(m.bomb.pos.x, m.bomb.pos.z, '#ffd27a', 3);
}
