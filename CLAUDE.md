# CLAUDE.md

DayGlassBar — 画面の縁に常駐し、一日の区間の残り時間を細いバーで可視化するアンビエントなデスクトップアプリ（Electron / Windows優先・macOS両対応）。

## コマンド

```bash
npm install          # 依存取得（初回・要ネットワーク）
npm start            # 開発起動（electron .）
npm test             # coreのユニットテスト（node --test）
npm run icons        # アイコン再生成（依存ゼロ・assets/へ出力）
npm run dist         # 配布ビルド（electron-builder: win nsis/portable, mac dmg）
```

時刻シミュレーション（開発時。詳細は docs/spec-v2.md §7）:

```bash
# 月曜16:30を起点に60倍速で起動（区間の減りを早送り確認）
DAYGLASSBAR_FAKE_NOW="2026-06-15 16:30" DAYGLASSBAR_TIME_SCALE=60 npm start
# 現在時刻を+2時間ずらす
DAYGLASSBAR_TIME_OFFSET_MIN=120 npm start
```

## アーキテクチャ

| 層 | 場所 | 責務 |
| --- | --- | --- |
| core | `src/core/` | 時間モデル(schedule)・検証(validate)・幾何(geometry)・時刻源(time-source)。**Electron/DOM非依存** |
| main | `src/main/` | エントリ(index)・バー窓(bar-window)・設定窓・トレイ・永続化(store) |
| preload | `src/preload/` | contextBridge（`.cjs`） |
| renderer | `src/renderer/bar`, `src/renderer/settings` | バー描画・設定UI |

- 状態の流れ: main が毎秒 `getBarState(schedule, now)` を計算 → `bar:state` で renderer に push → renderer は純粋に描画。
- 設定の流れ: 設定UI → `settings:save`(IPC) → `validateSettings` OK で `store.save` → `store.onChange` でバーへ即時反映。
- IPC一覧・設定スキーマは docs/design.md。

## 不変条件（変更時に壊さないこと）

1. **時刻は毎回 `timeSource.now()` から再計算**。経過時間の積算をしない（スリープ復帰・時刻変更対応の生命線）。
2. **core は Electron/DOM に依存させない**。ロジック追加時は `test/` にユニットテストを足す。
3. **通常時はテキストを出さない**。数値・時刻はホバー展開時のラベルのみ（アンビエント性）。
4. **「促すが、急かさない」**。色変化・点滅・通知・カウントダウン音などの「急かす」表現を足さない。減るのは塗りの長さのみ・色は一定。
5. **配置は `workArea` 基準**（タスクバー/Dock/メニューバーを避ける）。
6. **通常時はクリックスルー維持**（`setIgnoreMouseEvents(true,{forward:true})`）。入力を受けるのは展開時のみ。

## 検証方針
- 自動テストで担保できるのは **core まで**（時間・検証・幾何・store）。
- バー描画・クリックスルー・ホバー展開・トレイ・自動起動・DPIは **Windows 実機での手動確認**が必要（README のチェックリスト参照）。

## 参考
- 要件: `docs/spec-v2.md`
- 設計判断（スタック選定・ホバー方式・既知の制限）: `docs/design.md`
