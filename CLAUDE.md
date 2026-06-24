# CLAUDE.md

DayGlassBar — 画面の縁に常駐し、一日の区間の残り時間を細いバーで可視化するアンビエントなデスクトップアプリ（Electron / Windows優先・macOS両対応）。

## コマンド

```bash
npm install          # 依存取得（初回・要ネットワーク）
npm start            # 開発起動（electron .）
npm test             # coreのユニットテスト（node --test）
npm run icons        # アイコン再生成（依存ゼロ・assets/へ出力）
npm run dist         # 配布ビルド（ホストOS向け・electron-builder）
npm run dist:win     # Windows向け（nsis/portable）。WSL/Linuxからは Wine 必須
npm run dist:mac     # macOS向け（dmg）。macOS上でのみ可（WSL/Linux不可）
```

クロスビルド: WSL(Linux)からは Windows のみ可（Wine 必要）。macOS(dmg)は macOS 専用ツール依存で不可 → 両OS分は `.github/workflows/build.yml`（windows/macos ランナーでネイティブビルド）を使う。手順は README「ビルド（配布物）」参照。WSL で生成した `.exe` が「このアプリはお使いの PC では実行できません」で起動しない時は、ベースの `electron.exe` がダウンロード途中で壊れている（生成物がキャッシュの electron.exe より小さい）疑い → `rm -rf ~/.cache/electron` で取り直して再ビルド。詳細は `docs/design.md`「既知の制限」。

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
- エクスポート/インポート: `settings:export`/`settings:import`(IPC) は `dialog.show{Save,Open}Dialog` でローカル JSON を読み書き（クラウドなし）。インポートは `validateSettings` OK のときだけ `store.save`、不正/破損時は何も適用せず UI にエラー表示。設定 UI に「開発」セクションは無い（時刻シミュレーションは環境変数専用）。
- IPC一覧・設定スキーマは docs/design.md。
- 既定値: 全曜日（土日含む）ON / 下地表示 ON / 目盛り表示 ON / 太さ 16px / 辺は右。初回起動が曜日・時刻に関係なく必ず見える変化になることを狙う（`src/main/store.js` の `DEFAULT_SETTINGS`、`test/geometry-store.test.js` で担保）。

## 不変条件（変更時に壊さないこと）

1. **時刻は毎回 `timeSource.now()` から再計算**。経過時間の積算をしない（スリープ復帰・時刻変更対応の生命線）。
2. **core は Electron/DOM に依存させない**。ロジック追加時は `test/` にユニットテストを足す。
3. **通常時はテキストを出さない**。数値・時刻はホバー展開時のラベルのみ（アンビエント性）。
4. **「促すが、急かさない」**。色変化・点滅・通知・カウントダウン音などの「急かす」表現を足さない。減るのは塗りの長さのみ・色は一定。
5. **配置は `workArea` 基準**（タスクバー/Dock/メニューバーを避ける）。
6. **常時クリックスルー維持**（`setIgnoreMouseEvents(true,{forward:true})` を生成時に一度だけ設定）。展開中も入力を受けず素通しする（バーのクリックでは設定を開かない＝背後アプリの操作を奪わない。設定はトレイから）。

## 検証方針
- 自動テストで担保できるのは **core まで**（時間・検証・幾何・store）。
- バー描画・クリックスルー・ホバー展開・トレイ・自動起動・DPI、および設定のエクスポート/インポート（`dialog` を伴うファイル選択）は **Windows 実機での手動確認**が必要（README のチェックリスト参照）。

## ドキュメント保守（Claude Code の振る舞い）
- コード変更時は、影響範囲に応じて `README.md`（利用者向け）と `CLAUDE.md`（開発・AI向け）を**ユーザーの指示を待たずに同じ作業内で更新**する。コマンド・設定スキーマ・IPC・不変条件・アーキテクチャ・動作確認手順に変化があれば必ず追従させる。
- ドキュメント更新が不要な軽微な変更（内部リファクタ・コメント修正など）では無理に書き換えない。
- 両ファイルで重複する記述（コマンド・時刻シミュレーション・nvm 手順など）は、片方だけを直さず常に整合させる。
- **`README.md` には最終確定した内容のみを書く**。「推奨」「可否」「比較」「今後の予定」など検討中・選択肢提示の記述は載せない（手順・仕様・事実のみ）。未確定の設計判断は `docs/design.md` に記す。

## 参考
- 要件: `docs/spec-v2.md`
- 設計判断（スタック選定・ホバー方式・既知の制限）: `docs/design.md`
- プロダクト原則（明示指示がなくても守る一般方針）: `docs/product-principles.md`
- アイコン決定記録（経緯・不採用案・逆戻りガード）: `docs/icon-design.md`
- 常時最前面の決定記録（ポーリング再宣言採用の経緯・代替案=blur/ネイティブの不採用理由・逆戻りガード・問題時の手順）: `docs/always-on-top.md`
