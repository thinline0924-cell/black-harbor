// BLACK HARBOR(ボードゲーム)のオンライン対戦用サーバー
// 部屋(ルーム)を作って、合言葉のような「部屋コード」で友達が入ります。
// ゲームの計算は public/js/engine.js(画面と同じファイル)をサーバーでも使います。
// 画面への通知は Server-Sent Events(SSE:サーバーからブラウザへ一方通行で知らせを送り続けるしくみ)。
// 追加のライブラリは使いません。

import crypto from 'node:crypto';
import { createGame, applyAction, viewFor, cpuAction } from './public/js/engine.js';

const MAX_ROOMS = 200;
const MAX_SEATS = 4;
const ROOM_IDLE_MS = 2 * 60 * 60 * 1000; // 2時間なにもない部屋は片づける
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // まぎらわしい 0/O/1/I は使わない

const rooms = new Map(); // code -> room

function newCode() {
  for (let i = 0; i < 50; i++) {
    let code = '';
    for (let k = 0; k < 5; k++) code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(code)) return code;
  }
  return null;
}

function cleanName(name, fallback) {
  const s = String(name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
  return s || fallback;
}

function findSeat(room, token) {
  if (typeof token !== 'string') return null;
  return room.seats.find((s) => !s.cpu && s.token === token) || null;
}

function lobbyInfo(room) {
  return {
    code: room.code,
    started: !!room.game,
    seats: room.seats.map((s, i) => ({ id: i, name: s.name, cpu: s.cpu, host: i === 0, online: s.cpu || s.clients.size > 0 })),
  };
}

function send(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcast(room) {
  room.touched = Date.now();
  const lobby = lobbyInfo(room);
  room.seats.forEach((seat, i) => {
    if (seat.cpu) return;
    const view = room.game ? viewFor(room.game, i) : null;
    for (const res of seat.clients) send(res, { lobby, view });
  });
}

// CPU の席の番が来たら、少し間をあけて自動で動かす
function scheduleCpu(room) {
  if (room.cpuTimer || !room.game) return;
  room.cpuTimer = setTimeout(() => {
    room.cpuTimer = null;
    const g = room.game;
    if (!g || g.phase === 'end') return;
    for (const p of g.players) {
      if (!p.cpu) continue;
      const action = cpuAction(g, p.id);
      if (action) {
        applyAction(g, p.id, action);
        broadcast(room);
        scheduleCpu(room);
        return;
      }
    }
  }, 900);
}

export function mountBlackHarbor(app, createRateLimiter) {
  const roomLimiter = createRateLimiter(30, 10 * 60 * 1000, '部屋を作る・入る回数が多すぎます(10分に30回まで)。少し待ってください。');
  const actionLimiter = createRateLimiter(900, 10 * 60 * 1000, '操作の回数が多すぎます。少し待ってください。');

  setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (now - room.touched > ROOM_IDLE_MS) {
        for (const s of room.seats) for (const res of s.clients) res.end();
        clearTimeout(room.cpuTimer);
        rooms.delete(code);
      }
    }
  }, 5 * 60 * 1000).unref();

  app.post('/api/bh/create', roomLimiter, (req, res) => {
    if (rooms.size >= MAX_ROOMS) return res.status(503).json({ error: 'いま部屋がいっぱいです。しばらくしてから作り直してください。' });
    const code = newCode();
    if (!code) return res.status(503).json({ error: '部屋コードを作れませんでした。もう一度試してください。' });
    const token = crypto.randomBytes(18).toString('base64url');
    const room = {
      code,
      seats: [{ name: cleanName(req.body?.name, 'ボス'), cpu: false, token, clients: new Set() }],
      game: null,
      cpuTimer: null,
      touched: Date.now(),
    };
    rooms.set(code, room);
    res.json({ code, token, seat: 0 });
  });

  app.post('/api/bh/join', roomLimiter, (req, res) => {
    const room = rooms.get(String(req.body?.code || '').toUpperCase().trim());
    if (!room) return res.status(404).json({ error: 'その部屋コードは見つかりません。コードを確かめてください(5文字の英数字)。' });
    // 同じ人の入り直し(リロード)
    const again = findSeat(room, req.body?.token);
    if (again) return res.json({ code: room.code, token: again.token, seat: room.seats.indexOf(again) });
    if (room.game) return res.status(409).json({ error: 'この部屋はもうゲームが始まっています。' });
    if (room.seats.length >= MAX_SEATS) return res.status(409).json({ error: `この部屋は満員です(${MAX_SEATS}人まで)。` });
    const token = crypto.randomBytes(18).toString('base64url');
    room.seats.push({ name: cleanName(req.body?.name, `ボス${room.seats.length + 1}`), cpu: false, token, clients: new Set() });
    broadcast(room);
    res.json({ code: room.code, token, seat: room.seats.length - 1 });
  });

  // 部屋の主(最初に作った人)だけができる操作:CPU の追加・削除、ゲーム開始
  app.post('/api/bh/host', actionLimiter, (req, res) => {
    const room = rooms.get(String(req.body?.code || ''));
    if (!room) return res.status(404).json({ error: '部屋が見つかりません。' });
    const seat = findSeat(room, req.body?.token);
    if (!seat || room.seats.indexOf(seat) !== 0) return res.status(403).json({ error: '部屋を作った人だけが操作できます。' });
    const op = req.body?.op;
    if (op === 'addCpu') {
      if (room.game) return res.status(409).json({ error: 'ゲーム中は変更できません。' });
      if (room.seats.length >= MAX_SEATS) return res.status(409).json({ error: '満員です。' });
      room.seats.push({ name: `CPU-${room.seats.length + 1}`, cpu: true, token: null, clients: new Set() });
    } else if (op === 'removeCpu') {
      if (room.game) return res.status(409).json({ error: 'ゲーム中は変更できません。' });
      const i = room.seats.findLastIndex((s) => s.cpu);
      if (i > 0) room.seats.splice(i, 1);
    } else if (op === 'start' || op === 'rematch') {
      if (room.game && room.game.phase !== 'end') return res.status(409).json({ error: 'ゲームはもう始まっています。' });
      if (room.seats.length < 2) return res.status(409).json({ error: '2人以上必要です。友達を待つか、CPUを追加してください。' });
      room.game = createGame(room.seats.map((s) => ({ name: s.name, cpu: s.cpu })));
    } else {
      return res.status(400).json({ error: 'その操作はありません。' });
    }
    broadcast(room);
    scheduleCpu(room);
    res.json({ ok: true });
  });

  app.post('/api/bh/action', actionLimiter, (req, res) => {
    const room = rooms.get(String(req.body?.code || ''));
    if (!room || !room.game) return res.status(404).json({ error: 'ゲームが見つかりません。部屋が片づけられた可能性があります。' });
    const seat = findSeat(room, req.body?.token);
    if (!seat) return res.status(403).json({ error: 'この部屋の参加者ではありません。' });
    const result = applyAction(room.game, room.seats.indexOf(seat), req.body?.action);
    if (!result.ok) return res.status(400).json({ error: result.error });
    broadcast(room);
    scheduleCpu(room);
    res.json({ ok: true });
  });

  app.get('/api/bh/events', (req, res) => {
    const room = rooms.get(String(req.query.code || ''));
    if (!room) return res.status(404).json({ error: '部屋が見つかりません。' });
    const seat = findSeat(room, req.query.token);
    if (!seat) return res.status(403).json({ error: 'この部屋の参加者ではありません。' });
    if (seat.clients.size >= 3) return res.status(429).json({ error: '同じ席からの接続が多すぎます。' });
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write('retry: 3000\n\n');
    seat.clients.add(res);
    broadcast(room);
    // Render などの中継サーバーに切られないよう、ときどき空の知らせを送る
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => {
      clearInterval(ping);
      seat.clients.delete(res);
      if (rooms.has(room.code)) broadcast(room);
    });
  });
}
