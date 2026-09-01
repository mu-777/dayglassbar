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

// An end at or before the start means the interval runs past midnight: "22:00-02:00"
// resolves to 22:00 → 26:00 (= 02:00 the next day). This is what lets the settings UI use
// plain clock pickers (<input type="time">, 0:00-23:59) with no "next day" checkbox — the
// wrap is inferred. Over-24h notation ("26:00") still parses and passes through untouched,
// so hand-written / imported / older settings.json files keep their meaning.
export function resolveEndMinutes(startMin, endMin) {
  if (startMin == null || endMin == null) return endMin;
  return endMin <= startMin ? endMin + 1440 : endMin;
}

// A break's clock time resolves to its first occurrence at or after the day's start, so a
// break inside an overnight interval ("00:30-01:00" within 22:00-02:00) lands on the next
// calendar day without the user typing 24:30. Within an ordinary daytime interval nothing
// moves. A reversed break (end before start on the same day) still comes out reversed so
// validation can flag it (v.breakOrder) instead of silently "fixing" it.
export function resolveBreakMinutes(dayStartMin, startMin, endMin) {
  const shift = (m) => (m != null && dayStartMin != null && m < dayStartMin ? m + 1440 : m);
  return { startMin: shift(startMin), endMin: shift(endMin) };
}

// raw day record → {enabled:false} | {enabled:true, startMin, endMin, breaks:[{startMin,endMin}]}
export function normalizeDayRecord(rec) {
  if (!rec || !rec.enabled) return { enabled: false };
  const startMin = parseTimeToMinutes(rec.start);
  const endMin = resolveEndMinutes(startMin, parseTimeToMinutes(rec.end));
  return {
    enabled: true,
    startMin,
    endMin,
    breaks: (rec.breaks || []).map((b) =>
      resolveBreakMinutes(startMin, parseTimeToMinutes(b.start), parseTimeToMinutes(b.end))),
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

// The next interval that has not started yet, scanning forward from today (inclusive).
// Only called when there is no *active* interval right now (bar mode 'empty'), so we
// never need to consider "now falls inside some interval" — that case is by definition
// getActiveInterval's job and would mean the bar isn't in 'empty' mode to begin with.
// horizonDays defaults to a bit over a week so a schedule with only one enabled weekday
// still finds it. Returns null if nothing enabled turns up within the horizon.
export function getNextInterval(schedule, nowMs, horizonDays = 8) {
  const now = new Date(nowMs);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 0; i < horizonDays; i++) {
    const day = addDays(today, i);
    const rec = resolveDay(schedule, day);
    if (!rec.enabled || rec.startMin == null) continue;
    const startMs = msAt(day, rec.startMin);
    if (startMs > nowMs) {
      return {
        anchorKey: dateKeyOf(day),
        anchorMidnightMs: msAt(day, 0),
        startMs,
        endMs: msAt(day, rec.endMin),
      };
    }
  }
  return null;
}

// Drop override entries that are safely in the past, so the list doesn't grow forever
// (D-3). The cutoff is *yesterday's* dateKey, not today's: an overnight interval (end >
// 24:00) that started yesterday can still be running into today, so yesterday's entry
// must survive one extra day past its calendar date. dateKeyOf's 'YYYY-MM-DD' format
// sorts identically to date order under plain string comparison, so `<` works directly
// without parsing. Keys that don't parse as a date are left alone (never pruned).
export function prunePastOverrides(overrides, nowMs) {
  const cutoff = dateKeyOf(addDays(new Date(nowMs), -1));
  const kept = {};
  let changed = false;
  for (const [key, rec] of Object.entries(overrides || {})) {
    if (parseDateKey(key) && key < cutoff) {
      changed = true; // strictly before yesterday: drop it
      continue;
    }
    kept[key] = rec;
  }
  return { changed, overrides: kept };
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

// Interior tick positions (fractions), every `intervalMinutes`.
//
// Ticks are anchored to the CLOCK (the interval's own midnight), not to the interval start:
// with the default 60-minute spacing they land exactly on 1:00, 2:00, ... even when the day
// starts at 9:30. That is what makes a tick readable as "an hour boundary" rather than "N
// minutes since I started". Positions are built with msAt (calendar arithmetic), so a DST
// jump inside the interval shifts them with the wall clock instead of drifting an hour.
export function computeTicks(interval, intervalMinutes) {
  if (!intervalMinutes || intervalMinutes <= 0) return [];
  const span = interval.endMs - interval.startMs;
  if (!(span > 0)) return [];
  const anchorDate = parseDateKey(interval.anchorKey);
  const at = (minutes) =>
    anchorDate ? msAt(anchorDate, minutes) : interval.anchorMidnightMs + minutes * 60000;
  const ticks = [];
  // Intervals are under 24h and start before 24:00, so 48h of steps always covers the span.
  for (let m = intervalMinutes; m <= 48 * 60; m += intervalMinutes) {
    const ms = at(m);
    if (ms >= interval.endMs) break;
    if (ms > interval.startMs) ticks.push((ms - interval.startMs) / span);
  }
  return ticks;
}

// Start of the next local calendar day. Built from the date parts rather than now + 24h so
// it stays correct across a DST change. Used by the tray's temporary hide, which expires
// "tomorrow" (src/main/index.js).
export function nextLocalMidnightMs(nowMs) {
  const d = new Date(nowMs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).getTime();
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
