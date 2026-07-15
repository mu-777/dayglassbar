# Google OAuth 審査向け Privacy Policy / Terms of Service — 要件の裏取り記録

作成日: 2026-07-15。`web/privacy.html` の改訂と `web/terms.html` の新設にあたり、Google 公式の一次情報から要件を引用し、「どの要件を踏まえてどの記載を作ったか」を対応表として残す。審査時に「正しく対応している」ことを証明するための記録。

**引用の鮮度**: 引用はすべて 2026-07-15 に各 URL から取得した時点の文言。Google はヘルプ/ポリシーを随時改定するため、審査提出の直前に S1〜S6 の原文を再確認し、差分があればこの表を更新すること。

## 結論（サマリ）

- Privacy Policy は従来から必須。加えて **Terms of Service（利用規約）へのリンクも、external の本番アプリでは OAuth 同意画面（Branding）の必須項目**で、欠けていると審査を提出できない（R10）。→ `web/terms.html` を新設。
- Google は **ToS の「内容」には要件を定めていない**（リンクの存在と、承認済みドメイン上にあることのみ）。内容は実態と一般慣行で構成（R11）。
- Privacy Policy には (a) アクセス・使用・保存・共有の開示、(b) 要求スコープと用途の正確な列挙、(c) Limited Use 準拠の宣言文、(d) 用途変更時の通知・再同意、が求められる（R4〜R8）。→ `web/privacy.html` を改訂。

## ソース一覧（一次情報のみ）

| ID | ページ | URL |
|----|--------|-----|
| S1 | Verification requirements（Google Cloud ヘルプ） | https://support.google.com/cloud/answer/13464321 |
| S2 | Comply with OAuth 2.0 policies（app verification / production readiness） | https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance |
| S3 | Manage OAuth App Branding（Google Cloud ヘルプ） | https://support.google.com/cloud/answer/15549049 |
| S4 | Google API Services User Data Policy | https://developers.google.com/terms/api-services-user-data-policy |
| S5 | Google Workspace API user data and developer policy | https://developers.google.com/workspace/workspace-api-user-data-developer-policy |
| S6 | Submitting your app for verification（Google Cloud ヘルプ） | https://support.google.com/cloud/answer/13461325 |

前提: 本アプリが要求するスコープは `openid email https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.calendarlist.readonly`（`src/main/calendar/google.js`）。カレンダー2種は **sensitive scope**（docs/google-oauth-publishing.md）。Calendar API は Google Workspace API の一つなので、Workspace 開発者ポリシー（S5）も適用対象。

## 要件 → 実装の対応表

各行の読み方: 「[出典 URL] にある [原文引用] を踏まえて、[実装箇所] の記載を作った」。

### ホームページ（web/index.html）

| # | 要件（原文引用） | 出典 | 実装 |
|---|----------------|------|------|
| R1 | "Every production app that uses OAuth 2.0 must have a publicly accessible home page." ／ "The homepage must describe your app's functionality to its users. Your homepage can not be only a login page." | S2／S1 | `web/index.html`（`https://mu-777.github.io/dayglassbar/`）。機能説明・スクリーンショット・FAQ を含む既存 LP がそのまま満たす。 |
| R2 | "You must add the link of your privacy policy to your homepage and this link should match the link you added on your OAuth consent screen configuration." | S1 | `index.html` フッターの Privacy リンク → `privacy.html`。OAuth 同意画面には**同じ URL**（`https://mu-777.github.io/dayglassbar/privacy.html`）を設定する（docs/google-oauth-publishing.md 手順2）。 |

### Privacy Policy（web/privacy.html）

| # | 要件（原文引用） | 出典 | 実装 |
|---|----------------|------|------|
| R3 | "The Privacy Policy should be hosted within the domain that hosts your homepage" ／ "The Privacy Policy must be linked from the OAuth consent screen on the Google API Console." | S1 | ホームページと同一ドメイン `mu-777.github.io` 上の `privacy.html`。同意画面にも同 URL を登録。 |
| R4 | "The Privacy Policy, together with your product-specific privacy disclosures, must disclose how your app accesses, uses, stores, and/or shares Google user data."（同旨 S4: "Your privacy policy and in-product privacy notifications must thoroughly disclose the manner in which your application accesses, uses, stores, or shares Google user data."） | S1／S4 | 「The app」節で4要素を開示: **アクセス**＝`privacy.app.1`（全スコープ列挙）、**使用**＝同（バー表示のみ）、**保存**＝`privacy.app.2`（トークンは OS 暗号化・エクスポート対象外）＋`privacy.app.3`（予定はメモリ内短期キャッシュのみ・ディスク書き込みなし）、**共有**＝`privacy.google.2`（第三者提供なし・端末外送信なし）。 |
| R5 | "Only request access to the permissions necessary to implement your application's features or services." ／ "Don't attempt to 'future proof' your access to user data by requesting access to information that might benefit services or features that have not yet been implemented." | S4 | 実装が要求する**全スコープ**（`openid`・`email` を含む）を `privacy.app.1` に列挙し、各スコープの用途を明記（email＝設定画面での接続中アカウント表示のみ）。**記載と `google.js` の scope を常に一致させること。** |
| R6 | "Your use of Google user data must be limited to the practices disclosed in your published Privacy Policy." | S1 | `privacy.google.2` で用途を「バーへの表示のみ」に限定列挙（譲渡・販売・共有・広告利用・本人以外の閲覧を明示的に否定）。 |
| R7 | Limited Use の適用範囲: S4「Additional Requirements for Specific API Scopes」は "Sensitive and Restricted Scopes" に適用。宣言義務: S5 "An affirmative or other similar statement that your use of the data complies with the Limited Use restrictions must be disclosed in your application or on a website belonging to your web-service or application; for example, a link on a homepage to a dedicated page or privacy policy noting: 'The use of information received from Google Workspace scopes will adhere to the Google User Data Policy, including the Limited Use requirements.'" | S4／S5 | `privacy.google.1` に S5 の例文をアプリ名に合わせた宣言文を掲載: "DayGlassBar's use of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements."（User Data Policy へのリンク付き）。ホームページからリンクされた privacy ページ内への掲載は S5 の例示形式（"a link on a homepage to a dedicated page or privacy policy noting"）そのもの。 |
| R8 | "If you change the way your application uses Google user data, you must notify users and prompt them to consent to an updated privacy policy before you make use of Google user data in a new way or for a different purpose than originally disclosed." | S4 | `privacy.changes.1`（変更時はポリシーを先に更新し、新用途の前に再同意を求める）。 |
| R9 | In-product 開示: S5 は、データアクセスの開示を "Cannot be placed only in a privacy policy or terms of service" とする（アプリ内でも分かるように）。 | S5 | アプリ側の対応: 接続は必ず Google 自身の同意画面を経由（`calendar:connect`＝OAuth）し、設定 UI にカレンダー連携の説明がある。**スコープを増やす場合は設定 UI 側の説明も更新すること。** |

### 実装エビデンス: 「トークンは OS 標準の暗号化で保護・エクスポート対象外」（R4 の「保存」＝`privacy.app.2`）

`privacy.app.2`（"Google サインインのトークンは端末内で OS 標準の暗号化により保護され、設定のエクスポートには含まれません"）は Privacy Policy の中でも**検証可能な事実主張**なので、それを保証しているコードに紐付けておく。審査や問い合わせで「本当にそうなっているのか」を問われたときの一次証跡。**2026-07-15 のコードで確認済み。**

| 主張 | 保証しているコード | なぜそう言えるか |
|------|------------------|----------------|
| トークンは端末内で **OS 標準の暗号化**により保護される | `src/main/calendar/token-store.js`: `:45` 保存＝`safeStorage.encryptString(json)` ／ `:32` 読み出し＝`safeStorage.decryptString(raw)` ／ `:16` 保存先＝`userData/calendar-accounts.enc` | Electron の `safeStorage` は **OS のクレデンシャル基盤**で暗号化する＝**Windows は DPAPI／macOS は Keychain**。これが「OS 標準の暗号化」の実体。リフレッシュトークン・接続アカウント・カレンダー選択を含む JSON 全体を暗号化 blob として書く。 |
| **設定のエクスポートには含まれない** | `src/main/index.js:302-316`（`settings:export` が書き出すのは `store.get()`＝`settings.json` の中身のみ・`:311`） | エクスポート経路がトークンのファイル（別ファイルの `calendar-accounts.enc`）を**そもそも読まない**構造。設定リセット（`index.js:191-196`）・診断ダンプ（`src/main/diagnostics.js`）も同ファイルを除外＝**3経路すべてで秘匿分離が徹底**されている（決定4／不変条件 #7）。`settings.json` に入る `appearance.calendar` は表示 ON/OFF・色・接続方法のみ（非秘匿）で、トークンもアカウントも含まない。 |

**限定条件（審査で正確に答えるために）**: 暗号化されるのは `safeStorage.isEncryptionAvailable()` が真のときのみ。偽の環境では**平文フォールバック**で書く（`token-store.js:32`/`:45` の三項演算子。設定 UI に注意表示 `calendar.encUnavailable`＝決定4）。これが起きるのは主に **Linux でキーリング（gnome-keyring/kwallet）が無い場合と dev 環境**で、**配布対象の Windows（DPAPI は常時利用可）・macOS（Keychain）では常に暗号化される**。したがって配布対象 OS 向けの記述として `privacy.app.2` は常に成立する（Linux は配布対象外＝自動起動も `applyAutoLaunch` で対象外）。**この前提が変わる（Linux を配布対象に加える）場合は、`privacy.app.2` の記述に OS の限定を足すか、平文フォールバックを廃するかを判断すること。**

### Terms of Service（web/terms.html）

| # | 要件（原文引用） | 出典 | 実装 |
|---|----------------|------|------|
| R10 | **必須性**: "The App Domain allows you to specify your home page, privacy policy, and terms of service links." ＋ "These links are required for all external production apps. You will not be able to submit your app for verification if it is missing these links."（S3）。審査提出フォームの項目にも "Link to the app's Terms of Service."（S6）。一方 S2 のホームページ要件は "links to a privacy policy and optional terms of service" と **optional** 表記＝Google 自身のドキュメント間で揺れがある。 | S3／S6／S2 | **保守側（必須）に倒す**: `web/terms.html` を新設し、`index.html`・`privacy.html`・`terms.html` のフッターからリンク。同意画面（Branding）にも URL（`https://mu-777.github.io/dayglassbar/terms.html`）を登録する。揺れの解釈: S2 の "optional" は「ホームページ上のリンク」の話、S3/S6 は「同意画面への登録と審査提出」の話＝提出には必須、と読むのが整合的。 |
| R11 | **内容**: Google は ToS の内容要件を定めていない（S1 の検証要件に ToS の内容規定なし。S3・S6 はリンクの存在のみ）。 | S1／S3／S6 | 内容は実態と一般慣行で構成: ①無料・MIT ライセンス（`LICENSE` と矛盾しない無保証・責任制限）②利用条件（法令遵守・第三者サービスの濫用禁止）③Google 連携は任意で Google の規約にも従う＋Limited Use 言及（privacy と整合）④寄付は任意で Ko-fi の規約に基づく（対価ではない）⑤変更手続（Last updated の更新）⑥準拠法（日本法）⑦連絡先（GitHub Issues）。 |
| R12 | **ドメイン**: "Google's OAuth consent screen verification process requires verification of all domains associated with your project's home page, privacy policy, terms of service, authorized redirect URIs, or authorized JavaScript origins."（S2）／ "To verify ownership of your project's authorized domains, use the Google Search Console."（S2） | S2 | `terms.html` もホームページと同一の GitHub Pages ドメインに配置。Search Console での所有権確認は運用手順（docs/google-oauth-publishing.md 手順2）。 |

## 逆戻りガード

- **terms.html とフッターの ToS リンクを削除しない**。external 本番アプリは ToS リンクが無いと審査を提出できない（R10）。
- **privacy のスコープ列挙（openid・email 含む）と `src/main/calendar/google.js` の scope を乖離させない**。スコープを増やす場合は privacy を先に更新し再同意を得る（R5・R8）。設定 UI 側の説明更新も忘れない（R9）。
- **Limited Use 宣言文（`privacy.google.1`）を弱めたり削除したりしない**（R7。審査で最も定型的に確認される文言）。
- **トークンを `settings.json`／`store` に移さない・`settings:export` が `store.get()` 以外を書き出すようにしない・`token-store.js` の `safeStorage` 暗号化を外さない**。この3つのどれかを崩した時点で `privacy.app.2`（OS 暗号化・エクスポート対象外）が**虚偽記載になる**（上の「実装エビデンス」節が根拠。決定4／不変条件 #7）。秘匿の保存先を変える必要が出たら、コードより先に privacy の記述を直す。
- **「アプリは一切収集なし」への逆戻り禁止**（既存ガード: docs/google-oauth-publishing.md 手順1。サイト側に Cloudflare Web Analytics があるため「アプリ本体は非収集」「サイトは訪問数集計あり」の書き分けを維持）。

## 関連

- 公開手順の本体: `docs/google-oauth-publishing.md`（同意画面の設定値・審査提出・デモ動画）
- カレンダー連携の決定記録: `docs/calendar-integration.md`
