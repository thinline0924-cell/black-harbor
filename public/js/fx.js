// 画面切り替えの「三角形のかけら」演出(音は audio.js)

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
