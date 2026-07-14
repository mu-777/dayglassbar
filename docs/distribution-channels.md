# 配布チャネル（winget / Homebrew cask）将来対応メモ（未実施）

GitHub Releases（`v*` タグ → `.github/workflows/build.yml` が `.exe`/`.dmg` を添付）と紹介ページ（`web/`）に加えて、OS のパッケージマネージャから導入できるようにするための調査・手順の記録。**現状は未実施**で、実装は伴わない（`docs/google-oauth-publishing.md` と同じ位置づけ）。

## なぜ（背景）

- 現在の導入経路はブラウザからの手動ダウンロードのみ。未署名のため Windows は SmartScreen、macOS は Gatekeeper の警告があり、ここが配布の最大の摩擦。
- winget / Homebrew はコマンド 1 行で導入・更新でき、リリースは既に GitHub Releases に自動添付されるため、**両チャネルとも「リリースアセットの URL とハッシュを manifest 化して登録する」だけ**で成立する。アプリ側のコード変更は不要。
- バージョンの唯一の正は `package.json`（`npm version` でタグと一致＝README「ビルド」）。manifest の版もこれに追従させる。

## winget（Windows）

- 仕組み: [microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs) リポジトリへ YAML manifest（PackageIdentifier・InstallerUrl・SHA256 など）を PR して登録する。**コード署名は必須ではない**（無署名でも登録可）。
- PackageIdentifier 案: `mu-777.DayGlassBar`。Installer は NSIS の `DayGlassBar Setup <version>.exe`（oneClick なのでサイレント `/S` に対応済み＝winget の要件を満たす）。
- 初回: `wingetcreate new <installerUrl>` で対話生成して PR（bot 検証＋モデレーション審査で数日）。
- 更新: リリースごとに `wingetcreate update mu-777.DayGlassBar --version <v> --urls <url> --submit`。`build.yml` の Release 後ステップに足せば自動化できる（PR 作成用の GitHub PAT が必要）。
- 注意: InstallerUrl は**バージョン付きの恒久 URL**（`releases/download/v<x.y.z>/...exe`）を使う（`releases/latest` は不可。ハッシュ固定のため）。

## Homebrew cask（macOS）

- 二択:
  1. **本家 homebrew/homebrew-cask**: 新規カスクには知名度基準（GitHub の stars/forks/watchers の目安）があり、無名のうちは弾かれることがある。要件を満たしてから。
  2. **自前 tap（すぐ可能・まずはこちら）**: `mu-777/homebrew-tap` リポジトリを作り `Casks/dayglassbar.rb` を置くだけ。ユーザーは `brew tap mu-777/tap && brew install --cask dayglassbar`。要件・審査なし。
- cask 定義は `version`・`sha256`・`url`（Release の dmg）・`app "DayGlassBar.app"` の数行。リリースごとの version/sha256 更新も Actions で自動化できる。
- 注意: 未署名のため cask で入れても Gatekeeper の隔離属性は付く（ユーザーは `--no-quarantine` か README の `xattr` 手順が必要）。**署名＋公証（notarization）を先に済ませるとこの注意ごと消える**ので、理想の着手順は「署名 → cask」。署名・公証の決定記録と導入手順は [`macos-signing.md`](macos-signing.md)。
- 対象は Apple Silicon のみ（`build.yml` は arm64 ランナー）。Intel 対応するなら universal ビルドが先。

## スコープ外（逆戻りガード）

- Microsoft Store / Mac App Store は開発者アカウント・署名・サンドボックス対応が必須で、別次元の作業。ここでは扱わない。
- アプリ内自動アップデータ（electron-updater 等）は入れない（更新確認は手動ボタンのみ＝不変条件 #4）。`winget upgrade` / `brew upgrade` はユーザー起点なので方針と整合する。
