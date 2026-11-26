# DayGlassBar — 紹介・配布サイト

依存ゼロの静的サイトで、**Cloudflare Workers の静的アセット**として公開します。
公開 URL: <https://dayglassbar.mu-777.dev/>

`web/` は Worker のプロジェクト（`wrangler.toml`・`package.json`＝wrangler だけ）で、
**配信するのは `public/` の中身だけ**です（この README や `node_modules` は配らない）。
ページ自体は従来どおりビルド工程なし・ランタイム依存ゼロ。

| ファイル | 役割 |
| --- | --- |
| `public/index.html` | ページ本体。英/日対応＝翻訳対象の文字列はすべて `data-i18n="key"` を持つ。 |
| `public/privacy.html` | プライバシーポリシー（アプリ本体＋このサイトの Cloudflare Web Analytics を開示）。`index.html` と同じ `app.js` の i18n/lang toggle を共有。URL は `/privacy`。 |
| `public/terms.html` | 利用規約（Google OAuth 本番審査で同意画面への ToS リンク登録が必須のため。根拠は `docs/google-oauth-legal-pages.md`）。`index.html` と同じ `app.js` の i18n/lang toggle を共有。URL は `/terms`。 |
| `public/styles.css` | アプリアイコン由来のダークテーマ（濃紺＋クールブルー1色）。 |
| `public/app.js` | 英/日トグル（catalog 内蔵）・OS 判定・GitHub Releases のライブ取得。 |
| `public/assets/` | 画像（`icon.png`・`og.png`＝OG カード・`kofi_symbol.svg`）。実スクショもここに置く。 |
| `wrangler.toml` | Worker 名 `dayglassbar-lp`・Custom Domain `dayglassbar.mu-777.dev`・`[assets] directory = "./public"`。 |
| `package.json` | wrangler（devDependency）だけ。アプリ本体の `package.json` には足さない。 |

## 配信（Cloudflare Workers）

- **配信**: Cloudflare Workers の静的アセット（Worker のスクリプトなし）。Worker 名
  `dayglassbar-lp`、Custom Domain `dayglassbar.mu-777.dev`（`wrangler.toml` の
  `routes`）。DNS レコードと証明書は Custom Domain から Cloudflare が作る。
- **デプロイ**: Cloudflare の **Workers Builds**（Git 連携）。master への push で、
  `web/` に変更があれば `npx wrangler deploy` が走る。ルートディレクトリ・watch paths
  はダッシュボード側の設定。
- **Workers Builds の設定値**（構築済み。Worker → Settings → Build で確認・変更）:
  リポジトリ `mu-777/dayglassbar`、本番ブランチ `master`、ルートディレクトリ `web`、
  ビルドコマンドなし、デプロイコマンド `npx wrangler deploy`、Build watch paths
  `web/*`（リポジトリ直下からの相対）、Previews は無効。手動で再デプロイするときは
  Worker → Deployments の「Build」から（ブランチ指定可）。
- **URL の形**: `html_handling` は既定の `auto-trailing-slash`＝`/privacy.html` は
  `/privacy` へ、`/index.html` は `/` へ 307。ページ内リンク・canonical・
  OAuth 同意画面に登録する URL は**拡張子なし（`/`・`/privacy`・`/terms`）**に揃える
  （同意画面の Privacy URL とホームページのリンクを一致させる要件＝
  `docs/google-oauth-legal-pages.md` R2。リダイレクトを挟まない）。
- **旧 URL**: `https://mu-777.github.io/dayglassbar/` は `.github/workflows/pages.yml`
  が置く転送専用ページ（JS でパス・クエリ・ハッシュを保ったまま新 URL へ。
  JS なしはトップへ meta refresh。`404.html` も同じ中身＝旧パスすべてを拾う）。
  `web/` は Pages に上げない。

**理由（StepCut の LP `stepcut.mu-777.dev` と同じ構成にそろえた）**: ドメインが既に
Cloudflare にあり、サブドメインなら Custom Domain の 1 行で済む（同じドメインの
ほかのページと経路が重ならない）。Workers の静的アセットと Workers Builds は無料枠で
足りる。Workers Builds は GitHub に Cloudflare の API トークンを置かずに済む。

**不採用案（逆戻りガード）**:
- **GitHub Pages のまま独自ドメインを向ける** — ほかのページと同じ Cloudflare に
  そろえた。Pages は転送専用に残す。
- **GitHub Actions + `wrangler deploy`** — `paths:` で条件を書けるが、Cloudflare の
  API トークンを GitHub Secrets に置く必要がある。
- **`mu-777.dev/dayglassbar`（パスで分ける）** — ルートと `assets.base_path` で
  できるが、ドメイン直下のページ側の割り当て方に依存し設定が増える。ユーザーが
  サブドメインを選んだ。
- **`web/` 直下をそのまま配信（`.assetsignore` で README 等を除外）** — 除外漏れで
  内部ファイルを配る事故が起きうる。`public/` に分けた。
- **`html_handling = "none"` で `.html` の URL を残す** — `/privacy` が 404 になり、
  Workers の慣習とずれる。拡張子なしに揃えた。
- **旧 Pages を単に止める** — README・SNS・検索結果・OAuth 同意画面に残る旧 URL が
  404 になる。

## ダウンロードリンク

`app.js` がブラウザから
`https://api.github.com/repos/mu-777/dayglassbar/releases/latest`
を呼び、**GitHub Actions が最後に公開したリリース**（`v*` タグ → Release）の
Windows/macOS ボタンとバージョンを自動で埋めます。
そのため、**リリースごとの手編集なし**で常に最新ビルドを反映します。

- アセット判別: `*.exe` で "Setup" を含む → インストーラ、もう片方の `*.exe` →
  ポータブル、`*.dmg` → macOS。（electron-builder の既定名。例:
  `DayGlassBar Setup 0.1.0.exe`）
- リリース未公開、または API レート制限時は、全ボタンが Releases ページへ
  フォールバックします。
- リポジトリが **public** であることが前提（API 呼び出しは未認証のため）。

## ヒーローの動作デモ（demo.js）

ヒーローのデスクトップシーンは `demo.js` がループ駆動します（スイープ→ホバー展開→巻き戻し）。

**`prefers-reduced-motion: reduce` では静止フレームにしない**（逆戻りガード）。
Android の Chrome は、ユーザーが意図して設定していなくても **バッテリーセーバー**・
ユーザー補助の「アニメーションを削除」・開発者向けオプションのアニメスケール 0 で
`reduce` を報告するため、静止フレームだと多くの Android 端末で「デモが壊れて最後の
フレームで止まっている」ように見える（v0.1.1 後に実際に発生・修正済み）。代わりに
同じループを **1秒刻みのコマ送り**で回す（連続的な動きなし・ホバー展開も
`.dgb--steps` で transition を切ってスナップ）＝reduced-motion の趣旨は守りつつ、
デモとして動いていることは伝わる。

## 画像 — 現状と差し替え対象

ヒーローとホバー説明は **インライン SVG モックアップ**（`index.html` 内）です。
そのため実スクショなしでもページの全体像を確認できます。Windows/macOS の実機が
用意できたら実スクショへ差し替えてください（バーは WSLg では描画できないため）。

`public/assets/` に追加して差し替えると良い実画像:

1. **ヒーロー用スクショ** — 右の縁に細いバーが張り付いたデスクトップ。塗りが
   半分くらい残る午後の時刻が見栄え良い。背後に実ウィンドウがあると文脈が出る。
   ワイド（〜1600×1000）・暗い壁紙推奨。`.hero__art` の SVG と差し替え。
2. **ホバー拡大** — 拡幅したバーに開始/終了/現在/残り時間のラベルが出た状態。
   〜1200×400。`.hover-demo` の SVG と差し替え。
3. **カレンダー色帯** — バー（または拡大状態）に Google と Outlook の予定が
   別色の帯で出た状態。Calendar の機能カード用。
4. **設定ウィンドウ** — 任意。将来の「設定」セクション用。
5. **OG/ソーシャルカード** — **済み**: `assets/og.png`（1200×630・濃紺背景に
   アイコン＋名前＋タグライン＋右縁のバー）。`index.html` の `og:image` が
   絶対 URL で参照（クローラは相対 URL を解決しないため）。再生成は
   `npm run og`（`tools/gen-og.mjs`＝capture-bar と同じ Electron capturePage
   方式・依存ゼロ）。文言・配色はスクリプト内に直書き。フォントは Inter →
   LP と同じスタックの順でフォールバック（描画マシンのフォントに依存）。

撮影方法: Windows/macOS でアプリを起動し、`DAYGLASSBAR_FAKE_NOW` で区間内の
時刻にしてから OS のスクショ機能で撮ります。（リポジトリの
`tools/capture-bar.mjs` でバー窓を描画して撮ることもできます。）

## Web Analytics（Cloudflare）

`public/` の `index.html`・`privacy.html`・`terms.html` の `</body>` 直前に、訪問数を見るための
Cloudflare Web Analytics のビーコンスクリプトが入っています。Cookie 不要・
同意バナー不要（`docs/google-oauth-publishing.md` 検討時に GA4 は Cookie
同意バナーが実質必須と判明し不採用。代わりにこちらを採用）。

トークンはサイト（ホスト名）ごとに発行され、**apex ドメインが違うと使えない**
（ビーコン受信時にホスト名を後方一致で検証する。`mu-777.github.io` 用のトークンは
`dayglassbar.mu-777.dev` では無効）。再発行・サイト変更時は以下の手順で取得し、
3 ファイルの `data-cf-beacon` の `token` を差し替えます。

1. Cloudflare ダッシュボード → **Web Analytics** → **Add a site**。
2. 手動の「JavaScript snippet」で追加し、ホスト名は `dayglassbar.mu-777.dev`。
   （プロキシ済みゾーン向けの自動注入は `mu-777.dev` ゾーンの全ページに入るので使わない。）
3. 発行された snippet 内の `token` の値をコピーし、`index.html`・`privacy.html`・
   `terms.html` の `data-cf-beacon` の `token` を置き換える。
4. ダッシュボードに数値が出るまで数分かかる（[公式ドキュメント](https://developers.cloudflare.com/web-analytics/get-started/)）。

## ローカルプレビュー

```bash
cd web
npm install
npx wrangler dev      # ブラウザで http://localhost:8787（本番と同じ URL の扱い）
```

`public/` を `python3 -m http.server` で開くこともできるが、拡張子なしのリンク
（`/privacy`・`/terms`）は解決されない。
