import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSettings } from '../src/core/validate.js';

function base() {
  return {
    schedule: {
      weekly: {
        mon: { enabled: true, start: '9:00', end: '17:00', breaks: [{ start: '12:00', end: '13:00' }] },
        tue: { enabled: true, start: '9:00', end: '17:00', breaks: [] },
        wed: { enabled: true, start: '9:00', end: '17:00', breaks: [] },
        thu: { enabled: true, start: '9:00', end: '17:00', breaks: [] },
        fri: { enabled: true, start: '9:00', end: '17:00', breaks: [] },
        sat: { enabled: false },
        sun: { enabled: false },
      },
      overrides: {},
    },
    appearance: {
      displayId: null,
      edge: 'top',
      thickness: 6,
      color: '#4a90d9',
      opacity: 0.9,
      track: { enabled: true, opacity: 0.18 },
      breakColor: '#8a8f98',
      ticks: { enabled: false, intervalMinutes: 60 },
      calendar: {
        google: { enabled: false, color: '#c98a3a' },
        outlook: { enabled: false, color: '#4a9e9e', method: 'local' },
      },
    },
    behavior: { autoLaunch: false, hover: { dwellMs: 350, expandedThickness: 56 } },
  };
}

test('valid settings pass', () => {
  const r = validateSettings(base());
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

// An end at or before the start is no longer an error: it is how the clock-field UI expresses
// an overnight interval (17:00 → 9:00 = 16 hours, ending 9:00 the next day).
test('end at or before start is accepted as an overnight interval', () => {
  const s = base();
  s.schedule.weekly.mon = { enabled: true, start: '17:00', end: '9:00', breaks: [] };
  assert.equal(validateSettings(s).ok, true);
});

test('a break inside an overnight interval may be given as its plain clock time', () => {
  const s = base();
  // 22:00 → 02:00, with a break at 00:30–01:00 the following morning. Both break times are
  // before the day's start, so they resolve to 24:30–25:00 and land inside the interval.
  s.schedule.weekly.mon = { enabled: true, start: '22:00', end: '02:00', breaks: [{ start: '00:30', end: '01:00' }] };
  s.schedule.weekly.tue = { enabled: false };
  assert.equal(validateSettings(s).ok, true);

  // A break that is outside the interval is still rejected (04:00 is past the 02:00 end).
  const bad = base();
  bad.schedule.weekly.mon = { enabled: true, start: '22:00', end: '02:00', breaks: [{ start: '04:00', end: '04:30' }] };
  bad.schedule.weekly.tue = { enabled: false };
  const e = validateSettings(bad).errors.find((x) => x.path === 'schedule.weekly.mon');
  assert.equal(e.code, 'v.breakOutside');
});

test('an overnight interval still may not reach 24 hours', () => {
  const s = base();
  // Equal start and end would wrap to a full 24h span.
  s.schedule.weekly.mon = { enabled: true, start: '9:00', end: '9:00', breaks: [] };
  const e = validateSettings(s).errors.find((x) => x.path === 'schedule.weekly.mon');
  assert.equal(e.code, 'v.spanUnder24');
});

test('display choice: an id with its descriptor is accepted, a malformed one is not', () => {
  const ok = base();
  ok.appearance.displayId = 2528732444;
  ok.appearance.displayMatch = { label: '\\\\.\\DISPLAY2', x: 1920, y: 0, width: 2560, height: 1440 };
  assert.equal(validateSettings(ok).ok, true);

  const bad = base();
  bad.appearance.displayMatch = { label: 'x', x: 0, y: 0, width: 'wide', height: 1440 };
  const r = validateSettings(bad);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.path === 'appearance.display'));
});

test('span must be under 24h', () => {
  const s = base();
  s.schedule.weekly.mon = { enabled: true, start: '9:00', end: '33:00', breaks: [] };
  assert.equal(validateSettings(s).ok, false);
});

test('start must be before 24:00', () => {
  const s = base();
  s.schedule.weekly.mon = { enabled: true, start: '24:30', end: '26:00', breaks: [] };
  assert.equal(validateSettings(s).ok, false);
});

test('bad time format is rejected', () => {
  const s = base();
  s.schedule.weekly.mon = { enabled: true, start: '9時', end: '17:00', breaks: [] };
  assert.equal(validateSettings(s).ok, false);
});

test('break outside the interval is rejected', () => {
  const s = base();
  s.schedule.weekly.mon.breaks = [{ start: '8:00', end: '8:30' }];
  assert.equal(validateSettings(s).ok, false);
});

test('overlapping breaks are rejected', () => {
  const s = base();
  s.schedule.weekly.mon.breaks = [
    { start: '12:00', end: '13:00' },
    { start: '12:30', end: '14:00' },
  ];
  assert.equal(validateSettings(s).ok, false);
});

test('consecutive weekly days must not overlap (mon 13:00-27:00 vs tue from 2:00)', () => {
  const s = base();
  s.schedule.weekly.mon = { enabled: true, start: '13:00', end: '27:00', breaks: [] };
  s.schedule.weekly.tue = { enabled: true, start: '2:00', end: '10:00', breaks: [] };
  const r = validateSettings(s);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.path === 'schedule.weekly.mon'));
});

test('consecutive weekly days: touching is allowed (ends 25:00, next starts 1:00)', () => {
  const s = base();
  s.schedule.weekly.mon = { enabled: true, start: '13:00', end: '25:00', breaks: [] };
  s.schedule.weekly.tue = { enabled: true, start: '1:00', end: '9:00', breaks: [] };
  assert.equal(validateSettings(s).ok, true);
});

test('override is validated against its real neighbors', () => {
  const s = base();
  // 2026-06-14 is a Sunday (weekly: OFF) overridden to run overnight until Mon 10:00,
  // which collides with the weekly Monday starting at 9:00.
  s.schedule.overrides['2026-06-14'] = { enabled: true, start: '20:00', end: '34:00', breaks: [] };
  const r = validateSettings(s);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.path === 'schedule.overrides.2026-06-14'));
});

test('bad override date key is rejected', () => {
  const s = base();
  s.schedule.overrides['2026/06/14'] = { enabled: true, start: '9:00', end: '17:00', breaks: [] };
  assert.equal(validateSettings(s).ok, false);
});

test('language: absent is fine, a known code is fine, an unknown code is rejected', () => {
  const a = base(); // no language field
  assert.equal(validateSettings(a).ok, true);

  const b = base();
  b.language = 'zh';
  assert.equal(validateSettings(b).ok, true);

  const c = base();
  c.language = 'fr';
  const r = validateSettings(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.path === 'language'));
});

test('errors carry a code (language-agnostic), not a pre-formatted message', () => {
  const s = base();
  s.schedule.weekly.mon = { enabled: true, start: '24:30', end: '26:00', breaks: [] };
  const e = validateSettings(s).errors.find((x) => x.path === 'schedule.weekly.mon');
  assert.equal(e.code, 'v.startBefore24');
  assert.deepEqual(e.params, { labelKind: 'weekday', dayKey: 'mon' });
});

test('appearance bounds', () => {
  const a = base();
  a.appearance.thickness = 0;
  assert.equal(validateSettings(a).ok, false);

  const b = base();
  b.appearance.color = 'blue';
  assert.equal(validateSettings(b).ok, false);

  const c = base();
  c.appearance.ticks.intervalMinutes = 3;
  assert.equal(validateSettings(c).ok, false);

  const d = base();
  d.behavior.hover.dwellMs = 50;
  assert.equal(validateSettings(d).ok, false);
});

test('calendar: per-provider color/enabled and Outlook method are validated', () => {
  const ok = base();
  ok.appearance.calendar.google = { enabled: true, color: '#123456' };
  ok.appearance.calendar.outlook = { enabled: true, color: '#abcdef', method: 'cloud' };
  assert.equal(validateSettings(ok).ok, true);

  const badColor = base();
  badColor.appearance.calendar.google.color = 'orange';
  const r = validateSettings(badColor);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.path === 'appearance.calendar' && e.code === 'v.calendar'));

  const badMethod = base();
  badMethod.appearance.calendar.outlook.method = 'ics';
  assert.equal(validateSettings(badMethod).ok, false);

  const missing = base();
  delete missing.appearance.calendar.outlook;
  assert.equal(validateSettings(missing).ok, false);
});
