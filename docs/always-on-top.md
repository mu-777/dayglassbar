# DayGlassBar 常時最前面（always-on-top）決定記録

このドキュメントは「バーを常にすべてのウィンドウの前面に出す」方法の**決定の経緯・代替案・不採用理由・逆戻りガード**を残す。狙いは2つ:

1. **同じ議論を再演しない**（「ポーリングは場当たりでは？ blur イベントにすべきでは？」は検討済み）。
2. **ポーリングで問題が出たときに、ここまでの検討を活かしてエスカレーションできるようにする**（末尾「問題が出たときの手順」）。

実装本体は `src/main/bar-window.js` の `raise()` とその呼び出し。設計メモの要約版は `docs/design.md`「最前面の維持」。

## 決定（結論）

**ポーリングで `setAlwaysOnTop(true, 'screen-saver')` を継続的に再宣言する。** 専用タイマは足さず、ホバー検知のために元々回っている `poll()`（アイドル250ms / 近傍60ms）に相乗りさせる。加えて生成時と「表示開始時」に即時1回。`true` の再設定のみ行い、`false→true` のトグルはしない。

## 症状と原因

- **症状**: 起動直後は最前面に出るが、後から他ウィンドウをバーの位置へ移動・アクティブ化すると、バーがその下に潜る。
- **原因は独立した2つ**:
  1. **レベル未指定の回帰**: Electron v7 以降、レベルを渡さない `setAlwaysOnTop(true)` はフォーカスを失うと top-most が外れる（electron/electron#20933）。→ **明示レベル `'screen-saver'` を渡す**のが正規の対処。本コードは生成時から実施済み。
  2. **OS仕様 + 被覆を知る手段が無い**: フラグを立てても Windows は top-most 同士の重なりを許す。透過・フレームレス・非フォーカスのオーバーレイは他窓のアクティブ化で静かに背後へ回ることがあり、「被った」を知らせるイベントは存在しない。"super top-most" フラグも無い（Raymond Chen "Old New Thing" 2011-03-10）。さらに被覆中でも `isAlwaysOnTop()` は `true` を返す（electron/electron#2097）＝ Electron は自発的に直さないので**ネイティブ呼び出しを再発行する以外に戻す手が無い**。

→ 1（レベル指定）だけでは潜るので、2に対して**再宣言**が要る。

## 代替案と不採用理由

### ② blur イベントで再宣言（純 Electron） — ✗ このアプリでは発火しない
「フォーカス喪失時に再 set する」案。一般論としては正しく軽量だが、**前提が「最前面窓自身がフォーカスを持つ」場合**に限る。DayGlassBar のバーは `focusable: false` + `showInactive()` のクリックスルー常駐窓（不変条件#3/#6）で**一度もフォーカスを得ない**ため、`blur` が永遠に発火しない（electron/electron#21459, #3222）。さらに「別アプリが前面に来た」を知るグローバルイベントは Electron に無い（取れるのは自分の全窓が非フォーカスになったか止まり。electron/electron#984）。仮に focusable にすると、表示のたびに作業中ウィンドウから**フォーカスを奪う**ことになりアンビエント性を壊す。→ 純 Electron の blur 方式は不適。

### ②' ネイティブ前面フック / electron-overlay-window — ✗ 用途違い + mac 非対応 + 過剰
「正しいイベント駆動」は OS レベルのフック（Windows: `SetWinEventHook(EVENT_SYSTEM_FOREGROUND)`）で前面変化時のみ再宣言する方式。定番ライブラリ **electron-overlay-window** がこれを実装している。ただし:
- 用途が**「対象ウィンドウをタイトルで探し、それに追従し、対象が前面のときだけ重ねて表示」**するゲームオーバーレイ向け（`attachByTitle(win, targetWindowTitle)` 必須）。DayGlassBar は対象窓を持たず、画面の縁(workArea)に**常駐し常に前面**なのでモデルが真逆。
- **macOS 非対応**（Supported backends: Windows 7–10 / Linux X11）。DayGlassBar は Windows/macOS 両対応が必須なので採用不可。
- ネイティブ addon 依存（node-gyp / N-API）でビルド・配布が複雑化。core を Electron 非依存に保つ方針とも逆行。
- 得られる利益は「ポーリング撤廃＋復帰ラグ ≤250ms→即時」程度で、アンビエントバーには体感差がほぼ無い。

→ 借りられるのは**技術（前面フック）だけ**でライブラリそのものは入れない。費用対効果で現状は過剰。

### ① `false→true` トグルで前面化 — ✗ 他アプリを巻き込む
`setAlwaysOnTop(false)` してから `true` にすると前面へ戻る挙動はあるが、**他アプリの top-most を奪う副作用**がある（electron/electron#31536）。本実装は `true` の再設定のみ。

## 妥当性（実在リポジトリでの裏取り）

| 方式 | 採用している著名例 | 備考 |
| --- | --- | --- |
| **① 周期再宣言（採用）** | **lyswhut/lx-music-desktop**（デスクトップ歌詞オーバーレイ） | `setInterval(() => setAlwaysOnTop(true,'screen-saver'), 500)` を `desktopLyric.isAlwaysOnTopLoop` として**製品機能化**。レベルまで一致、頻度はこちらより緩い |
| **② イベント駆動再宣言** | **SnosMe/electron-overlay-window**（Awakened-PoE-Trade の土台） | `focus`/`attach` で `setAlwaysOnTop(true,'screen-saver')`。ただしその `focus` は**ネイティブ `SetWinEventHook(EVENT_SYSTEM_FOREGROUND)` 由来**で、純 Electron の blur ではない。`showInactive`+`setIgnoreMouseEvents(true)` も同型 |
| 一度だけ設定（再宣言なし） | nativefier / caprine / stretchly / cerebro / youtube-music(PiP) | 普通の（フォーカス可能な）窓は一度設定で足りる。再宣言が要るのは透過・クリックスルー・非フォーカスのオーバーレイという特殊ケース＝lx-music-desktop / electron-overlay-window / DayGlassBar の仲間 |

→ DayGlassBar の①は、実装の細部（`screen-saver`・`showInactive`・`setIgnoreMouseEvents`・非フォーカス）まで上記リファレンスと一致しており、**この種のオーバーレイの定石**。場当たりではない。

## 原理的な限界（誇張しないため）

- **絶対的な最前面は存在しない**（Raymond Chen: "There is no 'super topmost' flag … all that does is give you a taller ladder."）。他の "より上" を狙う常駐アプリや**排他フルスクリーン**には勝てない（後者は OS 仕様。`docs/design.md`「既知の制限」）。
- 満たすのは「**すべての通常ウィンドウより前面**」まで。要件はこれで充足する。
- ポーリングである以上、被覆から復帰まで最大 250ms（近傍60ms）の理論ラグがある。実用上は瞬時に見える。

## 負荷について（ポーリングは重くない）

- `setAlwaysOnTop` の実体は Windows の `SetWindowPos`（NOACTIVATE 相当）1発＝数〜数十µs。
- アイドル時 4回/秒・近傍時 16回/秒で、合計 1ms/秒に満たない。毎秒の Canvas 再描画や Chromium のアイドル消費の方が桁違いに重い。
- **新規タイマは足していない**（既存の `poll()` に相乗り）ので、追加コストはほぼゼロ。
- electron/electron#2097 の "performance issues" は `setInterval(…, 1)`＝**1000回/秒**の話で、本実装はその 250〜4000分の1。

## 逆戻りガード（やってはいけないこと）

- `poll()` の `raise()` 呼び出しを「冗長」と判断して**消さない**（消すと潜る挙動が再発する）。
- 純 Electron の `win.on('blur')` 方式に**置き換えない**（このバーは `focusable:false` で blur が発火しない）。
- `false→true` トグルに**しない**（他アプリの top-most を奪う）。
- `setAlwaysOnTop` から**レベル指定（`'screen-saver'`）を外さない**（外すと#20933の回帰を踏む）。

## 問題が出たときの手順（この順で検討）

1. **復帰ラグが気になる**: `poll()` のアイドル間隔（`POLL_IDLE_MS`）を詰める、または `raise()` を軽い別タイマで補強する。負荷は小さいので安全。
2. **特定アプリにだけ負ける / フルスクリーンで困る**: レベルや `setVisibleOnAllWorkspaces` の `visibleOnFullScreen` を調整。排他フルスクリーンは OS 仕様で原則諦める。
3. **反応の即時性が必須でポーリングでは不足**: Windows 用に `SetWinEventHook(EVENT_SYSTEM_FOREGROUND)` の薄いネイティブ前面フックを**自前で**実装し、前面変化時のみ `raise()`。macOS は別実装が必要。**electron-overlay-window をそのまま導入しない**（対象窓追従用途・mac 非対応）。あくまで「技術だけ参考」。

## 参照

- electron/electron#20933 — alwaysOnTop がレベル未指定でフォーカス喪失時に外れる回帰
- electron/electron#2097 — Always on top doesn't always work（タイマ再宣言ワークアラウンド・被覆中も `isAlwaysOnTop()` は true）
- electron/electron#31536 — `false→true` トグルが他アプリの top-most を奪う
- electron/electron#21459 / #3222 — `focusable:false` / always-on-top で focus/blur が壊れる・発火しない
- electron/electron#984 — focus/blur はアプリ内の窓に閉じる（グローバル前面イベントが無い）
- Raymond Chen "How do I create a topmost window that is never covered by other topmost windows?"（Old New Thing, 2011-03-10）
- lyswhut/lx-music-desktop — `src/main/modules/winLyric/main.ts`（`setInterval` 再宣言ループ）
- SnosMe/electron-overlay-window — `src/index.ts`（focus/blur で再宣言）+ `src/lib/windows.c`（`SetWinEventHook` / `EVENT_SYSTEM_FOREGROUND`）
