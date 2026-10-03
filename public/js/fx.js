// 画面切り替えの「三角形のかけら」演出と、メニューの小さな効果音

const canvas = document.getElementById('shards');
const ctx = canvas.getContext('2d');
let anim = null;

// 画面いっぱいの三角形が、ばらばらの順番で消えていく(新しい画面が見えてくる)
export function shards(color = '#cdc8b0') {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = window.innerWidth, H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const S = Math.max(90, Math.min(W, H) / 6);
  const tris = [];
  for (let y = -S; y < H + S; y += S) {
    for (let x = -S; x < W + S; x += S) {
      const off = (Math.round(y / S) % 2) * (S / 2);
      tris.push({ p: [[x + off, y], [x + off + S, y], [x + off + S / 2, y + S]], d: Math.random() });
      tris.push({ p: [[x + off + S / 2, y + S], [x + off + S, y], [x + off + S * 1.5, y + S]], d: Math.random() });
    }
  }
  const start = performance.now();
  const dur = 420;
  cancelAnimationFrame(anim);
  const step = (now) => {
    const k = (now - start) / dur;
    ctx.clearRect(0, 0, W, H);
    let any = false;
    for (const t of tris) {
      const a = 1 - Math.min(1, Math.max(0, (k - t.d * 0.6) / 0.4));
      if (a <= 0) continue;
      any = true;
      ctx.globalAlpha = a;
      ctx.fillStyle = t.d > 0.92 ? '#4e4b42' : color;
      ctx.beginPath();
      ctx.moveTo(...t.p[0]);
      ctx.lineTo(...t.p[1]);
      ctx.lineTo(...t.p[2]);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (any) anim = requestAnimationFrame(step);
    else ctx.clearRect(0, 0, W, H);
  };
  anim = requestAnimationFrame(step);
}

// ---- 効果音(WebAudio で合成。音のファイルは使わない) ----
let ac = null;
let enabled = true;
try { enabled = localStorage.getItem('bh-sound') !== 'off'; } catch { /* 保存が使えなくても動く */ }

export function soundOn() {
  return enabled;
}
export function setSound(on) {
  enabled = on;
  try { localStorage.setItem('bh-sound', on ? 'on' : 'off'); } catch { /* 無視 */ }
}

export function sfx(kind) {
  if (!enabled) return;
  try {
    ac ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    const t = ac.currentTime;
    const tone = (freq, at, len, type = 'square', vol = 0.04) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t + at);
      g.gain.setValueAtTime(vol, t + at);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + len);
      o.connect(g).connect(ac.destination);
      o.start(t + at);
      o.stop(t + at + len + 0.02);
    };
    if (kind === 'move') tone(1400, 0, 0.03, 'square', 0.015);
    else if (kind === 'ok') { tone(880, 0, 0.06); tone(1320, 0.06, 0.08); }
    else if (kind === 'back') tone(440, 0, 0.08);
    else if (kind === 'dice') for (let i = 0; i < 6; i++) tone(200 + Math.random() * 300, i * 0.07, 0.04, 'triangle', 0.05);
    else if (kind === 'success') { tone(660, 0, 0.1, 'triangle', 0.08); tone(880, 0.1, 0.1, 'triangle', 0.08); tone(1320, 0.2, 0.25, 'triangle', 0.08); }
    else if (kind === 'bust') { for (let i = 0; i < 4; i++) { tone(960, i * 0.25, 0.12, 'sawtooth', 0.04); tone(720, i * 0.25 + 0.12, 0.12, 'sawtooth', 0.04); } }
    else if (kind === 'flip') tone(2000, 0, 0.02, 'square', 0.02);
    else if (kind === 'coin') for (let i = 0; i < 5; i++) tone(1800 + i * 200, i * 0.05, 0.05, 'square', 0.02);
  } catch { /* 音が出せない環境でもゲームは続ける */ }
}
