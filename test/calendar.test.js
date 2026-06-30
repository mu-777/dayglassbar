import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEvents, computeEventSegments } from '../src/core/calendar.js';
import { getBarState } from '../src/core/schedule.js';

// 2026-06-15 is a Monday.
const MON = (h, m = 0) => new Date(2026, 5, 15, h, m).getTime();
const day = (start, end, breaks = []) => ({ enabled: true, start, end, breaks });
const OFF = { enabled: false };
const weekly = (partial) => ({
  weekly: { mon: OFF, tue: OFF, wed: OFF, thu: OFF, fri: OFF, sat: OFF, sun: OFF, ...partial },
  overrides: {},
});

// A bare interval is all computeEventSegments needs (it only reads startMs/endMs).
const interval = { startMs: MON(9), endMs: MON(17) }; // 8h span

const close = (a, b) => Math.abs(a - b) < 1e-9;

test('normalizeEvents drops all-day, declined, and free events', () => {
  const out = normalizeEvents([
    { startMs: MON(10), endMs: MON(11), title: 'Busy' },
    { startMs: MON(10), endMs: MON(11), title: 'All day', allDay: true },
    { startMs: MON(10), endMs: MON(11), title: 'Declined', declined: true },
    { startMs: MON(10), endMs: MON(11), title: 'Free', busy: false },
    { startMs: MON(10), endMs: MON(11), title: 'Tentative still busy', busy: true },
  ]);
  assert.deepEqual(
    out.map((e) => e.title),
    ['Busy', 'Tentative still busy'],
  );
});

test('normalizeEvents rejects invalid times and trims titles', () => {
  const out = normalizeEvents([
    { startMs: MON(11), endMs: MON(10), title: 'reversed' },
    { startMs: MON(10), endMs: MON(10), title: 'zero-length' },
    { startMs: 'x', endMs: MON(11), title: 'NaN start' },
    { startMs: MON(10), endMs: MON(11), title: '  padded  ' },
    { startMs: MON(10), endMs: MON(11) }, // missing title → ''
  ]);
  assert.deepEqual(
    out.map((e) => e.title),
    ['padded', ''],
  );
});

test('computeEventSegments: an upcoming event becomes one band with axis fractions', () => {
  const segs = computeEventSegments(interval, MON(9, 30), [{ startMs: MON(10), endMs: MON(11), title: 'A' }]);
  assert.equal(segs.length, 1);
  assert.ok(close(segs[0].from, 0.125)); // (10-9)/8
  assert.ok(close(segs[0].to, 0.25)); // (11-9)/8
  assert.equal(segs[0].title, 'A');
});

test('computeEventSegments: an in-progress event is clipped to now', () => {
  const segs = computeEventSegments(interval, MON(10), [{ startMs: MON(9), endMs: MON(12), title: 'M' }]);
  assert.equal(segs.length, 1);
  assert.ok(close(segs[0].from, 0.125)); // starts at now (10:00), not 9:00
  assert.ok(close(segs[0].to, 0.375)); // (12-9)/8
});

test('computeEventSegments: a fully-elapsed event disappears (remaining-side only)', () => {
  const segs = computeEventSegments(interval, MON(10), [{ startMs: MON(9), endMs: MON(9, 30), title: 'past' }]);
  assert.deepEqual(segs, []);
});

test('computeEventSegments: events outside the interval are dropped', () => {
  const segs = computeEventSegments(interval, MON(10), [
    { startMs: MON(18), endMs: MON(19), title: 'after' },
    { startMs: MON(7), endMs: MON(8), title: 'before' },
  ]);
  assert.deepEqual(segs, []);
});

test('computeEventSegments: overlapping events keep separate titles, sorted by start', () => {
  const segs = computeEventSegments(interval, MON(9, 30), [
    { startMs: MON(11), endMs: MON(13), title: 'B' },
    { startMs: MON(10), endMs: MON(12), title: 'A' },
  ]);
  assert.deepEqual(
    segs.map((s) => s.title),
    ['A', 'B'],
  );
});

test('computeEventSegments: a zero-length interval yields no bands', () => {
  const segs = computeEventSegments({ startMs: MON(9), endMs: MON(9) }, MON(9), [
    { startMs: MON(9), endMs: MON(10), title: 'x' },
  ]);
  assert.deepEqual(segs, []);
});

test('provider tag flows through normalizeEvents and computeEventSegments', () => {
  const [norm] = normalizeEvents([{ startMs: MON(15), endMs: MON(16), title: 'Mtg', provider: 'outlook' }]);
  assert.equal(norm.provider, 'outlook');
  const [seg] = computeEventSegments(interval, MON(9, 30), [norm]);
  assert.equal(seg.provider, 'outlook');
});

test('getBarState: events ride along only when active and calendar is enabled', () => {
  const schedule = weekly({ mon: day('9:00', '17:00') });
  const events = [{ startMs: MON(12), endMs: MON(13), title: 'Mtg' }];

  const on = getBarState(schedule, MON(10), { events, calendarEnabled: true });
  assert.equal(on.mode, 'active');
  assert.equal(on.events.length, 1);
  assert.equal(on.events[0].title, 'Mtg');
  assert.ok(close(on.events[0].from, 0.375));

  const off = getBarState(schedule, MON(10), { events, calendarEnabled: false });
  assert.equal(off.events, undefined);

  const outside = getBarState(schedule, MON(8), { events, calendarEnabled: true });
  assert.equal(outside.mode, 'empty');
  assert.equal(outside.events, undefined);
});
