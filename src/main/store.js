// Settings persistence (spec 4.5). Pure Node and therefore testable —
// the caller (src/main/index.js) supplies the directory (app.getPath('userData')).
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_LANGUAGE } from '../core/i18n.js';

export const DEFAULT_SETTINGS = {
  version: 1,
  language: DEFAULT_LANGUAGE, // 'en' | 'ja' | 'zh' — UI language (default English)
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
    autoLaunch: false,
    hover: { dwellMs: 350, expandedThickness: 56 },
  },
};

function defaultWorkday() {
  return { enabled: true, start: '9:00', end: '17:00', breaks: [{ start: '12:00', end: '13:00' }] };
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

export function createStore(dir, log = null) {
  const file = path.join(dir, 'settings.json');
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
      return mergeWithDefaults(DEFAULT_SETTINGS, JSON.parse(raw));
    } catch (err) {
      // A present-but-unreadable file means corruption (worth flagging); an absent file
      // is just a first run on this machine (routine).
      if (fs.existsSync(file)) log?.warn('settings unreadable; falling back to defaults', err);
      else log?.debug('no settings file yet; using defaults');
      return structuredClone(DEFAULT_SETTINGS);
    }
  }

  // Atomic-ish write (tmp + rename), then notify listeners — this is what makes
  // settings apply immediately without a restart (spec 4.5).
  function save(next) {
    settings = mergeWithDefaults(DEFAULT_SETTINGS, next);
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
  };
}
