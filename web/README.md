# DayGlassBar — 紹介・配布サイト

依存ゼロの静的サイトで、**GitHub Pages** に公開します。
公開 URL（設定後）: <https://mu-777.github.io/dayglassbar/>

| ファイル | 役割 |
| --- | --- |
| `index.html` | ページ本体。英/日対応＝翻訳対象の文字列はすべて `data-i18n="key"` を持つ。 |
| `styles.css` | アプリアイコン由来のダークテーマ（濃紺＋クールブルー1色）。 |
| `app.js` | 英/日トグル（catalog 内蔵）・OS 判定・GitHub Releases のライブ取得。 |
| `assets/` | 画像（現状は `icon.png` のみ）。実スクショや OG カードはここに置く。 |
| `.nojekyll` | Jekyll 処理を無効化（無害。将来ブランチ配信へ切替時の保険）。 |

## 公開のしくみ

`.github/workflows/pages.yml` が、この `web/` フォルダを Pages にアップロードします
（`web/` を変更した push、または *Run workflow* で実行）。ビルド工程はありません。

**一度だけの設定:** リポジトリの **Settings → Pages → Build and deployment →
Source を「GitHub Actions」** に設定します。最初の実行後、上記 URL で公開されます。

> 代替案（ワークフロー不要）: Source を「Deploy from a branch」→ `/docs` にして、
> これらのファイルを `docs/` へ移す方法もあります。インフラは軽いですが、`docs/`
> にある内部設計ドキュメントと公開サイトが混在します。両者を分けるため
> `web/` ＋ Actions の構成を採用しています。

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

## 画像 — 現状と差し替え対象

ヒーローとホバー説明は **インライン SVG モックアップ**（`index.html` 内）です。
そのため実スクショなしでもページの全体像を確認できます。Windows/macOS の実機が
用意できたら実スクショへ差し替えてください（バーは WSLg では描画できないため）。

`assets/` に追加して差し替えると良い実画像:

1. **ヒーロー用スクショ** — 右の縁に細いバーが張り付いたデスクトップ。塗りが
   半分くらい残る午後の時刻が見栄え良い。背後に実ウィンドウがあると文脈が出る。
   ワイド（〜1600×1000）・暗い壁紙推奨。`.hero__art` の SVG と差し替え。
2. **ホバー拡大** — 拡幅したバーに開始/終了/現在/残り時間のラベルが出た状態。
   〜1200×400。`.hover-demo` の SVG と差し替え。
3. **カレンダー色帯** — バー（または拡大状態）に Google と Outlook の予定が
   別色の帯で出た状態。Calendar の機能カード用。
4. **設定ウィンドウ** — 任意。将来の「設定」セクション用。
5. **OG/ソーシャルカード** — 1200×630 の PNG（濃紺背景にアイコン＋名前＋
   タグライン）。`assets/og.png` として保存し、`og:image` メタを指す。

撮影方法: Windows/macOS でアプリを起動し、`DAYGLASSBAR_FAKE_NOW` で区間内の
時刻にしてから OS のスクショ機能で撮ります。（リポジトリの
`tools/capture-bar.mjs` でバー窓を描画して撮ることもできます。）

## ローカルプレビュー

```bash
cd web
python3 -m http.server 8080   # ブラウザで http://localhost:8080
```
