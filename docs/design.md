# DayGlassBar 設計メモ

要件は `docs/spec-v2.md`。ここでは「なぜこの実装にしたか」を記録する。

## 技術スタック: Electron

| 観点 | Electron | Tauri | ネイティブ(Win+mac個別) |
| --- | --- | --- | --- |
| クリックスルー＋ホバー検知 | ◎ `setIgnoreMouseEvents` ＋ screen API が素直 | △ プラグイン/自前実装が必要 | ◎ ただし二重実装 |
| Win/mac 同一コード | ◎ | ○ | ✕ |
| 作者の習熟（JS/React） | ◎ | △(Rust) | △ |
| メモリ | △ 150MB級 | ◎ 軽量 | ◎ |

- 透過・最前面・フレームレス・クリックスルーの常駐オーバーレイを **1つのコードで Win/mac 両対応**でき、作者の JS 習熟に合う Electron を採用。
- メモリ 150MB 級は個人用途として許容と合意済み。

## ホバー検知方式（forward:true を主役にしなかった理由）

**採用: メインプロセスでのグローバルカーソル・ポーリング。**

- 当初案は `setIgnoreMouseEvents(true, { forward: true })` でレンダラに `mousemove` を転送して滞留を検知する方式だった。これは引き続き**保険として併用**するが、展開トリガの主役にはしていない。
- 理由:
  - `forward` 由来のマウスイベントは OS/バージョンで挙動差があり、「滞留(dwell)」の安定計測には不向き。
  - 拡幅でウィンドウ自体がカーソル下に広がるため、レンダラ基準のイベントだけだと収納判定が不安定になりやすい。
  - メイン側で `screen.getCursorScreenPoint()` を**アイドル250ms / 近傍60ms**でポーリングし、バー矩形内の滞留 `dwellMs` で展開、**2連続の外側検出**で収納とする方が、展開/収納の状態をメイン側の一箇所に集約できて確実（入力透過は常時 true 固定なので切替対象ではない）。
- コスト: 常時タイマ。ただしアイドル時 250ms 間隔は軽微で、要件6（カリカリ不要）の範囲。

## クリックスルーと展開（入力は常に素通し）

- **常に** `setIgnoreMouseEvents(true, { forward: true })`（全入力を素通し）。生成時に一度だけ設定し、展開・収納でこのフラグは切り替えない。
- 展開で変えるのは**ウィンドウのサイズだけ**で、入力透過は維持する。ホバーで拡幅した瞬間でも、バー直下のアプリへのクリック/ドラッグ/スクロールはそのまま貫通する。
- 設定画面は**トレイメニュー**から開く。当初は「展開中のクリックで設定を開く」方式だったが、ホバーが背後アプリの入力を奪う（縁のクリックを食う）問題があり、**入力を常時素通しする方針に変更**した（`setIgnoreMouseEvents(false)` への切替・レンダラの click→openSettings は廃止）。**逆戻りガード**: 「展開時にクリックを受けたい」と再びトグルを足さないこと（要件のクリックスルー＝邪魔をしないに反する）。
- 展開時の描画: 拡幅した幅を塗りで**全面**埋め、ラベルはその上に重ねる（`src/renderer/bar/bar.js`）。細い帯を中央に出す旧方式は、ウィンドウが広いのにバーだけ細く見えて分かりにくいため廃止した。
- リサイズ: `resizable:false` だと一部環境で `setBounds` のサイズ変更が無視されるため、`setResizable(true)` →`setBounds`→`setResizable(false)` で囲って回避。

## 最前面の維持（再宣言ポーリング・逆戻りガード）

`alwaysOnTop` は**生成時に一度だけでは不十分**で、根拠の異なる2つの事実への対処が要る。

1. **明示レベルを渡す**: Electron v7 以降、レベル未指定だとフォーカスを失った時に top-most が外れる回帰がある。`setAlwaysOnTop(true, 'screen-saver')` のように**明示レベル**を渡すのが既知の回避策（electron/electron#20933）。これは生成時から実施済み。
2. **再宣言ポーリング**: フラグを立てても、Windows は top-most 同士の重なりを許す仕様で、透過・フレームレスのオーバーレイは他ウィンドウのアクティブ化で**静かに背後へ回る**ことがある。「被った」を知るイベントは無く、"super top-most" フラグも存在しない（Raymond Chen "Old New Thing" 2011-03-10）。そこで定石どおり `setAlwaysOnTop` を**タイマで再適用**する（electron/electron#2097）。本実装は専用タイマを足さず、**既存のカーソル監視ポーリング**（アイドル250ms/近傍60ms）から `raise()` を呼ぶ。表示開始時のみ `pushState` から即時に1回。

- **必ず `true` の再設定のみ**。`false`→`true` のトグルは**他アプリの top-most を奪う**ため使わない（electron/electron#31536）。`setAlwaysOnTop(true,…)` は NOACTIVATE 相当でフォーカスも奪わず、`showInactive` の常駐方針やクリックスルー/ホバー展開と干渉しない。
- **この再宣言ポーリングは「冗長」に見えても削らない**（消すと潜る挙動が再発する）。`bar-window.js` の `raise()` を参照。
- **原理的な限界**: 上記#2のとおり、他の "より上" を狙う常駐アプリや排他フルスクリーンには勝てない（OS仕様。後述「既知の制限」）。「すべての通常ウィンドウより前面」は満たすが、絶対的な最前面保証ではない。
- **経緯・代替案（blur/ネイティブ）の不採用理由・実在リポジトリでの裏取り・問題が出たときの手順は `docs/always-on-top.md`（決定記録・逆戻りガード）**。

## 座標系

- 配置計算はすべて **DIP（Electron screen API 空間）**。`workArea`（タスクバー等を除いた領域）基準（spec 4.2）。
- レンダラ側の Canvas のみ `devicePixelRatio` でバッキングストアを拡大して描画（`bar.js`）。

## 時間の扱い（最重要の不変条件）

- バー位置は**毎回 `timeSource.now()` から再計算**。経過時間を積算しない。
- これによりスリープ復帰・NTP補正・手動時刻変更が自動的に正しくなる（spec 4.5）。
- `timeSource` は env で差し替え可能（spec 7 / `src/core/time-source.js`）。

## IPC 一覧

| チャネル | 種別 | 用途 |
| --- | --- | --- |
| `settings:get` | invoke | 現在の設定を取得 |
| `settings:validate` | invoke | 設定候補を検証（保存しない） |
| `settings:save` | invoke | 検証OKなら保存（→onChangeでバー即時反映） |
| `settings:export` | invoke | `showSaveDialog` で選んだ JSON ファイルへ現在の設定を書き出す（ローカルファイルのみ） |
| `settings:import` | invoke | `showOpenDialog` で選んだ JSON を読み、`validateSettings` OK なら `store.save`（→onChangeで反映）。不正/破損時は何も適用しない |
| `displays:list` | invoke | ディスプレイ一覧（id/primary/label） |
| `bar:open-settings` | send | バーから設定画面を開く |
| `bar:state` | main→renderer | 毎秒の描画状態（state/appearance/expanded） |

## 設定スキーマ（`src/main/store.js` の DEFAULT_SETTINGS）

```jsonc
{
  "version": 1,
  "schedule": {
    // 既定では月〜日すべて defaultWorkday()（9:00〜17:00・昼休憩）= 土日も ON。
    // → 初回起動が曜日に関係なく必ず見える変化になる。
    "weekly": { "mon": {"enabled":true,"start":"9:00","end":"17:00","breaks":[{"start":"12:00","end":"13:00"}]}, /* …sun（土日含む全曜日 ON） */ },
    "overrides": { "2026-06-15": {"enabled":true,"start":"10:00","end":"15:00","breaks":[]} }
  },
  "appearance": {
    "displayId": null, "edge": "right", "thickness": 16,
    "color": "#4a90d9", "opacity": 0.9,
    "track": {"enabled": true, "opacity": 0.18},
    "breakColor": "#8a8f98",
    "ticks": {"enabled": true, "intervalMinutes": 60}
  },
  "behavior": { "autoLaunch": false, "hover": {"dwellMs": 350, "expandedThickness": 56} }
}
```

- 保存は tmp ファイル＋rename の原子的書き込み。読み込み失敗時はデフォルトへフォールバック。
- `mergeWithDefaults` で将来のキー追加に前方互換（既存ファイルに無いキーはデフォルト補完、配列は data 優先）。
- 既定値は「初回起動が曜日・時刻に関係なく必ず見える変化になる」ことを狙う: 土日も ON・下地表示 ON・目盛り表示 ON・太さ 16px・辺は右。

## 設定のエクスポート/インポート（ローカルファイルのみ）

- クラウド連携はしない。`settings:export`/`settings:import`（IPC）は Electron の `dialog.show{Save,Open}Dialog` でファイルを選ぶ方式。
- エクスポート: 現在の `store.get()` を JSON で書き出す。
- インポート: 読み込んだ JSON を **既存の `validateSettings`** で検証し、OK のときだけ `store.save`（→ `store.onChange` でバーへ即時反映）。不正/破損 JSON は何も適用せず、設定 UI にエラー表示。
- ボタン配置は設定画面フッターを `justify-content: space-between` の1行にし、**左に「エクスポート」「インポート」**、**右にコミット系（ステータス＋「保存して適用」）**を置く。コミット操作（保存して適用）への誤クリックを避けるための分離。
- 設定 UI に「開発」セクションは置かない。時刻シミュレーションは環境変数（`DAYGLASSBAR_FAKE_NOW`/`DAYGLASSBAR_TIME_SCALE`/`DAYGLASSBAR_TIME_OFFSET_MIN`）専用（spec §7 / `src/core/time-source.js`）。

## モジュール構成と責務

| 層 | 場所 | 責務 | Electron依存 |
| --- | --- | --- | --- |
| core | `src/core/` | 時間モデル・検証・ジオメトリ・時刻源 | **なし（テスト対象）** |
| main | `src/main/` | ウィンドウ・トレイ・IPC・永続化・自動起動 | あり |
| preload | `src/preload/` | contextBridge（CJS） | あり |
| renderer | `src/renderer/` | 描画・設定UI（純描画/DOM） | なし |

- `store.js` のみ main 配下だが純Nodeでテスト可能（ディレクトリ注入）。
- 自動テストで担保できるのは core（時間・検証・幾何・store）まで。**GUI/常駐挙動は Windows 実機での手動確認**が前提。

## 既知の制限
- 排他フルスクリーンアプリの上には出ない（OS仕様。spec 9）。ボーダーレス全画面では被るのは期待動作。
- Linux はスコープ外（自動起動も skip）。
- `resizable` トグルは上記の回避策（環境によっては不要）。
- **WSL ビルドの `.exe` が「このアプリはお使いの PC では実行できません」で起動しないことがある**（2026-06 実機確認）。原因はベースの `electron.exe` がダウンロード/展開途中で壊れる一過性の破損で、生成物が `~/.cache/electron/electron-*-win32-x64.zip` 内の `electron.exe` より約1MB小さく（欠損）なる。PE ヘッダ（machine=x64・PE32+・GUI・エントリポイント）は正常なので `file`/objdump では検出できず、Windows ローダーだけが弾く。**WSL/クロスビルド自体やアーキ不一致・ファイルシステム（9p vs ext4 は生成物 md5 一致で無関係）が原因ではない**。対処は `rm -rf ~/.cache/electron && npm run dist:win` で取り直して再ビルド（生成物サイズがキャッシュ electron.exe 以上になることを確認）。`build` 設定は健全。

## アイコン
- マークは「画面の端に灯る静かな光」というアプリの**人格**を表す抽象記号（クール青、ダークな"画面"フィールド＋端の光の筋）。アイコンの仕事は機能の説明ではなく識別なので、**残り時間の仕組みは説明しない**。
- 時計/砂時計/トグル/進捗バーには意図的に寄せない。カテゴリの常套記号を避けることが差別化であり、不変条件#4「急かさない」とも整合する。名前 DayGlass の文字どおりの整合はワードマーク側で担保する方針（砂時計は描かない）。
- 端の筋は**下が濃く・上が薄い** = アプリの実挙動（塗りは下へ縮み、残りが下に溜まる）に向きを合わせる。
- Windows のトレイ（カラー）はアプリアイコンの縮小版（`appIcon(32)`）= 実行時のトレイアイコンを**インストール/エクスプローラのアイコンと一致**させる。macOS のメニューバーは黒+αの template が必須でダークな"画面"フィールドを描けない（黒い四角に潰れる）ため、同じ**端の筋（右寄り・下が濃い）**を一色で表す。16px・モノクロで時間ニュアンスが落ちるのは想定どおり。
- 生成は依存ゼロの `tools/gen-icons.mjs`（`npm run icons` で `assets/` の icon/tray/template を全出力）。
- 決定の経緯・不採用案とその理由は `docs/icon-design.md`（逆戻りガード）。

## 今後（spec 8）
- v2: ICS 購読を core にパーサとして足し、`schedule` を生成する経路を追加（既存の `getBarState` はそのまま使える設計）。
