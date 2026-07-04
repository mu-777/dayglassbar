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
| `app:version` | invoke | `app.getVersion()`（＝`package.json` の `version`）を返す。設定ウィンドウのフッタにバージョンを表示するため（インストール版でログ/診断以外に版を読める唯一の場所） |
| `app:check-updates` | invoke | GitHub Releases API（`releases/latest`）を1回だけ呼び、現在のバージョンと比較する**手動**の更新確認。自動チェックはしない（不変条件 #4）。設定フッターの「更新を確認」ボタン専用。`{ok, current, latest, hasUpdate, url}` か `{ok:false, error}`。fetch は 10 秒でタイムアウト |
| `settings:save` | invoke | 検証OKなら保存（→onChangeでバー即時反映） |
| `settings:reset` | invoke | 設定を初期値（`store.getDefaults()`＝`DEFAULT_SETTINGS`＋この端末の機械既定の言語）に戻して保存（→onChangeで反映）。言語も端末の機械既定（OS ロケール由来）に戻る。`calendar-accounts.enc`（OAuth接続・表示カレンダー選択）は対象外＝保持される。`{ok:true}` か `{ok:false, error}` |
| `settings:export` | invoke | `showSaveDialog` で選んだ JSON ファイルへ現在の設定を書き出す（ローカルファイルのみ） |
| `settings:import` | invoke | `showOpenDialog` で選んだ JSON を読み、`validateSettings` OK なら `store.save`（→onChangeで反映）。不正/破損時は何も適用しない |
| `diagnostics:export` | invoke | ログ＋環境情報＋現在の設定を1つの `.zip` にまとめ、`showSaveDialog` で選んだ場所へ保存（保存後にフォルダで reveal）。送信はユーザー任せ＝ネットワーク無し。秘匿情報（OAuth トークン/アカウント＝`calendar-accounts.enc`）は含めない。`{ok, filePath}` か `{ok:false, canceled/error}` |
| `i18n:catalog` | invoke | 全言語のメッセージ catalog（`{languages, defaultLanguage, languageNames, messages}`）を返す。設定 UI が言語をライブ切替するため |
| `displays:list` | invoke | ディスプレイ一覧（`{id, primary, width, height, x, y}` の生データ。ラベル文字列は renderer が現在言語で組み立てる） |
| `calendar:status` | invoke | 接続状態（`{accounts:[{provider,label,connected,email,error}], encryptionAvailable}`）。`error` は直近の取得/認証エラー（無ければ空文字列）。**秘匿情報は返さない**（トークンは main 内・別ストア）。設定 UI が表示に使う |
| `calendar:connect` | invoke | 指定プロバイダの OAuth フローを実行（システムブラウザを開く）。成功時はオーバーレイを自動 ON。`{ok, accounts}` か `{ok:false, error}` |
| `calendar:disconnect` | invoke | 指定プロバイダの接続を解除（トークン破棄＋その source の選択も破棄）。`{ok, accounts}` |
| `calendar:list-calendars` | invoke | 指定 source（`google`/`microsoft`/`outlook-local`）の表示カレンダー一覧＋現在の選択を返す（`{ok, calendars:[{id,name,primary}], selected:[ids]}` か `{ok:false, error}`）。設定 UI の「表示カレンダーを選択」で遅延取得 |
| `calendar:set-selection` | invoke | 指定 source の表示カレンダー（id 配列）を保存＋即時再取得。選択は暗号ストアに入る（settings.json でない）ため Save とは独立。`{ok, selected}` |
| `shell:open-external` | invoke | 渡された URL をシステムブラウザで開く。**`http(s)` のみ許可**（`file://`/`app:` 等は弾く）。設定ヘッダの寄付リンク（Ko-fi）専用。バーは常時クリックスルーで何も開かないため使わない |
| `bar:state` | main→renderer | 毎秒の描画状態（`state/appearance/expanded/strings`。`strings` は現在言語の「区間外」「残り …」ラベルに加え、区間外(`empty`)で次の区間が見つかったときだけ `strings.next`（例: `Next Mon 9:00`・任意）を持つ。`state.events` は区間内の予定帯 `[{from,to,title,provider}]`・`provider` で色分け） |

## 設定スキーマ（`src/main/store.js` の DEFAULT_SETTINGS）

```jsonc
{
  "version": 1,
  "language": "en", // 'en' | 'ja' | 'zh'。既定は OS ロケール由来（ja/zh 以外は en）。UI 全体（設定/トレイ/バーのホバーラベル）の言語
  "schedule": {
    // 既定では月〜日すべて defaultWorkday()（0:00〜23:59・昼休憩）= 土日も ON。
    // → 初回起動が曜日・時刻に関係なく必ず区間内に入り、水位が見える。
    //   24 時間ちょうど（span 1440）は validate の v.spanUnder24 で不可なので 23:59 まで。
    //   真夜中の 1 分未満のすき間は 'empty'（下地のみ）でバー自体は消えない。
    "weekly": { "mon": {"enabled":true,"start":"0:00","end":"23:59","breaks":[{"start":"12:00","end":"13:00"}]}, /* …sun（土日含む全曜日 ON） */ },
    "overrides": { "2026-06-15": {"enabled":true,"start":"10:00","end":"15:00","breaks":[]} }
  },
  "appearance": {
    "displayId": null, "edge": "right", "thickness": 16,
    "color": "#4a90d9", "opacity": 0.9,
    "track": {"enabled": true, "opacity": 0.18},
    "breakColor": "#8a8f98",
    "ticks": {"enabled": true, "intervalMinutes": 60},
    "calendar": {
      "google":  {"enabled": false, "color": "#c98a3a"},
      "outlook": {"enabled": false, "color": "#4a9e9e", "method": "local"} // 'local' | 'cloud'
    }
  },
  "behavior": { "autoLaunch": false, "hover": {"dwellMs": 350, "expandedThickness": 56} }
}
```

- **`appearance.calendar` には各プロバイダの表示設定（有効/色）と Outlook の接続方法（`method`）だけを持たせる**。OAuth の接続アカウントとリフレッシュトークンは `userData/calendar-accounts.enc`（safeStorage で暗号化）に分離し、**`settings.json` には入れない＝エクスポートに含めない・`validateSettings` も触れない**（後述「カレンダー連携」）。

- 保存は tmp ファイル＋rename の原子的書き込み。読み込み失敗時はデフォルトへフォールバック。
- `mergeWithDefaults` で将来のキー追加に前方互換（既存ファイルに無いキーはデフォルト補完、配列は data 優先）。
- 既定値は「初回起動が曜日・時刻に関係なく必ず見える変化になる」ことを狙う: 土日も ON・下地表示 ON・目盛り表示 ON・太さ 16px・辺は右。

## 設定のエクスポート/インポート（ローカルファイルのみ）

- クラウド連携はしない。`settings:export`/`settings:import`（IPC）は Electron の `dialog.show{Save,Open}Dialog` でファイルを選ぶ方式。
- エクスポート: 現在の `store.get()` を JSON で書き出す。
- インポート: 読み込んだ JSON を **既存の `validateSettings`** で検証し、OK のときだけ `store.save`（→ `store.onChange` でバーへ即時反映）。不正/破損 JSON は何も適用せず、設定 UI にエラー表示。
- ボタン配置は設定画面フッターを `justify-content: space-between` の1行にし、**左に「エクスポート」「インポート」**、**右にコミット系（ステータス＋「保存して適用」）**を置く。コミット操作（保存して適用）への誤クリックを避けるための分離。
- 設定 UI に「開発」セクションは置かない。時刻シミュレーションは環境変数（`DAYGLASSBAR_FAKE_NOW`/`DAYGLASSBAR_TIME_SCALE`/`DAYGLASSBAR_TIME_OFFSET_MIN`）専用（spec §7 / `src/core/time-source.js`）。

## ログと診断ダンプ（問題解析用）

他ユーザー環境での不具合を後から解析できるようにする仕組み。「ログを仕込む」側と「ユーザーが集めて送る」側を分けて設計した。

- **送付経路は意図的にアプリへ入れない**。当初は専用メール/フォーム送信（Google Forms・Tally 等）を検討したが、(a) クラウド送信は本アプリの no-cloud 方針に反し、(b) 設定画面に送信 UI まで持たせるのは過剰、と判断。**アプリの責務は「解析可能な束（zip）を作る」まで**とし、送付手段はユーザー任せにした。**Google Forms はファイルアップロード設問が回答者に Google ログインを強制する**ため匿名添付に不向き、という裏取りも不採用理由（逆戻りガード：送信 UI を再導入しない）。
- **ロガー方式**: `src/main/logger.js`。`userData/logs/main.log` へ1行レコードを追記し、サイズ上限で `main.log.1`/`.2` にローテーション（既定 2MB×2＝端末を圧迫しない）。外部依存ゼロ（`electron-log` 等を足さない）・**Electron 非依存**（`dir` を注入）なので `test/logger.test.js` で**ローテ・しきい値・redaction**を担保。書き込み失敗は握り潰す（ログ起因でアプリを落とさない）。レベル `error<warn<info<debug`・既定 info、env（`DAYGLASSBAR_LOG_LEVEL`/`DAYGLASSBAR_DEBUG`）で引き上げ。dev は端末にもミラー。
- **どこに仕込むか**: 「失敗が握り潰されていて外から見えない箇所」を最優先。具体的には CalendarService の各 source 取得失敗（cloud fetch / Outlook local / トークン更新・safeStorage 不可）、store の破損読み込みフォールバック・保存失敗、bar の生成/配置の display フォールバック（spec 4.2）・毎秒 tick の例外・renderer ロード失敗、起動コンテキスト（版/OS/locale/ディスプレイ数/時刻シミュレーション）、IPC の保存/インポート検証却下・カレンダー接続/解除・診断保存の結果、自動起動適用失敗、そしてプロセス全体の `uncaughtException`/`unhandledRejection`・`render/child-process-gone`。**秘匿値は redaction で二重に防ぐ**（そもそも渡さない＋キー名一致で `[redacted]`）。
- **診断ダンプ**: 設定 UI「診断情報を保存」→ `diagnostics:export`（IPC）→ `src/main/diagnostics.js` が上記ログ＋`environment.json`＋現在の `settings.json` を core の `createZip`（依存ゼロの ZIP ライタ・`src/core/zip.js`/`test/zip.test.js`）で1つの `.zip` にまとめ、`showSaveDialog` 保存後にフォルダで reveal。**秘匿情報（OAuth トークン/アカウント＝`calendar-accounts.enc`）は読まない**。

## 多言語対応（i18n）

- 対応言語は **英・日・中（`en`/`ja`/`zh`）。未保存時の既定言語は OS ロケール由来**: core の純関数 `languageFromLocale`（`src/core/i18n.js`・テスト対象）がロケールタグを対応言語に写像（ja/zh はそれぞれ・他は en）し、main が `app.getLocale()`（Electron API のため main のみで呼ぶ）から導出して `createStore(dir, log, {defaultLanguage})` にインスタンス既定として注入する。core の `DEFAULT_LANGUAGE='en'` は未知ロケール・注入なし時のフォールバック。明示保存された `settings.language` は常にこの既定より優先され、リセット（`settings:reset`→`store.getDefaults()`）も同じ機械既定に戻る。
- catalog（全言語のメッセージ）と `t(lang, key, params)` は `src/core/i18n.js` に集約。**core なので Electron/DOM 非依存・テスト対象**（`test/i18n.test.js` が「全言語が同一キー集合を持つ」ことを担保）。
- main は `i18n.js` を直接 import して使う（トレイ・ダイアログ・`bar:state` の `strings`・I/O エラー文言）。
- renderer は **`file://` 越しの ESM import が Chromium にブロックされる**ため、`i18n:catalog`（IPC）で catalog 全体を受け取り、renderer 内の軽量 `t()` で描画する。これにより**言語ドロップダウンの切替を保存せずライブ反映**できる（`collect()` で入力中の値を退避→言語を差し替えて再描画）。
- 検証メッセージは locale を持たせない: `validateSettings` は `{path, code, params}`（`code` は `v.*` の i18n キー）を返し、表示側（設定 UI）が現在言語で整形する。曜日名・特定日ラベルも `params`（`{labelKind, dayKey|date, index}`）から表示側で組み立てる。
- バーは言語ロジックを持たない（不変条件 #3 のホバーラベルのみ）。必要な語（`区間外`/`残り {v}`）は main が `bar:state.strings` に載せて渡す。

## カレンダー連携（複数 source / 区間内オーバーレイ）

予定のある時間帯をバー上で色付けし、ホバーでタイトルを出す（spec 4.6）。決定の経緯・不採用案・逆戻りガードは `docs/calendar-integration.md`。要点だけここに記す。

- **ユーザー向けは2プロバイダ。各々に表示 ON/OFF と色**（`CalendarService` が `getEvents(start,end)` 相当で集めて `normalizeEvents`。各予定に `provider` タグを付け、バーが色分け）:
  - **Google** — クラウド OAuth（Google Calendar API）。ローカル手段は無い。
  - **Outlook** — 接続方法を**いずれか一つ**: `local`（`src/main/calendar/outlook-local.js`・クラシック Outlook を PowerShell/COM でローカル読み取り・サインイン不要・Windows デスクトップ専用・承認不要）／`cloud`（Microsoft Graph OAuth・企業テナントでは管理者承認が要る場合あり）。設定UIでは**排他の二択**として出す。**ただし `cloud` は当面 UI 未対応扱い**（トグルと OAuth コードは残し、選ぶと未対応の説明＋「Connect Microsoft」無効化。理由・再開手順は `docs/calendar-integration.md` 決定0b）。
- **ICS 公開URL は一度実装後に撤回**: 提供側キャッシュで更新が数時間〜1日遅れ、「仕事中の予定変更に速く追従」要件を満たせないため（理由・逆戻りガードは `docs/calendar-integration.md` 決定0）。
- `区間＝1本のバー` の抽象は不変、予定は区間内のオーバーレイ。下流（`normalizeEvents`/`computeEventSegments`・描画）は source 非依存。
- **認証は RFC 8252「AppAuth パターン」**: システムブラウザ＋PKCE＋ループバック（`127.0.0.1:<ephemeral>`）。両プロバイダで**同一の汎用フロー1本**（`src/main/calendar/oauth.js`）を共有し、`google.js`/`microsoft.js` はエンドポイント・スコープ・JSON マッピングだけを持つ。**資格情報はプロバイダで異なる**: Microsoft は真のパブリッククライアントで **client_id のみ**（PKCE が代替）／Google「デスクトップアプリ」型は**トークン交換に `client_secret` を要求する**ため **client_id＋client_secret**（Google は非機密扱いだが必須）。`oauth-url.js` は `config.clientSecret` がある時だけ付与（詳細・逆戻りガードは `docs/calendar-integration.md` 決定2）。
- **依存ゼロ**: ベンダー SDK（googleapis / msal-node）は使わず、Node 標準（`crypto`=PKCE、`http`=ループバック受け、`fetch`=トークン/取得）で実装。
- **秘匿の分離**: **OAuth の**リフレッシュトークン＋接続アカウント、および**表示カレンダーの選択**（`selections`）は `userData/calendar-accounts.enc`（Electron `safeStorage` で暗号化）に保存し、`settings.json`（エクスポート対象）からは外す。**選択をここに置く理由**＝Google のカレンダー ID はアカウントのメールアドレスそのものになり得るため、エクスポートに載せない（決定9）。一方 **表示設定（各プロバイダの有効/色・Outlook の method）は非秘匿なので `appearance.calendar` に置く＝エクスポート可**。`safeStorage` 不可環境では平文フォールバック＋設定 UI に注意表示（`calendar.encUnavailable`）。
- **表示カレンダーの選択（複数可・決定9）**: 各 source が公開するカレンダーを一覧し、表示するものをユーザーが選ぶ。一覧は Google=`users/me/calendarList`／Graph=`/me/calendars`／Outlook local=COM で全ストアのカレンダーフォルダ（`DefaultItemType=1`）を深さ制限付き列挙（`fetchCalendars`/`mapCalendars`(cloud)・`listOutlookLocalCalendars`/`mapOutlookFolders`(local)）。取得は `fetchEvents(token,start,end,calendarId)` を選択 ID ごとに呼び**カレンダー単位の try/catch**でマージ（1つの 404/権限切れで他を落とさない）。**選択が空のときのみ primary/既定 1 本にフォールバック**（旧挙動と後方互換）。設定 UI は「表示するカレンダーを選択」ボタンで `calendar:list-calendars` を遅延取得→チェックボックス、トグルで即 `calendar:set-selection`（Save とは独立＝選択は暗号ストア）。Outlook cloud の選択コードも同形で実装済みだが決定0b で UI 未到達。
- **取得は毎秒ではない**: `CalendarService`（`src/main/calendar/index.js`）が**タイマ＋接続/設定変更時＋スリープ復帰時**にだけ取得してキャッシュし、毎秒の bar tick は `getBarState` でキャッシュを `now` に再クリップするだけ（不変条件 #1 を維持）。アクセストークンは期限までメモリ保持、`offline_access`/`access_type=offline` でリフレッシュ、Microsoft のローテーションにも追従。オーバーレイが無効/未接続なら取得しない。
- **取得タイマは cloud/local で分離**（`REFRESH_CLOUD_MS=1分` / `REFRESH_LOCAL_MS=5分`）。理由＝**cloud（Google/Graph）は安い HTTPS GET** なので短間隔でプロバイダ側の編集に速く追従できる（Google のクォータは日100万回規模・ユーザー毎分数百回規模＝1分間隔=約1,440回/日で桁違いに余裕。アクセストークンはキャッシュするので毎分リフレッシュは走らない）。一方 **Outlook local は毎回 PowerShell+Outlook COM プロセスを起動**するため低頻度に保つ（起動中の Outlook を毎分つつかない）。両者は最後の結果（`cloudRaw`/`localRaw`）を保持し `recombine`＝`normalizeEvents([...cloudRaw,...localRaw])` で1キャッシュにマージ（片方の速い更新でもう片方を落とさない）。`recombine` は「空→空」では `notify` しない（カレンダー OFF が既定なので無駄な再描画を出さない）。**逆戻りガード**: cloud と local を**同一の単一タイマに戻さない**（local の PowerShell 起動が cloud と同頻度になり重くなる）。
- **keep-last-good（全滅時の前回結果保持）**: 1回のリフレッシュで対象カレンダーが**全件**失敗した場合（オフライン・トークン失効・PowerShell 一時失敗など）は、その回だけ前回の `cloudRaw`（provider 単位＝google/outlook）または `localRaw` を再利用し、色帯が数十秒〜数分だけ消えて見える現象を防ぐ（無効化して「試行していない」source は対象外＝従来どおりクリアされる）。cloud 側は provider（`google`/`microsoft`）ごとの成否を `health`（providerId→直近のエラー文言）に記録し、`calendar:status` の各アカウントに `error` として同梱、設定UIがプロバイダ接続欄に警告文（`calendar.connectError`）で表示する（トークン失効等を「静かに古くなる」ままにしない）。
- **スリープ復帰で即時取得**: `powerMonitor` の `resume`（`src/main/index.js`）で `calendar.refresh()`（cloud+local 両方を即取得）。スリープ中はタイマが止まり予定が古くなるため、次の間隔を待たず復帰直後に最新化する（時刻計算自体は #1 で常に正しい）。
- **何を「予定」とみなすか（spec §10 の決定化）**: read-only スコープ（Google `calendar.events.readonly`＋一覧取得用 `calendar.calendarlist.readonly` / Graph `Calendars.Read`）。**終日予定・辞退済み・"空き(free/transparent)" 表示は除外**。判定とフィルタは core `normalizeEvents`（純粋・テスト対象）、JSON→共通形式は各プロバイダの `mapEvents`（純粋・テスト対象）。
- **描画は休憩と同じ「残り側のみ」**: 過ぎた予定は経過分と一緒に消える。色帯は fill の上・目盛りの下に描き、ホバー時のみタイトルを帯幅にクリップ（省略記号）して重ねる（`src/renderer/bar/bar.js`）。色は一定・点滅や危機色なし（不変条件 #4）。
- **テスト可能な切り分け**: PKCE・認可 URL 生成・各プロバイダの `mapEvents`/**`mapCalendars`**・**`mapOutlookJson`/`mapOutlookFolders`/`decodeLocalCalendarId`**・`computeEventSegments`/`normalizeEvents`（`provider` 受け渡し）はユニットテスト（`test/calendar*.test.js`/`test/outlook-local.test.js`）。**ブラウザ起動・ループバック・暗号保管・実 API・COM 実行・カレンダー一覧取得と複数選択の取得は Windows 実機での手動確認**（検証方針どおり）。
- **新 Outlook / Web の制約**: COM が無く、データはクラウド側のため**完全ローカル読み取りの正規手段は無い**＝クラウド OAuth（管理者承認が要る場合あり）になる。ローカル Outlook は **Windows＋クラシック Outlook 起動中**が前提（GPO の「プログラムによるアクセス」禁止で不可の場合あり）。
- **開発用フェイク源**: `DAYGLASSBAR_FAKE_EVENTS="16:00-16:30 Standup;…"`（時刻シミュレーションと同系統）で OAuth/ネットワーク無しに色帯/ホバーを目視できる（`src/main/calendar/fake-events.js`）。
- **開発者の一度きりの準備**: Google Cloud で「デスクトップアプリ」型 client_id、Azure で「パブリッククライアント」アプリ（ループバックリダイレクト・`Calendars.Read`）を登録。値は `src/main/calendar/config.js` に集約し、**gitignore 済みの `client-ids.local.json`**（`client-ids.local.example.json` をコピー）か env（`DAYGLASSBAR_GOOGLE_CLIENT_ID`/`DAYGLASSBAR_MS_CLIENT_ID`・優先）で渡す。client_id は秘密ではないが自分のプロジェクト識別子なので実値はリポジトリに置かない。未設定なら接続時に「client_id not configured」を返す。

## モジュール構成と責務

| 層 | 場所 | 責務 | Electron依存 |
| --- | --- | --- | --- |
| core | `src/core/` | 時間モデル・検証・ジオメトリ・時刻源・i18n・カレンダー幾何(`calendar.js`)・バージョン比較(`version.js`) | **なし（テスト対象）** |
| main | `src/main/` | ウィンドウ・トレイ・IPC・永続化・自動起動・カレンダー連携(`calendar/`) | あり |
| preload | `src/preload/` | contextBridge（CJS） | あり |
| renderer | `src/renderer/` | 描画・設定UI（純描画/DOM） | なし |

- `store.js` のみ main 配下だが純Nodeでテスト可能（ディレクトリ注入）。`src/main/calendar/` のうち electron 非依存な `pkce.js`/`oauth-url.js`/`google.js`/`microsoft.js`（`mapEvents`）もテスト対象。
- 自動テストで担保できるのは core（時間・検証・幾何・store）とカレンダーの純粋部分まで。**GUI/常駐挙動・OAuth/ネットワークは Windows 実機での手動確認**が前提。

## 既知の制限
- 排他フルスクリーンアプリの上には出ない（OS仕様。spec 9）。ボーダーレス全画面では被るのは期待動作。
- Linux はスコープ外（自動起動も skip）。
- `resizable` トグルは上記の回避策（環境によっては不要）。
- **WSL ビルドの `.exe` が「このアプリはお使いの PC では実行できません」で起動しないことがある**（2026-06 実機確認）。原因はベースの `electron.exe` がダウンロード/展開途中で壊れる一過性の破損で、生成物が `~/.cache/electron/electron-*-win32-x64.zip` 内の `electron.exe` より約1MB小さく（欠損）なる。PE ヘッダ（machine=x64・PE32+・GUI・エントリポイント）は正常なので `file`/objdump では検出できず、Windows ローダーだけが弾く。**WSL/クロスビルド自体やアーキ不一致・ファイルシステム（9p vs ext4 は生成物 md5 一致で無関係）が原因ではない**。対処は `rm -rf ~/.cache/electron && npm run dist:win` で取り直して再ビルド（生成物サイズがキャッシュ electron.exe 以上になることを確認）。`build` 設定は健全。
- **Windows portable の自動起動は `PORTABLE_EXECUTABLE_FILE` を登録パスに使う**（`applyAutoLaunch()`／`src/main/index.js`）。portable ターゲットは実行のたびに一時フォルダへ自己展開するため、素の `process.execPath`（＝一時フォルダ内のパス）を `setLoginItemSettings` に登録すると次回ログイン時にはそのパスが消えていて起動しない。electron-builder が portable 実行時に設定する環境変数 `PORTABLE_EXECUTABLE_FILE`（実体の `.exe` パス）が使えるときはそちらを優先する。

## 依存の追従（保守メモ）
- `electron` は `^33`（2024-10 系）。Electron は**メジャー3世代のみサポート**の方針のため、本バージョンは既に Chromium 側のセキュリティ更新の対象外になっている。レンダラーはローカルの静的ファイルのみを読み込み外部コンテンツを描画しないため攻撃面は小さいが、無期限に据え置いてよい理由にはならない。**年に数回、メジャーバージョン追従を保守タスクとして行いたい**（今回のタスクでは実施しない＝バージョン・`engines` とも変更なし。メモのみ）。
- 追従時に実機で確認すべき回帰ポイント: 透過ウィンドウの描画、常時クリックスルー（`setIgnoreMouseEvents`）、常時最前面（`docs/always-on-top.md` の再宣言ポーリング方式）、トレイアイコン、`safeStorage`（カレンダートークンの暗号化）。いずれも Electron のマイナーな内部変更で壊れうる箇所（既存の「検証方針」節のとおり自動テストが届かない領域）。
- 追従は `engines.node`（現在 `>=18`）を CI（GitHub Actions・Node 20）に合わせて `>=20` へ上げる作業とセットで行う（Electron のメジャー更新は同梱 Node も上がるため、ローカル開発の最低要求も足並みを揃える）。

## アイコン
- マークは「画面の端に灯る静かな光」というアプリの**人格**を表す抽象記号（クール青、ダークな"画面"フィールド＋端の光の筋）。アイコンの仕事は機能の説明ではなく識別なので、**残り時間の仕組みは説明しない**。
- 時計/砂時計/トグル/進捗バーには意図的に寄せない。カテゴリの常套記号を避けることが差別化であり、不変条件#4「急かさない」とも整合する。名前 DayGlass の文字どおりの整合はワードマーク側で担保する方針（砂時計は描かない）。
- 端の筋は**下が濃く・上が薄い** = アプリの実挙動（塗りは下へ縮み、残りが下に溜まる）に向きを合わせる。
- Windows のトレイ（カラー）はアプリアイコンの縮小版（`appIcon(32)`）= 実行時のトレイアイコンを**インストール/エクスプローラのアイコンと一致**させる。macOS のメニューバーは黒+αの template が必須でダークな"画面"フィールドを描けない（黒い四角に潰れる）ため、同じ**端の筋（右寄り・下が濃い）**を一色で表す。16px・モノクロで時間ニュアンスが落ちるのは想定どおり。
- 生成は依存ゼロの `tools/gen-icons.mjs`（`npm run icons` で `assets/` の icon/tray/template を全出力）。
- 決定の経緯・不採用案とその理由は `docs/icon-design.md`（逆戻りガード）。

## 今後（spec 8）
- カレンダー連携の精緻化: busy 判定の調整、1プロバイダ複数アカウント接続、深い階層の共有カレンダー列挙（現状 Outlook local は深さ8まで）。（表示カレンダーの選択は実装済み＝決定9。）
- トレイからのクイック操作（未実施・構想）: トレイメニューに「今日を休みにする」「今日だけ終了を +30 分」等を足し、設定画面を開かずに当日の揺らぎへ追従できるようにする。実装は既存機構にそのまま乗る:
  - 実体は overrides への当日エントリ書き込み（`validateSettings` → `store.save` で即時反映。翌日以降は起動時の `prunePastOverrides` が自動削除）。新しい永続化は作らない。
  - 「今日」は素朴なカレンダー日ではなく `getActiveDaySummary` の anchor 日（夜跨ぎ区間の帰属日）を対象にする（プロダクト原則7）。
  - 延長は validate の制約（span<24h・翌日区間と重ならない）に収まるよう丸め、収まらない場合はメニュー項目を無効化する（エラーポップアップは出さない）。
  - 文言は 3 言語の catalog に追加（不変条件 #3）。ユーザー起点の静かな操作なので #4「急かさない」と整合。
  - 未決: 項目の粒度（休み／±30分／今すぐ終了）と取り消し導線（メニューに「上書きを取り消す」を出すか、設定画面に任せるか）。
- 配布チャネル（winget / Homebrew cask）: 背景・手順は `docs/distribution-channels.md`（未実施）。
