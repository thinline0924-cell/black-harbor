// ひだまり牧場 — レースの 3D 画面(競馬場・走る馬たち・カメラ)

import * as THREE from 'three';
import { makeHorse, animateHorse, box, mat, makeTree } from './models.js?v=5';
import { point, L, R, STRAIGHT, FINISH_U, startU, makeLaner } from './racepath.js?v=5';

const SILKS = ['#ffffff', '#2b2b2b', '#d9544d', '#4a78c2', '#f0c94a', '#5aa36a', '#f09a4a', '#e7a1c0', '#8a6fc4', '#62b9c9'];

export function createRaceView(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#bfe0ec');
  scene.fog = new THREE.Fog('#bfe0ec', 160, 620);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.5, 1500);
  scene.add(new THREE.HemisphereLight('#fff8ea', '#6f8f5f', 1.3));
  const sun = new THREE.DirectionalLight('#fff1d6', 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 200 });
  scene.add(sun);
  scene.add(sun.target);

  let world = null, runners = [], laner = null, dist = 2000, ownIdx = -1, marker = null;
  const camOff = new THREE.Vector3(), lookOff = new THREE.Vector3();
  let camInit = false, lastMs = 0;

  function ribbon(u0, u1, l0, l1, color, y = 0.02, step = 6) {
    const pos = [], idx = [];
    let k = 0;
    for (let u = u0; u <= u1 + 0.01; u += step) {
      const a = point(u, l0), b = point(u, l1);
      pos.push(a.x, y, a.z, b.x, y, b.z);
      if (k) idx.push(2 * k - 2, 2 * k - 1, 2 * k, 2 * k - 1, 2 * k + 1, 2 * k);
      k++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide }));
    m.receiveShadow = true;
    return m;
  }

  function build(res) {
    if (world) scene.remove(world);
    world = new THREE.Group();
    scene.add(world);
    const turf = res.race.surface === 'turf';
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), mat('#9cc77c'));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    world.add(ground);
    world.add(ribbon(0, L, -1, 26, turf ? '#79b25e' : '#c9a678', 0.04));
    // ラチ(白い柵)
    for (const lane of [-1, 26]) {
      const pts = [];
      for (let u = 0; u <= L; u += 8) { const p = point(u, lane); pts.push(new THREE.Vector3(p.x, 0.9, p.z)); }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 400, 0.08, 4, true), mat('#ffffff'));
      world.add(tube);
      const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), mat('#ffffff'), Math.ceil(L / 6));
      let i = 0;
      const m4 = new THREE.Matrix4();
      for (let u = 0; u < L; u += 6) { const p = point(u, lane); m4.makeTranslation(p.x, 0.45, p.z); posts.setMatrixAt(i++, m4); }
      world.add(posts);
    }
    // 内側の池と木
    const pond = new THREE.Mesh(new THREE.CircleGeometry(1, 24), mat('#86c3d4', { roughness: 0.3 }));
    pond.scale.set(90, 40, 1);
    pond.rotation.x = -Math.PI / 2;
    pond.position.y = 0.05;
    world.add(pond);
    for (let i = 0; i < 40; i++) {
      const t = makeTree(i % 3 ? 'round' : 'pine', 'summer', 2.2 + Math.random());
      const a = Math.random() * Math.PI * 2;
      const rr = R + 70 + Math.random() * 120;
      t.position.set(Math.cos(a) * (rr + STRAIGHT / 2), 0, Math.sin(a) * rr);
      if (t.position.z > R + 20 && Math.abs(t.position.x) < 260) continue;
      world.add(t);
    }
    for (let i = 0; i < 16; i++) {
      const t = makeTree('round', 'summer', 1.8);
      t.position.set(-130 + i * 17, 0, (i % 2 ? 1 : -1) * (R - 70));
      world.add(t);
    }
    // スタンドと観客
    const stand = new THREE.Group();
    for (let s = 0; s < 6; s++) stand.add(box(320, 1.6, 4, s % 2 ? '#e9e2d3' : '#d9d1bf', 0, 0.8 + s * 1.6, 0 + s * 3.4));
    stand.add(box(330, 1, 26, '#4f7f9b', 0, 16, 9));
    for (let i = -4; i <= 4; i++) stand.add(box(0.6, 15, 0.6, '#cfc8b8', i * 38, 7.5, 20));
    stand.position.set(0, 0, R + 34);
    world.add(stand);
    const crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 1, 0.5), new THREE.MeshStandardMaterial({ roughness: 1 }), 900);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    const cols = ['#e98aa0', '#7fb2c9', '#f0c94a', '#ffffff', '#5aa36a', '#d9544d', '#8a6fc4', '#444444'];
    for (let i = 0; i < 900; i++) {
      const s = i % 6, x = -155 + Math.random() * 310;
      m4.makeTranslation(x, 2.1 + s * 1.6, R + 34 + s * 3.4);
      crowd.setMatrixAt(i, m4);
      crowd.setColorAt(i, col.set(cols[i % cols.length]));
    }
    world.add(crowd);
    world.userData.crowd = crowd;
    // ゴール板
    const f = point(FINISH_U, 26);
    const post = new THREE.Group();
    post.add(box(0.4, 7, 0.4, '#ffffff', 0, 3.5, 0));
    post.add(box(0.2, 2.4, 3.4, '#d9544d', 0, 7, 0));
    post.add(box(0.22, 1.4, 2.2, '#ffffff', 0, 7, 0));
    post.position.set(f.x, 0, f.z + 1.5);
    world.add(post);
    const fl = ribbon(FINISH_U - 0.3, FINISH_U + 0.3, -1, 26, '#ffffff', 0.06, 0.6);
    world.add(fl);
    // スタートゲート
    const su = startU(dist);
    const gate = new THREE.Group();
    const n = res.runners.length;
    for (let i = 0; i <= n; i++) {
      const p = point(su - 2, 0.8 + i * 1.3);
      const wall = box(2.4, 2.4, 0.15, '#6a8fb0', p.x, 1.2, p.z);
      wall.rotation.y = -Math.atan2(p.hz, p.hx);
      gate.add(wall);
    }
    const pa = point(su - 2, 0.6), pb = point(su - 2, 0.8 + n * 1.3);
    const topBar = box(0.5, 0.4, Math.hypot(pb.x - pa.x, pb.z - pa.z) + 1, '#4f7090', (pa.x + pb.x) / 2, 2.6, (pa.z + pb.z) / 2);
    topBar.rotation.y = -Math.atan2(pa.hz, pa.hx);
    gate.add(topBar);
    world.add(gate);
    world.userData.gate = gate;

    // 馬たち
    runners = res.runners.map((r, i) => {
      const silk = r.own ? '#e98aa0' : r.rival ? '#23232e' : SILKS[(r.gate - 1) % SILKS.length];
      const model = makeHorse({ coat: r.coat, blaze: r.blaze, jockey: { silk, silk2: r.own ? '#ffffff' : r.rival ? '#d9b44a' : '#f4efe6', cap: r.own ? '#ffffff' : silk } });
      world.add(model);
      return { model, data: r, prevD: 0 };
    });
    ownIdx = res.runners.findIndex((r) => r.own);
    if (marker) scene.remove(marker);
    marker = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.7, 4), new THREE.MeshBasicMaterial({ color: '#ff6f91' }));
    marker.rotation.x = Math.PI;
    scene.add(marker);
    laner = makeLaner(n);
  }

  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 1 ? 55 : 40;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  let lastT = 0;
  return {
    setup(res) {
      dist = res.race.dist;
      build(res);
      resize();
      camInit = false;
      lastMs = 0;
      lastT = 0;
    },
    // dists: 各馬の走った距離 / tSim: レース内の時間(秒) / speedMul: 再生の速さ
    draw(dists, tSim, { finished = false } = {}) {
      const lanes = laner(dists, 0.06);
      const su = startU(dist);
      let lead = 0;
      dists.forEach((d, i) => { if (d > dists[lead]) lead = i; });
      runners.forEach((r, i) => {
        const p = point(su + dists[i], lanes[i]);
        r.model.position.set(p.x, 0, p.z);
        r.model.rotation.y = -Math.atan2(p.hz, p.hx);
        const moving = tSim > 0 && !(finished && dists[i] > dist + 30);
        animateHorse(r.model, tSim * 1.15, moving ? 3 : 0);
      });
      if (world.userData.gate) world.userData.gate.visible = tSim < 6;
      // カメラ:自分の馬といっしょに動く(遅れないように、馬からの「ずれ」だけをなめらかに変える)
      const fi = ownIdx >= 0 ? ownIdx : lead;
      const fp = point(su + dists[fi], lanes[fi]);
      const remain = dist - dists[fi];
      const out = { x: -fp.hz, z: fp.hx }; // コースの外側の向き
      const nowMs = performance.now();
      const rdt = Math.min(0.1, (nowMs - (lastMs || nowMs)) / 1000);
      lastMs = nowMs;
      let offW, lookW;
      if (tSim < 1.5) {
        offW = new THREE.Vector3(fp.hx * 6 + out.x * 22, 7, fp.hz * 6 + out.z * 22);
        lookW = new THREE.Vector3(-fp.hx * 4, 1, -fp.hz * 4);
      } else if (remain < 420) {
        offW = new THREE.Vector3(fp.hx * 13 + out.x * 9, 3, fp.hz * 13 + out.z * 9);
        lookW = new THREE.Vector3(-fp.hx * 2, 1.4, -fp.hz * 2);
      } else {
        offW = new THREE.Vector3(-fp.hx * 9 + out.x * 12, 6, -fp.hz * 9 + out.z * 12);
        lookW = new THREE.Vector3(fp.hx * 7, 1.2, fp.hz * 7);
      }
      if (!camInit) { camOff.copy(offW); lookOff.copy(lookW); camInit = true; }
      const k = 1 - Math.exp(-rdt * 2.2);
      camOff.lerp(offW, k);
      lookOff.lerp(lookW, k);
      camera.position.set(fp.x + camOff.x, camOff.y, fp.z + camOff.z);
      camera.lookAt(fp.x + lookOff.x, lookOff.y, fp.z + lookOff.z);
      sun.position.set(fp.x - 30, 60, fp.z + 20);
      sun.target.position.set(fp.x, 0, fp.z);
      if (ownIdx >= 0) {
        const o = runners[ownIdx].model.position;
        marker.position.set(o.x, 3.3 + Math.sin(tSim * 4) * 0.15, o.z);
        marker.rotation.y += 0.05;
      }
      const crowd = world.userData.crowd;
      if (crowd && Math.floor(tSim * 10) !== Math.floor(lastT * 10)) {
        crowd.position.y = remain < 500 ? Math.abs(Math.sin(tSim * 9)) * 0.25 : 0;
      }
      lastT = tSim;
      renderer.render(scene, camera);
    },
    ownScreen() {
      if (ownIdx < 0) return null;
      const v = runners[ownIdx].model.position.clone();
      v.y += 5.2;
      v.project(camera);
      return { x: (v.x * 0.5 + 0.5) * 100, y: (-v.y * 0.5 + 0.5) * 100, visible: v.z < 1 };
    },
    resize,
    dispose() { window.removeEventListener('resize', resize); renderer.dispose(); container.innerHTML = ''; },
  };
}
