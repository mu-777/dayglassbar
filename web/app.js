/* DayGlassBar landing page
   - bilingual EN/JA toggle (data-i18n attributes, persisted in localStorage)
   - OS detection to highlight the right download
   - live fetch of the latest GitHub Release so download links always reflect
     whatever GitHub Actions last published (no manual updates per release). */

'use strict';

const REPO = 'mu-777/dayglassbar';
const RELEASES_PAGE = `https://github.com/${REPO}/releases`;
// Single source of truth for the donation link (footer + FAQ).
const KOFI_URL = 'https://ko-fi.com/mu_777';

/* ---------------- i18n catalog ---------------- */
const I18N = {
  en: {
    'meta.description': "DayGlassBar is an ambient desktop app that shows the time left in your day as a thin bar that quietly drains at the edge of your screen. No numbers, no color changes, no alarms. Windows & macOS, free.",
    'nav.features': 'Features',
    'nav.how': 'How it works',
    'nav.download': 'Download',
    'nav.faq': 'FAQ',
    'nav.home': '← Back to DayGlassBar',
    'hero.badge': 'Free · Windows &amp; macOS',
    'hero.tagline': 'See your day drain — quietly.',
    'hero.sub': "An ambient bar that lives at the edge of your screen and shows the time left in your day. No numbers, no colors changing, no alarms — just a thin sliver of light that shrinks as the day goes by.",
    'hero.cta': 'Download',
    'hero.github': 'View on GitHub',
    'hero.version': 'Latest release',
    'hero.principle': 'Early days — expect a few rough edges.',
    'hero.caption': 'Live demo: the fill is the time left in your day — hover expands it.',
    'how.title': 'How it works',
    'how.1.h': 'Set your day',
    'how.1.p': 'Pick the segment (e.g. 9:00–17:00) and which days are on. Breaks like lunch are greyed out.',
    'how.2.h': 'Catch it at a glance',
    'how.2.p': "A thin bar sits on your screen's edge and fills only the time remaining. As the day passes, the fill shrinks — that's it.",
    'how.3.h': 'Hover for detail',
    'how.3.p': "Rest the cursor on the bar and it widens to show start, end, now and time left — then slips back. It's always click-through, so it never steals your clicks.",
    'features.title': 'Features',
    'feat.ambient.h': 'Ambient by design',
    'feat.ambient.p': 'Lives at the edge of your screen — pin it to any side: top, bottom, left or right. No countdowns, no blinking, no notifications; only the fill length changes.',
    'feat.cal.h': 'Calendar integration',
    'feat.cal.p': 'Connect Google Calendar, or read classic Outlook locally. Events inside your day appear as colored bands; hover for the title.',
    'feat.through.h': 'Click-through &amp; always on top',
    'feat.through.p': 'Sits above everything but ignores the mouse — the work underneath is never blocked, even while expanded.',
    'download.title': 'Download',
    'download.sub': 'Latest release, built automatically by GitHub Actions.',
    'download.win.req': 'Windows 10 / 11 (64-bit)',
    'download.win.installer': 'Installer (.exe)',
    'download.win.portable': 'Portable (.exe)',
    'download.mac.req': 'Apple Silicon',
    'download.mac.dmg': 'Download (.dmg)',
    'download.unsigned.h': "Heads up: the app isn't code-signed yet.",
    'download.unsigned.win': 'Windows: if the SmartScreen prompt appears, click <em>More info → Run anyway</em>.',
    'download.unsigned.mac': 'macOS: the first launch shows <em>“DayGlassBar” is damaged and can\'t be opened</em>. The file isn\'t damaged — this is how macOS blocks unsigned apps downloaded from the web. Drag the app into <em>Applications</em>, run <code>xattr -cr /Applications/DayGlassBar.app</code> once in Terminal, then open it again.',
    'download.all': 'All releases &amp; release notes →',
    'dlmodal.title': 'Downloading — one step before first launch',
    'dlmodal.intro': "On first launch, macOS will say “DayGlassBar” is damaged and can't be opened. The file is fine — this is how macOS treats unsigned apps. Do this once:",
    'dlmodal.step1': 'Drag DayGlassBar into <em>Applications</em>',
    'dlmodal.step2': 'Run this once in Terminal:',
    'dlmodal.step3': 'Open it again — from then on it starts normally.',
    'dlmodal.copy': 'Copy',
    'dlmodal.copied': 'Copied!',
    'dlmodal.close': 'Got it',
    'faq.title': 'FAQ',
    'faq.q1': 'Does it turn red or blink as the day winds down?',
    'faq.a1': 'No. "Rush" cues are intentionally left out — only the fill length shrinks, and the color stays constant. The whole point is a nudge, not a nag.',
    'faq.q2': 'Is it a Pomodoro timer? Does it notify me?',
    'faq.a2': "No. Pomodoro, sounds and notifications are out of scope. It's a display-only tool for feeling how much of your day is left.",
    'faq.q3': 'Can it show my calendar?',
    'faq.a3': "Yes. Connect Google Calendar (OAuth), or read classic Outlook locally on Windows — each with its own on/off and color. Events inside your day appear as colored bands; hover to see the title. Outlook's cloud API is currently unsupported.",
    'faq.q4': "Will it work with my company's Outlook?",
    'faq.a4': 'Use the local connection with classic Outlook installed on that PC — no sign-in or admin approval needed, and it reads work-account events too. (The "new Outlook" / web-only setups aren\'t supported for local reading.)',
    'faq.q5': 'Can I subscribe to a public ICS calendar URL?',
    'faq.a5': "No. It was implemented once and removed: ICS feeds are cached by the provider for hours, so they can't follow mid-day changes fast enough.",
    'faq.q6': 'Is it free? What about my data?',
    'faq.a6': 'It’s free to download. Your settings live in a local JSON; calendar sign-in tokens are encrypted on your device and never included in exports. Events are only fetched for display — nothing is sent to a cloud of ours.',
    'faq.support': 'If you find it useful, a small tip on Ko-fi is hugely appreciated — but it’s completely optional. ♡',
    'footer.tag': 'A nudge, not a nag.',
    'footer.support': 'Support me on Ko-fi',
    'footer.privacy': 'Privacy Policy',
    'footer.terms': 'Terms of Service',
    'privacy.meta': 'How DayGlassBar and this website handle your data.',
    'privacy.title': 'Privacy Policy',
    'privacy.updated': 'Last updated: July 15, 2026',
    'privacy.intro': 'DayGlassBar is a desktop app with an optional Google Calendar integration. This page covers both the desktop app and this website.',
    'privacy.app.h': 'The app',
    'privacy.app.1': 'With your explicit permission (Google sign-in), the app reads your Google Calendar events (read-only) to display them as colored time bands in the bar. It requests only the scopes it needs: basic account info (openid, email — used solely to show which account is connected in the settings screen) and read-only calendar access (calendar.events.readonly to read events, calendar.calendarlist.readonly to list your calendars so you can pick which ones to show).',
    'privacy.app.2': "Your settings are saved only in a local JSON file on your own device. The Google sign-in token is encrypted on your device via your OS's secure storage, and is never included when you export your settings.",
    'privacy.app.3': 'We do not operate a server. Fetched events are kept only in a short-lived in-memory cache — they are never written to disk and never sent anywhere outside your device — and the app itself has no analytics or tracking of its own.',
    'privacy.app.4': 'To revoke access, click “Disconnect” next to Google in the app’s settings, or uninstall the app. You can also revoke access anytime from your Google Account’s third-party access settings.',
    'privacy.google.h': 'Google user data and Limited Use',
    'privacy.google.1': 'DayGlassBar’s use of information received from Google APIs will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener" target="_blank">Google API Services User Data Policy</a>, including the Limited Use requirements.',
    'privacy.google.2': 'In plain terms: Google user data is used only for the user-facing feature described above — showing your events in the bar. It is never transferred, sold, or shared with third parties, never used for advertising, and never read by anyone other than you. The data never leaves your device, so no one else can access it.',
    'privacy.site.h': 'This website',
    'privacy.site.1': 'This website uses Cloudflare Web Analytics to see aggregate visit counts. It’s cookie-free and doesn’t track you individually — no personal data is collected here either.',
    'privacy.changes.h': 'Changes to this policy',
    'privacy.changes.1': 'If the app ever changes how it uses Google user data, we will update this policy first and prompt you to re-consent before the new use takes effect. Any update changes the “Last updated” date above.',
    'privacy.contact.h': 'Contact',
    'privacy.contact.p': 'Questions? <a href="https://github.com/mu-777/dayglassbar/issues" rel="noopener" target="_blank">Open an issue on GitHub</a>.',
    'terms.meta': 'Terms of service for the DayGlassBar desktop app and this website.',
    'terms.title': 'Terms of Service',
    'terms.updated': 'Last updated: July 15, 2026',
    'terms.intro': 'These terms apply to the DayGlassBar desktop app and to this website. By downloading or using the app, or by using this site, you agree to these terms. If you do not agree, please do not use the app or this site.',
    'terms.license.h': 'License and cost',
    'terms.license.1': 'DayGlassBar is free, open-source software released under the MIT License. You may use, copy, modify, and redistribute it under the terms of that license. The full license text is in the <a href="https://github.com/mu-777/dayglassbar/blob/master/LICENSE" rel="noopener" target="_blank">project repository</a>.',
    'terms.asis.h': 'No warranty',
    'terms.asis.1': 'The app and this website are provided “as is”, without warranty of any kind. To the maximum extent permitted by law — and as stated in the MIT License — the author is not liable for any damages arising from your use of, or inability to use, the app or this site.',
    'terms.use.h': 'Acceptable use',
    'terms.use.1': 'Use the app in compliance with applicable laws. If you enable the Google Calendar integration, you must also follow Google’s own terms. Do not use the app to abuse, disrupt, or gain unauthorized access to any third-party service.',
    'terms.google.h': 'Third-party services (Google Calendar)',
    'terms.google.1': 'The Google Calendar integration is optional and off by default. Your use of Google services through the app is also governed by <a href="https://policies.google.com/terms" rel="noopener" target="_blank">Google’s Terms of Service</a>. How DayGlassBar handles data received from Google APIs is described in our <a href="privacy.html">Privacy Policy</a>, and adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener" target="_blank">Google API Services User Data Policy</a>, including the Limited Use requirements.',
    'terms.donations.h': 'Donations',
    'terms.donations.1': 'The app is free. Donations via Ko-fi are voluntary and are not payment for the software or for any additional features. Donations are processed by Ko-fi under its own terms.',
    'terms.changes.h': 'Changes to these terms',
    'terms.changes.1': 'We may update these terms from time to time, and will update the “Last updated” date above when we do. Continued use of the app or this site after a change means you accept the updated terms.',
    'terms.law.h': 'Governing law',
    'terms.law.1': 'These terms are governed by the laws of Japan.',
    'terms.contact.h': 'Contact',
    'terms.contact.p': 'Questions? <a href="https://github.com/mu-777/dayglassbar/issues" rel="noopener" target="_blank">Open an issue on GitHub</a>.',
    // dynamic
    'dyn.os.win': 'for Windows',
    'dyn.os.mac': 'for macOS',
    'dyn.version': (tag) => `${tag} — built automatically by GitHub Actions.`,
    'dyn.noRelease': 'Builds are published on GitHub Releases.',
  },
  ja: {
    'meta.description': 'DayGlassBar は、一日の残り時間を画面の縁の細いバーで可視化するアンビエントなデスクトップアプリです。数字も色の変化もアラームもなし。Windows / macOS 対応・無料。',
    'nav.features': '特長',
    'nav.how': '使い方',
    'nav.download': 'ダウンロード',
    'nav.faq': 'FAQ',
    'nav.home': '← DayGlassBar に戻る',
    'hero.badge': '無料 · Windows / macOS',
    'hero.tagline': '一日の残りを、静かに視界の端で。',
    'hero.sub': '画面の縁に常駐し、一日の残り時間を細いバーで可視化するアンビエントなデスクトップアプリ。数字も、色の変化も、アラームもありません。日が進むにつれて静かに減る、光の筋。',
    'hero.cta': 'ダウンロード',
    'hero.github': 'GitHub を見る',
    'hero.version': '最新リリース',
    'hero.principle': '開発中のため、多少の粗さがあります。',
    'hero.caption': '動作デモ: 塗り＝一日の残り時間。ホバーで拡大します。',
    'how.title': '使い方',
    'how.1.h': '一日を決める',
    'how.1.p': '区間（例: 9:00〜17:00）と有効な曜日を設定します。昼休みなどの休憩はグレーで表示されます。',
    'how.2.h': 'ひと目でわかる',
    'how.2.p': '画面の縁の細いバーが残り時間ぶんだけ塗られ、時間が経つと塗りが縮みます。それだけです。',
    'how.3.h': 'ホバーで詳細',
    'how.3.p': 'カーソルを留めるとバーが広がり、開始・終了・現在時刻と残り時間を表示。離すと細いバーに戻ります。常にクリックスルーなので、操作を奪いません。',
    'features.title': '特長',
    'feat.ambient.h': 'アンビエント設計',
    'feat.ambient.p': '画面の縁に常駐。上・下・左・右、どの辺にでも置けます。カウントダウンも点滅も通知もなし。変わるのは塗りの長さだけです。',
    'feat.cal.h': 'カレンダー連携',
    'feat.cal.p': 'Google カレンダー連携、またはクラシック Outlook をローカル読み取り。区間内の予定を色帯で表示し、ホバーでタイトルを表示します。',
    'feat.through.h': 'クリックスルー＆最前面',
    'feat.through.p': '常に最前面でもマウスは素通し。展開中でも、下の作業を一切邪魔しません。',
    'download.title': 'ダウンロード',
    'download.sub': 'GitHub Actions が自動ビルドした最新リリースです。',
    'download.win.req': 'Windows 10 / 11（64bit）',
    'download.win.installer': 'インストーラ (.exe)',
    'download.win.portable': 'ポータブル (.exe)',
    'download.mac.req': 'Apple Silicon',
    'download.mac.dmg': 'ダウンロード (.dmg)',
    'download.unsigned.h': 'ご注意: このアプリはまだコード署名されていません。',
    'download.unsigned.win': 'Windows: SmartScreen が表示されたら「<em>詳細情報 → 実行</em>」を選びます。',
    'download.unsigned.mac': 'macOS: 初回起動時に「<em>“DayGlassBar”は壊れているため開けません</em>」と表示されます。ファイルが壊れているわけではなく、Web からダウンロードした未署名アプリを macOS がブロックする仕様です。アプリを<em>アプリケーション</em>フォルダへドラッグし、ターミナルで <code>xattr -cr /Applications/DayGlassBar.app</code> を一度実行してから、もう一度開いてください。',
    'download.all': 'すべてのリリース・変更履歴 →',
    'dlmodal.title': 'ダウンロードを開始しました — 起動前に1つだけ',
    'dlmodal.intro': '初回起動時、macOS は「“DayGlassBar”は壊れているため開けません」と表示します。ファイルは壊れていません（未署名アプリに対する macOS の仕様です）。次を一度だけ行ってください:',
    'dlmodal.step1': 'DayGlassBar を<em>アプリケーション</em>フォルダへドラッグ',
    'dlmodal.step2': 'ターミナルで次を一度実行:',
    'dlmodal.step3': 'もう一度開く — 以後は普通に起動します。',
    'dlmodal.copy': 'コピー',
    'dlmodal.copied': 'コピーしました',
    'dlmodal.close': 'OK',
    'faq.title': 'よくある質問',
    'faq.q1': '時間が減ると赤くなったり点滅したりしますか？',
    'faq.a1': 'しません。「急かす」表現は意図的に排しています。変わるのは塗りの長さだけで、色は一定です。狙いは「そっと気づかせる、急かさない」ことです。',
    'faq.q2': 'ポモドーロタイマーですか？通知は出ますか？',
    'faq.a2': 'いいえ。ポモドーロ・音・通知はスコープ外です。これは「残量を感じる」ための表示専用ツールです。',
    'faq.q3': 'カレンダーを表示できますか？',
    'faq.a3': 'はい。Google カレンダー（OAuth）連携、または Windows でクラシック Outlook をローカル読み取りできます。それぞれ表示オン/オフと色を設定でき、区間内の予定は色帯で表示・ホバーでタイトルを表示します。Outlook のクラウド API は現在未対応です。',
    'faq.q4': '会社の Outlook（企業アカウント）でも使えますか？',
    'faq.a4': 'その PC にクラシック Outlook が入っていれば「ローカル」接続をご利用ください。サインインや管理者承認は不要で、職場アカウントの予定も読めます。（「新しい Outlook」/ Web 版のみの環境ではローカル読み取りはできません。）',
    'faq.q5': '公開 ICS（カレンダーの公開URL）を購読できますか？',
    'faq.a5': 'いいえ。一度実装しましたが外しました。ICS フィードは提供側で数時間キャッシュされ、日中の予定変更に十分速く追従できないためです。',
    'faq.q6': '無料ですか？データはどう扱われますか？',
    'faq.a6': '無料でダウンロードできます。設定はローカルの JSON に保存され、カレンダーのサインイン情報は端末内で暗号化され、エクスポートには一切含まれません。予定は表示のために取得するだけで、当方のクラウドには何も送りません。',
    'faq.support': '気に入っていただけたら、Ko-fi での少額の支援をいただけると嬉しいです（任意です）。 ♡',
    'footer.tag': 'そっと気づかせる、急かさない。',
    'footer.support': 'Ko-fi で支援する',
    'footer.privacy': 'プライバシーポリシー',
    'footer.terms': '利用規約',
    'privacy.meta': 'DayGlassBar 本体とこのサイトでのデータの扱いについて。',
    'privacy.title': 'プライバシーポリシー',
    'privacy.updated': '最終更新日: 2026年7月15日',
    'privacy.intro': 'DayGlassBar は Google カレンダー連携（任意）を備えたデスクトップアプリです。このページでは、アプリ本体とこのサイト自体の両方について説明します。',
    'privacy.app.h': 'アプリ本体について',
    'privacy.app.1': 'ご本人の明示的な許可（Google サインイン）のもとで、アプリは Google カレンダーの予定（読み取り専用）を取得し、バー上の色帯として表示するためだけに使います。要求するスコープは必要最小限で、基本的なアカウント情報（openid・email。設定画面でどのアカウントに接続中かを表示するためだけに使用）と、読み取り専用のカレンダーアクセス（予定を読む calendar.events.readonly と、表示するカレンダーを選ぶための一覧取得 calendar.calendarlist.readonly）のみです。',
    'privacy.app.2': '設定はお使いの端末のローカル JSON ファイルにのみ保存されます。Google サインインのトークンは端末内で OS 標準の暗号化により保護され、設定のエクスポートには含まれません。',
    'privacy.app.3': '当方はサーバーを運用していません。取得した予定はメモリ上の短期キャッシュにのみ保持され、ディスクに書き込まれることも端末の外に送信されることもありません。アプリ本体に独自の分析・追跡機能もありません。',
    'privacy.app.4': '連携解除は、アプリの設定画面で Google の「Disconnect」をクリックするか、アプリをアンインストールしてください。Google アカウントのサードパーティ アクセス設定からもいつでも取り消せます。',
    'privacy.google.h': 'Google ユーザーデータと Limited Use（限定利用）',
    'privacy.google.1': 'DayGlassBar による Google API から受け取った情報の利用は、Limited Use（限定利用）要件を含む <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener" target="_blank">Google API Services User Data Policy</a> を遵守します。',
    'privacy.google.2': '具体的には、Google ユーザーデータは上記のユーザー向け機能（予定をバーに色帯として表示すること）にのみ使用します。第三者への譲渡・販売・共有は行わず、広告目的にも使用せず、ご本人以外の人間が読むこともありません。データは端末の外に出ないため、他者がアクセスすることはできません。',
    'privacy.site.h': 'このサイトについて',
    'privacy.site.1': 'このサイトでは、訪問数の集計に Cloudflare Web Analytics を利用しています。Cookie を使わず個人を特定する追跡は行わないため、ここでも個人データは収集していません。',
    'privacy.changes.h': 'このポリシーの変更',
    'privacy.changes.1': 'アプリによる Google ユーザーデータの使い方を変更する場合は、先にこのポリシーを更新し、新しい用途でデータを使う前に改めて同意をお願いします。更新時は冒頭の「最終更新日」を変更します。',
    'privacy.contact.h': 'お問い合わせ',
    'privacy.contact.p': 'ご質問は <a href="https://github.com/mu-777/dayglassbar/issues" rel="noopener" target="_blank">GitHub の Issue</a> でお願いします。',
    'terms.meta': 'DayGlassBar 本体とこのサイトの利用規約。',
    'terms.title': '利用規約',
    'terms.updated': '最終更新日: 2026年7月15日',
    'terms.intro': '本規約は、デスクトップアプリ DayGlassBar 本体とこのサイトに適用されます。アプリのダウンロード・利用、またはこのサイトの利用をもって、本規約に同意したものとみなします。同意いただけない場合は、アプリおよびこのサイトの利用をお控えください。',
    'terms.license.h': 'ライセンスと料金',
    'terms.license.1': 'DayGlassBar は MIT ライセンスで公開されている無料のオープンソースソフトウェアです。同ライセンスの条件のもとで、利用・複製・改変・再配布ができます。ライセンス全文は<a href="https://github.com/mu-777/dayglassbar/blob/master/LICENSE" rel="noopener" target="_blank">リポジトリ</a>にあります。',
    'terms.asis.h': '無保証',
    'terms.asis.1': 'アプリおよびこのサイトは「現状のまま」提供され、いかなる保証もありません。法令で認められる最大限の範囲で（MIT ライセンスの定めのとおり）、作者はアプリまたはこのサイトの利用・利用不能から生じるいかなる損害についても責任を負いません。',
    'terms.use.h': '利用にあたって',
    'terms.use.1': 'アプリは適用される法令に従って利用してください。Google カレンダー連携を有効にする場合は、Google 自身の規約にも従ってください。第三者のサービスへの不正アクセス・妨害・濫用のためにアプリを使わないでください。',
    'terms.google.h': '第三者サービス（Google カレンダー）',
    'terms.google.1': 'Google カレンダー連携は任意の機能で、既定では無効です。アプリを通じた Google サービスの利用には <a href="https://policies.google.com/terms" rel="noopener" target="_blank">Google の利用規約</a>も適用されます。DayGlassBar が Google API から受け取ったデータの扱いは<a href="privacy.html">プライバシーポリシー</a>に記載のとおりで、Limited Use（限定利用）要件を含む <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener" target="_blank">Google API Services User Data Policy</a> を遵守します。',
    'terms.donations.h': '寄付について',
    'terms.donations.1': 'アプリは無料です。Ko-fi を通じた寄付は任意のものであり、ソフトウェアや追加機能の対価ではありません。寄付の決済は Ko-fi 自身の規約に基づき Ko-fi が処理します。',
    'terms.changes.h': '規約の変更',
    'terms.changes.1': '本規約は必要に応じて改定されることがあり、その際は冒頭の「最終更新日」を更新します。変更後もアプリまたはこのサイトの利用を続けた場合、変更後の規約に同意したものとみなします。',
    'terms.law.h': '準拠法',
    'terms.law.1': '本規約は日本法に準拠します。',
    'terms.contact.h': 'お問い合わせ',
    'terms.contact.p': 'ご質問は <a href="https://github.com/mu-777/dayglassbar/issues" rel="noopener" target="_blank">GitHub の Issue</a> でお願いします。',
    // dynamic
    'dyn.os.win': 'Windows 用',
    'dyn.os.mac': 'macOS 用',
    'dyn.version': (tag) => `${tag} — GitHub Actions により自動ビルド。`,
    'dyn.noRelease': 'ビルドは GitHub Releases で配布しています。',
  },
};

/* ---------------- state ---------------- */
const state = {
  lang: 'en',
  os: 'other',
  release: null, // { tag, win, winPortable, mac } or null
};

/* ---------------- i18n apply ---------------- */
function t(key) {
  const v = (I18N[state.lang] && I18N[state.lang][key]);
  return v != null ? v : (I18N.en[key] != null ? I18N.en[key] : key);
}

function applyLang(lang) {
  state.lang = I18N[lang] ? lang : 'en';
  document.documentElement.setAttribute('lang', state.lang);
  document.documentElement.setAttribute('data-lang', state.lang);

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const str = t(el.getAttribute('data-i18n'));
    if (typeof str !== 'string') return;
    if (el.tagName === 'META') el.setAttribute('content', str);
    else el.innerHTML = str;
  });

  // language toggle shows the *other* language
  const toggle = document.getElementById('langToggle');
  if (toggle) toggle.textContent = state.lang === 'en' ? '日本語' : 'English';

  renderDynamic();
  try { localStorage.setItem('dgb-lang', state.lang); } catch (_) {}
}

/* Dynamic (version + OS labels) — re-rendered on language change too. */
function renderDynamic() {
  const heroOs = document.getElementById('heroOs');
  if (heroOs) heroOs.textContent = state.os === 'win' ? t('dyn.os.win') : state.os === 'mac' ? t('dyn.os.mac') : '';

  const heroVersion = document.getElementById('heroVersion');
  const dlVersion = document.getElementById('downloadVersion');
  if (state.release && state.release.tag) {
    if (heroVersion) heroVersion.textContent = state.release.tag;
    if (dlVersion) dlVersion.textContent = I18N[state.lang]['dyn.version'](state.release.tag);
  } else if (state.release === false) {
    // fetch failed / no release yet
    if (heroVersion) heroVersion.textContent = t('hero.version');
    if (dlVersion) dlVersion.textContent = t('dyn.noRelease');
  }
}

/* ---------------- OS detection ---------------- */
function detectOS() {
  const ua = navigator.userAgent || '';
  const plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  if (/mac/i.test(plat) || /Mac OS X/i.test(ua)) return 'mac';
  if (/win/i.test(plat) || /Windows/i.test(ua)) return 'win';
  return 'other';
}

function highlightOS() {
  const map = { win: 'dlWindows', mac: 'dlMac' };
  const id = map[state.os];
  if (id) { const card = document.getElementById(id); if (card) card.classList.add('is-current'); }
}

/* ---------------- GitHub release ---------------- */
function pickAssets(assets) {
  const lc = (a) => (a.name || '').toLowerCase();
  const exes = assets.filter((a) => lc(a).endsWith('.exe'));
  const installer = exes.find((a) => /setup/i.test(a.name)) || exes[0] || null;
  const portable = exes.find((a) => a !== installer) || null;
  const dmg = assets.find((a) => lc(a).endsWith('.dmg')) || null;
  return { installer, portable, dmg };
}

function setHref(id, url) {
  const el = document.getElementById(id);
  if (el && url) el.setAttribute('href', url);
}

async function loadRelease() {
  try {
    // Cap the request so a wedged connection can't leave the version/labels in limbo;
    // browsers without AbortSignal.timeout (pre-2022) just skip the cap.
    const timeoutSignal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(10000) : undefined;
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: timeoutSignal,
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const a = pickAssets(data.assets || []);

    state.release = {
      tag: data.tag_name || data.name || '',
      installer: a.installer && a.installer.browser_download_url,
      portable: a.portable && a.portable.browser_download_url,
      dmg: a.dmg && a.dmg.browser_download_url,
    };

    if (state.release.installer) setHref('winInstaller', state.release.installer);
    if (state.release.portable) setHref('winPortable', state.release.portable);
    if (state.release.dmg) setHref('macDmg', state.release.dmg);

    // Point the hero CTA straight at the detected OS download when we have it.
    const hero = document.getElementById('heroDownload');
    if (hero) {
      if (state.os === 'win' && state.release.installer) hero.setAttribute('href', state.release.installer);
      else if (state.os === 'mac' && state.release.dmg) hero.setAttribute('href', state.release.dmg);
    }
  } catch (e) {
    // No release yet (404) or rate-limited (403): fall back to the Releases page.
    state.release = false;
    ['winInstaller', 'winPortable', 'macDmg'].forEach((id) => setHref(id, RELEASES_PAGE));
    const hero = document.getElementById('heroDownload');
    if (hero) hero.setAttribute('href', RELEASES_PAGE);
  }
  renderDynamic();
}

/* ---------------- macOS download modal ----------------
   Shown the instant a .dmg download link is clicked (hero CTA or the
   Download section's macOS button), so the Gatekeeper workaround is seen
   right when it's needed. Never blocks the download itself. */
function setupMacDlModal() {
  const dialog = document.getElementById('macDlDialog');
  if (!dialog || typeof dialog.showModal !== 'function') return;

  const onDownloadClick = (e) => {
    const href = e.currentTarget.getAttribute('href') || '';
    if (/\.dmg$/i.test(href)) dialog.showModal();
  };
  ['heroDownload', 'macDmg'].forEach((id) => {
    const link = document.getElementById(id);
    if (link) link.addEventListener('click', onDownloadClick);
  });

  const closeBtn = document.getElementById('macDlClose');
  if (closeBtn) closeBtn.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

  const copyBtn = document.getElementById('macDlCopy');
  const cmd = document.getElementById('macDlCmd');
  if (copyBtn && cmd) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(cmd.textContent);
        copyBtn.textContent = t('dlmodal.copied');
        setTimeout(() => { copyBtn.textContent = t('dlmodal.copy'); }, 2000);
      } catch (_) { /* no clipboard access — silently skip */ }
    });
  }
}

/* ---------------- init ---------------- */
function init() {
  // language: saved → browser → English
  let lang = 'en';
  try { lang = localStorage.getItem('dgb-lang') || ''; } catch (_) {}
  if (!lang) lang = /^ja/i.test(navigator.language || '') ? 'ja' : 'en';

  state.os = detectOS();

  applyLang(lang);
  highlightOS();

  const toggle = document.getElementById('langToggle');
  if (toggle) toggle.addEventListener('click', () => applyLang(state.lang === 'en' ? 'ja' : 'en'));

  const yr = document.getElementById('year');
  if (yr) yr.textContent = String(new Date().getFullYear());

  // Donation links (footer + FAQ) all point at the one Ko-fi URL.
  ['footerSupport', 'faqSupport'].forEach((id) => setHref(id, KOFI_URL));

  setupMacDlModal();

  loadRelease();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
