# DayGlassBar

画面の縁に常駐する細いバーで、一日の区間（例: 9:00〜17:00）の**残り時間**を「グラスの水が減る」ように可視化するアンビエントなデスクトップアプリです。数字や色の変化に頼らず、視界の端で残量を体感することを狙います。

- 中心思想: **促すが、急かさない**
- 対象: **Windows 優先・macOS 両対応**（Linux はスコープ外）
- 形態: 透過オーバーレイ＋トレイ常駐

## 仕組み（ひとめ）

- 区間の残り時間ぶんだけ塗りが縮む（上/下＝右へ、左/右＝下へ）。
- 休憩は残り側にグレー表示。過ぎた休憩は経過分と一緒に消える。
- 常にクリックスルー（展開中も操作の邪魔をしない）。バー上にカーソルを少し留めると拡幅し、広がった幅いっぱいを塗りで埋めて、開始/終了/現在時刻と残り時間を表示。設定はトレイメニューから開く。

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

> **見た目を確認するとき**: 休日（OFF日）や勤務時間外はバーが非表示／トラックのみになるのが正常です。バーの描画・ホバー展開を確認したいときは勤務時間内を指定します（例: `DAYGLASSBAR_FAKE_NOW="2026-06-15 14:00" DAYGLASSBAR_TIME_SCALE=60 npm start` — 月曜 9:00〜17:00 の区間内）。WSL では常駐トレイが出ないため、終了は実行ターミナルで `Ctrl+C` します。

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
- **配布用ビルド**: `v*` タグを push すると両OSをビルドし、GitHub Release に `.exe` / `.dmg` を添付します。

```bash
git tag v0.1.0
git push origin v0.1.0
```

未署名のため、配布先では Windows は SmartScreen の「詳細→実行」、macOS は右クリック→「開く」（または `xattr -dr com.apple.quarantine <App>` で隔離属性を解除）が必要です。

## 初期設定（インストール直後）

初回起動は曜日・時刻に関係なく必ずバーが見えるようにしてあります。

- スケジュール: 月〜日すべて 9:00〜17:00（昼休憩 12:00〜13:00）。**土日も有効**。
- 下地（軸全長のうす表示）: **表示する**。
- 目盛り: **表示する**（1時間ごと）。
- 太さ: **16px**。
- 辺: **右**。

いずれも設定画面で変更できます。

## 設定のエクスポート／インポート

設定はローカルの JSON ファイルに書き出し・読み込みできます（クラウド連携はありません）。設定画面フッターのボタンを使います。

- **エクスポート**: 「エクスポート」を押し、保存先を選ぶと現在の設定を JSON で書き出します。
- **インポート**: 「インポート」を押して JSON を選ぶと、検証に通った場合のみ即時に適用・保存されます。形式が不正・破損したファイルは適用されず、画面にエラーが表示されます。

## 設定ファイルの場所

`settings.json` は OS 標準のユーザーデータ領域（Electron `userData`）に保存されます。

| OS | パス |
| --- | --- |
| Windows | `%APPDATA%\dayglassbar\settings.json` |
| macOS | `~/Library/Application Support/dayglassbar/settings.json` |

破損時は自動的にデフォルトへフォールバックします（消せば初期化）。

## Windows 実機 確認チェックリスト

自動テストは core ロジックのみ。GUI・常駐挙動は実機確認が必要です。

| 項目 | 期待 |
| --- | --- |
| クリック素通し | 通常時も展開中も、バー上をクリック/ドラッグしても背後のアプリが反応する（展開してもクリックを奪わない） |
| 常時最前面 | 他ウィンドウをバーの位置へ移動・アクティブ化しても、バーが前面に出続ける（下に潜らない） |
| ホバー展開・収納 | カーソル滞留で拡幅（広がった幅いっぱいが塗りで埋まる）→離脱で細バーに戻る |
| ワークエリア配置 | タスクバーと重ならず、画面端に張り付く |
| マルチディスプレイ | 指定ディスプレイに表示／外すとプライマリへ／戻すと復帰 |
| トレイ | アイコン常駐・メニューから設定/終了・ダブルクリックで設定 |
| トレイの区間表示 | 先頭行が今いる区間を示す。前日からの夜跨ぎ区間が稼働中なら開始日の曜日とレンジ（例: `日曜: 9:00〜27:00`）、区間外なら当日の設定（`今日: …`／`今日: 休み`）を表示 |
| 自動起動 | ONでログイン時に起動 |
| スリープ復帰 | 復帰後、現在時刻に正しく追従（位置が飛ぶ/ずれない） |
| 多重起動 | 2つ目の起動は既存の設定画面を開くだけ |
| DPI | 高DPI/スケーリング変更でにじみ・サイズ崩れがない |
| 日跨ぎ | 13:00〜25:00 等で 0時を越えても連続表示・25:00表記 |
| エクスポート/インポート | 保存ダイアログで JSON 出力／開くダイアログで読み込み、正しいものは即適用・不正なものはエラー表示で未適用 |

## FAQ

- **赤くなったり点滅したりしないの?** しません。「急かす」表現は意図的に排しています（塗りの長さだけが減ります）。
- **ポモドーロや通知は?** スコープ外です。これは残量を“感じる”ための表示専用ツールです。
- **カレンダー連携は?** v2 で ICS 購読、v3 で OAuth を予定（[`docs/spec-v2.md`](docs/spec-v2.md) §4.6, §8）。

## ライセンス
未定（現状 `UNLICENSED` / private）。
