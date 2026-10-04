// ひだまり牧場 — 3D の部品(ローポリの馬・木・建物など)
// 箱や円すいを組み合わせて作ります(外部のモデルファイルは使いません)。

import * as THREE from 'three';
import { COATS } from './data.js?v=5';

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, flatShading: true, ...opts }));
  return matCache.get(key);
}
export function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// 馬(+x の方向を向いている。長さ約2.2)
export function makeHorse({ coat = 'kage', blaze = false, socks = 0, jockey = null, scale = 1 } = {}) {
  const c = COATS[coat] || COATS.kage;
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  body.add(box(1.25, 0.62, 0.58, c.body, 0, 1.28, 0));
  body.add(box(0.5, 0.66, 0.6, c.body, 0.55, 1.3, 0)); // 胸
  body.add(box(0.5, 0.64, 0.62, c.body, -0.58, 1.32, 0)); // おしり
  // 首と頭
  const neck = new THREE.Group();
  neck.position.set(0.72, 1.45, 0);
  neck.add(box(0.34, 0.85, 0.32, c.body, 0.12, 0.33, 0));
  neck.children[0].rotation.z = -0.55;
  const mane = box(0.12, 0.8, 0.14, c.mane, -0.05, 0.42, 0);
  mane.rotation.z = -0.55;
  neck.add(mane);
  const head = new THREE.Group();
  head.position.set(0.42, 0.72, 0);
  head.add(box(0.62, 0.28, 0.28, c.body, 0.2, -0.05, 0));
  head.children[0].rotation.z = -0.45;
  head.add(box(0.2, 0.2, 0.24, shadeHex(c.body, -0.2), 0.47, -0.2, 0));
  if (blaze) { const b = box(0.4, 0.05, 0.1, '#f6f1e8', 0.24, 0.05, 0); b.rotation.z = -0.45; head.add(b); }
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 4), mat(c.body));
    ear.position.set(-0.04, 0.17, s * 0.08);
    ear.castShadow = true;
    head.add(ear);
    const eye = box(0.05, 0.05, 0.02, '#1d1714', 0.12, 0.02, s * 0.145);
    eye.castShadow = false;
    head.add(eye);
  }
  neck.add(head);
  body.add(neck);
  // しっぽ
  const tail = new THREE.Group();
  tail.position.set(-0.85, 1.48, 0);
  const tb = box(0.12, 0.62, 0.14, c.mane, -0.08, -0.28, 0);
  tb.rotation.z = -0.35;
  tail.add(tb);
  body.add(tail);
  // 脚(つけ根で回す)
  const legs = [];
  const legPos = [[0.55, 0.17], [0.55, -0.17], [-0.58, 0.17], [-0.58, -0.17]];
  legPos.forEach(([x, z], i) => {
    const leg = new THREE.Group();
    leg.position.set(x, 1.05, z);
    const white = socks > i;
    leg.add(box(0.17, 0.5, 0.17, c.body, 0, -0.22, 0));
    leg.add(box(0.12, 0.42, 0.12, white ? '#f2ede3' : shadeHex(c.body, -0.08), 0, -0.66, 0));
    leg.add(box(0.15, 0.1, 0.15, '#3a2c22', 0, -0.9, 0));
    g.add(leg);
    legs.push(leg);
  });
  // 騎手
  let rider = null;
  if (jockey) {
    rider = new THREE.Group();
    rider.position.set(0.15, 1.72, 0);
    rider.add(box(0.36, 0.34, 0.34, jockey.silk, 0, 0.18, 0));
    rider.children[0].rotation.z = -0.5;
    rider.add(box(0.14, 0.16, 0.36, jockey.silk2 || '#ffffff', 0.05, 0.18, 0));
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 4), mat(jockey.cap || jockey.silk));
    helm.position.set(0.22, 0.45, 0);
    helm.castShadow = true;
    rider.add(helm);
    rider.add(box(0.3, 0.1, 0.1, '#f4efe6', -0.05, -0.02, 0.2));
    rider.add(box(0.3, 0.1, 0.1, '#f4efe6', -0.05, -0.02, -0.2));
    body.add(rider);
  }
  g.scale.setScalar(scale);
  g.userData = { legs, tail, neck, body, rider, phase: Math.random() * 10 };
  return g;
}

// 歩く・走るアニメーション。speed: 0=止まる 1=歩く 3=全力
export function animateHorse(g, t, speed) {
  const u = g.userData;
  const f = speed < 0.05 ? 0 : speed < 1.5 ? 6 : 11;
  const amp = speed < 0.05 ? 0 : speed < 1.5 ? 0.35 : 0.75;
  const ph = [0, 0.5, 0.35, 0.85];
  u.legs.forEach((leg, i) => { leg.rotation.z = Math.sin((t + u.phase) * f + ph[i] * Math.PI * 2) * amp; });
  u.body.position.y = speed > 1.5 ? Math.abs(Math.sin((t + u.phase) * f)) * 0.12 : 0;
  u.body.rotation.z = speed > 1.5 ? Math.sin((t + u.phase) * f) * 0.04 : 0;
  // 止まっているときは、ときどき草を食べる
  const graze = speed < 0.05 ? Math.max(0, Math.sin((t + u.phase) * 0.6)) : 0;
  u.neck.rotation.z = speed > 1.5 ? -0.25 + Math.sin((t + u.phase) * f) * 0.08 : -graze * 0.9;
  u.tail.rotation.x = Math.sin((t + u.phase) * 2.2) * 0.25;
  u.tail.rotation.z = speed > 1.5 ? 0.6 : 0;
}

export function shadeHex(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// 木(季節で色が変わる)
export function makeTree(kind = 'round', season = 'summer', s = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 1.4, 5), mat('#7a5638'));
  trunk.position.y = 0.7;
  trunk.castShadow = true;
  g.add(trunk);
  const leaf = {
    spring: kind === 'round' ? (Math.random() < 0.5 ? '#f2b8c6' : '#9cc97a') : '#6fa96a',
    summer: kind === 'round' ? '#78b061' : '#4f8f5a',
    autumn: kind === 'round' ? (Math.random() < 0.5 ? '#e0904a' : '#d7b64a') : '#5d8a55',
    winter: kind === 'round' ? '#d9e3e3' : '#e8eeee',
  }[season];
  if (kind === 'round') {
    const a = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 0), mat(leaf));
    a.position.y = 2.1; a.castShadow = true; g.add(a);
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), mat(shadeHex(leaf, 0.05)));
    b.position.set(0.55, 2.6, 0.2); b.castShadow = true; g.add(b);
  } else {
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.1 - i * 0.28, 1.3, 6), mat(i === 2 && season === 'winter' ? '#ffffff' : leaf));
      cone.position.y = 1.5 + i * 0.75;
      cone.castShadow = true;
      g.add(cone);
    }
  }
  g.scale.setScalar(s);
  g.rotation.y = Math.random() * Math.PI;
  return g;
}

// 三角屋根の建物
export function makeHouse({ w = 4, d = 3, h = 2, wall = '#f3e6cf', roof = '#c4614f', door = '#7a5232', chimney = false } = {}) {
  const g = new THREE.Group();
  g.add(box(w, h, d, wall, 0, h / 2, 0));
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 - 0.3, 0); shape.lineTo(w / 2 + 0.3, 0); shape.lineTo(0, h * 0.75); shape.lineTo(-w / 2 - 0.3, 0);
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: d + 0.5, bevelEnabled: false });
  roofGeo.translate(0, 0, -(d + 0.5) / 2);
  const r = new THREE.Mesh(roofGeo, mat(roof));
  r.position.y = h;
  r.castShadow = true;
  g.add(r);
  g.add(box(0.8, 1.2, 0.08, door, 0, 0.6, d / 2 + 0.02));
  for (const s of [-1, 1]) g.add(box(0.6, 0.55, 0.06, '#a9d1e0', s * w * 0.3, h * 0.6, d / 2 + 0.02));
  if (chimney) g.add(box(0.45, 1.2, 0.45, '#8f6b52', w * 0.25, h + 0.8, -d * 0.15));
  return g;
}

export function makeFence(points, color = '#f4ede0', closed = true) {
  const g = new THREE.Group();
  const n = points.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = points[i], b = points[(i + 1) % n];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.round(len / 1.4));
    for (let k = 0; k < steps; k++) {
      const x = a[0] + (dx * k) / steps, z = a[1] + (dz * k) / steps;
      g.add(box(0.14, 0.8, 0.14, color, x, 0.4, z));
    }
    for (const y of [0.35, 0.65]) {
      const rail = box(len, 0.08, 0.08, color, (a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2);
      rail.rotation.y = -Math.atan2(dz, dx);
      g.add(rail);
    }
  }
  return g;
}
