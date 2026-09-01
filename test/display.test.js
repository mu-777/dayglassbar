import test from 'node:test';
import assert from 'node:assert/strict';
import { displayInfo, displayMatchOf, findDisplay } from '../src/core/display.js';

const laptop = { id: 1, label: '\\\\.\\DISPLAY1', x: 0, y: 0, width: 1920, height: 1080 };
const external = { id: 2, label: '\\\\.\\DISPLAY2', x: 1920, y: 0, width: 2560, height: 1440 };
const all = [laptop, external];

test('displayInfo flattens an Electron Display and displayMatchOf drops the id', () => {
  const info = displayInfo({ id: 7, label: 'HDMI-1', bounds: { x: -1080, y: 0, width: 1080.4, height: 1920.6 } });
  assert.deepEqual(info, { id: 7, label: 'HDMI-1', x: -1080, y: 0, width: 1080, height: 1921 });
  assert.deepEqual(displayMatchOf(info), { label: 'HDMI-1', x: -1080, y: 0, width: 1080, height: 1921 });
  // A display with no label at all (some platforms) still yields a usable descriptor.
  assert.equal(displayInfo({ id: 1, bounds: {} }).label, '');
  assert.equal(displayMatchOf(null), null);
});

test('an id that still resolves wins outright', () => {
  assert.equal(findDisplay(all, 2, displayMatchOf(laptop)), external);
});

test('no stored choice means no match (the caller uses the primary display)', () => {
  assert.equal(findDisplay(all, null, null), null);
});

test('a display whose id changed is still found by its descriptor', () => {
  // The regression this exists for: on the next launch Windows reports different ids, so the
  // saved id resolves to nothing and the bar used to fall back to the primary display.
  const renumbered = [
    { ...laptop, id: 91 },
    { ...external, id: 92 },
  ];
  assert.equal(findDisplay(renumbered, 2, displayMatchOf(external)).id, 92);
});

test('the monitor is still found after it was moved or resized', () => {
  const moved = [laptop, { ...external, id: 92, x: -2560 }];
  // Geometry no longer matches, but the label is unique.
  assert.equal(findDisplay(moved, 2, displayMatchOf(external)).id, 92);

  // And the other way round: same slot, label reported differently.
  const relabelled = [laptop, { ...external, id: 92, label: 'DISPLAY9' }];
  assert.equal(findDisplay(relabelled, 2, displayMatchOf(external)).id, 92);
});

test('an ambiguous fallback matches nothing rather than guessing', () => {
  // Two identical monitors, neither carrying the saved id: the labels are empty and both
  // geometries are the same, so there is no way to tell which one the user picked.
  const twins = [
    { id: 11, label: '', x: 0, y: 0, width: 1920, height: 1080 },
    { id: 12, label: '', x: 0, y: 0, width: 1920, height: 1080 },
  ];
  assert.equal(findDisplay(twins, 2, { label: '', x: 0, y: 0, width: 1920, height: 1080 }), null);
});

test('a display that is genuinely gone matches nothing', () => {
  assert.equal(findDisplay([laptop], 2, displayMatchOf(external)), null);
  assert.equal(findDisplay([], 2, displayMatchOf(external)), null);
});
