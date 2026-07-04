---
name: release
description: DayGlassBar のリリースを実行する（CHANGELOG の [Unreleased] 執筆 → npm version → git push --follow-tags → GitHub Release 確認）。「リリースして」「版を上げて」「v0.x.y を出して」等の依頼で使う。引数で patch / minor / major を指定可（省略時は変更内容から提案して確認）。
argument-hint: "[patch|minor|major]"
---

# DayGlassBar リリース手順

このスキルはリリース一連（CHANGELOG 執筆 → 版バンプ → push → Release 確認）を実行する。
**書かれた順に、1フェーズずつ実行する。各フェーズの「確認」を満たさない限り次へ進まない。**

前提知識（設計）:
- **版の唯一の正 = `package.json` の `version`**。`app.getVersion()`・インストーラ名・設定画面フッタが全部これを読む。
- **リリースノートの正 = `CHANGELOG.md`**（Keep a Changelog 形式）。タグ push 時に `.github/workflows/build.yml` が `tools/extract-changelog.mjs` で該当版の節を抜き出し、GitHub Release の本文に自動投入する。
- `npm version <level>` は `version` フック（`tools/stamp-changelog.mjs`）で CHANGELOG の `[Unreleased]` を `## [x.y.z] - 日付` に置換してから、版コミット＋ `v<x.y.z>` タグを一括生成する。**タグを手で打たない**（初回リリースの例外は Phase 0 参照）。

---

## Phase 0: 事前チェック

以下を順に確認する。**1つでも満たさなければ停止してユーザーに報告する**（勝手に直さない）。

```bash
git branch --show-current   # → master であること
git status --porcelain      # → 空（クリーン）であること
git tag --list 'v*'         # → 前タグの確認（下の分岐に使う）
npm test                    # → 全テスト pass であること
```

- ブランチが master でない → 停止。「master 以外からのリリースは想定外」と報告。
- 作業ツリーが汚れている → 停止。未コミット変更の一覧を見せ、コミットするか退避するかユーザーに確認。
- テスト失敗 → 停止。失敗出力をそのまま見せる。

**初回リリース分岐**: `git tag --list 'v*'` が**空**の場合は Phase 1〜4 を全部スキップする。
`package.json` の `version`（例 0.1.0）と CHANGELOG の `## [0.1.0]` 節が既に存在することを確認し、
Phase 5 の代わりに以下だけ実行して Phase 6 へ:

```bash
git tag v0.1.0            # package.json の version に合わせる（v + version）
git push --follow-tags
```

## Phase 1: 前タグ以降の変更を収集する

```bash
LAST=$(git describe --tags --abbrev=0)
git log --oneline "$LAST"..HEAD
git diff --stat "$LAST"..HEAD
```

コミットが多く内容が読み取れない場合は `git show <hash> --stat` や個別 diff で補う。
**コミットメッセージを鵜呑みにせず、diff で実際に何が変わったかを確かめる**（メッセージと実変更がズレていることがある）。

## Phase 2: CHANGELOG.md の [Unreleased] を書く

`CHANGELOG.md` の `## [Unreleased]` 見出しの**直下**に変更内容を書く。書き方の要件:

### 何を書くか（取捨選択）

- **書く**: ユーザーに見える変化すべて。新機能・設定項目の追加/変更・見た目/挙動の変化・バグ修正・既定値の変更・対応OS/言語の変化。
- **書かない**: 内部リファクタ・テスト追加・CI/workflow 変更・docs/ や README のみの変更・依存の更新（挙動が変わる場合を除く）。該当する変更がそれしか無いリリースなら「内部改善のみ」と1行書く。
- 迷ったら基準は「**インストール済みのユーザーが更新して気づく／得をするか**」。

### どう書くか（文体・粒度）

- **読者はエンドユーザー**。コミットメッセージの転記ではなく、ユーザー視点の効果を書く。
  - ❌ `bar-window.js の render-process-gone ハンドラを追加`
  - ⭕ `バーの描画プロセスが異常終了した際、自動で再表示するようにした`
- 関数名・ファイルパス・IPC 名などの内部語彙は使わない。場所を示すなら「設定画面のフッター」「トレイメニュー」などユーザーに見える言葉で書く。
- 1変更 = 1行の箇条書き（`- `）。日本語・常体（「〜を追加」「〜を修正」）。1行は目安 80 字以内。
- 分類は Keep a Changelog に従い、**この順**で必要なものだけ `### 見出し` を立てる（空の分類は書かない）:
  `Added`（新機能） / `Changed`（既存機能の変更） / `Deprecated`（今後廃止予定） / `Removed`（削除） / `Fixed`（バグ修正） / `Security`（脆弱性対応）

### 触ってはいけないもの

- `[Unreleased]` の**上**にある案内 HTML コメント（`<!-- ... -->`）— 位置も内容も変えない（節内に移すとリリース本文へ混入する）。
- 過去バージョンの節（`## [0.1.0]` など）。
- 末尾のリンク定義（`[Unreleased]: https://...` 等）— `npm version` 時に stamp スクリプトが自動更新する。

### 記入例

```markdown
## [Unreleased]

### Added
- 設定画面のフッターにバージョン番号を表示

### Fixed
- スリープ復帰後にカレンダーの予定帯が古いまま残ることがあるのを修正
```

**書き終えたら草稿全文をユーザーに提示し、承認を得る。承認前にコミットしない**（リリースノートは外部公開される文章のため）。

## Phase 3: CHANGELOG をコミットする

承認後:

```bash
git add CHANGELOG.md
git commit -m "changelog: v<次の版> 向けの [Unreleased] を記入"
```

## Phase 4: 版を上げる（npm version）

### レベルの決め方（引数で指定が無い場合は、これで判断して提案→ユーザー確認）

- `patch`: バグ修正・文言修正・見た目の微調整のみ
- `minor`: 機能追加・設定項目の追加・ユーザーに見える挙動の変更
- `major`: 互換性が壊れる変更（設定 JSON のスキーマ非互換・エクスポートしたファイルが旧版で読めない等）

```bash
npm version <patch|minor|major>
```

### 実行後の確認（必ず全部見る）

```bash
git show --stat HEAD        # 版コミットに package.json と CHANGELOG.md の両方が入っている
git tag --list 'v*'         # v<新版> タグができている
```

さらに `CHANGELOG.md` を開き、以下を目視確認:
1. `## [<新版>] - <今日の日付>` 節ができ、Phase 2 で書いた内容がその下にある
2. その上に**空の** `## [Unreleased]` が新設されている
3. 末尾のリンク定義が新版を指している

`stamp-changelog: CHANGELOG.md already has a section for ...` と出た場合は既に同版の節がある異常系 → 停止してユーザーに報告。

## Phase 5: push（＝リリースの実行）

**push した時点で公開プロセスが始まる（取り消しは面倒）。ここは最終確認してから実行する。**

```bash
git push --follow-tags
```

## Phase 6: リリースの確認

GitHub Actions（`build` workflow）が走り、Windows/macOS のビルド後に Release を公開する（数分〜十数分）。

- `gh` CLI があれば: `gh run watch` → 完了後 `gh release view v<新版>` で本文が CHANGELOG の該当節と一致することを確認。
- 無ければユーザーに以下の URL を提示して確認を依頼:
  - Actions: `https://github.com/mu-777/dayglassbar/actions`
  - Release: `https://github.com/mu-777/dayglassbar/releases/tag/v<新版>`

確認ポイントをユーザーに伝える:
1. Release 本文 = CHANGELOG の該当節（案内コメントやリンク定義が混入していない）
2. `.exe`（Setup + portable）と `.dmg` が添付されている
3. 配布ページ（`https://mu-777.github.io/dayglassbar/`）の DL リンクが新版を指す（`releases/latest` を読むので自動。反映はブラウザ再読込で）

## 失敗時の対応

| 症状 | 対応 |
| --- | --- |
| `npm version` が「Git working directory not clean」 | Phase 0 に戻る。未コミット変更を処理してから再実行 |
| Actions のビルドが赤 | run のログを確認。原因が資格情報（Variables/Secrets 未設定）なら該当プロバイダ無効のまま成功するはずなので別原因。修正後は**同じタグを打ち直さず**、修正コミット→ `patch` でもう一段上げて出し直す |
| タグだけ push されて Release が空/失敗 | 修正後に Actions タブから対象タグの workflow を再実行（Re-run all jobs） |
| 間違った内容で push してしまった | 公開済み Release の取り消しはユーザー判断。勝手に `git push --delete` しない。状況を報告して指示を待つ |
