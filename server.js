// BLACK HARBOR — サーバー
// 画面のファイル(public/)を配り、オンライン対戦の部屋(/api/bh/...)を受け持ちます。
// APIキーや合言葉は使いません。設定は環境変数 PORT だけ(Render が自動で入れます)。

import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mountBlackHarbor } from './online.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const app = express();
// Render の中継サーバー(プロキシ)越しでも、遊んでいる人の本当の IP を使う(回数制限のため)
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// ---- 回数制限(同じ IP からの使いすぎを防ぐ) ----
function createRateLimiter(limit, windowMs, message) {
  const hits = new Map(); // ip -> 呼ばれた時刻の一覧
  setInterval(() => {
    const now = Date.now();
    for (const [ip, times] of hits) {
      const recent = times.filter((t) => now - t < windowMs);
      if (recent.length) hits.set(ip, recent);
      else hits.delete(ip);
    }
  }, 60 * 1000).unref();

  return (req, res, next) => {
    const now = Date.now();
    const ip = req.ip || 'unknown';
    const recent = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      const retrySec = Math.ceil((windowMs - (now - recent[0])) / 1000);
      res.set('Retry-After', String(retrySec));
      return res.status(429).json({ error: message });
    }
    recent.push(now);
    hits.set(ip, recent);
    next();
  };
}

app.get('/healthz', (req, res) => res.send('ok'));

mountBlackHarbor(app, createRateLimiter);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'そのAPIはありません。' });
});

app.listen(PORT, () => {
  console.log(`BLACK HARBOR is ready on port ${PORT}`);
});
