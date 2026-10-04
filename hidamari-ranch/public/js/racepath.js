// ひだまり牧場 — 競馬場のコースの形(3D と 2D のレース画面で共通)
// 単位はメートル。直線2本 + 半円2つの「陸上トラック」の形です。

export const STRAIGHT = 300;
export const L = 1800; // 1周の長さ
export const R = (L - 2 * STRAIGHT) / (2 * Math.PI);
export const FINISH_U = 260; // ゴールの位置(ホームストレッチの中)

const mod = (a, n) => ((a % n) + n) % n;

// u: コース上の位置(0〜L)、lane: 内ラチからの距離(m)
export function point(u, lane = 0) {
  u = mod(u, L);
  const r = R + lane;
  const half = STRAIGHT / 2;
  if (u < STRAIGHT) return { x: -half + u, z: r, hx: 1, hz: 0 };
  u -= STRAIGHT;
  const arc = Math.PI * R;
  if (u < arc) { const a = u / R; return { x: half + Math.sin(a) * r, z: Math.cos(a) * r, hx: Math.cos(a), hz: -Math.sin(a) }; }
  u -= arc;
  if (u < STRAIGHT) return { x: half - u, z: -r, hx: -1, hz: 0 };
  u -= STRAIGHT;
  const a = u / R;
  return { x: -half - Math.sin(a) * r, z: -Math.cos(a) * r, hx: -Math.cos(a), hz: Math.sin(a) };
}
export const startU = (dist) => mod(FINISH_U - dist, L);
export const uAt = (dist, d) => startU(dist) + d;

// 馬どうしが重ならないように、走る位置(内からの距離)を決める
export function makeLaner(n) {
  const lanes = Array.from({ length: n }, (_, i) => 1.5 + i * 1.3);
  return function update(dists, smooth = 0.08) {
    const order = dists.map((d, i) => [d, i]).sort((a, b) => b[0] - a[0]);
    const placed = [];
    for (const [d, i] of order) {
      let k = 0;
      // 前の馬と近すぎない、いちばん内側の位置
      for (; k < 14; k++) {
        const lane = 1.5 + k * 1.4;
        if (!placed.some((p) => Math.abs(p.lane - lane) < 1.2 && p.d - d < 3.2 && p.d - d > -1.5)) break;
      }
      const want = 1.5 + k * 1.4;
      lanes[i] += (want - lanes[i]) * smooth;
      placed.push({ d, lane: want });
    }
    return lanes;
  };
}
