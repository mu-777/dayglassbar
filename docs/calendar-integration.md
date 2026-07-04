# カレンダー連携 決定記録

予定のある時間帯をバー上で色付けし、ホバーでタイトルを出す機能（spec 4.6）の設計判断・不採用案・逆戻りガード・開発者向けセットアップ手順。実装の俯瞰は `docs/design.md`「カレンダー連携」。

## 何を作ったか（要約）
- **設定区間内にある予定**の時間帯をバー上で別色に塗る。通常は色変化のみ・**ホバーでタイトル**（幅不足は省略）。
- ユーザー向けは2プロバイダ。**それぞれに表示 ON/OFF と色**を持つ:
  - **Google** — クラウド OAuth（Google Calendar API）。
  - **Outlook** — 接続方法を**いずれか一つ**選ぶ: `local`（クラシック Outlook を COM でローカル読み取り・サインイン不要・Windows デスクトップ専用）／`cloud`（Microsoft Graph OAuth）。
- 各予定は `provider`（`google`/`outlook`）タグを持ち、バーはそれで色分けする。「区間＝1本のバー」の抽象は不変・残り側のみ・過ぎた予定は消える。下流（`normalizeEvents`/`computeEventSegments`・描画）は source 非依存。

## 決定0: ICS（公開URL購読）を採用しない（要件不適合・逆戻りガード）
- 一度 ICS 公開URL を「承認不要・全環境」の取り込み口として実装したが、**撤回した**。
- **理由（要件不適合）**: 本アプリの要件は「**仕事中に入った新規/変更予定に十分速く追従する**」こと。ICS フィードは**提供側のキャッシュが強く、更新が数時間〜最大1日遅れる**（[Google は 12〜24h](https://www.usecarly.com/blog/google-calendar-ics-refresh-rate/) / [Outlook 公開も数時間〜24h](https://learn.microsoft.com/en-us/answers/questions/4553843/refresh-rate-of-subscribed-ics-calendar-on-outlook)）。こちらのポーリングを速めても**フィード自体が古い**ため無意味。リアルタイム性が要る用途には構造的に向かない。
- **逆戻りガード**: 「承認不要で全環境だから」と ICS を再導入しない。鮮度要件（数分以内の追従）を満たせないため。鮮度が要らない別用途が将来生じたら、その時に要件を添えて再検討する。

## 決定0b: 企業 Outlook の承認問題と「承認不要＝ローカル優先」
- **背景**: 企業管理の Microsoft アカウントでは、クラウド Graph の `Calendars.Read` が **Microsoft 既定でユーザー自己同意の対象外**＝多くのテナントで**管理者承認が必要**（[Permissions & consent](https://learn.microsoft.com/en-us/entra/identity-platform/permissions-consent-overview)）。アプリ側では回避不可（テナントのセキュリティ設定）。
- **採用**: Outlook は**ローカル接続（COM・承認不要・鮮度は Outlook 同期と同等＝数分）を既定**にし、使えない環境（新 Outlook/Web、非Windows）では**クラウド OAuth**（管理者承認が要る場合あり）を選べる二択にした。Google はローカル手段が無いためクラウド OAuth のみ。
- **ローカル Outlook**: 既サインイン済みのクラシック Outlook を **COM（PowerShell 経由）**で読み取り（[COM/PowerShell 例](https://learn.microsoft.com/en-us/answers/questions/574070/powershell-how-to-read-events-from-all-calendars-()）。新しい OAuth アプリ登録・同意が無いので承認不要。
- **不可**: 新 Outlook / Web の**完全ローカル**読み取り（COM 無し・データはクラウド）。新UI のローカルキャッシュ直読みは非公式・不安定で非採用。
- **逆戻りガード**: ローカルとクラウドを**排他の二択**として UI に出す（両方同時に見えるミスリードを作らない）。ローカル COM はクラシック Outlook 専用と明記し、新 Outlook に無理に対応しない。
- **現状（2026-06 時点）の扱い**: Outlook クラウド OAuth は**当面 UI では未対応扱い**にした。理由＝企業テナントの管理者承認が要ることが多く、検証用テナントの用意も難しいため、安定提供できない。**実装（OAuth/Graph コード・排他二択トグル）は残したまま**、設定UIで `cloud` を選ぶと未対応の説明文を出し「Connect Microsoft」ボタンを無効化する（`settings.js` の `renderCalendarConnections`／`buildConn(..., {disabled})`、文言 `calendar.methodCloudHint`）。**Outlook の実利用はローカル接続のみ**。再開は UI のガード（disabled）を外すだけで、コードの逆戻りは不要。

## 決定1: OAuth ファースト → のちに Outlook ローカル接続を追加
- spec 8 のフェーズは v2=ICS / v3=OAuth だった。当初は **Google / Outlook 両対応の OAuth を直接実装**し、のちに企業 Outlook の承認問題（決定0b）を受けて **Outlook のローカル COM 接続**を追加、鮮度不足の **ICS は撤回**した（決定0）。

## 決定2: 認証は RFC 8252「AppAuth パターン」＋ PKCE（資格情報はプロバイダで異なる）
- **採用**: システムブラウザ（`shell.openExternal`）＋ PKCE（S256）＋ ループバック（`127.0.0.1:<ephemeral>`）リダイレクト。配布デスクトップアプリの標準（Slack / VS Code / gcloud / Thunderbird ほか）。
- **資格情報（プロバイダ差。重要）**:
  - **Microsoft** = 真のパブリッククライアント。**client_id のみ・シークレット無し**（PKCE が代替）。
  - **Google「デスクトップアプリ」型** = **トークン交換に client_secret を要求する**（PKCE 併用でも必須）。Google はこのシークレットを発行してソースに埋め込ませ、**「秘密扱いしない」と明言**（[公式](https://developers.google.com/identity/protocols/oauth2/native-app)）。よって Google は **client_id＋client_secret** を同梱する。
  - **逆戻りの教訓（2026-06）**: 当初 Google も「client_id のみ」で実装したところ、ブラウザ承認は通る（＝コードは受領できる）が**トークン交換が `token endpoint 400 (invalid_client / client_secret is missing)` で失敗→未接続**になった。Google のみ client_secret を追加して解消。`oauth-url.js` は `config.clientSecret` がある時だけ `client_secret` を付与する（Microsoft には付けない）。
- **不採用**: 埋め込みブラウザ（BrowserWindow に認可ページを読み込む）: RFC 8252 が非推奨。資格情報をアプリが覗ける構造になり各社も警告。
- **逆戻りガード**: **Microsoft に secret を足さない**（パブリッククライアントに不要）。**Google の client_secret は「秘密」ではないが必須なので外さない**（外すと token endpoint 400 が再発）。埋め込みブラウザに戻さない。
- **同梱の安全性（決定・2026-06）**: Google の client_secret は**配布物から抽出可能**（Electron は asar 展開や `strings` で読める）。それでも**同梱を採用**。根拠は安全性が secret の秘匿に依存しないこと＝**PKCE＋ユーザー同意＋登録リダイレクト**で守られ、secret 単体では誰のデータにもアクセスできない（[RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252)・Google も非機密と明言）。残リスクは**自分の Google プロジェクトのなりすまし／クォータ消費**のみ（データ漏洩ではない）。
  - **運用の守り**: Google OAuth アプリを**「テスト」公開ステータス**のままにし、**テストユーザーに自分（＋必要な人）だけ登録**＝そのリスト以外は同意フローを完了できない。スコープは読み取り専用最小（`calendar.events.readonly`＋一覧取得用の `calendar.calendarlist.readonly`・決定9）。必要時は secret をローテーション。**「テスト」ステータスの refresh token は 7 日で失効する**ため、テストユーザー自身も定期的な再接続が要る。一般配布に向けた公開ステータス化の手順・7日失効の詳細は `docs/google-oauth-publishing.md`。
  - **逆戻りガード（公開配布する場合）**: 不特定多数に配るなら**同梱をやめ「利用者が自分の client_id/secret を設定UIで入力」方式へ切替**（アプリに資格情報を載せない）。個人利用の間は同梱で可。バックエンド・プロキシ案は「ローカル完結・クラウドなし」方針に反するため不採用。

## 決定3: ベンダー SDK を使わず Node 標準で自前実装（依存ゼロ）
- **採用**: `crypto`(PKCE) / `http`(ループバック受け) / `fetch`(トークン交換・取得) のみ。両プロバイダで**同一の汎用フロー1本**（`src/main/calendar/oauth.js` ＋ `oauth-url.js`）を共有し、`google.js`/`microsoft.js` はエンドポイント・スコープ・JSON マッピングだけを持つ。
- **不採用**: `googleapis` ＋ `@azure/msal-node`。堅牢だが依存とバンドルが大きく、プロバイダごとに別コードになる（プロジェクトの依存ゼロ志向＝`npm run icons` も依存ゼロ、に反する）。標準 OAuth2 は薄く、自前で十分制御できる。
- **逆戻りガード**: 機能追加のたびに重い SDK を引き込まない。プロバイダ差分は `mapEvents`/設定値に閉じ込める。
- **タイムアウト**: fetch は全箇所に `AbortSignal.timeout` を付ける — トークン交換 30 秒（`oauth.js`）・API GET 10 秒（`google.js`/`microsoft.js`）。ハングした 1 接続が接続フロー（ユーザーが待つ）や更新タイマを固めない。更新確認ボタン（main）とランディングページ（`web/app.js`）の `releases/latest` も同様に 10 秒。

## 決定4: 秘匿情報は settings.json と分離（暗号化・エクスポート対象外）
- リフレッシュトークン＋接続アカウントは `userData/calendar-accounts.enc`（Electron `safeStorage` で暗号化）に保存。**`settings.json` には入れない**＝エクスポートに含まれず、`validateSettings` も触れない。
- `settings.json` 側（`appearance.calendar`）は**表示設定（有効/色）のみ**。接続状態は `calendar:status`(IPC) で別取得（UI は秘匿に触れない）。
- `safeStorage` 不可環境では平文フォールバック＋設定 UI に注意（`calendar.encUnavailable`）。
- **逆戻りガード**: 「アカウント情報も settings に入れたら楽」としない（エクスポートでメール/トークンが漏れる）。

## 決定5: 取得は毎秒ではなくタイマ（不変条件 #1 と整合）
- `CalendarService` が**タイマ＋接続/設定変更時＋スリープ復帰時**にだけ取得してキャッシュ。毎秒の bar tick は `getBarState`→`computeEventSegments` でキャッシュを `now` に再クリップするだけ。経過の積算はしない。
- アクセストークンは期限までメモリ保持。`offline_access`(MS) / `access_type=offline`(Google) でリフレッシュ。Microsoft のリフレッシュトークン・ローテーションに追従。オーバーレイ無効/未接続なら取得しない。
- **タイマは cloud と local で分離**: `REFRESH_CLOUD_MS=1分`（Google/Graph＝安い HTTPS GET なのでプロバイダ側編集に速く追従）／`REFRESH_LOCAL_MS=5分`（Outlook local＝毎回 PowerShell+COM プロセス起動なので低頻度）。最後の結果（`cloudRaw`/`localRaw`）を `normalizeEvents` でマージして1キャッシュにする。**逆戻りガード**: 単一タイマに戻さない（local の PowerShell 起動が cloud と同頻度になり重い）。Google クォータは1分間隔で十分余裕、アクセストークンはキャッシュするので毎分のリフレッシュは発生しない（数値・push 非採用の詳細は決定10）。
- **スリープ復帰時の即時取得**: `powerMonitor` の `resume`→`calendar.refresh()`（cloud+local）。スリープ中はタイマが止まり予定が古くなるため、次の間隔を待たず復帰直後に最新化する。

## 決定6: 何を「予定」とみなすか（spec §10 の決定化）
- read-only スコープ（Google `calendar.events.readonly`＋`calendar.calendarlist.readonly`（一覧取得用・決定9）/ Graph `Calendars.Read`＝一覧取得も同スコープでカバー）。
- **除外**: 終日予定 / 辞退済み（responseStatus=declined）/ 「空き」表示（Google transparency=transparent・Graph showAs=free）。
- **取得窓との突き合わせは重なり判定**（「開始が窓内」ではない）: Google は `timeMin`（終了時刻の下限）、Graph は `calendarView`、Outlook local は Restrict `[Start] <= 窓末尾 AND [End] >= 窓先頭`。開始からどれだけ経った進行中の予定でも、残り側の帯が消えない（3 ソースで同じ意味論。当初 local だけ `[Start] >=` で始点判定しており、1 時間超経過した進行中の予定が消えるバグがあった＝逆戻りガード）。
- タイムゾーンは取得時に UTC 正規化（Graph は `Prefer: outlook.timezone="UTC"`、無ゾーン文字列に `Z` 補完）。判定・正規化は core `normalizeEvents`（純粋・テスト対象）、JSON→共通形式は各プロバイダ `mapEvents`（純粋・テスト対象）。
- 取得カレンダーはユーザーが選択可（決定9）。未選択時のみ primary/既定 1 本にフォールバック。

## 決定7: 表示は休憩と同じ残り側のみ・色は一定
- メタファー一貫（水が減る／過ぎた予定は消える）。色帯は fill の上・目盛りの下に描き、ホバー時のみタイトルを帯幅にクリップ（省略記号）して重ねる。
- 点滅・危機色・カウントダウンは足さない（不変条件 #4。予定で急かさない）。

## 決定9: 表示カレンダーをユーザーが選択（複数可）
- 当初は取得カレンダーを primary/既定の 1 本固定にしていた（決定6/7 の「選択は今後」）。アカウントに副カレンダー・共有カレンダーが複数あるのが普通なので、**表示するカレンダーを選べる**ようにした。
- **一覧取得**: Google=`users/me/calendarList`（`minAccessRole=reader`）／Graph=`/me/calendars`／Outlook local=COM で全ストアのカレンダーフォルダ（`DefaultItemType=1`）を深さ制限付きで列挙。各プロバイダに `fetchCalendars`/`mapCalendars`（cloud）・`listOutlookLocalCalendars`/`mapOutlookFolders`（local）を追加。`mapCalendars`/`mapOutlookFolders` は純粋・テスト対象。
- **取得**: `fetchEvents(token, start, end, calendarId)` を各プロバイダで calendarId 受け取りに拡張。`CalendarService.fetchCloud` は選択 ID ごとにループ取得（**カレンダー単位の try/catch**＝1 つが 404/権限切れでも他を落とさない）。Outlook local は選択フォルダの EntryID/StoreID を `GetFolderFromID` で再取得。
- **選択の保存場所＝`calendar-accounts.enc`（暗号化・エクスポート対象外）**。`{ selections: { google:[ids], microsoft:[ids], 'outlook-local':[ids] } }` を accounts と同じファイルに同梱。**理由**: Google のカレンダー ID は**アカウントのメールアドレスそのもの**になり得る。これを `settings.json`（エクスポート対象）に入れると決定4（メール/秘匿を export に載せない）の精神に反する。表示 ON/OFF・色は非秘匿なので従来どおり `appearance.calendar`（エクスポート対象）。
- **UI**: 設定の各プロバイダに「表示するカレンダーを選択」ボタン（`settings.js` の `renderCalendarPicker`）。押下時に `calendar:list-calendars`(IPC) で一覧を遅延取得しチェックボックス描画、トグルで即 `calendar:set-selection`(IPC) して永続化＋再取得（**Save ボタンとは独立**＝選択は settings.json でなく暗号ストアに入るため）。一覧取得はネットワーク/COM コストがあるのでボタン押下時のみ（設定窓を開くたびには走らせない）。
- **空選択のセマンティクス**: 選択リストが**空＝primary/既定 1 本のみ**（旧挙動と後方互換）。UI は空のとき primary を既定チェック（実挙動と一致）。非空ならその ID 群を取得。「何も表示しない」はプロバイダ自体の表示トグル OFF で行う（空選択を「ゼロ表示」に割り当てない）。
- **Outlook cloud（Graph）も実装済みだが UI 未到達**: 決定0b で cloud は接続 UI 無効のため、その選択ピッカーも出さない（接続できないと一覧も引けない）。コードパスは Google/local と同形で用意済み＝cloud 再開時はそのまま使える。
- **逆戻りガード**: 選択 ID を `settings.json` に移さない（export でメール/カレンダー構成が漏れる）。disconnect 時はそのソースの選択も破棄（ID はアカウント固有）。primary 固定へ戻さない（複数カレンダー利用者の予定が落ちる）。

## 決定10: ポーリング頻度は 1 分で妥当・push 通知は採用しない（クォータ検討・逆戻りガード）
- **結論**: cloud の 1 分ポーリング（決定5）は Google Calendar API の使い方として問題ない。レート制限に対して桁違いの余裕がある。[Google 公式クォータ](https://developers.google.com/workspace/calendar/api/guides/quota)の既定値:
  - **per-user / 分 / プロジェクト = 600 req**。本アプリの実測は「1 分あたり選択カレンダー数ぶんの `events.list` GET」（未選択なら primary 1 本）＝通常 1〜数 req/分で、数百倍の余裕。
  - **per-project / 分 = 10,000 req**、**per-project / 日（無料枠）= 1,000,000 req**。
- **唯一意識すべき制約＝日次 100 万はプロジェクト全体で共有**: OAuth の client_id（＝Google Cloud プロジェクト）は**全ユーザーで 1 つを共有**する。per-user 系は各ユーザー独立だが、**日次 1,000,000 はプロジェクト合算**なのでユーザー数でスケールする。概算（60 秒間隔・カレンダー 1 本）: 24h 稼働で 1,440 req/日/人 → 約 690 人、8h 稼働なら約 480 req/日/人 → 約 2,000 人で無料枠に到達（複数カレンダー選択ならその本数で割る）。**普及フェーズで最初に当たる天井はここ**（超過は課金 or クォータ増申請）。個人〜小規模利用の現状は余裕。無駄打ちはしない設計＝`enabled` かつ接続済みのソースしか GET を投げない（`index.js` `refreshCloud`／`fetchCloud`）。
- **push 通知（webhook）は採用しない（逆戻りガード）**: Google 公式はポーリングより [push 通知](https://developers.google.com/workspace/calendar/api/guides/push)を推奨するが、これは**受信用の公開 HTTPS エンドポイント**が必要。常駐デスクトップアプリには受け口がなく（＝別途サーバ/プロキシが要る＝「ローカル完結・クラウドなし」方針に反する）、このアーキテクチャでは非現実的。**ポーリング継続が妥当**。将来サーバを持つ判断をしない限り再検討しない。
- **公式推奨のうち未実装（普及時の改善候補・任意）**: ①**間隔ジッター（±25%）**＝多数ユーザーの同時スパイク回避に公式が推奨。今は固定 60 秒の `setInterval`（`REFRESH_CLOUD_MS` に乱数を足すだけで入る・費用対効果が最も高い）。②**指数バックオフ**＝429/403 rate-limit 時に有効。今は失敗しても前回結果を保持し 60 秒後に再試行するだけ（60 秒固定なので実害は小さいが、rate-limit を踏んだら効く）。現状規模では必須ではないため未実装。導入するならジッターを先に。

## テスト境界
- **自動（`npm test`）**: `test/calendar.test.js`（`computeEventSegments`/`normalizeEvents`・`provider` 受け渡し）、`test/calendar-providers.test.js`（PKCE・認可URL生成・Google/MS の `mapEvents`＋`mapCalendars`）、**`test/outlook-local.test.js`（`mapOutlookJson`／`mapOutlookFolders`／`decodeLocalCalendarId`）**、`test/validate.test.js`（`appearance.calendar` 2プロバイダ＋Outlook method 検証）、`test/i18n.test.js`（キー集合一致）。
- **手動（Windows 実機）**: ブラウザ認証・ループバック・暗号保管・実 API 取得・**COM 実行（クラシック Outlook）**・**カレンダー一覧取得と複数選択の取得/描画**・プロバイダ別の色帯/ホバー描画。README チェックリスト参照。
- **OAuth/ネットワーク無しの目視**: `DAYGLASSBAR_FAKE_EVENTS="16:00-16:30 Standup;…"`（`src/main/calendar/fake-events.js`）。

## 既知の制限
- 新しい Outlook / Web は**完全ローカル不可**（COM 無し）→ クラウド OAuth（承認要の場合あり）。
- ローカル Outlook は **Windows＋クラシック Outlook 起動中**が前提。GPO で「プログラムによるアクセス」を禁止していると不可。Restrict の日付書式は US ロケール想定（`MM/dd/yyyy hh:mm tt`）で他ロケールは要確認。
- 表示カレンダーは選択可（決定9）。Outlook local の列挙は深さ 8 までに制限（巨大なパブリックフォルダツリーの走査停止防止）＝深い階層の共有カレンダーは出ない場合あり。

## 開発者セットアップ（一度きり）
実際の接続には OAuth アプリ登録が必要（コード外作業）。

**資格情報の置き場（決定）**: 値は `src/main/calendar/config.js` に集約。解決順は **env →ローカルJSON→空**。必要な値は Google=`client_id`＋`client_secret`、Microsoft=`client_id` のみ:
1. env（dev / ビルド注入で優先）: `DAYGLASSBAR_GOOGLE_CLIENT_ID` / `DAYGLASSBAR_GOOGLE_CLIENT_SECRET` / `DAYGLASSBAR_MS_CLIENT_ID`。
2. `src/main/calendar/client-ids.local.json`（`client-ids.local.example.json` をコピーして記入。キー: `google` / `google_secret` / `microsoft`）。**`.gitignore` 済み**＝リポジトリに実値を載せない。
3. 無ければ空 → 接続時に「client_id not configured」（Google は secret 欠落で token endpoint 400）。

`client_id` も Google の `client_secret` も Google は秘密扱いしない（配布物に埋め込む前提）が、いずれも**自分の Google/Azure プロジェクトの識別子**なので実値はリポジトリに置かずローカル/ env で管理する。Microsoft に secret は無い。

### CI（GitHub Actions）ビルドでの注入
`client-ids.local.json` は gitignore 済み＝CI の checkout には無いので、**そのままビルドすると配布物の資格情報は空**になる。`config.js` は env を**実行時**に読むため、CI で env を渡すだけでは成果物に焼き込まれない → **パッケージ前にファイルへ書き出す**必要がある。
- GitHub → Settings → Secrets and variables → Actions:
  - **Variables**: `DAYGLASSBAR_GOOGLE_CLIENT_ID` / `DAYGLASSBAR_MS_CLIENT_ID`（公開識別子）。
  - **Secrets**: `DAYGLASSBAR_GOOGLE_CLIENT_SECRET`（ログにマスクされる Secrets が無難。Google 的には非機密だが慣習として）。
- `.github/workflows/build.yml` の「Write OAuth credentials」ステップが `npm run dist` 前に `src/main/calendar/client-ids.local.json`（`google`/`google_secret`/`microsoft`）を生成し、electron-builder の `files: src/**/*` で同梱される。未登録なら空のままビルドは成功（該当プロバイダの接続のみ無効）。

### Google
1. Google Cloud Console でプロジェクト作成 → **Google Calendar API** を有効化。
2. OAuth 同意画面: **External**、自分をテストユーザーに追加（個人利用は審査不要）。スコープに **`.../auth/calendar.events.readonly`＋`.../auth/calendar.calendarlist.readonly`**（後者は表示カレンダー選択の一覧取得=`calendarList.list` に必須。events.readonly 単独では `calendarList.list` が 403。決定9）。**API ライブラリの追加有効化は不要**（どちらも有効化済みの Google Calendar API の一部）。スコープ追加後は既存接続を一度 Disconnect→再接続して同意し直す（refresh token に新スコープを乗せ直す）。
3. 認証情報 → OAuth クライアント ID → **デスクトップ アプリ** を作成 → **`client_id` と `client_secret` の両方**を取得（Google はトークン交換に secret を要求する。`client-ids.local.json` の `google` と `google_secret` に入れる）。

### Microsoft（Entra / Azure）
1. アプリの登録 → 新規登録（サポートアカウント: 個人＋職場/学校なら "common"）。
2. 認証 → プラットフォーム追加 → **モバイル/デスクトップ** → リダイレクト URI に `http://localhost`（ループバック）。**パブリッククライアントを許可**（シークレット不要）。
3. API のアクセス許可 → Microsoft Graph → 委任 → **`Calendars.Read`**（＋ `offline_access` はトークン要求スコープで付与）。
