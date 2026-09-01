---
name: pr-build
description: 作業ブランチの PR を用意し、CI がビルドした Windows/macOS バイナリのリンクを PR 本文に貼る。「PR にビルドしたバイナリを付けて」「動作確認用の exe が欲しい」「このブランチの Windows ビルドが欲しい」等の依頼で使う。クラウドセッション（Linux コンテナ）から Windows バイナリを出す唯一の経路。
---

# PR にビルド済みバイナリを付ける

レビュワーが実機で触れる Windows/macOS バイナリを、作業ブランチの PR から辿れるようにする。
**書かれた順に、1フェーズずつ実行する。**

## なぜこの手順なのか（先に読む）

判断を間違えないための前提。ここを飛ばすと不可能なことを試して時間を溶かす。

- **GitHub の PR にバイナリを「添付」することはできない。** PR/Issue コメントへのファイル添付は
  Web UI のドラッグ&ドロップ専用で公開 API が無く、そもそも `.exe` は許可拡張子に入っていない
  （`.zip` は可）。**だから「Artifact へのリンクを PR 本文に貼る」が唯一の形になる。**
- **クラウドセッションのコンテナでは Windows ビルドができない。** `npm run dist:win`（nsis/portable）は
  Linux では **Wine 必須**で入っていない。仮に入れても、OAuth の client_id は gitignore された
  `client-ids.local.json` にしか無いのでカレンダーのクラウド接続が死んだバイナリになるうえ、
  `docs/design.md`「既知の制限」の `electron.exe` 破損の罠を踏みうる。**ローカルビルドは試さない。**
- **エージェントのトークンには Actions の write が無い。** `workflow_dispatch` を叩くと
  `403 Resource not accessible by integration` で落ちる。**dispatch を試さない。**
- したがって **`.github/workflows/build.yml` の `pull_request` トリガ**（PR を作る/更新すると
  windows-latest・macos-latest でネイティブビルドが走る）に乗る。これがこの手順の土台。

## Phase 0: 事前チェック

```bash
git status --porcelain                       # → 空（未コミットの変更を残さない）
git log --oneline origin/master..HEAD        # → PR に載せるコミットの確認
npm test                                     # → 全テスト pass
```

テストが落ちる／作業ツリーが汚れている → **停止してユーザーに報告**（勝手に直さない）。
push 済みでなければ `git push -u origin <branch>` する。

## Phase 1: PR を用意する

まず**既に PR があるか確認する**。このリポジトリではブランチを push した時点で PR が
自動作成されていることがあり、`create_pull_request` は
`A pull request already exists for ...` で失敗する。

```
mcp__github__list_pull_requests(owner, repo, head="mu-777:<branch>", state="all")
```

- 無ければ `mcp__github__create_pull_request` で作る。
- **あれば `mcp__github__update_pull_request` でタイトルと本文を今回の内容に更新する**
  （自動作成の PR は最初のコミット名のままになっている）。

本文の書き方は通常の PR と同じ（変更の概要・検証・手動確認が必要な項目）。
末尾に**プレースホルダの節**を置いておく:

```markdown
## Windows ビルド（動作確認用）

このブランチの HEAD からビルドした Windows バイナリのリンクを、CI 完了後にここへ追記します。
```

## Phase 2: ビルドの完了を待つ

PR の作成／`head` への push で `build` ワークフローが自動で走る。**dispatch はしない**（権限が無い）。

```
mcp__github__actions_list(method="list_workflow_runs", resource_id="build.yml",
                          workflow_runs_filter={branch: "<branch>"})
```

- 目的の run は `head_sha` がブランチ HEAD と一致するもの。`event` は `pull_request`。
- 実績では両OS合わせて**2〜3分**。`status` が `completed` になるまで待つ。
  待ち方は `sleep` ではなく数十秒〜1分おきのポーリング、または `send_later` で自分に
  チェックインを入れる。
- `conclusion` が `success` 以外なら **バイナリのリンクは貼らず**、失敗ジョブのログ
  （`mcp__github__get_job_logs`）を読んで原因をユーザーに報告する。CI を赤いまま放置しない。

## Phase 3: Artifact のリンクを PR 本文に追記

```
mcp__github__actions_list(method="list_workflow_run_artifacts", resource_id="<run_id>")
```

`dayglassbar-win` と `dayglassbar-mac` が取れる。`update_pull_request` で Phase 1 の
プレースホルダを実際のリンクに差し替える。**本文全体を書き直すことになるので、Phase 1 の
本文を手元に持っておくこと**（`update_pull_request` は body の部分更新ができない）。

書式:

```markdown
## Windows ビルド（動作確認用）

このブランチの HEAD（`<short sha>`）を CI でビルドしたもの:

- **[Actions run #<run_number>](<run html_url>)** → ページ下部の Artifacts から取得
  - `dayglassbar-win` … `DayGlassBar Setup <version>.exe`（インストーラ）と
    `DayGlassBar <version>.exe`（portable）
  - `dayglassbar-mac` … `.dmg`（arm64）

ダウンロードには GitHub へのログインが必要で、Artifact は既定で 90 日で失効します。
未署名ビルドなので Windows では SmartScreen の警告、macOS では Gatekeeper の
「壊れているため開けません」が出ます（`docs/macos-signing.md` の回避手順を参照）。
```

## 注意点

- **Artifact の直リンクは配らない。** `download_workflow_run_artifact` が返す URL は数分で失効する
  署名付き URL で、PR 本文に貼っても他人には使えない。**run の `html_url` を貼る。**
- **匿名で踏める URL が要る場合**は Artifact では不可。プレリリース Release を切って
  アセットを付ける必要がある（タグとリリース一覧を汚すので、依頼されたときだけ）。
- **PR に push するたびにビルドが走り直す。** `concurrency` で古い run は打ち切られるので、
  リンクを貼るのは**最後の push の後**にする。貼った後にさらに push したら**リンクを更新する**。
- ビルドに使われる OAuth client_id はリポジトリの Variables/Secrets から注入される。
  未設定ならビルドは通るが該当プロバイダのクラウド接続だけが無効になる（`build.yml` のコメント参照）。
