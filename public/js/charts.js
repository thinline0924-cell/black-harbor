// グラフを SVG(線や四角で描く画像)で作る小さな道具。ライブラリは使わない。

const NS = 'http://www.w3.org/2000/svg';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

// 折れ線グラフ series: [{ name, color, values:[...] }], labels: x の見出し
export function lineChart({ series, labels, height = 180, unit = '' }) {
  const W = 420, H = height, L = 40, R = 12, T = 12, B = 24;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const n = Math.max(2, labels.length);
  const x = (i) => L + ((W - L - R) * i) / (n - 1);
  const y = (v) => T + (H - T - B) * (1 - v / max);
  let g = '';
  for (let k = 0; k <= 5; k++) {
    const v = (max * k) / 5;
    g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v * 10) / 10}${unit}</text>`;
  }
  labels.forEach((lb, i) => (g += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(lb)}</text>`));
  for (const s of series) {
    const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    g += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="${s.bold ? 3 : 2}" stroke-linejoin="round" ${s.dash ? 'stroke-dasharray="5 4"' : ''}/>`;
    s.values.forEach((v, i) => (g += `<rect x="${x(i) - 3.5}" y="${y(v) - 3.5}" width="7" height="7" fill="${s.color}" transform="rotate(45 ${x(i)} ${y(v)})"/>`));
  }
  g += `<line class="axis" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>` + legend(series);
}

export function legend(series) {
  return `<div class="chart-legend">${series.map((s) => `<span><i class="chip" style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
}

// 最終警戒度の分布(棒)と、ルートの上限の線
export function heatHistogram(dist, limit, { height = 150 } = {}) {
  if (!dist.length) return '<p class="hint">貨物を選ぶと、ここに「警戒度の出やすさ」のグラフが出ます。</p>';
  const W = 420, H = height, L = 30, R = 10, T = 16, B = 24;
  const lo = Math.min(dist[0][0], limit) - 1;
  const hi = Math.max(dist[dist.length - 1][0], limit) + 1;
  const cols = hi - lo + 1;
  const bw = (W - L - R) / cols;
  const maxP = Math.max(...dist.map((d) => d[1]));
  const y = (p) => T + (H - T - B) * (1 - p / maxP);
  let g = '';
  for (const [h, p] of dist) {
    const xx = L + (h - lo) * bw;
    const ok = h <= limit;
    g += `<rect x="${xx + 2}" y="${y(p)}" width="${bw - 4}" height="${H - B - y(p)}" fill="${ok ? '#4b483e' : '#b2523f'}" opacity="${ok ? 0.85 : 0.9}"><title>警戒度 ${h}: ${(p * 100).toFixed(1)}%</title></rect>`;
    if (bw > 16) g += `<text x="${xx + bw / 2}" y="${y(p) - 4}" text-anchor="middle">${Math.round(p * 100)}</text>`;
  }
  const step = cols > 16 ? 2 : 1;
  for (let h = lo; h <= hi; h += step) g += `<text x="${L + (h - lo) * bw + bw / 2}" y="${H - 7}" text-anchor="middle">${h}</text>`;
  const lx = L + (limit - lo + 1) * bw;
  g += `<line x1="${lx}" x2="${lx}" y1="${T - 8}" y2="${H - B + 2}" stroke="#b2523f" stroke-width="2" stroke-dasharray="4 3"/>`;
  const nearRight = lx > W - 70;
  g += `<text x="${nearRight ? lx - 4 : lx + 4}" y="${T - 2}" text-anchor="${nearRight ? 'end' : 'start'}" style="fill:#b2523f">上限 ${limit}</text>`;
  g += `<line class="axis" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="最終警戒度の分布">${g}</svg>`;
}

// 横棒グラフ items: [{ label, value, color, text }]
export function hbars(items, { max } = {}) {
  const m = max ?? niceMax(Math.max(1, ...items.map((i) => i.value)));
  return items
    .map(
      (i) => `<div class="stat-row"><span>${esc(i.label)}</span><div class="bar"><span style="width:${Math.max(0, Math.min(100, (i.value / m) * 100))}%;background:${i.color || ''}"></span></div><span class="val">${esc(i.text ?? i.value)}</span></div>`
    )
    .join('');
}

// 積み上げ横棒(ルートの利用回数など) rows: [{ label, parts:[{ value, color, name }] }]
export function stacked(rows) {
  const max = Math.max(1, ...rows.map((r) => r.parts.reduce((s, p) => s + p.value, 0)));
  return rows
    .map((r) => {
      const total = r.parts.reduce((s, p) => s + p.value, 0);
      const segs = r.parts
        .filter((p) => p.value > 0)
        .map((p) => `<span style="position:relative;display:inline-block;height:100%;width:${(p.value / max) * 100}%;background:${p.color}" title="${esc(p.name)}: ${p.value}"></span>`)
        .join('');
      return `<div class="stat-row"><span>${esc(r.label)}</span><div class="bar" style="display:flex">${segs}</div><span class="val">${total}</span></div>`;
    })
    .join('');
}

// ドーナツ(突破率など) value: 0〜1
export function donut(value, { size = 96, color = '#4b483e', label = '' } = {}) {
  const r = 38, c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${esc(label)}">
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="rgba(75,72,62,.15)" stroke-width="12"/>
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="${color}" stroke-width="12" stroke-dasharray="${c * v} ${c}" transform="rotate(-90 50 50)"/>
    <text x="50" y="56" text-anchor="middle" style="font-family:'Share Tech Mono',monospace;font-size:20px;fill:#4b483e">${Math.round(v * 100)}%</text>
  </svg>`;
}

export { esc, NS };
