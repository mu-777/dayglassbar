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
npm version patch    # リリース版上げ（package.json＋CHANGELOG stamp＋タグ。minor/major も可）
```

リリース手順（バージョン管理）: **`package.json` の `version` が版の唯一の正**（`app.getVersion()`／インストーラ名／設定フッタ表示が全部これ）、**`CHANGELOG.md`（Keep a Changelog 形式）がリリースノートの正**。流れは①`CHANGELOG.md` の `## [Unreleased]` 節に変更を書く（**Claude Code に「前タグ以降の変更を CHANGELOG.md の [Unreleased] に追記して」と頼む手動トリガ**。自動生成はしない）→ コミット ②`npm version patch`（`version` フック `tools/stamp-changelog.mjs` が `[Unreleased]`→`## [x.y.z] - 日付` に置換＋新しい空 `[Unreleased]` を作り、`package.json`＋`CHANGELOG.md` の版コミット＋`v<x.y.z>` タグを生成）③`git push --follow-tags` → `.github/workflows/build.yml` が両OSビルド＋`tools/extract-changelog.mjs` でタグ対応の節を抜き出し **Release 本文に自動投入**。案内 HTML コメントは `[Unreleased]` の**外**に置く（節内だと本文へ混入）。初回 `v0.1.0` はバンプ不要でタグのみ。手順詳細は README「リリース手順」。**この一連はスキル `/release`（`.claude/skills/release/SKILL.md`）に手順化済み**＝「リリースして」でフェーズ順に実行される（CHANGELOG の書き方基準・失敗時対応も同ファイルに集約。手順を変えたら SKILL.md も更新すること）。

PR に動作確認用のビルド済みバイナリを付ける（**クラウドセッションから Windows バイナリを出す唯一の経路**）: `.github/workflows/build.yml` は **`pull_request`（base=master）でも走り、PR の head SHA をビルドして Artifacts（`dayglassbar-win`/`dayglassbar-mac`）を出す**。PR 本文にはその **run の `html_url`** を貼る。**GitHub の PR にファイルを「添付」することはできない**（コメント添付は Web UI 専用＋`.exe` は許可拡張子外）ので、リンク以外の形は無い。**エージェントのトークンには Actions の write が無く `workflow_dispatch` は 403 になる**ので dispatch を試さない。**Linux コンテナでの `dist:win` も Wine 必須＋OAuth client_id 不在で不可**なので試さない。**この一連はスキル `/pr-build`（`.claude/skills/pr-build/SKILL.md`）に手順化済み**（既存 PR の自動作成に注意・Artifact 直リンクは失効するので使わない等の落とし穴も同ファイル。手順を変えたら SKILL.md も更新すること）。

クロスビルド: WSL(Linux)からは Windows のみ可（Wine 必要）。macOS(dmg)は macOS 専用ツール依存で不可 → 両OS分は `.github/workflows/build.yml`（windows/macos ランナーでネイティブビルド）を使う。手順は README「ビルド（配布物）」参照。**配布 `.dmg` は未署名＝初回起動は Gatekeeper が「壊れているため開けません」と出すのが正常**（ファイル破損ではない）。回避はアプリを「アプリケーション」へコピー後 `xattr -cr /Applications/DayGlassBar.app` を一度実行（右クリック→「開く」は効かない）。案内は三層: ①web の Download 節注意書き ②`.dmg` クリック時のモーダル（`web/index.html` `#macDlDialog`）③**DMG 背景画像**（`assets/dmg/background*.png`＋`@2x`＝`npm run dmg-bg`・`tools/gen-dmg-background.mjs`、gen-og と同じ capturePage 方式。`package.json` `build.dmg` の window 540×380／contents 座標 (130,150)/(410,150)／iconSize 100 とレイアウトが連動＝**座標を変えたら背景も再生成**。@2x は dmg-builder が tiffutil で multi-res TIFF に合成）。経緯・不採用案・署名/公証（年$99）の導入手順は `docs/macos-signing.md`。WSL で生成した `.exe` が「このアプリはお使いの PC では実行できません」で起動しない時は、ベースの `electron.exe` がダウンロード途中で壊れている（生成物がキャッシュの electron.exe より小さい）疑い → `rm -rf ~/.cache/electron` で取り直して再ビルド。詳細は `docs/design.md`「既知の制限」。

時刻シミュレーション（開発時。詳細は docs/spec-v2.md §7）:

```bash
# 月曜16:30を起点に60倍速で起動（区間の減りを早送り確認）
DAYGLASSBAR_FAKE_NOW="2026-06-15 16:30" DAYGLASSBAR_TIME_SCALE=60 npm start
# 現在時刻を+2時間ずらす
DAYGLASSBAR_TIME_OFFSET_MIN=120 npm start
# カレンダー連携を OAuth 無しで目視（区間内に色帯＋ホバーでタイトル）
DAYGLASSBAR_FAKE_NOW="2026-06-15 14:00" DAYGLASSBAR_FAKE_EVENTS="15:00-15:30 Standup;16:00-16:30 Review" npm start
# 詳細ログを出す（userData/logs/main.log へ・dev は端末にもミラー）。DAYGLASSBAR_LOG_LEVEL=debug でも可
DAYGLASSBAR_DEBUG=1 npm start
```

カレンダーの実 OAuth を試すには資格情報が必要（Google=「デスクトップアプリ」型の **client_id＋client_secret**／Microsoft=「パブリッククライアント」型の **client_id のみ**）。**Google はトークン交換に client_secret を要求する**（PKCE 併用でも必須・Google は非機密扱い）。値は `src/main/calendar/config.js` に集約し、**gitignore 済みの `client-ids.local.json`**（`client-ids.local.example.json` をコピー。キー `google`/`google_secret`/`microsoft`）か env `DAYGLASSBAR_GOOGLE_CLIENT_ID`/`DAYGLASSBAR_GOOGLE_CLIENT_SECRET`/`DAYGLASSBAR_MS_CLIENT_ID`（env 優先）で設定。実値はリポジトリに置かない。詳細は docs/calendar-integration.md。

## アーキテクチャ

| 層 | 場所 | 責務 |
| --- | --- | --- |
| core | `src/core/` | 時間モデル(schedule)・検証(validate)・幾何(geometry)・ディスプレイ照合(display＝保存したディスプレイ指定の再特定)・時刻源(time-source)・多言語(i18n)・カレンダー幾何(calendar)・zip生成(zip＝依存ゼロのZIPライタ)・バージョン比較(version＝手動更新確認用)。**Electron/DOM非依存** |
| main | `src/main/` | エントリ(index)・バー窓(bar-window)・設定窓・トレイ・永続化(store)・ロギング(logger)・診断ダンプ(diagnostics)・カレンダー連携(`calendar/`: OAuth・プロバイダ・トークン暗号ストア・取得サービス) |
| preload | `src/preload/` | contextBridge（`.cjs`） |
| renderer | `src/renderer/bar`, `src/renderer/settings` | バー描画・設定UI |
| web | `web/` | 紹介・配布の静的サイト（GitHub Pages）。アプリ本体とは独立。英/日のライブ切替・OS判定・`releases/latest` を GitHub API で読み DL リンク自動反映 |

- 状態の流れ: main が毎秒 `getBarState(schedule, now)` を計算 → `bar:state` で renderer に push → renderer は純粋に描画。
- 設定の流れ: 設定UI → `settings:save`(IPC) → `validateSettings` OK で `store.save` → `store.onChange` でバーへ即時反映。`settings:reset`(IPC)＝設定を `store.getDefaults()`（＝`DEFAULT_SETTINGS`＋この端末の OS ロケール由来の言語）に戻して保存（`calendar-accounts.enc`＝OAuth接続・表示カレンダー選択は対象外＝保持）。`app:check-updates`(IPC)＝GitHub Releases を1回だけ見る**手動**の更新確認（自動チェックはしない＝#4）。日付の overrides は起動時に core `prunePastOverrides` で自動削除（昨日分は夜跨ぎ区間が続いている可能性があるため残す）。
- 時刻入力と日跨ぎ: 設定の時刻欄はすべて **`<input type="time">`（OS 標準の時計入力）**。値は 0:00〜23:59 の壁時計しか持てないので、core の**ラップ規則**で夜跨ぎを表す＝`resolveEndMinutes`（**終了 ≤ 開始なら +24h**。22:00〜02:00 = 26:00）と `resolveBreakMinutes`（休憩は**その日の開始以降で最初に来る側**へ解決。22:00 始まりの日の 00:30 は 24:30）。**24時超表記（25:00）は従来どおり素通しする＝既存/インポートした settings.json の意味は不変**。`validateSettings` も**同じ2関数**を通してから範囲を見る（二重実装を作らない）。この結果「終了は開始より後」エラー（`v.endAfterStart`）は成立しなくなり削除済み。設定 UI は曜日行を**「期間」と「休憩」の別枠（`.time-group`）**に分けて描く。「表示」セクションは**1行＝1つの `.grid`**（①ディスプレイ/辺/太さ ②ホバー判定/展開時の太さ ③色/不透明度/休憩の色 ④下地を表示/下地の濃さ ⑤目盛りを表示/目盛り間隔）で、**ホバー判定・展開時の太さは UI 上「表示」に置くが保存先は `behavior.hover` のまま**（逆戻りガード: 見た目に合わせてスキーマを動かさない）。**`settings-window.js` の `minWidth: 780` は①が3列を保てる最小幅から決めてあるので、グリッドの `minmax`/gap/`main` のパディングを変えたら測り直す**。詳細は docs/design.md「「表示」の行組みと最小横幅」。**逆戻りガード**: 自由テキスト入力に戻さない・ラップ規則をレンダラーへ写経しない。詳細は docs/design.md「時刻入力」。
- 目盛り: `computeTicks` は**区間開始からの N 分ではなく、その区間の 0:00 起点**で置く（既定 60 分＝開始が 9:30 でも線は毎正時）。位置は `msAt` で作るので DST があっても壁時計に追従。
- ディスプレイ指定: `screen` の**ディスプレイ id は再起動をまたいで安定しない**（Windows で顕著）ため、`appearance.displayId` に加えて**記述子 `appearance.displayMatch`（label＋bounds）**を保存し、core `findDisplay`（id → label+bounds → bounds → label の順で**一意に絞れるときだけ**採用）で照合する。main は起動直後 `healDisplayChoice()` で id を書き戻す（記述子の無い既存設定への**後付けも兼ねる**）。ディスプレイが本当に外れているときは**設定を書き換えない**＝再接続で復帰（spec 4.2）。**逆戻りガード**: `displayId` だけの `find` に戻さない。
- バーの一時的な非表示: トレイの**チェック項目**（`tray.hide`）で当日いっぱい非表示。**もう一度押せば即復帰・押さなくても翌日 0:00 に自動復帰**（`nextLocalMidnightMs`）。状態は「期限の epoch ms」1つだけで、`isTemporarilyHidden()` は**毎回時計と比較**（不変条件 #1＝タイマを持たないのでスリープが日付を跨いでも戻る）。判定は `bar-window.js` `pushState()` 冒頭の1か所、トレイのチェックは `onHiddenChanged` でメニュー再構築して同期。**メニューの並びは `設定...` が先頭のクリック項目・非表示トグルはその下にセパレータで隔離**（先頭に置いたら設定を開こうとしたユーザーが踏んでバーを失った＝**隠れたバーは壊れたバーと区別がつかない**。逆戻りガード: 先頭へ戻さない）。**非表示中はトレイ先頭行を `tray.hiddenNow`・ツールチップを `tray.tooltipHidden` に差し替えて明示する**。保存先は `settings.json` ではなく **`userData/hidden-until`**（`onboarded` と同じ理由＝端末ごとの一時状態・**エクスポート対象外**）。**設定の適用（`settings:save`/`import`/`reset` の成功時）は `clearTemporaryHide()` で非表示を解除する**＝「保存して適用」は結果を見せる操作であり、事故で隠した人の脱出口にもなる（ステータス文言は増やさない＝バーが戻ること自体がフィードバック）。通知やカウントダウンは出さない（#4）。
- 初回導線: バーはクリックスルーで UI を持たないため、初回起動時のみ設定窓を自動オープン（`openSettingsWindow({firstRun:true})`→ renderer は `?firstRun=1` で `onboarding.trayHint` バナーを表示）して「設定はトレイから」を伝える。判定は `store.isOnboarded()`/`markOnboarded()`＝`userData/onboarded` センチネル（**settings.json と別＝エクスポート対象外**。インポートで初回案内が抑止されない・新端末が既済を継がない）。トレイのツールチップ（`tray.tooltip`）も恒久のフォールバック。**一度きり＝急かさない（#4）**。
- エクスポート/インポート: `settings:export`/`settings:import`(IPC) は `dialog.show{Save,Open}Dialog` でローカル JSON を読み書き（クラウドなし）。インポートは `validateSettings` OK のときだけ `store.save`、不正/破損時は何も適用せず UI にエラー表示。設定 UI に「開発」セクションは無い（時刻シミュレーションは環境変数専用）。
- ロギング（問題解析用）: `src/main/logger.js` の `createLogger({dir,level,mirror})` が `userData/logs/main.log` に追記（NDJSON 風の1行レコード `ISO LEVEL [scope] msg {json}`）。**サイズ上限で `main.log.1`/`.2` にローテーション**（既定 2MB×2）。レベルは `error<warn<info<debug`、**既定 info**。`level` は env で上げる: `DAYGLASSBAR_LOG_LEVEL=debug`（最優先）か `DAYGLASSBAR_DEBUG=1`。**開発(`npm start`＝未パッケージ)時は端末にもミラー**（`mirror:!app.isPackaged`）。`log.child('scope')` で `app:calendar` 等に分岐。**秘匿キー（token/secret/refresh 等）は自動で `[redacted]`・Error は name/message/stack に展開**。`process` の `uncaughtException`/`unhandledRejection` と `app` の `render-process-gone`/`child-process-gone` を捕捉。バーの `render-process-gone` は `bar-window.js` 側でも個別に捕捉し**自動 reload で復帰**する（常駐バーはレンダラーが死んだまま放置すると再起動まで無表示になるため）。各層へは `log.child(...)` を注入（store/bar/calendar）。**core 非依存（fs/path のみ）で `test/logger.test.js` がローテ・しきい値・redaction を担保**。書き込み失敗は握り潰し＝ログでアプリを落とさない。このログを上の診断ダンプが同梱する。
- 診断ダンプ（サポート用）: 設定UIの「診断情報を保存」ボタン →`diagnostics:export`(IPC) →`src/main/diagnostics.js` が **ログ(`userData/logs/*`)＋環境情報(`environment.json`：版・OS・ロケール・ディスプレイ/workArea)＋現在の `settings.json`** を core の `createZip` で1つの `.zip` にまとめ、`dialog.showSaveDialog` で保存後にフォルダで reveal。**送信手段はユーザー任せ＝アプリからメール/フォーム送信はしない（クラウドなし）**。**秘匿情報は同梱しない**（OAuth トークン/アカウント＝`calendar-accounts.enc` は読まない・#7）。
- 多言語: 英・日・中（`en`/`ja`/`zh`）対応。**未保存時の既定言語は OS ロケール由来**: core の純関数 `languageFromLocale`（ロケールタグ→対応言語の写像のみ。ja/zh はそれぞれ・他は en）を main が `languageFromLocale(app.getLocale())` として `createStore(dir, log, {defaultLanguage})` に注入し、store がインスタンス既定として保持（`app.getLocale()` は Electron API なので呼ぶのは main のみ）。core の `DEFAULT_LANGUAGE` は `'en'` のまま＝未知ロケール・注入なし時のフォールバック。**明示保存された `settings.language` が常にこの既定より優先**（一度保存すれば OS 言語に追従しない）。メッセージ catalog と `t(lang,key,params)` は `src/core/i18n.js`（core＝Electron/DOM 非依存・テスト対象）。main は直接 import、renderer は `i18n:catalog`(IPC) で catalog を受け取り設定UIで言語をライブ切替。`validateSettings` は文言を持たず `{path, code, params}`（`code` は `v.*` キー）を返し、表示側が現在言語で整形する。バーは語を持たず `bar:state.strings`（main が現在言語で同梱）を描く。言語は `settings.language` に永続化。詳細は docs/design.md「多言語対応（i18n）」。
- カレンダーの流れ: `CalendarService`(`src/main/calendar/`) が**2系統の別タイマ＋接続/設定変更時＋スリープ復帰時**に取得・キャッシュ → bar-window が push 時に `getBarState` の `events` に渡す → core `computeEventSegments` が**残り側のみ**に色帯化（過ぎた予定は消える）。**取得は cloud（Google/Graph）=1分・Outlook local=5分の2系統に分離**（cloud は安いHTTP GET なので速く追従／local は毎回 PowerShell+COM を起動するので低頻度）。各系統は最後の結果を保持し `recombine`＝`normalizeEvents([...cloudRaw,...localRaw])` で1つのキャッシュにマージ（片方の速い更新でもう片方を落とさない）。**取得全滅時は前回結果を保持**（cloud は provider＝`google`/`microsoft` 単位で対象カレンダーが全件失敗したときだけ・local は catch 節で保持）＝オフラインやトークン失効の一時的な失敗で色帯が数十秒〜数分消える現象を防ぐ（無効化＝未試行の source は従来どおりクリアされる）。cloud の認証/取得エラーは `health`（providerId→直近のエラー）に記録され `calendar:status` の `error` として設定UIの該当プロバイダ欄に警告表示される（`calendar.connectError`）。スリープ復帰は `powerMonitor` の `resume`→`calendar.refresh()` で即時最新化（タイマ停止中に古くなった予定を待たずに更新。時刻計算自体は #1 で常時再計算）。ユーザー向けは**2プロバイダで各々に表示ON/OFF＋色**: **Google**＝クラウド OAuth のみ／**Outlook**＝接続方法を排他二択（`local`＝クラシック Outlook を `outlook-local.js` の PowerShell/COM でローカル読み取り・承認不要・Windowsデスクトップ専用／`cloud`＝Microsoft Graph OAuth・企業は管理者承認が要る場合あり）。**ただし現状 `cloud` は UI 上では未対応扱い**＝排他二択トグルと OAuth コードは残すが、`cloud` を選ぶと設定UIは未対応の説明文を出し「Connect Microsoft」ボタンを無効化する（`settings.js` の `renderCalendarConnections`／`buildConn(..., {disabled})`。理由＝企業テナントの管理者承認・テナント用意が難しい）。再開は UI ガードを外すだけ。各予定に `provider` タグを付けバーが色分け。OAuth は `calendar:connect`/`disconnect`→PKCE/ループバック。**表示カレンダーはユーザーが複数選択可**（決定9）: 一覧は `fetchCalendars`(cloud)/`listOutlookLocalCalendars`(local)＝`calendar:list-calendars` IPC で取得、選択は `calendar:set-selection` IPC で**暗号ストアに保存**（`CalendarService` は選択 ID ごとに取得＝**カレンダー単位の try/catch**で1つ失敗でも他を落とさない／**未選択時のみ primary・既定 1 本にフォールバック**）。Outlook cloud の選択コードも実装済みだが決定0b で UI 未到達。**ICS 公開URL購読は一度実装後に撤回**（提供側キャッシュで更新が数時間〜1日遅れ＝予定変更への追従が要件不足。逆戻りガードは docs/calendar-integration.md 決定0）。**OAuth トークン・アカウント＋表示カレンダー選択は `settings.json` ではなく `userData/calendar-accounts.enc`（safeStorage 暗号化）に分離＝エクスポート対象外**（Google のカレンダーIDはメールになり得るので選択もここ＝決定9）。**表示設定（有効/色/method）は非秘匿なので `appearance.calendar` に保存**。**Outlook local の PowerShell は出力を純 ASCII の JSON に固定する**（`outlook-local.js` の `PS_PROLOGUE`／`ConvertTo-AsciiJson`＝非 ASCII を UTF-16 コードユニット単位で `\uXXXX` に再エスケープ）＝`powershell.exe` はリダイレクト時にコンソール出力コードページ（日本語 Windows は CP932）で書き、`execFile` は既定で utf8 復号するため**日本語タイトル/カレンダー名が文字化けし、Shift_JIS のダメ文字（2バイト目 `0x5C`）では `JSON.parse` ごと落ちうる**。**`ConvertTo-Json` を直接パイプして出力に戻さない（逆戻りガード・`test/outlook-local.test.js` が担保）**。詳細は docs/design.md「カレンダー連携」・docs/calendar-integration.md 決定11。
- IPC一覧・設定スキーマは docs/design.md。
- 紹介・配布ページ: `web/`（静的・依存ゼロ）を GitHub Pages で公開（`https://mu-777.github.io/dayglassbar/`）。`.github/workflows/pages.yml` が `web/` をそのまま Pages へアップロード（ビルド工程なし＝set-and-forget。Source は一度だけ「GitHub Actions」に設定）。**DL リンクは `web/app.js` がブラウザから `releases/latest` を GitHub API で読み、`v*` タグで Actions が公開した最新 `.exe`/`.dmg` を自動反映**（リリースごとの手編集不要・repo public 前提・失敗時は Releases ページへフォールバック）。**`.dmg` 直リンクのクリック時はネイティブ `<dialog>` モーダル（`#macDlDialog`・`dlmodal.*` キー）で初回起動手順（Gatekeeper 回避の xattr＋コピーボタン）を表示**＝クリック時点の href が `.dmg` のときだけ・ダウンロードは堰き止めない（ヒーロー CTA が直リンク化して Download 節の注意書きに到達しない穴を塞ぐ。docs/macos-signing.md）。文言は `data-i18n` キーで英/日ライブ切替（`test`/`i18n` と同じ「文字列はハードコードせず catalog」精神）。ヒーロー/ホバー説明は SVG モックアップで仮置き＝実SS差し替え手順は `web/README.md`。**ヒーローの動作デモ（`web/demo.js`）は `prefers-reduced-motion: reduce` でも静止させずコマ送り（1秒刻み・`.dgb--steps` で transition オフ）**＝Android Chrome はバッテリーセーバー等で reduce になり静止フレームが「壊れて見える」ため（逆戻りガードは `web/README.md`）。OG カード（SNS 共有画像）は `web/assets/og.png`＝`npm run og`（`tools/gen-og.mjs`・capture-bar と同じ Electron capturePage 方式で HTML カードを 1200×630 に描画→保存。フォントは描画マシン依存＝Inter→LP スタックの順でフォールバック）で再生成。`index.html` の `og:image`/`og:url` は**絶対 URL**（クローラは相対を解決しない）。アプリ本体のコードとは独立（Electron 非依存）。**docs/ の設計ドキュメントと混ざらないよう `web/` に分離**（逆戻りガード）。プライバシーポリシーは `web/privacy.html`・利用規約は `web/terms.html`（どちらも `index.html` と同じ `app.js` の i18n/lang toggle を共有）。**ToS は Google OAuth 本番審査で同意画面へのリンク登録が必須のため用意**＝要件の原文引用→記載内容の対応表は `docs/google-oauth-legal-pages.md`。**privacy には Limited Use 宣言（`privacy.google.1`）と要求スコープの全列挙（`privacy.app.1`・openid/email 含む）があり、`google.js` の scope を変えたら privacy も同時更新**（スコープ追加は再同意も必要）。訪問数計測は **Cloudflare Web Analytics**（`index.html`・`privacy.html` の `</body>` 直前にビーコンスクリプト）＝Cookie 不要・同意バナー不要。**GA4 は検討の上不採用**（2026年時点で Consent Mode v2 が事実上必須＝同意バナー導入が要るため、依存ゼロ・ポップアップなしの方針と相性が悪いと判断。詳細と token 設定手順は `web/README.md`）。`privacy.html` はこのサイト自身のアナリティクスと、アプリ本体の非収集方針（トークン暗号化・ローカル保存・追跡なし）の両方を開示（Google OAuth 本番審査向けの手順は docs/google-oauth-publishing.md）。
- 寄付/支援導線: フリーウェア＝任意の寄付を **Ko-fi 1本**で受ける（プラットフォームは1つに統一。理由＝donor がアカウント不要・摩擦最小）。導線は**4点**: ①`.github/FUNDING.yml`（リポジトリの「Sponsor」ボタン・`ko_fi:`）②`web/` フッター（`footer.support`）③`web/` FAQ「無料ですか？」内の1文（`faq.support`）④設定ウィンドウのヘッダ右寄せの小さなリンク（`app.support`/`app.supportHint`・`#support-link`）。**#4「促すが急かさない」に従い、ポップアップ・使用日数カウント・通知は作らない＝静かなリンク1本まで**（オンボーディングや起動時バナーには入れない）。設定からの外部オープンは `shell:open-external`(IPC・http(s) のみ)＋preload `openExternal`（バーは常時クリックスルーで使わない）。**Ko-fi の URL/ユーザー名は各ファイル1箇所の定数/値**（`web/app.js` の `KOFI_URL`・`settings.js` の `KOFI_URL`・`FUNDING.yml` の `ko_fi:`。加えて `web/index.html` の footer/FAQ の href も同 URL）に集約＝ハンドル変更時はここだけ直す。**現在のハンドルは `mu_777`（`https://ko-fi.com/mu_777`）**。web の文言は英/日 catalog（`web/app.js`）、設定の文言は core i18n（英/日/中）に追加。
- 既定値: 言語は OS ロケールから自動選択（ja/zh はそれぞれ・その他→en） / 全曜日（土日含む）ON かつ **各曜日 0:00〜23:59（ほぼ一日中）＋昼休憩 12:00〜13:00**（`defaultWorkday()`）/ 下地表示 ON / 目盛り表示 ON / 太さ 16px / 辺は右 / カレンダー連携 OFF / **ログイン時自動起動 ON**。**自動起動を既定 ON にするのはアンビエントな常駐バーが再起動後に黙って消えて初見ユーザーを失うのを防ぐため**（隠さず初回オンボーディングで `onboarding.autoLaunchNote` として開示・設定で1クリック解除＝#4 と整合。Linux は `applyAutoLaunch` が早期 return で対象外＝Windows/macOS のみ有効）。**24 時間ちょうどは `validate` の `v.spanUnder24`（span<1440）で不可**なので `23:59` まで＝真夜中 1 分未満は下地のみ（バーは消えない）。初回起動が曜日・時刻に関係なく必ず区間内に入り水位が見える変化になることを狙う（`src/main/store.js` の `DEFAULT_SETTINGS`、`test/geometry-store.test.js` で担保）。

## 不変条件（変更時に壊さないこと）

1. **時刻は毎回 `timeSource.now()` から再計算**。経過時間の積算をしない（スリープ復帰・時刻変更対応の生命線）。
2. **core は Electron/DOM に依存させない**。ロジック追加時は `test/` にユニットテストを足す。
3. **通常時はテキストを出さない**。数値・時刻はホバー展開時のラベルのみ（アンビエント性）。**ユーザー可視文字列はハードコードせず `src/core/i18n.js` の catalog 経由**（英・日・中の全言語に同じキーを追加。`test/i18n.test.js` がキー集合の一致を担保）。
4. **「促すが、急かさない」**。色変化・点滅・通知・カウントダウン音などの「急かす」表現を足さない。減るのは塗りの長さのみ・色は一定。
5. **配置は `workArea` 基準**（タスクバー/Dock/メニューバーを避ける）。
6. **常時クリックスルー維持**（`setIgnoreMouseEvents(true,{forward:true})` を生成時に一度だけ設定）。展開中も入力を受けず素通しする（バーのクリックでは設定を開かない＝背後アプリの操作を奪わない。設定はトレイから）。
7. **カレンダーの秘匿情報は `settings.json` に入れない**（OAuth トークン/アカウントは `calendar-accounts.enc` に分離・エクスポート対象外）。予定は**毎秒取得しない**（タイマ取得＋tick で再クリップ）。予定の色帯も**残り側のみ・色は一定**（#4 と整合。予定で急かさない）。OAuth 資格情報は **Microsoft=client_id のみ＋PKCE／Google=client_id＋（非機密）client_secret＋PKCE**（Google はトークン交換に secret 必須。Microsoft には secret を足さない＝逆戻りガード）。**ICS 購読は再導入しない**（提供側キャッシュで追従が遅く鮮度要件を満たせない＝逆戻りガード。docs/calendar-integration.md 決定0）。**Outlook はローカル/クラウドを排他二択**で出す（両用同時のミスリードを作らない）。

## 検証方針
- 自動テストで担保できるのは **core**（時間・検証・幾何・**ディスプレイ照合**・store）と**カレンダーの純粋部分**（`calendar`(core) の幾何/正規化・PKCE・認可URL・各プロバイダの `mapEvents`）まで。
- バー描画・クリックスルー・ホバー展開・トレイ・自動起動・DPI、設定のエクスポート/インポート（`dialog`）、および**カレンダーの OAuth/取得/暗号保管**は **Windows 実機での手動確認**が必要（README のチェックリスト参照）。
- **id が実際に変わるかは実機でしか出ない**ので、ディスプレイ指定の保持（プライマリ以外を指定 → PC 再起動 → 同じディスプレイに出るか）は毎回チェックリストで見る。`findDisplay` のロジック自体は `test/display.test.js`。
- 設定 UI（時計入力・期間/休憩の分離）は自動テスト対象外。`<input type="time">` の表示形式は **OS ロケール依存**（24時間制 / AM/PM）なので、日本語 Windows と英語 Windows の両方で一度見る。

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
- カレンダー連携の決定記録（OAuth＋PKCE・Google は client_secret 必須/Microsoft は不要・ICS不採用・依存ゼロ・秘匿分離・終日除外・ポーリング頻度/クォータ・push通知非採用・逆戻りガード・OAuth アプリ登録手順）: `docs/calendar-integration.md`
- Google OAuth 一般公開の手順書（プライバシーポリシー・同意画面の本番化・sensitive scope 審査・テスト運用時の7日失効の注意。未実施）: `docs/google-oauth-publishing.md`
- Google OAuth 審査向け Privacy/ToS の要件根拠（公式原文の引用→記載内容の対応表・ToS 必須性の判断・Limited Use 宣言・**プライバシーポリシーの事実主張を保証しているコードの file:line 対応表＝「実装エビデンス」節**・逆戻りガード）: `docs/google-oauth-legal-pages.md`
- 配布チャネルの将来対応（winget / Homebrew cask の背景・登録手順・自動化方針。未実施）: `docs/distribution-channels.md`
- macOS 配布と Gatekeeper の決定記録（「壊れているため開けません」＝未署名アプリへの正常動作・無署名＋`xattr -cr` 案内で運用・右クリック→「開く」は効かない・署名/公証（年$99）導入時の手順。未実施）: `docs/macos-signing.md`
