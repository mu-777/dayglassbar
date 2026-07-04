// Settings persistence (spec 4.5). Pure Node and therefore testable —
// the caller (src/main/index.js) supplies the directory (app.getPath('userData')).
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_LANGUAGE, LANGUAGES } from '../core/i18n.js';

export const DEFAULT_SETTINGS = {
  version: 1,
  language: DEFAULT_LANGUAGE, // 'en' | 'ja' | 'zh' — UI language. English here is only the fallback; createStore specializes it per machine via `defaultLanguage` (OS locale)
  schedule: {
    weekly: {
      mon: defaultWorkday(),
      tue: defaultWorkday(),
      wed: defaultWorkday(),
      thu: defaultWorkday(),
      fri: defaultWorkday(),
      sat: defaultWorkday(),
      sun: defaultWorkday(),
    },
    overrides: {},
  },
  appearance: {
    displayId: null, // null = primary display
    edge: 'right', // top | bottom | left | right
    thickness: 16, // logical px
    color: '#4a90d9',
    opacity: 0.9,
    track: { enabled: true, opacity: 0.18 },
    breakColor: '#8a8f98',
    ticks: { enabled: true, intervalMinutes: 60 },
    // Calendar overlay (spec 4.6): per provider, each with its own show toggle and color
    // (calm, distinct tints — never alarm colors, invariant #4). Google is cloud-only;
    // Outlook chooses ONE connection method: 'local' (read the signed-in classic Outlook via
    // COM, no sign-in — desktop only) or 'cloud' (Microsoft Graph OAuth). These display prefs
    // are non-secret and live here (exportable); OAuth tokens stay in the separate encrypted
    // store, kept out of export. (ICS feeds were removed — too slow to follow changes.)
    calendar: {
      google: { enabled: false, color: '#c98a3a' },
      outlook: { enabled: false, color: '#4a9e9e', method: 'local' }, // 'local' | 'cloud'
    },
  },
  behavior: {
    // ON by default: DayGlassBar is an ambient always-present bar — if it didn't come
    // back after a reboot, a first-time user would install it and find it silently gone
    // the next day (product failure). Defaulting a login item ON is only a dark pattern
    // when it's hidden/hard to remove; here the first-run onboarding discloses it
    // (onboarding.autoLaunchNote) and it's one click to turn off. Linux is out of scope
    // (applyAutoLaunch returns early there), so this only takes effect on Windows/macOS.
    autoLaunch: true,
    hover: { dwellMs: 350, expandedThickness: 56 },
  },
};

// All-day by default so the bar shows a draining fill no matter what time of day the
// user installs (first-launch visibility goal). We use 0:00–23:59, not 0:00–24:00,
// because validation requires the span to be strictly under 24h (validate.js
// v.spanUnder24); the 1-minute midnight gap still shows the track, so the bar never
// disappears. The lunch break is kept as a sensible starting point users can remove.
function defaultWorkday() {
  return { enabled: true, start: '0:00', end: '23:59', breaks: [{ start: '12:00', end: '13:00' }] };
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Defaults fill in missing keys; arrays and scalars present in `data` win as-is.
export function mergeWithDefaults(defaults, data) {
  if (!isPlainObject(data)) return structuredClone(defaults);
  const out = {};
  for (const key of new Set([...Object.keys(defaults), ...Object.keys(data)])) {
    const d = defaults[key];
    const v = data[key];
    if (v === undefined) out[key] = structuredClone(d);
    else if (isPlainObject(d) && isPlainObject(v)) out[key] = mergeWithDefaults(d, v);
    else out[key] = structuredClone(v);
  }
  return out;
}

export function createStore(dir, log = null, { defaultLanguage } = {}) {
  const file = path.join(dir, 'settings.json');
  // Instance defaults = DEFAULT_SETTINGS with the machine-appropriate UI language.
  // The caller (main) derives defaultLanguage from the OS locale, so a first run — and
  // any load/save where the user never chose a language explicitly — comes up in the
  // user's own language instead of hardcoded English. Everything else in
  // DEFAULT_SETTINGS is machine-independent, so only `language` is specialized here.
  const defaults = structuredClone(DEFAULT_SETTINGS);
  if (LANGUAGES.includes(defaultLanguage)) defaults.language = defaultLanguage;
  // First-launch sentinel: a non-secret per-install marker. Kept OUT of settings.json
  // (and thus out of export/import) because "have I onboarded on this machine" is local
  // install state, not a portable preference — importing settings shouldn't suppress the
  // first-run guide on a fresh device, nor should a fresh install inherit it.
  const onboardedFile = path.join(dir, 'onboarded');
  const listeners = new Set();
  let settings = load();

  function load() {
    try {
      const raw = fs.readFileSync(file, 'utf8');
      return mergeWithDefaults(defaults, JSON.parse(raw));
    } catch (err) {
      // A present-but-unreadable file means corruption (worth flagging); an absent file
      // is just a first run on this machine (routine).
      if (fs.existsSync(file)) log?.warn('settings unreadable; falling back to defaults', err);
      else log?.debug('no settings file yet; using defaults');
      return structuredClone(defaults);
    }
  }

  // Atomic-ish write (tmp + rename), then notify listeners — this is what makes
  // settings apply immediately without a restart (spec 4.5).
  function save(next) {
    settings = mergeWithDefaults(defaults, next);
    try {
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf8');
      fs.renameSync(tmp, file);
    } catch (err) {
      log?.error('settings save failed', err); // disk full / permissions — then propagate as before
      throw err;
    }
    for (const fn of listeners) fn(settings);
  }

  // True once the first-launch guide has been shown (the sentinel exists).
  function isOnboarded() {
    return fs.existsSync(onboardedFile);
  }

  // Mark this install as onboarded so the guide only ever shows once. Best-effort:
  // a failure here only means the guide might show again, never a crash.
  function markOnboarded() {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(onboardedFile, new Date().toISOString(), 'utf8');
    } catch {
      /* non-fatal */
    }
  }

  return {
    get: () => settings,
    save,
    onChange: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    filePath: file,
    isOnboarded,
    markOnboarded,
    // Returns a fresh clone so callers (e.g. settings:reset) can't mutate the store's
    // instance defaults by touching the returned object.
    getDefaults: () => structuredClone(defaults),
  };
}
