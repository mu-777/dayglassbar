import test from 'node:test';
import assert from 'node:assert/strict';
import { mapOutlookJson, mapOutlookFolders, decodeLocalCalendarId } from '../src/main/calendar/outlook-local.js';

test('mapOutlookJson maps appointments and flags free/all-day', () => {
  const out = mapOutlookJson([
    { subject: 'Sync', start: '2026-06-15T15:00:00.0000000+00:00', end: '2026-06-15T15:30:00.0000000+00:00', allDay: false, busy: 2 },
    { subject: 'Free block', start: '2026-06-15T16:00:00.0000000+00:00', end: '2026-06-15T17:00:00.0000000+00:00', allDay: false, busy: 0 },
    { subject: 'Holiday', start: '2026-06-15T00:00:00.0000000+00:00', end: '2026-06-16T00:00:00.0000000+00:00', allDay: true, busy: 0 },
  ]);
  assert.equal(out[0].title, 'Sync');
  assert.equal(out[0].startMs, Date.parse('2026-06-15T15:00:00Z'));
  assert.equal(out[0].busy, true);
  assert.equal(out[1].busy, false); // BusyStatus 0 = Free
  assert.equal(out[2].allDay, true);
});

test('mapOutlookJson accepts a single bare object (ConvertTo-Json) and empty input', () => {
  const one = mapOutlookJson({ subject: 'Solo', start: '2026-06-15T09:00:00+00:00', end: '2026-06-15T10:00:00+00:00', allDay: false, busy: 2 });
  assert.equal(one.length, 1);
  assert.equal(one[0].title, 'Solo');
  assert.deepEqual(mapOutlookJson(null), []);
  assert.deepEqual(mapOutlookJson(undefined), []);
});

test('mapOutlookFolders joins EntryID|StoreID into one id and flags the default folder', () => {
  const out = mapOutlookFolders([
    { id: 'E1', store: 'S1', name: 'Calendar', default: true },
    { id: 'E2', store: 'S2', name: 'Team', default: false },
  ]);
  assert.deepEqual(out[0], { id: 'E1|S1', name: 'Calendar', primary: true });
  assert.deepEqual(out[1], { id: 'E2|S2', name: 'Team', primary: false });
  // ConvertTo-Json emits a bare object for a single folder; null/undefined → [].
  assert.equal(mapOutlookFolders({ id: 'E', store: 'S', name: 'Solo', default: false }).length, 1);
  assert.deepEqual(mapOutlookFolders(null), []);
});

test('decodeLocalCalendarId splits on the first | back into EntryID/StoreID', () => {
  assert.deepEqual(decodeLocalCalendarId('E1|S1'), { entryId: 'E1', storeId: 'S1' });
  // round-trips mapOutlookFolders output
  const [folder] = mapOutlookFolders([{ id: 'ABC', store: 'XYZ', name: 'C', default: true }]);
  assert.deepEqual(decodeLocalCalendarId(folder.id), { entryId: 'ABC', storeId: 'XYZ' });
  assert.deepEqual(decodeLocalCalendarId('noseparator'), { entryId: 'noseparator', storeId: '' });
});
