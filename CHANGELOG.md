# Changelog

DayGlassBar の変更履歴。書式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、
バージョンは [Semantic Versioning](https://semver.org/lang/ja/) に従う。

このファイルが**リリースノートの正**。リリース時は GitHub Actions が押されたタグ（`v<version>`）に
対応する節を抜き出し、GitHub Release の本文にする（[`.github/workflows/build.yml`](.github/workflows/build.yml)）。
運用手順は [`README.md`](README.md) の「リリース手順」を参照。

<!--
次のリリースの変更は下の [Unreleased] 節にだけ書く（リリース前に埋める。空でもよい。
分類は Added / Changed / Deprecated / Removed / Fixed / Security）。`npm version` 実行時に
tools/stamp-changelog.mjs がこの [Unreleased] 見出しを `## [x.y.z] - YYYY-MM-DD` に置き換え、
新しい空の [Unreleased] を上に作る。この案内コメントは [Unreleased] の外＝ここに置くこと
（節の中に置くとリリース本文へ混入する）。
-->

## [Unreleased]

## [0.2.0] - 2026-09-02

### Added

- トレイメニューに「一時的に非表示（翌日に復帰）」を追加。もう一度押せばすぐ戻り、押さなくても翌日には自動で復帰する

### Changed

- スケジュールの時刻をキーボード入力から時計の入力欄（OS標準）で選ぶ形に変更
- 日跨ぎの指定方法を変更。終了が開始と同じかそれより前なら翌日扱いになる（22:00〜02:00 = 翌2:00まで）。`25:00` のような24時超表記の既存設定もそのまま動く
- 曜日ごとの設定を「期間」と「休憩」の2つの枠に分けて表示するようにした
- 設定画面「表示」の項目を関連するものごとに行でまとめ直した
- 目盛りを区間の開始からの間隔ではなく時計に合わせて配置するようにした（間隔60分なら開始が9:30でも毎正時に線が出る）
- 設定の保存・インポート・初期化を行うと、一時的な非表示を解除してバーを表示するようにした
- ディスプレイの選択欄で、現在つながっていないディスプレイに「未接続」と表示するようにした

### Fixed

- 再起動後に表示先ディスプレイの指定が失われ、プライマリに戻ってしまうことがあるのを修正
- Outlook（ローカル）連携で、日本語の予定タイトルやカレンダー名が文字化けしたり、予定が読み込めなくなることがあるのを修正

## [0.1.1] - 2026-07-14

### Added

- macOS: インストール用 DMG を開いた画面に背景を追加し、手順（「アプリケーション」へのドラッグと、初回起動前に一度実行する解除コマンド）を表示するようにした

## [0.1.0] - 2026-07-04

初回リリース。

### Added

- 画面の縁に常駐する細いアンビエントバー。一日の区間の残り時間を塗りの長さだけで表現（テキストは出さない）。常時クリックスルー・常時最前面。
- ホバー展開: バーにカーソルを留めると拡幅し、開始/終了/現在時刻と残り時間のラベルを表示。
- 週間スケジュールと日付ごとの上書き（overrides）、昼休憩などの休憩区間。
- トレイ常駐（設定を開く／終了）。バーは UI を持たないため初回のみ設定画面を自動オープン。
- 外観設定: 表示ディスプレイ・辺・太さ・色・不透明度・下地・目盛り。配置は `workArea` 基準。
- カレンダー連携（既定 OFF）: Google（OAuth）と Outlook ローカル（PowerShell/COM）の予定を区間内に色帯で表示。表示カレンダーは複数選択可。秘匿情報は `calendar-accounts.enc` に暗号化分離。
- 多言語対応（英・日・中）。未保存時の既定は OS ロケール由来。設定画面でライブ切替。
- 設定のエクスポート/インポート（ローカル JSON のみ）。
- 診断情報の保存（ログ＋環境情報＋設定を 1 つの `.zip` に。秘匿情報は含めない）。
- ログイン時自動起動（既定 ON・Windows/macOS）。
- 設定画面フッターにバージョン表示（`app:version` IPC）。
- 紹介・配布用の静的サイト（`web/`・GitHub Pages）。DL リンクは `releases/latest` を自動反映。
- Ko-fi による任意の寄付導線。

[Unreleased]: https://github.com/mu-777/dayglassbar/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/mu-777/dayglassbar/releases/tag/v0.2.0
[0.1.1]: https://github.com/mu-777/dayglassbar/releases/tag/v0.1.1
[0.1.0]: https://github.com/mu-777/dayglassbar/releases/tag/v0.1.0
