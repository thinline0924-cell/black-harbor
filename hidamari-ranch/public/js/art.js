// ひだまり牧場 — 絵(SVG)を作る道具
// 馬の横顔・関係者の似顔絵・絵地図・ふちの形。画像ファイルは使わず、ここで描きます。

import { COATS, PEOPLE } from './data.js';

// 同じ種からいつも同じ乱数
function seeded(seed) {
  let x = seed * 9301 + 49297;
  return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
}

// なめらかな「もこもこ」の閉じた形(パズルのピースのような地域や、地図のふち)
export function blobPath(cx, cy, rx, ry, seed, points = 10, wobble = 0.18) {
  const r = seeded(seed);
  const pts = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const k = 1 + (r() - 0.5) * 2 * wobble;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  // Catmull-Rom → ベジェ曲線
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < points; i++) {
    const p0 = pts[(i - 1 + points) % points], p1 = pts[i], p2 = pts[(i + 1) % points], p3 = pts[(i + 2) % points];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}

// 地図のふち(1000 x 560 の箱いっぱいに広がる、波打った形)
export function framePath() {
  const r = seeded(7);
  const W = 1000, H = 560, m = 18;
  const pts = [];
  const nTop = 9, nSide = 4;
  for (let i = 0; i <= nTop; i++) pts.push([m + (W - 2 * m) * (i / nTop), m + r() * 26]);
  for (let i = 1; i <= nSide; i++) pts.push([W - m - r() * 26, m + (H - 2 * m) * (i / (nSide + 1))]);
  for (let i = nTop; i >= 0; i--) pts.push([m + (W - 2 * m) * (i / nTop), H - m - r() * 26]);
  for (let i = nSide; i >= 1; i--) pts.push([m + r() * 26, m + (H - 2 * m) * (i / (nSide + 1))]);
  const n = pts.length;
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + amt * 255)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// 馬の横顔(ローポリ風)
export function horsePortrait(h, { bg = true } = {}) {
  const c = COATS[h.coat] || COATS.kage;
  const body = c.body, mane = c.mane;
  const light = shade(body, 0.09), dark = shade(body, -0.1);
  const id = 'g' + Math.random().toString(36).slice(2, 8);
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  ${bg ? `<defs><radialGradient id="${id}" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#f4f8ef"/><stop offset="1" stop-color="#cfe2d0"/></radialGradient></defs><rect width="100" height="100" fill="url(#${id})"/>` : ''}
  <polygon points="50,100 90,100 80,50 63,34 48,58" fill="${body}"/>
  <polygon points="63,34 80,50 70,74 56,60" fill="${light}"/>
  <polygon points="48,58 56,60 70,74 66,100 50,100" fill="${dark}"/>
  <polygon points="61,28 40,29 18,56 20,67 37,70 54,62 64,40" fill="${body}"/>
  <polygon points="40,29 61,28 52,44" fill="${light}"/>
  <polygon points="18,56 20,67 37,70 30,58" fill="${dark}"/>
  ${h.blaze ? '<polygon points="40,30 45,31 27,58 22,57" fill="#f7f3ea"/>' : ''}
  <polygon points="55,31 58,12 65,31" fill="${body}"/><polygon points="57,29 58.5,17 62,30" fill="${dark}"/>
  <polygon points="62,24 71,29 86,52 94,100 87,100 77,52 64,36" fill="${mane}"/>
  <polygon points="44,27 55,24 50,33" fill="${mane}"/>
  <circle cx="43" cy="41" r="3.2" fill="#2a211d"/><circle cx="44" cy="40" r="1.1" fill="#fff"/>
  <ellipse cx="23" cy="60" rx="2" ry="1.4" fill="#2a211d" opacity=".6"/>
  <path d="M24 66 Q29 68 33 66" stroke="#2a211d" stroke-width="1.2" fill="none" opacity=".5"/>
  </svg>`;
}

// 関係者の似顔絵
export function personFace(pid) {
  const f = PEOPLE[pid].face;
  const hair = f.hair, skin = f.skin, cloth = f.cloth;
  const hairParts = {
    bald: `<path d="M27 46 Q27 34 33 30 L33 48Z M73 46 Q73 34 67 30 L67 48Z" fill="${hair}"/>`,
    bob: `<path d="M24 52 Q22 22 50 20 Q78 22 76 52 L70 54 Q70 36 50 34 Q32 36 30 54Z" fill="${hair}"/>`,
    glasses: `<path d="M27 40 Q30 21 50 21 Q70 21 73 40 Q62 30 50 31 Q38 30 27 40Z" fill="${hair}"/>`,
    spiky: `<path d="M26 42 L28 24 L36 30 L40 18 L48 27 L54 16 L60 27 L68 20 L69 31 L76 28 L74 42 Q60 32 50 33 Q38 32 26 42Z" fill="${hair}"/>`,
    long: `<path d="M22 82 Q18 30 50 20 Q82 30 78 82 L70 82 Q72 44 50 34 Q30 44 30 82Z" fill="${hair}"/>`,
    beard: `<path d="M27 40 Q30 22 50 22 Q70 22 73 40 Q60 31 50 32 Q40 31 27 40Z" fill="${hair}"/><path d="M30 52 Q32 74 50 75 Q68 74 70 52 Q66 64 58 64 L42 64 Q34 64 30 52Z" fill="${hair}"/>`,
    twin: `<circle cx="22" cy="44" r="9" fill="${hair}"/><circle cx="78" cy="44" r="9" fill="${hair}"/><path d="M26 42 Q28 22 50 22 Q72 22 74 42 Q66 32 58 36 Q50 30 42 36 Q34 32 26 42Z" fill="${hair}"/>`,
    slick: `<path d="M26 44 Q24 20 52 20 Q76 22 74 40 Q64 28 40 32 Q30 36 26 44Z" fill="${hair}"/>`,
  };
  const glasses = f.style === 'glasses' ? '<g stroke="#4a4a4a" stroke-width="1.6" fill="rgba(255,255,255,.3)"><circle cx="41" cy="49" r="6"/><circle cx="59" cy="49" r="6"/><path d="M47 49 L53 49"/></g>' : '';
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="49" fill="#eef3e9"/>
  <path d="M18 100 Q20 74 50 72 Q80 74 82 100Z" fill="${cloth}"/>
  <rect x="44" y="64" width="12" height="10" fill="${skin}"/>
  <ellipse cx="50" cy="48" rx="23" ry="25" fill="${skin}"/>
  ${hairParts[f.style] || hairParts.bob}
  <ellipse cx="41" cy="50" rx="2.4" ry="3" fill="#2d2622"/><ellipse cx="59" cy="50" rx="2.4" ry="3" fill="#2d2622"/>
  <circle cx="35" cy="58" r="3.6" fill="#f2a4a0" opacity=".45"/><circle cx="65" cy="58" r="3.6" fill="#f2a4a0" opacity=".45"/>
  <path d="M45 61 Q50 65 55 61" stroke="#8a4a3a" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  ${glasses}
  </svg>`;
}

// 絵地図(3D が使えないとき・表示切替のとき)
export const AREAS = {
  hill: { label: 'ひだまりの丘', icon: '🌳', x: 140, y: 120, rx: 110, ry: 80, colors: ['#bcd7a0', '#8fbf86'], need: 'hill' },
  stable: { label: '厩舎', icon: '🐴', x: 330, y: 120, rx: 120, ry: 80, colors: ['#e8c99a', '#c99a6c'] },
  office: { label: '事務所', icon: '📋', x: 520, y: 100, rx: 90, ry: 70, colors: ['#b9d3e4', '#8db3cf'] },
  house: { label: '母屋', icon: '🏡', x: 700, y: 115, rx: 110, ry: 78, colors: ['#f2c7b5', '#d99b8c'] },
  breed: { label: '繁殖場', icon: '🍼', x: 150, y: 330, rx: 120, ry: 110, colors: ['#f4dcc2', '#e2b48d'] },
  track: { label: '調教コース', icon: '🏇', x: 470, y: 300, rx: 170, ry: 115, colors: ['#e9dcb2', '#bfae74'] },
  town: { label: '町', icon: '🛍', x: 870, y: 260, rx: 105, ry: 120, colors: ['#d6cbe6', '#a99acb'] },
  workshop: { label: '工房', icon: '🔨', x: 720, y: 430, rx: 120, ry: 90, colors: ['#d3e3c3', '#9fbd88'] },
  pond: { label: '池のほとり', icon: '🦆', x: 340, y: 465, rx: 120, ry: 70, colors: ['#bfe0e6', '#86bccb'], deco: true },
};
export function map2dSVG(state) {
  const parts = [];
  let i = 0;
  for (const [key, a] of Object.entries(AREAS)) {
    i++;
    const locked = a.need && !state.facilities[a.need];
    const d = blobPath(a.x, a.y, a.rx, a.ry, i * 13 + 5, 9, 0.16);
    parts.push(`<g class="region" data-area="${key}" opacity="${locked ? 0.45 : 1}">
      <defs><linearGradient id="rg${key}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a.colors[0]}"/><stop offset="1" stop-color="${a.colors[1]}"/></linearGradient></defs>
      <path d="${d}" fill="url(#rg${key})" stroke="#fbf8f1" stroke-width="10" stroke-linejoin="round"/>
      <path d="${d}" fill="url(#paperTex)" opacity=".35"/>
      <text x="${a.x}" y="${a.y - 6}" text-anchor="middle" font-size="40">${a.icon}</text>
      <text x="${a.x}" y="${a.y + 34}" text-anchor="middle" font-size="22">${locked ? '(まだない)' : a.label}</text>
    </g>`);
  }
  return `<svg viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
    <defs><pattern id="paperTex" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#fff"/><circle cx="6" cy="5" r=".8" fill="#000" opacity=".15"/></pattern></defs>
    <rect width="1000" height="560" fill="#eef1e4"/>
    ${parts.join('')}
  </svg>`;
}

// トロフィー用の小さなカップの絵
export function cupSVG(grade) {
  const col = grade === 'G1' ? '#d9a93a' : grade === 'G2' ? '#a8acb8' : '#c58a5a';
  return `<svg viewBox="0 0 60 60" width="54" height="54"><path d="M16 10 H44 V22 Q44 36 30 38 Q16 36 16 22Z" fill="${col}"/><path d="M16 14 Q6 14 8 24 Q10 30 17 29" stroke="${col}" stroke-width="3" fill="none"/><path d="M44 14 Q54 14 52 24 Q50 30 43 29" stroke="${col}" stroke-width="3" fill="none"/><rect x="26" y="38" width="8" height="8" fill="${col}"/><rect x="18" y="46" width="24" height="6" rx="2" fill="#8a6a4a"/><path d="M22 14 Q24 26 30 30" stroke="#fff" stroke-width="2" opacity=".5" fill="none"/></svg>`;
}
