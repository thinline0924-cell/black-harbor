// ひだまり牧場 — 画面の操作(タブ・パネル・会話・レースの再生・セーブ)
// ルールの計算は game.js にまかせて、ここでは「見せる・押す」だけを書きます。

import * as G from './game.js?v=5';
import {
  STATS, STAT_LABEL, STYLE_LABEL, GROWTH_LABEL, SURFACE_LABEL, MOOD_LABEL, PERSONALITIES, COATS, PLANS, YOUNG_PLANS,
  PEOPLE, JOCKEYS, HEART_EVENTS, FACILITIES, GOALS, STAKES,
} from './data.js?v=5';
import { horsePortrait, personFace, framePath, map2dSVG, AREAS, cupSVG } from './art.js?v=5';
import { radar, lineChart, barChart } from './charts.js?v=5';
import * as A from './audio.js?v=5';
import { createRace2D } from './race2d.js?v=5';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const yen = (v) => `${Math.round(v).toLocaleString()}万円`;
const hearts = (b) => '♥'.repeat(Math.floor(b / 20)) + '♡'.repeat(5 - Math.floor(b / 20));

const BUILD = 5; // game.js の BUILD と同じにする
const AUTO_KEY = 'hidamari-save-auto';
const SLOT_KEY = (n) => `hidamari-save-${n}`;
const TABS = ['map', 'horses', 'people', 'album', 'system'];

let S = null;
let tab = 'map', area = null, selHorse = null, selMare = null, albumSub = 'album';
let ranch = null, ranchFailed = false, mapMode = '3d';
let raceView = null, race2d = null, raceFailed = false;
let busy = false; // 週をすすめている間・レース中
let msgQueue = [], msgTimer = null;

// ---------- 小さな道具 ----------
function toast(text, ms = 2600) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('on');
  clearTimeout(toast.tm);
  toast.tm = setTimeout(() => t.classList.remove('on'), ms);
}
function say(lines) {
  msgQueue = Array.isArray(lines) ? lines.filter(Boolean) : [lines];
  clearInterval(msgTimer);
  let i = 0;
  const show = () => { $('#msg').textContent = msgQueue[i % msgQueue.length] || ''; i++; };
  show();
  if (msgQueue.length > 1) msgTimer = setInterval(show, 4200);
}
function keepScroll(el, fn) {
  const top = el.scrollTop;
  fn();
  el.scrollTop = top;
}

// ---------- まど(モーダル) ----------
let modalResolve = null, modalDismiss = false;
function modal(html, { wide = false, dismiss = false } = {}) {
  return new Promise((res) => {
    if (modalResolve) { const r = modalResolve; modalResolve = null; r(null); }
    const card = $('#modalCard');
    card.className = 'modal-card' + (wide ? ' wide' : '');
    card.innerHTML = html;
    $('#modal').classList.remove('hidden');
    modalResolve = res;
    modalDismiss = dismiss;
    const f = card.querySelector('input[type=text]');
    if (f) setTimeout(() => f.focus(), 50);
  });
}
function closeModal(v = null) {
  $('#modal').classList.add('hidden');
  const r = modalResolve;
  modalResolve = null;
  r?.(v);
}
const modalOpen = () => !$('#modal').classList.contains('hidden');

async function dialogue(pid, lines) {
  for (let i = 0; i < lines.length; i++) {
    A.sfx('talk');
    const name = pid ? PEOPLE[pid].name : '';
    await modal(`<div class="talk"><div class="face">${pid ? personFace(pid) : ''}</div>
      <div class="bubble">${name ? `<div class="muted">${esc(name)}</div>` : ''}${esc(lines[i])}</div></div>
      <div class="actions"><button class="btn primary" data-choice="next">${i < lines.length - 1 ? 'つぎへ ▶' : 'とじる'}</button></div>`);
  }
}
async function info(title, text, extra = '') {
  await modal(`<h3>${esc(title)}</h3><p style="line-height:1.8">${esc(text)}</p>${extra}<div class="actions"><button class="btn primary" data-choice="ok">OK</button></div>`, { dismiss: true });
}
async function confirmBox(title, text, yes = 'はい', no = 'やめる') {
  const v = await modal(`<h3>${esc(title)}</h3><p style="line-height:1.8">${esc(text)}</p><div class="actions"><button class="btn" data-choice="no">${esc(no)}</button><button class="btn primary" data-choice="yes">${esc(yes)}</button></div>`, { dismiss: true });
  return v === 'yes';
}

// ---------- セーブ ----------
function saveTo(key) {
  try {
    localStorage.setItem(key, JSON.stringify(S));
    return true;
  } catch (e) {
    toast('セーブできませんでした。ブラウザの保存領域がいっぱいか、プライベートモードの可能性があります。「システム」の「セーブデータを書き出す」でコードを控えておくと安心です。', 6000);
    return false;
  }
}
function loadFrom(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return G.validate(JSON.parse(raw));
  } catch (e) {
    toast('セーブデータを読めませんでした。データがこわれている可能性があります。', 5000);
    return null;
  }
}
function slotMeta(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return { label: `${s.ranchName} ${G.calendar(s.year, s.week).label}`, money: s.money, horses: s.horses.length };
  } catch { return { label: '(読めないデータ)' }; }
}
function exportCode() { return btoa(unescape(encodeURIComponent(JSON.stringify(S)))); }
function importCode(code) {
  const json = decodeURIComponent(escape(atob(code.trim())));
  return G.validate(JSON.parse(json));
}

// ---------- タイトル ----------
function showTitle() {
  $('#app').classList.add('hidden');
  $('#title').classList.remove('hidden');
  $('#titleHorse').innerHTML = horsePortrait({ coat: 'kurige', blaze: true }, { bg: false });
  $('#btnContinue').classList.toggle('hidden', !localStorage.getItem(AUTO_KEY));
  A.music('title');
}
async function newGameFlow() {
  const v = await modal(`<h3>あたらしい牧場</h3>
    <p class="lead">牧場の名前と、あなたの名前を決めてください(あとから変えられません)。</p>
    <div class="list"><label>牧場の名前<br><input type="text" id="ngRanch" value="ひだまり牧場" maxlength="12"></label>
    <label>あなたの名前<br><input type="text" id="ngOwner" value="オーナー" maxlength="10"></label></div>
    <div class="actions"><button class="btn" data-choice="cancel">もどる</button><button class="btn primary" data-choice="ok" id="ngOk">はじめる</button></div>`, { dismiss: true });
  if (v !== 'ok') return;
  const ranchName = (newGameFlow.r || 'ひだまり牧場').trim() || 'ひだまり牧場';
  const ownerName = (newGameFlow.o || 'オーナー').trim() || 'オーナー';
  S = G.newGame({ ranchName, ownerName });
  saveTo(AUTO_KEY);
  startGame();
  await dialogue('haru', [
    `おう、来たか。今日からあんたが「${ranchName}」のオーナーだな。`,
    '先代から話は聞いてる。小さい牧場だが、馬たちはみんないい子だ。',
    'いまいるのは、3歳のコハルビヨリ、2歳のドングリ、1歳のマツボックリ。それから、おなかに子がいるハナミチだ。',
    'コハルビヨリは、もうすぐにでもレースに出られるぞ。まだ勝ててないから、初勝利をプレゼントしてやってくれ。',
    '右下の「🏁 レース」から出走できる。レース中、最後の直線で「スパート!」を押すのを忘れるなよ。',
    '困ったら右上の「!」を見な。やることが書いてある。さあ、はじめようか。',
  ]);
  renderAll();
}
async function loadFlow() {
  const rows = [1, 2, 3].map((n) => {
    const m = slotMeta(SLOT_KEY(n));
    return `<div class="item"><div class="grow"><b>スロット${n}</b><br><span class="muted">${m ? esc(m.label) : '(からっぽ)'}</span></div>
      <button class="btn small primary" data-choice="slot${n}" ${m ? '' : 'disabled'}>読む</button></div>`;
  }).join('');
  const auto = slotMeta(AUTO_KEY);
  const v = await modal(`<h3>セーブデータを読む</h3>
    <div class="list">
      <div class="item"><div class="grow"><b>オートセーブ</b><br><span class="muted">${auto ? esc(auto.label) : '(からっぽ)'}</span></div><button class="btn small primary" data-choice="auto" ${auto ? '' : 'disabled'}>読む</button></div>
      ${rows}
    </div>
    <div class="sub-h">書き出したコードから読む</div>
    <textarea id="importBox" placeholder="ここにセーブデータのコードをはりつけ"></textarea>
    <div class="actions"><button class="btn" data-choice="cancel">もどる</button><button class="btn primary" data-choice="code">コードから読む</button></div>`, { dismiss: true });
  if (!v || v === 'cancel') return;
  let s = null;
  if (v === 'auto') s = loadFrom(AUTO_KEY);
  else if (v.startsWith('slot')) s = loadFrom(SLOT_KEY(v.slice(4)));
  else if (v === 'code') {
    try { s = importCode(loadFlow.code || ''); } catch { await info('読めませんでした', 'コードの形がちがうようです。書き出したコードを、最初から最後まで全部はりつけてください。'); return; }
  }
  if (!s) return;
  S = s;
  saveTo(AUTO_KEY);
  startGame();
}

// ---------- ゲーム開始 ----------
async function startGame() {
  $('#title').classList.add('hidden');
  $('#app').classList.remove('hidden');
  tab = 'map'; area = null;
  setTab('map', true);
  A.music('ranch');
  renderAll();
  if (!ranch && !ranchFailed) await init3D();
  applyMapMode();
  renderAll();
  processPending();
}

async function init3D() {
  try {
    const mod = await import('./ranch3d.js?v=5');
    ranch = mod.createRanch($('#view3d'), {
      onArea: (a) => { A.sfx('open'); openArea(a); },
      onHorse: (id) => { A.sfx('neigh'); selHorse = id; openArea('stable'); },
      onFrame: placeHotspots,
    });
  } catch (e) {
    console.warn('3D を使えません:', e);
    ranchFailed = true;
    mapMode = '2d';
    toast('3D の絵を読みこめませんでした(インターネットの接続か、ブラウザの 3D 機能を確認してください)。絵地図で遊べます。', 6000);
  }
}
function applyMapMode() {
  const use3d = mapMode === '3d' && ranch;
  $('#view3d').classList.toggle('hidden', !use3d);
  $('#map2d').classList.toggle('hidden', use3d);
  $('#hotspots').classList.toggle('hidden', !use3d);
  ranch?.setActive(use3d && tab === 'map');
  if (!use3d) $('#map2d').innerHTML = map2dSVG(S);
}

// ---------- マップの名札 ----------
const HOT_AREAS = ['stable', 'track', 'office', 'house', 'breed', 'workshop', 'town', 'hill', 'racecourse'];
const HOT_LABEL = (k) => (k === 'racecourse' ? { icon: '🏟', label: '競馬場' } : AREAS[k]);
let dots = {};
function buildHotspots() {
  $('#hotspots').innerHTML = HOT_AREAS.map((k) => `<button class="hot" data-act="area" data-area="${k}" id="hot-${k}"><span class="ic">${HOT_LABEL(k).icon}</span>${HOT_LABEL(k).label}<span class="dot hidden"></span></button>`).join('');
}
function placeHotspots(project) {
  for (const k of HOT_AREAS) {
    const el = document.getElementById('hot-' + k);
    if (!el) continue;
    const p = project(k);
    el.style.left = p.x + '%';
    el.style.top = p.y + '%';
    el.style.visibility = p.visible && p.x > 2 && p.x < 98 && p.y > 4 && p.y < 100 ? 'visible' : 'hidden';
  }
}
function computeDots() {
  const s = S;
  const free = s.horses.filter((h) => h.role === 'race' && !h.entry && h.fatigue < 70 && G.racesForWeek(s.year, s.week).some((r) => G.eligible(s, h, r).ok));
  dots = {
    stable: false,
    office: free.length > 0,
    house: false,
    breed: (G.breedingOpen(s) && s.horses.some((h) => h.role === 'brood' && !h.pregnant)) || s.horses.some((h) => h.needsName),
    town: !!G.marketOpen(s) && s.market.some((m) => !m.sold),
    track: s.horses.some((h) => h.role === 'race' && h.fatigue >= 70 && !['rest', 'pasture'].includes(h.plan) && !h.auto),
    workshop: false,
    hill: false,
  };
  for (const k of HOT_AREAS) {
    const el = document.getElementById('hot-' + k);
    if (!el) continue;
    el.querySelector('.dot').classList.toggle('hidden', !dots[k]);
    el.classList.toggle('dim', k === 'hill' && !s.facilities.hill);
  }
}

// ---------- タブ ----------
function setTab(t, silent) {
  tab = t;
  $('#app').classList.toggle('tab-map', t === 'map');
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  document.querySelectorAll('.tab-page').forEach((p) => p.classList.toggle('on', p.id === 'page-' + t));
  ranch?.setActive(t === 'map' && mapMode === '3d');
  if (!silent) A.sfx('tab');
  renderTab();
}
function cycleTab(d) { setTab(TABS[(TABS.indexOf(tab) + d + TABS.length) % TABS.length]); }

// ---------- 全部を描き直す ----------
function renderAll() {
  if (!S) return;
  renderStatus();
  renderQuest();
  renderTab();
  if (area) renderArea();
  ranch?.update(S, G.nowCal(S));
  if (mapMode === '2d' || !ranch) $('#map2d').innerHTML = map2dSVG(S);
  if (!$('#hotspots').children.length) buildHotspots();
  computeDots();
}
function renderNextButton() {
  const n = S.horses.filter((h) => h.entry && G.findRace(S, h.entry.raceId)?.ahead === 0).length;
  $('#keyNext').innerHTML = n ? `<b>Space</b>🏁 1週すすめる(レース${n}頭)` : '<b>Space</b>1週すすめる';
  $('#keyNext').classList.toggle('racing', n > 0);
  const can = S.horses.some((h) => h.role === 'race' && !h.entry && G.racesForWeek(S.year, S.week).some((r) => G.eligible(S, h, r).ok));
  $('#keyRace').classList.toggle('ping', can);
}
function renderStatus() {
  renderNextButton();
  const c = G.nowCal(S);
  $('#status').innerHTML = `<span class="cal">${c.label}</span><span>${{ spring: '🌸', summer: '🌻', autumn: '🍁', winter: '⛄' }[c.season]} ${c.seasonLabel}</span>
    <span class="money ${S.money < 0 ? 'neg' : ''}">💰 ${yen(S.money)}</span><span title="にんじん">🥕 ${S.carrots}</span>
<span title="馬房">🏠 ${G.stallsUsed(S)}/${G.capacity(S)}</span>`;
}
function renderQuest() {
  const g = G.currentGoal(S);
  $('#questText').textContent = g ? g.text : 'すべての目標を達成! 自由に牧場を楽しもう';
}
function renderTab() {
  if (!S) return;
  if (tab === 'horses') keepScroll($('#page-horses'), renderHorsesPage);
  if (tab === 'people') keepScroll($('#page-people'), renderPeoplePage);
  if (tab === 'album') keepScroll($('#page-album'), renderAlbumPage);
  if (tab === 'system') keepScroll($('#page-system'), renderSystemPage);
}

// ---------- 地図のパネル ----------
function openArea(a) {
  if (a === 'racecourse') a = 'office';
  if (a === 'pond') { toast('池のほとり。アヒルがのんびり泳いでいる。'); return; }
  area = a;
  if (tab !== 'map') setTab('map', true);
  $('#areaPanel').classList.remove('hidden');
  renderArea();
  ranch?.focus(a);
}
function closeArea() {
  area = null;
  $('#areaPanel').classList.add('hidden');
  ranch?.resetView?.();
}
function renderArea() {
  const p = $('#areaPanel');
  const fn = { stable: areaStable, track: areaTrack, office: areaOffice, house: areaHouse, breed: areaBreed, town: areaTown, workshop: areaWorkshop, hill: areaHill }[area];
  if (!fn) return;
  keepScroll(p, () => { p.innerHTML = `<button class="close" data-act="close-panel" aria-label="閉じる">✕</button>` + fn(); });
}

function horseLine(h, extra = '') {
  return `<div class="portrait">${horsePortrait(h)}</div>
    <div class="grow"><div class="name">${esc(h.name)} <span class="muted">${h.sex}${G.horseAge(S, h)}</span></div>
    <div class="row muted">${esc(G.roleLabel(S, h))} <span class="mood mood-${h.mood}">${MOOD_LABEL[h.mood]}</span>${h.injury ? `<span class="tag warn">ケガ あと${h.injury}週</span>` : ''}</div>${extra}</div>`;
}
function fatBar(h) { return `<div class="bar fat" title="疲れ ${Math.round(h.fatigue)}"><i style="width:${h.fatigue}%"></i></div>`; }

function careButton(h) {
  return G.caredThisWeek(S, h)
    ? '<span class="tag own">💗 今週はふれあいずみ</span>'
    : `<button class="btn small rose" data-act="care" data-id="${h.id}">🤲 ふれあう</button>`;
}
function areaStable() {
  const left = S.horses.filter((h) => !G.caredThisWeek(S, h)).length;
  const list = S.horses.map((h) => `<div class="item ${selHorse === h.id ? 'sel' : ''}">
    ${horseLine(h, `<div class="row" style="margin-top:4px"><span class="hearts" title="絆 ${Math.round(h.bond)}">${hearts(h.bond)}</span><span class="muted">疲れ</span><div class="grow">${fatBar(h)}</div></div>
      <div class="row" style="margin-top:6px">${careButton(h)}
        <button class="btn small" data-act="horse-detail" data-id="${h.id}">くわしく</button>
        ${h.needsName ? `<button class="btn small rose" data-act="name" data-id="${h.id}">名前をつける</button>` : ''}
      </div>`)}</div>`).join('');
  return `<h2>🐴 厩舎</h2><p class="lead">「ふれあう」と、その馬が好きなこと(ブラッシング・にんじん・おさんぽ)をして絆が深まります。1頭につき週1回。やらなくても、毎日の暮らしで絆は少しずつ深まります。</p>
    ${left ? `<button class="btn primary" style="margin-bottom:10px" data-act="care-all">🤲 みんなとふれあう(${left}頭)</button>` : '<p class="muted">今週は全員とふれあいました。</p>'}
    <div class="list">${list}</div>`;
}
function planChips(h) {
  const age = G.horseAge(S, h);
  if (h.role === 'foal') {
    return `<div class="row">${Object.entries(YOUNG_PLANS).map(([k, p]) => `<button class="btn small ${h.plan === k ? 'primary' : ''}" data-act="plan" data-id="${h.id}" data-plan="${k}" ${p.minAge && age < p.minAge ? 'disabled' : ''}>${p.icon} ${p.short}</button>`).join('')}</div>`;
  }
  if (h.role !== 'race') return '';
  const trainerOk = G.bondOf(S, 'midori') >= 90;
  return `<div class="row">${Object.entries(PLANS).filter(([k, p]) => !p.needTrainer || trainerOk).map(([k, p]) => `<button class="btn small ${!h.auto && h.plan === k ? 'primary' : ''}" data-act="plan" data-id="${h.id}" data-plan="${k}" ${h.injury ? 'disabled' : ''}>${p.icon} ${p.short}</button>`).join('')}
    <button class="btn small ${h.auto ? 'gold' : ''}" data-act="auto" data-id="${h.id}" title="疲れや能力を見て、みどり先生が毎週メニューを決めます">🤝 おまかせ</button></div>`;
}
function areaTrack() {
  const racers = S.horses.filter((h) => h.role === 'race');
  const young = S.horses.filter((h) => h.role === 'foal');
  const rows = racers.map((h) => `<div class="item"><div class="grow">
      <div class="row"><b>${esc(h.name)}</b><span class="mood mood-${h.mood}">${MOOD_LABEL[h.mood]}</span><span class="muted">${G.peakLabel(S, h)}</span>${h.entry ? '<span class="tag own">今週レース</span>' : ''}</div>
      <div class="row" style="margin:4px 0"><span class="muted">疲れ</span><div class="grow">${fatBar(h)}</div>${h.fatigue >= 60 ? '<span class="tag warn">休ませよう</span>' : ''}</div>
      ${h.injury ? `<span class="muted">ケガの治療中(あと${h.injury}週)。馬房で休んでいます。</span>` : planChips(h)}
    </div></div>`).join('');
  const yrows = young.map((h) => `<div class="item"><div class="grow"><div class="row"><b>${esc(h.name)}</b><span class="muted">${G.horseAge(S, h)}歳</span></div>${planChips(h)}</div></div>`).join('');
  return `<h2>🏇 調教コース</h2><p class="lead">今週の調教メニューを決めよう。調教すると能力がのびるけれど、疲れがたまります。疲れが多いとケガをしやすいので、ときどき休ませてね。<br>「おまかせ」にすると、毎週みどり先生がメニューを決めてくれます。</p>
    <div class="row" style="margin-bottom:8px"><button class="btn small" data-act="rest-tired">😴 疲れた馬(60以上)をまとめて休ませる</button></div>
    <div class="list">${rows || '<p class="muted">競走馬はいません。</p>'}</div>
    ${young.length ? `<div class="sub-h">子馬たち</div><div class="list">${yrows}</div>` : ''}`;
}

function raceText(r) {
  return `${r.grade ? `[${r.grade}] ` : ''}${r.label} ${SURFACE_LABEL[r.surface]}${r.dist}m`;
}
function gradeTag(g) { return g ? `<span class="tag ${g.toLowerCase()}">${g}</span>` : ''; }
function defaultJockey(h) {
  const jk = JOCKEYS.filter((j) => G.jockeyAvailable(S, j));
  if (h.jockey && jk.includes(h.jockey)) return h.jockey;
  // 絆の深い騎手 → 脚質が得意な騎手 の順におすすめ
  return jk.slice().sort((a, b) => ((h.jbond[b] || 0) - (h.jbond[a] || 0)) || (PEOPLE[b].jockey.styles.includes(h.style) - PEOPLE[a].jockey.styles.includes(h.style)))[0];
}
function whenText(r) {
  const c = G.calendar(r.year, r.week);
  return r.ahead === 0 ? '今週' : `${r.ahead}週後(${c.month}月第${c.wk}週)`;
}
// 出走できない理由(この先8週)
function noRaceReason(h) {
  if (h.injury) return `ケガの治療中です(あと${h.injury}週)。治ったらまた走れます。`;
  if (G.horseAge(S, h) === 2 && S.week < 21) {
    const left = 21 - S.week;
    return `2歳馬のデビュー戦(新馬戦)は6月から。あと${left}週です。${left > G.RESERVE_WEEKS ? 'それまでは調教で力をつけよう。' : ''}`;
  }
  return 'この先8週のあいだに、出られるレースがありません。';
}
function horseRaceStatus(h) {
  if (h.entry) {
    const r = G.findRace(S, h.entry.raceId);
    return { cls: 'own', text: r ? `${whenText(r)} 出走予定` : '出走予定' };
  }
  const ok = G.upcomingRaces(S).filter((r) => G.eligible(S, h, r).ok);
  if (!ok.length) return { cls: 'warn', text: h.injury ? 'ケガ' : 'まだ出られない' };
  if (ok.some((r) => r.ahead === 0)) return { cls: '', text: '今週出られる!' };
  return { cls: '', text: '予約できる' };
}
let raceHorse = null, raceShowAll = false;
function raceCard(h, r, jockey) {
  const hint = G.winChanceHint(S, h, r, jockey);
  const da = G.aptLetter(G.distApt(h, r.dist)), sa = h.surface === r.surface ? 'A' : 'C';
  return `<div class="race-card ${r.grade ? 'stakes' : ''}">
    <div class="row">${r.grade ? gradeTag(r.grade) : ''}<b>${esc(r.label)}</b><span class="grow"></span><span class="muted">${whenText(r)}</span></div>
    <div class="row muted">${SURFACE_LABEL[r.surface]}${r.dist}m <span class="apt">距離${da}</span><span class="apt">${SURFACE_LABEL[r.surface]}${sa}</span>・1着賞金 <b>${r.prize.toLocaleString()}万円</b></div>
    <div class="row"><span class="hint ${hint.cls}">${hint.label}</span><span class="grow"></span>
      <button class="btn small primary" data-act="enter" data-id="${h.id}" data-race="${r.id}">${r.ahead === 0 ? 'このレースに出る' : 'このレースを予約'}</button></div>
  </div>`;
}
function areaOffice() {
  const racers = S.horses.filter((h) => h.role === 'race');
  if (!racers.length) return `<h2>🏁 レース事務所</h2><p class="lead">競走馬がいません。子馬は2歳になると競走馬になります。</p>`;
  if (!racers.some((h) => h.id === raceHorse)) raceHorse = (racers.find((h) => !h.entry && G.upcomingRaces(S).some((r) => G.eligible(S, h, r).ok)) || racers[0]).id;
  const h = G.findHorse(S, raceHorse);
  // ① 馬をえらぶ
  const chips = racers.map((x) => {
    const st = horseRaceStatus(x);
    return `<button class="horse-chip ${x.id === raceHorse ? 'sel' : ''}" data-act="race-horse" data-id="${x.id}">
      <span class="portrait">${horsePortrait(x)}</span><span><b>${esc(x.name)}</b><br><span class="tag ${st.cls}">${st.text}</span></span></button>`;
  }).join('');
  // ② レースをえらぶ
  let step2 = '';
  if (h.entry) {
    const r = G.findRace(S, h.entry.raceId);
    step2 = `<div class="entry-box"><div>✅ <b>${esc(h.name)}</b> は <b>${r ? esc(whenText(r)) : ''}の「${r ? esc(r.label) : ''}」</b>に出走します。</div>
      <div class="muted">${r ? `${SURFACE_LABEL[r.surface]}${r.dist}m / ` : ''}騎手:${esc(PEOPLE[h.entry.jockey].name)}</div>
      <div class="row" style="margin-top:6px"><button class="btn small" data-act="cancel-entry" data-id="${h.id}">登録をとりけす</button></div></div>`;
  } else {
    const all = G.upcomingRaces(S).filter((r) => G.eligible(S, h, r).ok);
    const jk = JOCKEYS.filter((j) => G.jockeyAvailable(S, j));
    const defJ = defaultJockey(h);
    const list = raceShowAll ? all : all.filter((r) => r.ahead === 0 || r.kind === 'stakes' || r.ahead <= 3);
    if (!all.length) {
      step2 = `<div class="entry-box warn">${esc(noRaceReason(h))}</div>`;
    } else {
      step2 = `<div class="row" style="margin-bottom:6px"><span class="muted">騎手:</span><select id="raceJockey">${jk.map((j) => `<option value="${j}" ${j === defJ ? 'selected' : ''}>${esc(PEOPLE[j].name)}(${PEOPLE[j].jockey.styles.map((x) => STYLE_LABEL[x]).join('・')}が得意・${PEOPLE[j].jockey.fee}万円)${j === defJ ? ' おすすめ' : ''}</option>`).join('')}</select></div>
        <p class="muted" style="margin:0 0 6px">得意:${SURFACE_LABEL[h.surface]} ${h.dist}m前後 / ${STYLE_LABEL[h.style]} / 疲れ ${Math.round(h.fatigue)}${h.fatigue >= 60 ? ' <b style="color:var(--danger)">(疲れぎみ。休ませてからがおすすめ)</b>' : ''}</p>
        <div class="list">${list.map((r) => raceCard(h, r, defJ)).join('')}</div>
        ${all.length > list.length ? `<button class="btn small" style="margin-top:8px" data-act="race-all">ほかのレースも見る(あと${all.length - list.length}件)</button>` : ''}`;
    }
  }
  const anyNow = racers.some((x) => x.entry && G.findRace(S, x.entry.raceId)?.ahead === 0);
  const canFF = !racers.some((x) => x.entry) && !racers.some((x) => G.racesForWeek(S.year, S.week).some((r) => G.eligible(S, x, r).ok));
  return `<h2>🏁 レース事務所</h2>
    <div class="steps"><span class="${h ? 'done' : ''}">① 馬をえらぶ</span>›<span class="${h?.entry ? 'done' : ''}">② レースをえらぶ</span>›<span class="${anyNow ? 'done' : ''}">③「1週すすめる」でスタート</span></div>
    <div class="sub-h">① 走る馬をえらぶ</div><div class="horse-chips">${chips}</div>
    <div class="sub-h">② ${esc(h.name)} のレースをえらぶ</div>
    <p class="muted" style="margin:0 0 6px">今週のレースと、8週先までのレースを予約できます。予想(◎○△×)は、いまの能力と調子からの目安です。</p>
    ${step2}
    <div class="sub-h">③ レースを始める</div>
    <p class="muted">${anyNow ? '今週レースがあります! 右下の <b>「1週すすめる」</b> を押すと、レースが始まります。' : '登録したレースの週になったら、右下の「1週すすめる」でレースが始まります。'}</p>
    ${canFF ? `<button class="btn small gold" data-act="ffwd">⏩ レースに出られる週まで すすめる</button>` : ''}
    <div class="sub-h">牧場のお金</div><p class="muted">1週間の費用:約 ${G.weekCosts(S)}万円。賞金と種付け料が収入になります。</p>`;
}
const y2age = (h, y) => y - h.birthYear;

function personMini(pid) {
  const p = S.people[pid], P = PEOPLE[pid];
  const locked = !G.jockeyAvailable(S, pid);
  if (locked) return `<div class="item"><div class="portrait" style="filter:grayscale(1) opacity(.5)">${personFace(pid)}</div><div class="grow"><b>???</b><div class="muted">まだ知り合っていません(初勝利をあげると…?)</div></div></div>`;
  return `<div class="item"><div class="portrait">${personFace(pid)}</div><div class="grow">
    <div class="row"><b>${esc(P.name)}</b><span class="muted">${esc(P.role)}</span></div>
    <div class="row"><span class="hearts">${hearts(p.bond)}</span><span class="muted">なかよし度 ${Math.round(p.bond)}</span></div>
    <div class="row" style="margin-top:4px"><button class="btn small primary" data-act="talk" data-pid="${pid}" ${p.talked ? 'disabled' : ''}>💬 おはなし</button>
    <button class="btn small" data-act="gift" data-pid="${pid}" ${p.gifted ? 'disabled' : ''}>🎁 差し入れ(3万円)</button></div></div></div>`;
}
function areaHouse() {
  return `<h2>🏡 母屋</h2><p class="lead">牧場のなかまたちが集まる場所。おはなしは気が向いたときだけで大丈夫。週のおわりの「できごと」やレースでも、自然となかよくなれます。</p>
    <div class="list">${Object.keys(PEOPLE).map(personMini).join('')}</div>`;
}

function studCard(st, mare) {
  const avg = Math.round(Object.values(st.caps).reduce((a, b) => a + b, 0) / 5);
  const afford = S.money >= st.fee;
  return `<div class="item"><div class="portrait">${horsePortrait({ coat: st.coat, blaze: false })}</div><div class="grow">
    <div class="row"><b>${esc(st.name)}</b>${st.own ? '<span class="tag own">うちの子</span>' : ''}<span class="muted">${esc(st.note || '')}</span></div>
    <div class="muted">素質 ${G.rank(avg)} / ${SURFACE_LABEL[st.surface]} ${st.dist}m前後 / ${GROWTH_LABEL[st.growth]} / 種付け料 ${st.fee ? st.fee + '万円' : '無料'}</div>
    ${mare ? `<button class="btn small primary" style="margin-top:4px" data-act="breed" data-mare="${mare.id}" data-stud="${st.id}" ${afford ? '' : 'disabled'}>この馬と種付けする</button>` : ''}
  </div></div>`;
}
function areaBreed() {
  const mares = S.horses.filter((h) => h.role === 'brood');
  const studs = S.horses.filter((h) => h.role === 'stud');
  const foals = S.horses.filter((h) => h.role === 'foal');
  const open = G.breedingOpen(S);
  if (selMare && !mares.some((m) => m.id === selMare && !m.pregnant)) selMare = null;
  const mareRows = mares.map((m) => `<div class="item ${selMare === m.id ? 'sel' : ''}">${horseLine(m, `<div class="muted">${m.pregnant ? `おなかに ${esc(m.pregnant.studName)} との子(${m.pregnant.dueYear}年目の春に誕生予定)` : open ? '種付けできます' : '種付けは春(3〜5月)'} </div>
    ${!m.pregnant && open ? `<button class="btn small ${selMare === m.id ? 'primary' : ''}" style="margin-top:4px" data-act="pick-mare" data-id="${m.id}">相手を選ぶ</button>` : ''}`)}</div>`).join('');
  const mare = mares.find((m) => m.id === selMare);
  return `<h2>🍼 繁殖場</h2><p class="lead">繁殖牝馬に種付けをすると、次の年の春に子馬が生まれます。子は父と母の素質を受けつぎます。牝馬は引退すると繁殖牝馬になれます。</p>
    <div class="sub-h">繁殖牝馬</div><div class="list">${mareRows || '<p class="muted">繁殖牝馬はいません。活躍した牝馬を引退させるか、12月のセールでむかえよう。</p>'}</div>
    ${mare ? `<div class="sub-h">${esc(mare.name)}の相手をえらぶ</div><div class="list">${G.studList(S).map((st) => studCard(st, mare)).join('')}</div>` : ''}
    ${foals.length ? `<div class="sub-h">子馬たち</div><div class="list">${foals.map((f) => `<div class="item">${horseLine(f, f.needsName ? `<button class="btn small rose" style="margin-top:4px" data-act="name" data-id="${f.id}">名前をつける</button>` : `<div class="muted">父 ${esc(f.sire)} / 母 ${esc(f.dam)}</div>`)}</div>`).join('')}</div>` : ''}
    ${studs.length ? `<div class="sub-h">種牡馬</div><div class="list">${studs.map((h) => `<div class="item">${horseLine(h)}</div>`).join('')}</div>` : ''}`;
}

function areaTown() {
  const kind = G.marketOpen(S);
  let market = '';
  if (kind) {
    const view = G.marketView(S);
    market = `<div class="sub-h">${kind === 'yearling' ? '1歳馬のセリ(7月)' : '繁殖牝馬セール(12月)'}</div>
      <p class="muted">${G.bondOf(S, 'takanashi') >= 60 ? '小鳥遊先生が見立ててくれています(★は正確)。' : '★は見た目からの予想です(小鳥遊先生となかよくなると、正確に見てもらえます)。'}</p>
      <div class="list">${view.map((m, i) => `<div class="item">${horseLine(m.horse, `<div class="muted">父 ${esc(m.horse.sire)} / 母 ${esc(m.horse.dam)} / ${COATS[m.horse.coat].label} / ${esc(m.horse.personality)}</div>
        <div class="row"><span style="color:var(--gold)">${'★'.repeat(m.stars)}${'☆'.repeat(5 - m.stars)}</span>${m.showCaps ? `<span class="muted">素質 ${G.rank(G.potential(m.horse))}</span>` : ''}<span class="muted">得意 ${SURFACE_LABEL[m.horse.surface]}${m.horse.dist}m</span></div>
        <div class="row" style="margin-top:4px"><b>${yen(m.price)}</b>${m.sold ? '<span class="tag">売約ずみ</span>' : `<button class="btn small primary" data-act="buy" data-idx="${i}" ${S.money < m.price ? 'disabled' : ''}>買う</button>`}</div>`)}</div>`).join('')}</div>`;
  } else market = '<p class="muted">セリは7月(1歳馬)と12月(繁殖牝馬)にひらかれます。</p>';
  return `<h2>🛍 町</h2><p class="lead">町では買いものができます。</p>
    <div class="item"><div class="portrait" style="display:grid;place-items:center;font-size:30px">🥕</div><div class="grow"><b>にんじん 10本</b><div class="muted">5万円。いまは ${S.carrots} 本</div></div><button class="btn small primary" data-act="carrots">買う</button></div>
    ${market}`;
}

function areaWorkshop() {
  const rows = Object.entries(FACILITIES).map(([k, f]) => {
    const lv = S.facilities[k];
    const cost = G.facilityCost(S, k);
    const lvText = f.max > 1 ? `レベル ${lv}/${f.max}` : lv ? '建設ずみ' : 'まだない';
    return `<div class="item"><div class="portrait" style="display:grid;place-items:center;font-size:28px">${f.icon}</div><div class="grow">
      <div class="row"><b>${f.label}</b><span class="tag">${lvText}</span></div><div class="muted">${f.desc}</div>
      ${cost == null ? '' : `<button class="btn small primary" style="margin-top:4px" data-act="build" data-key="${k}" ${S.money < cost ? 'disabled' : ''}>${lv && f.max > 1 ? 'レベルアップ' : '建てる'}(${yen(cost)})</button>`}</div></div>`;
  }).join('');
  return `<h2>🔨 工房</h2><p class="lead">牧場の施設を建てたり、大きくしたりできます。建てたものは箱庭にあらわれます。</p><div class="list">${rows}</div>`;
}

function areaHill() {
  if (!S.facilities.hill) return `<h2>🌳 ひだまりの丘</h2><p class="lead">まだ何もない、日あたりのいい丘です。「工房」で「ひだまりの丘」を建てると、引退した馬たちがここでのんびり暮らせます。</p>`;
  const here = S.retired.filter((r) => r.dest === 'hill');
  return `<h2>🌳 ひだまりの丘</h2><p class="lead">引退した馬たちが、のんびり暮らしています。</p>
    <div class="list">${here.map((r) => `<div class="item">${retiredLine(r)}</div>`).join('') || '<p class="muted">まだだれもいません。</p>'}</div>`;
}
function retiredLine(r) {
  return `<div class="portrait">${horsePortrait(r)}</div><div class="grow"><b>${esc(r.name)}</b> <span class="muted">${r.sex} / ${r.year}年目に引退 / ${r.dest === 'hill' ? 'ひだまりの丘' : '乗馬クラブ'}</span>
    <div class="muted">${r.record.starts}戦${r.record.wins}勝 / 獲得賞金 ${yen(r.record.earnings)}${r.record.big.length ? ' / ' + r.record.big.map(esc).join('・') : ''}</div></div>`;
}

// ---------- ウマたちページ ----------
function renderHorsesPage() {
  const page = $('#page-horses');
  if (!S.horses.length) { page.innerHTML = '<p class="muted">馬がいません。</p>'; return; }
  if (!S.horses.some((h) => h.id === selHorse)) selHorse = S.horses[0].id;
  const groups = [['競走馬', (h) => h.role === 'race'], ['子馬', (h) => h.role === 'foal'], ['繁殖馬', (h) => h.role === 'brood' || h.role === 'stud']];
  const list = groups.map(([label, f]) => {
    const hs = S.horses.filter(f);
    if (!hs.length) return '';
    return `<div class="sub-h">${label}</div><div class="list">${hs.map((h) => `<div class="item click ${h.id === selHorse ? 'sel' : ''}" data-act="sel-horse" data-id="${h.id}">${horseLine(h)}</div>`).join('')}</div>`;
  }).join('');
  const prevList = page.querySelector('.two-col > div');
  const prevDetail = page.querySelector('.two-col > div:last-child');
  const s1 = prevList?.scrollTop || 0, s2 = prevDetail?.scrollTop || 0;
  page.innerHTML = `<div class="two-col"><div><h2 class="page-h">🐎 ウマたち <span class="muted">${S.horses.length}頭 / 馬房 ${G.capacity(S)}</span></h2>${list}</div><div>${horseDetail(G.findHorse(S, selHorse))}</div></div>`;
  const [a, b] = page.querySelectorAll('.two-col > div');
  a.scrollTop = s1; b.scrollTop = s2;
}
function horseDetail(h) {
  const age = G.horseAge(S, h);
  const seeCaps = G.bondOf(S, 'midori') >= 60;
  const stats = STATS.map((k) => `<span>${STAT_LABEL[k]}</span>
    <div class="bar">${seeCaps ? `<i class="cap" style="width:${h.caps[k]}%"></i>` : ''}<i style="width:${h.stats[k]}%"></i></div>
    <span class="rank">${G.rank(h.stats[k])}</span><span class="muted">${Math.round(h.stats[k])}${seeCaps ? ' / ' + h.caps[k] : ''}</span>`).join('');
  const jb = JOCKEYS.filter((j) => h.jbond[j]).map((j) => `<div class="row"><span>${esc(PEOPLE[j].name)}</span><div class="grow bar"><i style="width:${h.jbond[j]}%;background:var(--rose)"></i></div></div>`).join('');
  const retire = G.retireOptions(S, h);
  const rec = h.record;
  return `<div class="detail">
    <div class="detail-head"><div class="portrait big">${horsePortrait(h)}</div>
      <div class="grow"><h2>${esc(h.name)}</h2>
      <div class="row muted">${h.sex} ${age}歳 / ${COATS[h.coat].label} / ${esc(G.roleLabel(S, h))}</div>
      <div class="row" style="margin-top:6px"><span class="tag" title="${esc(PERSONALITIES[h.personality])}">性格:${esc(h.personality)}</span><span class="tag">${GROWTH_LABEL[h.growth]}</span>
        <span class="tag">${SURFACE_LABEL[h.surface]}</span><span class="tag">${h.dist}m前後</span><span class="tag">${STYLE_LABEL[h.style]}</span></div>
      <div class="muted" style="margin-top:4px">${esc(PERSONALITIES[h.personality])}</div>
      <div class="row" style="margin-top:8px">
        ${h.needsName ? `<button class="btn small rose" data-act="name" data-id="${h.id}">名前をつける</button>` : ''}
        ${h.role === 'race' ? `<button class="btn small primary" data-act="open-race" data-id="${h.id}">🏁 レースに出す</button>` : ''}
        ${retire.length ? `<button class="btn small" data-act="retire" data-id="${h.id}">引退させる</button>` : ''}
      </div></div></div>
    <div class="cols" style="margin-top:12px">
      <div><div class="sub-h">能力 ${seeCaps ? '<span class="muted">(うすい色 = のびしろ)</span>' : '<span class="muted">(みどり先生となかよくなると、のびしろが見える)</span>'}</div>
        <div class="stat-grid">${stats}</div>
        <div class="sub-h">いまの様子</div>
        <div class="row"><span class="mood mood-${h.mood}">${MOOD_LABEL[h.mood]}</span><span class="muted">${h.role === 'race' || h.role === 'foal' ? G.peakLabel(S, h) : ''}</span></div>
        <div class="row" style="margin-top:6px"><span class="muted">疲れ</span><div class="grow">${fatBar(h)}</div><span class="muted">${Math.round(h.fatigue)}</span></div>
        <div class="row" style="margin-top:6px"><span class="muted">絆</span><span class="hearts">${hearts(h.bond)}</span><span class="muted">${Math.round(h.bond)}</span></div>
        ${jb ? `<div class="sub-h">騎手との絆</div><div class="list">${jb}</div>` : ''}
      </div>
      <div><div style="text-align:center">${radar(h.stats, seeCaps ? h.caps : null)}</div>
        ${h.role === 'race' || h.role === 'foal' ? `<div class="sub-h">今週の予定</div>${planChips(h)}` : ''}
        <div class="sub-h">ふれあい</div>
        <div class="row">${careButton(h)}</div>
      </div>
    </div>
    <div class="sub-h">成績</div>
    <p>${rec.starts}戦 ${rec.wins}勝(3着以内 ${rec.places}回) / 獲得賞金 ${yen(rec.earnings)}${rec.big.length ? `<br>勝った重賞:${rec.big.map(esc).join('、')}` : ''}</p>
    ${h.pregnant ? `<p class="muted">おなかに ${esc(h.pregnant.studName)} との子どもがいます(${h.pregnant.dueYear}年目の春に誕生予定)。</p>` : ''}
    <div class="sub-h">血統</div><p class="muted">父 ${esc(h.sire)} / 母 ${esc(h.dam)}</p>
    ${h.memories.length ? `<div class="sub-h">思い出</div><div class="timeline">${h.memories.map((m) => `<div class="t"><b>★</b><span>${esc(m)}</span></div>`).join('')}</div>` : ''}
  </div>`;
}

// ---------- なかまページ ----------
function renderPeoplePage() {
  const cards = Object.keys(PEOPLE).map((pid) => {
    const P = PEOPLE[pid], p = S.people[pid];
    if (!G.jockeyAvailable(S, pid)) return `<div class="person"><div class="row"><div class="face" style="filter:grayscale(1) opacity(.5)">${personFace(pid)}</div><div><b>???</b><div class="muted">まだ知り合っていません。初勝利をあげると、だれかが連絡してくるかも。</div></div></div></div>`;
    const perks = P.perks.map(([at, t]) => `<div class="row" style="font-size:13px;${p.bond >= at ? '' : 'opacity:.45'}"><span class="tag ${p.bond >= at ? 'own' : ''}">${at}</span>${esc(t)}</div>`).join('');
    const evs = (HEART_EVENTS[pid] || []).filter((e) => p.seen.includes(e.at)).map((e) => `<button class="btn small" data-act="replay-heart" data-pid="${pid}" data-at="${e.at}">📖 思い出 ${e.at}</button>`).join('');
    return `<div class="person">
      <div class="row"><div class="face">${personFace(pid)}</div><div class="grow"><b style="font-size:17px">${esc(P.name)}</b><div class="muted">${esc(P.role)}</div>
        <div class="row"><span class="hearts">${hearts(p.bond)}</span><span class="muted">${Math.round(p.bond)}</span></div></div></div>
      <div class="muted">${esc(P.desc)}</div>
      <div class="bar"><i style="width:${p.bond}%;background:var(--rose)"></i></div>
      <div class="list" style="gap:4px">${perks}</div>
      <div class="row"><button class="btn small primary" data-act="talk" data-pid="${pid}" ${p.talked ? 'disabled' : ''}>💬 おはなし</button><button class="btn small" data-act="gift" data-pid="${pid}" ${p.gifted ? 'disabled' : ''}>🎁 差し入れ(3万円)</button>${evs}</div>
    </div>`;
  }).join('');
  $('#page-people').innerHTML = `<h2 class="page-h">🤝 なかま</h2><p class="lead">牧場を支えてくれる人たち。なかよし度が 30・60・90 になると、助けてくれることが増えます。20・50・80 では、ちょっとした物語が見られます。</p><div class="people-grid">${cards}</div>`;
}

// ---------- アルバムページ ----------
function renderAlbumPage() {
  const subs = [['album', '思い出'], ['trophy', 'トロフィー'], ['retired', '引退した馬'], ['records', '記録'], ['log', '牧場日誌']];
  let body = '';
  if (albumSub === 'album') body = `<div class="timeline">${S.album.map((a) => `<div class="t"><b>${a.y}年目 ${G.calendar(a.y, a.w).month}月</b><span>${esc(a.text)}</span></div>`).join('')}</div>`;
  if (albumSub === 'trophy') body = S.trophies.length ? `<div class="trophy-shelf">${S.trophies.slice().reverse().map((t) => `<div class="trophy"><div class="cup">${cupSVG(t.grade)}</div><b>${esc(t.race)}</b><br>${gradeTag(t.grade)}<div class="muted">${t.year}年目 / ${esc(t.horse)}<br>騎手 ${esc(t.jockey)}</div></div>`).join('')}</div>` : '<p class="muted">まだトロフィーはありません。重賞レースを勝つと、ここに飾られます。</p>';
  if (albumSub === 'retired') body = S.retired.length ? `<div class="list">${S.retired.slice().reverse().map((r) => `<div class="item">${retiredLine(r)}</div>`).join('')}</div>` : '<p class="muted">まだ引退した馬はいません。</p>';
  if (albumSub === 'records') {
    const ys = Object.entries(S.yearStats).map(([y, v]) => ({ label: `${y}年目`, v: v.wins }));
    const g1 = Object.entries(S.yearStats).map(([y, v]) => ({ label: `${y}年目`, v: v.g1, color: '#cfa456' }));
    body = `<div class="cols"><div class="card"><b>通算</b><p>${S.stats.races}戦 ${S.stats.wins}勝 / G1 ${S.stats.g1}勝<br>獲得賞金 ${yen(S.stats.earnings)}<br>重賞トロフィー ${S.trophies.length}個</p></div>
      <div class="card"><b>牧場</b><p>${S.horses.length}頭 / 引退した馬 ${S.retired.length}頭<br>目標 ${Object.keys(S.goals).length}/${GOALS.length} 達成</p></div></div>
      <div class="sub-h">お金のうつりかわり(万円)</div><div class="chart card">${lineChart(S.history.map((p) => ({ x: `${p.y}年${G.calendar(p.y, p.w).month}月`, y: p.money })))}</div>
      <div class="cols"><div><div class="sub-h">年ごとの勝利数</div><div class="chart card">${barChart(ys)}</div></div><div><div class="sub-h">年ごとのG1勝利</div><div class="chart card">${barChart(g1)}</div></div></div>`;
  }
  if (albumSub === 'log') body = `<div class="timeline">${S.log.slice(0, 120).map((l) => `<div class="t"><b>${l.y}年目 ${G.calendar(l.y, l.w).month}月${G.calendar(l.y, l.w).wk}週</b><span>${esc(l.text)}</span></div>`).join('')}</div>`;
  $('#page-album').innerHTML = `<h2 class="page-h">📔 アルバム</h2><div class="subtabs">${subs.map(([k, l]) => `<button class="${albumSub === k ? 'on' : ''}" data-act="album-sub" data-sub="${k}">${l}</button>`).join('')}</div>${body}`;
}

// ---------- システムページ ----------
function renderSystemPage() {
  const slots = [1, 2, 3].map((n) => {
    const m = slotMeta(SLOT_KEY(n));
    return `<div class="item"><div class="grow"><b>スロット${n}</b><div class="muted">${m ? esc(m.label) : '(からっぽ)'}</div></div>
      <button class="btn small primary" data-act="save-slot" data-slot="${n}">ここにセーブ</button><button class="btn small" data-act="load-slot" data-slot="${n}" ${m ? '' : 'disabled'}>読む</button></div>`;
  }).join('');
  const st = A.settings;
  $('#page-system').innerHTML = `<h2 class="page-h">⚙ システム</h2>
  <div class="cols">
    <div>
      <div class="sub-h">セーブ</div>
      <p class="muted">1週すすめるたびに、自動でセーブ(オートセーブ)しています。セーブはこのブラウザの中に保存されます。</p>
      <div class="list">${slots}</div>
      <div class="sub-h">ほかの端末にうつす</div>
      <p class="muted">「書き出す」で出てくるコードをメモしておくと、別のパソコンやスマホのタイトル画面「セーブデータを読む」から続きを遊べます。</p>
      <div class="row"><button class="btn small" data-act="export">セーブデータを書き出す</button></div>
      <textarea id="exportBox" class="hidden" readonly></textarea>
    </div>
    <div>
      <div class="sub-h">サウンド</div>
      <div class="list">
        <label class="row"><input type="checkbox" id="sndBgm" ${st.bgm ? 'checked' : ''}> BGM <input type="range" id="sndBgmVol" min="0" max="1" step="0.05" value="${st.bgmVol}" class="grow"></label>
        <label class="row"><input type="checkbox" id="sndSfx" ${st.sfx ? 'checked' : ''}> 効果音 <input type="range" id="sndSfxVol" min="0" max="1" step="0.05" value="${st.sfxVol}" class="grow"></label>
      </div>
      <div class="sub-h">表示</div>
      <div class="row"><button class="btn small" data-act="toggle-view">マップの表示を切り替える(3D / 絵地図)</button></div>
      <div class="sub-h">遊び方</div>
      <div class="card" style="font-size:13.5px;line-height:1.8">
        ・<b>マップ</b>の建物をクリックすると、その場所でできることが開きます(3D はドラッグで回せます)。<br>
        ・<b>レースに出るには</b>:右下の<b>「🏁 レース」</b>ボタン(または地図の「レース事務所」)→ ①馬をえらぶ → ②レースのカードの「このレースに出る」(8週先まで予約もできます)→ ③右下の<b>「1週すすめる」</b>でレースが始まります。<br>・<b>調教コース</b>で毎週のメニューを決めます(「おまかせ」もできます)。<br>
        ・レース中は<b>最後の直線で「💨 スパート!」</b>(Space キー)。目安の距離ぴったりで押すと伸びます。早すぎるとバテます。<br>
        ・<b>厩舎</b>の「ふれあう」(週1回・全員まとめてもOK)で馬との<b>絆</b>が深まります。やらなくても少しずつ深まります。<br>
        ・週のおわりにときどき<b>できごと</b>が起きます。えらんだ答えで、なかまとの<b>なかよし度</b>や馬の様子が変わります。<br>
        ・引退した牝馬は<b>繁殖牝馬</b>に。春に種付けをすると、次の年に子馬が生まれます。何世代もかけて最強の馬を目指そう。<br>
        ・キーボード:Q / E でタブ切り替え、R でレース、V で表示切替、Esc で閉じる、Space で1週すすめる。
      </div>
      <div class="sub-h">そのほか</div>
      <div class="row"><button class="btn small" data-act="to-title">タイトルにもどる</button></div>
    </div>
  </div>`;
}

// ---------- 週をすすめる ----------
async function nextWeek() {
  if (busy || !S || modalOpen()) return;
  const tired = S.horses.filter((h) => h.role === 'race' && !h.auto && h.fatigue >= 75 && !h.injury && !['rest', 'pasture'].includes(h.plan) && !h.entry);
  if (tired.length && !nextWeek.skipWarn) {
    const go = await confirmBox('疲れている馬がいます', `${tired.map((h) => h.name).join('、')}がとても疲れています。このまま調教するとケガをしやすくなります。進めてもいいですか?`, 'このまま進める', 'やめる(予定を見なおす)');
    if (!go) { openArea('track'); return; }
  }
  busy = true;
  try {
    const before = G.nowCal(S);
    // 今週のレースを見る(作戦をえらび、スパートを押す)
    const raceResults = {};
    for (const wr of G.weekRaces(S)) {
      const tactic = await tacticModal(wr);
      raceResults[wr.race.id] = await playRace(wr, tactic);
    }
    const out = G.advanceWeek(S, { raceResults });
    A.sfx('bell');
    for (const res of out.races) await raceResult(res);
    A.music('ranch');
    saveTo(AUTO_KEY);
    renderAll();
    // 調教の伸びは下のメッセージ欄へ
    const lines = out.train.filter((t) => t.gains.length).map((t) => `${t.name}:${t.gains.map(([k, v]) => `${STAT_LABEL[k]}+${v}`).join(' ')}`);
    say([...out.events, ...lines].length ? [...out.events.map((e) => '🌼 ' + e), ...lines.map((l) => '📈 ' + l)] : [`${G.nowCal(S).label}になりました。`]);
    if (out.events.length) toast('🌼 ' + out.events[0], 3500);
    if (out.lines.length || out.goals.length) {
      if (out.goals.length) A.jingle('goal');
      await modal(`<h3>${esc(before.label)} のできごと</h3>
        <div class="report-list">${out.goals.map((g) => `<div class="r">★ 目標達成:${esc(g)}</div>`).join('')}${out.lines.map((l) => `<div class="r">${esc(l)}</div>`).join('')}</div>
        <div class="actions"><button class="btn primary" data-choice="ok">OK</button></div>`, { dismiss: true });
    }
    if (out.yearEnd) await yearEndModal(out.yearEnd);
    await processPending();
  } finally {
    busy = false;
    renderAll();
  }
}

// 出られるレースがある週まで、まとめてすすめる(レース・イベントがあれば止まる)
async function fastForward() {
  if (busy) return;
  busy = true;
  const lines = [], goals = [];
  let n = 0, yearEnd = null;
  try {
    for (; n < 24; n++) {
      const racers = S.horses.filter((h) => h.role === 'race');
      if (racers.some((h) => h.entry && G.findRace(S, h.entry.raceId)?.ahead === 0)) break;
      if (n > 0 && racers.some((h) => G.racesForWeek(S.year, S.week).some((r) => G.eligible(S, h, r).ok))) break;
      const out = G.advanceWeek(S);
      lines.push(...out.lines);
      goals.push(...out.goals);
      S.pending = S.pending.filter((p) => p.type !== 'choice'); // まとめて進めるときは、できごとは省く
      if (out.yearEnd) { yearEnd = out.yearEnd; n++; break; }
      if (S.pending.length) { n++; break; }
    }
  } finally { busy = false; }
  A.sfx('bell');
  saveTo(AUTO_KEY);
  renderAll();
  await modal(`<h3>⏩ ${n}週すすめました</h3><p>${esc(G.nowCal(S).label)}になりました。</p>
    <div class="report-list">${goals.map((g) => `<div class="r">★ 目標達成:${esc(g)}</div>`).join('')}${lines.slice(-12).map((l) => `<div class="r">${esc(l)}</div>`).join('')}</div>
    <div class="actions"><button class="btn primary" data-choice="ok">OK</button></div>`, { dismiss: true });
  if (yearEnd) await yearEndModal(yearEnd);
  await processPending();
  if (area) renderArea();
}

async function yearEndModal(y) {
  A.jingle('win');
  await modal(`<h3>🎍 ${y.year}年目のまとめ</h3>
    <div class="cols"><div class="card"><b>勝利</b><p style="font-size:26px;margin:4px 0">${y.wins}勝</p><span class="muted">うちG1 ${y.g1}勝</span></div>
    <div class="card"><b>獲得賞金</b><p style="font-size:26px;margin:4px 0">${yen(y.earnings)}</p></div></div>
    ${y.trophies.length ? `<div class="sub-h">今年のトロフィー</div><div class="trophy-shelf">${y.trophies.map((t) => `<div class="trophy"><div class="cup">${cupSVG(t.grade)}</div><b>${esc(t.race)}</b><div class="muted">${esc(t.horse)}</div></div>`).join('')}</div>` : ''}
    ${y.award ? `<p style="font-family:var(--hand);font-size:20px;text-align:center">🏆 年度代表馬:${esc(y.award)}!</p>` : ''}
    <p class="muted">新しい年も、馬たちといっしょにがんばろう。</p>
    <div class="actions"><button class="btn primary" data-choice="ok">つぎの年へ</button></div>`, { wide: true });
}

async function processPending() {
  while (S.pending.length) {
    const p = S.pending[0];
    if (p.type === 'heart') {
      S.pending.shift();
      const ev = HEART_EVENTS[p.pid].find((e) => e.at === p.at);
      A.jingle('heart');
      await dialogue(p.pid, [`💗 ${PEOPLE[p.pid].name}との思い出(なかよし度 ${p.at})`, ...ev.lines]);
    } else if (p.type === 'choice') {
      const v = G.choiceEventView(S, p);
      A.sfx('talk');
      const c = await modal(`<div class="event-tag">🌼 牧場のできごと</div>
        <div class="talk"><div class="face">${personFace(v.pid)}</div><div class="bubble"><div class="muted">${esc(PEOPLE[v.pid].name)}</div>${esc(v.text)}</div></div>
        <div class="actions choice-actions">${v.choices.map((l, i) => `<button class="btn ${i ? 'rose' : 'primary'}" data-choice="c${i}">${esc(l)}</button>`).join('')}</div>`);
      const r = G.chooseEvent(S, p, Number(String(c || 'c0').slice(1)) || 0);
      A.sfx('open');
      await modal(`<div class="talk"><div class="face">${personFace(v.pid)}</div><div class="bubble">${esc(r.reply)}${r.notes ? `<div class="muted" style="margin-top:6px">✨ ${esc(r.notes)}</div>` : ''}</div></div>
        <div class="actions"><button class="btn primary" data-choice="ok">OK</button></div>`, { dismiss: true });
      showGoals(r.goals);
    } else if (p.type === 'name') {
      const h = G.findHorse(S, p.horseId);
      if (!h || !h.needsName) { S.pending.shift(); continue; }
      A.jingle('birth');
      const done = await nameModal(h);
      if (!done) break; // あとで名前をつける
    } else {
      S.pending.shift();
      await info('お知らせ', p.text);
    }
  }
  saveTo(AUTO_KEY);
  renderAll();
}

async function nameModal(h) {
  const chii = G.bondOf(S, 'chii') >= 50;
  const ideas = G.suggestNames(S, chii ? 6 : 4);
  const v = await modal(`<h3>名前をつけよう</h3>
    <div class="row"><div class="portrait big">${horsePortrait(h)}</div><div class="grow">
      <p>${h.sex === '牡' ? '男の子' : '女の子'} / ${COATS[h.coat].label} / 父 ${esc(h.sire)}・母 ${esc(h.dam)}</p>
      <input type="text" id="nameInput" maxlength="9" placeholder="ひらがな・カタカナ 2〜9文字" style="width:100%">
      <p class="muted">${chii ? 'ちいちゃんのアイデア:' : 'アイデア:'}</p>
      <div class="row">${ideas.map((n) => `<button class="btn small" data-fill="${esc(n)}">${esc(n)}</button>`).join('')}</div>
      <p class="muted" id="nameErr"></p>
    </div></div>
    <div class="actions"><button class="btn" data-choice="later">あとで</button><button class="btn primary" data-choice="ok">この名前にする</button></div>`);
  if (v !== 'ok') return false;
  const r = G.nameHorse(S, h.id, nameModal.value || '');
  if (!r.ok) { await info('名前をつけられません', r.text); return nameModal(h); }
  A.sfx('neigh');
  toast(r.text);
  showGoals(r.goals);
  renderAll();
  return true;
}

function showGoals(list) {
  if (!list || !list.length) return;
  A.jingle('goal');
  toast('★ 目標達成:' + list.join(' / '), 4000);
  renderQuest();
}

// ---------- レースの再生 ----------
const TACTIC_DESC = { nige: '最初から先頭へ。そのまま逃げきれ!', senko: '前のほうで流れに乗る。安定した作戦', sashi: '中団で力をためて、直線で伸びる', oikomi: '最後方から、一気にごぼう抜き!' };
const tacticSel = {};
async function tacticModal(wr) {
  const rows = wr.list.map(({ h, jockey }) => {
    tacticSel[h.id] = h.style;
    return `<div class="card" style="margin-bottom:10px"><div class="row"><div class="portrait">${horsePortrait(h)}</div><div class="grow"><b>${esc(h.name)}</b> <span class="muted">騎手 ${esc(PEOPLE[jockey].name)} / 調子 ${MOOD_LABEL[h.mood]} / 疲れ ${Math.round(h.fatigue)}</span>
      <div class="muted">💨 スパートの目安:<b>残り 約${G.spurtLength(h)}m</b>(スタミナが多いほど長くもつ)</div></div></div>
      <div class="tactics">${G.TACTICS.map((t) => `<button class="tac ${t === h.style ? 'sel' : ''}" data-tac="${t}" data-id="${h.id}"><b>${STYLE_LABEL[t]}</b>${t === h.style ? '<span class="tag own">得意</span>' : ''}<small>${TACTIC_DESC[t]}</small></button>`).join('')}</div></div>`;
  }).join('');
  A.sfx('open');
  await modal(`<h3>🏁 ${esc(wr.race.grade ? wr.race.grade + ' ' : '')}${esc(wr.race.label)} ${SURFACE_LABEL[wr.race.surface]}${wr.race.dist}m</h3>
    <p class="lead">作戦をえらんでスタート! 得意な作戦がいちばん力を出せます。レース中は<b>最後の直線で「💨 スパート!」</b>(または Space キー)を押そう。押さないと残り${G.AUTO_SPURT}mで自動でスパートします。</p>
    ${rows}<div class="actions"><button class="btn primary" data-choice="go">スタート!</button></div>`, { wide: true });
  const out = {};
  for (const { h } of wr.list) out[h.id] = tacticSel[h.id] || h.style;
  return out;
}

async function playRace(wr, tactic) {
  const seed = Math.floor(Math.random() * 1e9);
  const sim = (spurt) => G.runRace(S, wr.race, wr.list, { seed, tactic, spurt });
  let res = sim({});
  const scr = $('#race');
  scr.classList.remove('hidden');
  $('#raceName').textContent = `${res.race.grade ? res.race.grade + ' ' : ''}${res.race.label}  ${SURFACE_LABEL[res.race.surface]}${res.race.dist}m`;
  $('#raceBoard').innerHTML = '';
  $('#raceProgress').style.width = '0%';
  let view = null;
  if (!raceFailed) {
    try {
      if (!raceView) { const mod = await import('./race3d.js?v=5'); raceView = mod.createRaceView($('#race3d')); }
      view = raceView;
      $('#race3d').classList.remove('hidden');
      $('#race2d').classList.add('hidden');
      view.setup(res);
      view.draw(res.runners.map(() => 0), 0);
    } catch (e) { console.warn('3D レースを使えません:', e); raceFailed = true; view = null; }
  }
  if (!view) {
    $('#race3d').classList.add('hidden');
    $('#race2d').classList.remove('hidden');
    race2d ||= createRace2D($('#race2d'));
    view = race2d;
    view.setup(res);
    view.draw(res.runners.map(() => 0), 0);
  }
  const ownIdx = res.runners.map((r, i) => (r.own ? i : -1)).filter((i) => i >= 0);
  const lens = ownIdx.map((i) => res.runners[i].spurtLen);
  const ideal = Math.round(lens.reduce((a, b) => a + b, 0) / lens.length);
  const D0 = wr.race.dist;
  const WIN = Math.round(Math.min(D0 * 0.6, Math.max(ideal + 350, 650))); // ゲージを出すのは、残りこの距離から
  const talk = $('#raceTalk');
  talk.className = 'race-talk own';
  talk.textContent = `${ownIdx.map((i) => `${res.runners[i].gate}番 ${res.runners[i].name}(${STYLE_LABEL[res.runners[i].style]})`).join('、')} が出走します!`;
  A.music(null);
  A.jingle('fanfare');
  let skip = false, spurted = false;
  const speeds = [4, 8, 16];
  let si = 0;
  $('#raceSpeed').textContent = 'はやおくり ×1';
  $('#raceSpeed').onclick = () => { si = (si + 1) % speeds.length; $('#raceSpeed').textContent = `はやおくり ×${speeds[si] / 4}`; };
  $('#raceSkip').onclick = () => { skip = true; };
  const box = $('#spurtBox');
  $('#spurtIdeal').style.left = `${(1 - Math.min(WIN, ideal) / WIN) * 100}%`;
  $('#spurtHint').textContent = `目安:残り 約${ideal}m`;
  box.classList.add('hidden');
  const D = res.race.dist, dt = res.dt;
  let tSim = 0, last = 0, cheered = false, ci = 0, curFi = 0;
  const doSpurt = () => {
    if (spurted || skip) return;
    const f = res.frames[Math.min(res.frames.length - 1, Math.floor(curFi))];
    const remain = Math.min(...ownIdx.map((i) => D - f[i]));
    if (remain <= G.AUTO_SPURT || remain > WIN) return;
    spurted = true;
    const sp = {};
    for (const i of ownIdx) sp[res.runners[i].horseId] = Math.max(G.AUTO_SPURT, Math.round(D - f[i]));
    res = sim(sp); // ここから先だけが変わる(同じ seed なので、ここまでは同じ)
    ci = res.commentary.findIndex((c) => c.at >= Math.floor(curFi) - 1);
    if (ci < 0) ci = res.commentary.length;
    const diff = remain - ideal;
    toast(Math.abs(diff) <= 80 ? '💨 ナイススパート! ぴったりのタイミング!' : diff > 0 ? '💨 スパート! …ちょっと早いかも!?' : '💨 スパート! もう少し早くてもよかったかも', 2500);
    A.sfx('neigh');
    box.classList.add('used');
  };
  raceSpurt = doSpurt;
  $('#spurtBtn').onclick = doSpurt;
  await wait(2200, () => skip);
  A.music('race');
  A.hooves(true, 0.5);
  box.classList.remove('used');
  await new Promise((resolve) => {
    function frame(now) {
      const F = res.frames, total = (F.length - 1) * dt;
      if (!last) last = now;
      const real = Math.max(0, Math.min(0.1, (now - last) / 1000));
      last = now;
      // 最後の直線は、スパートのタイミングを見やすいように少しゆっくり
      const fNow = F[Math.min(F.length - 1, Math.floor(curFi))];
      const ownRemain = Math.min(...ownIdx.map((i) => D - fNow[i]));
      const slow = !spurted && ownRemain < WIN && ownRemain > G.AUTO_SPURT ? 0.45 : 1;
      tSim = Math.min(total, tSim + real * speeds[si] * slow);
      if (skip) tSim = total;
      const fi = Math.max(0, tSim / dt), i0 = Math.min(F.length - 1, Math.floor(fi)), i1 = Math.min(F.length - 1, i0 + 1), k = fi - i0;
      curFi = fi;
      const dists = F[i0].map((d, j) => d + (F[i1][j] - d) * k);
      view.draw(dists, tSim, { finished: tSim >= total });
      const order = dists.map((d, j) => [d, j]).sort((a, b) => b[0] - a[0]);
      const top = order.slice(0, 5).map(([, j], n) => [n + 1, j]);
      order.forEach(([, j], n) => { if (res.runners[j].own && n >= 5) top.push([n + 1, j]); });
      $('#raceBoard').innerHTML = top.map(([n, j]) => `<li class="${res.runners[j].own ? 'own' : ''}"><span class="n">${n}</span>${esc(res.runners[j].name)}</li>`).join('');
      $('#raceTime').textContent = G.timeText(Math.min(tSim, res.results[0].time));
      $('#raceProgress').style.width = Math.min(100, (order[0][0] / D) * 100) + '%';
      // スパートのゲージ
      const r = Math.min(...ownIdx.map((i) => D - dists[i]));
      const showBox = !spurted && r < WIN && r > G.AUTO_SPURT;
      box.classList.toggle('hidden', !showBox && !spurted);
      if (showBox) $('#spurtNow').style.left = `${(1 - Math.max(0, r) / WIN) * 100}%`;
      if (spurted && r < 0) box.classList.add('hidden');
      while (ci < res.commentary.length && res.commentary[ci].at <= fi) {
        const c = res.commentary[ci++];
        talk.textContent = c.text;
        talk.className = 'race-talk' + (c.own ? ' own' : '');
      }
      if (!cheered && D - order[0][0] < 450) { cheered = true; A.sfx('cheer'); A.hooves(true, 0.9); }
      if (tSim >= total) { resolve(); return; }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
  raceSpurt = null;
  box.classList.add('hidden');
  A.hooves(false);
  const best = res.results.find((r) => r.own);
  const w = res.results[0];
  talk.textContent = `${w.name}、1着でゴールイン!${best && best.place === 1 ? ' やったー!!' : ''}`;
  if (best && best.place === 1) { A.jingle('win'); A.sfx('cheer'); } else if (best && best.place <= 3) A.jingle('goal');
  await wait(skip ? 300 : 2400, () => false);
  scr.classList.add('hidden');
  return res;
}
let raceSpurt = null;
function wait(ms, cancel) {
  return new Promise((res) => {
    const t0 = performance.now();
    (function tick() { if (performance.now() - t0 >= ms || cancel()) res(); else requestAnimationFrame(tick); })();
  });
}

async function raceResult(res) {
  const ownRows = res.results.filter((r) => r.own);
  const rows = res.results.map((r) => `<tr class="${r.own ? 'own' : ''} ${r.rival ? 'rival' : ''}"><td>${r.place}</td><td>${r.gate}</td><td>${esc(r.name)}${r.rival ? ' <span class="muted">(黒川)</span>' : ''}</td><td>${esc(r.jockey || '')}</td><td>${G.timeText(r.time)}</td><td>${esc(r.margin)}</td></tr>`).join('');
  const comments = ownRows.map((r) => {
    const h = G.findHorse(S, r.horseId);
    const jid = JOCKEYS.find((j) => PEOPLE[j].name === r.jockey);
    let line;
    if (r.place === 1) line = { kakeru: 'やりました! この子、最高っす!!', shizuku: '…最後まで、この子が連れていってくれました。', gou: 'ガハハ! いい馬だ、おめえの育て方がいいんだな!' }[jid];
    else if (r.place <= 3) line = { kakeru: 'くっそー、あと少しだったっす! 次こそ!', shizuku: 'いい走りでした。次は届かせます。', gou: '惜しかったな! だが力はついてるぞ。' }[jid];
    else line = { kakeru: 'すみません、オレの作戦ミスっす…。', shizuku: 'まだこの子の力はこんなものではありません。', gou: 'まあ焦るな。馬は育つもんだ。' }[jid];
    return `<div class="talk" style="margin-top:10px"><div class="face" style="width:60px;height:60px">${jid ? personFace(jid) : ''}</div><div class="bubble" style="min-height:0;font-size:15px"><b>${esc(h?.name || r.name)}:${r.place}着</b><br>${esc(r.jockey)}「${esc(line)}」</div></div>`;
  }).join('');
  const top = ownRows[0];
  const title = top && top.place === 1 ? '🎉 優勝!' : top && top.place <= 3 ? '👏 よくがんばった!' : 'レース結果';
  await modal(`<h3>${title} ${esc(res.race.grade ? res.race.grade + ' ' : '')}${esc(res.race.label)}</h3>
    <div style="max-height:260px;overflow:auto"><table class="result-table"><tr><th>着</th><th>番</th><th>馬名</th><th>騎手</th><th>タイム</th><th>着差</th></tr>${rows}</table></div>
    ${comments}
    <div class="actions"><button class="btn primary" data-choice="ok">OK</button></div>`, { wide: true });
}

// ---------- ボタンの処理 ----------
async function act(name, d) {
  if (!S && !['continue', 'new', 'load'].includes(name)) return;
  switch (name) {
    case 'area': A.sfx('open'); openArea(d.area); break;
    case 'close-panel': A.sfx('close'); closeArea(); break;
    case 'sel-horse': {
      A.sfx('click');
      selHorse = d.id;
      renderTab();
      if (window.innerWidth <= 880) document.querySelector('#page-horses .detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      break;
    }
    case 'horse-detail': selHorse = d.id; setTab('horses'); break;
    case 'care': {
      const r = G.care(S, d.id, d.kind);
      if (!r.ok) { A.sfx('error'); toast(r.text); break; }
      A.sfx(r.kind === 'brush' ? 'brush' : r.kind === 'carrot' ? 'carrot' : 'walk');
      if (Math.random() < 0.3) setTimeout(() => A.sfx('neigh'), 500);
      toast(`${r.text}(${r.effect})`);
      say(r.text);
      showGoals(r.goals);
      renderAll();
      break;
    }
    case 'care-all': {
      const list = G.careAll(S);
      if (!list.length) { toast('今週はもう、みんなとふれあいました。'); break; }
      A.sfx('brush');
      setTimeout(() => A.sfx('neigh'), 600);
      renderAll();
      await modal(`<h3>🤲 みんなとふれあった</h3><div class="report-list">${list.map((r) => `<div class="r">${esc(r.text)} <span class="muted">${esc(r.effect)}</span></div>`).join('')}</div>
        <div class="actions"><button class="btn primary" data-choice="ok">OK</button></div>`, { dismiss: true });
      break;
    }
    case 'plan': {
      const h = G.findHorse(S, d.id);
      const r = G.setPlan(S, d.id, d.plan);
      if (!r.ok) { A.sfx('error'); toast(r.text); break; }
      if (h) h.auto = false;
      A.sfx('click');
      renderAll();
      break;
    }
    case 'auto': { const h = G.findHorse(S, d.id); if (h) { h.auto = !h.auto; A.sfx('click'); toast(h.auto ? `${h.name}の調教を、みどり先生におまかせします。` : 'おまかせをやめました。'); renderAll(); } break; }
    case 'rest-tired': {
      let n = 0;
      for (const h of S.horses) if (h.role === 'race' && h.fatigue >= 60 && !h.injury) { h.plan = h.mood <= 1 ? 'pasture' : 'rest'; h.auto = false; n++; }
      toast(n ? `${n}頭をお休みにしました。` : '疲れている馬はいません。');
      renderAll();
      break;
    }
    case 'enter': {
      const r = G.enter(S, d.id, d.race, $('#raceJockey')?.value || defaultJockey(G.findHorse(S, d.id)));
      if (!r.ok) { A.sfx('error'); toast(r.text, 4500); break; }
      A.sfx('coin');
      toast(r.text, 4000);
      say(r.text + ' 右下の「1週すすめる」で進めよう。');
      renderAll();
      break;
    }
    case 'race-horse': raceHorse = d.id; raceShowAll = false; A.sfx('click'); renderArea(); break;
    case 'race-all': raceShowAll = true; renderArea(); break;
    case 'open-race': raceHorse = d.id || raceHorse; openArea('office'); break;
    case 'ffwd': await fastForward(); break;
    case 'cancel-entry': G.cancelEntry(S, d.id); A.sfx('close'); renderAll(); break;
    case 'retire': await retireFlow(d.id); break;
    case 'pick-mare': selMare = d.id; A.sfx('click'); renderArea(); break;
    case 'breed': {
      const r = G.breed(S, d.mare, d.stud);
      if (!r.ok) { A.sfx('error'); toast(r.text, 4000); break; }
      A.jingle('heart');
      selMare = null;
      await info('種付け', r.text);
      showGoals(r.goals);
      saveTo(AUTO_KEY);
      renderAll();
      break;
    }
    case 'name': { const h = G.findHorse(S, d.id); if (h) await nameModal(h); break; }
    case 'talk': {
      const r = G.talk(S, d.pid);
      if (!r.ok) { A.sfx('error'); toast(r.text); break; }
      renderAll();
      await dialogue(d.pid, [r.text]);
      showGoals(r.goals);
      await processPending();
      break;
    }
    case 'gift': {
      const r = G.gift(S, d.pid);
      if (!r.ok) { A.sfx('error'); toast(r.text); break; }
      A.sfx('coin');
      renderAll();
      await dialogue(d.pid, [r.text]);
      showGoals(r.goals);
      await processPending();
      break;
    }
    case 'replay-heart': { const ev = HEART_EVENTS[d.pid].find((e) => e.at === Number(d.at)); if (ev) await dialogue(d.pid, ev.lines); break; }
    case 'build': {
      const r = G.build(S, d.key);
      if (!r.ok) { A.sfx('error'); toast(r.text); break; }
      A.sfx('build');
      toast(r.text);
      showGoals(r.goals);
      saveTo(AUTO_KEY);
      renderAll();
      break;
    }
    case 'carrots': { const r = G.buyCarrots(S); A.sfx(r.ok ? 'coin' : 'error'); toast(r.text); renderAll(); break; }
    case 'buy': {
      const r = G.buyMarket(S, Number(d.idx));
      if (!r.ok) { A.sfx('error'); toast(r.text, 4000); break; }
      A.sfx('coin');
      await info('お買いあげ', r.text);
      await processPending();
      renderAll();
      break;
    }
    case 'album-sub': albumSub = d.sub; A.sfx('click'); renderTab(); break;
    case 'save-slot': if (saveTo(SLOT_KEY(d.slot))) { A.sfx('coin'); toast(`スロット${d.slot}にセーブしました。`); renderTab(); } break;
    case 'load-slot': {
      if (!(await confirmBox('セーブデータを読む', `スロット${d.slot}のデータを読みこみます。いまの進み具合はオートセーブに残っていますが、上書きされます。よろしいですか?`, '読む'))) break;
      const s = loadFrom(SLOT_KEY(d.slot));
      if (s) { S = s; saveTo(AUTO_KEY); area = null; closeArea(); renderAll(); toast('読みこみました。'); }
      break;
    }
    case 'export': { const box = $('#exportBox'); box.value = exportCode(); box.classList.remove('hidden'); box.select(); try { await navigator.clipboard.writeText(box.value); toast('コードをコピーしました。メモ帳などに貼って保存してください。'); } catch { toast('コードを選択しました。コピーして保存してください。'); } break; }
    case 'toggle-view': toggleView(); break;
    case 'to-title': saveTo(AUTO_KEY); closeArea(); showTitle(); break;
    case 'goals': showGoalList(); break;
    case 'continue': { const s = loadFrom(AUTO_KEY); if (s) { S = s; startGame(); } break; }
    case 'new': {
      if (localStorage.getItem(AUTO_KEY) && !(await confirmBox('はじめから', 'はじめから遊ぶと、オートセーブが新しいデータで上書きされます(スロットのセーブは残ります)。よろしいですか?', 'はじめる'))) break;
      await newGameFlow();
      break;
    }
    case 'load': await loadFlow(); break;
    default: break;
  }
}

async function retireFlow(id) {
  const h = G.findHorse(S, id);
  if (!h) return;
  const opts = G.retireOptions(S, h);
  const v = await modal(`<h3>${esc(h.name)}を引退させる</h3>
    <p class="lead">${h.record.starts}戦${h.record.wins}勝。これからの暮らしを選んであげよう。</p>
    <div class="list">${opts.map((o) => `<button class="item click" style="text-align:left" data-choice="${o.id}"><div class="grow"><b>${esc(o.label)}</b><div class="muted">${esc(o.desc)}</div></div></button>`).join('')}</div>
    <div class="actions"><button class="btn" data-choice="cancel">まだ走る</button></div>`, { dismiss: true });
  if (!v || v === 'cancel') return;
  const r = G.retire(S, id, v);
  if (!r.ok) { toast(r.text); return; }
  A.sfx('neigh');
  await info('おつかれさま', r.text);
  showGoals(r.goals);
  saveTo(AUTO_KEY);
  renderAll();
}

async function showGoalList() {
  const g = G.currentGoal(S);
  A.sfx('open');
  await modal(`<h3>目標</h3>${g ? `<div class="card" style="margin-bottom:10px"><b>いまの目標:${esc(g.text)}</b><div class="muted">ヒント:${esc(g.hint)}</div></div>` : ''}
    <div class="list">${GOALS.map((x) => `<div class="row" style="${S.goals[x.id] ? '' : 'opacity:.6'}"><span>${S.goals[x.id] ? '✅' : '⬜'}</span><span class="grow">${esc(x.text)}</span>${S.goals[x.id] ? `<span class="muted">${S.goals[x.id].year}年目</span>` : ''}</div>`).join('')}</div>
    <div class="actions"><button class="btn primary" data-choice="ok">とじる</button></div>`, { dismiss: true });
}

function toggleView() {
  if (!ranch) { toast('3D の表示は使えません。絵地図で遊べます。'); return; }
  mapMode = mapMode === '3d' ? '2d' : '3d';
  A.sfx('tab');
  if (tab !== 'map') setTab('map', true);
  applyMapMode();
  toast(mapMode === '3d' ? '3D の箱庭で表示します' : '絵地図で表示します');
}

// ---------- 入力 ----------
document.addEventListener('pointerdown', () => A.unlock(), { capture: true });
document.addEventListener('keydown', () => A.unlock(), { capture: true });

document.addEventListener('click', (e) => {
  const tac = e.target.closest('[data-tac]');
  if (tac) {
    tacticSel[tac.dataset.id] = tac.dataset.tac;
    tac.parentElement.querySelectorAll('.tac').forEach((x) => x.classList.toggle('sel', x === tac));
    A.sfx('click');
    return;
  }
  const fill = e.target.closest('[data-fill]');
  if (fill) { const inp = $('#nameInput'); if (inp) inp.value = fill.dataset.fill; return; }
  const ch = e.target.closest('[data-choice]');
  if (ch && ch.classList.contains('off')) { A.sfx('error'); toast(ch.dataset.why || 'このデータはありません。'); return; }
  if (ch && modalOpen()) {
    // まどを閉じる前に、入力欄の中身を受け取っておく
    const ni = $('#nameInput'); if (ni) nameModal.value = ni.value;
    const r = $('#ngRanch'); if (r) { newGameFlow.r = r.value; newGameFlow.o = $('#ngOwner').value; }
    const ib = $('#importBox'); if (ib) loadFlow.code = ib.value;
    A.sfx('click');
    closeModal(ch.dataset.choice);
    return;
  }
  const b = e.target.closest('[data-act]');
  if (b && b.classList.contains('off')) { A.sfx('error'); toast(whyOff(b)); return; }
  if (b) act(b.dataset.act, b.dataset).catch(reportError);
  const tb = e.target.closest('#tabs button');
  if (tb) setTab(tb.dataset.tab);
  const reg = e.target.closest('.region');
  if (reg) { A.sfx('open'); openArea(reg.dataset.area); }
});
// ボタンに動きをつける(見つからない部品があっても、ほかのボタンは動くように)
function bind(sel, fn, ev = 'click') {
  const el = $(sel);
  if (el) el.addEventListener(ev, (e) => { try { const r = fn(e); if (r?.catch) r.catch(reportError); } catch (err) { reportError(err); } });
  else missingParts.push(sel);
}
const missingParts = [];
bind('#modal', (e) => { if (e.target.id === 'modal' && modalDismiss) closeModal(null); });
bind('#tabPrev', () => cycleTab(-1));
bind('#tabNext', () => cycleTab(1));
bind('#keyNext', () => nextWeek());
bind('#keyView', () => toggleView());
bind('#keyRace', () => { A.sfx('open'); openArea('office'); });
bind('#keyClose', () => { if (modalOpen() && modalDismiss) closeModal(null); else if (area) closeArea(); });
bind('#questBtn', (e) => { e.stopPropagation(); showGoalList(); });
bind('#quest', () => showGoalList());
document.addEventListener('input', (e) => {
  const id = e.target.id;
  if (!id.startsWith('snd')) return;
  A.settings.bgm = $('#sndBgm').checked;
  A.settings.sfx = $('#sndSfx').checked;
  A.settings.bgmVol = Number($('#sndBgmVol').value);
  A.settings.sfxVol = Number($('#sndSfxVol').value);
  A.saveSettings();
});
document.addEventListener('keydown', (e) => {
  if (!S || $('#app').classList.contains('hidden')) return;
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (e.key === 'Escape') { if (modalOpen() && modalDismiss) closeModal(null); else if (area) closeArea(); return; }
  if (typing) { if (e.key === 'Enter' && modalOpen()) { const ok = $('#modalCard [data-choice="ok"]'); ok?.click(); } return; }
  if (modalOpen()) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#modalCard [data-choice]:last-of-type')?.click(); } return; }
  if (!$('#race').classList.contains('hidden')) { if (e.key === ' ') { e.preventDefault(); raceSpurt?.(); } return; }
  if (e.key === 'q' || e.key === 'Q') cycleTab(-1);
  else if (e.key === 'e' || e.key === 'E') cycleTab(1);
  else if (e.key === 'v' || e.key === 'V') toggleView();
  else if (e.key === 'r' || e.key === 'R') openArea('office');
  else if (e.key === ' ') { e.preventDefault(); nextWeek(); }
  else if (/^[1-5]$/.test(e.key)) setTab(TABS[Number(e.key) - 1]);
});

// 地図のふちの形(マスク)を作る
(function setupFrame() {
  const d = framePath();
  $('#rimPath').setAttribute('d', d);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 560" preserveAspectRatio="none"><path d="${d}" fill="black"/></svg>`;
  $('#mapFrame').style.setProperty('--blob', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
})();

// 押せないボタンも、押したら理由を教える(だまって何も起きない、をなくす)
const WHY = {
  talk: 'この人とは今週もうおはなししました。「1週すすめる」と、また話せます。',
  gift: '差し入れは、1人に1週間1回までです。',
  build: 'お金が足りません。レースの賞金などでお金をためよう。',
  buy: 'お金が足りません。',
  breed: 'お金が足りません(種付け料)。',
  plan: 'いまは選べません(ケガの治療中、またはまだ若すぎます)。',
  'load-slot': 'このスロットにはセーブデータがありません。',
};
function whyOff(b) { return b.dataset.why || WHY[b.dataset.act] || WHY[b.dataset.choice] || 'いまは押せません。'; }
function softDisable(root) {
  root.querySelectorAll('button[disabled]').forEach((b) => {
    b.disabled = false;
    b.classList.add('off');
    b.setAttribute('aria-disabled', 'true');
  });
}
new MutationObserver(() => softDisable(document.body)).observe(document.body, { childList: true, subtree: true });

function reportError(err) {
  console.error(err);
  busy = false;
  const detail = String(err?.message || err || '').slice(0, 120);
  toast(`うまく動かないところがありました。ページを再読み込み(⟳)すると、オートセーブから続けられます。(くわしく:${detail})`, 8000);
}
window.addEventListener('unhandledrejection', (e) => reportError(e.reason));
window.addEventListener('error', (e) => reportError(e.error || new Error(e.message)));

showTitle();
// 古い画面が残っているとき(更新の直後など)は、再読み込みをお願いする
if (missingParts.length || G.BUILD !== BUILD) {
  info('ページを再読み込みしてください', 'ゲームが新しくなりました。古い画面が残っているため、一部のボタンが動かないかもしれません。ブラウザの再読み込みボタン(⟳)を押してください。');
}
// テスト用(画面確認のときに使う)
window.__hidamari = { get state() { return S; }, set state(v) { S = v; }, renderAll, openArea, setTab, nextWeek, G };
