// ひだまり牧場 — 音(BGM と効果音)
// 音のファイルは使わず、WebAudio でその場で合成します(権利の心配がない)。
// ブラウザの決まりで、最初にどこかをクリック/タップしたあとから鳴ります。

const KEY = 'hidamari-audio';
let ctx = null, master, bgmGain, sfxGain, noiseBuf;
export const settings = { bgm: true, sfx: true, bgmVol: 0.5, sfxVol: 0.7 };
try { Object.assign(settings, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* 読めなくても大丈夫 */ }
export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* 保存できなくても遊べる */ }
  applyVolumes();
}
function applyVolumes() {
  if (!ctx) return;
  bgmGain.gain.setTargetAtTime(settings.bgm ? settings.bgmVol * 0.5 : 0, ctx.currentTime, 0.1);
  sfxGain.gain.setTargetAtTime(settings.sfx ? settings.sfxVol : 0, ctx.currentTime, 0.05);
}

export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  bgmGain = ctx.createGain();
  sfxGain = ctx.createGain();
  bgmGain.connect(master);
  sfxGain.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  applyVolumes();
  if (wanted) startSong(wanted);
}

// ---------- 音名 → 周波数 ----------
const NOTE = { C: -9, 'C#': -8, D: -7, 'D#': -6, E: -5, F: -4, 'F#': -3, G: -2, 'G#': -1, A: 0, 'A#': 1, Bb: 1, B: 2 };
function hz(n) {
  const m = /^([A-G][#b]?)(\d)$/.exec(n);
  return 440 * Math.pow(2, (NOTE[m[1]] + (Number(m[2]) - 4) * 12) / 12);
}

// ---------- 楽器 ----------
function env(g, t, a, peak, dec, sus = 0) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus), t + a + dec);
}
function pluck(f, t, dur, vol, out) {
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'triangle'; o.frequency.value = f;
  o2.type = 'sine'; o2.frequency.value = f * 2;
  const g2 = ctx.createGain(); g2.gain.value = 0.3;
  o.connect(g); o2.connect(g2).connect(g); g.connect(out);
  env(g, t, 0.005, vol, Math.max(0.25, dur));
  o.start(t); o2.start(t); o.stop(t + dur + 0.5); o2.stop(t + dur + 0.5);
}
function flute(f, t, dur, vol, out) {
  const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
  o.type = 'sine'; o.frequency.value = f;
  lfo.frequency.value = 5; lg.gain.value = f * 0.008;
  lfo.connect(lg).connect(o.frequency);
  o.connect(g).connect(out);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.06);
  g.gain.setValueAtTime(vol, t + Math.max(0.07, dur - 0.08));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
  o.start(t); lfo.start(t); o.stop(t + dur + 0.2); lfo.stop(t + dur + 0.2);
}
function brass(f, t, dur, vol, out) {
  const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
  o.type = 'sawtooth'; o.frequency.value = f;
  lp.type = 'lowpass'; lp.frequency.setValueAtTime(600, t); lp.frequency.linearRampToValueAtTime(2200, t + 0.05); lp.frequency.linearRampToValueAtTime(1200, t + dur);
  o.connect(lp).connect(g).connect(out);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
  g.gain.setValueAtTime(vol * 0.8, t + Math.max(0.04, dur - 0.05));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
  o.start(t); o.stop(t + dur + 0.1);
}
function bass(f, t, dur, vol, out) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.value = f;
  o.connect(g).connect(out);
  env(g, t, 0.01, vol, dur);
  o.start(t); o.stop(t + dur + 0.1);
}
function pad(fs, t, dur, vol, out) {
  const g = ctx.createGain(), lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 900;
  g.connect(lp).connect(out);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.05);
  for (const f of fs) {
    const o = ctx.createOscillator();
    o.type = 'triangle'; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 8;
    o.connect(g); o.start(t); o.stop(t + dur * 1.1);
  }
}
function noise(t, dur, vol, out, { type = 'bandpass', freq = 1000, q = 1, attack = 0.002 } = {}) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf;
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  s.connect(f).connect(g).connect(out);
  env(g, t, attack, vol, dur);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  return f;
}
function kick(t, vol, out) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
  o.connect(g).connect(out);
  env(g, t, 0.003, vol, 0.2);
  o.start(t); o.stop(t + 0.3);
}

// ---------- 曲 ----------
const CH = {
  F: ['F3', 'A3', 'C4'], Dm: ['D3', 'F3', 'A3'], Bb: ['Bb2', 'D3', 'F3'], C: ['C3', 'E3', 'G3'], Am: ['A2', 'C3', 'E3'],
  D: ['D3', 'F#3', 'A3'], G: ['G2', 'B2', 'D3'], A: ['A2', 'C#3', 'E3'], Bm: ['B2', 'D3', 'F#3'], Gm: ['G2', 'Bb2', 'D3'],
};
const SONGS = {
  ranch: {
    bpm: 88, chords: ['F', 'Dm', 'Bb', 'C', 'F', 'Am', 'Bb', 'C'],
    mel: [[['A4', 2], ['C5', 2], ['D5', 1], ['C5', 1], ['A4', 2]], [['F4', 2], ['G4', 2], ['A4', 4]], [['D5', 2], ['C5', 2], ['A4', 2], ['G4', 2]], [['G4', 2], ['A4', 1], ['G4', 1], ['E4', 4]],
      [['A4', 2], ['C5', 2], ['F5', 2], ['E5', 1], ['D5', 1]], [['C5', 2], ['A4', 2], ['E5', 4]], [['D5', 2], ['C5', 2], ['A4', 2], ['G4', 2]], [['G4', 2], ['E4', 2], ['F4', 4]]],
    play(step, bar, t, s) {
      const ch = CH[this.chords[bar % 8]];
      const arp = [0, 1, 2, 1, 0, 1, 2, 1][step];
      pluck(hz(ch[arp].replace(/\d/, (d) => String(Number(d) + 1))), t, s * 1.5, 0.08, bgmGain);
      if (step === 0 || step === 4) bass(hz(ch[0].replace(/\d/, (d) => String(Math.max(1, Number(d) - 1)))), t, s * 3.5, 0.22, bgmGain);
      if (step === 0) pad(ch.map(hz), t, s * 8, 0.035, bgmGain);
      melodyAt(this.mel[bar % 8], step, t, s, (f, d) => flute(f, t, d, 0.075, bgmGain));
      if (step % 2 === 1) noise(t, 0.03, 0.012, bgmGain, { type: 'highpass', freq: 7000 });
    },
  },
  title: {
    bpm: 70, chords: ['F', 'Am', 'Bb', 'C'],
    mel: [[['C5', 4], ['A4', 2], ['C5', 2]], [['E5', 6], ['C5', 2]], [['D5', 4], ['F5', 2], ['D5', 2]], [['C5', 8]]],
    play(step, bar, t, s) {
      const ch = CH[this.chords[bar % 4]];
      if (step % 2 === 0) pluck(hz(ch[(step / 2) % 3].replace(/\d/, (d) => String(Number(d) + 2))), t, s * 3, 0.06, bgmGain);
      if (step === 0) { pad(ch.map(hz), t, s * 8, 0.045, bgmGain); bass(hz(ch[0].replace(/\d/, (d) => String(Math.max(1, Number(d) - 1)))), t, s * 7, 0.18, bgmGain); }
      melodyAt(this.mel[bar % 4], step, t, s, (f, d) => pluck(f, t, d, 0.09, bgmGain));
    },
  },
  race: {
    bpm: 152, chords: ['D', 'G', 'A', 'D', 'Bm', 'G', 'A', 'A'],
    mel: [[['D5', 1], ['D5', 1], ['F#5', 2], ['A5', 2], ['F#5', 2]], [['G5', 2], ['B5', 2], ['A5', 2], ['G5', 2]], [['E5', 2], ['F#5', 1], ['G5', 1], ['A5', 2], ['E5', 2]], [['F#5', 2], ['E5', 2], ['D5', 4]],
      [['F#5', 2], ['D5', 2], ['B4', 2], ['D5', 2]], [['G5', 2], ['F#5', 2], ['E5', 2], ['D5', 2]], [['C#5', 2], ['E5', 2], ['A5', 4]], [['A5', 2], ['G5', 2], ['F#5', 2], ['E5', 2]]],
    play(step, bar, t, s) {
      const ch = CH[this.chords[bar % 8]];
      bass(hz(ch[step % 4 === 2 ? 2 : 0].replace(/\d/, (d) => String(Math.max(1, Number(d) - 1)))), t, s * 0.9, 0.2, bgmGain);
      if (step % 4 === 0) kick(t, 0.35, bgmGain);
      if (step % 4 === 2) noise(t, 0.12, 0.12, bgmGain, { freq: 1800, q: 0.8 });
      noise(t, 0.03, 0.03, bgmGain, { type: 'highpass', freq: 8000 });
      if (step === 1 || step === 5) for (const n of ch) brass(hz(n.replace(/\d/, (d) => String(Number(d) + 1))), t, s * 0.6, 0.025, bgmGain);
      melodyAt(this.mel[bar % 8], step, t, s, (f, d) => brass(f, t, d * 0.9, 0.05, bgmGain));
    },
  },
};
function melodyAt(bar, step, t, s, fn) {
  let pos = 0;
  for (const [n, len] of bar) {
    if (pos === step && n) fn(hz(n), len * s);
    pos += len;
  }
}

let wanted = null, current = null, timer = null, nextT = 0, stepI = 0;
function startSong(name) {
  if (!ctx) return;
  if (timer) { clearInterval(timer); timer = null; }
  current = name;
  if (!name) return;
  const song = SONGS[name];
  const s = 60 / song.bpm / 2; // 8分音符
  nextT = ctx.currentTime + 0.1;
  stepI = 0;
  timer = setInterval(() => {
    while (nextT < ctx.currentTime + 0.15) {
      if (settings.bgm) song.play(stepI % 8, Math.floor(stepI / 8), nextT, s);
      if (gallop.on && settings.sfx) hoofBeat(nextT, s);
      nextT += s;
      stepI++;
    }
  }, 30);
}
export function music(name) {
  wanted = name;
  if (!ctx || current === name) return;
  startSong(name);
}

// ---------- 効果音 ----------
const gallop = { on: false, vol: 0.5 };
function hoofBeat(t, s) {
  for (let i = 0; i < 3; i++) {
    const tt = t + i * s * 0.28;
    noise(tt, 0.06, 0.12 * gallop.vol, sfxGain, { type: 'lowpass', freq: 300 + Math.random() * 200, q: 1 });
  }
}
export function hooves(on, vol = 0.5) { gallop.on = on; gallop.vol = vol; }

export function sfx(name) {
  if (!ctx || !settings.sfx) return;
  const t = ctx.currentTime + 0.01;
  const o = sfxGain;
  switch (name) {
    case 'click': pluck(1320, t, 0.06, 0.12, o); break;
    case 'tab': pluck(880, t, 0.08, 0.1, o); pluck(1175, t + 0.05, 0.1, 0.08, o); break;
    case 'open': pluck(660, t, 0.1, 0.1, o); pluck(990, t + 0.06, 0.15, 0.08, o); break;
    case 'close': pluck(990, t, 0.08, 0.08, o); pluck(660, t + 0.05, 0.12, 0.08, o); break;
    case 'error': brass(220, t, 0.12, 0.08, o); brass(196, t + 0.12, 0.18, 0.08, o); break;
    case 'brush': for (let i = 0; i < 3; i++) noise(t + i * 0.16, 0.14, 0.18, o, { freq: 3000, q: 0.6, attack: 0.04 }); break;
    case 'carrot': for (let i = 0; i < 4; i++) noise(t + i * 0.11, 0.05, 0.3, o, { freq: 1500 + Math.random() * 800, q: 2 }); break;
    case 'walk': for (let i = 0; i < 4; i++) noise(t + i * 0.22, 0.07, 0.25, o, { type: 'lowpass', freq: 500 }); break;
    case 'coin': pluck(1568, t, 0.1, 0.12, o); pluck(2093, t + 0.08, 0.25, 0.12, o); break;
    case 'bell': for (const [f, v] of [[784, 0.12], [1568, 0.05], [2352, 0.03]]) pluck(f, t, 1.2, v, o); pluck(988, t + 0.25, 1.2, 0.1, o); break;
    case 'talk': for (let i = 0; i < 3; i++) pluck(600 + Math.random() * 300, t + i * 0.07, 0.05, 0.05, o); break;
    case 'build': for (let i = 0; i < 3; i++) { noise(t + i * 0.18, 0.05, 0.4, o, { freq: 900, q: 3 }); kick(t + i * 0.18, 0.15, o); } break;
    case 'neigh': {
      const osc = ctx.createOscillator(), g = ctx.createGain(), bp = ctx.createBiquadFilter(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(700, t); osc.frequency.linearRampToValueAtTime(900, t + 0.15); osc.frequency.exponentialRampToValueAtTime(380, t + 0.9);
      lfo.frequency.value = 18; lg.gain.value = 40; lfo.connect(lg).connect(osc.frequency);
      bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 2;
      osc.connect(bp).connect(g).connect(o);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.15, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 1);
      osc.start(t); lfo.start(t); osc.stop(t + 1.05); lfo.stop(t + 1.05);
      break;
    }
    case 'cheer': { const f = noise(t, 2.6, 0.22, o, { freq: 1200, q: 0.5, attack: 0.6 }); f.frequency.linearRampToValueAtTime(1800, t + 1.5); break; }
    default: break;
  }
}

// 短いファンファーレ・ジングル
export function jingle(name) {
  if (!ctx || !settings.sfx) return;
  const t = ctx.currentTime + 0.05;
  const seqs = {
    fanfare: [['G4', 0, 0.18], ['C5', 0.2, 0.18], ['E5', 0.4, 0.18], ['G5', 0.6, 0.5], ['E5', 1.15, 0.15], ['G5', 1.3, 0.8]],
    win: [['C5', 0, 0.15], ['E5', 0.15, 0.15], ['G5', 0.3, 0.15], ['C6', 0.45, 0.6], ['G5', 1.1, 0.15], ['C6', 1.25, 0.9]],
    goal: [['E5', 0, 0.12], ['G5', 0.12, 0.12], ['C6', 0.24, 0.4]],
    heart: [['A5', 0, 0.2], ['C#6', 0.18, 0.2], ['E6', 0.36, 0.5]],
    birth: [['C6', 0, 0.15], ['E6', 0.12, 0.15], ['G6', 0.24, 0.15], ['C7', 0.36, 0.6]],
    lose: [['E5', 0, 0.25], ['D5', 0.25, 0.25], ['C5', 0.5, 0.6]],
  };
  const inst = name === 'fanfare' || name === 'win' ? brass : pluck;
  for (const [n, at, d] of seqs[name] || []) inst(hz(n), t + at, d, name === 'fanfare' || name === 'win' ? 0.09 : 0.1, sfxGain);
  if (name === 'win') for (const [n, at, d] of seqs.win) pluck(hz(n), t + at, d, 0.06, sfxGain);
}
