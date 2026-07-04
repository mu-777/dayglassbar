import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTimeToMinutes,
  formatMinutes,
  resolveDay,
  getActiveInterval,
  getActiveDaySummary,
  getNextInterval,
  prunePastOverrides,
  getBarState,
} from '../src/core/schedule.js';

const day = (start, end, breaks = []) => ({ enabled: true, start, end, breaks });
const OFF = { enabled: false };

// 2026-06-15 is a Monday.
const MON = (h, m = 0) => new Date(2026, 5, 15, h, m).getTime();
const TUE = (h, m = 0) => new Date(2026, 5, 16, h, m).getTime();
const WED = (h, m = 0) => new Date(2026, 5, 17, h, m).getTime();

function weekly(partial) {
  return {
    weekly: { mon: OFF, tue: OFF, wed: OFF, thu: OFF, fri: OFF, sat: OFF, sun: OFF, ...partial },
    overrides: {},
  };
}

test('parseTimeToMinutes accepts 0:00..47:59 and rejects the rest', () => {
  assert.equal(parseTimeToMinutes('9:00'), 540);
  assert.equal(parseTimeToMinutes('09:00'), 540);
  assert.equal(parseTimeToMinutes('25:30'), 1530);
  assert.equal(parseTimeToMinutes('47:59'), 2879);
  assert.equal(parseTimeToMinutes('48:00'), null);
  assert.equal(parseTimeToMinutes('9'), null);
  assert.equal(parseTimeToMinutes('9:5'), null);
  assert.equal(parseTimeToMinutes('aa:bb'), null);
  assert.equal(parseTimeToMinutes(''), null);
});

test('formatMinutes keeps over-24h notation', () => {
  assert.equal(formatMinutes(1530), '25:30');
  assert.equal(formatMinutes(540), '9:00');
});

test('resolveDay: override beats weekly', () => {
  const schedule = weekly({ mon: day('9:00', '17:00') });
  schedule.overrides['2026-06-15'] = day('10:00', '15:00');
  const rec = resolveDay(schedule, new Date(2026, 5, 15));
  assert.equal(rec.startMin, 600);
  assert.equal(rec.endMin, 900);
});

test('resolveDay: override can disable a weekly-enabled day', () => {
  const schedule = weekly({ mon: day('9:00', '17:00') });
  schedule.overrides['2026-06-15'] = { enabled: false };
  assert.equal(resolveDay(schedule, new Date(2026, 5, 15)).enabled, false);
});

test('active interval: plain day, end exclusive', () => {
  const schedule = weekly({ mon: day('9:00', '17:00') });
  const itv = getActiveInterval(schedule, MON(12));
  assert.ok(itv);
  assert.equal(itv.startMs, MON(9));
  assert.equal(itv.endMs, MON(17));
  assert.equal(getActiveInterval(schedule, MON(8, 59)), null);
  assert.equal(getActiveInterval(schedule, MON(17)), null);
});

test('overnight 13:00-25:00 covers next-day 0:30 and is anchored to Monday', () => {
  const schedule = weekly({ mon: day('13:00', '25:00') });
  const itv = getActiveInterval(schedule, TUE(0, 30));
  assert.ok(itv);
  assert.equal(itv.anchorKey, '2026-06-15');
  assert.equal(itv.endMs, TUE(1, 0));
});

test("after an overnight interval ends, today's own schedule decides the mode", () => {
  const both = weekly({ mon: day('13:00', '25:00'), tue: day('9:00', '17:00') });
  assert.equal(getBarState(both, TUE(1, 30)).mode, 'empty'); // tue enabled, before its start

  const tueOff = weekly({ mon: day('13:00', '25:00') });
  assert.equal(getBarState(tueOff, TUE(0, 30)).mode, 'active'); // still inside mon's interval
  assert.equal(getBarState(tueOff, TUE(2, 0)).mode, 'hidden'); // tue is OFF (spec 5)
});

test('getActiveDaySummary: plain in-interval day reports today', () => {
  const schedule = weekly({ mon: day('9:00', '17:00') });
  const s = getActiveDaySummary(schedule, MON(12));
  assert.equal(s.active, true);
  assert.equal(s.enabled, true);
  assert.equal(s.weekdayKey, 'mon');
  assert.equal(s.dateKey, '2026-06-15');
  assert.equal(s.startMin, 540);
  assert.equal(s.endMin, 1020);
});

test('getActiveDaySummary: outside any interval falls back to calendar-today', () => {
  const schedule = weekly({ mon: day('9:00', '17:00') });
  const s = getActiveDaySummary(schedule, MON(8)); // before start
  assert.equal(s.active, false);
  assert.equal(s.enabled, true);
  assert.equal(s.weekdayKey, 'mon');
  assert.equal(s.dateKey, '2026-06-15');
  assert.equal(s.startMin, 540);
});

test('getActiveDaySummary: OFF day reports disabled', () => {
  const schedule = weekly({}); // all OFF
  const s = getActiveDaySummary(schedule, MON(12));
  assert.equal(s.active, false);
  assert.equal(s.enabled, false);
  assert.equal(s.weekdayKey, 'mon');
});

test('getActiveDaySummary: overnight previous-day interval reports the source day, not today', () => {
  // Sunday (2026-06-14) 9:00–27:00 ends 3:00 Monday. At Monday 02:00 the active
  // interval is Sunday's, so the summary must name Sunday with its over-24h range.
  const schedule = weekly({ sun: day('9:00', '27:00') });
  const s = getActiveDaySummary(schedule, MON(2));
  assert.equal(s.active, true);
  assert.equal(s.enabled, true);
  assert.equal(s.weekdayKey, 'sun');
  assert.equal(s.dateKey, '2026-06-14');
  assert.equal(s.startMin, 540); // 9:00
  assert.equal(s.endMin, 1620); // 27:00 (over-24h preserved)
});

test('getActiveDaySummary: after an overnight interval ends, reports today', () => {
  // Sunday 9:00–27:00 ends 3:00 Monday; at 04:00 it is over and Monday is OFF.
  const schedule = weekly({ sun: day('9:00', '27:00') });
  const s = getActiveDaySummary(schedule, MON(4));
  assert.equal(s.active, false);
  assert.equal(s.enabled, false); // mon is OFF
  assert.equal(s.weekdayKey, 'mon');
  assert.equal(s.dateKey, '2026-06-15');
});

test('bar state modes across a plain day', () => {
  const schedule = weekly({ mon: day('9:00', '17:00') });
  assert.equal(getBarState(schedule, MON(8)).mode, 'empty');
  assert.equal(getBarState(schedule, MON(12)).mode, 'active');
  assert.equal(getBarState(schedule, MON(18)).mode, 'empty');
});

test('nowFrac and labels', () => {
  const schedule = weekly({ mon: day('9:00', '17:00') });
  const st = getBarState(schedule, MON(13));
  assert.equal(st.mode, 'active');
  assert.ok(Math.abs(st.nowFrac - 0.5) < 1e-9);
  assert.equal(st.labels.remaining, '4:00');
  assert.equal(st.labels.start, '9:00');
  assert.equal(st.labels.end, '17:00');
});

test('overnight labels use the over-24h axis notation', () => {
  const schedule = weekly({ mon: day('13:00', '25:00') });
  const st = getBarState(schedule, TUE(0, 30));
  assert.equal(st.labels.end, '25:00');
  assert.equal(st.labels.now, '24:30');
});

test('segments: remaining-side break is gray, elapsed break disappears (spec 3.2)', () => {
  const schedule = weekly({ mon: day('9:00', '17:00', [{ start: '12:00', end: '13:00' }]) });

  // now = 10:00 → remaining [0.125, 1], break at [0.375, 0.5]
  let st = getBarState(schedule, MON(10));
  assert.deepEqual(st.segments.map((s) => s.kind), ['fill', 'break', 'fill']);
  assert.ok(Math.abs(st.segments[1].from - 0.375) < 1e-9);
  assert.ok(Math.abs(st.segments[1].to - 0.5) < 1e-9);

  // now = 14:00 → break fully elapsed → a single fill segment
  st = getBarState(schedule, MON(14));
  assert.deepEqual(st.segments.map((s) => s.kind), ['fill']);
  assert.ok(Math.abs(st.segments[0].from - 0.625) < 1e-9);
});

test('segments: now inside a break starts with a break segment', () => {
  const schedule = weekly({ mon: day('9:00', '17:00', [{ start: '12:00', end: '13:00' }]) });
  const st = getBarState(schedule, MON(12, 30));
  assert.equal(st.segments[0].kind, 'break');
  assert.ok(Math.abs(st.segments[0].from - st.nowFrac) < 1e-9);
});

test('segments: multiple breaks stay sorted and clipped', () => {
  const schedule = weekly({
    mon: day('9:00', '17:00', [
      { start: '15:00', end: '15:30' },
      { start: '12:00', end: '13:00' },
    ]),
  });
  const st = getBarState(schedule, MON(11));
  assert.deepEqual(st.segments.map((s) => s.kind), ['fill', 'break', 'fill', 'break', 'fill']);
});

test('getNextInterval: returns today\'s interval when it has not started yet', () => {
  const schedule = weekly({ mon: day('9:00', '17:00') });
  const next = getNextInterval(schedule, MON(8));
  assert.ok(next);
  assert.equal(next.anchorKey, '2026-06-15');
  assert.equal(next.anchorMidnightMs, MON(0));
  assert.equal(next.startMs, MON(9));
  assert.equal(next.endMs, MON(17));
});

test('getNextInterval: after today\'s interval ends, finds the next enabled day', () => {
  const schedule = weekly({ mon: day('9:00', '17:00'), tue: day('10:00', '18:00') });
  const next = getNextInterval(schedule, MON(18)); // mon's interval is over for the day
  assert.ok(next);
  assert.equal(next.anchorKey, '2026-06-16');
  assert.equal(next.startMs, TUE(10));
  assert.equal(next.endMs, TUE(18));
});

test('getNextInterval: skips disabled weekdays in between', () => {
  const schedule = weekly({ wed: day('9:00', '17:00') }); // mon, tue OFF
  const next = getNextInterval(schedule, MON(8));
  assert.ok(next);
  assert.equal(next.anchorKey, '2026-06-17');
  assert.equal(next.startMs, WED(9));
});

test('getNextInterval: a date override takes priority over the weekly default', () => {
  const schedule = weekly({ tue: day('9:00', '17:00') }); // mon OFF by weekly default
  schedule.overrides['2026-06-15'] = day('10:00', '11:00'); // override turns Monday ON
  const next = getNextInterval(schedule, MON(8));
  assert.ok(next);
  assert.equal(next.anchorKey, '2026-06-15');
  assert.equal(next.startMs, MON(10));
  assert.equal(next.endMs, MON(11));
});

test('getNextInterval: no enabled day within the horizon returns null', () => {
  const schedule = weekly({}); // every weekday OFF, no overrides
  assert.equal(getNextInterval(schedule, MON(8)), null);
});

test('prunePastOverrides: drops dates strictly before yesterday, keeps yesterday/today/future', () => {
  const overrides = {
    '2026-06-10': day('9:00', '17:00'), // long past -> removed
    '2026-06-14': day('9:00', '17:00'), // yesterday -> kept (possible overnight spillover)
    '2026-06-15': day('9:00', '17:00'), // today -> kept
    '2026-06-20': day('9:00', '17:00'), // future -> kept
  };
  const { changed, overrides: pruned } = prunePastOverrides(overrides, MON(12));
  assert.equal(changed, true);
  assert.deepEqual(Object.keys(pruned).sort(), ['2026-06-14', '2026-06-15', '2026-06-20']);
});

test('prunePastOverrides: leaves keys that are not a valid date untouched', () => {
  const overrides = { 'not-a-date': day('9:00', '17:00'), '2026-06-10': day('9:00', '17:00') };
  const { changed, overrides: pruned } = prunePastOverrides(overrides, MON(12));
  assert.equal(changed, true);
  assert.deepEqual(Object.keys(pruned).sort(), ['not-a-date']);
});

test('prunePastOverrides: nothing to drop reports changed=false', () => {
  const overrides = { '2026-06-15': day('9:00', '17:00'), '2026-06-20': day('9:00', '17:00') };
  const { changed, overrides: pruned } = prunePastOverrides(overrides, MON(12));
  assert.equal(changed, false);
  assert.deepEqual(pruned, overrides);
});

test('ticks: hourly interior ticks', () => {
  const schedule = weekly({ mon: day('9:00', '17:00') });
  const st = getBarState(schedule, MON(9, 30), { tickIntervalMinutes: 60 });
  assert.equal(st.ticks.length, 7); // 10:00 .. 16:00
  assert.ok(Math.abs(st.ticks[0] - 1 / 8) < 1e-9);
});
