// ひだまり牧場 — グラフ(SVG。ライブラリなし)

import { STATS, STAT_LABEL } from './data.js?v=4';

// 能力のレーダー(五角形)。caps があれば「のびしろ」をうすく重ねる
export function radar(stats, caps) {
  const S = 220, c = S / 2, R = 78;
  const pt = (i, v) => {
    const a = -Math.PI / 2 + (i / STATS.length) * Math.PI * 2;
    return [c + Math.cos(a) * R * (v / 100), c + Math.sin(a) * R * (v / 100)];
  };
  const poly = (vals) => vals.map((v, i) => pt(i, v).map((n) => n.toFixed(1)).join(',')).join(' ');
  let grid = '';
  for (const lv of [25, 50, 75, 100]) grid += `<polygon points="${poly(STATS.map(() => lv))}" fill="none" stroke="#d8d0bd" stroke-width="1"/>`;
  const labels = STATS.map((k, i) => {
    const [x, y] = pt(i, 122);
    return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle">${STAT_LABEL[k]}</text>`;
  }).join('');
  return `<svg class="radar" viewBox="0 0 ${S} ${S}" width="100%" style="max-width:260px">
    ${grid}
    ${caps ? `<polygon points="${poly(STATS.map((k) => caps[k]))}" fill="rgba(212,138,134,.15)" stroke="#d48a86" stroke-dasharray="4 3" stroke-width="1.5"/>` : ''}
    <polygon points="${poly(STATS.map((k) => stats[k]))}" fill="rgba(79,143,138,.35)" stroke="#2f5d61" stroke-width="2"/>
    ${labels}
  </svg>`;
}

// 折れ線(お金の移り変わりなど)
export function lineChart(points, { height = 180, label = '' } = {}) {
  if (points.length < 2) return '<p class="muted">まだデータが少ないです。何週か遊ぶとグラフが出ます。</p>';
  const W = 600, H = height, pad = 36;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const minY = Math.min(0, ...ys), maxY = Math.max(...ys, 1);
  const sx = (i) => pad + (i / (points.length - 1)) * (W - pad - 10);
  const sy = (v) => H - 22 - ((v - minY) / (maxY - minY)) * (H - 40);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
  const area = `${path} L${sx(points.length - 1).toFixed(1)},${sy(minY)} L${sx(0)},${sy(minY)}Z`;
  const ticks = [minY, (minY + maxY) / 2, maxY].map((v) => `<text x="4" y="${sy(v) + 4}">${Math.round(v).toLocaleString()}</text><line x1="${pad}" x2="${W - 10}" y1="${sy(v)}" y2="${sy(v)}" stroke="#e5dece"/>`).join('');
  const step = Math.max(1, Math.floor(points.length / 6));
  const xl = points.map((p, i) => (i % step === 0 ? `<text x="${sx(i)}" y="${H - 4}" text-anchor="middle">${xs[i]}</text>` : '')).join('');
  return `<svg viewBox="0 0 ${W} ${H}">${ticks}<path d="${area}" fill="rgba(79,143,138,.15)"/><path d="${path}" fill="none" stroke="#2f5d61" stroke-width="2.5"/>${xl}${label ? `<text x="${W - 12}" y="14" text-anchor="end">${label}</text>` : ''}</svg>`;
}

// 棒グラフ(年ごとの勝利数など)
export function barChart(items, { height = 170, color = '#79a374' } = {}) {
  if (!items.length) return '<p class="muted">まだデータがありません。</p>';
  const W = 600, H = height, pad = 26;
  const max = Math.max(1, ...items.map((d) => d.v));
  const bw = Math.min(46, (W - pad * 2) / items.length - 8);
  return `<svg viewBox="0 0 ${W} ${H}">${items.map((d, i) => {
    const x = pad + i * ((W - pad * 2) / items.length) + 4;
    const h = (d.v / max) * (H - 50);
    return `<rect x="${x}" y="${H - 24 - h}" width="${bw}" height="${h}" rx="6" fill="${d.color || color}"/><text x="${x + bw / 2}" y="${H - 28 - h}" text-anchor="middle">${d.v}</text><text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${d.label}</text>`;
  }).join('')}</svg>`;
}
