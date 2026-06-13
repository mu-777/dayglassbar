// Settings validation (spec 4.1). Returns Japanese messages for the settings UI.
import {
  WEEK_ORDER,
  parseTimeToMinutes,
  normalizeDayRecord,
  resolveDay,
  parseDateKey,
  addDays,
} from './schedule.js';

const DAY_LABELS = { mon: '月', tue: '火', wed: '水', thu: '木', fri: '金', sat: '土', sun: '日' };

function err(path, message) {
  return { path, message };
}

// rec: raw {enabled, start, end, breaks}. Pushes errors; returns nothing useful.
function validateDayRecord(rec, path, label, errors) {
  if (!rec || !rec.enabled) return;
  const startMin = parseTimeToMinutes(rec.start);
  const endMin = parseTimeToMinutes(rec.end);
  if (startMin == null) errors.push(err(path, `${label}: 開始時刻の形式が不正です（例: 9:00）`));
  if (endMin == null) errors.push(err(path, `${label}: 終了時刻の形式が不正です（例: 17:00。日跨ぎは 25:00 のように24時超表記）`));
  if (startMin == null || endMin == null) return;
  if (startMin >= 1440) {
    errors.push(err(path, `${label}: 開始は 24:00 未満で指定してください`));
    return;
  }
  if (endMin <= startMin) {
    errors.push(err(path, `${label}: 終了は開始より後にしてください（日跨ぎは 25:00 のように24時超表記）`));
    return;
  }
  if (endMin - startMin >= 1440) {
    errors.push(err(path, `${label}: 区間は24時間未満にしてください`));
    return;
  }
  const breaks = (rec.breaks || []).map((b, i) => ({
    i,
    startMin: parseTimeToMinutes(b.start),
    endMin: parseTimeToMinutes(b.end),
  }));
  for (const b of breaks) {
    if (b.startMin == null || b.endMin == null) {
      errors.push(err(path, `${label}: 休憩${b.i + 1}の時刻形式が不正です`));
      return;
    }
    if (b.startMin >= b.endMin) errors.push(err(path, `${label}: 休憩${b.i + 1}は開始<終了にしてください`));
    if (b.startMin < startMin || b.endMin > endMin) {
      errors.push(err(path, `${label}: 休憩${b.i + 1}が区間（開始〜終了）の外にあります`));
    }
  }
  const sorted = [...breaks].sort((a, b) => a.startMin - b.startMin);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startMin != null && sorted[i - 1].endMin != null && sorted[i].startMin < sorted[i - 1].endMin) {
      errors.push(err(path, `${label}: 休憩同士が重なっています`));
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
    errors.push(err('schedule', 'スケジュールがありません'));
    return { ok: false, errors };
  }

  for (const key of WEEK_ORDER) {
    validateDayRecord(schedule.weekly[key], `schedule.weekly.${key}`, `${DAY_LABELS[key]}曜`, errors);
  }
  const overrides = schedule.overrides || {};
  for (const [dateKey, rec] of Object.entries(overrides)) {
    if (!parseDateKey(dateKey)) {
      errors.push(err(`schedule.overrides.${dateKey}`, `特定日 ${dateKey}: 日付の形式が不正です（YYYY-MM-DD）`));
      continue;
    }
    validateDayRecord(rec, `schedule.overrides.${dateKey}`, `特定日 ${dateKey}`, errors);
  }

  // Consecutive-day overlap (spec 3.1): only meaningful once per-day records are sane.
  if (errors.length === 0) {
    for (let i = 0; i < WEEK_ORDER.length; i++) {
      const a = WEEK_ORDER[i];
      const b = WEEK_ORDER[(i + 1) % WEEK_ORDER.length];
      const prev = normalizeDayRecord(schedule.weekly[a]);
      const next = normalizeDayRecord(schedule.weekly[b]);
      if (overlapsNextDay(prev, next)) {
        errors.push(err(`schedule.weekly.${a}`, `${DAY_LABELS[a]}曜の区間が翌${DAY_LABELS[b]}曜の区間と重なっています`));
      }
    }
    // Each override is checked against its *actual* neighbors (which may themselves be overrides).
    for (const dateKey of Object.keys(overrides)) {
      const date = parseDateKey(dateKey);
      if (!date) continue;
      const here = resolveDay(schedule, date);
      const prev = resolveDay(schedule, addDays(date, -1));
      const next = resolveDay(schedule, addDays(date, 1));
      if (overlapsNextDay(prev, here)) {
        errors.push(err(`schedule.overrides.${dateKey}`, `特定日 ${dateKey}: 前日の区間と重なっています`));
      }
      if (overlapsNextDay(here, next)) {
        errors.push(err(`schedule.overrides.${dateKey}`, `特定日 ${dateKey}: 翌日の区間と重なっています`));
      }
    }
  }

  // appearance / behavior
  const ap = settings?.appearance || {};
  const numIn = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  const hexColor = (v) => /^#[0-9a-fA-F]{6}$/.test(v || '');
  if (!['top', 'bottom', 'left', 'right'].includes(ap.edge)) errors.push(err('appearance.edge', '辺の指定が不正です'));
  if (!Number.isInteger(ap.thickness) || ap.thickness < 1 || ap.thickness > 64) {
    errors.push(err('appearance.thickness', '太さは 1〜64 px で指定してください'));
  }
  if (!hexColor(ap.color)) errors.push(err('appearance.color', '色は #RRGGBB 形式で指定してください'));
  if (!hexColor(ap.breakColor)) errors.push(err('appearance.breakColor', '休憩の色は #RRGGBB 形式で指定してください'));
  if (!numIn(ap.opacity, 0.05, 1)) errors.push(err('appearance.opacity', '不透明度は 0.05〜1 で指定してください'));
  if (!ap.track || typeof ap.track.enabled !== 'boolean' || !numIn(ap.track.opacity, 0, 1)) {
    errors.push(err('appearance.track', '下地の設定が不正です'));
  }
  if (
    !ap.ticks ||
    typeof ap.ticks.enabled !== 'boolean' ||
    !Number.isInteger(ap.ticks.intervalMinutes) ||
    ap.ticks.intervalMinutes < 5 ||
    ap.ticks.intervalMinutes > 720
  ) {
    errors.push(err('appearance.ticks', '目盛り間隔は 5〜720 分で指定してください'));
  }
  const hv = settings?.behavior?.hover || {};
  if (!Number.isInteger(hv.dwellMs) || hv.dwellMs < 100 || hv.dwellMs > 2000) {
    errors.push(err('behavior.hover.dwellMs', 'ホバー判定時間は 100〜2000 ms で指定してください'));
  }
  if (!Number.isInteger(hv.expandedThickness) || hv.expandedThickness < 24 || hv.expandedThickness > 200) {
    errors.push(err('behavior.hover.expandedThickness', '展開時の太さは 24〜200 px で指定してください'));
  }
  if (typeof settings?.behavior?.autoLaunch !== 'boolean') {
    errors.push(err('behavior.autoLaunch', '自動起動の設定が不正です'));
  }

  return { ok: errors.length === 0, errors };
}
