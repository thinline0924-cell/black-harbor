// BLACK HARBOR — 画面の操作と進行
// ・CPU対戦:ゲームの計算(engine.js)をブラウザの中で動かす
// ・オンライン対戦:サーバーが計算し、SSE(サーバーからの知らせ)で画面を更新する
// どちらも「見せてよい情報(view)」を受け取って画面を描く、という同じしくみにしています。

import * as E from './engine.js';
import { lineChart, heatHistogram, hbars, stacked, donut, esc } from './charts.js';
import { RULES_HTML, SLIDES, COACH } from './content.js';
import { shards } from './fx.js';
import { sfx, music, engine, unlock, getSettings, setSetting } from './audio.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const GLYPH = {
  'cargo:brand': '偽', 'cargo:rifle': '銃', 'cargo:art': '美', 'cargo:chem': '薬', 'cargo:beast': '獣',
  'part:nitro': '燃', 'part:trailer': '牽', 'part:susp': '衝', 'part:emp': '電',
  'ally:mechanic': '工', 'ally:daredevil': '特', 'ally:hyena': '狩', 'ally:lawyer': '法', 'ally:launderer': '洗', 'ally:accountant': '計',
  tip: '密', safe: '賄', crack: '激', fake: '虚', decoy: '囮',
};
const KIND_LABEL = { cargo: 'CARGO', part: 'PARTS', ally: 'ALLY' };
const PHASES = [
  ['market', '仕入れ'],
  ['load', '積載'],
  ['ops', '工作'],
  ['resolve', '運搬'],
  ['launder', '洗浄'],
];
const TABS = {
  map: ['MAP', '- 港湾'],
  market: ['MARKET', '- 仕入れ'],
  cargo: ['CARGO', '- 積載'],
  ops: ['OPS', '- 工作'],
  data: ['DATA', '- 記録'],
  system: ['SYSTEM', '- 設定'],
};
const glyph = (key, cls = 'glyph') => `<span class="${cls}"><b>${GLYPH[key] || '?'}</b></span>`;
const man = (v) => `${Number(v).toLocaleString('ja-JP')}万`;
const pct = (v) => `${Math.round(v * 100)}%`;

// ---- アプリの状態 ----
const app = {
  session: null,
  mode: null, // 'local' | 'online'
  view: null,
  lobby: null,
  tab: 'map',
  phaseKey: '',
  sel: { market: null, cargo: new Set(), route: null, ops: null, placements: [], systemItem: 'rules' },
  animRound: 0,
  animating: false,
  skip: false,
  tutorial: false,
  coachSeen: new Set(),
  coachQueue: [],
  board: null,
  boardFailed: false,
  launderAmount: null,
  sending: false,
};

// ---- 小さな道具 ----
function toast(text, err = false) {
  const t = $('#toast');
  t.textContent = text;
  t.className = `toast${err ? ' err' : ''}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add('hidden'), err ? 4200 : 2200);
}
const wait = (ms) => new Promise((r) => setTimeout(r, app.skip ? 0 : ms));

function showScreen(id) {
  for (const s of $$('.screen')) s.classList.toggle('hidden', s.id !== id);
  shards();
  music(id === 'game' ? 'calm' : 'title');
}

function store(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* 保存できない環境(シークレットモードなど)でも遊べる */ }
}
function load(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let data = {};
  try { data = await res.json(); } catch { /* 空の返事 */ }
  if (!res.ok) throw new Error(data.error || `通信に失敗しました(${res.status})。サーバーが起動しているか確認してください。`);
  return data;
}

// ---- 3D の盤(読み込めなくてもゲームは遊べる) ----
async function ensureBoard() {
  if (app.board || app.boardFailed) return app.board;
  try {
    const mod = await import('./board3d.js');
    app.board = mod.createBoard($('#view'));
    app.board.onGrab = () => sfx('grab');
    app.board.onRouteDrop = (route, moved) => {
      if (!app.view || app.view.phase !== 'load' || me().load) return;
      if (route) {
        app.sel.route = route;
        sfx('drop');
        toast(`${E.ROUTE_BY_ID[route].name} を選びました`);
      } else if (moved) toast('ルートの出発地点(六角形の台)の上で離してください');
      renderAll();
    };
  } catch (err) {
    console.warn('3D を読み込めませんでした', err);
    app.boardFailed = true;
  }
  return app.board;
}

// ---- セッション(CPU対戦) ----
class LocalSession {
  constructor(state, { level = 'normal', tutorial = false } = {}) {
    this.state = state;
    this.level = level;
    this.tutorial = tutorial;
    this.timer = null;
  }
  start(cb) {
    this.cb = cb;
    this.emit();
    this.tick();
  }
  emit() {
    store('bh-local', { state: this.state, level: this.level, tutorial: this.tutorial });
    this.cb({ view: E.viewFor(this.state, 0) });
  }
  async send(action) {
    const r = E.applyAction(this.state, 0, action);
    if (!r.ok) throw new Error(r.error);
    this.emit();
    this.tick();
  }
  tick() {
    clearTimeout(this.timer);
    const s = this.state;
    if (s.phase === 'end') return;
    const delay = s.phase === 'market' ? 750 : 400;
    this.timer = setTimeout(() => {
      for (const p of s.players) {
        if (!p.cpu) continue;
        const a = E.cpuAction(s, p.id, this.level);
        if (a) {
          E.applyAction(s, p.id, a);
          this.emit();
          this.tick();
          return;
        }
      }
    }, delay);
  }
  close() {
    clearTimeout(this.timer);
  }
}

// ---- セッション(オンライン対戦) ----
class OnlineSession {
  constructor({ code, token, seat }) {
    Object.assign(this, { code, token, seat });
  }
  start(cb) {
    this.cb = cb;
    this.connect();
  }
  connect() {
    this.es?.close();
    this.es = new EventSource(`/api/bh/events?code=${encodeURIComponent(this.code)}&token=${encodeURIComponent(this.token)}`);
    this.es.onmessage = (e) => {
      this.fails = 0;
      try { this.cb(JSON.parse(e.data)); } catch (err) { console.error(err); }
    };
    this.es.onerror = () => {
      this.fails = (this.fails || 0) + 1;
      if (this.fails === 2) toast('サーバーとの接続が切れました。再接続しています…', true);
      if (this.fails > 8) {
        this.es.close();
        toast('部屋に再接続できませんでした。部屋が片づけられた可能性があります。', true);
      }
    };
  }
  async send(action) {
    await post('/api/bh/action', { code: this.code, token: this.token, action });
  }
  async host(op) {
    await post('/api/bh/host', { code: this.code, token: this.token, op });
  }
  close() {
    this.es?.close();
  }
}

function startSession(session, mode) {
  app.session?.close();
  app.session = session;
  app.mode = mode;
  app.view = null;
  app.animRound = 0;
  app.phaseKey = '';
  app.coachSeen = new Set();
  hideModal();
  session.start(onUpdate);
}

// ---- 知らせを受け取ったとき ----
function onUpdate({ lobby, view }) {
  if (lobby) {
    app.lobby = lobby;
    renderLobby();
  }
  if (!view) return;
  // 再戦(新しいゲーム)が始まったら、演出の記録をリセット
  if (app.view && view.round < app.view.round) {
    app.animRound = 0;
    app.resultClosed = false;
  }
  const first = !app.view;
  const prevView = app.view;
  app.view = view;
  if (first) enterGame();
  // 再接続などで、すでに終わった検問を何度も見ないように
  if (first && view.resolution && view.phase !== 'launder') app.animRound = view.resolution.round;
  if (!first && view.phase === 'market' && view.turn === view.you && (prevView.turn !== view.you || prevView.phase !== 'market')) sfx('turn');
  const key = `${view.round}-${view.phase}`;
  if (key !== app.phaseKey) {
    const prev = app.phaseKey;
    app.phaseKey = key;
    onPhaseChange(prev);
  }
  if (view.resolution && view.resolution.round > app.animRound && !app.animating) {
    playResolution();
    return;
  }
  renderAll();
}

async function enterGame() {
  showScreen('game');
  await ensureBoard();
  if (app.board) {
    app.board.setPlayers(app.view.players, app.view.you);
    renderAll();
  }
}

function me() {
  return app.view.players[app.view.you];
}

function onPhaseChange() {
  const v = app.view;
  app.sel.cargo = new Set();
  app.sel.route = null;
  app.sel.ops = null;
  app.sel.placements = [];
  app.sel.market = null;
  app.launderAmount = null;
  const tab = { market: 'market', load: 'cargo', ops: 'ops', launder: 'map', end: 'map' }[v.phase];
  if (tab && !(v.phase === 'launder' && app.animating)) setTab(tab, false);
  if (v.phase === 'market') sfx('round');
  if (v.phase === 'market' && v.round > 1) coach('market2');
  else if (v.phase !== 'launder') coach(v.phase);
}

// ---- タブ ----
function setTab(tab, withFx = true) {
  if (app.tab !== tab && withFx) {
    shards();
    sfx('move');
  }
  app.tab = tab;
  $('#game').classList.toggle('paper', tab !== 'map');
  for (const b of $$('#tabs button')) b.classList.toggle('on', b.dataset.tab === tab);
  for (const p of $$('.tab-pane')) p.classList.toggle('on', p.dataset.pane === tab);
  $('#tabTitle').textContent = TABS[tab][0];
  $('#tabSub').textContent = TABS[tab][1];
  if (app.view) renderAll();
}

// ---- まとめて描き直す ----
function renderAll() {
  const v = app.view;
  if (!v) return;
  // 描き直しても、それぞれの欄のスクロール位置を保つ(CPU が動くたびに上へ戻らないように)
  const scrolls = $$('#game .panel, #tabBody').map((el) => [el, el.scrollTop]);
  renderAllInner();
  for (const [el, top] of scrolls) el.scrollTop = top;
}

function renderAllInner() {
  const v = app.view;
  renderPhaseTrack();
  renderTabAlerts();
  renderStatus();
  if (app.tab === 'market') renderMarket();
  if (app.tab === 'cargo') renderCargo();
  if (app.tab === 'ops') renderOps();
  if (app.tab === 'data') renderData();
  if (app.tab === 'system') renderSystem();
  renderMapHud();
  renderMessage();
  updateBoard();
  renderModals();
}

function renderPhaseTrack() {
  const v = app.view;
  const idx = PHASES.findIndex(([k]) => k === (v.phase === 'end' ? 'launder' : v.phase));
  $('#phaseTrack').innerHTML =
    `<li class="round">ROUND ${Math.min(v.round, E.ROUNDS)}/${E.ROUNDS}</li>` +
    PHASES.map(([, label], i) => `<li class="${i === idx ? 'on' : i < idx ? 'done' : ''}">${i + 1}. ${label}</li>`).join('');
}

function needsAction() {
  const v = app.view;
  const m = me();
  if (v.phase === 'market' && v.turn === v.you) return 'market';
  if (v.phase === 'load' && !m.load) return 'cargo';
  if (v.phase === 'ops' && !m.ops) return 'ops';
  return null;
}

function renderTabAlerts() {
  const need = needsAction();
  for (const b of $$('#tabs button')) b.classList.toggle('alert', b.dataset.tab === need && app.tab !== need);
}

// ---- 右のステータス ----
function renderStatus() {
  const v = app.view;
  const m = me();
  const maxCash = Math.max(1, ...v.players.map((p) => p.cash));
  const cap = E.capacityOf(m);
  const vpSeries = m.history.map((h) => h.vp);
  const ready = (p) => {
    if (v.phase === 'market') return v.turn === p.id ? '<span class="ready">購入中</span>' : p.passed ? '<span class="ready wait">終了</span>' : '';
    if (v.phase === 'load') return p.load ? '<span class="ready">決定</span>' : '<span class="ready wait">考え中</span>';
    if (v.phase === 'ops') return p.ops ? '<span class="ready">決定</span>' : '<span class="ready wait">考え中</span>';
    if (v.phase === 'launder') return p.laundered !== null ? '<span class="ready">洗浄済</span>' : '<span class="ready wait">考え中</span>';
    return '';
  };
  const html = `
    <div class="panel-title">ステータス</div>
    <div class="status-head"><span>${esc(m.name)}</span><span class="lv">RD : ${Math.min(v.round, E.ROUNDS)}</span></div>
    <div class="stat-row"><span>現金</span><div class="bar gold"><span style="width:${(m.cash / maxCash) * 100}%"></span></div><span class="val">${man(m.cash)}</span></div>
    <div class="stat-row"><span>資産 VP</span><div class="bar"><span style="width:${Math.min(100, (m.vp / 60) * 100)}%"></span></div><span class="val">${m.vp}</span></div>
    <div class="stat-row"><span>予想スコア</span><div class="bar green"><span style="width:${Math.min(100, (E.finalScore(m) / 60) * 100)}%"></span></div><span class="val">${E.finalScore(m)}</span></div>
    ${m.heatPenalty ? `<div class="stat-row"><span style="color:var(--red)">破産の目印</span><div></div><span class="val" style="color:var(--red)">+${m.heatPenalty}</span></div>` : ''}
    <div class="sub-title"><span>貨物</span><span>${m.cargo.length} 枚 / 積載 ${cap}</span></div>
    <div class="slots">${m.cargo.map((c) => `<span class="slot full" title="${esc(E.cardDef(c).name)}">${GLYPH[c]}</span>`).join('') || '<span class="hint" style="margin:0">なし</span>'}</div>
    <div class="sub-title"><span>パーツ</span><span>${m.parts.length}/${E.MAX_PARTS}</span></div>
    <div class="slots">${Array.from({ length: E.MAX_PARTS }, (_, i) => (m.parts[i] ? `<span class="slot full" title="${esc(E.cardDef(m.parts[i]).name)}">${GLYPH[m.parts[i]]}</span>` : '<span class="slot"></span>')).join('')}
      <span style="width:12px"></span>
      ${Array.from({ length: E.MAX_ALLIES }, (_, i) => (m.allies[i] ? `<span class="slot full" title="${esc(E.cardDef(m.allies[i]).name)}">${GLYPH[m.allies[i]]}</span>` : '<span class="slot"></span>')).join('')}
    </div>
    <div class="sub-title"><span>ボスたち</span><span>現金 / VP</span></div>
    <div class="rivals">${v.players
      .map((p) => `<div class="rival"><i class="chip" style="background:${p.color}"></i><span>${esc(p.name)}${p.id === v.you ? '(あなた)' : p.cpu ? '<small> CPU</small>' : ''}</span><span class="m">${man(p.cash)} / ${p.vp}</span>${ready(p)}</div>`)
      .join('')}</div>
    ${vpSeries.length > 1 ? `<div class="sub-title"><span>VP の推移</span></div>${sparkline(vpSeries)}` : ''}
    <div class="no-error">NO ERROR</div>`;
  for (const el of $$('[data-status]')) el.innerHTML = html;
}

function sparkline(values) {
  const W = 200, H = 40, max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * W},${H - (v / max) * (H - 6) - 3}`).join(' ');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" style="height:44px"><polyline points="${pts}" fill="none" stroke="#4b483e" stroke-width="2"/></svg>`;
}

// ---- MARKET ----
function renderMarket() {
  const v = app.view;
  const m = me();
  const myTurn = v.phase === 'market' && v.turn === v.you;
  const rows = [
    ['cargo', '貨物'],
    ['parts', 'パーツ'],
    ['allies', '協力者'],
  ];
  if (app.sel.market && !v.market[app.sel.market.row][app.sel.market.index]) app.sel.market = null;
  if (!app.sel.market) {
    const firstRow = rows.find(([r]) => v.market[r].some(Boolean));
    if (firstRow) app.sel.market = { row: firstRow[0], index: v.market[firstRow[0]].findIndex(Boolean) };
  }
  $('#marketList').innerHTML =
    `<div class="panel-title">ブラックマーケット<small>山札 ${v.deckCounts.cargo}</small></div>` +
    rows
      .map(
        ([row, label]) =>
          `<div class="list-group"><span>${label}</span><span>価格</span></div>` +
          v.market[row]
            .map((card, index) => {
              const sel = app.sel.market && app.sel.market.row === row && app.sel.market.index === index;
              if (!card) return `<button class="item dim" disabled><span class="glyph"><b>−</b></span>SOLD OUT</button>`;
              const def = E.cardDef(card);
              const poor = def.cost > m.cash;
              return `<button class="item${sel ? ' sel' : ''}${poor ? ' dim' : ''}" data-mrow="${row}" data-mi="${index}">${glyph(card)}<span>${esc(def.name)}</span><span class="num">${def.cost}</span></button>`;
            })
            .join('')
      )
      .join('');
  for (const b of $$('#marketList [data-mrow]'))
    b.onclick = () => {
      app.sel.market = { row: b.dataset.mrow, index: Number(b.dataset.mi) };
      sfx('move');
      renderMarket();
    };

  const s = app.sel.market;
  const card = s ? v.market[s.row][s.index] : null;
  let html;
  if (!card) {
    html = `<div class="panel-title">−</div><p>市場は売り切れです。</p>
      <div class="row-btns"><button class="btn" id="passBtn" ${myTurn ? '' : 'disabled'}>買い物を終える</button></div>`;
  } else {
    const def = E.cardDef(card);
    const kind = E.cardKind(card);
    let stats = '';
    if (kind === 'cargo') {
      stats = hbars(
        [
          { label: '売却利益', value: def.profit, text: man(def.profit), color: '#a8873a' },
          { label: '警戒度', value: def.heat, text: def.heat, color: '#b2523f' },
          { label: '仕入れ値', value: def.cost, text: man(def.cost) },
        ].map((x) => ({ ...x, value: x.label === '警戒度' ? (x.value / 6) * 2000 : x.value })),
        { max: 2000 }
      );
      stats += `<div class="kpis"><div class="kpi"><div class="k">もうけ</div><div class="v green">+${def.profit - def.cost}</div></div><div class="kpi"><div class="k">利益率</div><div class="v">${(def.profit / def.cost).toFixed(1)}倍</div></div><div class="kpi"><div class="k">警戒度1あたり</div><div class="v">${Math.round((def.profit - def.cost) / def.heat)}</div></div></div>`;
      stats += `<div class="sub-title"><span>この貨物だけを積んだときの突破率</span></div>` + routeChanceBars(m, [card]);
    } else {
      stats = hbars([{ label: '価格', value: def.cost, text: man(def.cost) }], { max: 1000 });
      const owned = kind === 'part' ? `${m.parts.length}/${E.MAX_PARTS}` : `${m.allies.length}/${E.MAX_ALLIES}`;
      stats += `<div class="kpis"><div class="kpi"><div class="k">種類</div><div class="v" style="font-size:16px">${kind === 'part' ? 'パーツ' : '協力者'}</div></div><div class="kpi"><div class="k">装備中</div><div class="v">${owned}</div></div><div class="kpi"><div class="k">残りラウンド</div><div class="v">${E.ROUNDS - v.round + 1}</div></div></div>`;
    }
    const canBuy = myTurn && def.cost <= m.cash;
    html = `<div class="panel-title">${esc(def.name)}</div>
      <div class="detail-art"><span class="sun"></span><span class="big-glyph"><b>${GLYPH[card]}</b></span><span class="kind">${KIND_LABEL[kind]}</span></div>
      <div class="detail-text">${esc(def.text)}</div>
      ${stats}
      <div class="row-btns">
        <button class="btn" id="passBtn" ${myTurn ? '' : 'disabled'}>買い物を終える</button>
        <button class="btn primary" id="buyBtn" ${canBuy ? '' : 'disabled'}>購入する(${man(def.cost)})</button>
      </div>
      <div class="count-foot">所持金 : ${man(m.cash)} ・ 今回の購入 : ${m.bought}/${E.MAX_BUYS}</div>`;
  }
  $('#marketDetail').innerHTML = html;
  $('#buyBtn')?.addEventListener('click', () => act({ type: 'buy', row: s.row, index: s.index }));
  $('#passBtn')?.addEventListener('click', () => act({ type: 'pass' }));
}

// ルートごとの突破率の横棒
function routeChanceBars(p, cards, ops = []) {
  return E.ROUTES.map((r) => {
    const setup = E.runSetup(p, cards, r.id, ops);
    const ch = E.passChance(p, setup);
    return `<div class="stat-row"><span>${r.short}(${r.limit})</span><div class="bar ${ch < 0.5 ? 'red' : ch < 0.85 ? 'gold' : 'green'}"><span style="width:${ch * 100}%"></span></div><span class="val">${pct(ch)}</span></div>`;
  }).join('');
}

// ---- CARGO(積載) ----
function selectedCards() {
  const m = me();
  return [...app.sel.cargo].filter((i) => i < m.cargo.length).map((i) => m.cargo[i]);
}

function cargoChecklist(compact = false) {
  const m = me();
  const v = app.view;
  const locked = v.phase !== 'load' || !!m.load;
  const chosen = m.load ? new Set(m.load.cargo) : app.sel.cargo;
  const cap = E.capacityOf(m);
  if (!m.cargo.length) return `<p class="hint">貨物を持っていません。${v.phase === 'load' ? '今回は休んで、次のラウンドで仕入れましょう。' : ''}</p>`;
  return (
    `<div class="list-group"><span>積む貨物(${chosen.size}/${cap})</span><span>利益 / 警戒</span></div>` +
    m.cargo
      .map((c, i) => {
        const def = E.cardDef(c);
        const on = chosen.has(i);
        return `<button class="item${on ? ' sel' : ''}" data-ci="${i}" ${locked ? 'disabled' : ''}><span class="check">${on ? '✓' : ''}</span>${compact ? '' : glyph(c)}<span>${esc(def.name)}</span><span class="num">${def.profit}/${def.heat}</span></button>`;
      })
      .join('')
  );
}

function bindChecklist(root) {
  for (const b of $$('[data-ci]', root))
    b.onclick = () => {
      const i = Number(b.dataset.ci);
      const cap = E.capacityOf(me());
      if (app.sel.cargo.has(i)) app.sel.cargo.delete(i);
      else if (app.sel.cargo.size >= cap) return toast(`積めるのは${cap}枚までです(増設トレーラーで増やせます)`, true);
      else app.sel.cargo.add(i);
      sfx('move');
      renderAll();
    };
}

function loadForecast() {
  const m = me();
  const cards = m.load ? m.load.cargo.map((i) => m.cargo[i]) : selectedCards();
  const route = m.load ? m.load.route : app.sel.route;
  if (!cards.length || !route) return null;
  const setup = E.runSetup(m, cards, route, []);
  const { dist } = E.heatDistribution(setup);
  const pass = E.passChance(m, setup);
  const fine = m.allies.includes('ally:lawyer') ? 0 : setup.heatBase * 10 * setup.route.fineMul;
  return { setup, dist, pass, fine, ev: Math.round(pass * setup.profit - (1 - pass) * fine) };
}

function renderCargo() {
  const v = app.view;
  const m = me();
  $('#cargoList').innerHTML = `<div class="panel-title">手持ちの貨物<small>積載 ${E.capacityOf(m)}</small></div>${cargoChecklist()}`;
  bindChecklist($('#cargoList'));
  const cards = m.load ? m.load.cargo.map((i) => m.cargo[i]) : selectedCards();
  const route = m.load ? m.load.route : app.sel.route;
  const locked = v.phase !== 'load' || !!m.load;
  const fc = loadForecast();
  const heat = cards.reduce((s, c) => s + E.cardDef(c).heat, 0);
  const profit = cards.reduce((s, c) => s + E.cardDef(c).profit, 0);
  const routeCards = E.ROUTES.map((r) => {
    const setup = E.runSetup(m, cards, r.id, []);
    const ch = cards.length ? E.passChance(m, setup) : 0;
    return `<button class="route-card${route === r.id ? ' on' : ''}" data-route="${r.id}" ${locked ? 'disabled' : ''}>
      <span class="rl">${r.limit}</span><div class="rn">${r.name}</div>
      <div class="bar ${ch < 0.5 ? 'red' : ''}"><span style="width:${ch * 100}%"></span></div>
      <span class="pct">突破率 ${cards.length ? pct(ch) : '−'}</span></button>`;
  }).join('');
  let body = `<div class="panel-title">ルート選択と予測<small>${v.phase === 'load' ? (m.load ? '決定済み' : '選択中') : '積載フェーズで選べます'}</small></div>
    <div class="kpis">
      <div class="kpi"><div class="k">積む枚数</div><div class="v">${cards.length}</div></div>
      <div class="kpi"><div class="k">警戒度合計</div><div class="v red">${heat}${m.heatPenalty ? `+${m.heatPenalty}` : ''}</div></div>
      <div class="kpi"><div class="k">売却利益</div><div class="v green">${profit}</div></div>
    </div>
    <div class="route-pick">${routeCards}</div>`;
  if (fc) {
    body += `<div class="sub-title"><span>最終警戒度の出やすさ(%)・工作カードなしの場合</span><span>${fc.setup.route.name}</span></div>
      ${heatHistogram(fc.dist, fc.setup.limit)}
      <div style="display:flex;align-items:center;gap:14px;margin:0 14px">${donut(fc.pass, { label: '突破率' })}
        <div style="flex:1">${hbars([
          { label: '成功で', value: fc.setup.profit, text: `+${man(fc.setup.profit)}`, color: '#5d7d55' },
          { label: '摘発で', value: fc.fine, text: `-${man(fc.fine)}`, color: '#b2523f' },
          { label: '期待値', value: Math.max(0, fc.ev), text: man(fc.ev), color: '#a8873a' },
        ], { max: Math.max(fc.setup.profit, fc.fine, 1) })}</div></div>
      <p class="hint">ライバルの「タレコミ」1枚で警戒度+3。余裕(上限−警戒度)を残すと安心です。</p>`;
  } else if (v.phase === 'load' && !m.load) {
    body += `<p class="hint">左で貨物を選び、ルートをクリック(または MAP でトラックをドラッグ)すると、突破率のグラフが出ます。</p>`;
  }
  if (v.phase === 'load' && !m.load) {
    body += `<div class="row-btns">
      <button class="btn" id="toMapBtn">3Dの盤で選ぶ</button>
      ${cards.length ? `<button class="btn primary" id="loadBtn" ${route ? '' : 'disabled'}>この内容で出発</button>` : `<button class="btn primary" id="restBtn">今回は休む</button>`}
    </div>`;
  }
  $('#cargoDetail').innerHTML = body;
  for (const b of $$('#cargoDetail [data-route]'))
    b.onclick = () => {
      app.sel.route = b.dataset.route;
      sfx('move');
      renderAll();
    };
  $('#toMapBtn')?.addEventListener('click', () => setTab('map'));
  $('#loadBtn')?.addEventListener('click', submitLoad);
  $('#restBtn')?.addEventListener('click', () => act({ type: 'load', cargo: [], route: null }));
}

function submitLoad() {
  if (!app.sel.cargo.size) return toast('積む貨物を選んでください', true);
  if (!app.sel.route) return toast('ルートを選んでください', true);
  act({ type: 'load', cargo: [...app.sel.cargo], route: app.sel.route });
}

// ---- OPS(工作) ----
function renderOps() {
  const v = app.view;
  const m = me();
  const active = v.phase === 'ops' && !m.ops;
  const placedIdx = new Set(app.sel.placements.map((p) => p.hand));
  let list = `<div class="panel-title">工作カード<small>${app.sel.placements.length}/${E.OPS_PLAY} 枚使用</small></div>`;
  if (v.phase !== 'ops') {
    list += `<p class="hint">工作フェーズになると、ここに3枚のカードが配られます。</p>`;
  } else if (m.ops) {
    list += `<div class="list-group"><span>仕掛けたカード</span></div>` + (m.ops.length ? m.ops.map((o) => `<div class="item">${glyph(o.card)}<span>${E.OPS[o.card].name}</span><span class="num">${E.ROUTE_BY_ID[o.route].short}</span></div>`).join('') : '<p class="hint">今回は何も仕掛けませんでした。</p>');
  } else {
    list +=
      `<div class="list-group"><span>手札</span><span>効果</span></div>` +
      m.opsHand
        .map((c, i) => {
          const used = app.sel.placements.find((p) => p.hand === i);
          return `<button class="item${app.sel.ops === i ? ' sel' : ''}${used ? ' dim' : ''}" data-oh="${i}">${glyph(c)}<span>${E.OPS[c].name}${used ? `<br><span class="tagline">→ ${E.ROUTE_BY_ID[used.route].short}</span>` : ''}</span><span class="num">${E.OPS[c].sign}</span></button>`;
        })
        .join('');
    const sel = app.sel.ops != null ? m.opsHand[app.sel.ops] : null;
    if (sel) list += `<div class="sub-title"><span>${E.OPS[sel].name}</span></div><p>${E.OPS[sel].text}</p><p class="hint">真ん中のルートの「ここに仕掛ける」を押してください。</p>`;
  }
  $('#opsList').innerHTML = list;
  for (const b of $$('#opsList [data-oh]'))
    b.onclick = () => {
      const i = Number(b.dataset.oh);
      const used = app.sel.placements.findIndex((p) => p.hand === i);
      if (used >= 0) app.sel.placements.splice(used, 1);
      app.sel.ops = i;
      sfx('move');
      renderAll();
    };

  // ルートごとに、誰が走るかと、あなたの工作込みの突破率
  const myOps = (route) => (m.ops || app.sel.placements.map((p) => ({ card: m.opsHand[p.hand], route: p.route }))).filter((o) => o.route === route).map((o) => ({ ...o, owner: m.id }));
  const blocks = E.ROUTES.map((r) => {
    const runners = v.players.filter((p) => p.load && p.load.route === r.id);
    const ops = myOps(r.id);
    const rows = runners
      .map((p) => {
        const cards = p.load.cargo.map((i) => p.cargo[i]);
        const setup = E.runSetup(p, cards, r.id, ops);
        const before = E.passChance(p, E.runSetup(p, cards, r.id, []));
        const ch = E.passChance(p, setup);
        const delta = ch - before;
        return `<div class="runner"><i class="chip" style="background:${p.color}"></i><span>${esc(p.name)}${p.id === v.you ? '(あなた)' : ''}<br><small>警戒 ${setup.heatBase}${p.heatPenalty ? '+' + p.heatPenalty : ''} ・ 利益 ${setup.profit}${[...p.parts, ...p.allies].length ? ' ・ ' + [...p.parts, ...p.allies].map((c) => `<span title="${esc(E.cardDef(c).name)}">${GLYPH[c]}</span>`).join('') : ''}</small></span>
          <div class="bar ${ch < 0.5 ? 'red' : ''}"><span style="width:${ch * 100}%"></span></div><span class="val" style="font-family:var(--mono)">${pct(ch)}${Math.abs(delta) > 0.004 ? `<br><small style="color:${delta < 0 ? 'var(--red)' : 'var(--green)'}">${delta > 0 ? '+' : ''}${Math.round(delta * 100)}</small>` : ''}</span></div>`;
      })
      .join('');
    const placed = app.sel.placements
      .filter((p) => p.route === r.id)
      .map((p) => `<span class="mini" data-unplace="${p.hand}" title="クリックで外す">${E.OPS[m.opsHand[p.hand]].name} ✕</span>`)
      .join('') + (m.ops ? m.ops.filter((o) => o.route === r.id).map((o) => `<span class="mini">${E.OPS[o.card].name}</span>`).join('') : '');
    const canPut = active && app.sel.ops != null && !placedIdx.has(app.sel.ops) && app.sel.placements.length < E.OPS_PLAY;
    return `<div class="ops-route"><div class="orh"><span>${r.name}</span><span style="font-family:var(--mono)">上限 ${r.limit}</span></div>
      ${rows || '<div class="runner"><span></span><span class="hint" style="grid-column:2/5">だれも走りません</span></div>'}
      <div class="placed">${placed}${canPut ? `<button class="put" data-put="${r.id}">ここに仕掛ける</button>` : ''}</div></div>`;
  }).join('');
  $('#opsDetail').innerHTML = `<div class="panel-title">ルートと突破率<small>あなたの工作を反映</small></div>${blocks}
    ${active ? `<div class="row-btns"><button class="btn primary" id="opsBtn">工作を確定(${app.sel.placements.length}枚)</button></div>` : ''}
    <p class="hint">ほかのボスの工作は、検問のときまでわかりません。グラフはあなたが知っている情報だけで計算しています。</p>`;
  for (const b of $$('#opsDetail [data-put]'))
    b.onclick = () => {
      app.sel.placements.push({ hand: app.sel.ops, route: b.dataset.put });
      app.sel.ops = null;
      sfx('place');
      renderAll();
    };
  for (const b of $$('#opsDetail [data-unplace]'))
    b.onclick = () => {
      const h = Number(b.dataset.unplace);
      app.sel.placements = app.sel.placements.filter((p) => p.hand !== h);
      sfx('back');
      renderAll();
    };
  $('#opsBtn')?.addEventListener('click', () => act({ type: 'ops', placements: app.sel.placements }));
}

// ---- DATA ----
function renderData() {
  const v = app.view;
  const labels = v.players[0].history.map((h) => (h.round === 0 ? '開始' : `R${h.round}`));
  const series = (key) => v.players.map((p) => ({ name: p.name, color: p.color, values: p.history.map((h) => h[key]), bold: p.id === v.you }));
  $('#dataLeft').innerHTML = `<div class="panel-title">資産(VP)の推移</div>${lineChart({ series: series('vp'), labels })}
    <div class="sub-title"><span>現金の推移(万円)</span></div>${lineChart({ series: series('cash'), labels, height: 160 })}
    <div class="sub-title"><span>予想スコア(VP + 現金÷200)</span></div>
    ${hbars(v.players.map((p) => ({ label: p.name, value: E.finalScore(p), text: `${E.finalScore(p)} VP`, color: p.color })))}`;
  const routeRows = E.ROUTES.map((r) => ({
    label: r.short,
    parts: v.routeHistory.map((h, i) => ({ value: h.routes[r.id] || 0, color: ['#4b483e', '#6f6b5d', '#8d8875', '#a8873a', '#b2523f'][i % 5], name: `R${h.round}` })),
  }));
  const log = v.log.slice(-40).reverse();
  $('#dataRight').innerHTML = `<div class="panel-title">成績</div>
    <table class="sys-table"><tr><th></th><th>出発</th><th>摘発</th><th>成功率</th><th>稼ぎ</th><th>罰金</th></tr>
    ${v.players.map((p) => `<tr><td><i class="chip" style="background:${p.color}"></i> ${esc(p.name)}</td><td>${p.stats.runs}</td><td>${p.stats.busts}</td><td>${p.stats.runs ? pct(1 - p.stats.busts / p.stats.runs) : '−'}</td><td>${p.stats.earned}</td><td>${p.stats.fines}</td></tr>`).join('')}
    </table>
    <div class="sub-title"><span>ルートの利用回数(色=ラウンド)</span></div>${v.routeHistory.length ? stacked(routeRows) : '<p class="hint">まだ記録がありません。</p>'}
    <div class="sub-title"><span>できごと</span></div>
    <div class="pad" style="font-size:13px">${log.map((l) => `<div style="padding:3px 0;border-bottom:1px dashed var(--line);${l.type === 'bust' ? 'color:var(--red)' : l.type === 'success' ? 'color:var(--green)' : ''}">R${l.round} ・ ${esc(l.text)}</div>`).join('')}</div>`;
}

// ---- SYSTEM ----
function renderSystem() {
  const items = [
    ['rules', 'ルールブック'],
    ['slides', 'チュートリアルを見る'],
    ['audio', 'サウンド設定'],
    ...(app.mode === 'online' ? [['room', '部屋の情報']] : []),
    ['title', 'タイトルに戻る'],
  ];
  $('#systemList').innerHTML = `<div class="panel-title">SYSTEM</div>` + items.map(([k, label]) => `<button class="item${app.sel.systemItem === k ? ' sel' : ''}" data-sys="${k}"><span class="glyph"><b>◇</b></span>${label}</button>`).join('');
  for (const b of $$('#systemList [data-sys]'))
    b.onclick = () => {
      const k = b.dataset.sys;
      sfx('move');
      if (k === 'slides') { showSlides(false); return; }
      if (k === 'title') { confirmBox('タイトルに戻りますか?' + (app.mode === 'local' ? '(CPU対戦は「つづきから」で再開できます)' : '(オンラインの部屋からは抜けます)'), toTitle); return; }
      app.sel.systemItem = k;
      renderSystem();
    };
  const d = $('#systemDetail');
  if (app.sel.systemItem === 'audio') {
    const a = getSettings();
    d.innerHTML = `<div class="panel-title">サウンド設定</div>
      <div class="sub-title"><span>BGM(音楽)</span></div>
      <div class="field"><div class="seg" id="bgmSeg"><button data-v="1" class="${a.bgm ? 'on' : ''}">ON</button><button data-v="0" class="${a.bgm ? '' : 'on'}">OFF</button></div>
        音量<input type="range" class="range" id="bgmVol" min="0" max="1" step="0.05" value="${a.bgmVol}" style="margin:6px 0;width:100%"></div>
      <div class="sub-title"><span>効果音(SE)</span></div>
      <div class="field"><div class="seg" id="seSeg"><button data-v="1" class="${a.se ? 'on' : ''}">ON</button><button data-v="0" class="${a.se ? '' : 'on'}">OFF</button></div>
        音量<input type="range" class="range" id="seVol" min="0" max="1" step="0.05" value="${a.seVol}" style="margin:6px 0;width:100%"></div>
      <div class="row-btns"><button class="btn small" id="seTest">効果音を試す</button></div>
      <p class="hint">BGM と効果音は、その場で合成しています(音のファイルは使っていません)。設定はこのブラウザに保存されます。</p>`;
    $('#bgmSeg').onclick = (e) => { const b = e.target.closest('button'); if (b) { setSetting('bgm', b.dataset.v === '1'); renderSystem(); } };
    $('#seSeg').onclick = (e) => { const b = e.target.closest('button'); if (b) { setSetting('se', b.dataset.v === '1'); renderSystem(); sfx('ok'); } };
    $('#bgmVol').oninput = (e) => setSetting('bgmVol', Number(e.target.value));
    $('#seVol').oninput = (e) => setSetting('seVol', Number(e.target.value));
    $('#seVol').onchange = () => sfx('buy');
    $('#seTest').onclick = () => { const k = ['buy', 'success', 'bust', 'dice', 'launder'][Math.floor(Math.random() * 5)]; sfx(k); };
    return;
  }
  if (app.sel.systemItem === 'room' && app.mode === 'online') {
    d.innerHTML = `<div class="panel-title">部屋の情報</div><div class="room-code">${esc(app.session.code)}</div><p class="hint">リロードしても、同じブラウザならこの部屋に戻れます。</p>`;
  } else {
    d.innerHTML = `<div class="panel-title">ルールブック</div><div class="rules-body" style="padding:12px">${RULES_HTML}</div>`;
  }
}

// ---- MAP の上の操作盤 ----
function renderMapHud() {
  const v = app.view;
  const m = me();
  const hud = $('#mapHud');
  if (app.tab !== 'map' || app.animating) {
    hud.innerHTML = '';
    return;
  }
  let html = '';
  if (v.phase === 'load' && !m.load) {
    const fc = loadForecast();
    html = `<div class="panel-title">積載<small>トラックを運んでルート決定</small></div>
      ${app.boardFailed ? '<p class="hint">3D を読み込めなかったため、CARGO タブで選んでください。</p>' : '<p class="hint">光っている自分のトラックをつかんで、ルートの<b>出発地点(六角形の台)</b>へドラッグ。台をクリックしても選べます。</p>'}
      ${cargoChecklist(true)}
      <div class="sub-title"><span>ルート(ボタンでも選べます)</span><span>${app.sel.route ? E.ROUTE_BY_ID[app.sel.route].name : '未選択'}</span></div>
      <div class="route-pick">${E.ROUTES.map((r) => {
        const cards = selectedCards();
        const ch = cards.length ? E.passChance(m, E.runSetup(m, cards, r.id, [])) : 0;
        return `<button class="route-card${app.sel.route === r.id ? ' on' : ''}" data-hroute="${r.id}"><span class="rl">${r.limit}</span><div class="rn">${r.short}</div><span class="pct">${cards.length ? '突破 ' + pct(ch) : '−'}</span></button>`;
      }).join('')}</div>
      ${fc ? `<div style="display:flex;align-items:center;gap:10px;margin:0 14px">${donut(fc.pass, { size: 78 })}<div style="flex:1;font-size:13px">警戒度 ${fc.setup.heatBase}${m.heatPenalty ? '+' + m.heatPenalty : ''} / 上限 ${fc.setup.limit}<br>利益 +${man(fc.setup.profit)}<br>期待値 ${man(fc.ev)}</div></div>` : ''}
      <div class="sticky-go"><div class="row-btns">${app.sel.cargo.size ? `<button class="btn primary" id="hudGo" ${app.sel.route ? '' : 'disabled'}>${app.sel.route ? 'この内容で出発' : 'ルートを選んでください'}</button>` : m.cargo.length ? '<span class="hint">積む貨物にチェックを入れてください</span> <button class="btn" id="hudRest">今回は休む</button>' : '<button class="btn primary" id="hudRest">今回は休む</button>'}</div></div>`;
  } else if (v.phase === 'ops' || v.phase === 'load') {
    html = `<div class="panel-title">${v.phase === 'ops' ? '工作フェーズ' : '積載フェーズ'}</div>
      <p>${v.phase === 'ops' ? (m.ops ? 'ほかのボスの工作を待っています…' : '<b>OPS</b> タブで工作カードを仕掛けてください。') : 'ほかのボスが積荷を決めるのを待っています…'}</p>
      <div class="legend">${v.players.map((p) => `<div><i class="chip" style="background:${p.color}"></i>${esc(p.name)} ${p.load && p.load.route ? `→ ${E.ROUTE_BY_ID[p.load.route].name}` : p.load && p.load.ready ? '(決定済み)' : p.load ? '(休み)' : ''}</div>`).join('')}</div>
      ${v.phase === 'ops' && !m.ops ? '<div class="row-btns"><button class="btn primary" id="hudOps">OPS タブへ</button></div>' : ''}`;
  } else if (v.phase === 'launder' && v.resolution) {
    html = `<div class="panel-title">検問の結果 ・ ラウンド${v.resolution.round}</div>${resultSummary(v.resolution)}`;
  } else if (v.phase === 'market') {
    html = `<div class="panel-title">仕入れフェーズ</div><p>${v.turn === v.you ? 'あなたの番です。<b>MARKET</b> タブで買い物をしてください。' : `${esc(v.players[v.turn].name)} が仕入れ中…`}</p>
      <div class="legend">${E.ROUTES.map((r) => `<div><b style="font-family:var(--mono);width:26px">${r.limit}</b>${r.name} — ${r.desc}</div>`).join('')}</div>
      ${v.turn === v.you ? '<div class="row-btns"><button class="btn primary" id="hudMarket">MARKET タブへ</button></div>' : ''}`;
  } else if (v.phase === 'end') {
    html = `<div class="panel-title">ゲーム終了</div><p>勝者:<b>${esc(v.players[v.winner].name)}</b></p><div class="row-btns"><button class="btn primary" id="hudResult">結果を見る</button></div>`;
  }
  hud.innerHTML = html;
  bindChecklist(hud);
  for (const b of $$('[data-hroute]', hud))
    b.onclick = () => {
      app.sel.route = b.dataset.hroute;
      sfx('select');
      renderAll();
    };
  $('#hudGo')?.addEventListener('click', submitLoad);
  $('#hudRest')?.addEventListener('click', () => act({ type: 'load', cargo: [], route: null }));
  $('#hudOps')?.addEventListener('click', () => setTab('ops'));
  $('#hudMarket')?.addEventListener('click', () => setTab('market'));
  $('#hudResult')?.addEventListener('click', () => { app.resultClosed = false; renderModals(); });
}

function resultSummary(res) {
  const v = app.view;
  return `<div class="legend">${res.results
    .map((r) => {
      const p = v.players[r.pid];
      if (r.skipped) return `<div><i class="chip" style="background:${p.color}"></i>${esc(p.name)}:休み</div>`;
      return `<div><i class="chip" style="background:${p.color}"></i>${esc(p.name)}:${E.ROUTE_BY_ID[r.route].short} ${r.final}/${r.limit} ${r.success ? `<b style="color:var(--green)">突破 +${r.profit}</b>` : `<b style="color:var(--red)">摘発 -${r.fine}</b>`}</div>`;
    })
    .join('')}</div>`;
}

// ---- メッセージ欄 ----
function renderMessage() {
  const v = app.view;
  const m = me();
  let text = '';
  if (app.animating) text = '検問中…';
  else if (v.phase === 'market') text = v.turn === v.you ? `あなたの番です。カードを選んで購入するか、「買い物を終える」を押してください。(あと${E.MAX_BUYS - m.bought}枚)` : `${v.players[v.turn].name} が仕入れ中です…`;
  else if (v.phase === 'load') text = m.load ? 'ほかのボスが積荷を決めるのを待っています…' : '運ぶ貨物とルートを決めてください。';
  else if (v.phase === 'ops') text = m.ops ? 'ほかのボスの工作を待っています…' : '工作カードを仕掛けるルートを選んでください。';
  else if (v.phase === 'launder') text = m.laundered !== null ? 'ほかのボスの洗浄を待っています…' : '稼いだ現金を洗浄してください。';
  else if (v.phase === 'end') text = `ゲーム終了。勝者は ${v.players[v.winner].name}!`;
  $('#msg').textContent = text;
  $('#msgKeys').innerHTML = '<span>◆ 選択</span><span>◎ 決定</span><span>✕ 戻る</span>';
}

// ---- 3D の盤の配置 ----
function updateBoard() {
  const b = app.board;
  if (!b || app.animating) return;
  const v = app.view;
  const m = me();
  const pos = {};
  if (v.phase === 'load') {
    if (!m.load && app.sel.route) pos[m.id] = { route: app.sel.route, at: 'start' };
    if (m.load && m.load.route) pos[m.id] = { route: m.load.route, at: 'start' };
  } else if (v.phase === 'ops') {
    for (const p of v.players) if (p.load && p.load.route) pos[p.id] = { route: p.load.route, at: 'start' };
  } else if ((v.phase === 'launder' || v.phase === 'end') && v.resolution) {
    for (const r of v.resolution.results) if (!r.skipped) pos[r.pid] = { route: r.route, at: r.success ? 'goal' : 'bust' };
  }
  b.layout(pos);
  b.setDraggable(v.phase === 'load' && !m.load && app.tab === 'map' ? m.id : null);
  let cards = [];
  if (v.phase === 'ops') {
    const mine = m.ops || app.sel.placements.map((p) => ({ card: m.opsHand[p.hand], route: p.route }));
    cards = mine.map((o) => ({ route: o.route, card: o.card, revealed: true, owner: m.id, ownerColor: m.color }));
  } else if ((v.phase === 'launder' || v.phase === 'end') && v.resolution) {
    cards = v.resolution.ops.map((o) => ({ route: o.route, card: o.card, revealed: true, owner: o.owner, ownerColor: v.players[o.owner].color }));
  }
  const sig = JSON.stringify(cards);
  if (sig !== app.cardSig) {
    app.cardSig = sig;
    b.setOpsCards(cards);
  }
}

// ---- 検問の演出 ----
async function playResolution() {
  const v = app.view;
  const res = v.resolution;
  app.animating = true;
  app.skip = false;
  hideModal();
  setTab('map');
  music('tense');
  coach('resolve');
  const b = app.board;
  const cp = $('#checkpoint');
  if (b) {
    const pos = {};
    for (const r of res.results) if (!r.skipped) pos[r.pid] = { route: r.route, at: 'start' };
    b.setDraggable(null);
    b.layout(pos);
    app.cardSig = null;
    b.setOpsCards(res.ops.map((o) => ({ route: o.route, card: o.card, revealed: false, owner: o.owner, ownerColor: v.players[o.owner].color })));
  }
  renderMapHud();
  renderMessage();
  const flipped = new Set();
  for (const r of res.results) {
    if (r.skipped) continue;
    const p = v.players[r.pid];
    const route = E.ROUTE_BY_ID[r.route];
    const draw = (stage) => {
      const diceText = stage >= 2 ? (r.nitro ? '1' : r.diceTotal) : '?';
      const total = stage >= 2 ? r.final : '?';
      const opsHtml = stage >= 1 ? (r.ops.length ? r.ops.map((o) => `<span class="${o.active ? '' : 'off'}" title="${esc(o.note || '')}">${E.OPS[o.card].name}${o.owner != null ? `(${esc(v.players[o.owner].name)})` : ''}</span>`).join('') : '<span>工作なし</span>') : '<span>工作カード ? </span>';
      const fill = stage >= 2 ? Math.min(100, (r.final / (r.limit + 6)) * 100) : Math.min(100, ((r.heatBase + r.penalty) / (r.limit + 6)) * 100);
      cp.innerHTML = `<div class="panel-title"><span><i class="chip" style="background:${p.color}"></i> ${esc(p.name)} ・ ${route.name}</span><button class="btn small" id="skipBtn" style="padding:2px 10px;color:var(--ink)">スキップ ▶▶</button></div>
        <div class="cp-body">
          <div class="opscards">${opsHtml}</div>
          <div class="eq">
            <span class="t"><small>荷物</small>${r.heatBase}</span>
            ${r.penalty ? `<span>+</span><span class="t"><small>破産</small>${r.penalty}</span>` : ''}
            <span>+</span><span class="t ${stage < 1 ? 'wait' : ''}"><small>工作</small>${stage >= 1 ? (r.opsMod >= 0 ? '+' : '') + r.opsMod : '?'}</span>
            ${r.chem && stage >= 2 ? `<span>+</span><span class="t"><small>化学薬品</small>${r.chem > 0 ? '+' : ''}${r.chem}</span>` : ''}
            <span>+</span><span class="t ${stage === 1 ? 'wait' : ''}"><small>${r.fixed ? '出目(固定)' : `出目 d${r.sides}`}</small>${diceText}</span>
            <span>=</span><span class="t"><small>最終</small>${total}</span>
            <span>/</span><span class="t"><small>上限</small>${r.limit}</span>
          </div>
          <div class="gauge"><div class="fill ${stage >= 2 && !r.success ? 'ng' : ''}" style="width:${fill}%"></div><div class="lim" data-l="${r.limit}" style="left:${(r.limit / (r.limit + 6)) * 100}%"></div></div>
          ${stage >= 3 ? `<div class="verdict ${r.success ? 'ok' : 'ng'}">${r.success ? '検問突破' : '摘 発'}</div>
            <div style="text-align:center;font-family:var(--mono);font-size:18px">${r.success ? `+${man(r.profit)}` : `罰金 -${man(r.fine)}`}</div>` : ''}
          ${stage >= 2 && r.events.length ? `<ul class="events">${r.events.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
        </div>`;
      cp.classList.remove('hidden');
      $('#skipBtn').onclick = () => { app.skip = true; };
    };
    draw(0);
    if (b) {
      b.focus(r.route, 24);
      if (!app.skip) { engine(1.4); await b.drive(r.pid, r.route, 0.04, 0.42, 1400); }
    } else await wait(600);
    if (!flipped.has(r.route)) {
      flipped.add(r.route);
      if (b && !app.skip) { sfx('flip'); await b.flipOps(r.route); }
    }
    draw(1);
    await wait(500);
    sfx('dice');
    for (let k = 0; k < r.rolls.length; k++) {
      const dice = r.rolls[k];
      const labels = dice.map((_, i) => (r.trailer && i < 2 ? 'トレーラー' : i >= (r.trailer ? 2 : 1) ? '検問激化' : ''));
      if (b && !app.skip) await b.rollDice(dice, r.sides, r.route, labels);
      if (k < r.rolls.length - 1) { toast('メカニックが振り直し!'); await wait(700); }
    }
    if (r.nitro) {
      toast('ニトロブースター点火!出目を1に');
      if (b && !app.skip) await b.rollDice([1], r.sides, r.route, ['ニトロ']);
    }
    draw(2);
    await wait(700);
    draw(3);
    if (r.success) {
      sfx('success');
      if (b) {
        b.lampColor(r.route, 0x2a6a2a);
        if (!app.skip) { engine(1.2); await b.drive(r.pid, r.route, 0.42, 0.985, 1200); }
        b.coins(b.truckPos(r.pid));
        sfx('coin');
        b.lampColor(r.route, 0x000000);
      }
    } else {
      sfx('bust');
      if (b) {
        b.police(r.route, true);
        if (!app.skip) await b.shake(r.pid);
      }
      await wait(900);
      b?.police(r.route, false);
    }
    await wait(1100);
    b?.clearDice();
  }
  cp.classList.add('hidden');
  b?.focus(null);
  app.animRound = res.round;
  app.animating = false;
  music('calm');
  app.skip = false;
  app.cardSig = null;
  if (app.view.phase === 'launder') setTab('map', false);
  coach('launder');
  renderAll();
}

// ---- 小窓(洗浄・結果) ----
function hideModal() {
  $('#modal').classList.add('hidden');
  app.modalKind = null;
}
function showModal(kind, html) {
  $('#modalBox').innerHTML = html;
  $('#modal').classList.remove('hidden');
  app.modalKind = kind;
}

function renderModals() {
  const v = app.view;
  const m = me();
  if (app.animating) return;
  if (v.phase === 'launder' && m.laundered === null) {
    if (app.modalKind !== 'launder') renderLaunder();
    return;
  }
  if (v.phase === 'end') {
    if (app.modalKind !== 'end' && !app.resultClosed) renderEnd();
    return;
  }
  if (app.modalKind === 'launder' || app.modalKind === 'end') hideModal();
}

function renderLaunder() {
  const v = app.view;
  const m = me();
  const cap = E.launderCapOf(m);
  const max = Math.floor(Math.min(cap, m.cash) / E.VP_PER) * E.VP_PER;
  const last = v.round >= E.ROUNDS;
  if (app.launderAmount == null) app.launderAmount = last ? max : Math.max(0, Math.min(max, Math.floor((m.cash - 600) / 100) * 100));
  const mine = v.resolution?.results.find((r) => r.pid === m.id);
  const deltas = v.players.map((p) => {
    const h = p.history[p.history.length - 1];
    return { label: p.name, value: Math.abs(p.cash - h.cash), text: `${p.cash - h.cash >= 0 ? '+' : ''}${p.cash - h.cash}`, color: p.cash - h.cash >= 0 ? '#5d7d55' : '#b2523f' };
  });
  const draw = () => {
    const a = app.launderAmount;
    const gain = E.launderVp(m, a);
    $('#launderPreview').innerHTML = `<div class="kpis">
      <div class="kpi"><div class="k">洗う金額</div><div class="v">${a}</div></div>
      <div class="kpi"><div class="k">得る資産</div><div class="v green">+${gain} VP</div></div>
      <div class="kpi"><div class="k">残る現金</div><div class="v">${m.cash - a}</div></div></div>
      ${hbars([
        { label: '資産 VP', value: m.vp + gain, text: `${m.vp} → ${m.vp + gain}`, color: '#4b483e' },
        { label: '予想スコア', value: m.vp + gain + Math.floor((m.cash - a) / E.LEFTOVER_PER), text: `${E.finalScore(m)} → ${m.vp + gain + Math.floor((m.cash - a) / E.LEFTOVER_PER)}`, color: '#5d7d55' },
      ], { max: Math.max(20, m.vp + gain + 10) })}`;
  };
  showModal(
    'launder',
    `<div class="panel-title">MONEY LAUNDERING<small>資金洗浄 ・ ラウンド${v.round}</small></div>
    <p>${mine ? (mine.skipped ? '今回は休みました。' : mine.success ? `検問突破!<b>+${man(mine.profit)}</b>` : `摘発されました… 罰金 <b>${man(mine.fine)}</b>`) : ''}
    手持ち ${man(m.cash)} のうち、最大 <b>${man(cap)}</b> まで洗えます(100万円 = ${m.allies.includes('ally:accountant') ? '1.5' : '1'} VP)。
    ${last ? '<br><b>最終ラウンドです。</b>洗わなかった現金は 200万円 = 1VP にしかなりません。' : '<br>次のラウンドの仕入れ用に、少し残しておくのも作戦です。'}</p>
    <input type="range" class="range" id="launderRange" min="0" max="${max}" step="100" value="${app.launderAmount}">
    <div id="launderPreview"></div>
    <div class="sub-title"><span>このラウンドの現金の増減(万円)</span></div>
    ${hbars(deltas)}
    <div class="row-btns"><button class="btn" id="lMax">上限まで洗う</button><button class="btn primary" id="lGo">この金額で洗う</button></div>`
  );
  draw();
  $('#launderRange').oninput = (e) => {
    app.launderAmount = Number(e.target.value);
    draw();
  };
  $('#lMax').onclick = () => {
    app.launderAmount = max;
    $('#launderRange').value = max;
    draw();
  };
  $('#lGo').onclick = async () => {
    const ok = await act({ type: 'launder', amount: app.launderAmount });
    // 送った直後に次の画面(最終結果など)が出ていたら、それは閉じない
    if (ok && app.modalKind === 'launder') hideModal();
  };
}

function renderEnd() {
  const v = app.view;
  const fin = v.final || [];
  if (app.endSound !== v.final) {
    app.endSound = v.final;
    sfx(fin[0] && fin[0].id === v.you ? 'win' : 'lose');
  }
  const max = Math.max(1, ...fin.map((f) => f.total));
  const isHost = app.mode === 'local' || app.session?.seat === 0;
  showModal(
    'end',
    `<div class="panel-title">RESULT<small>ゲーム終了</small></div>
    <div style="text-align:center;margin:14px"><div class="hint">この街の真の支配者</div><div style="font-size:30px;letter-spacing:.2em">${esc(fin[0]?.name || '')}</div></div>
    ${fin
      .map(
        (f, i) => `<div class="stat-row" style="grid-template-columns:120px 1fr 70px"><span>${i + 1}位 ${esc(f.name)}</span>
        <div class="bar" style="display:flex;height:14px"><span style="position:relative;width:${(f.vp / max) * 100}%;background:${v.players[f.id].color}"></span><span style="position:relative;width:${(f.leftover / max) * 100}%;background:${v.players[f.id].color};opacity:.45"></span></div>
        <span class="val">${f.total} VP</span></div>`
      )
      .join('')}
    <p class="hint">濃い色 = 洗浄した資産、うすい色 = 残った現金(200万円 = 1VP)</p>
    ${lineChart({ series: v.players.map((p) => ({ name: p.name, color: p.color, values: p.history.map((h) => h.vp), bold: p.id === v.you })), labels: v.players[0].history.map((h) => (h.round ? `R${h.round}` : '開始')) })}
    <div class="row-btns">
      <button class="btn" id="eData">DATA を見る</button>
      <button class="btn" id="eTitle">タイトルへ</button>
      ${isHost ? '<button class="btn primary" id="eAgain">もう一度遊ぶ</button>' : '<span class="hint">部屋を作った人が「もう一度」を押すと再戦できます。</span>'}
    </div>`
  );
  $('#eData').onclick = () => { app.resultClosed = true; hideModal(); setTab('data'); };
  $('#eTitle').onclick = () => toTitle();
  $('#eAgain')?.addEventListener('click', rematch);
}

function rematch() {
  app.resultClosed = false;
  if (app.mode === 'local') {
    const s = app.session;
    const players = s.state.players.map((p) => ({ name: p.name, cpu: p.cpu }));
    startSession(new LocalSession(E.createGame(players), { level: s.level }), 'local');
    app.tutorial = false;
  } else {
    app.session.host('rematch').catch((e) => toast(e.message, true));
  }
}

function confirmBox(text, onYes) {
  showModal('confirm', `<div class="panel-title">確認</div><p>${esc(text)}</p><div class="row-btns"><button class="btn" id="cNo">いいえ</button><button class="btn primary" id="cYes">はい</button></div>`);
  $('#cNo').onclick = () => { hideModal(); renderAll(); };
  $('#cYes').onclick = () => { hideModal(); onYes(); };
}

// ---- 行動を送る ----
async function act(action) {
  if (app.sending) return false;
  app.sending = true;
  try {
    await app.session.send(action);
    sfx({ buy: 'buy', launder: 'launder', pass: 'back' }[action.type] || 'ok');
    return true;
  } catch (e) {
    toast(e.message, true);
    sfx('error');
    return false;
  } finally {
    app.sending = false;
  }
}

// ---- チュートリアル ----
function coach(key) {
  if (!app.tutorial || app.coachSeen.has(key) || !COACH[key]) return;
  app.coachSeen.add(key);
  app.coachQueue.push(...COACH[key]);
  if ($('#coach').classList.contains('hidden')) nextCoach();
}
function nextCoach() {
  $$('.focus-ring').forEach((e) => e.classList.remove('focus-ring'));
  const step = app.coachQueue.shift();
  if (!step) {
    $('#coach').classList.add('hidden');
    return;
  }
  $('#coachText').innerHTML = step.text;
  $('#coachStep').textContent = app.coachQueue.length ? `あと${app.coachQueue.length}` : '';
  $('#coach').classList.remove('hidden');
  if (step.focus) setTimeout(() => $(step.focus)?.classList.add('focus-ring'), 50);
}
$('#coachNext').onclick = () => {
  sfx('ok');
  nextCoach();
};

function showSlides(thenPlay) {
  let i = 0;
  const draw = () => {
    const s = SLIDES[i];
    showModal(
      'slides',
      `<div class="panel-title">TUTORIAL<small>${i + 1} / ${SLIDES.length}</small></div>
      <div class="slides"><div class="sub-title" style="font-size:18px;color:var(--ink)"><span>${s.title}</span></div>
      <div class="slide-art">${s.art}</div><p>${s.text}</p>
      <div class="slide-dots">${SLIDES.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="row-btns"><button class="btn" id="sPrev">${i ? '戻る' : '閉じる'}</button><button class="btn primary" id="sNext">${i < SLIDES.length - 1 ? '次へ' : thenPlay ? '練習ゲームを始める' : '閉じる'}</button></div></div>`
    );
    $('#sPrev').onclick = () => {
      sfx('back');
      if (i) { i--; draw(); } else { hideModal(); if (app.view) renderAll(); }
    };
    $('#sNext').onclick = () => {
      sfx('ok');
      if (i < SLIDES.length - 1) { i++; draw(); return; }
      hideModal();
      if (thenPlay) startTutorialGame();
      else if (app.view) renderAll();
    };
  };
  draw();
}

function startTutorialGame() {
  app.tutorial = true;
  const state = E.createGame([{ name: $('#setupName').value || 'ボス' }, { name: 'CPU-カラス', cpu: true }], 20261003);
  startSession(new LocalSession(state, { level: 'easy', tutorial: true }), 'local');
}

// ---- ロビー ----
function renderLobby() {
  const l = app.lobby;
  if (!l || l.started) return;
  if ($('#lobby').classList.contains('hidden')) showScreen('lobby');
  $('#lobbyJoin').classList.add('hidden');
  $('#lobbyRoom').classList.remove('hidden');
  $('#roomCode').textContent = l.code;
  $('#roomLink').value = `${location.origin}${location.pathname}?room=${l.code}`;
  const host = app.session.seat === 0;
  $('#seatList').innerHTML = l.seats
    .map((s, i) => `<li><span class="chip" style="background:${E.PLAYER_COLORS[i]}"></span>${esc(s.name)}${i === app.session.seat ? '(あなた)' : ''}<span class="tag">${s.cpu ? 'CPU' : s.host ? '部屋主' : ''} ${s.online ? '●接続中' : '○切断'}</span></li>`)
    .join('');
  $('#hostBtns').classList.toggle('hidden', !host);
  $('#startOnlineBtn').classList.toggle('hidden', !host);
  $('#lobbyWait').textContent = host ? (l.seats.length < 2 ? '友達を待つか、CPU を追加してください。' : '準備ができたら「ゲーム開始」。') : '部屋を作った人がゲームを始めるのを待っています…';
  $('#lobbyMsg').textContent = `部屋コード ${l.code}(${l.seats.length}/4人)`;
}

function toTitle() {
  app.session?.close();
  app.session = null;
  app.view = null;
  app.tutorial = false;
  app.resultClosed = false;
  hideModal();
  $('#coach').classList.add('hidden');
  $('#checkpoint').classList.add('hidden');
  if (app.mode === 'online') store('bh-online', null);
  app.mode = null;
  app.board?.focus(null);
  app.board?.setOpsCards([]);
  app.board?.layout({});
  app.board?.setDraggable(null);
  refreshResume();
  showScreen('title');
}

function refreshResume() {
  const saved = load('bh-local');
  $('#resumeItem').classList.toggle('hidden', !(saved && saved.state && saved.state.phase !== 'end'));
}

// ---- ボタンのつなぎこみ ----
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const a = btn.dataset.act;
  sfx(a === 'back' || a === 'leave' || a === 'closeRules' ? 'back' : 'ok');
  try {
    if (a === 'tutorial') showSlides(true);
    else if (a === 'cpu') showScreen('setup');
    else if (a === 'online') {
      showScreen('lobby');
      $('#lobbyJoin').classList.remove('hidden');
      $('#lobbyRoom').classList.add('hidden');
    } else if (a === 'rules') {
      $('#rulesBody').innerHTML = RULES_HTML;
      showScreen('rules');
    } else if (a === 'closeRules' || a === 'back') showScreen('title');
    else if (a === 'resume') {
      const saved = load('bh-local');
      if (!saved) return;
      app.tutorial = !!saved.tutorial;
      startSession(new LocalSession(saved.state, { level: saved.level, tutorial: saved.tutorial }), 'local');
    } else if (a === 'startCpu') {
      const n = Number($('#setupCount .on').dataset.v);
      const level = $('#setupLevel .on').dataset.v;
      const names = ['CPU-カラス', 'CPU-サソリ', 'CPU-キツネ'];
      const players = [{ name: $('#setupName').value.trim() || 'ボス' }, ...names.slice(0, n).map((name) => ({ name, cpu: true }))];
      app.tutorial = false;
      startSession(new LocalSession(E.createGame(players), { level }), 'local');
    } else if (a === 'createRoom' || a === 'joinRoom') {
      const name = $('#lobbyName').value.trim() || 'ボス';
      store('bh-name', name);
      const data = a === 'createRoom' ? await post('/api/bh/create', { name }) : await post('/api/bh/join', { name, code: $('#lobbyCode').value.trim().toUpperCase() });
      store('bh-online', data);
      app.tutorial = false;
      startSession(new OnlineSession(data), 'online');
    } else if (a === 'addCpu' || a === 'removeCpu') await app.session.host(a);
    else if (a === 'startOnline') await app.session.host('start');
    else if (a === 'copyLink') {
      await navigator.clipboard?.writeText($('#roomLink').value);
      toast('リンクをコピーしました');
    } else if (a === 'leave') toTitle();
  } catch (err) {
    toast(err.message, true);
  }
});

for (const seg of $$('.seg'))
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    for (const x of $$('button', seg)) x.classList.toggle('on', x === b);
    sfx('move');
  });

for (const b of $$('#tabs button')) b.onclick = () => setTab(b.dataset.tab);
$('#modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal' && (app.modalKind === 'slides' || app.modalKind === 'confirm')) {
    hideModal();
    if (app.view) renderAll();
  }
});
document.addEventListener('mouseover', (e) => {
  const t = e.target.closest('.menu-list button, .item:not([disabled]), .tabs button');
  if (t && t !== app.lastHover) {
    app.lastHover = t;
    sfx('move');
  }
});

// ブラウザの決まりで、最初の操作のあとでないと音が出ないので、操作のたびに音を起こす
document.addEventListener('pointerdown', unlock, true);
document.addEventListener('keydown', unlock, true);

// ---- 起動 ----
(async function boot() {
  music('title');
  if (new URLSearchParams(location.search).has('debug')) window.__bh = app; // 動作確認用
  const savedName = load('bh-name');
  if (savedName) {
    $('#lobbyName').value = savedName;
    $('#setupName').value = savedName;
  }
  refreshResume();
  const params = new URLSearchParams(location.search);
  const room = params.get('room');
  const online = load('bh-online');
  // 3D は裏で先に読み込んでおく(タイトルの奥に港が見える)
  ensureBoard().then(() => $('#boot').classList.add('done'));
  setTimeout(() => $('#boot').classList.add('done'), 4000);
  if (online && (!room || room === online.code)) {
    // リロードしたら同じ部屋に戻る
    try {
      const data = await post('/api/bh/join', { code: online.code, token: online.token, name: savedName || 'ボス' });
      startSession(new OnlineSession(data), 'online');
      return;
    } catch {
      store('bh-online', null);
    }
  }
  if (room) {
    showScreen('lobby');
    $('#lobbyCode').value = room.toUpperCase();
    $('#lobbyMsg').textContent = `部屋コード ${room.toUpperCase()} に招待されています。名前を入れて「部屋に入る」を押してください。`;
  }
})();
