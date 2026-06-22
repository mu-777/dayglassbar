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
  - メイン側で `screen.getCursorScreenPoint()` を**アイドル250ms / 近傍60ms**でポーリングし、バー矩形内の滞留 `dwellMs` で展開、**2連続の外側検出**で収納とする方が、表示状態と入力透過の切替（`setIgnoreMouseEvents`）を一箇所で握れて確実。
- コスト: 常時タイマ。ただしアイドル時 250ms 間隔は軽微で、要件6（カリカリ不要）の範囲。

## クリックスルーと展開の切替

- 通常: `setIgnoreMouseEvents(true, { forward: true })`（全入力を素通し）。
- 展開時のみ: `setIgnoreMouseEvents(false)` にしてクリックを受け、クリックで設定画面へ。
- リサイズ: `resizable:false` だと一部環境で `setBounds` のサイズ変更が無視されるため、`setResizable(true)` →`setBounds`→`setResizable(false)` で囲って回避。

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

## アイコン
- マークは「画面の端に灯る静かな光」というアプリの**人格**を表す抽象記号（クール青、ダークな"画面"フィールド＋端の光の筋）。アイコンの仕事は機能の説明ではなく識別なので、**残り時間の仕組みは説明しない**。
- 時計/砂時計/トグル/進捗バーには意図的に寄せない。カテゴリの常套記号を避けることが差別化であり、不変条件#4「急かさない」とも整合する。名前 DayGlass の文字どおりの整合はワードマーク側で担保する方針（砂時計は描かない）。
- 端の筋は**下が濃く・上が薄い** = アプリの実挙動（塗りは下へ縮み、残りが下に溜まる）に向きを合わせる。
- 16px・モノクロでは時間ニュアンスは落ち、トレイ/template は中央の筋グリフへ簡略化される（macOS は黒+α）。これは想定どおりの劣化。
- 生成は依存ゼロの `tools/gen-icons.mjs`（`npm run icons` で `assets/` の icon/tray/template を全出力）。
- 決定の経緯・不採用案とその理由は `docs/icon-design.md`（逆戻りガード）。

## 今後（spec 8）
- v2: ICS 購読を core にパーサとして足し、`schedule` を生成する経路を追加（既存の `getBarState` はそのまま使える設計）。
