// ひだまり牧場 — サーバー
// 画面のファイル(public/)を配るだけのシンプルなサーバーです。
// セーブデータは遊ぶ人のブラウザの中に保存するので、サーバーには何も記録しません。
// APIキーや合言葉は使いません。設定は環境変数 PORT だけ(Render が自動で入れます)。

import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  next();
});
// 更新したらすぐ新しいファイルが届くように、毎回「変わっていないか」をサーバーに確認させる
// (古い画面と新しいプログラムが混ざると、ボタンが反応しなくなるため)
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res) => res.set('Cache-Control', 'no-cache'),
}));

app.get('/healthz', (req, res) => res.send('ok'));

app.use((req, res) => {
  res.status(404).send('ページが見つかりません。トップページ(/)を開いてください。');
});

app.listen(PORT, () => {
  console.log(`ひだまり牧場 is ready on port ${PORT}`);
});
