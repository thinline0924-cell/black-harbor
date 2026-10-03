// BLACK HARBOR — 3D の盤(Three.js)
// 港(左)から街(右)へ、4本の密輸ルートが伸びるジオラマ。
// 自分のトラック(駒)はマウスや指でつかんで、ルートの出発地点に運べます。

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ROUTES, OPS } from './engine.js';

const ROUTE_STYLE = {
  sea: { z: -10.5, color: 0x8fa3a0, label: '#3f5c58', y: 0.06 },
  old: { z: -3.5, color: 0xa39c84, label: '#4b483e', y: 0.06 },
  hwy: { z: 3.5, color: 0x5d5a52, label: '#4b483e', y: 1.4 },
  under: { z: 10.5, color: 0x3a3833, label: '#2a2824', y: -0.25 },
};
const PARK_X = -20;

export function createBoard(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcdc8b0);
  scene.fog = new THREE.Fog(0xcdc8b0, 60, 120);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 300);
  camera.position.set(-4, 44, 44);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = 1.22;
  controls.minDistance = 14;
  controls.maxDistance = 80;
  controls.screenSpacePanning = false;

  scene.add(new THREE.HemisphereLight(0xf2eedc, 0x6d6858, 1.6));
  const sun = new THREE.DirectionalLight(0xfff6e0, 2.2);
  sun.position.set(-18, 30, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 24, bottom: -24, near: 1, far: 90 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.02, ...extra });
  const box = (w, h, d, m, x, y, z, parent = scene) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // ---- 地面と海 ----
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(70, 46), mat(0xbab5a0));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  // 盤のふち(テーブルの上のボードらしく)
  const rim = mat(0x4e4b42);
  box(70.6, 1.2, 0.6, rim, 0, -0.5, 23.3);
  box(70.6, 1.2, 0.6, rim, 0, -0.5, -23.3);
  box(0.6, 1.2, 46, rim, 35.3, -0.5, 0);
  box(0.6, 1.2, 46, rim, -35.3, -0.5, 0);

  const waterMat = new THREE.MeshStandardMaterial({ color: 0x8c9894, roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.95 });
  const water1 = new THREE.Mesh(new THREE.PlaneGeometry(13, 46), waterMat);
  water1.rotation.x = -Math.PI / 2;
  water1.position.set(-28.5, 0.03, 0);
  scene.add(water1);
  const water2 = new THREE.Mesh(new THREE.PlaneGeometry(36, 9), waterMat);
  water2.rotation.x = -Math.PI / 2;
  water2.position.set(-4, 0.03, -14.5);
  scene.add(water2);
  // 波の線
  const waveMat = new THREE.LineBasicMaterial({ color: 0xc9cfc6, transparent: true, opacity: 0.6 });
  const waves = new THREE.Group();
  for (let i = 0; i < 26; i++) {
    const x = -34 + Math.random() * 10 + (i % 2 ? 0 : 0);
    const z = -21 + Math.random() * 42;
    const pts = [new THREE.Vector3(x, 0.05, z), new THREE.Vector3(x + 1.6, 0.05, z)];
    waves.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), waveMat));
  }
  for (let i = 0; i < 18; i++) {
    const x = -20 + Math.random() * 30, z = -18 + Math.random() * 7;
    waves.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0.05, z), new THREE.Vector3(x + 1.4, 0.05, z)]), waveMat));
  }
  scene.add(waves);

  // ---- 港(左):桟橋、クレーン、コンテナ ----
  const dock = mat(0x9b9580);
  box(4, 0.5, 40, dock, -22.5, 0.2, 0);
  box(9, 0.3, 30, mat(0xa8a28c), -18, 0.12, 0);
  const contColors = [0x8a6b5c, 0x6d7a78, 0x9a8a5f, 0x7a6f66, 0x5f6a5c];
  for (let i = 0; i < 16; i++) {
    const c = mat(contColors[i % contColors.length]);
    const stack = 1 + (i % 3);
    for (let k = 0; k < stack; k++) box(2.6, 1.1, 1.1, c, -24.5 + (i % 2) * 0.1, 0.95 + k * 1.12, -16 + i * 2.1 + (k % 2) * 0.1);
  }
  const crane = mat(0x6e6a5d);
  for (const z of [-12, 4]) {
    box(0.4, 9, 0.4, crane, -26.5, 4.5, z - 1.2);
    box(0.4, 9, 0.4, crane, -26.5, 4.5, z + 1.2);
    box(9, 0.5, 0.5, crane, -24, 9, z);
    box(0.08, 4, 0.08, mat(0x333333), -21, 7, z);
  }
  // 駐車場の線
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xe2ddc8 });
  for (let i = 0; i < 5; i++) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.12), lineMat);
    l.rotation.x = -Math.PI / 2;
    l.position.set(PARK_X, 0.29, -7.5 + i * 3.6);
    scene.add(l);
  }
  scene.add(textSprite('HARBOR', { size: 0.9, color: '#4b483e', pos: [-20, 0.4, -10.5], flat: true }));

  // ---- 街(右):ビル ----
  const bmats = [mat(0xa6a18c), mat(0x948f7b), mat(0xb3ae98), mat(0x87826f)];
  const winMat = new THREE.MeshStandardMaterial({ color: 0x5b584d, emissive: 0x2a2820, roughness: 0.6 });
  for (let gx = 0; gx < 4; gx++) {
    for (let gz = 0; gz < 9; gz++) {
      const h = 2 + ((gx * 7 + gz * 13) % 9) * 0.9 + (gx === 1 ? 2 : 0);
      const x = 19 + gx * 3.6, z = -18 + gz * 4.5;
      const b = box(2.8, h, 3.2, bmats[(gx + gz) % 4], x, h / 2, z);
      if (h > 4) box(2.85, 0.25, 3.25, winMat, x, h * 0.7, z);
      b.userData.city = true;
    }
  }
  scene.add(textSprite('CITY', { size: 0.9, color: '#4b483e', pos: [16, 0.4, -19], flat: true }));

  // ---- ルート ----
  const routes = {};
  for (const r of ROUTES) routes[r.id] = buildRoute(r);

  function buildRoute(r) {
    const st = ROUTE_STYLE[r.id];
    const z = st.z;
    const y = st.y;
    const bend = { sea: -2.2, old: 1.4, hwy: -1.2, under: 1.8 }[r.id];
    const pts = [
      new THREE.Vector3(-14, 0.3, z * 0.55),
      new THREE.Vector3(-9, y, z),
      new THREE.Vector3(-3, y, z + bend),
      new THREE.Vector3(3, y, z - bend * 0.5),
      new THREE.Vector3(9, y, z),
      new THREE.Vector3(15.5, 0.3, z * 0.8),
    ];
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4);
    const group = new THREE.Group();
    scene.add(group);
    // 道(リボン)
    const ribbon = ribbonGeometry(curve, r.id === 'hwy' ? 2.6 : 2.2, 120);
    const roadMat = new THREE.MeshStandardMaterial({ color: st.color, roughness: r.id === 'sea' ? 0.3 : 0.95, transparent: r.id === 'sea', opacity: r.id === 'sea' ? 0.75 : 1 });
    const road = new THREE.Mesh(ribbon, roadMat);
    road.receiveShadow = true;
    road.position.y = 0.02;
    road.userData.route = r.id;
    group.add(road);
    // 中央の破線
    for (let i = 2; i < 58; i += 3) {
      const a = curve.getPointAt(i / 60), b = curve.getPointAt((i + 1.2) / 60);
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, a.distanceTo(b)), lineMat);
      dash.position.copy(a).lerp(b, 0.5).add(new THREE.Vector3(0, 0.06, 0));
      dash.lookAt(b.x, dash.position.y, b.z);
      group.add(dash);
    }
    // ルートごとの飾り
    if (r.id === 'hwy') {
      for (let i = 1; i < 12; i++) {
        const p = curve.getPointAt(i / 12);
        if (p.y < 0.8) continue;
        box(0.5, p.y, 0.5, mat(0x8f8a76), p.x, p.y / 2, p.z, group);
        const t = curve.getTangentAt(i / 12);
        const side = new THREE.Vector3(-t.z, 0, t.x).normalize().multiplyScalar(1.35);
        box(0.12, 0.35, 0.12, mat(0x6e6a5d), p.x + side.x, p.y + 0.2, p.z + side.z, group);
        box(0.12, 0.35, 0.12, mat(0x6e6a5d), p.x - side.x, p.y + 0.2, p.z - side.z, group);
      }
    } else if (r.id === 'old') {
      for (let i = 1; i < 14; i++) {
        const p = curve.getPointAt(i / 14);
        const t = curve.getTangentAt(i / 14);
        const side = new THREE.Vector3(-t.z, 0, t.x).normalize();
        const s = i % 2 ? 2.3 : -2.3;
        const h = 0.8 + (i % 3) * 0.5;
        const house = box(1.4, h, 1.4, bmats[i % 4], p.x + side.x * s, h / 2, p.z + side.z * s, group);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.7, 4), mat(0x7d5f52));
        roof.position.set(house.position.x, h + 0.35, house.position.z);
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        group.add(roof);
      }
    } else if (r.id === 'under') {
      for (let i = 1; i < 10; i++) {
        const p = curve.getPointAt(i / 10);
        const t = curve.getTangentAt(i / 10);
        const arch = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.22, 6, 14, Math.PI), mat(0x5a574e));
        arch.position.set(p.x, p.y, p.z);
        arch.rotation.y = Math.atan2(t.x, t.z) + Math.PI / 2;
        arch.castShadow = true;
        group.add(arch);
      }
      const pit = new THREE.Mesh(ribbonGeometry(curve, 3.4, 80), mat(0x7d786a));
      pit.position.y = -0.01;
      group.add(pit);
    } else if (r.id === 'sea') {
      for (let i = 1; i < 9; i++) {
        const p = curve.getPointAt(i / 9);
        const buoy = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.6, 8), mat(i % 2 ? 0xb2523f : 0xe2ddc8));
        const t = curve.getTangentAt(i / 9);
        const side = new THREE.Vector3(-t.z, 0, t.x).normalize().multiplyScalar(i % 2 ? 1.6 : -1.6);
        buoy.position.set(p.x + side.x, 0.3, p.z + side.z);
        group.add(buoy);
      }
    }
    // 出発地点(ここにトラックを置くとルート決定)
    const start = curve.getPointAt(0.04);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.12, 6), new THREE.MeshStandardMaterial({ color: 0xe2ddc8, emissive: 0x000000, roughness: 0.8 }));
    pad.position.set(start.x, 0.36, start.z);
    pad.receiveShadow = true;
    pad.userData.route = r.id;
    group.add(pad);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.7, 1.95, 6), new THREE.MeshBasicMaterial({ color: 0x4e4b42, transparent: true, opacity: 0.0, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(start.x, 0.45, start.z);
    group.add(ring);
    // 検問所(真ん中)
    const cpT = 0.5;
    const cp = curve.getPointAt(cpT);
    const ct = curve.getTangentAt(cpT);
    const side = new THREE.Vector3(-ct.z, 0, ct.x).normalize();
    const gate = new THREE.Group();
    gate.position.copy(cp);
    gate.rotation.y = Math.atan2(side.x, side.z);
    group.add(gate);
    const post = mat(0x4e4b42);
    box(0.3, 2.4, 0.3, post, 0, 1.2, 1.6, gate);
    box(0.3, 2.4, 0.3, post, 0, 1.2, -1.6, gate);
    const barTex = stripeTexture();
    box(0.18, 0.22, 3.3, new THREE.MeshStandardMaterial({ map: barTex }), 0, 2.2, 0, gate);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), new THREE.MeshStandardMaterial({ color: 0xd9d4bf, emissive: 0x000000 }));
    lamp.position.set(0, 2.65, 1.6);
    gate.add(lamp);
    const booth = box(1.2, 1.3, 1.2, mat(0xd6d1bb), 0, 0.65, 2.7, gate);
    booth.userData.booth = true;
    // 名札
    const label = textSprite(`${r.name}`, { size: 1.3, color: st.label, box: true, sub: `上限 ${r.limit}${r.fineMul > 1 ? ' ・罰金×2' : ''}` });
    label.position.set(cp.x + side.x * 3.6, cp.y + 4.2, cp.z + side.z * 3.6);
    group.add(label);
    const limitTag = textSprite(String(r.limit), { size: 1.3, color: '#b2523f', box: true });
    limitTag.position.set(start.x - 0.2, 2.4, start.z);
    group.add(limitTag);
    return { r, curve, group, pad, ring, lamp, gate, cp, side, start, road, cards: [] };
  }

  // ---- 駒(トラック) ----
  const trucks = new Map(); // pid -> { group, body, color, label }
  function makeTruck(color, name) {
    const g = new THREE.Group();
    const bodyMat = mat(color, { roughness: 0.6 });
    const cab = box(1.0, 0.85, 1.05, mat(0xd6d1bb, { roughness: 0.5 }), 0.85, 0.65, 0, g);
    const cargo = box(1.9, 1.15, 1.15, bodyMat, -0.6, 0.8, 0, g);
    box(0.06, 0.4, 0.9, mat(0x333028), 1.36, 0.8, 0, g);
    const wm = mat(0x2b2925);
    for (const [x, z] of [[0.9, 0.55], [0.9, -0.55], [-0.9, 0.55], [-0.9, -0.55], [-0.3, 0.55], [-0.3, -0.55]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.18, 12), wm);
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.24, z);
      w.castShadow = true;
      g.add(w);
    }
    const label = textSprite(name, { size: 0.75, color: '#4b483e', box: true });
    label.position.set(0, 2.2, 0);
    g.add(label);
    // つかみやすいように、見えない大きめの当たり判定を付ける
    const grip = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 2.6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    grip.position.set(0, 1.2, 0);
    g.add(grip);
    g.traverse((o) => (o.userData.truck = g));
    g.userData.cargoMesh = cargo;
    g.userData.cab = cab;
    g.userData.baseColor = new THREE.Color(color);
    g.scale.setScalar(1.05);
    scene.add(g);
    return g;
  }

  function setPlayers(players, you) {
    for (const t of trucks.values()) scene.remove(t);
    trucks.clear();
    players.forEach((p) => {
      const t = makeTruck(new THREE.Color(p.color), p.id === you ? `${p.name}(あなた)` : p.name);
      t.userData.pid = p.id;
      trucks.set(p.id, t);
    });
    state.you = you;
    placeDefault();
  }

  function parkPos(pid) {
    return new THREE.Vector3(PARK_X, 0.3, -9.3 + pid * 3.6);
  }

  function placeDefault() {
    for (const [pid, t] of trucks) {
      t.position.copy(parkPos(pid));
      t.userData.baseY = t.position.y;
      t.rotation.set(0, 0, 0);
      setTint(t, null);
    }
  }

  function setTint(t, color) {
    const m = t.userData.cargoMesh.material;
    m.color.copy(color ? new THREE.Color(color) : t.userData.baseColor);
    m.emissive = new THREE.Color(color ? 0x330000 : 0x000000);
    t.visible = true;
  }

  // positions: { pid: { route, at: 'park'|'start'|'goal'|'bust', hidden } }
  function layout(positions) {
    const perRoute = {};
    for (const [pid, t] of trucks) {
      if (t === drag.truck) continue;
      const pos = positions[pid] || { at: 'park' };
      setTint(t, pos.at === 'bust' ? '#5a2a22' : null);
      if (!pos.route || pos.at === 'park') {
        t.position.copy(parkPos(pid));
        t.userData.baseY = t.position.y;
        t.rotation.set(0, 0, 0);
        continue;
      }
      const rt = routes[pos.route];
      const k = (perRoute[pos.route] = (perRoute[pos.route] || 0) + 1) - 1;
      const tt = pos.at === 'goal' ? 0.985 : pos.at === 'bust' ? 0.45 : 0.04;
      placeOnCurve(t, rt, Math.max(0, tt - k * 0.035), k);
    }
  }

  function placeOnCurve(t, rt, u, lane = 0) {
    const p = rt.curve.getPointAt(Math.min(1, Math.max(0, u)));
    const tan = rt.curve.getTangentAt(Math.min(1, Math.max(0, u)));
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize().multiplyScalar(lane % 2 ? 0.6 : lane ? -0.6 : 0);
    t.position.set(p.x + side.x, p.y + 0.12, p.z + side.z);
    t.userData.baseY = t.position.y;
    t.rotation.set(0, Math.atan2(-tan.z, tan.x), 0);
  }

  // ---- 工作カード(盤の上の小さなカード) ----
  const cardBackTex = cardTexture(null);
  const cardTexCache = {};
  function setOpsCards(list) {
    for (const rt of Object.values(routes)) {
      for (const c of rt.cards) rt.group.remove(c);
      rt.cards = [];
    }
    const per = {};
    for (const item of list) {
      const rt = routes[item.route];
      if (!rt) continue;
      const k = (per[item.route] = (per[item.route] || 0) + 1) - 1;
      const face = item.card ? (cardTexCache[item.card] ||= cardTexture(item.card)) : cardBackTex;
      const m = [mat(0xd6d1bb), mat(0xd6d1bb), new THREE.MeshStandardMaterial({ map: item.revealed ? face : cardBackTex, roughness: 0.7 }), new THREE.MeshStandardMaterial({ map: face }), mat(0xd6d1bb), mat(0xd6d1bb)];
      const card = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.06, 1.5), m);
      card.castShadow = true;
      const off = rt.side.clone().multiplyScalar(-3.4);
      card.position.set(rt.cp.x + off.x + (k % 3) * 1.25 - 1.25, Math.max(rt.cp.y, 0) + 0.12 + Math.floor(k / 3) * 0.08, rt.cp.z + off.z + Math.floor(k / 3) * 0.6);
      card.rotation.y = rt.gate.rotation.y + Math.PI / 2;
      card.userData = { item, face };
      if (item.owner != null) {
        const edge = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.04, 0.14), new THREE.MeshBasicMaterial({ color: item.ownerColor || 0x4e4b42 }));
        edge.position.set(0, -0.01, 0.78);
        card.add(edge);
      }
      rt.group.add(card);
      rt.cards.push(card);
    }
  }

  async function flipOps(routeId) {
    const rt = routes[routeId];
    await Promise.all(
      rt.cards.map((c, i) =>
        tween(520, (k) => {
          const e = k < 0.5 ? k * 2 : (1 - k) * 2;
          c.position.y = Math.max(rt.cp.y, 0) + 0.12 + e * 1.4;
          c.rotation.z = Math.PI * k;
          if (k > 0.5 && !c.userData.flipped) {
            c.userData.flipped = true;
            c.material[2].map = c.userData.face;
            c.material[2].needsUpdate = true;
          }
        }, i * 120).then(() => (c.rotation.z = 0))
      )
    );
  }

  // ---- サイコロ ----
  const diceGroup = new THREE.Group();
  scene.add(diceGroup);
  const dieTex = {};
  const dieMats = (sides) => {
    const key = sides;
    if (!dieTex[key]) dieTex[key] = [3, 4, 1, 6, 2, 5].map((v) => new THREE.MeshStandardMaterial({ map: dieFaceTexture(v, sides), roughness: 0.4 }));
    return dieTex[key];
  };
  const FACE_NORMAL = { 1: [0, 1, 0], 6: [0, -1, 0], 3: [1, 0, 0], 4: [-1, 0, 0], 2: [0, 0, 1], 5: [0, 0, -1] };
  async function rollDice(values, sides, routeId, labels = []) {
    clearDice();
    const rt = routes[routeId];
    const center = new THREE.Vector3(rt.cp.x, Math.max(rt.cp.y, 0), rt.cp.z).add(rt.side.clone().multiplyScalar(-1.5));
    const dice = values.map((v, i) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), dieMats(sides === 4 ? 4 : 6));
      m.castShadow = true;
      // 値が4面ダイスでも、立方体の目を使う(1〜4しか出ない)
      const n = new THREE.Vector3(...FACE_NORMAL[v]);
      const q = new THREE.Quaternion().setFromUnitVectors(n, new THREE.Vector3(0, 1, 0));
      q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2));
      m.userData = { final: q, spin: new THREE.Vector3(Math.random() * 14 - 7, Math.random() * 14 - 7, Math.random() * 14 - 7) };
      const off = (i - (values.length - 1) / 2) * 1.7;
      m.userData.end = center.clone().add(new THREE.Vector3(off, 0.56, 0));
      m.userData.from = m.userData.end.clone().add(new THREE.Vector3(-3 + Math.random(), 7, 2 - Math.random()));
      m.position.copy(m.userData.from);
      diceGroup.add(m);
      if (labels[i]) {
        const s = textSprite(labels[i], { size: 0.45, color: '#4b483e', box: true });
        s.position.set(0, 1.2, 0);
        m.add(s);
      }
      return m;
    });
    await Promise.all(
      dice.map((d, i) =>
        tween(1100, (k) => {
          const e = 1 - (1 - k) ** 2;
          d.position.lerpVectors(d.userData.from, d.userData.end, e);
          d.position.y = d.userData.end.y + Math.abs(Math.cos(k * Math.PI * 2.5)) * (1 - k) * 4 * (k > 0.3 ? 1 : 0) + (1 - e) * 7 * (k <= 0.3 ? 1 : 0);
          if (k < 0.8) {
            const sp = d.userData.spin.clone().multiplyScalar(0.016 * (1 - k));
            d.rotation.x += sp.x; d.rotation.y += sp.y; d.rotation.z += sp.z;
          } else {
            d.quaternion.slerp(d.userData.final, (k - 0.8) / 0.2);
          }
        }, i * 140).then(() => d.quaternion.copy(d.userData.final))
      )
    );
  }
  function clearDice() {
    while (diceGroup.children.length) diceGroup.remove(diceGroup.children[0]);
  }

  // ---- 演出 ----
  const fx = [];
  function coins(pos, n = 18, color = 0xc9a64a) {
    const m = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.3, emissive: 0x2a2208 });
    for (let i = 0; i < n; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 10), m);
      c.position.copy(pos).add(new THREE.Vector3(0, 1.4, 0));
      c.userData.v = new THREE.Vector3(Math.random() * 4 - 2, 5 + Math.random() * 4, Math.random() * 4 - 2);
      c.userData.life = 1.4;
      scene.add(c);
      fx.push(c);
    }
  }
  let siren = null;
  function police(routeId, on) {
    const rt = routes[routeId];
    if (siren) {
      scene.remove(siren.red, siren.blue);
      siren.lamp.material.emissive.set(0x000000);
      siren = null;
    }
    if (!on) return;
    const red = new THREE.PointLight(0xff3020, 0, 12);
    const blue = new THREE.PointLight(0x2050ff, 0, 12);
    red.position.copy(rt.cp).add(new THREE.Vector3(0, 3, 0)).add(rt.side.clone().multiplyScalar(1.5));
    blue.position.copy(rt.cp).add(new THREE.Vector3(0, 3, 0)).add(rt.side.clone().multiplyScalar(-1.5));
    scene.add(red, blue);
    siren = { red, blue, lamp: rt.lamp, t: 0 };
  }
  function lampColor(routeId, color) {
    routes[routeId].lamp.material.emissive.set(color);
  }

  async function drive(pid, routeId, u0, u1, ms) {
    const t = trucks.get(pid);
    const rt = routes[routeId];
    await tween(ms, (k) => {
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      placeOnCurve(t, rt, u0 + (u1 - u0) * e);
    });
  }

  async function shake(pid) {
    const t = trucks.get(pid);
    const base = t.position.clone();
    setTint(t, '#5a2a22');
    await tween(600, (k) => {
      t.position.x = base.x + Math.sin(k * 40) * 0.15 * (1 - k);
      t.rotation.z = Math.sin(k * 30) * 0.08 * (1 - k);
    });
    t.position.copy(base);
    t.rotation.z = 0;
  }

  function truckPos(pid) {
    return trucks.get(pid).position.clone();
  }

  // カメラを見たい場所へ
  let camGoal = null;
  function focus(target, dist = null) {
    if (!target) {
      camGoal = { target: new THREE.Vector3(0, 0, 0), pos: new THREE.Vector3(-4, 44, 44) };
      return;
    }
    const tgt = typeof target === 'string' ? routes[target].cp.clone() : target.clone();
    const dir = camera.position.clone().sub(controls.target).normalize();
    camGoal = { target: tgt, pos: tgt.clone().add(dir.multiplyScalar(dist || 26)) };
  }

  // ---- つかんで運ぶ ----
  const state = { you: null, draggable: null };
  const drag = { truck: null, hoverRoute: null, moved: false, downAt: null };
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.2);
  const api = { onRouteDrop: null, onPadClick: null };

  function pick(ev) {
    const rect = renderer.domElement.getBoundingClientRect();
    ptr.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
  }
  function nearestPad(p) {
    let best = null, bd = 3.6;
    for (const rt of Object.values(routes)) {
      const d = Math.hypot(rt.pad.position.x - p.x, rt.pad.position.z - p.z);
      if (d < bd) { bd = d; best = rt.r.id; }
    }
    return best;
  }
  function highlight(routeId) {
    for (const rt of Object.values(routes)) {
      const on = rt.r.id === routeId;
      rt.ring.material.opacity = on ? 0.9 : state.draggable != null ? 0.25 : 0;
      rt.pad.material.emissive.set(on ? 0x3a3628 : 0x000000);
    }
  }
  const el = renderer.domElement;
  const routeTargets = () => Object.values(routes).flatMap((r) => [r.pad, r.road]);
  // capture(先回り)で受けて、トラックをつかんだときはカメラの回転に渡さない
  el.addEventListener(
    'pointerdown',
    (ev) => {
      if (state.draggable == null) return;
      pick(ev);
      const t = trucks.get(state.draggable);
      const hit = ray.intersectObject(t, true)[0];
      if (hit) {
        ev.stopImmediatePropagation();
        ev.preventDefault();
        drag.truck = t;
        drag.moved = false;
        controls.enabled = false;
        try { el.setPointerCapture(ev.pointerId); } catch { /* 古いブラウザ */ }
        el.style.cursor = 'grabbing';
        api.onGrab?.();
        return;
      }
      drag.downAt = [ev.clientX, ev.clientY];
    },
    { capture: true }
  );
  el.addEventListener('pointermove', (ev) => {
    pick(ev);
    if (drag.truck) {
      const p = new THREE.Vector3();
      if (ray.ray.intersectPlane(dragPlane, p)) {
        drag.moved = true;
        drag.truck.position.set(p.x, 1.2, p.z);
        drag.hoverRoute = nearestPad(p);
        highlight(drag.hoverRoute);
      }
      return;
    }
    if (state.draggable != null) {
      const t = trucks.get(state.draggable);
      const hit = ray.intersectObject(t, true)[0];
      const pad = ray.intersectObjects(routeTargets())[0];
      el.style.cursor = hit ? 'grab' : pad ? 'pointer' : '';
    }
  });
  el.addEventListener('pointerup', (ev) => {
    if (drag.truck) {
      const route = drag.moved ? drag.hoverRoute : null;
      drag.truck = null;
      controls.enabled = true;
      el.style.cursor = '';
      highlight(null);
      api.onRouteDrop?.(route, drag.moved);
      return;
    }
    if (state.draggable != null && drag.downAt && Math.hypot(ev.clientX - drag.downAt[0], ev.clientY - drag.downAt[1]) < 6) {
      pick(ev);
      const pad = ray.intersectObjects(routeTargets())[0];
      if (pad) api.onRouteDrop?.(pad.object.userData.route, true);
    }
    drag.downAt = null;
  });

  // 3D の位置を画面の座標に直す(案内の矢印やテストに使う)
  function screenPos(pid) {
    const t = trucks.get(pid);
    if (!t) return null;
    const v = t.position.clone().add(new THREE.Vector3(0, 0.8, 0)).project(camera);
    const rect = el.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }
  function padScreenPos(routeId) {
    const v = routes[routeId].pad.position.clone().project(camera);
    const rect = el.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }

  function setDraggable(pid) {
    if (state.draggable != null && pid == null) {
      const t = trucks.get(state.draggable);
      if (t && t.userData.baseY != null) t.position.y = t.userData.baseY;
    }
    state.draggable = pid;
    highlight(null);
  }

  // ---- 動かす(毎フレーム) ----
  const tweens = [];
  function tween(ms, fn, delay = 0) {
    return new Promise((resolve) => tweens.push({ start: performance.now() + delay, ms, fn, resolve }));
  }
  let last = performance.now();
  let running = true;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      if (now < tw.start) continue;
      const k = Math.min(1, (now - tw.start) / tw.ms);
      tw.fn(k);
      if (k >= 1) { tweens.splice(i, 1); tw.resolve(); }
    }
    for (let i = fx.length - 1; i >= 0; i--) {
      const c = fx[i];
      c.userData.v.y -= 12 * dt;
      c.position.addScaledVector(c.userData.v, dt);
      c.rotation.x += dt * 8;
      c.userData.life -= dt;
      if (c.userData.life <= 0 || c.position.y < -1) { scene.remove(c); fx.splice(i, 1); }
    }
    if (siren) {
      siren.t += dt;
      const a = Math.sin(siren.t * 14) > 0;
      siren.red.intensity = a ? 60 : 0;
      siren.blue.intensity = a ? 0 : 60;
      siren.lamp.material.emissive.set(a ? 0xff2010 : 0x1030ff);
    }
    // 自分のトラックがつかめる時は、ゆっくり上下させて目立たせる
    if (state.draggable != null && !drag.truck) {
      const t = trucks.get(state.draggable);
      if (t) t.position.y = (t.userData.baseY ?? 0.3) + Math.abs(Math.sin(now / 330)) * 0.3;
    }
    waves.position.x = Math.sin(now / 1800) * 0.3;
    if (camGoal) {
      controls.target.lerp(camGoal.target, 0.06);
      camera.position.lerp(camGoal.pos, 0.06);
      if (camera.position.distanceTo(camGoal.pos) < 0.05) camGoal = null;
    }
    controls.update();
    renderer.render(scene, camera);
    if (running) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function resize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  return Object.assign(api, {
    setPlayers,
    layout,
    setDraggable,
    highlight,
    setOpsCards,
    flipOps,
    rollDice,
    clearDice,
    coins,
    police,
    lampColor,
    drive,
    shake,
    truckPos,
    screenPos,
    padScreenPos,
    focus,
    tween,
    routes,
  });
}

// ---- 形と絵の道具 ----
function ribbonGeometry(curve, width, segments) {
  const pos = [];
  const idx = [];
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const s = new THREE.Vector3(-t.z, 0, t.x).normalize().multiplyScalar(width / 2);
    pos.push(p.x + s.x, p.y, p.z + s.z, p.x - s.x, p.y, p.z - s.z);
    if (i < segments) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // 法線が下を向いていたら上向きにする
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) if (n.getY(i) < 0) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return g;
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function textSprite(text, { size = 1, color = '#4b483e', sub = '', box = false, pos = null, flat = false } = {}) {
  const font = '"Noto Sans JP", "Hiragino Sans", sans-serif';
  const meas = document.createElement('canvas').getContext('2d');
  meas.font = `500 64px ${font}`;
  const w1 = meas.measureText(text).width;
  meas.font = `400 40px ${font}`;
  const w2 = sub ? meas.measureText(sub).width : 0;
  const W = Math.ceil(Math.max(w1, w2) + 60);
  const H = sub ? 140 : 96;
  const tex = canvasTex(W, H, (g) => {
    if (box) {
      g.fillStyle = 'rgba(218,213,194,0.92)';
      g.fillRect(0, 0, W, H);
      g.fillStyle = color;
      g.fillRect(0, 0, 8, H);
    }
    g.fillStyle = color;
    g.font = `500 64px ${font}`;
    g.textBaseline = 'middle';
    g.fillText(text, 30, sub ? 46 : H / 2 + 2);
    if (sub) {
      g.font = `400 40px ${font}`;
      g.fillText(sub, 30, 108);
    }
  });
  const aspect = W / H;
  if (flat) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size * aspect * 1.6, size * 1.6), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    m.rotation.x = -Math.PI / 2;
    if (pos) m.position.set(...pos);
    return m;
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  s.renderOrder = 10;
  s.scale.set(size * aspect, size, 1);
  if (pos) s.position.set(...pos);
  return s;
}

function stripeTexture() {
  const t = canvasTex(64, 16, (g) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#d9d4bf' : '#b2523f';
      g.fillRect(i * 8, 0, 8, 16);
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

const GLYPH = { tip: '密', safe: '賄', crack: '激', fake: '虚', decoy: '囮' };
function cardTexture(card) {
  return canvasTex(128, 184, (g, w, h) => {
    g.fillStyle = card ? '#d9d4bf' : '#4e4b42';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = card ? '#4e4b42' : '#d9d4bf';
    g.lineWidth = 6;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = card ? '#4e4b42' : '#d9d4bf';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (!card) {
      g.font = '700 64px "Noto Sans JP", sans-serif';
      g.fillText('?', w / 2, h / 2);
      return;
    }
    g.font = '700 58px "Noto Sans JP", sans-serif';
    g.fillText(GLYPH[card] || '?', w / 2, 70);
    g.font = '500 20px "Noto Sans JP", sans-serif';
    g.fillText(OPS[card]?.name || '', w / 2, 128);
    g.font = '700 26px "Share Tech Mono", monospace';
    g.fillText(OPS[card]?.sign || '', w / 2, 158);
  });
}

function dieFaceTexture(v, sides) {
  return canvasTex(128, 128, (g, w) => {
    g.fillStyle = '#e6e2d0';
    g.fillRect(0, 0, w, w);
    g.strokeStyle = '#4e4b42';
    g.lineWidth = 6;
    g.strokeRect(3, 3, w - 6, w - 6);
    if (sides === 4 && v > 4) {
      g.fillStyle = '#b8b39d';
      g.fillRect(14, 14, w - 28, w - 28);
      return;
    }
    const pip = (x, y) => {
      g.beginPath();
      g.arc(x * w, y * w, 11, 0, Math.PI * 2);
      g.fill();
    };
    g.fillStyle = v === 1 ? '#b2523f' : '#4e4b42';
    const L = 0.27, M = 0.5, R = 0.73;
    const map = { 1: [[M, M]], 2: [[L, L], [R, R]], 3: [[L, L], [M, M], [R, R]], 4: [[L, L], [R, L], [L, R], [R, R]], 5: [[L, L], [R, L], [M, M], [L, R], [R, R]], 6: [[L, L], [R, L], [L, M], [R, M], [L, R], [R, R]] };
    for (const [x, y] of map[v]) pip(x, y);
  });
}
