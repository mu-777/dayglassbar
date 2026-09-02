# リリースフローの決定記録

タグを手元から push する方式をやめ、**master に載った版バンプを CI が拾ってタグと Release を作る**方式に変えた経緯・不採用案・逆戻りガード。

関連: [`.github/workflows/release.yml`](../.github/workflows/release.yml) / [`.github/workflows/build.yml`](../.github/workflows/build.yml) / [`.claude/skills/release/SKILL.md`](../.claude/skills/release/SKILL.md)

## 1. きっかけ

クラウドセッション（Claude Code on the web）からリリースしようとして、`git push --follow-tags` が 403 で止まった。実測した内容:

| 操作 | 結果 |
| --- | --- |
| `refs/heads/claude/*` への push | 成功 |
| `refs/heads/master` への push | **403** |
| `refs/tags/v0.2.0` への push | **403** |
| `POST /actions/workflows/build.yml/dispatches` | **403 Resource not accessible by integration** |

`master` に branch protection は掛かっていない（GitHub API で `"protected": false` を確認）。エージェントプロキシも正常（`recentRelayFailures` は空）。つまり GitHub 側の設定ではなく、**セッションに渡される資格情報が ref 単位で制限されている**。

公式ドキュメントで明文化されているのは Routines のページだけだが、web セッションにも同じ制限が効いている（[Repositories and branch permissions](https://code.claude.com/docs/en/routines#repositories-and-branch-permissions)）:

> Claude pushes its work to branches prefixed with `claude/`, which are always accepted. When your prompt directs Claude to push to another branch, Claude Code checks the push first and rejects it if any of the following is true: The branch is protected on GitHub / Someone else has an open pull request from that branch / The branch carries commits authored by someone other than you

この 3 条件のうち成立しうるのは 3 番目（master の履歴に `Claude <noreply@anthropic.com>` 名義のコミットが含まれる）だが、**タグ push も同じく 403 だった**ため、単に `claude/*` 以外の ref を一律で弾いている可能性も同程度にある。**どちらが効いているかは未確定**。

制限を恒久的に外す設定は、調べた範囲では見つからなかった:

- [設定リファレンス](https://code.claude.com/docs/en/settings)にデフォルトブランチ push を許可するキーは無い
- Routines 作成フォームの「Allow unrestricted branch pushes」トグルは公式ドキュメントに記載が無く、ON でも 403 という未解決の報告がある（[anthropics/claude-code#58141](https://github.com/anthropics/claude-code/issues/58141)）
- 「`claude/*` 以外にも push させたい」は要望段階（[#24535](https://github.com/anthropics/claude-code/issues/24535)）

→ **エージェントが起こせる GitHub イベントは「`claude/*` への push」と「PR の作成・更新」だけ**という前提で設計する。

## 2. 採用した形

```
/release スキル
  └─ CHANGELOG を書く → npm version → claude/* に push → PR を作る（ここで停止）
        ↓ 人間がマージ
     release.yml (on: push → master)
        ├─ tag ジョブ: package.json の version を読む
        │    ├─ タグが既存 → 何もせず終了（通常の PR マージはここ）
        │    ├─ extract-changelog --strict で本文の存在を検証（空なら fail・タグを打たない）
        │    └─ v<version> タグを作成して push
        └─ build ジョブ: build.yml を workflow_call で直接呼ぶ → 両OSビルド → Release 公開
```

**リリースの合図を「version 変化」に置いた**のがこの設計の要点。version を上げるのは `/release` スキルだけなので、通常の PR がマージされても tag ジョブは「タグが既にある」で即 no-op になる。マーカーを別に持つ必要がない。

## 3. 不採用案

| 案 | 不採用の理由 |
| --- | --- |
| スキルから `workflow_dispatch` で発火 | **エージェントのトークンに `actions: write` が無い**（実測 403）。`repository_dispatch` も同様に叩けない |
| PR にラベル `release` を付けてゲートにする | ラベルは GitHub UI から誰でも付けられるので「スキル限定」の保証にならない。加えて `pull_request: closed` はどのブランチの workflow ファイルが実行されるかの解釈が絡み、この仕組みを追加する PR 自体で動く保証を検証しないと出せない。`push: branches: [master]` なら常にマージ後の master の内容が使われる |
| `release.yml` に `paths: ['package.json']` フィルタ | CHANGELOG 検証で落ちたあと、`package.json` 以外を直した push でリトライできなくなる。version 未変化の push は tag ジョブが即終了するので、フィルタ無しでも実害がない |
| PAT / GitHub App トークンでタグを push し、`build.yml` を従来どおりタグ起動させる | Secret の発行・管理・失効対応が増える。`workflow_call` で直接呼べば不要 |
| 手元で `git push --follow-tags` を続ける（現状維持） | リリースのたびにローカル環境が必要になり、クラウドセッションからリリースが完結しない |

## 4. 逆戻りガード

- **`build.yml` を「タグ push で起きる」前提に戻さない**。`GITHUB_TOKEN` が作成したタグは workflow を起こさない（[GitHub 公式](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow): "Events triggered by the `GITHUB_TOKEN` will not create a new workflow run"）。`release.yml` から `workflow_call` で直接呼んでいるのはこのため。タグだけできて Release が出ない、という最も気づきにくい壊れ方をする
- **`build.yml` の `push: tags` トリガは残す**。手元からタグを打つ従来経路の保険であり、`pull_request` トリガは `/pr-build` の生命線
- **`extract-changelog.mjs` の `--strict` を外さない**。非 strict は節が空でもフォールバック文字列を返す仕様なので、検証には使えない
- **`release.yml` に `paths` フィルタを足さない**（理由は上の表）
- **`/release` スキルの最終フェーズを `git push --follow-tags` に戻さない**。403 になる

## 5. 制限が外れたら

`master` と `refs/tags/*` への push が通るようになれば、`/release` スキルの Phase 5 を `git push --follow-tags` に戻すだけで従来フローに復帰できる（`build.yml` の `push: tags` トリガを残してあるのはこのため）。`release.yml` は version 未変化なら no-op なので、残したままでも二重リリースにはならない。
