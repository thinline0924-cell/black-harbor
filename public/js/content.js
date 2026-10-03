// BLACK HARBOR — 文章(ルールブック・チュートリアル・コーチのひとこと)
import { ROUTES, CARGO, PARTS, ALLIES, OPS, ROUNDS, START_CASH, ROUND_INCOME, LAUNDER_CAP, VP_PER, LEFTOVER_PER, BASE_CAPACITY, MAX_BUYS, OPS_HAND, OPS_PLAY } from './engine.js';

const tr = (cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;

export const RULES_HTML = `
<div class="panel">
  <div class="panel-title">ゲームの概要</div>
  <p>舞台は法と秩序が崩壊した港湾都市「ブラック・ハーバー」。あなたは新興マフィアのボスとして、非合法な貨物を街へ密輸します。
  <b>積みすぎるほど儲かるが、捕まりやすい</b>(チキンレース)、<b>ダイスによる検問突破</b>、<b>裏向きの工作カードによる騙し合い</b>を制し、
  全${ROUNDS}ラウンドで最も多くの「綺麗な資産(VP)」を手にした人の勝ちです。</p>
  <p>このデジタル版は、原作のルールブックを<b>少しだけわかりやすく</b>しています(2〜4人用、道具の効果は自動で発動、など)。</p>
</div>
<div class="panel">
  <div class="panel-title">勝利条件とお金</div>
  <p>お金の単位はすべて「万円」。最初の手持ちは ${START_CASH}万円、毎ラウンドはじめに上納金 ${ROUND_INCOME}万円が入ります。</p>
  <p>稼いだ現金(ブラックマネー)は、ラウンドの最後に<b>洗浄(ロンダリング)</b>すると「綺麗な資産(VP)」になります:
  <b>${VP_PER}万円 = 1 VP</b>。1ラウンドに洗える上限は ${LAUNDER_CAP}万円です。</p>
  <p>ゲーム終了時、洗っていない現金は <b>${LEFTOVER_PER}万円 = 1 VP</b> にしかなりません。効率よく洗うのが勝負の分かれ目です。</p>
</div>
<div class="panel">
  <div class="panel-title">4つの密輸ルート</div>
  <table><tr><th>ルート</th><th>安全上限値</th><th>特徴</th></tr>
  ${ROUTES.map((r) => tr([r.name, `<b>${r.limit}</b>`, r.desc])).join('')}</table>
</div>
<div class="panel">
  <div class="panel-title">1ラウンドの流れ</div>
  <table>
  ${tr(['<b>① 仕入れ</b>', `親から順番に、市場のカードを1枚ずつ買います(1ラウンド${MAX_BUYS}枚まで)。「終える」と、そのラウンドはもう買えません。<br>貨物=運ぶブツ/パーツ=トラックの改造(3つまで)/協力者=特殊能力(2人まで)`])}
  ${tr(['<b>② 積載</b>', `全員が同時に、運ぶ貨物(最大${BASE_CAPACITY}枚)とルートを決めて、一斉に公開します。3D の盤では自分のトラックをつかんでルートの出発地点に置けます。`])}
  ${tr(['<b>③ 工作</b>', `毎ラウンド工作カードが${OPS_HAND}枚配られ、最大${OPS_PLAY}枚を好きなルートに裏向きで仕掛けます。自分のルートを安全にするも、ライバルを密告するも自由。`])}
  ${tr(['<b>④ 運搬</b>', '親から順に検問の判定をします。下の式で最終警戒度を出し、上限値以下なら突破!'])}
  ${tr(['<b>⑤ 洗浄</b>', '手元の現金を、上限まで VP に洗います。'])}
  </table>
  <div class="formula">最終警戒度 = 荷物の警戒度の合計 + 工作カードの補正 + ダイスの出目<br>
  <b>上限値以下 → 突破!</b> 貨物の利益を獲得 ／ <b>上限値オーバー → 摘発!</b> 貨物は没収、罰金 = 警戒度合計 × 10万円</div>
  <p>罰金が払えないときは破産状態(手持ち0)になり、次のラウンドは警戒度+2からのスタートです。</p>
</div>
<div class="panel">
  <div class="panel-title">貨物カード</div>
  <table><tr><th>名前</th><th>利益</th><th>警戒度</th><th>仕入れ値</th><th>特徴</th></tr>
  ${Object.values(CARGO).map((c) => tr([c.name, `${c.profit}万`, c.heat, `${c.cost}万`, c.text])).join('')}</table>
</div>
<div class="panel">
  <div class="panel-title">工作カード(毎ラウンド配られる)</div>
  <table>${Object.values(OPS).map((c) => tr([`<b>${c.name}</b>`, c.sign, c.text])).join('')}</table>
</div>
<div class="panel">
  <div class="panel-title">パーツ(最大3つ)</div>
  <table>${Object.values(PARTS).map((c) => tr([`<b>${c.name}</b>`, `${c.cost}万`, c.text])).join('')}</table>
</div>
<div class="panel">
  <div class="panel-title">協力者(最大2人)</div>
  <table>${Object.values(ALLIES).map((c) => tr([`<b>${c.name}</b>`, `${c.cost}万`, c.text])).join('')}</table>
</div>
<div class="panel">
  <div class="panel-title">原作からの変更点(わかりやすくするため)</div>
  <p>・人数は2〜4人。CPU が空いた席に入れます。<br>
  ・お金の単位を「万円」にそろえ、VP は「100万円 = 1 VP」に統一。<br>
  ・ニトロ・メカニック・EMP は、摘発されそうなときに自動で使われます。<br>
  ・工作カードは毎ラウンド3枚配られ、2枚まで仕掛けます。「デコイ」は省略しました。<br>
  ・珍獣は「摘発されても手元に戻る」効果だけにしました。<br>
  ・地下廃棄道は「罰金2倍」として、リスクの大きさを表しています。</p>
</div>`;

// ---- チュートリアルのスライド ----
const svg = (body) => `<svg viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg" font-family="Noto Sans JP, sans-serif">${body}</svg>`;
const C = { ink: '#4b483e', light: '#d9d4bf', red: '#b2523f', mid: '#8d8875' };

export const SLIDES = [
  {
    title: 'あなたは闇ブローカー',
    art: svg(`
      <rect x="20" y="70" width="90" height="80" fill="${C.mid}"/><text x="65" y="168" text-anchor="middle" font-size="14" fill="${C.ink}">港 HARBOR</text>
      <rect x="290" y="40" width="30" height="110" fill="${C.ink}"/><rect x="325" y="70" width="26" height="80" fill="${C.mid}"/><rect x="355" y="55" width="24" height="95" fill="${C.ink}"/>
      <text x="335" y="168" text-anchor="middle" font-size="14" fill="${C.ink}">街 CITY</text>
      <path d="M115 110 C 170 60, 230 160, 285 100" stroke="${C.ink}" stroke-width="4" fill="none" stroke-dasharray="10 6"/>
      <rect x="170" y="88" width="44" height="24" fill="${C.red}"/><rect x="214" y="94" width="16" height="18" fill="${C.light}" stroke="${C.ink}"/>`),
    text: '港から街へ、ヤバい貨物を密輸して稼ぎます。全5ラウンドで、稼いだお金を<b>「綺麗な資産(VP)」</b>に洗い、いちばん多く持っていた人の勝ち!',
  },
  {
    title: '4つのルートと「安全上限値」',
    art: svg(ROUTES.map((r, i) => `
      <text x="20" y="${42 + i * 42}" font-size="15" fill="${C.ink}">${r.name}</text>
      <rect x="130" y="${28 + i * 42}" width="${r.limit * 13}" height="18" fill="${i === 3 ? C.ink : C.mid}"/>
      <text x="${138 + r.limit * 13}" y="${42 + i * 42}" font-size="16" fill="${C.red}" font-weight="700">${r.limit}</text>`).join('')),
    text: 'ルートごとに警察の目の厳しさ=<b>安全上限値</b>があります。上限が高いルートほど、たくさん積んでも通りやすい。でも地下は捕まると罰金2倍!',
  },
  {
    title: '検問の判定式',
    art: svg(`
      <rect x="10" y="60" width="100" height="60" fill="${C.mid}"/><text x="60" y="88" text-anchor="middle" font-size="13" fill="${C.light}">荷物の</text><text x="60" y="106" text-anchor="middle" font-size="13" fill="${C.light}">警戒度 11</text>
      <text x="122" y="98" font-size="26" fill="${C.ink}">+</text>
      <rect x="140" y="60" width="90" height="60" fill="${C.red}"/><text x="185" y="88" text-anchor="middle" font-size="13" fill="${C.light}">タレコミ</text><text x="185" y="106" text-anchor="middle" font-size="13" fill="${C.light}">+3</text>
      <text x="240" y="98" font-size="26" fill="${C.ink}">+</text>
      <rect x="262" y="66" width="48" height="48" fill="${C.light}" stroke="${C.ink}" stroke-width="3"/><circle cx="276" cy="80" r="5" fill="${C.ink}"/><circle cx="286" cy="90" r="5" fill="${C.ink}"/><circle cx="296" cy="100" r="5" fill="${C.ink}"/>
      <text x="322" y="98" font-size="26" fill="${C.ink}">=</text><text x="370" y="100" text-anchor="middle" font-size="30" fill="${C.red}" font-weight="700">17</text>
      <text x="200" y="160" text-anchor="middle" font-size="15" fill="${C.ink}">高速道路の上限15 を超えた → 摘発!</text>`),
    text: '最終警戒度 = <b>荷物の警戒度</b> + <b>工作カード</b> + <b>ダイスの出目</b>。上限以下なら突破して利益ゲット、超えたら摘発で没収+罰金。画面には<b>突破できる確率のグラフ</b>が出るので、それを見て決めましょう。',
  },
  {
    title: '1ラウンドの流れ',
    art: svg(['仕入れ', '積載', '工作', '運搬', '洗浄'].map((t, i) => `
      <rect x="${10 + i * 78}" y="80" width="70" height="40" fill="${i % 2 ? C.mid : C.ink}"/>
      <text x="${45 + i * 78}" y="105" text-anchor="middle" font-size="15" fill="${C.light}">${t}</text>
      ${i < 4 ? `<text x="${80 + i * 78}" y="106" font-size="14" fill="${C.ink}">▶</text>` : ''}`).join('')),
    text: '① 市場でカードを<b>仕入れ</b> → ② 運ぶ貨物とルートを<b>同時に公開</b> → ③ ルートに<b>工作カード</b>を裏向きで仕掛ける → ④ 順番に<b>検問</b>(3Dでサイコロ!) → ⑤ 現金を<b>洗浄</b>してVPに。',
  },
  {
    title: '工作カードで騙し合い',
    art: svg(Object.entries({ tip: ['密', '+3'], safe: ['賄', '-3'], crack: ['激', '+🎲'], fake: ['虚', '✕'], decoy: ['囮', '¥'] }).map(([k, [g, s]], i) => `
      <rect x="${18 + i * 76}" y="40" width="62" height="92" fill="${C.light}" stroke="${C.ink}" stroke-width="3"/>
      <text x="${49 + i * 76}" y="88" text-anchor="middle" font-size="30" font-weight="700" fill="${C.ink}">${g}</text>
      <text x="${49 + i * 76}" y="120" text-anchor="middle" font-size="15" fill="${C.red}">${s}</text>
      <text x="${49 + i * 76}" y="160" text-anchor="middle" font-size="12" fill="${C.ink}">${OPS[k].name}</text>`).join('')),
    text: 'ライバルが積みすぎていたら<b>タレコミ(+3)</b>で摘発に追い込もう。自分のルートには<b>安全通行(-3)</b>。誰が何を置いたかは、検問のときまでわかりません。',
  },
  {
    title: '洗浄して資産に',
    art: svg(`
      <rect x="40" y="60" width="110" height="80" fill="${C.ink}"/><text x="95" y="96" text-anchor="middle" font-size="15" fill="${C.light}">現金</text><text x="95" y="120" text-anchor="middle" font-size="15" fill="${C.light}">1000万</text>
      <text x="200" y="108" text-anchor="middle" font-size="30" fill="${C.ink}">➜</text>
      <rect x="250" y="60" width="110" height="80" fill="${C.light}" stroke="${C.ink}" stroke-width="3"/><text x="305" y="96" text-anchor="middle" font-size="15" fill="${C.ink}">綺麗な資産</text><text x="305" y="122" text-anchor="middle" font-size="20" font-weight="700" fill="${C.red}">10 VP</text>`),
    text: 'ラウンドの最後に、現金を<b>100万円=1VP</b>で洗えます(1回1000万円まで)。でも全部洗うと次に仕入れるお金がなくなる…。協力者「マネーロンダラー」「悪徳会計士」で洗浄力アップ!',
  },
];

// ---- 練習ゲーム中のコーチ ----
export const COACH = {
  market: [
    { text: 'まずは<b>仕入れ</b>。左の一覧から<b>貨物</b>(運ぶブツ)を選ぶと、真ん中に利益や警戒度のグラフが出ます。「購入する」で買いましょう。', focus: '#marketList' },
    { text: '1ラウンドに3枚まで買えます。最初は<b>軍用アサルトライフル</b>2枚か、ライフル+偽ブランド品がおすすめ。買い終えたら「買い物を終える」。', focus: '#marketDetail' },
  ],
  load: [
    { text: '<b>積載</b>フェーズ。左で運ぶ貨物にチェックを入れてください。積むほど利益も警戒度も上がります。', focus: '#cargoList' },
    { text: '真ん中に、ルートごとの<b>突破確率</b>と、警戒度の<b>出やすさのグラフ</b>が出ます。赤い棒は摘発。赤が少ないルートを選びましょう。', focus: '#cargoDetail' },
    { text: '<b>MAP</b> タブを開くと、3Dの盤で自分のトラックを<b>つかんでルートの出発地点に置く</b>こともできます。決めたら「出発」!', focus: '#tabs [data-tab="map"]' },
  ],
  ops: [
    { text: '全員のルートが公開されました。<b>工作</b>フェーズでは、左の工作カードを選び、真ん中のルートの「ここに仕掛ける」を押します。', focus: '#opsList' },
    { text: 'ライバルの突破確率の棒が、あなたの工作でどう変わるか見てみましょう。自分のルートには<b>安全通行</b>が安心。決めたら「工作を確定」。', focus: '#opsDetail' },
  ],
  resolve: [{ text: 'いよいよ<b>検問</b>!トラックが検問所に着くと、仕掛けられた工作カードがめくられ、3Dのサイコロが転がります。式の結果に注目!' }],
  launder: [{ text: '最後に<b>洗浄</b>。現金をVPに変えます。次のラウンドの仕入れ用に、少し現金を残すのも作戦です。' }],
  market2: [{ text: '2ラウンド目。市場には<b>パーツ</b>や<b>協力者</b>もあります。「サスペンション改造」や「マネーロンダラー」は強力。選んで効果を読んでみましょう。', focus: '#marketList' }],
  end: [{ text: 'お疲れさまでした!これで遊び方はばっちり。タイトルから「CPUと対戦」や「オンライン対戦」で本番に挑戦しましょう。' }],
};
