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

export function createStore(dir) {
  const file = path.join(dir, 'settings.json');
  const listeners = new Set();
  let settings = load();

  function load() {
    try {
      const raw = fs.readFileSync(file, 'utf8');
      return mergeWithDefaults(DEFAULT_SETTINGS, JSON.parse(raw));
    } catch {
      return structuredClone(DEFAULT_SETTINGS);
    }
  }

  // Atomic-ish write (tmp + rename), then notify listeners — this is what makes
  // settings apply immediately without a restart (spec 4.5).
  function save(next) {
    settings = mergeWithDefaults(DEFAULT_SETTINGS, next);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf8');
    fs.renameSync(tmp, file);
    for (const fn of listeners) fn(settings);
  }

  return {
    get: () => settings,
    save,
    onChange: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    filePath: file,
  };
}
