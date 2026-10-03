// BLACK HARBOR — BGM と効果音
// 音のファイルは使わず、ブラウザの WebAudio(音を合成するしくみ)でその場で作ります。
// ・BGM は場面ごとに3種類(タイトル/ふだん/検問中)。コードと旋律を少しずつ変えながら流れ続けます
// ・ブラウザの決まりで、最初にどこかをクリックするまでは音が出ません

const SETTINGS_KEY = 'bh-audio';
const settings = { bgm: true, se: true, bgmVol: 0.55, seVol: 0.8 };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
  if (localStorage.getItem('bh-sound') === 'off') settings.se = false; // 古い設定の引き継ぎ
} catch { /* 保存が使えない環境でも動く */ }

function save() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* 無視 */ }
}

let ac = null;
let master, bgmBus, seBus, delay, delayFb, delayWet, noiseBuf;

function ctx() {
  if (ac) return ac;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ac = new AC();
  master = ac.createGain();
  master.gain.value = 0.9;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ac.destination);
  bgmBus = ac.createGain();
  seBus = ac.createGain();
  bgmBus.connect(master);
  seBus.connect(master);
  // 響き(やまびこ):BGM の旋律にうっすらかける
  delay = ac.createDelay(1.5);
  delay.delayTime.value = 0.42;
  delayFb = ac.createGain();
  delayFb.gain.value = 0.35;
  delayWet = ac.createGain();
  delayWet.gain.value = 0.35;
  delay.connect(delayFb).connect(delay);
  delay.connect(delayWet).connect(bgmBus);
  // ザーッという音のもと(白色雑音)
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  applyVolumes();
  return ac;
}

function applyVolumes() {
  if (!ac) return;
  const t = ac.currentTime;
  bgmBus.gain.setTargetAtTime(settings.bgm ? settings.bgmVol * 0.85 : 0, t, 0.3);
  seBus.gain.setTargetAtTime(settings.se ? settings.seVol : 0, t, 0.05);
}

// 最初のクリックで音を使えるようにする
export function unlock() {
  const a = ctx();
  if (!a) return;
  if (a.state === 'suspended') a.resume();
  if (wantMood && !timer) startScheduler();
}

export function getSettings() {
  return { ...settings };
}
export function setSetting(key, value) {
  settings[key] = value;
  save();
  applyVolumes();
  if (key === 'bgm' && value) unlock();
}
// 以前の呼び方(効果音のON/OFF)も使えるようにしておく
export const soundOn = () => settings.se;
export const setSound = (on) => setSetting('se', on);

// ---- 音を作る部品 ----
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

function tone({ freq, at = 0, len = 0.2, type = 'sine', vol = 0.1, attack = 0.005, release = null, bus = seBus, glide = null, filter = null, echo = 0 }) {
  if (!ac) return;
  const t = ac.currentTime + at;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + len);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len + (release ?? 0));
  let node = o;
  if (filter) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    o.connect(f);
    node = f;
  }
  node.connect(g).connect(bus);
  if (echo) {
    const e = ac.createGain();
    e.gain.value = echo;
    g.connect(e).connect(delay);
  }
  o.start(t);
  o.stop(t + len + (release ?? 0) + 0.05);
}

function noise({ at = 0, len = 0.2, vol = 0.1, freq = 2000, q = 1, type = 'bandpass', bus = seBus, sweep = null }) {
  if (!ac) return;
  const t = ac.currentTime + at;
  const s = ac.createBufferSource();
  s.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + len);
  f.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  s.connect(f).connect(g).connect(bus);
  s.start(t, Math.random());
  s.stop(t + len + 0.05);
}

// ---- 効果音 ----
export function sfx(kind) {
  if (!settings.se) return;
  const a = ctx();
  if (!a) return;
  if (a.state === 'suspended') a.resume();
  try {
    switch (kind) {
      case 'move': // カーソル移動
        tone({ freq: 2200, len: 0.025, type: 'square', vol: 0.012 });
        break;
      case 'select': // 選んだ
        tone({ freq: 1320, len: 0.05, type: 'triangle', vol: 0.06 });
        break;
      case 'ok': // 決定
        tone({ freq: 880, len: 0.06, type: 'square', vol: 0.03 });
        tone({ freq: 1320, at: 0.06, len: 0.1, type: 'square', vol: 0.03 });
        break;
      case 'back':
        tone({ freq: 660, len: 0.06, type: 'square', vol: 0.03 });
        tone({ freq: 440, at: 0.06, len: 0.08, type: 'square', vol: 0.03 });
        break;
      case 'error':
        tone({ freq: 180, len: 0.18, type: 'sawtooth', vol: 0.05, filter: 900 });
        tone({ freq: 150, at: 0.12, len: 0.2, type: 'sawtooth', vol: 0.05, filter: 900 });
        break;
      case 'buy': // 購入:レジの「チャリン」
        noise({ len: 0.06, vol: 0.08, freq: 5000, q: 2 });
        [2093, 2637, 3136].forEach((f, i) => tone({ freq: f, at: 0.05 + i * 0.05, len: 0.25, type: 'sine', vol: 0.07 }));
        tone({ freq: 4186, at: 0.2, len: 0.4, type: 'sine', vol: 0.04 });
        break;
      case 'turn': // あなたの番
        tone({ freq: hz(76), len: 0.12, type: 'triangle', vol: 0.08 });
        tone({ freq: hz(81), at: 0.12, len: 0.25, type: 'triangle', vol: 0.08 });
        break;
      case 'round': // ラウンド開始の鐘
        [69, 76, 81].forEach((m, i) => tone({ freq: hz(m), at: i * 0.09, len: 0.9, type: 'sine', vol: 0.06, echo: 0.4 }));
        break;
      case 'grab': // トラックをつかむ
        tone({ freq: 300, len: 0.08, type: 'triangle', vol: 0.08, glide: 520 });
        break;
      case 'drop': // 台に置く「ガチャン」
        noise({ len: 0.12, vol: 0.15, freq: 900, q: 0.8 });
        tone({ freq: 120, len: 0.15, type: 'sine', vol: 0.12, glide: 60 });
        break;
      case 'place': // 工作カードを置く
        noise({ len: 0.05, vol: 0.08, freq: 3000, q: 1.5 });
        tone({ freq: 700, at: 0.02, len: 0.06, type: 'triangle', vol: 0.04 });
        break;
      case 'flip': // カードをめくる
        noise({ len: 0.08, vol: 0.1, freq: 2500, sweep: 6000, q: 1 });
        break;
      case 'dice': // サイコロが転がる
        for (let i = 0; i < 9; i++) {
          const at = i * 0.07 + Math.random() * 0.03 + (i > 5 ? (i - 5) * 0.06 : 0);
          noise({ at, len: 0.03, vol: 0.12 * (1 - i / 11), freq: 1800 + Math.random() * 1500, q: 4 });
          tone({ freq: 300 + Math.random() * 400, at, len: 0.03, type: 'triangle', vol: 0.03 });
        }
        break;
      case 'success': // 検問突破のファンファーレ
        [[72, 0], [76, 0.1], [79, 0.2], [84, 0.32]].forEach(([m, at]) => tone({ freq: hz(m), at, len: 0.3, type: 'square', vol: 0.04, filter: 3000, echo: 0.3 }));
        tone({ freq: hz(48), at: 0.32, len: 0.6, type: 'triangle', vol: 0.12 });
        tone({ freq: hz(88), at: 0.32, len: 0.7, type: 'sine', vol: 0.05, echo: 0.4 });
        break;
      case 'coin': // お金が入る
        for (let i = 0; i < 6; i++) tone({ freq: 1800 + i * 260, at: i * 0.06, len: 0.12, type: 'square', vol: 0.02, filter: 5000 });
        break;
      case 'bust': // 摘発:サイレン+重い音
        tone({ freq: 70, len: 0.6, type: 'sawtooth', vol: 0.12, filter: 400, glide: 40 });
        for (let i = 0; i < 4; i++) {
          tone({ freq: 960, at: i * 0.32, len: 0.16, type: 'sawtooth', vol: 0.035, filter: 2500 });
          tone({ freq: 700, at: i * 0.32 + 0.16, len: 0.16, type: 'sawtooth', vol: 0.035, filter: 2500 });
        }
        break;
      case 'launder': // 洗浄:お札を数える音+きらり
        for (let i = 0; i < 8; i++) noise({ at: i * 0.05, len: 0.035, vol: 0.06, freq: 4000, q: 3 });
        [84, 88, 91, 96].forEach((m, i) => tone({ freq: hz(m), at: 0.4 + i * 0.06, len: 0.4, type: 'sine', vol: 0.04, echo: 0.4 }));
        break;
      case 'win': // 勝利
        [[60, 0], [64, 0.15], [67, 0.3], [72, 0.45], [67, 0.75], [72, 0.9]].forEach(([m, at]) => tone({ freq: hz(m + 12), at, len: 0.28, type: 'square', vol: 0.035, filter: 3500, echo: 0.3 }));
        [48, 55, 60].forEach((m) => tone({ freq: hz(m), at: 0.9, len: 1.6, type: 'triangle', vol: 0.07 }));
        break;
      case 'lose': // 負け
        [[67, 0], [63, 0.3], [60, 0.6], [55, 0.9]].forEach(([m, at]) => tone({ freq: hz(m), at, len: 0.4, type: 'triangle', vol: 0.07, echo: 0.3 }));
        break;
      default:
        break;
    }
  } catch { /* 音が出せない環境でもゲームは続ける */ }
}

// トラックのエンジン音(走っている間だけ)。seconds = 走る時間
export function engine(seconds = 1.4) {
  if (!settings.se) return;
  const a = ctx();
  if (!a) return;
  const t = a.currentTime;
  const o = a.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(45, t);
  o.frequency.linearRampToValueAtTime(85, t + seconds * 0.6);
  o.frequency.linearRampToValueAtTime(60, t + seconds);
  const lfo = a.createOscillator(); // エンジンの「ドドド」という揺れ
  lfo.frequency.value = 22;
  const lfoGain = a.createGain();
  lfoGain.gain.value = 0.35;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 420;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.1, t + 0.15);
  g.gain.setValueAtTime(0.1, t + seconds - 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + seconds + 0.2);
  const am = a.createGain();
  am.gain.value = 0.65;
  lfo.connect(lfoGain).connect(am.gain);
  o.connect(f).connect(am).connect(g).connect(seBus);
  o.start(t);
  lfo.start(t);
  o.stop(t + seconds + 0.3);
  lfo.stop(t + seconds + 0.3);
  noise({ len: seconds, vol: 0.03, freq: 300, q: 0.7, type: 'lowpass' }); // タイヤの音
}

// ---- BGM ----
// 場面ごとのコード進行(MIDI の音の番号)。1小節に1コード
const MOODS = {
  title: { bpm: 70, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], arp: 'sparse', drums: false, bassOct: -12 },
  calm: { bpm: 86, chords: [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]], arp: 'eighth', drums: 'soft', bassOct: -12 },
  tense: { bpm: 112, chords: [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]], arp: 'sixteenth', drums: 'hard', bassOct: -12 },
};
let wantMood = null;
let mood = null;
let timer = null;
let nextTime = 0;
let step = 0; // 16分音符の番号
let bar = 0;

export function music(name) {
  if (name === wantMood) return;
  wantMood = name;
  if (!name) {
    stopScheduler();
    return;
  }
  if (ac && ac.state !== 'suspended' && !timer) startScheduler();
}

function startScheduler() {
  if (!ac || !wantMood) return;
  mood = wantMood;
  nextTime = ac.currentTime + 0.1;
  step = 0;
  bar = 0;
  clearInterval(timer);
  timer = setInterval(schedule, 50);
}
function stopScheduler() {
  clearInterval(timer);
  timer = null;
}

function schedule() {
  if (!ac) return;
  if (!wantMood) return stopScheduler();
  while (nextTime < ac.currentTime + 0.25) {
    // 曲の切り替えは小節の頭で
    if (step % 16 === 0 && mood !== wantMood) mood = wantMood;
    playStep(MOODS[mood], step, nextTime - ac.currentTime);
    const sixteenth = 60 / MOODS[mood].bpm / 4;
    nextTime += sixteenth;
    step = (step + 1) % 16;
    if (step === 0) bar++;
  }
}

function playStep(m, s, at) {
  if (!settings.bgm) return;
  const chord = m.chords[bar % m.chords.length];
  const beat = 60 / m.bpm;
  // パッド(和音の伸ばし):小節の頭
  if (s === 0) {
    for (const n of chord)
      for (const det of [-6, 6]) {
        tone({ freq: hz(n) * 2 ** (det / 1200), at, len: beat * 4, type: 'sawtooth', vol: 0.012, attack: beat * 0.8, release: beat, bus: bgmBus, filter: mood === 'tense' ? 1400 : 900 });
      }
    // ベース
    tone({ freq: hz(chord[0] + m.bassOct), at, len: beat * 1.8, type: 'triangle', vol: 0.09, bus: bgmBus });
  }
  if (s === 8) tone({ freq: hz(chord[0] + m.bassOct), at, len: beat * 1.5, type: 'triangle', vol: 0.07, bus: bgmBus });
  if (mood === 'tense' && s % 4 === 2) tone({ freq: hz(chord[0] + m.bassOct), at, len: beat * 0.4, type: 'triangle', vol: 0.05, bus: bgmBus });
  // 旋律(アルペジオ:和音をばらして弾く)
  const notes = [...chord, chord[0] + 12, chord[1] + 12];
  const play = (n, vol) => tone({ freq: hz(n + 12), at, len: beat * 0.6, type: 'triangle', vol, bus: bgmBus, echo: 0.5 });
  if (m.arp === 'sparse' && (s === 0 || s === 6 || s === 10) && Math.random() < 0.8) play(notes[Math.floor(Math.random() * notes.length)], 0.035);
  if (m.arp === 'eighth' && s % 2 === 0) {
    const pattern = [0, 2, 1, 3, 4, 2, 3, 1];
    if (Math.random() < 0.85) play(notes[pattern[(s / 2) % 8]], 0.03);
  }
  if (m.arp === 'sixteenth') play(notes[(s * 3 + bar) % notes.length], 0.022);
  // 打楽器
  if (m.drums) {
    if (s % 4 === 2) noise({ at, len: 0.04, vol: m.drums === 'hard' ? 0.05 : 0.025, freq: 8000, q: 1, type: 'highpass', bus: bgmBus });
    if (m.drums === 'hard' && (s === 0 || s === 8 || s === 10)) tone({ freq: 110, at, len: 0.18, type: 'sine', vol: 0.2, glide: 45, bus: bgmBus });
    if (m.drums === 'hard' && (s === 4 || s === 12)) noise({ at, len: 0.12, vol: 0.06, freq: 1800, q: 0.7, bus: bgmBus });
    if (m.drums === 'soft' && s === 0) tone({ freq: 90, at, len: 0.2, type: 'sine', vol: 0.08, glide: 45, bus: bgmBus });
  }
}
