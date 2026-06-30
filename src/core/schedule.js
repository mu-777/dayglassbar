// DayGlassBar core: schedule resolution and bar state computation.
// Pure logic — no Electron / DOM dependencies. Keep it that way (CLAUDE.md invariant #2).

import { computeEventSegments } from './calendar.js';

export const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']; // Date#getDay() order
export const WEEK_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']; // display / pairing order

// "H:MM" / "HH:MM". Hours 0..47: over-24h notation expresses overnight end times
// (e.g. 13:00–25:00 = until 1:00 the next day). Spec 3.1.
export function parseTimeToMinutes(str) {
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(String(str ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 47) return null;
  return h * 60 + min;
}

export function formatMinutes(totalMin) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function dateKeyOf(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key ?? ''));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

// raw day record → {enabled:false} | {enabled:true, startMin, endMin, breaks:[{startMin,endMin}]}
export function normalizeDayRecord(rec) {
  if (!rec || !rec.enabled) return { enabled: false };
  return {
    enabled: true,
    startMin: parseTimeToMinutes(rec.start),
    endMin: parseTimeToMinutes(rec.end),
    breaks: (rec.breaks || []).map((b) => ({
      startMin: parseTimeToMinutes(b.start),
      endMin: parseTimeToMinutes(b.end),
    })),
  };
}

// schedule = { weekly: {mon..sun: rawRec}, overrides: {'YYYY-MM-DD': rawRec} }
// A specific-date override (keyed by the interval's *start* date) beats the weekly default.
export function resolveDay(schedule, date) {
  const key = dateKeyOf(date);
  const ov = schedule.overrides ? schedule.overrides[key] : undefined;
  const raw = ov !== undefined ? ov : schedule.weekly[WEEKDAY_KEYS[date.getDay()]];
  return normalizeDayRecord(raw);
}

// Local-midnight-anchored instant. The Date constructor normalizes minutes >= 1440
// into the next calendar day, which is exactly the over-24h semantics we want.
export function msAt(date, minutes) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, minutes, 0, 0).getTime();
}

// The interval containing nowMs, if any. Yesterday is checked first because an
// overnight interval (end > 24:00) extends into today and the instant belongs
// to the interval that started it (spec 3.1).
export function getActiveInterval(schedule, nowMs) {
  const now = new Date(nowMs);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = addDays(today, -1);
  for (const day of [yesterday, today]) {
    const rec = resolveDay(schedule, day);
    if (!rec.enabled) continue;
    const startMs = msAt(day, rec.startMin);
    const endMs = msAt(day, rec.endMin);
    if (nowMs >= startMs && nowMs < endMs) {
      return {
        anchorKey: dateKeyOf(day),
        anchorMidnightMs: msAt(day, 0),
        startMs,
        endMs,
        breaks: rec.breaks.map((b) => ({
          startMs: msAt(day, b.startMin),
          endMs: msAt(day, b.endMin),
        })),
      };
    }
  }
  return null;
}

// What range to show as "the current schedule" (e.g. the tray summary line).
// When an overnight interval started yesterday is still running, this reports
// *that* interval — its source weekday + over-24h range — instead of the naive
// calendar-today record, so e.g. Mon 02:00 inside Sun 9:00–27:00 reports Sunday.
// Falls back to the calendar-today record when no interval is active.
// Returns { active, weekdayKey, dateKey, enabled, startMin?, endMin? }.
export function getActiveDaySummary(schedule, nowMs) {
  const interval = getActiveInterval(schedule, nowMs);
  if (interval) {
    const sourceDate = parseDateKey(interval.anchorKey);
    return {
      active: true,
      weekdayKey: WEEKDAY_KEYS[sourceDate.getDay()],
      dateKey: interval.anchorKey,
      enabled: true,
      startMin: Math.round((interval.startMs - interval.anchorMidnightMs) / 60000),
      endMin: Math.round((interval.endMs - interval.anchorMidnightMs) / 60000),
    };
  }
  const today = new Date(nowMs);
  const rec = resolveDay(schedule, today);
  return {
    active: false,
    weekdayKey: WEEKDAY_KEYS[today.getDay()],
    dateKey: dateKeyOf(today),
    enabled: rec.enabled,
    startMin: rec.enabled ? rec.startMin : undefined,
    endMin: rec.enabled ? rec.endMin : undefined,
  };
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Segments covering the remaining region [nowFrac, 1] of the axis.
// kind 'fill' = water, kind 'break' = gray break. The elapsed side gets no
// segments (only the optional track), so breaks that have already passed
// disappear together with the rest of the elapsed time (spec 3.2).
export function computeSegments(interval, nowMs) {
  const span = interval.endMs - interval.startMs;
  const p = clamp01((nowMs - interval.startMs) / span);
  const cuts = [];
  for (const b of interval.breaks) {
    const from = clamp01((Math.max(b.startMs, nowMs) - interval.startMs) / span);
    const to = clamp01((b.endMs - interval.startMs) / span);
    if (to > from && to > p) cuts.push([Math.max(from, p), to]);
  }
  cuts.sort((a, b) => a[0] - b[0]);
  const segments = [];
  let cursor = p;
  for (const [from, to] of cuts) {
    if (from > cursor) segments.push({ from: cursor, to: from, kind: 'fill' });
    segments.push({ from, to, kind: 'break' });
    cursor = Math.max(cursor, to);
  }
  if (cursor < 1) segments.push({ from: cursor, to: 1, kind: 'fill' });
  return segments;
}

// Interior tick positions (fractions), every `intervalMinutes` from the start.
export function computeTicks(interval, intervalMinutes) {
  if (!intervalMinutes || intervalMinutes <= 0) return [];
  const span = interval.endMs - interval.startMs;
  const step = intervalMinutes * 60000;
  const ticks = [];
  for (let t = interval.startMs + step; t < interval.endMs; t += step) {
    ticks.push((t - interval.startMs) / span);
  }
  return ticks;
}

export function formatDurationMs(ms) {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

// Axis-relative clock label ("13:00" … "24:30" … "25:00"): consistent with the
// over-24h notation of the axis even after midnight.
function axisLabel(ms, anchorMidnightMs) {
  return formatMinutes(Math.round((ms - anchorMidnightMs) / 60000));
}

// Single entry point used by the main process every tick.
// Modes (spec 5): 'active' (inside the interval), 'empty' (outside, track only),
// 'hidden' (the day is OFF and no overnight interval is running).
// opts.events (pre-normalized via calendar.js) + opts.calendarEnabled overlay the
// remaining side with calendar bands (spec 4.6); they only appear in 'active' mode.
export function getBarState(schedule, nowMs, opts = {}) {
  const interval = getActiveInterval(schedule, nowMs);
  if (interval) {
    const span = interval.endMs - interval.startMs;
    const state = {
      mode: 'active',
      nowFrac: clamp01((nowMs - interval.startMs) / span),
      segments: computeSegments(interval, nowMs),
      ticks: opts.tickIntervalMinutes ? computeTicks(interval, opts.tickIntervalMinutes) : [],
      startMs: interval.startMs,
      endMs: interval.endMs,
      labels: {
        start: axisLabel(interval.startMs, interval.anchorMidnightMs),
        end: axisLabel(interval.endMs, interval.anchorMidnightMs),
        now: axisLabel(nowMs, interval.anchorMidnightMs),
        remaining: formatDurationMs(interval.endMs - nowMs),
      },
    };
    if (opts.calendarEnabled) state.events = computeEventSegments(interval, nowMs, opts.events || []);
    return state;
  }
  const todayRec = resolveDay(schedule, new Date(nowMs));
  return { mode: todayRec.enabled ? 'empty' : 'hidden' };
}
