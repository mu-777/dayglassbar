# DayGlassBar リリース手順

このスキルはリリース一連（CHANGELOG 執筆 → 版バンプ → PR 作成 → マージ後の確認）を実行する。
**書かれた順に、1フェーズずつ実行する。各フェーズの「確認」を満たさない限り次へ進まない。**

前提知識（設計）:
- **版の唯一の正 = `package.json` の `version`**。`app.getVersion()`・インストーラ名・設定画面フッタが全部これを読む。
- **リリースノートの正 = `CHANGELOG.md`**（Keep a Changelog 形式）。
- **リリースの合図は「master に載った version の変化」**。`.github/workflows/release.yml` が master への push で走り、`package.json` の version に対応するタグが未作成なら、CHANGELOG を検証してからタグを作り、`build.yml` を呼んで両OSビルド＋Release 公開まで行う。version が変わっていなければ即 no-op なので、通常の PR マージでは何も起きない。
- `npm version <level>` は `version` フック（`tools/stamp-changelog.mjs`）で CHANGELOG の `[Unreleased]` を `## [x.y.z] - 日付` に置換してから、版コミットを作る。
- **タグは push しない。タグを打つのは CI の仕事**（`release.yml`）。`npm version` がローカルに作るタグは捨てる。
- **エージェントは `master` にも `refs/tags/*` にも push できない**（403）。`claude/*` ブランチへの push と PR 作成だけができる。経緯は `docs/release-flow.md`。

---

## Phase 0: 事前チェック

以下を順に確認する。**1つでも満たさなければ停止してユーザーに報告する**（勝手に直さない）。

```bash
git branch --show-current   # → claude/ で始まる作業ブランチであること
git status --porcelain      # → 空（クリーン）であること
git fetch origin master
git log --oneline HEAD..origin/master   # → 空（origin/master を取り込み済み）であること
git tag --list 'v*'         # → 前タグの確認
npm test                    # → 全テスト pass であること
```

- **master に直接いる場合は停止**。「master へは push できないので `claude/release-<何か>` ブランチを切ってほしい」と報告し、指示を待つ。
- 作業ツリーが汚れている → 停止。未コミット変更の一覧を見せ、コミットするか退避するかユーザーに確認。
- `origin/master` に未取り込みのコミットがある → 停止。マージするかユーザーに確認（版バンプは master の最新の上で行う）。
- テスト失敗 → 停止。失敗出力をそのまま見せる。

タグが `git fetch` で降りてこない場合は `git fetch origin --tags` を明示する（浅いクローンだとタグが無いことがある）。

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
git tag -d v<新版>          # ローカルタグは捨てる。タグを打つのは CI（release.yml）
```

### 実行後の確認（必ず全部見る）

```bash
git show --stat HEAD        # 版コミットに package.json と CHANGELOG.md の両方が入っている
git tag --list 'v*'         # v<新版> が「無い」こと（消し忘れの検出）
node tools/extract-changelog.mjs --strict <新版> | head -20   # CI と同じ検証を先に通す
```

さらに `CHANGELOG.md` を開き、以下を目視確認:
1. `## [<新版>] - <今日の日付>` 節ができ、Phase 2 で書いた内容がその下にある
2. その上に**空の** `## [Unreleased]` が新設されている
3. 末尾のリンク定義が新版を指している

`stamp-changelog: CHANGELOG.md already has a section for ...` と出た場合は既に同版の節がある異常系 → 停止してユーザーに報告。

## Phase 5: PR を作る

**マージした瞬間にリリースが公開される。PR 本文にそう明記する。**

```bash
git push -u origin <作業ブランチ>
```

続けて PR を作成する（GitHub MCP の `create_pull_request`）:

- base: `master` / head: 作業ブランチ
- タイトル: `release: v<新版>`
- 本文: ①この PR をマージすると `release.yml` が `v<新版>` タグを作り Release まで公開される旨 ②`CHANGELOG.md` の該当節をそのまま貼る ③リリース以外の変更も含む場合はその一覧

PR を作ったら**ここで停止し、マージはユーザーに委ねる**。マージ後に Phase 6 へ進む。

既に同じブランチの PR が開いている場合は新規作成せず、既存 PR の本文を更新する（`update_pull_request`）。

## Phase 6: リリースの確認

マージ後、`release` workflow（タグ作成）→ `build` workflow（両OSビルド＋Release 公開）の順に走る（数分〜十数分）。**可能な限り自分で確認まで済ませ、ユーザーに丸投げしない**。

### A. GitHub MCP が使える場合

```
actions_list  method=list_workflow_runs  resource_id=release.yml   # tag ジョブの成否
actions_list  method=list_workflow_runs  resource_id=build.yml     # ビルドと Release
get_release_by_tag  tag=v<新版>                                     # 本文・添付物
```

### B. 公開リポジトリの REST API を curl で叩く

**repo は public なので認証不要。**

```bash
curl -fsSL "https://api.github.com/repos/mu-777/dayglassbar/actions/runs?per_page=5" \
  | grep -E '"name"|"head_branch"|"status"|"conclusion"|"html_url"'

curl -fsSL "https://api.github.com/repos/mu-777/dayglassbar/releases/tags/v<新版>" \
  | grep -E '"draft"|"prerelease"|"published_at"|"browser_download_url"|"size"'
```

### C. どちらも不可なら、ユーザーに URL を提示して確認を依頼

- Actions: `https://github.com/mu-777/dayglassbar/actions`
- Release: `https://github.com/mu-777/dayglassbar/releases/tag/v<新版>`

確認ポイント（A/B で自分が見る場合も、C でユーザーに伝える場合も同じ）:
1. `release` workflow の tag ジョブが緑（赤ならタグは打たれていない）
2. Release 本文 = CHANGELOG の該当節（案内コメントやリンク定義が混入していない）
3. `.exe`（Setup + portable）と `.dmg` が添付されている
4. 配布ページ（`https://mu-777.github.io/dayglassbar/`）の DL リンクが新版を指す（`releases/latest` を読むので自動。反映はブラウザ再読込で）

## 失敗時の対応

| 症状 | 対応 |
| --- | --- |
| `npm version` が「Git working directory not clean」 | Phase 0 に戻る。未コミット変更を処理してから再実行 |
| `master` や `refs/tags/*` への push が 403 | 仕様。Phase 5 の PR 経由に戻す（`docs/release-flow.md`） |
| `release` の tag ジョブが CHANGELOG 検証で赤 | `## [<新版>]` 節が無いか空。CHANGELOG を直して master に入れ直す（PR）。タグは打たれていないので、直った push で自動的に再試行される |
| タグはできたが `build` が赤 | run のログを確認。修正後は**同じタグを打ち直さず**、修正コミット → `patch` でもう一段上げて出し直す |
| タグはできたが Release が無い / `build` が起動していない | `release.yml` の build ジョブの条件か `workflow_call` の記述を疑う。復旧は Actions タブから `build` workflow を対象タグの ref で手動実行（`workflow_dispatch`。**これは人間しか叩けない**） |
| 間違った内容でマージしてしまった | 公開済み Release の取り消しはユーザー判断。勝手にタグや Release を消さない。状況を報告して指示を待つ |
