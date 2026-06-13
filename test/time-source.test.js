import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimeSource, timeSourceFromEnv, isSimulated } from '../src/core/time-source.js';

function fakeRealClock(startMs) {
  let t = startMs;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

test('default: follows the real clock', () => {
  const rc = fakeRealClock(1_000_000);
  const ts = createTimeSource({ realNow: rc.now });
  assert.equal(ts.now(), 1_000_000);
  rc.advance(5000);
  assert.equal(ts.now(), 1_005_000);
});

test('startAt rebases, offset shifts, scale fast-forwards', () => {
  const rc = fakeRealClock(1_000_000);
  const ts = createTimeSource({ startAtMs: 2_000_000, offsetMs: 60_000, scale: 60, realNow: rc.now });
  assert.equal(ts.now(), 2_060_000);
  rc.advance(1000); // 1 real second → 60 simulated seconds
  assert.equal(ts.now(), 2_060_000 + 60_000);
});

test('scale 0 freezes the clock', () => {
  const rc = fakeRealClock(1_000_000);
  const ts = createTimeSource({ scale: 0, realNow: rc.now });
  rc.advance(99_999);
  assert.equal(ts.now(), 1_000_000);
});

test('timeSourceFromEnv: offset minutes', () => {
  const rc = fakeRealClock(0);
  const ts = timeSourceFromEnv({ DAYGLASSBAR_TIME_OFFSET_MIN: '120' }, rc.now);
  assert.equal(ts.now(), 120 * 60_000);
});

test('timeSourceFromEnv: fake now (local) advances at scale', () => {
  const rc = fakeRealClock(0);
  const fake = new Date(2026, 5, 15, 16, 30).getTime();
  const ts = timeSourceFromEnv(
    { DAYGLASSBAR_FAKE_NOW: '2026-06-15 16:30', DAYGLASSBAR_TIME_SCALE: '60' },
    rc.now,
  );
  assert.equal(ts.now(), fake);
  rc.advance(1000);
  assert.equal(ts.now(), fake + 60_000);
});

test('timeSourceFromEnv: garbage is ignored safely', () => {
  const rc = fakeRealClock(123);
  const ts = timeSourceFromEnv({ DAYGLASSBAR_FAKE_NOW: 'not-a-date', DAYGLASSBAR_TIME_SCALE: 'x' }, rc.now);
  assert.equal(ts.now(), 123);
});

test('isSimulated', () => {
  assert.equal(isSimulated({}), false);
  assert.equal(isSimulated({ DAYGLASSBAR_TIME_OFFSET_MIN: '5' }), true);
});
