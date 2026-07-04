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

クロスビルド: WSL(Linux)からは Windows のみ可（Wine 必要）。macOS(dmg)は macOS 専用ツール依存で不可 → 両OS分は `.github/workflows/build.yml`（windows/macos ランナーでネイティブビルド）を使う。手順は README「ビルド（配布物）」参照。WSL で生成した `.exe` が「このアプリはお使いの PC では実行できません」で起動しない時は、ベースの `electron.exe` がダウンロード途中で壊れている（生成物がキャッシュの electron.exe より小さい）疑い → `rm -rf ~/.cache/electron` で取り直して再ビルド。詳細は `docs/design.md`「既知の制限」。

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
| core | `src/core/` | 時間モデル(schedule)・検証(validate)・幾何(geometry)・時刻源(time-source)・多言語(i18n)・カレンダー幾何(calendar)・zip生成(zip＝依存ゼロのZIPライタ)・バージョン比較(version＝手動更新確認用)。**Electron/DOM非依存** |
| main | `src/main/` | エントリ(index)・バー窓(bar-window)・設定窓・トレイ・永続化(store)・ロギング(logger)・診断ダンプ(diagnostics)・カレンダー連携(`calendar/`: OAuth・プロバイダ・トークン暗号ストア・取得サービス) |
| preload | `src/preload/` | contextBridge（`.cjs`） |
| renderer | `src/renderer/bar`, `src/renderer/settings` | バー描画・設定UI |
| web | `web/` | 紹介・配布の静的サイト（GitHub Pages）。アプリ本体とは独立。英/日のライブ切替・OS判定・`releases/latest` を GitHub API で読み DL リンク自動反映 |

- 状態の流れ: main が毎秒 `getBarState(schedule, now)` を計算 → `bar:state` で renderer に push → renderer は純粋に描画。
- 設定の流れ: 設定UI → `settings:save`(IPC) → `validateSettings` OK で `store.save` → `store.onChange` でバーへ即時反映。`settings:reset`(IPC)＝設定を `store.getDefaults()`（＝`DEFAULT_SETTINGS`＋この端末の OS ロケール由来の言語）に戻して保存（`calendar-accounts.enc`＝OAuth接続・表示カレンダー選択は対象外＝保持）。`app:check-updates`(IPC)＝GitHub Releases を1回だけ見る**手動**の更新確認（自動チェックはしない＝#4）。日付の overrides は起動時に core `prunePastOverrides` で自動削除（昨日分は夜跨ぎ区間が続いている可能性があるため残す）。
- 初回導線: バーはクリックスルーで UI を持たないため、初回起動時のみ設定窓を自動オープン（`openSettingsWindow({firstRun:true})`→ renderer は `?firstRun=1` で `onboarding.trayHint` バナーを表示）して「設定はトレイから」を伝える。判定は `store.isOnboarded()`/`markOnboarded()`＝`userData/onboarded` センチネル（**settings.json と別＝エクスポート対象外**。インポートで初回案内が抑止されない・新端末が既済を継がない）。トレイのツールチップ（`tray.tooltip`）も恒久のフォールバック。**一度きり＝急かさない（#4）**。
- エクスポート/インポート: `settings:export`/`settings:import`(IPC) は `dialog.show{Save,Open}Dialog` でローカル JSON を読み書き（クラウドなし）。インポートは `validateSettings` OK のときだけ `store.save`、不正/破損時は何も適用せず UI にエラー表示。設定 UI に「開発」セクションは無い（時刻シミュレーションは環境変数専用）。
- ロギング（問題解析用）: `src/main/logger.js` の `createLogger({dir,level,mirror})` が `userData/logs/main.log` に追記（NDJSON 風の1行レコード `ISO LEVEL [scope] msg {json}`）。**サイズ上限で `main.log.1`/`.2` にローテーション**（既定 2MB×2）。レベルは `error<warn<info<debug`、**既定 info**。`level` は env で上げる: `DAYGLASSBAR_LOG_LEVEL=debug`（最優先）か `DAYGLASSBAR_DEBUG=1`。**開発(`npm start`＝未パッケージ)時は端末にもミラー**（`mirror:!app.isPackaged`）。`log.child('scope')` で `app:calendar` 等に分岐。**秘匿キー（token/secret/refresh 等）は自動で `[redacted]`・Error は name/message/stack に展開**。`process` の `uncaughtException`/`unhandledRejection` と `app` の `render-process-gone`/`child-process-gone` を捕捉。バーの `render-process-gone` は `bar-window.js` 側でも個別に捕捉し**自動 reload で復帰**する（常駐バーはレンダラーが死んだまま放置すると再起動まで無表示になるため）。各層へは `log.child(...)` を注入（store/bar/calendar）。**core 非依存（fs/path のみ）で `test/logger.test.js` がローテ・しきい値・redaction を担保**。書き込み失敗は握り潰し＝ログでアプリを落とさない。このログを上の診断ダンプが同梱する。
- 診断ダンプ（サポート用）: 設定UIの「診断情報を保存」ボタン →`diagnostics:export`(IPC) →`src/main/diagnostics.js` が **ログ(`userData/logs/*`)＋環境情報(`environment.json`：版・OS・ロケール・ディスプレイ/workArea)＋現在の `settings.json`** を core の `createZip` で1つの `.zip` にまとめ、`dialog.showSaveDialog` で保存後にフォルダで reveal。**送信手段はユーザー任せ＝アプリからメール/フォーム送信はしない（クラウドなし）**。**秘匿情報は同梱しない**（OAuth トークン/アカウント＝`calendar-accounts.enc` は読まない・#7）。
- 多言語: 英・日・中（`en`/`ja`/`zh`）対応。**未保存時の既定言語は OS ロケール由来**: core の純関数 `languageFromLocale`（ロケールタグ→対応言語の写像のみ。ja/zh はそれぞれ・他は en）を main が `languageFromLocale(app.getLocale())` として `createStore(dir, log, {defaultLanguage})` に注入し、store がインスタンス既定として保持（`app.getLocale()` は Electron API なので呼ぶのは main のみ）。core の `DEFAULT_LANGUAGE` は `'en'` のまま＝未知ロケール・注入なし時のフォールバック。**明示保存された `settings.language` が常にこの既定より優先**（一度保存すれば OS 言語に追従しない）。メッセージ catalog と `t(lang,key,params)` は `src/core/i18n.js`（core＝Electron/DOM 非依存・テスト対象）。main は直接 import、renderer は `i18n:catalog`(IPC) で catalog を受け取り設定UIで言語をライブ切替。`validateSettings` は文言を持たず `{path, code, params}`（`code` は `v.*` キー）を返し、表示側が現在言語で整形する。バーは語を持たず `bar:state.strings`（main が現在言語で同梱）を描く。言語は `settings.language` に永続化。詳細は docs/design.md「多言語対応（i18n）」。
- カレンダーの流れ: `CalendarService`(`src/main/calendar/`) が**2系統の別タイマ＋接続/設定変更時＋スリープ復帰時**に取得・キャッシュ → bar-window が push 時に `getBarState` の `events` に渡す → core `computeEventSegments` が**残り側のみ**に色帯化（過ぎた予定は消える）。**取得は cloud（Google/Graph）=1分・Outlook local=5分の2系統に分離**（cloud は安いHTTP GET なので速く追従／local は毎回 PowerShell+COM を起動するので低頻度）。各系統は最後の結果を保持し `recombine`＝`normalizeEvents([...cloudRaw,...localRaw])` で1つのキャッシュにマージ（片方の速い更新でもう片方を落とさない）。**取得全滅時は前回結果を保持**（cloud は provider＝`google`/`microsoft` 単位で対象カレンダーが全件失敗したときだけ・local は catch 節で保持）＝オフラインやトークン失効の一時的な失敗で色帯が数十秒〜数分消える現象を防ぐ（無効化＝未試行の source は従来どおりクリアされる）。cloud の認証/取得エラーは `health`（providerId→直近のエラー）に記録され `calendar:status` の `error` として設定UIの該当プロバイダ欄に警告表示される（`calendar.connectError`）。スリープ復帰は `powerMonitor` の `resume`→`calendar.refresh()` で即時最新化（タイマ停止中に古くなった予定を待たずに更新。時刻計算自体は #1 で常時再計算）。ユーザー向けは**2プロバイダで各々に表示ON/OFF＋色**: **Google**＝クラウド OAuth のみ／**Outlook**＝接続方法を排他二択（`local`＝クラシック Outlook を `outlook-local.js` の PowerShell/COM でローカル読み取り・承認不要・Windowsデスクトップ専用／`cloud`＝Microsoft Graph OAuth・企業は管理者承認が要る場合あり）。**ただし現状 `cloud` は UI 上では未対応扱い**＝排他二択トグルと OAuth コードは残すが、`cloud` を選ぶと設定UIは未対応の説明文を出し「Connect Microsoft」ボタンを無効化する（`settings.js` の `renderCalendarConnections`／`buildConn(..., {disabled})`。理由＝企業テナントの管理者承認・テナント用意が難しい）。再開は UI ガードを外すだけ。各予定に `provider` タグを付けバーが色分け。OAuth は `calendar:connect`/`disconnect`→PKCE/ループバック。**表示カレンダーはユーザーが複数選択可**（決定9）: 一覧は `fetchCalendars`(cloud)/`listOutlookLocalCalendars`(local)＝`calendar:list-calendars` IPC で取得、選択は `calendar:set-selection` IPC で**暗号ストアに保存**（`CalendarService` は選択 ID ごとに取得＝**カレンダー単位の try/catch**で1つ失敗でも他を落とさない／**未選択時のみ primary・既定 1 本にフォールバック**）。Outlook cloud の選択コードも実装済みだが決定0b で UI 未到達。**ICS 公開URL購読は一度実装後に撤回**（提供側キャッシュで更新が数時間〜1日遅れ＝予定変更への追従が要件不足。逆戻りガードは docs/calendar-integration.md 決定0）。**OAuth トークン・アカウント＋表示カレンダー選択は `settings.json` ではなく `userData/calendar-accounts.enc`（safeStorage 暗号化）に分離＝エクスポート対象外**（Google のカレンダーIDはメールになり得るので選択もここ＝決定9）。**表示設定（有効/色/method）は非秘匿なので `appearance.calendar` に保存**。詳細は docs/design.md「カレンダー連携」。
- IPC一覧・設定スキーマは docs/design.md。
- 紹介・配布ページ: `web/`（静的・依存ゼロ）を GitHub Pages で公開（`https://mu-777.github.io/dayglassbar/`）。`.github/workflows/pages.yml` が `web/` をそのまま Pages へアップロード（ビルド工程なし＝set-and-forget。Source は一度だけ「GitHub Actions」に設定）。**DL リンクは `web/app.js` がブラウザから `releases/latest` を GitHub API で読み、`v*` タグで Actions が公開した最新 `.exe`/`.dmg` を自動反映**（リリースごとの手編集不要・repo public 前提・失敗時は Releases ページへフォールバック）。文言は `data-i18n` キーで英/日ライブ切替（`test`/`i18n` と同じ「文字列はハードコードせず catalog」精神）。ヒーロー/ホバー説明は SVG モックアップで仮置き＝実SS差し替え手順は `web/README.md`。OG カード（SNS 共有画像）は `web/assets/og.png`＝`npm run og`（`tools/gen-og.mjs`・capture-bar と同じ Electron capturePage 方式で HTML カードを 1200×630 に描画→保存。フォントは描画マシン依存＝Inter→LP スタックの順でフォールバック）で再生成。`index.html` の `og:image`/`og:url` は**絶対 URL**（クローラは相対を解決しない）。アプリ本体のコードとは独立（Electron 非依存）。**docs/ の設計ドキュメントと混ざらないよう `web/` に分離**（逆戻りガード）。
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
- 自動テストで担保できるのは **core**（時間・検証・幾何・store）と**カレンダーの純粋部分**（`calendar`(core) の幾何/正規化・PKCE・認可URL・各プロバイダの `mapEvents`）まで。
- バー描画・クリックスルー・ホバー展開・トレイ・自動起動・DPI、設定のエクスポート/インポート（`dialog`）、および**カレンダーの OAuth/取得/暗号保管**は **Windows 実機での手動確認**が必要（README のチェックリスト参照）。

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
- 配布チャネルの将来対応（winget / Homebrew cask の背景・登録手順・自動化方針。未実施）: `docs/distribution-channels.md`
