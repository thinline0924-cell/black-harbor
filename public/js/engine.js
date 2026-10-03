// BLACK HARBOR — ルールの計算(ゲームの心臓部)
// ブラウザ(CPU対戦)とサーバー(オンライン対戦)の両方で、このファイルをそのまま使います。
// 画面のことは何も知らない「純粋な計算」だけを書いています。
// お金の単位はすべて「万円」です(800 = 800万円)。

export const ROUNDS = 5;
export const START_CASH = 1000; // 最初の手持ち
export const ROUND_INCOME = 300; // 毎ラウンドはじめにもらえる上納金
export const BASE_CAPACITY = 3; // 1回に積める貨物の枚数
export const MAX_PARTS = 3;
export const MAX_ALLIES = 2;
export const MAX_BUYS = 3; // 1ラウンドに買える枚数
export const OPS_HAND = 3; // 毎ラウンド配られる工作カード
export const OPS_PLAY = 2; // 仕掛けられる枚数
export const LAUNDER_CAP = 1000; // 1ラウンドに洗える現金の上限
export const VP_PER = 100; // 100万円 = 1 VP
export const LEFTOVER_PER = 200; // 洗っていない現金は 200万円 = 1 VP
export const BANKRUPT_HEAT = 2;
export const PLAYER_COLORS = ['#c94f3d', '#3d7fc9', '#d1a23a', '#4fa36b'];

export const ROUTES = [
  { id: 'sea', name: '裏道の海路', short: '海路', limit: 8, fineMul: 1, desc: '上限は低いが、軽い荷物なら堅実。' },
  { id: 'old', name: '旧市街', short: '旧市街', limit: 12, fineMul: 1, desc: '標準的なルート。工作合戦の激戦区。' },
  { id: 'hwy', name: '高速道路', short: '高速', limit: 15, fineMul: 1, desc: '大量に積むならここ。' },
  { id: 'under', name: '地下廃棄道', short: '地下', limit: 18, fineMul: 2, desc: '限界突破ルート。ただし罰金2倍。' },
];
export const ROUTE_BY_ID = Object.fromEntries(ROUTES.map((r) => [r.id, r]));

export const CARGO = {
  brand: { name: '偽ブランド品', short: 'ブランド', profit: 400, heat: 1, cost: 150, count: 8, text: '軽くて目立たない。少しずつ稼ぐ入門貨物。' },
  rifle: { name: '軍用アサルトライフル', short: 'ライフル', profit: 800, heat: 3, cost: 300, count: 12, text: '扱いやすい標準的な貨物。たくさん積むと過積載に。' },
  art: { name: '盗品美術品', short: '美術品', profit: 1500, heat: 5, cost: 600, count: 5, text: '壊れやすいのでダイスを振らない(出目は必ず5)。計算どおりに運べる。' },
  chem: { name: '不安定な化学薬品', short: '化学薬品', profit: 2000, heat: 4, cost: 700, count: 5, text: '出目が偶数なら警戒度+4、奇数なら-4。究極のギャンブル。' },
  beast: { name: '生きた希少珍獣', short: '珍獣', profit: 1200, heat: 6, cost: 500, count: 5, text: '摘発されても没収されず、手元に戻ってくる。' },
};

export const PARTS = {
  nitro: { name: 'ニトロブースター', cost: 300, count: 5, text: '摘発されそうなとき自動で使い、出目を「1」にする。使うと壊れる(使い捨て)。' },
  trailer: { name: '増設トレーラー', cost: 400, count: 4, text: '積める枚数+3。ただしダイスを2個振って高いほうを使う。' },
  susp: { name: 'サスペンション改造', cost: 600, count: 4, text: '6面ダイスの代わりに4面ダイス(1〜4)を振る。' },
  emp: { name: 'EMPジャマー', cost: 500, count: 4, text: '自分のルートの「タレコミ」か「検問激化」を毎ラウンド1枚だけ無効にする。' },
};

export const ALLIES = {
  mechanic: { name: 'メカニック', cost: 500, count: 3, text: '摘発されそうなら50万円払ってダイスを1回振り直す(自動)。' },
  daredevil: { name: '特攻野郎', cost: 600, count: 3, text: '最終警戒度が上限ぴったりで突破すると、利益が3倍。' },
  hyena: { name: 'ハイエナ', cost: 400, count: 3, text: 'ほかのプレイヤーが摘発されるたびに100万円もらえる。' },
  lawyer: { name: '敏腕弁護士', cost: 500, count: 3, text: '摘発されても罰金が0になる。' },
  launderer: { name: 'マネーロンダラー', cost: 700, count: 3, text: '1ラウンドに洗える現金の上限が+1000万円。' },
  accountant: { name: '悪徳会計士', cost: 700, count: 3, text: '洗ったときにもらえる資産(VP)が1.5倍。' },
};

export const OPS = {
  tip: { name: 'タレコミ', sign: '+3', count: 2, text: 'このルートの警戒度+3。過積載のライバルを摘発に追い込む。' },
  safe: { name: '安全通行', sign: '-3', count: 2, text: 'このルートの警戒度-3。悪徳警官への賄賂。' },
  crack: { name: '検問激化', sign: '+🎲', count: 1, text: 'このルートを通る全員がダイスを1個多く振り、合計する。' },
  fake: { name: 'フェイクニュース', sign: '✕', count: 1, text: 'このルートのタレコミをすべて無効にする。' },
  decoy: { name: 'おとり作戦', sign: '¥', count: 1, text: 'このルートで摘発が出たら、その貨物の利益の半分を横取りする。' },
};

// ---- 乱数(テストで同じ結果を再現できるよう、種から作れるようにしておく) ----
export function makeRng(seed = (Math.random() * 2 ** 32) >>> 0) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildDeck(table, kind) {
  const out = [];
  for (const [type, def] of Object.entries(table)) for (let i = 0; i < def.count; i++) out.push(`${kind}:${type}`);
  return out;
}

export function cardKind(card) {
  return card.split(':')[0];
}
export function cardType(card) {
  return card.split(':')[1];
}
export function cardDef(card) {
  const [kind, type] = card.split(':');
  return { cargo: CARGO, part: PARTS, ally: ALLIES }[kind]?.[type];
}

// ---- ゲームを作る ----
// players: [{ name, cpu }]
export function createGame(players, seed) {
  const rng = makeRng(seed);
  const state = {
    seed: seed ?? null,
    rngState: Math.floor(rng() * 2 ** 32),
    version: 0,
    round: 0,
    phase: 'setup',
    startPlayer: 0,
    players: players.map((p, i) => ({
      id: i,
      name: String(p.name || `プレイヤー${i + 1}`).slice(0, 12),
      cpu: !!p.cpu,
      color: PLAYER_COLORS[i % PLAYER_COLORS.length],
      cash: START_CASH,
      vp: 0,
      cargo: [], // 貨物カード(card id の配列)
      parts: [],
      allies: [],
      opsHand: [],
      heatPenalty: 0,
      bought: 0,
      passed: false,
      load: null, // { cargo:[index], route }
      ops: null, // [{ card, route }]
      laundered: null,
      stats: { runs: 0, busts: 0, earned: 0, fines: 0 },
      history: [{ round: 0, cash: START_CASH, vp: 0 }],
    })),
    decks: {
      cargo: [],
      gear: [],
      cargoDiscard: [],
      gearDiscard: [],
    },
    market: { cargo: [], parts: [], allies: [] },
    turn: null, // 仕入れフェーズで買う番の人
    resolution: null,
    routeHistory: [],
    log: [],
    winner: null,
    final: null,
  };
  const r = rngFrom(state);
  state.decks.cargo = shuffle(buildDeck(CARGO, 'cargo'), r);
  state.decks.gear = shuffle([...buildDeck(PARTS, 'part'), ...buildDeck(ALLIES, 'ally')], r);
  startRound(state);
  return state;
}

// 状態の中に乱数の続きを持たせる(サーバーで JSON にしても続きから再開できる)
function rngFrom(state) {
  return () => {
    const f = makeRng(state.rngState);
    const v = f();
    state.rngState = Math.floor(f() * 2 ** 32) >>> 0;
    return v;
  };
}

function log(state, text, type = 'info') {
  state.log.push({ round: state.round, text, type });
  if (state.log.length > 200) state.log.splice(0, state.log.length - 200);
}

function draw(state, deckKey, discardKey) {
  const rng = rngFrom(state);
  if (!state.decks[deckKey].length) {
    state.decks[deckKey] = shuffle(state.decks[discardKey], rng);
    state.decks[discardKey] = [];
  }
  return state.decks[deckKey].pop() || null;
}

function personalOpsDeck() {
  const out = [];
  for (const [type, def] of Object.entries(OPS)) for (let i = 0; i < def.count; i++) out.push(type);
  return out;
}

function startRound(state) {
  state.round += 1;
  state.phase = 'market';
  state.resolution = null;
  const rng = rngFrom(state);
  // 先週の売れ残り貨物は流れて、新しい貨物が6枚並ぶ
  state.decks.cargoDiscard.push(...state.market.cargo.filter(Boolean));
  state.market.cargo = [];
  for (let i = 0; i < 6; i++) state.market.cargo.push(draw(state, 'cargo', 'cargoDiscard'));
  // 装備(パーツ・協力者)は空いた所だけ補充(パーツ3枠・協力者3枠)
  const fill = (row, kind) => {
    while (row.length < 3) {
      let card = null;
      for (let tries = 0; tries < 40; tries++) {
        const c = draw(state, 'gear', 'gearDiscard');
        if (!c) break;
        if (cardKind(c) === kind) { card = c; break; }
        state.decks.gearDiscard.push(c);
      }
      if (!card) break;
      row.push(card);
    }
  };
  state.market.parts = state.market.parts.filter(Boolean);
  state.market.allies = state.market.allies.filter(Boolean);
  fill(state.market.parts, 'part');
  fill(state.market.allies, 'ally');

  for (const p of state.players) {
    p.cash += ROUND_INCOME;
    p.bought = 0;
    p.passed = false;
    p.load = null;
    p.ops = null;
    p.laundered = null;
    p.opsHand = shuffle(personalOpsDeck(), rng).slice(0, OPS_HAND);
  }
  state.turn = state.startPlayer;
  log(state, `第${state.round}ラウンド開始。全員に上納金 ${ROUND_INCOME}万円。`, 'round');
  state.version++;
}

export function orderFrom(state, start = state.startPlayer) {
  const n = state.players.length;
  return Array.from({ length: n }, (_, i) => (start + i) % n);
}

export function capacityOf(p) {
  return BASE_CAPACITY + (p.parts.includes('part:trailer') ? 3 : 0);
}
export function launderCapOf(p) {
  return LAUNDER_CAP + (p.allies.includes('ally:launderer') ? 1000 : 0);
}
export function launderVp(p, amount) {
  const mult = p.allies.includes('ally:accountant') ? 1.5 : 1;
  return Math.floor((amount / VP_PER) * mult);
}
export function finalScore(p) {
  return p.vp + Math.floor(p.cash / LEFTOVER_PER);
}

// ---- 行動を適用する ----
// 戻り値: { ok: true } か { ok: false, error: '日本語の理由' }
export function applyAction(state, pid, action) {
  const p = state.players[pid];
  if (!p) return fail('プレイヤーが見つかりません。');
  if (!action || typeof action !== 'object') return fail('行動の形が正しくありません。');
  switch (state.phase) {
    case 'market':
      return marketAction(state, p, action);
    case 'load':
      return loadAction(state, p, action);
    case 'ops':
      return opsAction(state, p, action);
    case 'launder':
      return launderAction(state, p, action);
    default:
      return fail('いまは操作できません。');
  }
}

function fail(error) {
  return { ok: false, error };
}

function marketAction(state, p, action) {
  if (state.turn !== p.id) return fail('いまはあなたの番ではありません。');
  if (action.type === 'pass') {
    p.passed = true;
    log(state, `${p.name} は買い物を終えた。`);
  } else if (action.type === 'buy') {
    const row = state.market[action.row];
    if (!row || !Number.isInteger(action.index)) return fail('そのカードはありません。');
    const card = row[action.index];
    if (!card) return fail('そのカードはもう売り切れです。');
    const def = cardDef(card);
    if (p.cash < def.cost) return fail('お金が足りません。');
    const kind = cardKind(card);
    if (kind === 'part' && p.parts.length >= MAX_PARTS) return fail(`パーツは${MAX_PARTS}つまでです。`);
    if (kind === 'part' && p.parts.includes(card)) return fail('同じパーツは2つ付けられません。');
    if (kind === 'ally' && p.allies.length >= MAX_ALLIES) return fail(`協力者は${MAX_ALLIES}人までです。`);
    if (kind === 'ally' && p.allies.includes(card)) return fail('同じ協力者は2人雇えません。');
    if (kind === 'cargo' && p.cargo.length >= 8) return fail('貨物は8枚までしか持てません。');
    p.cash -= def.cost;
    row[action.index] = null;
    if (kind === 'cargo') p.cargo.push(card);
    if (kind === 'part') p.parts.push(card);
    if (kind === 'ally') p.allies.push(card);
    p.bought += 1;
    if (p.bought >= MAX_BUYS) p.passed = true;
    log(state, `${p.name} が「${def.name}」を ${def.cost}万円で購入。`, 'buy');
  } else {
    return fail('仕入れフェーズでは「買う」か「終える」を選んでください。');
  }
  advanceMarket(state);
  state.version++;
  return { ok: true };
}

function advanceMarket(state) {
  const order = orderFrom(state, (state.turn + 1) % state.players.length);
  const next = order.find((i) => !state.players[i].passed);
  if (next === undefined) {
    state.phase = 'load';
    state.turn = null;
    log(state, '仕入れ終了。積荷とルートを決めてください。', 'phase');
  } else {
    state.turn = next;
  }
}

function loadAction(state, p, action) {
  if (action.type !== 'load') return fail('積荷とルートを決めてください。');
  if (p.load) return fail('もう決定済みです。');
  const idx = Array.isArray(action.cargo) ? [...new Set(action.cargo)] : [];
  if (idx.some((i) => !Number.isInteger(i) || i < 0 || i >= p.cargo.length)) return fail('その貨物は持っていません。');
  if (idx.length > capacityOf(p)) return fail(`積めるのは${capacityOf(p)}枚までです。`);
  let route = action.route || null;
  if (idx.length === 0) route = null;
  else if (!ROUTE_BY_ID[route]) return fail('ルートを選んでください。');
  p.load = { cargo: idx.sort((a, b) => a - b), route };
  if (state.players.every((q) => q.load)) {
    state.phase = 'ops';
    const runs = state.players.filter((q) => q.load.route).map((q) => `${q.name}→${ROUTE_BY_ID[q.load.route].short}`);
    log(state, `一斉公開!${runs.join('、') || 'だれも走らない'}`, 'phase');
  }
  state.version++;
  return { ok: true };
}

function opsAction(state, p, action) {
  if (action.type !== 'ops') return fail('工作カードを仕掛けてください。');
  if (p.ops) return fail('もう決定済みです。');
  const list = Array.isArray(action.placements) ? action.placements : [];
  if (list.length > OPS_PLAY) return fail(`仕掛けられるのは${OPS_PLAY}枚までです。`);
  const used = new Set();
  const out = [];
  for (const pl of list) {
    if (!pl || !Number.isInteger(pl.hand) || pl.hand < 0 || pl.hand >= p.opsHand.length) return fail('そのカードは持っていません。');
    if (used.has(pl.hand)) return fail('同じカードは2回使えません。');
    if (!ROUTE_BY_ID[pl.route]) return fail('ルートを選んでください。');
    used.add(pl.hand);
    out.push({ card: p.opsHand[pl.hand], route: pl.route });
  }
  p.ops = out;
  if (state.players.every((q) => q.ops)) resolveRound(state);
  state.version++;
  return { ok: true };
}

function launderAction(state, p, action) {
  if (action.type !== 'launder') return fail('洗う金額を決めてください。');
  if (p.laundered !== null) return fail('もう決定済みです。');
  let amount = Math.floor(Number(action.amount) / VP_PER) * VP_PER;
  if (!Number.isFinite(amount) || amount < 0) amount = 0;
  amount = Math.min(amount, p.cash, launderCapOf(p));
  amount = Math.floor(amount / VP_PER) * VP_PER;
  const gained = launderVp(p, amount);
  p.cash -= amount;
  p.vp += gained;
  p.laundered = amount;
  if (amount > 0) log(state, `${p.name} は ${amount}万円を洗浄し、資産 ${gained} VP を得た。`, 'launder');
  if (state.players.every((q) => q.laundered !== null)) endRound(state);
  state.version++;
  return { ok: true };
}

function endRound(state) {
  for (const p of state.players) p.history.push({ round: state.round, cash: p.cash, vp: p.vp });
  if (state.round >= ROUNDS) {
    state.phase = 'end';
    state.final = state.players
      .map((p) => ({ id: p.id, name: p.name, vp: p.vp, cash: p.cash, leftover: Math.floor(p.cash / LEFTOVER_PER), total: finalScore(p) }))
      .sort((a, b) => b.total - a.total || b.cash - a.cash);
    state.winner = state.final[0].id;
    log(state, `ゲーム終了!この街の支配者は ${state.final[0].name}(${state.final[0].total} VP)。`, 'end');
    return;
  }
  state.startPlayer = (state.startPlayer + 1) % state.players.length;
  startRound(state);
}

// ---- 検問の計算 ----
// 荷物・工作・パーツ・協力者から、そのプレイヤーの判定の材料をまとめる
export function runSetup(p, cargoCards, routeId, opsOnRoute) {
  const route = ROUTE_BY_ID[routeId];
  const types = cargoCards.map(cardType);
  const heatBase = cargoCards.reduce((s, c) => s + cardDef(c).heat, 0);
  const profit = cargoCards.reduce((s, c) => s + cardDef(c).profit, 0);
  const notes = [];
  // 工作カード
  let ops = opsOnRoute.map((o) => ({ ...o, active: true, note: '' }));
  if (ops.some((o) => o.card === 'fake')) {
    for (const o of ops) if (o.card === 'tip') { o.active = false; o.note = 'フェイクニュースで無効'; }
  }
  if (p.parts.includes('part:emp')) {
    const target = ops.find((o) => o.active && o.card === 'crack') || ops.find((o) => o.active && o.card === 'tip' && o.owner !== p.id);
    if (target) { target.active = false; target.note = 'EMPで無効'; notes.push('EMPジャマーが工作を1枚無効化'); }
  }
  const opsMod = ops.reduce((s, o) => s + (o.active ? (o.card === 'tip' ? 3 : o.card === 'safe' ? -3 : 0) : 0), 0);
  const extraDice = ops.filter((o) => o.active && o.card === 'crack').length;
  return {
    route,
    limit: route.limit,
    heatBase,
    profit,
    penalty: p.heatPenalty,
    opsMod,
    ops,
    extraDice,
    dieSides: p.parts.includes('part:susp') ? 4 : 6,
    trailer: p.parts.includes('part:trailer'),
    art: types.includes('art'),
    chemCount: types.filter((t) => t === 'chem').length,
    notes,
  };
}

// 出目から最終警戒度を出す
export function finalHeat(setup, diceTotal) {
  const chem = setup.chemCount * (diceTotal % 2 === 0 ? 4 : -4);
  return { chem, final: setup.heatBase + setup.penalty + setup.opsMod + chem + diceTotal };
}

// 出目の合計がいくつになるかの確率(グラフと CPU の判断に使う)
export function diceDistribution(setup) {
  if (setup.art) return new Map([[5, 1]]);
  const s = setup.dieSides;
  let main = new Map();
  for (let a = 1; a <= s; a++) {
    if (setup.trailer) for (let b = 1; b <= s; b++) add(main, Math.max(a, b), 1 / (s * s));
    else add(main, a, 1 / s);
  }
  for (let k = 0; k < setup.extraDice; k++) {
    const next = new Map();
    for (const [v, pr] of main) for (let a = 1; a <= s; a++) add(next, v + a, pr / s);
    main = next;
  }
  return main;
}
function add(m, k, v) {
  m.set(k, (m.get(k) || 0) + v);
}

// 最終警戒度ごとの確率と、突破できる確率
export function heatDistribution(setup) {
  const out = new Map();
  for (const [d, pr] of diceDistribution(setup)) add(out, finalHeat(setup, d).final, pr);
  let pass = 0;
  for (const [h, pr] of out) if (h <= setup.limit) pass += pr;
  return { dist: [...out.entries()].sort((a, b) => a[0] - b[0]), pass };
}

// 自動で使う道具(メカニック・ニトロ)も考えた突破確率
export function passChance(p, setup) {
  const { dist } = heatDistribution(setup);
  let fail = 0;
  for (const [h, pr] of dist) if (h > setup.limit) fail += pr;
  if (p.allies.includes('ally:mechanic') && !setup.art) fail *= fail; // 1回振り直し
  if (p.parts.includes('part:nitro')) {
    const f1 = finalHeat(setup, 1).final;
    if (f1 <= setup.limit) fail = 0;
  }
  return 1 - fail;
}

function rollDice(state, setup) {
  const rng = rngFrom(state);
  const d = () => 1 + Math.floor(rng() * setup.dieSides);
  if (setup.art) return { dice: [5], total: 5, fixed: true };
  const dice = [];
  let main = d();
  if (setup.trailer) {
    const b = d();
    dice.push(main, b);
    main = Math.max(main, b);
  } else dice.push(main);
  let total = main;
  for (let k = 0; k < setup.extraDice; k++) {
    const x = d();
    dice.push(x);
    total += x;
  }
  return { dice, total, fixed: false };
}

function resolveRound(state) {
  state.phase = 'resolve';
  const allOps = [];
  for (const p of state.players) for (const o of p.ops) allOps.push({ ...o, owner: p.id });
  const results = [];
  const bustedByRoute = {};
  const order = orderFrom(state);
  const roundRoutes = {};

  for (const pid of order) {
    const p = state.players[pid];
    if (!p.load.route) {
      results.push({ pid, skipped: true });
      continue;
    }
    const cargoCards = p.load.cargo.map((i) => p.cargo[i]);
    const opsOnRoute = allOps.filter((o) => o.route === p.load.route);
    const setup = runSetup(p, cargoCards, p.load.route, opsOnRoute);
    roundRoutes[p.load.route] = (roundRoutes[p.load.route] || 0) + 1;
    const events = [...setup.notes];
    let roll = rollDice(state, setup);
    const rolls = [roll];
    let h = finalHeat(setup, roll.total);
    if (h.final > setup.limit && p.allies.includes('ally:mechanic') && !roll.fixed && p.cash >= 50) {
      p.cash -= 50;
      roll = rollDice(state, setup);
      rolls.push(roll);
      h = finalHeat(setup, roll.total);
      events.push('メカニックが50万円で振り直し');
    }
    let nitro = false;
    if (h.final > setup.limit && p.parts.includes('part:nitro')) {
      const h1 = finalHeat(setup, 1);
      if (h1.final <= setup.limit) {
        nitro = true;
        h = h1;
        p.parts = p.parts.filter((c) => c !== 'part:nitro');
        state.decks.gearDiscard.push('part:nitro');
        events.push('ニトロブースター点火!出目を1に');
      }
    }
    const success = h.final <= setup.limit;
    const res = {
      pid,
      route: p.load.route,
      cargo: cargoCards,
      ops: setup.ops,
      heatBase: setup.heatBase,
      penalty: setup.penalty,
      opsMod: setup.opsMod,
      chem: h.chem,
      dice: roll.dice,
      diceTotal: nitro ? 1 : roll.total,
      rolls: rolls.map((r) => r.dice),
      sides: setup.dieSides,
      trailer: setup.trailer,
      extraDice: setup.extraDice,
      fixed: roll.fixed,
      nitro,
      final: h.final,
      limit: setup.limit,
      success,
      profit: 0,
      fine: 0,
      events,
    };
    p.stats.runs += 1;
    if (success) {
      let profit = setup.profit;
      if (p.allies.includes('ally:daredevil') && h.final === setup.limit) {
        profit *= 3;
        events.push('特攻野郎!上限ぴったりで利益3倍');
      }
      p.cash += profit;
      p.stats.earned += profit;
      res.profit = profit;
      // 運んだ貨物は売れてなくなる
      p.cargo = p.cargo.filter((_, i) => !p.load.cargo.includes(i));
      state.decks.cargoDiscard.push(...cargoCards);
      log(state, `${p.name} は${setup.route.name}を突破!(警戒度 ${h.final}/${setup.limit})+${profit}万円`, 'success');
    } else {
      p.stats.busts += 1;
      let fine = setup.heatBase * 10 * setup.route.fineMul;
      if (p.allies.includes('ally:lawyer')) {
        fine = 0;
        events.push('敏腕弁護士が罰金を帳消し');
      }
      const kept = cargoCards.filter((c) => cardType(c) === 'beast');
      if (kept.length) events.push('珍獣は逃げ出して手元に戻ってきた');
      const lost = cargoCards.filter((c) => cardType(c) !== 'beast');
      p.cargo = p.cargo.filter((_, i) => !p.load.cargo.includes(i)).concat(kept);
      state.decks.cargoDiscard.push(...lost);
      let paid = fine;
      if (p.cash < fine) {
        paid = p.cash;
        events.push('罰金が払えず破産状態!次のラウンドは警戒度+2');
        res.bankrupt = true;
      }
      p.cash -= paid;
      p.stats.fines += paid;
      res.fine = paid;
      res.lostProfit = lost.reduce((s, c) => s + cardDef(c).profit, 0);
      bustedByRoute[p.load.route] = (bustedByRoute[p.load.route] || []).concat(res);
      log(state, `${p.name} は${setup.route.name}で摘発!(警戒度 ${h.final}/${setup.limit})罰金 ${paid}万円`, 'bust');
    }
    results.push(res);
  }

  // おとり作戦:摘発された貨物の利益の半分を、仕掛けた人で山分け
  for (const [routeId, busts] of Object.entries(bustedByRoute)) {
    const decoys = allOps.filter((o) => o.route === routeId && o.card === 'decoy');
    if (!decoys.length) continue;
    for (const b of busts) {
      const takers = decoys.filter((o) => o.owner !== b.pid);
      if (!takers.length) continue;
      const share = Math.floor(b.lostProfit / 2 / takers.length / 10) * 10;
      for (const o of takers) {
        state.players[o.owner].cash += share;
        state.players[o.owner].stats.earned += share;
        b.events.push(`${state.players[o.owner].name} のおとり作戦が ${share}万円を横取り`);
        log(state, `${state.players[o.owner].name} のおとり作戦が成功!+${share}万円`, 'decoy');
      }
    }
  }
  // ハイエナ
  const bustCount = results.filter((r) => !r.skipped && !r.success);
  for (const p of state.players) {
    if (!p.allies.includes('ally:hyena')) continue;
    const others = bustCount.filter((r) => r.pid !== p.id).length;
    if (others) {
      p.cash += 100 * others;
      log(state, `${p.name} のハイエナが流出物資で +${100 * others}万円`, 'decoy');
      for (const r of bustCount) if (r.pid !== p.id) r.events.push(`${p.name} のハイエナが+100万円`);
    }
  }
  // 破産の目印は次のラウンドに持ち越す
  for (const p of state.players) {
    const r = results.find((x) => x.pid === p.id);
    p.heatPenalty = r && r.bankrupt ? BANKRUPT_HEAT : 0;
  }
  state.routeHistory.push({ round: state.round, routes: roundRoutes });
  state.resolution = { round: state.round, results, ops: allOps };
  state.phase = 'launder';
  log(state, '検問終了。稼いだ現金を洗浄しましょう。', 'phase');
}

// ---- 見せてよい情報だけにする(オンラインで、相手の手の内を見せない) ----
export function viewFor(state, pid) {
  const v = JSON.parse(JSON.stringify(state));
  delete v.decks;
  delete v.rngState;
  delete v.seed;
  v.you = pid;
  v.deckCounts = { cargo: state.decks.cargo.length, gear: state.decks.gear.length };
  for (const p of v.players) {
    const mine = p.id === pid;
    if (!mine) {
      p.opsHand = p.opsHand.map(() => 'hidden');
      if (state.phase === 'load') p.load = p.load ? { ready: true } : null;
      if (state.phase === 'ops') p.ops = p.ops ? [{ ready: true }] : null;
      if (state.phase === 'launder') p.laundered = p.laundered === null ? null : p.laundered;
    }
  }
  return v;
}

// ---- CPU の考え方 ----
// CPU は公開されている情報だけを使って決めます(ずるはしない)。
export function cpuAction(state, pid, level = 'normal') {
  const p = state.players[pid];
  const rng = Math.random;
  if (state.phase === 'market') {
    if (state.turn !== pid) return null;
    return cpuMarket(state, p, rng);
  }
  if (state.phase === 'load' && !p.load) return cpuLoad(state, p, level);
  if (state.phase === 'ops' && !p.ops) return cpuOps(state, p, rng);
  if (state.phase === 'launder' && p.laundered === null) {
    const reserve = state.round >= ROUNDS ? 0 : 700;
    const amount = Math.max(0, Math.min(p.cash - reserve, launderCapOf(p)));
    return { type: 'launder', amount };
  }
  return null;
}

function cpuMarket(state, p, rng) {
  const options = [];
  const roundsLeft = ROUNDS - state.round + 1;
  for (const row of ['cargo', 'parts', 'allies']) {
    state.market[row].forEach((card, index) => {
      if (!card) return;
      const def = cardDef(card);
      if (def.cost > p.cash - 100) return;
      const kind = cardKind(card);
      const type = cardType(card);
      let score = 0;
      if (kind === 'cargo') {
        if (p.cargo.length >= capacityOf(p) + 1) return;
        score = (def.profit - def.cost) / (def.heat + 1) / 60;
        if (type === 'chem') score *= 0.7;
      } else if (kind === 'part') {
        if (p.parts.length >= MAX_PARTS || p.parts.includes(card)) return;
        score = { nitro: 3, trailer: 2.2, susp: 3.2, emp: 2.5 }[type] * (roundsLeft / 5);
      } else {
        if (p.allies.length >= MAX_ALLIES || p.allies.includes(card)) return;
        score = { mechanic: 3, daredevil: 2, hyena: 2.4, lawyer: 2.6, launderer: 3.4, accountant: 3.2 }[type] * (roundsLeft / 5);
        if (state.round >= ROUNDS) score = 0;
      }
      score += rng() * 0.8;
      options.push({ row, index, score });
    });
  }
  options.sort((a, b) => b.score - a.score);
  const best = options[0];
  if (!best || best.score < 1.6) return { type: 'pass' };
  return { type: 'buy', row: best.row, index: best.index };
}

// 積荷の組み合わせとルートを全部試して、期待値が一番大きいものを選ぶ
function cpuLoad(state, p, level) {
  const n = p.cargo.length;
  const cap = capacityOf(p);
  let best = { ev: 0, cargo: [], route: null };
  const caution = level === 'easy' ? 0.6 : 1.0;
  for (let mask = 1; mask < 1 << n; mask++) {
    const idx = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) idx.push(i);
    if (idx.length > cap) continue;
    const cards = idx.map((i) => p.cargo[i]);
    for (const route of ROUTES) {
      // ライバルのタレコミを少し警戒して +1.5 を見込む
      const setup = runSetup(p, cards, route.id, []);
      setup.opsMod += 1.5 * caution;
      const pass = passChance(p, setup);
      const profit = setup.profit;
      const lawyer = p.allies.includes('ally:lawyer');
      const lost = cards.filter((c) => cardType(c) !== 'beast').reduce((s, c) => s + cardDef(c).profit * 0.35, 0);
      const fine = lawyer ? 0 : setup.heatBase * 10 * route.fineMul;
      const ev = pass * profit - (1 - pass) * (fine + lost);
      if (ev > best.ev) best = { ev, cargo: idx, route: route.id };
    }
  }
  return { type: 'load', cargo: best.cargo, route: best.route };
}

function cpuOps(state, p, rng) {
  const placements = [];
  const myRoute = p.load?.route;
  const rivals = state.players.filter((q) => q.id !== p.id && q.load && q.load.route);
  // ライバルのうち、いちばん危なっかしい(利益が大きく上限に近い)ルートを狙う
  const targets = rivals
    .map((q) => {
      const setup = runSetup(q, q.load.cargo.map((i) => q.cargo[i]), q.load.route, []);
      return { route: q.load.route, profit: setup.profit, margin: setup.limit - setup.heatBase };
    })
    .filter((t) => t.route !== myRoute)
    .sort((a, b) => b.profit / Math.max(1, b.margin) - a.profit / Math.max(1, a.margin));
  p.opsHand.forEach((card, hand) => {
    if (placements.length >= OPS_PLAY) return;
    if (card === 'safe' && myRoute) placements.push({ hand, route: myRoute });
    else if (card === 'fake' && myRoute && rng() < 0.7) placements.push({ hand, route: myRoute });
    else if ((card === 'tip' || card === 'crack' || card === 'decoy') && targets.length) {
      const t = targets[Math.floor(rng() * Math.min(2, targets.length))];
      placements.push({ hand, route: t.route });
    }
  });
  return { type: 'ops', placements };
}
