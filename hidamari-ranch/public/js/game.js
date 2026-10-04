// ひだまり牧場 — ゲームのルール(計算だけ。画面のことは書かない)
// state(セーブデータ)を受け取って書きかえる関数の集まりです。

import {
  WEEKS_PER_YEAR, STATS, PLANS, PEOPLE, JOCKEYS, HEART_EVENTS, RENTAL_STUDS, HORSE_NAMES, NAME_HEAD, NAME_TAIL,
  NPC_HEAD, NPC_TAIL, RIVAL_NAMES, STAKES, CLASSES, GRADE_LEVEL, GRADE_LEVEL_2YO, GRADE_LEVEL_3YO, FACILITIES,
  RANDOM_EVENTS, GOALS, COAT_KEYS, PERSONALITIES, STYLE_LABEL, MOOD_LABEL, TALK, CHOICE_EVENTS, STAT_LABEL,
} from './data.js?v=5';

export const SAVE_VERSION = 1;
export const BUILD = 5; // 版の番号(main.js の BUILD と同じにする)

// ---------- 小さな道具 ----------
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const r1 = (v) => Math.round(v * 10) / 10;
// 同じ数からいつも同じ乱数(週ごとのレース表を固定するため)
function hashRand(seed) { let x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); }

// ---------- 暦 ----------
export function calendar(year, week) {
  const month = Math.floor((week - 1) / 4) + 1;
  const wk = ((week - 1) % 4) + 1;
  const season = month >= 3 && month <= 5 ? 'spring' : month >= 6 && month <= 8 ? 'summer' : month >= 9 && month <= 11 ? 'autumn' : 'winter';
  const seasonLabel = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' }[season];
  return { year, week, month, wk, season, seasonLabel, label: `${year}年目 ${month}月 第${wk}週` };
}
export const nowCal = (s) => calendar(s.year, s.week);

// ---------- 新しいゲーム ----------
const newId = (s) => `h${++s.seq}`;

export function newGame({ ranchName = 'ひだまり牧場', ownerName = 'オーナー' } = {}) {
  const s = {
    version: SAVE_VERSION, seq: 0, ranchName, ownerName,
    year: 1, week: 13, money: 3000, carrots: 10, careLeft: 3,
    horses: [], retired: [], trophies: [], log: [], album: [],
    people: {}, facilities: { stable: 1, track: 1, slope: 0, pool: 0, clinic: 0, hill: 0, windmill: 0 },
    goals: {}, flags: {}, market: [], history: [], yearStats: {},
    stats: { wins: 0, g1: 0, races: 0, earnings: 0 },
    pending: [], // まだ見せていないお知らせ(会話イベント・名付けなど)
  };
  for (const id of Object.keys(PEOPLE)) s.people[id] = { bond: id === 'haru' ? 10 : 0, talked: false, gifted: false, seen: [] };
  // はじめの馬たち
  // コハルビヨリは3歳。もうデビューしていて、すぐ未勝利戦に出られる
  const koharu = makeHorse(s, { name: 'コハルビヨリ', sex: '牝', birthYear: -2, coat: 'kurige', growth: 'normal', dist: 1700, surface: 'turf', style: 'senko', personality: 'あまえんぼう', capBase: 70, blaze: true, statRatio: 0.69, bond: 25 });
  koharu.record = { starts: 1, wins: 0, places: 0, earnings: 0, big: [] };
  koharu.memories.push('0年目 デビュー戦 4着');
  s.horses.push(koharu);
  s.horses.push(makeHorse(s, { name: 'ドングリ', sex: '牡', birthYear: -1, coat: 'kage', growth: 'early', dist: 1400, surface: 'dirt', style: 'nige', personality: 'やんちゃ', capBase: 66 }));
  s.horses.push(makeHorse(s, { name: 'マツボックリ', sex: '牡', birthYear: 0, coat: 'ashige', growth: 'late', dist: 2400, surface: 'turf', style: 'sashi', personality: 'のんびり', capBase: 69 }));
  const mare = makeHorse(s, { name: 'ハナミチ', sex: '牝', birthYear: -6, coat: 'tochikurige', growth: 'normal', dist: 2000, surface: 'turf', style: 'senko', personality: 'まじめ', capBase: 70, role: 'brood' });
  mare.pregnant = { studName: 'ノハラノカゼ', stud: RENTAL_STUDS[0], dueYear: 1, dueWeek: 15 };
  mare.record = { starts: 18, wins: 4, places: 6, earnings: 8200, big: ['うみかぜ記念'] };
  s.horses.push(mare);
  for (const h of s.horses) { h.plan = h.role === 'race' ? 'mix' : 'pasture'; h.auto = h.role !== 'brood'; }
  addLog(s, `${ranchName}の物語がはじまった。`, 'big');
  album(s, `${ownerName}さんが${ranchName}をうけついだ。`);
  return s;
}

export function makeHorse(s, o) {
  const capBase = o.capBase ?? 62;
  const caps = o.caps ? { ...o.caps } : {};
  for (const k of STATS) if (caps[k] == null) caps[k] = clamp(Math.round(capBase + gauss() * 6), 35, 100);
  // 適性に合わせて少しクセをつける
  if (!o.caps) {
    if (o.dist <= 1400) { caps.spd += 4; caps.sta -= 5; }
    if (o.dist >= 2400) { caps.sta += 5; caps.spd -= 2; }
    if (o.surface === 'dirt') caps.pow += 4;
  }
  const age = (s.year ?? 1) - o.birthYear;
  const stats = {};
  const ratio = o.statRatio ?? (age <= 0 ? 0.15 : age === 1 ? 0.25 : age === 2 ? 0.4 : 0.75);
  for (const k of STATS) stats[k] = r1(caps[k] * ratio * rand(0.9, 1.1));
  return {
    id: o.id || newId(s), name: o.name, sex: o.sex, birthYear: o.birthYear,
    coat: o.coat || pick(COAT_KEYS), blaze: o.blaze ?? Math.random() < 0.4, socks: o.socks ?? (Math.random() < 0.35 ? randi(1, 4) : 0),
    role: o.role || (age >= 2 ? 'race' : 'foal'),
    caps, stats, growth: o.growth || pick(['early', 'normal', 'normal', 'late']),
    dist: o.dist || pick([1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600]),
    surface: o.surface || (Math.random() < 0.72 ? 'turf' : 'dirt'),
    style: o.style || pick(['nige', 'senko', 'senko', 'sashi', 'sashi', 'oikomi']),
    personality: o.personality || pick(Object.keys(PERSONALITIES)),
    mood: 2, fatigue: 0, injury: 0, bond: o.bond ?? 10, jbond: {}, jockey: o.jockey || null,
    plan: 'pasture', entry: null, caredWeek: 0,
    record: o.record || { starts: 0, wins: 0, places: 0, earnings: 0, big: [] },
    sire: o.sire || pick(['ノハラノカゼ', 'ハヤテマル', 'ツチノコキング', 'ナガレボシ']),
    dam: o.dam || pick(HORSE_NAMES),
    memories: [], pregnant: null,
  };
}

// ---------- 調べる関数 ----------
export const horseAge = (s, h) => s.year - h.birthYear;
export const findHorse = (s, id) => s.horses.find((h) => h.id === id);
export const capacity = (s) => 3 + s.facilities.stable * 3;
export const stallsUsed = (s) => s.horses.length;
export const bondOf = (s, pid) => s.people[pid]?.bond ?? 0;
export const weekKey = (s) => s.year * 100 + s.week;
export const caredThisWeek = (s, h) => h.caredWeek === weekKey(s);

export function rank(v) {
  if (v >= 90) return 'SS'; if (v >= 80) return 'S'; if (v >= 70) return 'A'; if (v >= 60) return 'B';
  if (v >= 50) return 'C'; if (v >= 40) return 'D'; if (v >= 30) return 'E'; if (v >= 20) return 'F'; return 'G';
}
export function overall(h) { return r1(STATS.reduce((a, k) => a + h.stats[k], 0) / STATS.length); }
export function potential(h) { return r1(STATS.reduce((a, k) => a + h.caps[k], 0) / STATS.length); }
export function horseClass(h) {
  const w = h.record.wins;
  if (h.record.starts === 0) return 'debut';
  if (w === 0) return 'maiden'; if (w === 1) return 'c1'; if (w === 2) return 'c2'; return 'op';
}
export function roleLabel(s, h) {
  const age = horseAge(s, h);
  if (h.role === 'foal') return age === 0 ? '当歳(子馬)' : '1歳(育成中)';
  if (h.role === 'brood') return h.pregnant ? '繁殖牝馬(おなかに子)' : '繁殖牝馬';
  if (h.role === 'stud') return '種牡馬';
  return `競走馬・${CLASSES[horseClass(h)]?.label.replace('戦', '') || ''}`;
}
export function distApt(h, d) {
  const diff = Math.abs(d - h.dist);
  const f = 1 - clamp((diff - 300) / 1500, 0, 1) * 0.15;
  return f;
}
export function aptLetter(f) { return f >= 0.99 ? 'A' : f >= 0.95 ? 'B' : f >= 0.9 ? 'C' : 'D'; }
export function surfApt(h, surf) { return h.surface === surf ? 1 : 0.9; }

// 成長のしかた(年齢と早熟・晩成)
function growthMult(h, age) {
  const t = { early: [0.6, 1.0, 1.3, 1.1, 0.8, 0.5, 0.35], normal: [0.5, 0.8, 1.0, 1.2, 1.0, 0.7, 0.45], late: [0.4, 0.7, 0.75, 1.0, 1.2, 1.05, 0.7] }[h.growth];
  return t[clamp(age, 0, 6)] ?? 0.3;
}
export function peakLabel(s, h) {
  const g = growthMult(h, horseAge(s, h));
  return g >= 1.15 ? 'いまが伸びざかり!' : g >= 0.95 ? 'よく伸びる時期' : g >= 0.7 ? 'すこしずつ伸びる' : 'ゆっくり';
}

// ---------- 関係者 ----------
export function jockeySkill(s, pid) {
  const j = PEOPLE[pid].jockey;
  const b = bondOf(s, pid);
  let sk = j.skill + (b >= 30 ? 0.004 : 0) + (b >= 60 ? 0.006 : 0);
  if (pid === 'kakeru') sk += Math.min(0.02, (s.flags.kakeruWins || 0) * 0.002); // 若手は勝つたびにうまくなる
  return sk;
}
export function jockeyAvailable(s, pid) {
  const u = PEOPLE[pid].unlock;
  return !u || s.goals[u];
}

function raiseBond(s, pid, amt, out) {
  const p = s.people[pid];
  if (!p) return;
  const before = p.bond;
  if (amt > 0 && before >= 50) amt *= 0.7; // 仲よくなるほど、ゆっくり深まる
  p.bond = clamp(p.bond + amt, 0, 100);
  for (const ev of HEART_EVENTS[pid] || []) {
    if (before < ev.at && p.bond >= ev.at && !p.seen.includes(ev.at)) {
      p.seen.push(ev.at);
      s.pending.push({ type: 'heart', pid, at: ev.at });
      if (ev.gift === 'mare') giftMare(s);
    }
  }
  if (p.bond >= 50) completeGoal(s, 'friend', out);
  if (Object.keys(PEOPLE).every((k) => (k === 'gou' && !jockeyAvailable(s, k)) ? false : s.people[k].bond >= 80)) completeGoal(s, 'allFriends', out);
}

export function talk(s, pid) {
  const p = s.people[pid];
  if (!p) return { ok: false, text: 'その人はいません。' };
  if (PEOPLE[pid].unlock && !jockeyAvailable(s, pid)) return { ok: false, text: 'まだ知り合いではありません。' };
  if (p.talked) return { ok: false, text: `${PEOPLE[pid].name}とは今週もうおはなししました。また来週!` };
  p.talked = true;
  const tier = p.bond >= 70 ? 2 : p.bond >= 30 ? 1 : 0;
  const line = pick(TALK[pid][tier]);
  const out = [];
  raiseBond(s, pid, randi(2, 4), out);
  return { ok: true, text: line, pid, goals: out };
}

export function gift(s, pid) {
  const p = s.people[pid];
  if (!p) return { ok: false, text: 'その人はいません。' };
  if (PEOPLE[pid].unlock && !jockeyAvailable(s, pid)) return { ok: false, text: 'まだ知り合いではありません。' };
  if (p.gifted) return { ok: false, text: '差し入れは1人に週1回までです。' };
  if (s.money < 3) return { ok: false, text: 'お金が足りません(差し入れは3万円)。' };
  p.gifted = true;
  s.money -= 3;
  const out = [];
  raiseBond(s, pid, randi(4, 6), out);
  const thanks = { haru: 'はるさん「おっ、まんじゅうか。ありがとよ」', midori: 'みどり「わ、新しいノート…! うれしいです」', takanashi: '小鳥遊先生「おや、紅茶ですか。いただきます」', kakeru: 'かける「うおお、焼肉弁当! ありがとうございますっ!」', shizuku: 'しずく「…クッキー。…ありがとうございます」', gou: 'ゴウ「おう、気がきくじゃねえか! ガハハ!」', chii: 'ちい「わあ、キャンディ! ありがとう!」', kurokawa: '黒川「…ふん。もらっておく」' };
  return { ok: true, text: thanks[pid], pid, goals: out };
}

// ---------- お世話 ----------
const CARE_TEXT = {
  brush: ['気持ちよさそうに目を細めている。', 'ブラシに体をぐいぐい押しつけてくる。', '毛ヅヤがぴかぴかになった!'],
  carrot: ['ポリポリ…あっというまに食べた!', 'もっと欲しそうに鼻を鳴らしている。', 'しっぽをぶんぶん振ってよろこんでいる。'],
  walk: ['いっしょに牧場をのんびり歩いた。', '道ばたのクローバーに寄り道した。', 'あなたの歩幅に合わせて歩いてくれた。'],
};
// ふれあい:1頭につき1週間に1回(手間ポイントはなし)。kind を省くと、その馬が好きなことをする
export function care(s, horseId, kind) {
  const h = findHorse(s, horseId);
  if (!h) return { ok: false, text: '馬が見つかりません。' };
  if (caredThisWeek(s, h)) return { ok: false, text: `${h.name}とは今週もうふれあいました。また来週!` };
  if (!kind) kind = h.personality === 'くいしんぼう' && s.carrots > 0 ? 'carrot' : h.personality === 'あまえんぼう' ? 'brush' : h.fatigue >= 40 ? 'walk' : pick(['brush', 'walk', s.carrots > 0 ? 'carrot' : 'brush']);
  if (kind === 'carrot' && s.carrots <= 0) kind = 'brush';
  h.caredWeek = weekKey(s);
  let bond = 0, mood = 0, fat = 0;
  if (kind === 'brush') { bond = h.personality === 'あまえんぼう' ? 7 : 4; mood = Math.random() < 0.5 ? 1 : 0; }
  if (kind === 'carrot') { s.carrots--; bond = 3; mood = h.personality === 'くいしんぼう' ? 2 : 1; }
  if (kind === 'walk') { bond = 3; fat = -8; mood = Math.random() < 0.3 ? 1 : 0; }
  if (h.personality === 'さみしがり') bond = Math.round(bond * 1.5);
  h.bond = clamp(h.bond + bond, 0, 100);
  h.mood = clamp(h.mood + mood, 0, 4);
  h.fatigue = clamp(h.fatigue + fat, 0, 100);
  let text = `${h.name}は${pick(CARE_TEXT[kind])}`;
  if (kind === 'carrot' && h.personality === 'くいしんぼう') text = `${h.name}は目をきらきらさせて、にんじんにかぶりついた!`;
  const eff = [];
  if (bond) eff.push(`絆 +${bond}`);
  if (mood) eff.push('調子アップ');
  if (fat) eff.push(`疲れ ${fat}`);
  return { ok: true, kind, text, effect: eff.join(' / '), goals: [] };
}
// みんなとまとめてふれあう
export function careAll(s) {
  const list = [];
  for (const h of s.horses) if (!caredThisWeek(s, h)) { const r = care(s, h.id); if (r.ok) list.push(r); }
  return list;
}

// ---------- えらべるできごと ----------
function pickChoiceEvent(s) {
  const racers = s.horses.filter((h) => h.role === 'race' && !h.injury);
  const foals = s.horses.filter((h) => h.role === 'foal');
  const pool = CHOICE_EVENTS.map((e, i) => ({ e, i })).filter(({ e }) => jockeyAvailable(s, e.pid)
    && (e.need === 'none' || (e.need === 'racer' && racers.length) || (e.need === 'foal' && foals.length) || (e.need === 'horse' && s.horses.length)));
  if (!pool.length) return null;
  const { e, i } = pick(pool);
  const h = e.need === 'racer' ? pick(racers) : e.need === 'foal' ? pick(foals) : e.need === 'horse' ? pick(s.horses) : null;
  return { type: 'choice', idx: i, horseId: h?.id || null };
}
export function choiceEventView(s, p) {
  const e = CHOICE_EVENTS[p.idx];
  const h = p.horseId ? findHorse(s, p.horseId) : null;
  const fill = (t) => t.replaceAll('{h}', h ? h.name : '馬たち');
  return { pid: e.pid, text: fill(e.text), choices: e.choices.map((c) => c.label), horse: h };
}
export function chooseEvent(s, p, choice) {
  const e = CHOICE_EVENTS[p.idx];
  const c = e.choices[choice] || e.choices[0];
  const h = p.horseId ? findHorse(s, p.horseId) : null;
  const out = [];
  const eff = c.eff, notes = [];
  if (h) {
    if (eff.hbond) { h.bond = clamp(h.bond + eff.hbond, 0, 100); notes.push(`${h.name}の絆 +${eff.hbond}`); }
    if (eff.mood) { h.mood = clamp(h.mood + eff.mood, 0, 4); notes.push('調子アップ'); }
    if (eff.fat) { h.fatigue = clamp(h.fatigue + eff.fat, 0, 100); notes.push(`疲れ ${eff.fat > 0 ? '+' : ''}${eff.fat}`); }
    if (eff.stat) {
      const k = pick(STATS);
      h.stats[k] = r1(Math.min(h.caps[k] + 2, h.stats[k] + eff.stat));
      notes.push(`${STAT_LABEL[k]} +${eff.stat}`);
    }
    if (eff.jbond) { const [j, v] = eff.jbond; h.jbond[j] = clamp((h.jbond[j] || 0) + v, 0, 100); notes.push(`${PEOPLE[j].name}との息 +${v}`); }
  }
  if (eff.allBond) { for (const x of s.horses) x.bond = clamp(x.bond + eff.allBond, 0, 100); notes.push(`みんなの絆 +${eff.allBond}`); }
  if (eff.money) { s.money += eff.money; notes.push(`${eff.money}万円`); }
  if (eff.carrots) { s.carrots = Math.max(0, s.carrots + eff.carrots); notes.push(`にんじん ${eff.carrots > 0 ? '+' : ''}${eff.carrots}`); }
  for (const pid of Object.keys(PEOPLE)) if (eff[pid]) { raiseBond(s, pid, eff[pid], out); notes.push(`${PEOPLE[pid].name}となかよし`); }
  s.pending = s.pending.filter((x) => x !== p);
  return { reply: c.reply.replaceAll('{h}', h ? h.name : '馬たち'), notes: notes.join(' / '), goals: out };
}

// ---------- 予定・レース登録 ----------
export function setPlan(s, horseId, plan) {
  const h = findHorse(s, horseId);
  if (!h) return { ok: false, text: '馬が見つかりません。' };
  if (h.role === 'race') {
    if (!PLANS[plan]) return { ok: false, text: 'その予定は選べません。' };
    if (PLANS[plan].needTrainer && bondOf(s, 'midori') < PLANS[plan].needTrainer) return { ok: false, text: 'みどり先生ともっと仲よくなると使えます。' };
  } else if (h.role === 'foal') {
    if (!['pasture', 'walk'].includes(plan)) return { ok: false, text: '子馬は放牧かならし運動です。' };
    if (plan === 'walk' && horseAge(s, h) < 1) return { ok: false, text: 'ならし運動は1歳からです。' };
  } else return { ok: false, text: 'この馬は予定を決めなくて大丈夫です。' };
  h.plan = plan;
  return { ok: true };
}

export function racesForWeek(year, week) {
  const list = [];
  for (const st of STAKES) {
    if (st.w === week) list.push({ id: `y${year}w${week}-${st.name}`, kind: 'stakes', ...st, year, week, label: st.name });
  }
  const dists = [1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600];
  const classes = [];
  if (week >= 21) classes.push(['debut', '2']);
  if (week <= 12) classes.push(['debut', '3']);
  if (week >= 25) classes.push(['maiden', '2']);
  if (week <= 36) classes.push(['maiden', '3']);
  classes.push(['c1', '2+'], ['c2', '3+'], ['op', '3+']);
  let n = 0;
  for (const [cls, age] of classes) {
    for (let v = 0; v < 2; v++) {
      const seed = year * 1000 + week * 20 + n++;
      const short = v === 0;
      const pool = short ? dists.slice(0, 4) : dists.slice(3);
      const dist = pool[Math.floor(hashRand(seed) * pool.length)];
      const surface = hashRand(seed + 0.5) < (short ? 0.55 : 0.8) ? 'turf' : 'dirt';
      const c = CLASSES[cls];
      if (list.some((x) => x.cls === cls && x.age === age && x.dist === dist && x.surface === surface)) continue; // 同じレースは1つだけ
      list.push({ id: `y${year}w${week}-${cls}${age}-${v}`, kind: 'class', cls, grade: '', name: c.label, label: `${c.label}(${age === '2' ? '2歳' : age === '3' ? '3歳' : age === '2+' ? '' : '3歳以上'})`.replace('()', ''), age, surface, dist, prize: c.prize, year, week });
    }
  }
  return list;
}
// 何週先のレースか(今週 = 0)
export const weeksAhead = (s, race) => (race.year - s.year) * WEEKS_PER_YEAR + race.week - s.week;
export const RESERVE_WEEKS = 8; // 何週先まで出走予約できるか
// 今週から n 週先までのレース(年をまたいでもよい)
export function upcomingRaces(s, n = RESERVE_WEEKS) {
  const list = [];
  for (let k = 0; k <= n; k++) {
    let y = s.year, w = s.week + k;
    while (w > WEEKS_PER_YEAR) { w -= WEEKS_PER_YEAR; y++; }
    for (const r of racesForWeek(y, w)) list.push({ ...r, ahead: k });
  }
  return list;
}
export const findRace = (s, raceId) => upcomingRaces(s).find((r) => r.id === raceId);

export function eligible(s, h, race) {
  const age = race.year - h.birthYear;
  const ahead = weeksAhead(s, race);
  if (h.role !== 'race') return { ok: false, why: '競走馬ではありません' };
  if (ahead < 0) return { ok: false, why: 'もう終わったレースです' };
  if (h.injury > ahead) return { ok: false, why: `ケガの治療中(あと${h.injury}週)` };
  const ageOk = race.age === '2' ? age === 2 : race.age === '3' ? age === 3 : race.age === '2+' ? age >= 2 : race.age === '3+' ? age >= 3 : race.age === '4+' ? age >= 4 : false;
  if (!ageOk) return { ok: false, why: `年齢の条件(${ageText(race.age)})に合いません` };
  if (age === 2 && race.week < 21) return { ok: false, why: '2歳馬のデビューは6月からです' };
  if (race.mare && h.sex !== '牝') return { ok: false, why: '牝馬限定のレースです' };
  if (race.kind === 'class') {
    const c = horseClass(h);
    if (race.cls === 'debut' && c !== 'debut') return { ok: false, why: '新馬戦はデビュー前の馬だけ' };
    if (race.cls === 'maiden' && c !== 'maiden') return { ok: false, why: c === 'debut' ? 'まずは新馬戦でデビューしよう' : 'もう勝ち上がっています' };
    if (['c1', 'c2', 'op'].includes(race.cls) && race.cls !== c) return { ok: false, why: `この馬のクラスは「${CLASSES[c].label}」です` };
  } else {
    if (race.needWin && h.record.wins < 1) return { ok: false, why: '1勝以上が必要です' };
    if (h.record.earnings < race.need) return { ok: false, why: `獲得賞金${race.need}万円以上が必要(いま${Math.round(h.record.earnings)}万円)` };
  }
  return { ok: true };
}
export function ageText(a) { return { '2': '2歳', '3': '3歳', '2+': '2歳以上', '3+': '3歳以上', '4+': '4歳以上' }[a]; }

export function enter(s, horseId, raceId, jockeyId) {
  const h = findHorse(s, horseId);
  const race = findRace(s, raceId);
  if (!h || !race) return { ok: false, text: 'レースが見つかりません。' };
  const e = eligible(s, h, race);
  if (!e.ok) return { ok: false, text: e.why };
  if (!JOCKEYS.includes(jockeyId) || !jockeyAvailable(s, jockeyId)) return { ok: false, text: 'その騎手には頼めません。' };
  const busy = s.horses.find((o) => o.id !== h.id && o.entry && o.entry.raceId === raceId && o.entry.jockey === jockeyId);
  if (busy) return { ok: false, text: `${PEOPLE[jockeyId].name}はこのレースで${busy.name}に乗ります。ほかの騎手を選んでください。` };
  h.entry = { raceId, jockey: jockeyId, year: race.year, week: race.week };
  h.jockey = jockeyId;
  const ahead = weeksAhead(s, race);
  const when = ahead === 0 ? '今週' : `${ahead}週後`;
  return { ok: true, text: `${h.name}を${when}の「${race.label}」に登録しました(騎手:${PEOPLE[jockeyId].name})。` };
}
export function cancelEntry(s, horseId) {
  const h = findHorse(s, horseId);
  if (h) h.entry = null;
  return { ok: true };
}

// ---------- レースの能力 ----------
function distWeights(d) {
  const t = clamp((d - 1200) / 2000, 0, 1);
  const w = { spd: 0.36 - 0.12 * t, sta: 0.08 + 0.27 * t, pow: 0.24 - 0.08 * t, gut: 0.16 + 0.02 * t, wit: 0.16 - 0.06 * t };
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  for (const k in w) w[k] /= sum;
  return w;
}
export function raceRating(s, h, race, jockeyId) {
  const w = distWeights(race.dist);
  let base = 0;
  for (const k of STATS) base += w[k] * h.stats[k];
  const moodF = [0.93, 0.97, 1, 1.03, 1.06][h.mood];
  const fatF = 1 - Math.max(0, h.fatigue - 30) / 400;
  let jf = 1;
  if (jockeyId) {
    jf = jockeySkill(s, jockeyId) * (PEOPLE[jockeyId].jockey.styles.includes(h.style) ? 1.01 : 1) * (1 + (h.jbond[jockeyId] || 0) * 0.0003);
    if (race.grade === 'G1' && bondOf(s, jockeyId) >= 90) jf *= 1.01;
  }
  const bondF = 1 + h.bond * 0.0003;
  return base * distApt(h, race.dist) * surfApt(h, race.surface) * moodF * fatF * jf * bondF;
}
// 出走する馬たちのだいたいの強さ
function fieldLevel(race, age) {
  if (race.kind === 'class') return CLASSES[race.cls].level;
  const tbl = race.age === '2' ? GRADE_LEVEL_2YO : race.age === '3' ? GRADE_LEVEL_3YO : GRADE_LEVEL;
  return tbl[race.grade];
}
export function winChanceHint(s, h, race, jockeyId) {
  const r = raceRating(s, h, race, jockeyId);
  const lv = fieldLevel(race);
  const d = r - lv;
  if (d >= 8) return { label: '◎ 勝ち負けできそう', cls: 'good' };
  if (d >= 3) return { label: '○ 上位をねらえる', cls: 'ok' };
  if (d >= -3) return { label: '△ がんばれば掲示板', cls: 'mid' };
  return { label: '× まだ力不足かも', cls: 'bad' };
}

// ---------- レースを走らせる ----------
// 同じ seed なら同じレースになる(スパートを押したとき、そこから先だけ変えて計算しなおすため)
function mulberry32(seed) {
  let t = seed >>> 0;
  return () => { t = (t + 0x6d2b79f5) >>> 0; let x = Math.imul(t ^ (t >>> 15), 1 | t); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
export const TACTICS = ['nige', 'senko', 'sashi', 'oikomi'];
// スパートが続く長さ(m)。スタミナが多いほど長くもつ
export const spurtLength = (h) => Math.round(150 + h.stats.sta * 4);
export const AUTO_SPURT = 200; // スパートを押さなかったときは、残り200mで自動でスパート

// entrants: [{h, jockey}] / opts: { seed, tactic: {horseId: 作戦}, spurt: {horseId: 残り何mでスパート} }
export function runRace(s, race, entrants, opts = {}) {
  const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
  const R = mulberry32(seed);
  const Rr = (a, b) => a + R() * (b - a);
  const Ri = (a, b) => Math.floor(Rr(a, b + 1));
  const Rp = (arr) => arr[Math.floor(R() * arr.length)];
  const Rg = () => { let u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const lv = fieldLevel(race);
  const used = new Set(s.horses.map((h) => h.name));
  const runners = [];
  for (const e of entrants) {
    const h = e.h;
    const tactic = opts.tactic?.[h.id] || h.style;
    runners.push({
      own: true, horseId: h.id, name: h.name, coat: h.coat, blaze: h.blaze, style: tactic,
      rating: raceRating(s, h, race, e.jockey) * (1 + Rg() * 0.015) * (tactic === h.style ? 1 : 0.985),
      sta: clamp(h.stats.sta / (race.dist / 40), 0.55, 1.2), gut: h.stats.gut, wit: h.stats.wit,
      jockey: PEOPLE[e.jockey].name, jockeyId: e.jockey,
      spurtAt: opts.spurt?.[h.id] ?? AUTO_SPURT, spurtLen: spurtLength(h),
    });
  }
  const fieldSize = clamp(race.grade === 'G1' ? 16 : race.kind === 'stakes' ? 14 : Ri(10, 14), entrants.length + 4, 18);
  if (race.kind === 'stakes') {
    const rn = RIVAL_NAMES[(s.year * 3 + race.week) % RIVAL_NAMES.length];
    used.add(rn);
    runners.push({ own: false, rival: true, name: rn, coat: 'aoge', blaze: false, style: Rp(['senko', 'sashi']), rating: lv + 3 + Rg() * 3, sta: Rr(0.95, 1.15), gut: lv, wit: lv, jockey: '黒川厩舎の騎手' });
  }
  while (runners.length < fieldSize) {
    let name = 'ノーネーム';
    for (let k = 0; k < 50; k++) { const n = Rp(NPC_HEAD) + Rp(NPC_TAIL); if (!used.has(n)) { used.add(n); name = n; break; } }
    runners.push({ own: false, name, coat: Rp(COAT_KEYS), blaze: R() < 0.3, style: Rp(['nige', 'senko', 'senko', 'sashi', 'sashi', 'oikomi']), rating: lv + Rg() * 4.5, sta: Rr(0.8, 1.12), gut: lv, wit: lv, jockey: '' });
  }
  for (let i = runners.length - 1; i > 0; i--) { const j = Ri(0, i); [runners[i], runners[j]] = [runners[j], runners[i]]; }
  runners.forEach((r, i) => { r.gate = i + 1; r.spurted = 0; });

  const D = race.dist, dt = 0.5;
  const pos = runners.map(() => 0), time = runners.map(() => null);
  const drift = runners.map(() => 0);
  const frames = [];
  let t = 0;
  while (time.some((x) => x == null) && t < 400) {
    t += dt;
    runners.forEach((r, i) => {
      const noise = (R() - 0.5) * 0.004; // 乱数の使い方は毎回同じ順番(結果がぶれないように)
      if (time[i] != null) { pos[i] += 17 * dt; return; }
      const p = pos[i] / D, remain = D - pos[i];
      let v = 16 + r.rating * 0.02;
      const st = r.style;
      if (p < 0.15) v *= { nige: 1.06, senko: 1.03, sashi: 0.99, oikomi: 0.96 }[st] + (r.wit - 50) * 0.0003;
      else if (remain > 600) v *= { nige: 1.005, senko: 1.0, sashi: 1.0, oikomi: 1.0 }[st];
      else {
        v *= { nige: 1.0, senko: 1.02, sashi: 1.045, oikomi: 1.06 }[st];
        v *= r.sta >= 1 ? 1 : 0.86 + 0.14 * r.sta;
        const near = pos.some((q, j) => j !== i && Math.abs(q - pos[i]) < 3);
        if (near) v *= 1 + r.gut * 0.00025;
      }
      // スパート(わたしたちの馬だけ):長さの分だけ速くなり、使い切るとバテる
      if (r.own && remain <= r.spurtAt) {
        v *= r.spurted < r.spurtLen ? 1.022 : 0.965;
        r.spurted += v * dt;
      }
      drift[i] = drift[i] * 0.9 + noise;
      v *= 1 + drift[i];
      const before = pos[i];
      pos[i] += v * dt;
      if (pos[i] >= D) time[i] = t - dt + ((D - before) / (pos[i] - before)) * dt;
    });
    frames.push(pos.map((q) => Math.round(Math.min(q, D + 40) * 10) / 10));
  }
  const finish = runners.map((r, i) => ({ i, time: time[i] })).sort((a, b) => a.time - b.time);
  const results = finish.map((f, k) => {
    const r = runners[f.i];
    const gap = k === 0 ? 0 : (f.time - finish[0].time) * 17 / 2.4;
    return { place: k + 1, gate: r.gate, name: r.name, own: r.own, rival: !!r.rival, horseId: r.horseId, jockey: r.jockey, time: f.time, margin: k === 0 ? '' : marginText((f.time - finish[k - 1].time) * 17 / 2.4), gap };
  });
  const commentary = makeCommentary(runners, frames, D, results);
  return {
    seed, race: { ...race }, frames, dt, results, commentary,
    runners: runners.map((r) => ({ name: r.name, coat: r.coat, blaze: r.blaze, own: r.own, rival: !!r.rival, gate: r.gate, style: r.style, horseId: r.horseId, jockey: r.jockey, spurtAt: r.spurtAt, spurtLen: r.spurtLen })),
  };
}
// 今週走るレース(出走登録している馬ごとにまとめる)
export function weekRaces(s) {
  const byRace = new Map();
  for (const h of s.horses) {
    if (!h.entry) continue;
    const race = findRace(s, h.entry.raceId);
    if (!race || race.ahead > 0 || !eligible(s, h, race).ok) continue;
    if (!byRace.has(race.id)) byRace.set(race.id, { race, list: [] });
    byRace.get(race.id).list.push({ h, jockey: h.entry.jockey });
  }
  return [...byRace.values()];
}
function marginText(len) {
  if (len < 0.08) return 'ハナ';
  if (len < 0.2) return 'アタマ';
  if (len < 0.4) return 'クビ';
  if (len < 0.75) return '1/2';
  if (len < 1.15) return '1';
  if (len < 1.4) return '1 1/4';
  if (len < 1.65) return '1 1/2';
  if (len < 2.2) return '2';
  if (len < 2.7) return '2 1/2';
  if (len < 4) return '3';
  if (len < 9.5) return String(Math.round(len));
  return '大差';
}
export function timeText(t) {
  const m = Math.floor(t / 60), sec = t - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
}
function makeCommentary(runners, frames, D, results) {
  const lines = [];
  const leaderAt = (fi) => { const f = frames[Math.min(fi, frames.length - 1)]; let b = 0; f.forEach((p, i) => { if (p > f[b]) b = i; }); return runners[b]; };
  const rankOf = (fi, idx) => { const f = frames[Math.min(fi, frames.length - 1)]; return f.filter((p) => p > f[idx]).length + 1; };
  const fiAt = (dist) => { const k = frames.findIndex((f) => Math.max(...f) >= dist); return k < 0 ? frames.length - 1 : k; };
  lines.push({ at: 0, text: 'ゲートが開いた! 各馬いっせいにスタート!' });
  const f1 = fiAt(D * 0.18);
  lines.push({ at: f1, text: `先頭に立ったのは ${leaderAt(f1).name}。` });
  runners.forEach((r, i) => { if (r.own) lines.push({ at: f1 + 2, text: `わたしたちの ${r.name} は ${rankOf(f1, i)}番手あたり。`, own: true }); });
  const f2 = fiAt(D * 0.55);
  lines.push({ at: f2, text: `レースは中盤。先頭は ${leaderAt(f2).name}、まだまだ一団!` });
  const f3 = fiAt(D - 600);
  lines.push({ at: f3, text: '最後の直線に入った! さあ、ここからだ!' });
  runners.forEach((r, i) => { if (r.own) lines.push({ at: f3 + 4, text: `${r.name}、いま ${rankOf(f3 + 4, i)}番手! ${r.style === 'sashi' || r.style === 'oikomi' ? '外から伸びてくる!' : 'がんばれ!'}`, own: true }); });
  runners.forEach((r, i) => {
    if (!r.own) return;
    const k = frames.findIndex((f) => D - f[i] <= r.spurtAt);
    if (k >= 0) lines.push({ at: k, text: `${r.name}、スパート! ${r.spurtAt > r.spurtLen + 80 ? 'ちょっと早いか!?' : 'ぐんぐん伸びる!'}`, own: true, spurt: true });
  });
  const f4 = fiAt(D - 150);
  lines.push({ at: f4, text: `${leaderAt(f4).name} が先頭! ゴールはもうすぐ!` });
  const w = results[0];
  lines.push({ at: fiAt(D), text: `${w.name}、1着でゴールイン!${w.own ? ' やったー!!' : ''}`, finish: true });
  return lines.sort((x, y) => x.at - y.at);
}

// レース結果を牧場に反映
function applyRace(s, res, out) {
  const race = res.race;
  const share = [1, 0.4, 0.25, 0.15, 0.1];
  for (const r of res.results) {
    if (r.rival) {
      const ownBest = res.results.find((x) => x.own);
      raiseBond(s, 'kurokawa', ownBest && ownBest.place < r.place ? 5 : 3, out.goals);
    }
    if (!r.own) continue;
    const h = findHorse(s, r.horseId);
    if (!h) continue;
    const prize = r.place <= 5 ? Math.round(race.prize * share[r.place - 1]) : 0;
    const jid = h.entry?.jockey || h.jockey;
    const fee = PEOPLE[jid].jockey.fee + Math.round(prize * 0.05);
    s.money += prize - fee;
    h.record.starts++;
    h.record.earnings += prize;
    s.stats.races++;
    s.stats.earnings += prize;
    yearStat(s).earnings += prize;
    h.fatigue = clamp(h.fatigue + randi(24, 32), 0, 100);
    h.jbond[jid] = clamp((h.jbond[jid] || 0) + 6 + (r.place === 1 ? 4 : 0), 0, 100);
    raiseBond(s, jid, r.place === 1 ? 6 : r.place <= 3 ? 3 : 1, out.goals);
    h.bond = clamp(h.bond + 2, 0, 100);
    if (r.place <= 3) h.record.places++;
    if (r.place === 1) {
      h.record.wins++;
      s.stats.wins++;
      yearStat(s).wins++;
      h.mood = clamp(h.mood + 1, 0, 4);
      if (jid === 'kakeru') s.flags.kakeruWins = (s.flags.kakeruWins || 0) + 1;
      completeGoal(s, 'firstWin', out.goals);
      if (race.kind === 'stakes') {
        h.record.big.push(race.name);
        s.trophies.push({ year: s.year, week: s.week, race: race.name, grade: race.grade, horse: h.name, jockey: PEOPLE[jid].name });
        h.memories.push(`${s.year}年目 ${race.name}(${race.grade})優勝`);
        album(s, `${h.name}が${race.name}(${race.grade})を勝った! 騎手は${PEOPLE[jid].name}。`);
        completeGoal(s, 'graded', out.goals);
        raiseBond(s, 'midori', 4, out.goals);
        raiseBond(s, 'haru', 3, out.goals);
        raiseBond(s, 'chii', 3, out.goals);
        if (race.grade === 'G1') {
          s.stats.g1++;
          yearStat(s).g1++;
          completeGoal(s, 'g1', out.goals);
          if (race.name === 'ひだまりダービー') completeGoal(s, 'derby', out.goals);
          if (race.name === 'ほしふるグランプリ') completeGoal(s, 'grandprix', out.goals);
          if (s.stats.g1 >= 5) completeGoal(s, 'g1x5', out.goals);
        }
      } else if (h.record.wins === 1) {
        h.memories.push(`${s.year}年目 ${s.week > 0 ? nowCal(s).month : ''}月 初勝利(${race.label})`);
        album(s, `${h.name}が初勝利! (${race.label} ${race.dist}m)`);
      }
    } else if (r.place >= 8 && h.personality === '気分屋') h.mood = clamp(h.mood - 1, 0, 4);
    out.lines.push(`${h.name}:${race.label} ${r.place}着${prize ? `(賞金 ${prize}万円)` : ''}`);
    // ケガ(まれに)
    if (Math.random() < injuryChance(s, h) * 0.6) injure(s, h, out);
  }
}

function injuryChance(s, h) {
  const base = Math.max(0, (h.fatigue - 55) / 100) * 0.22;
  const v = bondOf(s, 'takanashi');
  const vet = v >= 90 ? 0.4 : v >= 60 ? 0.6 : v >= 30 ? 0.8 : 1;
  const clinic = s.facilities.clinic ? 0.7 : 1;
  return base * vet * clinic;
}
function injure(s, h, out) {
  let w = randi(3, 8);
  if (s.facilities.clinic) w = Math.max(2, w - 2);
  if (bondOf(s, 'takanashi') >= 90) w = Math.max(1, w - 1);
  h.injury = w;
  h.plan = 'rest';
  h.entry = null;
  out.lines.push(`⚠ ${h.name}が脚を痛めてしまった。小鳥遊先生の見立てでは、${w}週ほど休めば治るそうだ。`);
  addLog(s, `${h.name}がケガ(${w}週休養)`, 'warn');
}

// ---------- 調教 ----------
function trainHorse(s, h, out) {
  const age = horseAge(s, h);
  const plan = PLANS[h.plan] || PLANS.rest;
  if (h.injury > 0) {
    h.injury--;
    h.fatigue = clamp(h.fatigue - 25, 0, 100);
    if (h.injury === 0) out.lines.push(`${h.name}のケガが治った! また走れるよ。`);
    return;
  }
  if (h.plan === 'rest' || h.plan === 'pasture') {
    let rec = -plan.fat;
    if (bondOf(s, 'haru') >= 60) rec += 8;
    if (h.plan === 'pasture' && s.facilities.hill) rec += 8;
    h.fatigue = clamp(h.fatigue - rec, 0, 100);
    const up = h.plan === 'pasture' ? (Math.random() < 0.75 ? 1 : 0) : (Math.random() < 0.5 ? 1 : 0);
    h.mood = clamp(h.mood + up, 0, 4);
    if (h.plan === 'pasture') h.bond = clamp(h.bond + 1, 0, 100);
    return;
  }
  // 調教
  let mult = growthMult(h, age) * (1 + (s.facilities.track - 1) * 0.08);
  const tb = bondOf(s, 'midori');
  mult *= 1 + (tb >= 60 ? 0.1 : tb >= 30 ? 0.05 : 0);
  mult *= [0.8, 0.9, 1, 1.1, 1.2][h.mood];
  if (h.fatigue > 60) mult *= 0.7;
  if (h.personality === 'やんちゃ') mult *= 1.05;
  if (h.personality === 'のんびり') mult *= 0.95;
  mult *= 1 + h.bond * 0.001;
  const gains = [];
  for (const [k, g] of Object.entries(plan.gain)) {
    let m = mult;
    if (s.facilities.slope && (k === 'pow' || k === 'gut')) m *= 1.15;
    if (s.facilities.pool && k === 'sta') m *= 1.15;
    if (h.personality === 'まじめ' && k === 'wit') m *= 1.2;
    const room = clamp((h.caps[k] - h.stats[k]) / 30, 0.06, 1);
    const add = g * m * room * rand(0.8, 1.2);
    const before = h.stats[k];
    h.stats[k] = r1(Math.min(h.caps[k] + 2, h.stats[k] + add));
    if (h.stats[k] - before >= 0.05) gains.push([k, r1(h.stats[k] - before)]);
  }
  let fat = plan.fat * (h.personality === 'のんびり' ? 0.85 : 1) * (s.facilities.pool ? 0.8 : 1);
  h.fatigue = clamp(h.fatigue + fat, 0, 100);
  if (h.fatigue > 70 && Math.random() < 0.5) h.mood = clamp(h.mood - 1, 0, 4);
  if (Math.random() < injuryChance(s, h)) injure(s, h, out);
  out.train.push({ id: h.id, name: h.name, plan: h.plan, gains });
}
function growFoal(s, h) {
  const age = horseAge(s, h);
  for (const k of STATS) {
    let add = 0.16 * growthMult(h, age) * rand(0.6, 1.4);
    if (h.plan === 'walk' && age >= 1) add += 0.35 * rand(0.5, 1.5);
    h.stats[k] = r1(Math.min(h.caps[k] * 0.55, h.stats[k] + add));
  }
  h.bond = clamp(h.bond + (h.plan === 'pasture' ? 1 : 0.5), 0, 100);
  h.fatigue = 0;
}

// ---------- 繁殖 ----------
export function breedingOpen(s) { return s.week >= 9 && s.week <= 20; }
export function studList(s) {
  const own = s.horses.filter((h) => h.role === 'stud').map((h) => ({ id: h.id, name: h.name, own: true, fee: 0, caps: h.caps, dist: h.dist, surface: h.surface, growth: h.growth, coat: h.coat, note: `うちの種牡馬(${h.record.wins}勝)` }));
  const rent = RENTAL_STUDS.filter((r) => !r.unlockYear || s.year >= r.unlockYear).map((r) => ({ ...r, fee: r.kurokawa && bondOf(s, 'kurokawa') >= 50 ? Math.round(r.fee / 2) : r.fee }));
  return [...own, ...rent];
}
export function breed(s, mareId, studId) {
  const m = findHorse(s, mareId);
  if (!m || m.role !== 'brood') return { ok: false, text: '繁殖牝馬を選んでください。' };
  if (!breedingOpen(s)) return { ok: false, text: '種付けは春(3〜5月)だけです。' };
  if (m.pregnant) return { ok: false, text: `${m.name}はもうおなかに子どもがいます。` };
  const expecting = s.horses.filter((x) => x.pregnant).length;
  if (stallsUsed(s) + expecting >= capacity(s)) return { ok: false, text: `子馬をむかえる馬房がありません(${stallsUsed(s)}/${capacity(s)}頭 + 出産予定${expecting}頭)。「工房」で厩舎を広げるか、引退させてあげよう。` };
  const st = studList(s).find((x) => x.id === studId);
  if (!st) return { ok: false, text: '種牡馬が見つかりません。' };
  if (s.money < st.fee) return { ok: false, text: `お金が足りません(種付け料 ${st.fee}万円)。` };
  s.money -= st.fee;
  const out = [];
  completeGoal(s, 'breed', out);
  if (Math.random() < 0.85) {
    m.pregnant = { studName: st.name, stud: { caps: st.caps, dist: st.dist, surface: st.surface, growth: st.growth, coat: st.coat }, dueYear: s.year + 1, dueWeek: randi(9, 15) };
    addLog(s, `${m.name}と${st.name}の種付けが成功! 来年の春に子馬が生まれる予定。`, 'good');
    return { ok: true, text: `種付け成功! ${m.name}のおなかに、${st.name}との子どもがやってきた。来年の春に生まれます。`, goals: out };
  }
  return { ok: true, text: `今回はうまくいかなかった…。春のあいだなら、また挑戦できます(種付け料はかかりました)。`, goals: out };
}
function birth(s, m, out) {
  const p = m.pregnant;
  const sc = p.stud.caps;
  const caps = {};
  for (const k of STATS) caps[k] = clamp(Math.round(((sc[k] + m.caps[k]) / 2) * rand(0.9, 1.13) + (Math.random() < 0.08 ? 7 : 0)), 38, 100);
  const sex = Math.random() < 0.5 ? '牡' : '牝';
  const dist = Math.round(((p.stud.dist + m.dist) / 2 + randi(-3, 3) * 100) / 200) * 200;
  const foal = makeHorse(s, {
    name: `${m.name}の${s.year}`, sex, birthYear: s.year, coat: Math.random() < 0.45 ? p.stud.coat : Math.random() < 0.8 ? m.coat : pick(COAT_KEYS),
    caps, dist: clamp(dist, 1200, 3000), surface: Math.random() < 0.6 ? p.stud.surface : m.surface, growth: Math.random() < 0.5 ? p.stud.growth : m.growth,
    sire: p.studName, dam: m.name, role: 'foal', bond: 20,
  });
  foal.needsName = true;
  foal.plan = 'pasture';
  foal.auto = true;
  m.pregnant = null;
  s.horses.push(foal);
  s.pending.push({ type: 'name', horseId: foal.id });
  out.lines.push(`🎉 ${m.name}が元気な${sex === '牡' ? '男の子' : '女の子'}を産んだ! (父:${p.studName})`);
  album(s, `${m.name}に${sex === '牡' ? '男の子' : '女の子'}が生まれた(父:${p.studName})。`);
  addLog(s, `${m.name}が子馬を出産!`, 'big');
}
export function nameHorse(s, horseId, name) {
  const h = findHorse(s, horseId);
  name = String(name || '').trim();
  if (!h) return { ok: false, text: '馬が見つかりません。' };
  if (!/^[ァ-ヶー・ぁ-ゖ]{2,9}$/.test(name)) return { ok: false, text: '名前は、ひらがなかカタカナで2〜9文字にしてください。' };
  if (s.horses.some((o) => o.id !== h.id && o.name === name) || s.retired.some((o) => o.name === name)) return { ok: false, text: '同じ名前の馬がもういます。' };
  h.name = name;
  h.needsName = false;
  s.pending = s.pending.filter((p) => !(p.type === 'name' && p.horseId === horseId));
  const out = [];
  completeGoal(s, 'foalName', out);
  album(s, `子馬に「${name}」と名前をつけた。`);
  return { ok: true, text: `今日からきみの名前は「${name}」!`, goals: out };
}
export function suggestNames(s, n = 4) {
  const used = new Set([...s.horses.map((h) => h.name), ...s.retired.map((h) => h.name)]);
  const res = new Set();
  let guard = 0;
  while (res.size < n && guard++ < 200) {
    const name = Math.random() < 0.5 ? pick(HORSE_NAMES) : pick(NAME_HEAD) + pick(NAME_TAIL);
    if (!used.has(name) && name.length <= 9) res.add(name);
  }
  return [...res];
}

// ---------- 引退 ----------
export function retireOptions(s, h) {
  const opts = [];
  if (h.role === 'race') {
    if (horseAge(s, h) < 3 && !h.injury) return [];
    if (h.sex === '牝') opts.push({ id: 'brood', label: '繁殖牝馬として牧場にのこる', desc: '春に種付けをして、子どもを産んでもらえます' });
    if (h.sex === '牡' && h.record.big.length) opts.push({ id: 'stud', label: '種牡馬として牧場にのこる', desc: '自分の牝馬に無料で種付け。毎年、種付け料の収入も入ります' });
  }
  if (s.facilities.hill) opts.push({ id: 'hill', label: 'ひだまりの丘でのんびり暮らす', desc: '牧場の丘で、ずっと幸せに暮らします(馬房を使いません)' });
  opts.push({ id: 'club', label: '乗馬クラブへ', desc: 'みんなに乗ってもらえる、やさしい第二の馬生。ときどき手紙が届きます' });
  return opts;
}
export function retire(s, horseId, dest) {
  const h = findHorse(s, horseId);
  if (!h) return { ok: false, text: '馬が見つかりません。' };
  const opt = retireOptions(s, h).find((o) => o.id === dest);
  if (!opt) return { ok: false, text: 'その引退先は選べません。' };
  const out = [];
  h.entry = null;
  if (dest === 'brood' || dest === 'stud') {
    h.role = dest;
    h.plan = 'pasture';
    album(s, `${h.name}が現役を引退し、${dest === 'brood' ? '繁殖牝馬' : '種牡馬'}になった。`);
    if (h.record.wins) completeGoal(s, 'retire', out);
    return { ok: true, text: `${h.name}、おつかれさま! これからは${dest === 'brood' ? '母' : '父'}として牧場をささえてね。`, goals: out };
  }
  s.horses = s.horses.filter((x) => x.id !== h.id);
  s.retired.push({ id: h.id, name: h.name, sex: h.sex, coat: h.coat, blaze: h.blaze, birthYear: h.birthYear, record: h.record, memories: h.memories, dest, year: s.year, sire: h.sire, dam: h.dam, bond: h.bond });
  album(s, `${h.name}が引退し、${dest === 'hill' ? 'ひだまりの丘' : '乗馬クラブ'}で暮らすことになった。`);
  if (h.record.wins) completeGoal(s, 'retire', out);
  return { ok: true, text: `${h.name}、いままでありがとう! ${dest === 'hill' ? '丘の上でいつでも会えるね。' : '新しいおうちでも元気でね。'}`, goals: out };
}

// ---------- 施設 ----------
export function facilityCost(s, key) {
  const f = FACILITIES[key];
  const lv = s.facilities[key];
  if (key === 'stable' || key === 'track') return lv >= f.max ? null : f.cost[lv];
  return lv >= f.max ? null : f.cost[lv];
}
export function build(s, key) {
  const f = FACILITIES[key];
  if (!f) return { ok: false, text: 'その施設はありません。' };
  const cost = facilityCost(s, key);
  if (cost == null) return { ok: false, text: 'これ以上大きくできません。' };
  if (s.money < cost) return { ok: false, text: `お金が足りません(${cost}万円 必要)。` };
  s.money -= cost;
  s.facilities[key]++;
  const out = [];
  completeGoal(s, 'facility', out);
  album(s, `${f.label}${s.facilities[key] > 1 ? `をレベル${s.facilities[key]}に` : 'を建てた'}。`);
  return { ok: true, text: `${f.label}${s.facilities[key] > 1 && f.max > 1 ? `がレベル${s.facilities[key]}になった!` : 'ができあがった!'}`, goals: out };
}

// ---------- 町(買いもの・セリ) ----------
export function buyCarrots(s) {
  if (s.money < 5) return { ok: false, text: 'お金が足りません。' };
  s.money -= 5;
  s.carrots += 10;
  return { ok: true, text: 'にんじんを10本買った(5万円)。' };
}
export function marketOpen(s) { return (s.week >= 25 && s.week <= 28) ? 'yearling' : (s.week >= 45 && s.week <= 48) ? 'mare' : null; }
function genMarket(s, kind) {
  const list = [];
  const n = kind === 'yearling' ? 4 : 3;
  for (let i = 0; i < n; i++) {
    const tier = Math.random();
    const capBase = tier < 0.45 ? randi(56, 62) : tier < 0.85 ? randi(62, 68) : randi(68, 76);
    const h = makeHorse(s, {
      id: `m${s.year}${kind[0]}${i}`, name: kind === 'yearling' ? '' : pick(HORSE_NAMES.filter((x) => !s.horses.some((h) => h.name === x))),
      sex: kind === 'mare' ? '牝' : pick(['牡', '牝']), birthYear: kind === 'yearling' ? s.year - 1 : s.year - randi(5, 8),
      capBase, role: kind === 'yearling' ? 'foal' : 'brood', dam: pick(HORSE_NAMES), sire: pick(RENTAL_STUDS.slice(0, 4)).name,
    });
    if (kind === 'yearling') h.name = `${h.dam}の${s.year - 1}`;
    if (kind === 'mare') { h.record = { starts: randi(10, 25), wins: randi(1, 5), places: randi(3, 8), earnings: randi(1500, 9000), big: [] }; }
    const pot = potential(h);
    const price = Math.round((Math.max(300, (pot - 50) * 160 + 400) * rand(0.85, 1.2)) / 10) * 10;
    list.push({ horse: h, price, sold: false, guessStars: clamp(Math.round((pot - 52) / 5 + gauss() * 0.9), 1, 5), trueStars: clamp(Math.round((pot - 52) / 5), 1, 5) });
  }
  s.market = list;
  s.marketKind = kind;
}
export function buyMarket(s, idx) {
  const kind = marketOpen(s);
  const item = s.market[idx];
  if (!kind || !item || item.sold) return { ok: false, text: 'いまは買えません。' };
  if (s.money < item.price) return { ok: false, text: `お金が足りません(${item.price}万円)。` };
  if (stallsUsed(s) >= capacity(s)) return { ok: false, text: '馬房がいっぱいです。「工房」で厩舎を広げるか、引退させてあげよう。' };
  s.money -= item.price;
  item.sold = true;
  const h = JSON.parse(JSON.stringify(item.horse));
  h.id = newId(s);
  h.plan = 'pasture';
  if (kind === 'yearling') { h.needsName = true; s.pending.push({ type: 'name', horseId: h.id }); }
  s.horses.push(h);
  album(s, `セリで${kind === 'yearling' ? '1歳馬' : '繁殖牝馬'}「${h.name}」をむかえた。`);
  return { ok: true, text: `${h.name}が牧場の仲間になった!${kind === 'yearling' ? ' 名前をつけてあげよう。' : ''}` };
}
export function marketView(s) {
  const v = bondOf(s, 'takanashi') >= 60, t = bondOf(s, 'midori') >= 60;
  return s.market.map((m) => ({ ...m, stars: v ? m.trueStars : m.guessStars, sure: v, showCaps: t }));
}

// ---------- 目標 ----------
export function completeGoal(s, id, out) {
  if (s.goals[id]) return;
  s.goals[id] = { year: s.year, week: s.week };
  const g = GOALS.find((x) => x.id === id);
  if (g) {
    addLog(s, `★ 目標達成:${g.text}`, 'big');
    if (out) out.push(g.text);
    if (id === 'firstWin') s.pending.push({ type: 'unlock', text: 'ベテラン騎手・大門ゴウから「おめえの馬に乗せてくれ」と連絡がきた! (騎手に大門ゴウが加わった)' });
  }
}
export function currentGoal(s) { return GOALS.find((g) => !s.goals[g.id]) || null; }

// ---------- 記録 ----------
export function addLog(s, text, type = 'info') {
  s.log.unshift({ y: s.year, w: s.week, text, type });
  if (s.log.length > 250) s.log.length = 250;
}
function album(s, text) { s.album.unshift({ y: s.year, w: s.week, text }); if (s.album.length > 400) s.album.length = 400; }
function yearStat(s) { return (s.yearStats[s.year] ||= { wins: 0, g1: 0, earnings: 0, races: 0 }); }

function giftMare(s) {
  const m = makeHorse(s, { name: 'クロガネノハナ', sex: '牝', birthYear: s.year - 6, coat: 'aoge', capBase: 76, role: 'brood', dam: 'クロガネビジン', sire: 'クロガネオウジャ' });
  m.record = { starts: 20, wins: 6, places: 10, earnings: 21000, big: ['あきあかね賞'] };
  s.horses.push(m);
  album(s, '黒川牧場から牝馬「クロガネノハナ」が贈られた。');
}

// ---------- 1週すすめる ----------
export function weekCosts(s) {
  let c = 14; // スタッフのお給料
  for (const h of s.horses) c += h.role === 'race' ? 10 : h.role === 'foal' ? 5 : 7;
  if (s.facilities.windmill) c -= 8;
  return c;
}

// 「おまかせ」:疲れと能力を見て、みどり先生がメニューを決める
export function autoPlan(s, h) {
  if (h.role === 'foal') { h.plan = horseAge(s, h) >= 1 ? 'walk' : 'pasture'; return; }
  if (h.role !== 'race' || h.injury) return;
  if (h.fatigue >= 58) { h.plan = h.mood <= 1 ? 'pasture' : 'rest'; return; }
  if (h.mood === 0) { h.plan = 'pasture'; return; }
  const w = distWeights(h.dist);
  let best = 'mix', bv = 0;
  for (const k of STATS) {
    const v = (h.caps[k] - h.stats[k]) * (0.5 + w[k] * 3);
    if (v > bv) { bv = v; best = k; }
  }
  if (bv < 4) best = 'mix';
  if (bondOf(s, 'midori') >= 90 && h.fatigue < 30 && bv >= 4) best = 'secret';
  h.plan = best;
}

export function advanceWeek(s, opts = {}) {
  const out = { lines: [], train: [], races: [], goals: [], events: [], yearEnd: null };
  for (const h of s.horses) if (h.auto) autoPlan(s, h);

  // 1) レース
  const byRace = new Map();
  for (const h of s.horses) {
    if (!h.entry) continue;
    const race = findRace(s, h.entry.raceId);
    if (race && race.ahead > 0) continue; // まだ先のレース(予約)
    const e = race ? eligible(s, h, race) : { ok: false, why: 'レースが見つかりません' };
    if (!e.ok) { out.lines.push(`${h.name}は出走できなくなったため、登録を取り消しました(${e.why})。`); h.entry = null; continue; }
    if (!byRace.has(race.id)) byRace.set(race.id, { race, list: [] });
    byRace.get(race.id).list.push({ h, jockey: h.entry.jockey });
  }
  for (const { race, list } of byRace.values()) {
    // 画面でレースを見た(スパートを押した)ときは、その結果を使う
    const res = opts.raceResults?.[race.id] || runRace(s, race, list);
    applyRace(s, res, out);
    out.races.push(res);
    for (const e of list) completeGoal(s, 'debut', out.goals);
  }

  const raced = new Set([...byRace.values()].flatMap((x) => x.list.map((e) => e.h.id)));

  // 2) 調教・成長
  let anyTrain = false;
  for (const h of s.horses) {
    if (raced.has(h.id)) { h.entry = null; continue; }
    if (h.role === 'race') { trainHorse(s, h, out); if (!['rest', 'pasture'].includes(h.plan)) anyTrain = true; }
    else if (h.role === 'foal') growFoal(s, h);
    else { h.fatigue = 0; h.mood = clamp(h.mood + (Math.random() < 0.3 ? 1 : 0), 0, 4); }
  }

  // 3) 調子のゆらぎ・さみしがり
  for (const h of s.horses) {
    const swing = h.personality === '気分屋' ? 0.35 : h.personality === 'やんちゃ' ? 0.25 : h.personality === 'まじめ' ? 0.08 : 0.15;
    if (Math.random() < swing) h.mood = clamp(h.mood + (Math.random() < 0.5 ? -1 : 1), 0, 4);
    if (h.personality === 'さみしがり' && h.caredWeek !== weekKey(s) && Math.random() < 0.25) h.mood = clamp(h.mood - 1, 0, 4);
    if (bondOf(s, 'haru') >= 90 && h.mood < 1) h.mood = 1;
  }

  // 4) お金
  const cost = weekCosts(s);
  s.money -= cost;

  // 5) 絆とつながりは、毎週すこしずつ自然に深まる
  for (const h of s.horses) h.bond = clamp(h.bond + 0.6, 0, 100);
  for (const pid of ['haru', 'midori', 'takanashi', 'chii']) raiseBond(s, pid, 0.4, out.goals);
  // えらべるできごと(ときどき)
  if (Math.random() < 0.45 && !s.pending.some((x) => x.type === 'choice')) { const ev = pickChoiceEvent(s); if (ev) s.pending.push(ev); }
  // ほのぼの出来事
  if (Math.random() < 0.25 && s.horses.length) {
    const ev = pick(RANDOM_EVENTS);
    const h = pick(s.horses);
    const text = ev.text.replace('{h}', h.name);
    if (ev.mood) h.mood = clamp(h.mood + ev.mood, 0, 4);
    if (ev.allMood) for (const x of s.horses) x.mood = clamp(x.mood + 1, 0, 4);
    if (ev.fat) h.fatigue = clamp(h.fatigue + ev.fat, 0, 100);
    if (ev.bond) h.bond = clamp(h.bond + ev.bond, 0, 100);
    if (ev.carrot) s.carrots += ev.carrot;
    for (const pid of ['chii', 'haru', 'midori', 'takanashi']) if (ev[pid]) raiseBond(s, pid, ev[pid], out.goals);
    out.events.push(text);
    addLog(s, text, 'event');
  }
  const cb = bondOf(s, 'chii');
  if (cb >= 30 && Math.random() < 0.25 && s.horses.length) {
    const h = pick(s.horses);
    h.mood = clamp(h.mood + 1, 0, 4);
    out.events.push(`ちいちゃんが遊びに来て、${h.name}とかけっこをした。(調子アップ)`);
  }
  if (cb >= 90) { s.carrots += 3; out.events.push('ちいちゃんがにんじんを3本届けてくれた。'); }

  // 6) 週をすすめる
  for (const p of Object.values(s.people)) { p.talked = false; p.gifted = false; }
  s.week++;
  if (s.week > WEEKS_PER_YEAR) {
    out.yearEnd = yearEnd(s);
    s.week = 1;
    s.year++;
    newYear(s, out);
  }
  if (s.week % 4 === 1) s.history.push({ y: s.year, w: s.week, money: Math.round(s.money), horses: s.horses.length });
  if (s.history.length > 600) s.history.shift();

  // 7) 出産・セリ・種牡馬の収入など(新しい週のはじめ)
  for (const m of [...s.horses]) {
    if (m.pregnant && m.pregnant.dueYear === s.year && s.week >= m.pregnant.dueWeek) birth(s, m, out);
  }
  if (s.week === 21 && s.horses.some((h) => h.role === 'race' && horseAge(s, h) === 2)) s.pending.push({ type: 'unlock', text: '🏁 6月になり、2歳馬のデビュー戦(新馬戦)が始まりました! 右下の「🏁 レース」ボタンから出走登録してみよう。' });
  if (s.week === 25) { genMarket(s, 'yearling'); out.lines.push('🔔 町で1歳馬のセリがはじまった(7月のあいだ)。'); }
  if (s.week === 45) { genMarket(s, 'mare'); out.lines.push('🔔 町で繁殖牝馬のセールがはじまった(12月のあいだ)。'); }
  if (s.week === 9 && s.horses.some((h) => h.role === 'brood')) out.lines.push('🌸 種付けの季節になった(3〜5月)。「繁殖場」で相手を選ぼう。');
  if (s.week === 13) {
    for (const st of s.horses.filter((h) => h.role === 'stud')) {
      const fame = st.record.big.length * 3 + st.record.wins;
      const books = clamp(Math.round(fame * rand(0.8, 1.3)), 2, 60);
      const fee = Math.round(30 + st.record.earnings / 300);
      const inc = books * fee;
      s.money += inc;
      out.lines.push(`🐴 種牡馬${st.name}に${books}頭の種付け申しこみ! 種付け料 ${inc}万円の収入。`);
    }
  }
  if (s.money < 0 && !s.flags.warnedDebt) { s.flags.warnedDebt = true; s.pending.push({ type: 'unlock', text: '牧場のお金がマイナスになりました。牧場組合が立てかえてくれていますが、レースで賞金をかせぐか、馬の数を見直しましょう。(お金がマイナスの間は、施設を建てたり馬を買ったりできません)' }); }
  if (s.money >= 0) s.flags.warnedDebt = false;

  for (const l of out.lines) addLog(s, l, 'info');
  return out;
}

function yearEnd(s) {
  const ys = s.yearStats[s.year] || { wins: 0, g1: 0, earnings: 0 };
  // 今年いちばん稼いだ馬
  let best = null;
  const tr = s.trophies.filter((t) => t.year === s.year);
  for (const h of s.horses) {
    const w = tr.filter((t) => t.horse === h.name).length;
    if (!best || w > best.w) best = { name: h.name, w };
  }
  const award = tr.filter((t) => t.grade === 'G1').length >= 2 && best ? best.name : null;
  if (award) album(s, `${s.year}年目の年度代表馬に${award}がえらばれた!`);
  return { year: s.year, ...ys, trophies: tr, award };
}
function newYear(s, out) {
  out.lines.push(`🎍 ${s.year}年目がはじまった。馬たちもひとつ年をとった。`);
  for (const h of [...s.horses]) {
    const age = horseAge(s, h);
    if (h.role === 'foal' && age >= 2) {
      h.role = 'race';
      h.plan = 'mix';
      h.auto = true;
      h.jockey = null;
      out.lines.push(`${h.name}が2歳になり、競走馬として調教をはじめた!`);
    }
    if (h.role === 'race') {
      const g = growthMult(h, age);
      if (g < 0.6) for (const k of STATS) h.stats[k] = r1(Math.max(5, h.stats[k] - rand(1, 3)));
      if (age >= 8) s.pending.push({ type: 'unlock', text: `${h.name}も${age}歳。そろそろ引退を考えてあげてもいいかもしれません(「厩舎」で引退させられます)。` });
    }
    if ((h.role === 'brood' && age >= 20) || (h.role === 'stud' && age >= 22)) {
      s.horses = s.horses.filter((x) => x.id !== h.id);
      s.retired.push({ id: h.id, name: h.name, sex: h.sex, coat: h.coat, blaze: h.blaze, birthYear: h.birthYear, record: h.record, memories: h.memories, dest: 'hill', year: s.year, sire: h.sire, dam: h.dam, bond: h.bond });
      out.lines.push(`${h.name}は年をとったので、丘の上でのんびり暮らすことになった。いままでありがとう。`);
    }
  }
  // 乗馬クラブからの手紙
  const club = s.retired.filter((r) => r.dest === 'club');
  if (club.length) {
    const r = pick(club);
    s.pending.push({ type: 'unlock', text: `📮 乗馬クラブから手紙が届いた。「${r.name}は子どもたちに大人気です。毎日たくさんなでてもらっていますよ」` });
  }
}

// ---------- セーブデータの読み込み(古い・こわれたデータに強く) ----------
export function validate(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.horses) || typeof s.year !== 'number') throw new Error('セーブデータの形がちがいます');
  s.pending ||= [];
  s.market ||= [];
  s.trophies ||= [];
  s.album ||= [];
  s.retired ||= [];
  s.yearStats ||= {};
  s.flags ||= {};
  for (const id of Object.keys(PEOPLE)) s.people[id] ||= { bond: 0, talked: false, gifted: false, seen: [] };
  for (const k of Object.keys(FACILITIES)) s.facilities[k] ??= 0;
  return s;
}

export { STYLE_LABEL, MOOD_LABEL };
