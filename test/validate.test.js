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
    },
    behavior: { autoLaunch: false, hover: { dwellMs: 350, expandedThickness: 56 } },
  };
}

test('valid settings pass', () => {
  const r = validateSettings(base());
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

test('end must be after start', () => {
  const s = base();
  s.schedule.weekly.mon = { enabled: true, start: '17:00', end: '9:00', breaks: [] };
  const r = validateSettings(s);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.path === 'schedule.weekly.mon'));
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
  s.schedule.weekly.mon = { enabled: true, start: '17:00', end: '9:00', breaks: [] };
  const e = validateSettings(s).errors.find((x) => x.path === 'schedule.weekly.mon');
  assert.equal(e.code, 'v.endAfterStart');
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
