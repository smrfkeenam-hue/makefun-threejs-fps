// audio.js — every sound is synthesized with WebAudio: no audio files, no
// network, nothing to load. A tiny helper builds noise bursts (shots,
// explosions) and short tones (beeps, clicks, hit ticks). All calls are
// guarded so a suspended AudioContext (no user gesture yet) stays silent
// instead of throwing.

let ctx = null;
let master = null;

export function ensureAudio() {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { /* audio is optional */ }
}

function noiseBuffer(dur) {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function burst({ dur = 0.12, freq = 1800, gain = 0.9, type = 'lowpass', slide = 0 }) {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(dur);
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq;
  if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(60, freq + slide), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur);
}

function tone({ freq = 880, dur = 0.08, gain = 0.25, type = 'square', slide = 0 }) {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type; o.frequency.value = freq;
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur);
}

export const sfx = {
  shot(id) {
    if (id === 'shotgun') burst({ dur: 0.22, freq: 900, gain: 1, slide: -600 });
    else if (id === 'sniper') burst({ dur: 0.3, freq: 1400, gain: 1, slide: -900 });
    else if (id === 'smg') burst({ dur: 0.08, freq: 2400, gain: 0.55, slide: -1200 });
    else burst({ dur: 0.13, freq: 2000, gain: 0.8, slide: -1100 });
    tone({ freq: 160, dur: 0.08, gain: 0.5, type: 'sine', slide: -80 });
  },
  dry() { tone({ freq: 1200, dur: 0.03, gain: 0.2 }); },
  reload() { tone({ freq: 500, dur: 0.04, gain: 0.2 }); setTimeout(() => tone({ freq: 700, dur: 0.04, gain: 0.2 }), 160); },
  hit(head) { tone({ freq: head ? 1600 : 1100, dur: 0.05, gain: 0.3 }); },
  kill() { tone({ freq: 880, dur: 0.07, gain: 0.3 }); setTimeout(() => tone({ freq: 1320, dur: 0.09, gain: 0.3 }), 70); },
  hurt() { tone({ freq: 220, dur: 0.15, gain: 0.4, type: 'sawtooth', slide: -120 }); },
  explosion() {
    burst({ dur: 0.9, freq: 500, gain: 1, slide: -420 });
    tone({ freq: 70, dur: 0.8, gain: 0.7, type: 'sine', slide: -40 });
  },
  plantBeep() { tone({ freq: 1040, dur: 0.07, gain: 0.25 }); },
  defuseBeep() { tone({ freq: 780, dur: 0.07, gain: 0.25 }); },
  roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.14, gain: 0.25 }), i * 110)); },
  roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.16, gain: 0.25 }), i * 120)); },
  buy() { tone({ freq: 990, dur: 0.06, gain: 0.25 }); setTimeout(() => tone({ freq: 1480, dur: 0.08, gain: 0.25 }), 60); },
  click() { tone({ freq: 660, dur: 0.03, gain: 0.15 }); },
};
