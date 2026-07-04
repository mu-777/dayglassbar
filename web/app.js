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
    'download.unsigned.p': 'On Windows, the SmartScreen prompt may appear — click <em>More info → Run anyway</em>. On macOS, right-click the app → <em>Open</em> (or run <code>xattr -dr com.apple.quarantine</code> on it).',
    'download.all': 'All releases &amp; release notes →',
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
    'download.unsigned.p': 'Windows では SmartScreen が出ることがあります — <em>詳細情報 → 実行</em> を選びます。macOS ではアプリを右クリック →<em>開く</em>（または <code>xattr -dr com.apple.quarantine</code> を実行）します。',
    'download.all': 'すべてのリリース・変更履歴 →',
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

  loadRelease();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
