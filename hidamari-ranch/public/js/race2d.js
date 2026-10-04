// ひだまり牧場 — レースの 2D 画面(3D が使えないときの代わり。上から見たコース)

import { point, L, R, STRAIGHT, FINISH_U, startU, makeLaner } from './racepath.js?v=5';
import { COATS } from './data.js?v=5';

export function createRace2D(canvas) {
  const ctx = canvas.getContext('2d');
  let res = null, laner = null, dist = 2000;
  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = r.width * dpr;
    canvas.height = r.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  return {
    setup(r) { res = r; dist = r.race.dist; laner = makeLaner(r.runners.length); resize(); },
    draw(dists) {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const s = Math.min((w - 60) / (STRAIGHT + 2 * R + 60), (h - 260) / (2 * R + 60));
      const cx = w / 2, cy = (h - 140) / 2 + 40;
      const P = (u, lane) => { const p = point(u, lane); return [cx + p.x * s, cy + p.z * s]; };
      ctx.fillStyle = '#a9d08a';
      ctx.fillRect(0, 0, w, h);
      // コース
      ctx.lineWidth = 26 * s;
      ctx.strokeStyle = res.race.surface === 'turf' ? '#7ab45f' : '#c9a678';
      ctx.beginPath();
      for (let u = 0; u <= L; u += 10) { const [x, y] = P(u, 12.5); u ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.closePath();
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff';
      for (const lane of [-1, 26]) {
        ctx.beginPath();
        for (let u = 0; u <= L; u += 10) { const [x, y] = P(u, lane); u ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.closePath();
        ctx.stroke();
      }
      const [fx1, fy1] = P(FINISH_U, -1), [fx2, fy2] = P(FINISH_U, 26);
      ctx.strokeStyle = '#d9544d';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(fx1, fy1); ctx.lineTo(fx2, fy2); ctx.stroke();
      // 馬
      const lanes = laner(dists, 0.08);
      const su = startU(dist);
      res.runners.forEach((r, i) => {
        const [x, y] = P(su + dists[i], lanes[i]);
        ctx.beginPath();
        ctx.fillStyle = COATS[r.coat]?.body || '#7a4a2a';
        ctx.arc(x, y, r.own ? 7 : 5, 0, Math.PI * 2);
        ctx.fill();
        if (r.own || r.rival) {
          ctx.lineWidth = 3;
          ctx.strokeStyle = r.own ? '#ff6f91' : '#23232e';
          ctx.stroke();
        }
        if (r.own) {
          ctx.font = 'bold 13px sans-serif';
          ctx.fillStyle = '#a2475b';
          ctx.fillText(r.name, x + 9, y - 8);
        }
      });
    },
    ownScreen() { return null; },
    resize,
    dispose() { window.removeEventListener('resize', resize); },
  };
}
