import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { computeBarBounds, pointInBounds, isHorizontal } from '../src/core/geometry.js';
import { createStore, DEFAULT_SETTINGS, mergeWithDefaults } from '../src/main/store.js';
import { validateSettings } from '../src/core/validate.js';

const WA = { x: 0, y: 30, width: 1920, height: 1050 }; // e.g. a 30px system bar at the top

test('bounds for each edge stay inside the work area', () => {
  assert.deepEqual(computeBarBounds(WA, 'top', 6), { x: 0, y: 30, width: 1920, height: 6 });
  assert.deepEqual(computeBarBounds(WA, 'bottom', 6), { x: 0, y: 30 + 1050 - 6, width: 1920, height: 6 });
  assert.deepEqual(computeBarBounds(WA, 'left', 6), { x: 0, y: 30, width: 6, height: 1050 });
  assert.deepEqual(computeBarBounds(WA, 'right', 6), { x: 1920 - 6, y: 30, width: 6, height: 1050 });
});

test('thickness is clamped to at least 1px and rounded', () => {
  assert.equal(computeBarBounds(WA, 'top', 0.4).height, 1);
  assert.equal(computeBarBounds(WA, 'top', 6.6).height, 7);
});

test('pointInBounds is left-inclusive, right-exclusive', () => {
  const b = { x: 0, y: 0, width: 10, height: 5 };
  assert.equal(pointInBounds({ x: 0, y: 0 }, b), true);
  assert.equal(pointInBounds({ x: 9, y: 4 }, b), true);
  assert.equal(pointInBounds({ x: 10, y: 4 }, b), false);
  assert.equal(pointInBounds({ x: -1, y: 0 }, b), false);
});

test('isHorizontal', () => {
  assert.equal(isHorizontal('top'), true);
  assert.equal(isHorizontal('bottom'), true);
  assert.equal(isHorizontal('left'), false);
  assert.equal(isHorizontal('right'), false);
});

test('DEFAULT_SETTINGS: first-launch defaults guarantee a visible bar', () => {
  // Goal: a fresh install always produces a visible change regardless of day/time.
  // Weekends ON, track + ticks ON, thickness 16px, edge right.
  assert.equal(DEFAULT_SETTINGS.schedule.weekly.sat.enabled, true);
  assert.equal(DEFAULT_SETTINGS.schedule.weekly.sun.enabled, true);
  assert.equal(DEFAULT_SETTINGS.appearance.track.enabled, true);
  assert.equal(DEFAULT_SETTINGS.appearance.ticks.enabled, true);
  assert.equal(DEFAULT_SETTINGS.appearance.thickness, 16);
  assert.equal(DEFAULT_SETTINGS.appearance.edge, 'right');
  // Auto-launch ON by default so an ambient bar doesn't silently vanish after a reboot
  // (disclosed on first run via onboarding.autoLaunchNote; one click to disable).
  assert.equal(DEFAULT_SETTINGS.behavior.autoLaunch, true);
});

test('DEFAULT_SETTINGS: every weekday is a nearly-all-day interval so any install time shows a fill', () => {
  // 0:00–23:59 (not 0:00–24:00: the span must stay strictly under 24h) with the lunch break kept.
  for (const key of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
    const day = DEFAULT_SETTINGS.schedule.weekly[key];
    assert.equal(day.enabled, true);
    assert.equal(day.start, '0:00');
    assert.equal(day.end, '23:59');
    assert.deepEqual(day.breaks, [{ start: '12:00', end: '13:00' }]);
  }
});

test('DEFAULT_SETTINGS passes validation (all-day span stays under 24h)', () => {
  assert.deepEqual(validateSettings(DEFAULT_SETTINGS), { ok: true, errors: [] });
});

test('store: defaults when no file, then round-trips a save and notifies', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgb-'));
  const store = createStore(dir);
  assert.equal(store.get().appearance.edge, 'right');

  const next = structuredClone(store.get());
  next.appearance.edge = 'left';
  let notified = null;
  store.onChange((s) => { notified = s; });
  store.save(next);
  assert.equal(notified.appearance.edge, 'left');
  assert.ok(fs.existsSync(store.filePath));

  const reloaded = createStore(dir);
  assert.equal(reloaded.get().appearance.edge, 'left');
});

test('store: onboarding sentinel is one-shot, persists, and stays out of settings.json', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgb-'));
  const store = createStore(dir);
  assert.equal(store.isOnboarded(), false); // fresh install → first-run guide should show

  store.markOnboarded();
  assert.equal(store.isOnboarded(), true);
  assert.equal(createStore(dir).isOnboarded(), true); // survives a restart

  // The sentinel must not leak into the exportable settings file.
  store.save(structuredClone(store.get()));
  assert.ok(!('onboarded' in JSON.parse(fs.readFileSync(store.filePath, 'utf8'))));
});

test('store: corrupt file falls back to defaults', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgb-'));
  fs.writeFileSync(path.join(dir, 'settings.json'), '{not json');
  const store = createStore(dir);
  assert.equal(store.get().appearance.edge, DEFAULT_SETTINGS.appearance.edge);
});

test('store: defaultLanguage option sets the instance default language (D-5)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgb-'));
  const store = createStore(dir, null, { defaultLanguage: 'ja' });
  assert.equal(store.get().language, 'ja');
});

test('store: no defaultLanguage option falls back to English as before', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgb-'));
  const store = createStore(dir);
  assert.equal(store.get().language, 'en');
});

test('store: an unsupported defaultLanguage falls back to English', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgb-'));
  const store = createStore(dir, null, { defaultLanguage: 'fr' });
  assert.equal(store.get().language, 'en');
});

test('store: an explicitly saved language wins over defaultLanguage on the next load', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgb-'));
  const first = createStore(dir);
  const explicit = structuredClone(first.get());
  explicit.language = 'en';
  first.save(explicit);

  const reopened = createStore(dir, null, { defaultLanguage: 'ja' });
  assert.equal(reopened.get().language, 'en');
});

test('store: a settings.json missing `language` is filled in with defaultLanguage', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgb-'));
  const noLanguage = structuredClone(DEFAULT_SETTINGS);
  delete noLanguage.language;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(noLanguage), 'utf8');

  const store = createStore(dir, null, { defaultLanguage: 'ja' });
  assert.equal(store.get().language, 'ja');
});

test('store: getDefaults reflects defaultLanguage and returns a clone (settings:reset)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgb-'));
  const store = createStore(dir, null, { defaultLanguage: 'ja' });
  const defaults = store.getDefaults();
  assert.equal(defaults.language, 'ja');

  defaults.language = 'zh'; // mutate the returned clone
  assert.equal(store.get().language, 'ja'); // store's own state is unaffected
  assert.equal(store.getDefaults().language, 'ja'); // and so is the next getDefaults() call
});

test('store: save() fills in a missing language with defaultLanguage', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgb-'));
  const store = createStore(dir, null, { defaultLanguage: 'ja' });
  const withoutLanguage = structuredClone(store.get());
  delete withoutLanguage.language;
  store.save(withoutLanguage);
  assert.equal(store.get().language, 'ja');
});

test('mergeWithDefaults fills missing branches, keeps arrays as-is', () => {
  const merged = mergeWithDefaults(DEFAULT_SETTINGS, {
    appearance: { thickness: 12 },
    schedule: { weekly: { mon: { enabled: true, start: '8:00', end: '16:00', breaks: [] } } },
  });
  assert.equal(merged.appearance.thickness, 12);
  assert.equal(merged.appearance.edge, 'right'); // default preserved
  assert.equal(merged.behavior.hover.dwellMs, 350);
  assert.deepEqual(merged.schedule.weekly.mon.breaks, []);
  assert.equal(merged.schedule.weekly.tue.enabled, true); // default preserved
});
