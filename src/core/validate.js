// Settings validation (spec 4.1). Returns language-agnostic errors:
// { path, code, params } where `code` is an i18n key (see src/core/i18n.js, `v.*`)
// and `params` carries what the message template needs (a label descriptor, a break
// index, weekday keys, …). Whoever displays an error formats it for the current
// language — keeping this module pure and locale-free (CLAUDE.md invariant #2).
import {
  WEEK_ORDER,
  parseTimeToMinutes,
  normalizeDayRecord,
  resolveDay,
  parseDateKey,
  addDays,
} from './schedule.js';
import { LANGUAGES } from './i18n.js';

function err(path, code, params) {
  return params ? { path, code, params } : { path, code };
}

// rec: raw {enabled, start, end, breaks}. `label` is a descriptor object
// ({ labelKind:'weekday', dayKey } or { labelKind:'date', date }) carried in params
// so the display layer can localize the day/override name. Pushes errors.
function validateDayRecord(rec, path, label, errors) {
  if (!rec || !rec.enabled) return;
  const startMin = parseTimeToMinutes(rec.start);
  const endMin = parseTimeToMinutes(rec.end);
  if (startMin == null) errors.push(err(path, 'v.startFormat', { ...label }));
  if (endMin == null) errors.push(err(path, 'v.endFormat', { ...label }));
  if (startMin == null || endMin == null) return;
  if (startMin >= 1440) {
    errors.push(err(path, 'v.startBefore24', { ...label }));
    return;
  }
  if (endMin <= startMin) {
    errors.push(err(path, 'v.endAfterStart', { ...label }));
    return;
  }
  if (endMin - startMin >= 1440) {
    errors.push(err(path, 'v.spanUnder24', { ...label }));
    return;
  }
  const breaks = (rec.breaks || []).map((b, i) => ({
    i,
    startMin: parseTimeToMinutes(b.start),
    endMin: parseTimeToMinutes(b.end),
  }));
  for (const b of breaks) {
    if (b.startMin == null || b.endMin == null) {
      errors.push(err(path, 'v.breakFormat', { ...label, index: b.i }));
      return;
    }
    if (b.startMin >= b.endMin) errors.push(err(path, 'v.breakOrder', { ...label, index: b.i }));
    if (b.startMin < startMin || b.endMin > endMin) {
      errors.push(err(path, 'v.breakOutside', { ...label, index: b.i }));
    }
  }
  const sorted = [...breaks].sort((a, b) => a.startMin - b.startMin);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startMin != null && sorted[i - 1].endMin != null && sorted[i].startMin < sorted[i - 1].endMin) {
      errors.push(err(path, 'v.breaksOverlap', { ...label }));
      break;
    }
  }
}

// prev day's interval spills into the next day when endMin > 1440 (spec 3.1).
function overlapsNextDay(prevRec, nextRec) {
  if (!prevRec.enabled || !nextRec.enabled) return false;
  if (prevRec.endMin == null || nextRec.startMin == null) return false;
  return prevRec.endMin > 1440 && nextRec.startMin < prevRec.endMin - 1440;
}

export function validateSettings(settings) {
  const errors = [];
  const schedule = settings?.schedule;
  if (!schedule || !schedule.weekly) {
    errors.push(err('schedule', 'v.scheduleMissing'));
    return { ok: false, errors };
  }

  for (const key of WEEK_ORDER) {
    validateDayRecord(schedule.weekly[key], `schedule.weekly.${key}`, { labelKind: 'weekday', dayKey: key }, errors);
  }
  const overrides = schedule.overrides || {};
  for (const [dateKey, rec] of Object.entries(overrides)) {
    const label = { labelKind: 'date', date: dateKey };
    if (!parseDateKey(dateKey)) {
      errors.push(err(`schedule.overrides.${dateKey}`, 'v.overrideDateFormat', label));
      continue;
    }
    validateDayRecord(rec, `schedule.overrides.${dateKey}`, label, errors);
  }

  // Consecutive-day overlap (spec 3.1): only meaningful once per-day records are sane.
  if (errors.length === 0) {
    for (let i = 0; i < WEEK_ORDER.length; i++) {
      const a = WEEK_ORDER[i];
      const b = WEEK_ORDER[(i + 1) % WEEK_ORDER.length];
      const prev = normalizeDayRecord(schedule.weekly[a]);
      const next = normalizeDayRecord(schedule.weekly[b]);
      if (overlapsNextDay(prev, next)) {
        errors.push(err(`schedule.weekly.${a}`, 'v.weeklyOverlap', { dayKeyA: a, dayKeyB: b }));
      }
    }
    // Each override is checked against its *actual* neighbors (which may themselves be overrides).
    for (const dateKey of Object.keys(overrides)) {
      const date = parseDateKey(dateKey);
      if (!date) continue;
      const label = { labelKind: 'date', date: dateKey };
      const here = resolveDay(schedule, date);
      const prev = resolveDay(schedule, addDays(date, -1));
      const next = resolveDay(schedule, addDays(date, 1));
      if (overlapsNextDay(prev, here)) {
        errors.push(err(`schedule.overrides.${dateKey}`, 'v.overridePrevOverlap', label));
      }
      if (overlapsNextDay(here, next)) {
        errors.push(err(`schedule.overrides.${dateKey}`, 'v.overrideNextOverlap', label));
      }
    }
  }

  // appearance / behavior
  const ap = settings?.appearance || {};
  const numIn = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  const hexColor = (v) => /^#[0-9a-fA-F]{6}$/.test(v || '');
  if (!['top', 'bottom', 'left', 'right'].includes(ap.edge)) errors.push(err('appearance.edge', 'v.edge'));
  if (!Number.isInteger(ap.thickness) || ap.thickness < 1 || ap.thickness > 64) {
    errors.push(err('appearance.thickness', 'v.thickness'));
  }
  if (!hexColor(ap.color)) errors.push(err('appearance.color', 'v.color'));
  if (!hexColor(ap.breakColor)) errors.push(err('appearance.breakColor', 'v.breakColor'));
  if (!numIn(ap.opacity, 0.05, 1)) errors.push(err('appearance.opacity', 'v.opacity'));
  if (!ap.track || typeof ap.track.enabled !== 'boolean' || !numIn(ap.track.opacity, 0, 1)) {
    errors.push(err('appearance.track', 'v.track'));
  }
  if (
    !ap.ticks ||
    typeof ap.ticks.enabled !== 'boolean' ||
    !Number.isInteger(ap.ticks.intervalMinutes) ||
    ap.ticks.intervalMinutes < 5 ||
    ap.ticks.intervalMinutes > 720
  ) {
    errors.push(err('appearance.ticks', 'v.ticks'));
  }
  const hv = settings?.behavior?.hover || {};
  if (!Number.isInteger(hv.dwellMs) || hv.dwellMs < 100 || hv.dwellMs > 2000) {
    errors.push(err('behavior.hover.dwellMs', 'v.dwell'));
  }
  if (!Number.isInteger(hv.expandedThickness) || hv.expandedThickness < 24 || hv.expandedThickness > 200) {
    errors.push(err('behavior.hover.expandedThickness', 'v.expanded'));
  }
  if (typeof settings?.behavior?.autoLaunch !== 'boolean') {
    errors.push(err('behavior.autoLaunch', 'v.autoLaunch'));
  }

  // language: optional (undefined → store fills the default); reject only a present-but-bad value.
  if (settings?.language !== undefined && !LANGUAGES.includes(settings.language)) {
    errors.push(err('language', 'v.language'));
  }

  return { ok: errors.length === 0, errors };
}
