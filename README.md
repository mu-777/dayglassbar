# DayGlassBar

---

> ⚠️ **【IMPORTANT】THIS README IS FOR DEVELOPERS**  
> For users: see: https://mu-777.github.io/dayglassbar/

---

画面の縁に常駐する細いバーで、一日の区間（例: 9:00〜17:00）の**残り時間**を「グラスの水が減る」ように可視化するアンビエントなデスクトップアプリです。数字や色の変化に頼らず、視界の端で残量を体感することを狙います。

- 中心思想: **促すが、急かさない**
- 対象: **Windows 優先・macOS 両対応**（Linux はスコープ外）
- 形態: 透過オーバーレイ＋トレイ常駐

## 仕組み（ひとめ）

- 区間の残り時間ぶんだけ塗りが縮む（上/下＝右へ、左/右＝下へ）。
- 休憩は残り側にグレー表示。過ぎた休憩は経過分と一緒に消える。
- 常にクリックスルー（展開中も操作の邪魔をしない）。バー上にカーソルを少し留めると拡幅し、広がった幅いっぱいを塗りで埋めて、開始/終了/現在時刻と残り時間を表示。区間外にホバーした場合は「Outside」に加えて次の区間の開始（例: `Next Mon 9:00`）を表示する。設定はトレイメニューから開く。

## 開発

要件は [`docs/spec-v2.md`](docs/spec-v2.md)、設計判断は [`docs/design.md`](docs/design.md)、Claude Code 向けガイドは [`CLAUDE.md`](CLAUDE.md)。

```bash
npm install
npm start     # 開発起動
npm test      # coreのユニットテスト
npm run icons # アイコン再生成（任意・依存ゼロ）
```

### nvm 環境での動作確認

リポジトリに [`.nvmrc`](.nvmrc)（`lts/*`）を同梱しています。nvm は新しいシェルで Node を自動有効化しないため、まず `.nvmrc` のバージョンを有効化します（本アプリは **Node 18 以上**が必要）。

```bash
nvm install   # .nvmrc のバージョンを取得（初回のみ）
nvm use       # .nvmrc のバージョンをこのシェルで有効化
node -v       # v18 以上であることを確認

npm install   # 依存取得（初回・要ネットワーク）
npm test      # coreユニットテスト（GUI不要・どの環境でも可）
npm start     # 開発起動（GUI/ディスプレイが必要）
```

- `npm test` までは GUI 不要のため、CI や WSL/SSH 等でもロジックの動作確認ができます。
- `npm start`（Electron）は表示環境が必要です。WSL で起動する場合は WSLg もしくは X サーバーが要ります（Linux はサポート対象外のため、UI 確認は Windows/macOS 実機で行います）。
- **WSL で `libatk-1.0.so.0: cannot open shared object file` 等で起動失敗する場合**、Electron 実行に必要な GTK 系の共有ライブラリが不足しています。Ubuntu/Debian では一度だけ次を実行します:

  ```bash
  sudo apt-get update
  sudo apt-get install -y \
    libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 libgtk-3-0 \
    libcups2 libxcomposite1 libxdamage1 libgbm1 libnss3 \
    libxrandr2 libasound2 libxshmfence1
  ```

  不足ライブラリは `ldd node_modules/electron/dist/electron | grep "not found"` で確認できます。
- **VS Code のターミナル/タスク等から起動して `cjsPreparseModuleExports … Cannot read properties of undefined (reading 'exports')` で失敗する場合**、`ELECTRON_RUN_AS_NODE=1` が継承されており Electron が「素の Node」として動いています。`env -u ELECTRON_RUN_AS_NODE npm start`（または事前に `unset ELECTRON_RUN_AS_NODE`）で回避できます。素のターミナルからの起動なら通常は不要です。
- WSL では `Failed to connect to the bus (/run/user/1000/bus)` 等の D-Bus 警告がログに出ることがありますが**無害**で、起動・描画には影響しません（同じ理由で **WSL では常駐トレイは出ません**）。
- **WSLg ではバー自体が画面に表示されません**（既知の制限）。アプリの起動・区間判定・レンダラー描画はいずれも正常に動作しますが、WSLg はこの種のウィンドウ（透過・フレームレス・最前面固定・クリックスルーのオーバーレイ）を Windows デスクトップに合成表示しません。**見た目・ホバー展開・クリックスルー・トレイの確認は Windows 実機で行ってください。** WSL で確認できるのは「起動する・`npm test` のロジック・状態計算が正しい」までです。

### 時刻シミュレーション
```bash
DAYGLASSBAR_FAKE_NOW="2026-06-15 16:30" DAYGLASSBAR_TIME_SCALE=60 npm start
DAYGLASSBAR_TIME_OFFSET_MIN=120 npm start
```
（`FAKE_NOW`=起点ローカル時刻 / `TIME_SCALE`=早送り倍率, 0で停止 / `TIME_OFFSET_MIN`=分ずらし）

> **見た目を確認するとき**: OFF にした曜日や区間外はバーが非表示／トラックのみになるのが正常です。既定は全曜日 0:00〜23:59（ほぼ一日中）なのでどの時刻でも区間内に入ります（例: `DAYGLASSBAR_FAKE_NOW="2026-06-15 14:00" DAYGLASSBAR_TIME_SCALE=60 npm start`）。WSL では常駐トレイが出ないため、終了は実行ターミナルで `Ctrl+C` します。

### カレンダー連携（開発）
OAuth 無しで色帯とホバーを目視するには、ダミー予定を注入します:
```bash
DAYGLASSBAR_FAKE_NOW="2026-06-15 14:00" DAYGLASSBAR_FAKE_EVENTS="15:00-15:30 Standup;16:00-16:30 Review" npm start
```
実際の Google / Outlook(クラウド) 接続を試すには OAuth アプリを登録し、資格情報を設定します。**Google「デスクトップアプリ」型は `client_id` と `client_secret` の両方**（Google はトークン交換に secret を要求します。Google 自身は非機密扱い）、**Azure「パブリッククライアント」型は `client_id` のみ**です。値は `src/main/calendar/config.js` に集約してあり、`client-ids.local.example.json` を `client-ids.local.json` にコピーして記入（gitignore 済み・キー `google`/`google_secret`/`microsoft`）するか、環境変数 `DAYGLASSBAR_GOOGLE_CLIENT_ID` / `DAYGLASSBAR_GOOGLE_CLIENT_SECRET` / `DAYGLASSBAR_MS_CLIENT_ID`（env が優先）で渡します。実値はリポジトリに置かない方針です。登録手順・設計判断は [`docs/calendar-integration.md`](docs/calendar-integration.md)。

## ビルド（配布物）

`electron-builder` で `dist/` に出力します。コード署名は未設定。

```bash
npm run dist:win    # Windows: NSIS インストーラ + portable
npm run dist:mac    # macOS: dmg（macOS 上でのみ実行可能）
npm run dist        # 実行中のOS向け
```

macOS の dmg は macOS 上でしか生成できません。WSL/Linux からビルドできるのは Windows 版のみで、macOS 版および両OS一括は GitHub Actions（後述）で生成します。

### Windows 版を WSL でビルドする

WSL（Ubuntu/Debian）で Windows 配布物を生成するには Wine を使います。

```bash
# 1. Wine を導入（初回のみ）
sudo dpkg --add-architecture i386
sudo apt-get update
sudo apt-get install -y wine64 wine32   # ディストリによっては wine

# 2. ビルド
npm run dist:win
```

- 出力: `dist/DayGlassBar Setup <version>.exe`（NSIS インストーラ）と `dist/DayGlassBar <version>.exe`（portable）。
- 初回は electron-builder が NSIS 等のツールを `~/.cache/electron-builder` に取得します（要ネットワーク）。
- `/mnt/c/...`（Windows ドライブ）上では I/O が遅く、権限/シンボリックリンク絡みで失敗することがあります。その場合は Linux 側ホーム（例: `~/dayglassbar`）にクローンしてビルドします。
- **生成した `.exe` が Windows で「このアプリはお使いの PC では実行できません」で起動しない場合**、ベースの `electron.exe` がダウンロード/展開途中で壊れていることがあります（生成された `dist/win-unpacked/DayGlassBar.exe` が `~/.cache/electron/electron-*-win32-x64.zip` 内の `electron.exe` より小さい＝欠損）。`rm -rf ~/.cache/electron && npm run dist:win` で取り直して再ビルドします。PE ヘッダだけ見ると正常に見えるので注意。

### GitHub Actions でビルドする

[`.github/workflows/build.yml`](.github/workflows/build.yml) が `windows-latest` / `macos-latest` ランナーでそれぞれネイティブにビルドします。`npm ci` を使うため `package-lock.json` をコミットしておきます。

- **手元確認用ビルド**: Actions タブ → `build` → *Run workflow*。Release は作られず、各 run の Artifacts（`dayglassbar-win` / `dayglassbar-mac`）から `.exe` / `.dmg` をダウンロードします。Artifacts を閲覧できる範囲はリポジトリの可視性に従います（public は誰でも閲覧できます）。
- **配布用ビルド**: `v*` タグを push すると両OSをビルドし、GitHub Release に `.exe` / `.dmg` を添付します。**リリース本文は [`CHANGELOG.md`](CHANGELOG.md) の該当バージョンの節**を workflow が抜き出して自動で入れます（下記「リリース手順」）。
- **カレンダーの資格情報**: ローカルの `client-ids.local.json` は gitignore のため CI には渡りません。配布物で接続を有効にするには、GitHub の Settings → Secrets and variables → Actions に登録します — **Variables**: `DAYGLASSBAR_GOOGLE_CLIENT_ID` / `DAYGLASSBAR_MS_CLIENT_ID`、**Secrets**: `DAYGLASSBAR_GOOGLE_CLIENT_SECRET`（Google のトークン交換に必要）。workflow がビルド前に `client-ids.local.json` を生成して同梱します。未登録ならビルドは成功し、該当プロバイダの接続のみ無効になります。詳細は [`docs/calendar-integration.md`](docs/calendar-integration.md)。

#### リリース手順

バージョンの唯一の正は `package.json` の `version` です（Electron の `app.getVersion()`／インストーラのファイル名／設定ウィンドウのフッタ表示がすべてこれを読みます）。リリースノートの正は [`CHANGELOG.md`](CHANGELOG.md)（[Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) 形式）。両者とタグを食い違わせないため、次の順で行います。

1. **`CHANGELOG.md` の `## [Unreleased]` 節に変更点を書く**（前タグからの差分をもとに埋める。分類は Added / Changed / Fixed 等）。この執筆は Claude Code に「前タグ以降の変更を `CHANGELOG.md` の `[Unreleased]` に追記して」と依頼するのが早い（自動生成ではなくレビュー前提の手動トリガ）。書けたら通常どおりコミットします。
2. **`npm version patch`**（`minor` / `major` も可）を実行。`package.json` を上げ、`version` フックの [`tools/stamp-changelog.mjs`](tools/stamp-changelog.mjs) が `[Unreleased]` を `## [x.y.z] - YYYY-MM-DD` に置き換えて新しい空の `[Unreleased]` を作り、`package.json` と `CHANGELOG.md` を含む版コミット＋`v<x.y.z>` タグを一括生成します。
3. **`git push --follow-tags`** で push → Actions が両OSをビルドし、[`tools/extract-changelog.mjs`](tools/extract-changelog.mjs) がタグに対応する `CHANGELOG.md` の節を抜き出して Release 本文にして公開します。

```bash
# 1. CHANGELOG.md の [Unreleased] を埋めてコミット（Claude Code に依頼可）
# 2〜3:
npm version patch        # 0.1.0 → 0.1.1。CHANGELOG を stamp し、版コミット＋v0.1.1 タグを作る
git push --follow-tags   # push → Actions がビルド＆該当節を本文にして Release 公開
```

初回リリース（`v0.1.0`）は `package.json` が既に `0.1.0`・`CHANGELOG.md` の `[0.1.0]` も記入済みのため、バンプ不要でタグだけ打ちます: `git tag v0.1.0 && git push --follow-tags`。

未署名のため、配布先では Windows は SmartScreen の「詳細→実行」、macOS は右クリック→「開く」（または `xattr -dr com.apple.quarantine <App>` で隔離属性を解除）が必要です。

## 紹介・配布ページ（GitHub Pages）

紹介とダウンロードのための静的サイトを [`web/`](web/) に置き、GitHub Pages で公開します（英語/日本語のライブ切替）。公開 URL は `https://mu-777.github.io/dayglassbar/`。

- 公開: [`.github/workflows/pages.yml`](.github/workflows/pages.yml) が `web/` をそのまま Pages にアップロードします（ビルド工程なし）。`web/` を変更した push、または *Run workflow* で実行。**一度だけ** リポジトリの Settings → Pages → Source を「GitHub Actions」に設定します。
- ダウンロードリンク: ページの JS が `releases/latest` を GitHub API で読み、`v*` タグで GitHub Actions が公開した**最新リリースの `.exe`/`.dmg` を自動反映**します（リリースごとの手編集は不要）。リポジトリが **public** であることが前提。
- 画像: ヒーローとホバー説明は SVG モックアップで仮置きしてあります。実スクリーンショットへの差し替え手順は [`web/README.md`](web/README.md)。
- OG カード（SNS 共有時のプレビュー画像）: `web/assets/og.png`（1200×630）。`npm run og`（[`tools/gen-og.mjs`](tools/gen-og.mjs)）で再生成します。

## 初期設定（インストール直後）

初回起動は曜日・時刻に関係なく必ずバーが見えるようにしてあります。

- 言語: 初回起動時は **OS の表示言語から自動選択**（日本語 Windows/macOS → 日本語、中国語 → 中文（簡体）、それ以外 → English）。対応言語は English・日本語・中文（簡体）。設定画面でいつでも変更でき、一度変更・保存すればその言語が維持されます（以後は OS 言語に追従しません）。
- スケジュール: 月〜日すべて **0:00〜23:59（ほぼ一日中）**（昼休憩 12:00〜13:00）。**土日も有効**。どの時刻にインストールしても区間内に入り、バーの水位が見えるようにするため（区間は 24 時間ちょうどは不可＝1 分未満のすき間は下地のみ表示）。
- 下地（軸全長のうす表示）: **表示する**。
- 目盛り: **表示する**（1時間ごと）。
- 太さ: **16px**。
- 辺: **右**。

いずれも設定画面で変更できます。**初回起動時は設定画面が自動で開きます**（バーはクリックスルーで、それ自体には UI がないため）。設定画面には、次回以降の開き方を案内する一度きりのヒントが表示されます。

**設定画面はいつでもタスクトレイのアイコンから開けます**（右クリックでメニュー、またはダブルクリック）。Windows ではアイコンが「^」（隠れているインジケーター）の中に入っていることがあります。常に見えるようにするにはタスクバーへピン留めしてください。アイコンにカーソルを合わせると「右クリックで設定」と表示されます。

## 言語（English / 日本語 / 中文）

UI（設定画面・トレイメニュー・バーのホバーラベル）は英語・日本語・中文（簡体）に対応します。初回起動時は OS の表示言語から自動選択されます（日本語→日本語、中国語→中文（簡体）、それ以外→英語）。設定画面の「General / 全般」セクションの言語ドロップダウンで切り替えると、保存しなくてもプレビューが即座に切り替わり、「保存して適用」で確定します。一度保存すればその言語が維持されます。

## 設定のエクスポート／インポート

設定はローカルの JSON ファイルに書き出し・読み込みできます（クラウド連携はありません）。設定画面フッターのボタンを使います。

- **エクスポート**: 「エクスポート」を押し、保存先を選ぶと現在の設定を JSON で書き出します。
- **インポート**: 「インポート」を押して JSON を選ぶと、検証に通った場合のみ即時に適用・保存されます。形式が不正・破損したファイルは適用されず、画面にエラーが表示されます。
- **初期設定に戻す**: 「初期設定に戻す」を押すと確認ダイアログの後、スケジュール・外観・動作などの設定のみが初期値に戻ります。**カレンダーの接続（サインイン）は保持されます**（`calendar-accounts.enc` は対象外）。

## カレンダー連携（Google / Outlook）

カレンダーを連携すると、**設定した区間内に予定がある時間帯がバー上で別色**になります。通常はその色変化だけで、**バーにホバーすると予定タイトル**が表示されます（幅が足りなければ省略）。色付けは休憩と同じく「残り側」だけで、過ぎた予定は経過分と一緒に消えます。終日予定・辞退した予定・「空き時間」表示の予定は対象外です。

設定 → 「カレンダー / Calendar」セクションで、**Google と Outlook をそれぞれ**オン/オフでき、**色も別々**に設定できます。

- **Google** — 「Show Google Calendar events」をオンにし、「Connect Google」で既定ブラウザ認証。
- **Outlook** — 「Show Outlook events」をオンにし、**接続方法をどちらか一つ**選びます:
  - **ローカル（サインイン不要）** — この PC の**クラシック Outlook（デスクトップ版）**の予定をそのまま読みます。サインイン・管理者承認・クラウド経由いずれも不要。職場アカウントでも可。※Windows＋クラシック版のみ（「新しい Outlook」/ Web 版では使えません）。
  - **クラウドAPI（サインイン）** — **現在は未対応**です（接続ボタンは無効）。企業アカウントは IT 管理者の承認が必要なことが多く、テナントの用意も難しいためです。Outlook はローカル接続をご利用ください。

許可するとそのプロバイダの表示が自動 ON になります。「Disconnect」で解除（認証情報を破棄）。

- **表示するカレンダーを選ぶ（複数可）**: アカウントに副カレンダーや共有カレンダーが複数あるとき、**どれを表示するか**を選べます。各プロバイダの「表示するカレンダーを選択」を押すとカレンダー一覧が出るので、表示したいものにチェックします（チェックした瞬間に反映・保存。Outlook ローカルはこの PC のクラシック Outlook が見えているカレンダーフォルダが対象）。**何もチェックしない場合はプライマリ（既定）カレンダーのみ**表示します。
- **更新の速さ**: カレンダー側で予定を追加/変更/削除すると、**Google は約1分以内**にバーへ反映されます（Outlook ローカルは約5分間隔）。スリープから復帰したときは即座に再取得します。取得が一時的にすべて失敗した場合（オフライン・トークン失効・Outlook 起動待ちなど）は、色帯が消えず**直前に取得できた予定を表示し続けます**。
- **接続の問題**: Google/Outlook クラウドの接続でトークン失効などの問題が起きると、設定画面の該当プロバイダの接続欄に警告文が表示されます（「Disconnect」→「Connect」で再接続してください）。
- **プライバシー**: OAuth のサインイン情報（リフレッシュトークン）と**表示カレンダーの選択**は OS の安全な保管領域で暗号化し、この端末にのみ保存します（`calendar-accounts.enc`）。**設定のエクスポートには含まれません**（Google のカレンダー ID はメールアドレスになり得るため、選択もエクスポート対象外にしています）。表示設定（オン/オフ・色・Outlook の接続方法）は秘匿情報ではないため `settings.json`（エクスポート対象）に保存されます。予定はクラウドへ送らず、表示のために定期取得するだけです。

## 困ったとき（診断情報の保存）

不具合や挙動の問題があったときの解析用に、ログ・環境情報・現在の設定を**1つの `.zip` にまとめて保存**できます。設定画面フッターの「**診断情報を保存**」を押し、保存先を選ぶと作成され、保存後にそのフォルダが開きます。クラウド送信はしません（作成した zip の送付方法は任意です）。

zip には OAuth のサインイン情報（トークン/アカウント）は**含まれません**（`calendar-accounts.enc` は読み取りません）。

アプリは動作ログを `userData/logs/main.log`（古いものは `main.log.1`/`.2`）に記録しており、上の zip にこのログが含まれます。再現手順を詳しく記録したいときは、環境変数 `DAYGLASSBAR_DEBUG=1` を付けて起動すると詳細ログ（debug レベル）になります。

## バージョン確認

インストールしたアプリのバージョンは、**設定画面フッター（保存ボタンの下）に「バージョン x.y.z」**として表示されます（診断 zip の `environment.json`・`main.log` の起動行にも記録されます）。不具合報告の際はこの番号を添えてください。

同じ行の「更新を確認」ボタンで、GitHub の最新リリースと比較できます。**手動でボタンを押したときだけ**GitHub API を1回呼び出し、結果を文言またはリンクで表示します（自動チェック・通知・バッジは出しません）。新しいバージョンがあれば結果欄のリンクからリリースページを開けます。

## 設定ファイルの場所

`settings.json` は OS 標準のユーザーデータ領域（Electron `userData`）に保存されます。ログも同じ領域の `logs/` 配下に保存されます。

| OS | パス |
| --- | --- |
| Windows | `%APPDATA%\DayGlassBar\settings.json`（ログは `%APPDATA%\DayGlassBar\logs\main.log`） |
| macOS | `~/Library/Application Support/DayGlassBar/settings.json`（ログは `~/Library/Application Support/DayGlassBar/logs/main.log`） |

破損時は自動的にデフォルトへフォールバックします（消せば初期化）。

## Windows 実機 確認チェックリスト

自動テストは core ロジックのみ。GUI・常駐挙動は実機確認が必要です。

| 項目 | 期待 |
| --- | --- |
| クリック素通し | 通常時も展開中も、バー上をクリック/ドラッグしても背後のアプリが反応する（展開してもクリックを奪わない） |
| 常時最前面 | 他ウィンドウをバーの位置へ移動・アクティブ化しても、バーが前面に出続ける（下に潜らない） |
| ホバー展開・収納 | カーソル滞留で拡幅（広がった幅いっぱいが塗りで埋まる）→離脱で細バーに戻る |
| ホバー: 区間外 | 区間外にホバーすると「Outside」ラベルに加え、次の区間の開始（例: `Next Mon 9:00`。同日なら曜日なしで時刻のみ）が表示される |
| ワークエリア配置 | タスクバーと重ならず、画面端に張り付く |
| マルチディスプレイ | 指定ディスプレイに表示／外すとプライマリへ／戻すと復帰 |
| 初回起動の案内 | まっさらな状態での初回起動時のみ設定画面が自動で開き、トレイから再度開ける旨のヒントと、**ログイン時に自動起動する旨の説明（設定でオフにできる）**が出る。2回目以降は自動で開かない（`userData/onboarded` センチネルで判定） |
| 初回起動の言語 | 日本語 Windows でまっさらな初回起動→設定画面が日本語で開く。言語を変更して保存→以後はその言語が維持される（OS 言語に追従しない） |
| トレイ | アイコン常駐・メニューから設定/終了・左クリックまたは右クリックでメニュー表示・ダブルクリックで設定・ホバーで「右クリックで設定」のツールチップ |
| トレイの区間表示 | 先頭行が今いる区間を示す。前日からの夜跨ぎ区間が稼働中なら開始日の曜日とレンジ（既定の英語では例 `Sunday: 9:00–27:00`、日本語では `日曜: 9:00〜27:00`）、区間外なら当日の設定（`Today: …`／`Today: Off`）を表示。文言は選択中の言語に追従 |
| 言語切替 | 設定の言語ドロップダウンで英/日/中を選ぶと、設定画面・トレイ・バーのホバーラベルが切り替わる（ドロップダウンは保存前でもプレビュー反映） |
| バージョン表示 | 設定画面フッター（保存ボタンの下）に `package.json` の版が「バージョン x.y.z」で出る・言語切替に追従 |
| 更新を確認 | バージョン表示の隣の「更新を確認」ボタンを押すと GitHub の最新リリースと比較し、結果（最新です／新しいバージョンがあります＋リンク／失敗）が表示される |
| 自動起動 | **既定 ON**（初回に自動登録・オンボーディングで説明／オフにするとログイン項目が解除される）。ONでログイン時に起動。**portable 版**（`DayGlassBar <version>.exe`）でも次回ログイン時に正しく起動する（`PORTABLE_EXECUTABLE_FILE` のパスが登録される。インストーラ版とは異なり自己展開のため要確認） |
| スリープ復帰 | 復帰後、現在時刻に正しく追従（位置が飛ぶ/ずれない） |
| 多重起動 | 2つ目の起動は既存の設定画面を開くだけ |
| DPI | 高DPI/スケーリング変更でにじみ・サイズ崩れがない |
| 日跨ぎ | 13:00〜25:00 等で 0時を越えても連続表示・25:00表記 |
| エクスポート/インポート | 保存ダイアログで JSON 出力／開くダイアログで読み込み、正しいものは即適用・不正なものはエラー表示で未適用 |
| 初期設定に戻す | フッターの「初期設定に戻す」→確認ダイアログでOK→設定が初期値に戻る（カレンダーの接続は保持される） |
| カレンダー: Google | Show Google + Connect Google → ブラウザ認証 → 区間内の予定が Google 色の帯になる・ホバーでタイトル |
| カレンダー: Outlook ローカル | Show Outlook + 接続方法「ローカル」、クラシック Outlook 起動中 → その予定が Outlook 色の帯になる・開始から 1 時間超経過した進行中の予定も残り側の帯が消えない（Windows・新Outlook/Web は対象外） |
| カレンダー: Outlook クラウド | 接続方法「クラウドAPI」を選ぶと未対応の説明が出て Connect Microsoft が無効化される（現状の挙動。トグル自体は残す） |
| カレンダー: カレンダー選択 | 「表示するカレンダーを選択」で一覧が出る（Google=接続後／Outlook=ローカル）→ チェックしたカレンダーの予定だけが帯になる・未チェックなら primary/既定のみ・チェック変更が即反映される |
| カレンダー: 色分け | Google と Outlook を両方表示したとき、それぞれ設定した色で塗り分けられる |
| カレンダー: 取得失敗時の保持 | ネットワークを切断する等で取得が失敗しても、直前に取得できた予定の色帯が消えずに残る（次に成功すると更新される） |
| カレンダー: 接続エラー表示 | Google/Outlook クラウドのトークンを無効化する等で接続に問題が起きると、設定画面の該当プロバイダ欄に警告文が出る |
| カレンダーの秘匿 | エクスポートした JSON に OAuth トークン/メール/**表示カレンダーの選択**が含まれない（`calendar-accounts.enc` 側にのみ暗号化保存）。表示設定（オン/オフ・色・method）は JSON に含まれる |

## FAQ

- **赤くなったり点滅したりしないの?** しません。「急かす」表現は意図的に排しています（塗りの長さだけが減ります）。
- **ポモドーロや通知は?** スコープ外です。これは残量を“感じる”ための表示専用ツールです。
- **カレンダー連携は?** 対応します（区間内の予定を色帯で表示・ホバーでタイトル）。**Google**（OAuth）と **Outlook（ローカル接続）** をそれぞれ表示オン/オフ・色設定でき、**複数カレンダーがある場合は表示するものを選べます**（未選択ならプライマリのみ）。Outlook の**クラウドAPI は現在未対応**（トグルは残してありますが接続ボタンは無効）。上の「カレンダー連携」を参照。
- **会社の Outlook（企業アカウント）でも使える?** クラウドAPI（OAuth）接続は多くの場合 IT 管理者の承認が必要で、現在は未対応にしています。**クラシック Outlook を入れている PC で「ローカル」接続**を選んでください（サインイン不要で職場アカウントの予定も読めます）。「新しい Outlook」/ Web 版のみの環境では現状ローカル読み取りもできません。
- **ICS（カレンダーの公開URL）は使えないの?** 一度実装しましたが**外しました**。ICS フィードは提供側（Google/Outlook）のキャッシュで更新が数時間〜最大1日遅れ、仕事中の予定変更に十分速く追従できないためです（詳細は [`docs/calendar-integration.md`](docs/calendar-integration.md) 決定0）。

## 支援（寄付）

DayGlassBar は無料です。気に入って開発を応援したい場合は、Ko-fi から任意で寄付できます（任意・donor 側のアカウント不要）。

- Ko-fi: https://ko-fi.com/mu_777

アプリ内では設定ウィンドウのヘッダ右上の「Support me on Ko-fi」リンク（Ko-fi のカップアイコン付き）から、GitHub リポジトリの「Sponsor」ボタンからも開けます。寄付を促す通知・ポップアップ・カウントダウンは出しません（中心思想「促すが、急かさない」に沿った静かなリンクのみ）。

## ライセンス
MIT License（[LICENSE](LICENSE)）。名前「DayGlassBar」とアイコンはブランドとして扱い、ライセンスの許諾対象には含めない。同梱の Ko-fi シンボル画像は Ko-fi のブランド資産（`web/assets/LICENSE.md` 参照）。
