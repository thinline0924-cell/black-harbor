// ひだまり牧場 — 箱庭の牧場(3D)
// 浮かぶ島のような牧場に、建物・コース・馬たちを置きます。季節で色が変わります。

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeHorse, animateHorse, makeTree, makeHouse, makeFence, box, mat, shadeHex } from './models.js';

const GRASS = { spring: '#a6cf7c', summer: '#8cc46c', autumn: '#c9bf72', winter: '#dfe7da' };
const SKY = { spring: '#cfe6ea', summer: '#bfe0ec', autumn: '#e8dcc8', winter: '#dfe7ec' };

// 場所(地図のラベルと、クリックで開くパネル)
export const PLACES = {
  hill: { pos: [-27, 0, -12], label: 'ひだまりの丘', icon: '🌳' },
  stable: { pos: [-13, 0, -13], label: '厩舎', icon: '🐴' },
  office: { pos: [2, 0, -15], label: '事務所', icon: '📋' },
  house: { pos: [15, 0, -13], label: '母屋', icon: '🏡' },
  breed: { pos: [-22, 0, 14], label: '繁殖場', icon: '🍼' },
  track: { pos: [7, 0, 1.5], label: '調教コース', icon: '🏇' },
  workshop: { pos: [10, 0, 15], label: '工房', icon: '🔨' },
  town: { pos: [28, 0, 12], label: '町', icon: '🛍' },
};
const TRACK = { cx: 7, cz: 1.5, rx: 12.5, rz: 7 };
const PASTURE = { x0: -26, x1: -12, z0: -3, z1: 8 };

export function createRanch(container, { onArea, onHorse, onFrame } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 16 / 9, 1, 400);
  camera.position.set(0, 56, 74);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 1);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 45;
  controls.maxDistance = 130;
  controls.minPolarAngle = 0.45;
  controls.maxPolarAngle = 1.15;
  controls.minAzimuthAngle = -1.1;
  controls.maxAzimuthAngle = 1.1;
  controls.enablePan = false;

  const hemi = new THREE.HemisphereLight('#fff8ea', '#7d9a6a', 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1d6', 2.1);
  sun.position.set(-30, 50, 25);
  sun.castShadow = true;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  const sc = sun.shadow.camera;
  sc.left = -45; sc.right = 45; sc.top = 35; sc.bottom = -35; sc.near = 1; sc.far = 140;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  let world = new THREE.Group();
  scene.add(world);
  const horses = new Map(); // id -> { model, mode, target, speed, lap }
  const clickables = [];
  const animated = [];
  let season = null, facilitiesKey = '';
  let particles = null;

  // ---------- 地形と建物(季節・施設が変わったら作り直す) ----------
  function buildWorld(state, cal) {
    scene.remove(world);
    world = new THREE.Group();
    scene.add(world);
    clickables.length = 0;
    const s = cal.season;
    scene.background = new THREE.Color(SKY[s]);
    scene.fog = new THREE.Fog(SKY[s], 120, 260);

    // 島(上が草、横が土の層)
    const shape = new THREE.Shape();
    const N = 48;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const k = 1 + Math.sin(a * 3 + 1) * 0.04 + Math.sin(a * 7) * 0.025;
      const x = Math.cos(a) * 37 * k, z = Math.sin(a) * 24.5 * k;
      if (i === 0) shape.moveTo(x, z); else shape.lineTo(x, z);
    }
    const top = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 1.2, bevelEnabled: false }), [mat(GRASS[s]), mat(shadeHex(GRASS[s], -0.12))]);
    top.rotation.x = Math.PI / 2;
    top.position.y = 0;
    top.receiveShadow = true;
    world.add(top);
    const dirt = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 5, bevelEnabled: false }), [mat('#9b7653'), mat('#a07a55')]);
    dirt.rotation.x = Math.PI / 2;
    dirt.position.y = -1.2;
    dirt.scale.set(0.985, 0.985, 1);
    world.add(dirt);
    const rock = new THREE.Mesh(new THREE.ConeGeometry(20, 12, 7), mat('#8a6a4c'));
    rock.rotation.x = Math.PI;
    rock.position.y = -11;
    rock.scale.set(1.6, 1, 1);
    world.add(rock);

    // 調教コース(楕円のダートと白い柵)
    const ring = new THREE.Shape();
    ring.absellipse(0, 0, TRACK.rx + 1.4, TRACK.rz + 1.4, 0, Math.PI * 2, false, 0);
    const hole = new THREE.Path();
    hole.absellipse(0, 0, TRACK.rx - 1.4, TRACK.rz - 1.4, 0, Math.PI * 2, true, 0);
    ring.holes.push(hole);
    const trackMesh = new THREE.Mesh(new THREE.ShapeGeometry(ring, 48), mat(s === 'winter' ? '#d8cdbd' : '#d9bf8f'));
    trackMesh.rotation.x = -Math.PI / 2;
    trackMesh.position.set(TRACK.cx, 0.03, TRACK.cz);
    trackMesh.receiveShadow = true;
    trackMesh.userData.area = 'track';
    world.add(trackMesh);
    clickables.push(trackMesh);
    for (const rr of [1.6, -1.6]) {
      const pts = [];
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        pts.push([TRACK.cx + Math.cos(a) * (TRACK.rx + rr), TRACK.cz + Math.sin(a) * (TRACK.rz + rr)]);
      }
      const f = makeFence(pts, '#ffffff');
      f.scale.y = 0.75;
      world.add(f);
    }
    // 内側の花だん
    for (let i = 0; i < 18; i++) {
      const fl = new THREE.Mesh(new THREE.TetrahedronGeometry(0.25, 0), mat(['#f6c1cf', '#fff1a8', '#ffffff', '#c9b6f0'][i % 4]));
      fl.position.set(TRACK.cx + (Math.random() - 0.5) * 14, 0.2, TRACK.cz + (Math.random() - 0.5) * 6);
      world.add(fl);
    }

    // 牧草地の柵
    world.add(makeFence([[PASTURE.x0, PASTURE.z0], [PASTURE.x1, PASTURE.z0], [PASTURE.x1, PASTURE.z1], [PASTURE.x0, PASTURE.z1]], '#e9dcc4'));

    // 厩舎
    const stable = makeHouse({ w: 11, d: 4.5, h: 2.6, wall: '#ead2ad', roof: '#b9584a', door: '#6d4a2f' });
    for (let i = -2; i <= 2; i++) stable.add(box(1, 1.3, 0.06, '#7a5232', i * 2, 0.9, 2.28));
    place(stable, 'stable');
    // 事務所
    const office = makeHouse({ w: 4.2, d: 3.2, h: 2.4, wall: '#f4efe4', roof: '#4f7f9b' });
    const pole = box(0.12, 4, 0.12, '#dddddd', 2.6, 2, 1.4);
    office.add(pole);
    const flag = box(1.2, 0.7, 0.04, '#e58a7a', 3.2, 3.6, 1.4);
    office.add(flag);
    office.userData.flag = flag;
    place(office, 'office');
    // 母屋
    const house = makeHouse({ w: 6, d: 5, h: 2.8, wall: '#f6e7cf', roof: '#d27b54', chimney: true });
    place(house, 'house');
    // 繁殖場(丸い屋根)
    const barn = new THREE.Group();
    barn.add(box(6, 2.2, 4, '#f1dcc0', 0, 1.1, 0));
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 6.4, 8, 1, false, 0, Math.PI), mat('#9a6aa8'));
    roof.rotation.z = Math.PI / 2;
    roof.rotation.x = Math.PI / 2;
    roof.rotation.order = 'ZXY';
    roof.position.y = 2.2;
    roof.castShadow = true;
    barn.add(roof);
    barn.add(box(1.4, 1.5, 0.06, '#7a5232', 0, 0.75, 2.02));
    barn.add(makeFence([[-6, 2.5], [-3, 6], [3, 6], [5, 3]], '#e9dcc4', false));
    place(barn, 'breed');
    // 工房
    const ws = makeHouse({ w: 4, d: 3.4, h: 2.2, wall: '#e3d3b8', roof: '#6f8f5a' });
    ws.add(box(1.2, 0.5, 0.8, '#9a7350', 2.8, 0.25, 1.2));
    ws.add(box(0.8, 0.8, 0.8, '#b38a5d', -2.8, 0.4, 1.0));
    place(ws, 'workshop');
    // 町への門と道
    const town = new THREE.Group();
    town.add(box(0.4, 3.2, 0.4, '#8a6a4a', -1.8, 1.6, 0));
    town.add(box(0.4, 3.2, 0.4, '#8a6a4a', 1.8, 1.6, 0));
    town.add(box(4.6, 0.6, 0.5, '#b5443b', 0, 3.3, 0));
    for (const [x, c] of [[-1, '#e9b44c'], [1.4, '#7fb2c9']]) {
      const tent = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.2, 4), mat(c));
      tent.position.set(x + 4, 1.6, -1.5);
      tent.castShadow = true;
      town.add(tent);
      town.add(box(1.4, 1, 1.4, '#f3ead8', x + 4, 0.5, -1.5));
    }
    place(town, 'town');
    const road = new THREE.Mesh(new THREE.PlaneGeometry(22, 2.4), mat(s === 'winter' ? '#d8d0c3' : '#d8c49c'));
    road.rotation.x = -Math.PI / 2;
    road.rotation.z = -0.25;
    road.position.set(23, 0.02, 7.5);
    road.receiveShadow = true;
    world.add(road);

    // 池
    const pond = new THREE.Mesh(new THREE.CircleGeometry(1, 20), mat(s === 'winter' ? '#cfe3ea' : '#7fbcd0', { roughness: 0.3 }));
    pond.scale.set(4.6, 2.8, 1);
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(-9, 0.04, 16);
    world.add(pond);
    if (s !== 'winter') for (let i = 0; i < 2; i++) {
      const duck = new THREE.Group();
      duck.add(box(0.5, 0.3, 0.32, '#ffffff', 0, 0.15, 0));
      duck.add(box(0.2, 0.25, 0.2, '#ffffff', 0.25, 0.38, 0));
      duck.add(box(0.12, 0.06, 0.1, '#f0a23a', 0.4, 0.38, 0));
      duck.position.set(-10 + i * 2.2, 0.05, 15.5 + i);
      duck.userData.duck = i;
      world.add(duck);
    }

    // 施設(建てたものだけ)
    const fac = state.facilities;
    if (fac.hill) {
      const mound = new THREE.Mesh(new THREE.SphereGeometry(6, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(shadeHex(GRASS[s], 0.04)));
      mound.scale.y = 0.35;
      mound.receiveShadow = true;
      mound.position.set(-27, 0, -12);
      mound.userData.area = 'hill';
      world.add(mound);
      clickables.push(mound);
      const big = makeTree('round', s, 1.7);
      big.position.set(-27, 1.8, -13);
      world.add(big);
      world.add(placeLabelAnchor('hill'));
    } else {
      const sign = new THREE.Group();
      sign.add(box(0.15, 1.2, 0.15, '#8a6a4a', 0, 0.6, 0));
      sign.add(box(1.4, 0.6, 0.1, '#e8d4ae', 0, 1.2, 0));
      sign.position.set(-27, 0, -12);
      world.add(sign);
    }
    if (fac.windmill) {
      const wm = new THREE.Group();
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.6, 6, 6), mat('#efe4d0'));
      tower.position.y = 3;
      tower.castShadow = true;
      wm.add(tower);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.4, 6), mat('#b9584a'));
      cap.position.y = 6.7;
      wm.add(cap);
      const blades = new THREE.Group();
      blades.position.set(0, 5.6, 1.4);
      for (let i = 0; i < 4; i++) {
        const b = box(0.5, 3.4, 0.08, '#f8f4ea', 0, 1.7, 0);
        const holder = new THREE.Group();
        holder.add(b);
        holder.rotation.z = (i * Math.PI) / 2;
        blades.add(holder);
      }
      wm.add(blades);
      wm.userData.blades = blades;
      wm.position.set(29, 0, -3);
      world.add(wm);
    }
    if (fac.pool) {
      const p = new THREE.Group();
      p.add(box(5, 0.3, 2.8, '#e8e2d4', 0, 0.15, 0));
      const water = box(4.4, 0.32, 2.2, '#6fc0d8', 0, 0.17, 0);
      water.material = mat('#6fc0d8', { roughness: 0.25 });
      p.add(water);
      p.position.set(-6.5, 0, -6);
      world.add(p);
    }
    if (fac.slope) {
      const sl = box(9, 0.3, 2, '#c9a878', 0, 0, 0);
      sl.rotation.z = 0.12;
      sl.position.set(0, 0.6, 13.5);
      world.add(sl);
      world.add(box(1.2, 1.2, 2.2, '#b0906a', 4.4, 0.6, 13.5));
    }
    if (fac.clinic) {
      const cl = makeHouse({ w: 4, d: 3.2, h: 2.3, wall: '#ffffff', roof: '#7fb7a6' });
      cl.add(box(0.9, 0.3, 0.06, '#5fae7a', 0, 2.0, 1.64));
      cl.add(box(0.3, 0.9, 0.06, '#5fae7a', 0, 2.0, 1.64));
      cl.position.set(25, 0, -13);
      cl.rotation.y = -0.3;
      world.add(cl);
    }
    if (fac.stable >= 3) {
      const st2 = makeHouse({ w: 7, d: 4, h: 2.3, wall: '#ead2ad', roof: '#b9584a' });
      st2.position.set(-13, 0, -6.2);
      st2.scale.setScalar(0.85);
      st2.traverse((o) => { if (o.isMesh) { o.userData.area = 'stable'; clickables.push(o); } });
      world.add(st2);
    }

    // 木・岩・花
    const treeSpots = [[-33, -3], [-31, 6], [-30, 12], [-20, -20], [-6, -20], [9, -20], [22, -19], [32, -9], [34, 2], [-34, -9], [-15, 19], [3, 20], [19, 20], [-4, -10], [21, -6], [-28, 18], [-2, 18], [26, -18], [33, 7]];
    treeSpots.forEach(([x, z], i) => {
      const t = makeTree(i % 3 === 0 ? 'pine' : 'round', s, 0.8 + (i % 4) * 0.12);
      t.position.set(x, 0, z);
      world.add(t);
    });
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.55 + Math.random() * 0.4;
      const x = Math.cos(a) * 35 * r, z = Math.sin(a) * 22 * r;
      if (Math.abs(x - TRACK.cx) < 15 && Math.abs(z - TRACK.cz) < 9) continue;
      const fl = new THREE.Mesh(new THREE.TetrahedronGeometry(0.22, 0), mat(s === 'winter' ? '#ffffff' : ['#f6c1cf', '#fff1a8', '#ffffff', '#f2a65a', '#c9b6f0'][i % 5]));
      fl.position.set(x, 0.18, z);
      world.add(fl);
    }
    for (let i = 0; i < 8; i++) {
      const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + Math.random() * 0.4, 0), mat('#a7a39a'));
      const a = Math.random() * Math.PI * 2;
      rk.position.set(Math.cos(a) * 34, 0.2, Math.sin(a) * 22);
      rk.castShadow = true;
      world.add(rk);
    }
    // 雲
    for (let i = 0; i < 6; i++) {
      const cl = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4 + Math.random(), 0), mat('#ffffff', { transparent: true, opacity: 0.92 }));
        puff.position.set(k * 1.6 - 2.4, Math.random() * 0.6, Math.random() - 0.5);
        cl.add(puff);
      }
      cl.position.set(-50 + i * 20, 14 + Math.random() * 5, -30 + Math.random() * 20);
      cl.userData.cloud = 0.4 + Math.random() * 0.5;
      world.add(cl);
    }
    // 季節の粒(春:花びら 秋:落ち葉 冬:雪)
    particles = null;
    if (s !== 'summer') {
      const n = 160;
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 80; pos[i * 3 + 1] = Math.random() * 25; pos[i * 3 + 2] = (Math.random() - 0.5) * 50; }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const col = { spring: '#f7c6d4', autumn: '#e09a4c', winter: '#ffffff' }[s];
      particles = new THREE.Points(geo, new THREE.PointsMaterial({ color: col, size: s === 'winter' ? 0.45 : 0.4, transparent: true, opacity: 0.9 }));
      world.add(particles);
    }
    // 動くもの(雲・風車・旗・アヒル)を覚えておく
    animated.length = 0;
    world.traverse((o) => { if (o.userData.cloud || o.userData.blades || o.userData.flag || o.userData.duck != null) animated.push(o); });
    // 馬は作り直し
    for (const v of horses.values()) world.remove(v.model);
    horses.clear();
  }

  function place(obj, area) {
    const p = PLACES[area].pos;
    obj.position.set(p[0], p[1], p[2]);
    obj.traverse((o) => { if (o.isMesh) { o.userData.area = area; clickables.push(o); } });
    world.add(obj);
  }
  function placeLabelAnchor() { return new THREE.Group(); }

  // ---------- 馬を並べる ----------
  function homeOf(h) {
    if (h.role === 'race') {
      if (h.injury > 0 || h.plan === 'rest') return 'stable';
      if (h.plan === 'pasture') return 'pasture';
      return 'track';
    }
    if (h.role === 'retired') return 'hill';
    if (h.role === 'brood' || h.role === 'foal') return 'pasture';
    if (h.role === 'stud') return 'breed';
    return 'pasture';
  }
  function randomPoint(zone) {
    if (zone === 'pasture') return [PASTURE.x0 + 1.5 + Math.random() * (PASTURE.x1 - PASTURE.x0 - 3), PASTURE.z0 + 1.5 + Math.random() * (PASTURE.z1 - PASTURE.z0 - 3)];
    if (zone === 'stable') return [-17 + Math.random() * 8, -9.5 + Math.random() * 1.5];
    if (zone === 'breed') return [-24 + Math.random() * 6, 17 + Math.random() * 3];
    if (zone === 'hill') { const a = Math.random() * Math.PI * 2; return [-27 + Math.cos(a) * 4, -12 + Math.sin(a) * 3]; }
    return [0, 0];
  }
  function syncHorses(state) {
    const list = [...state.horses];
    if (state.facilities.hill) for (const r of state.retired.filter((x) => x.dest === 'hill').slice(-6)) list.push({ ...r, role: 'retired' });
    const seen = new Set();
    for (const h of list) {
      seen.add(h.id);
      let e = horses.get(h.id);
      const zone = homeOf(h);
      if (!e || e.coat !== h.coat) {
        if (e) world.remove(e.model);
        const age = state.year - h.birthYear;
        const model = makeHorse({ coat: h.coat, blaze: h.blaze, socks: h.socks, scale: h.role === 'foal' ? (age === 0 ? 0.55 : 0.75) : 1 });
        model.traverse((o) => { if (o.isMesh) o.userData.horseId = h.role === 'retired' ? null : h.id; });
        const p = zone === 'track' ? [TRACK.cx + TRACK.rx, TRACK.cz] : randomPoint(zone);
        model.position.set(p[0], zone === 'hill' ? 1.4 : 0, p[1]);
        world.add(model);
        e = { model, coat: h.coat, zone, target: null, wait: Math.random() * 3, lap: Math.random() * Math.PI * 2, laneOff: (Math.random() - 0.5) * 1.6 };
        horses.set(h.id, e);
      }
      if (e.zone !== zone) { e.zone = zone; e.target = null; const p = zone === 'track' ? [TRACK.cx + TRACK.rx, TRACK.cz] : randomPoint(zone); e.model.position.set(p[0], zone === 'hill' ? 1.4 : 0, p[1]); }
      e.plan = h.plan;
    }
    for (const [id, e] of horses) if (!seen.has(id)) { world.remove(e.model); horses.delete(id); }
  }

  function updateHorses(dt, t) {
    for (const e of horses.values()) {
      const m = e.model;
      if (e.zone === 'track') {
        const fast = ['spd', 'mix', 'secret', 'gut'].includes(e.plan);
        const w = fast ? 0.32 : 0.16;
        e.lap += dt * w;
        const rx = TRACK.rx + e.laneOff, rz = TRACK.rz + e.laneOff * 0.6;
        const x = TRACK.cx + Math.cos(e.lap) * rx, z = TRACK.cz + Math.sin(e.lap) * rz;
        const dx = -Math.sin(e.lap) * rx, dz = Math.cos(e.lap) * rz;
        m.position.set(x, 0, z);
        m.rotation.y = -Math.atan2(dz, dx);
        animateHorse(m, t, fast ? 3 : 1.2);
        continue;
      }
      if (!e.target) {
        e.wait -= dt;
        animateHorse(m, t, 0);
        if (e.wait <= 0) { e.target = randomPoint(e.zone); }
        continue;
      }
      const dx = e.target[0] - m.position.x, dz = e.target[1] - m.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.2) { e.target = null; e.wait = 2 + Math.random() * 6; continue; }
      const sp = 1.3;
      m.position.x += (dx / d) * sp * dt;
      m.position.z += (dz / d) * sp * dt;
      const want = -Math.atan2(dz, dx);
      let diff = want - m.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      m.rotation.y += diff * Math.min(1, dt * 4);
      animateHorse(m, t, 1);
    }
  }

  // ---------- クリック ----------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (ev) => { down = [ev.clientX, ev.clientY]; });
  renderer.domElement.addEventListener('pointerup', (ev) => {
    if (!down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 6) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const horseMeshes = [];
    for (const e of horses.values()) e.model.traverse((o) => { if (o.isMesh && o.userData.horseId) horseMeshes.push(o); });
    const hh = ray.intersectObjects(horseMeshes, false)[0];
    if (hh) { onHorse?.(hh.object.userData.horseId); return; }
    const hit = ray.intersectObjects(clickables, false)[0];
    if (hit && hit.object.userData.area) onArea?.(hit.object.userData.area);
  });

  // ---------- 画面の大きさ ----------
  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const aspect = w / h;
    camera.fov = Math.min(68, Math.max(28, (28 * 1.75) / aspect));
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // ---------- 毎フレーム ----------
  const clock = new THREE.Clock();
  let active = true, raf = 0;
  const v = new THREE.Vector3();
  function project(area) {
    const p = PLACES[area].pos;
    const hgt = { stable: 5.2, office: 5.6, house: 6.2, breed: 5.4, track: 2, workshop: 4.8, town: 5, hill: 6 }[area] || 4;
    v.set(p[0], hgt, p[2]).project(camera);
    return { x: (v.x * 0.5 + 0.5) * 100, y: (-v.y * 0.5 + 0.5) * 100, visible: v.z < 1 };
  }
  function loop() {
    raf = requestAnimationFrame(loop);
    if (!active) return;
    const dt = Math.min(0.05, clock.getDelta());
    const t = clock.elapsedTime;
    controls.update();
    updateHorses(dt, t);
    for (const o of animated) {
      if (o.userData.cloud) { o.position.x += o.userData.cloud * dt; if (o.position.x > 60) o.position.x = -60; }
      if (o.userData.blades) o.userData.blades.rotation.z += dt * 0.8;
      if (o.userData.flag) o.userData.flag.rotation.y = Math.sin(t * 2) * 0.15;
      if (o.userData.duck != null) { o.position.x = -9 + Math.cos(t * 0.3 + o.userData.duck * 3) * 2.5; o.position.z = 16 + Math.sin(t * 0.3 + o.userData.duck * 3) * 1.2; o.rotation.y = -t * 0.3 - o.userData.duck * 3 - Math.PI / 2; }
    }
    if (particles) {
      const a = particles.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) {
        let y = a.getY(i) - dt * (season === 'winter' ? 1.6 : 1.1);
        let x = a.getX(i) + Math.sin(t + i) * dt * 0.8;
        if (y < 0) y = 25;
        a.setXY(i, x, y);
      }
      a.needsUpdate = true;
    }
    renderer.render(scene, camera);
    onFrame?.(project);
  }
  loop();

  return {
    update(state, cal) {
      const fk = JSON.stringify(state.facilities);
      if (cal.season !== season || fk !== facilitiesKey) {
        season = cal.season;
        facilitiesKey = fk;
        buildWorld(state, cal);
      }
      syncHorses(state);
    },
    setActive(on) { active = on; if (on) clock.getDelta(); },
    focus(area) {
      const p = PLACES[area]?.pos;
      if (!p) return;
      controls.target.set(p[0] * 0.5, 0, p[2] * 0.5 + 1);
    },
    resetView() { controls.target.set(0, 0, 1); },
    project,
    resize,
    dispose() { cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); },
  };
}
