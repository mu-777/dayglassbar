import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

// --- output encoding (#Outlook local mojibake) -------------------------------------------
// powershell.exe writes redirected stdout in the console output code page (CP932 on Japanese
// Windows) while child_process decodes it as UTF-8, so non-ASCII subjects/folder names used to
// arrive as mojibake. The scripts now emit pure ASCII via ConvertTo-AsciiJson. PowerShell cannot
// run in CI, so these cover the JS side plus the wire format that emitter produces.

// Mirror of the PowerShell ConvertTo-AsciiJson emitter: printable ASCII passes through,
// everything else becomes \uXXXX per UTF-16 code unit (which is how JSON spells astral chars).
const asciiJson = (value) => {
  const json = JSON.stringify(value);
  let out = '';
  for (let i = 0; i < json.length; i += 1) {
    const c = json.charCodeAt(i);
    out += c >= 0x20 && c <= 0x7e ? json[i] : `\\u${c.toString(16).padStart(4, '0')}`;
  }
  return out;
};

test('ASCII-escaped JSON round-trips Japanese titles under any console code page', () => {
  const subjects = ['定例会議', 'ソ表能', '打ち合わせ 🙂', 'Sync'];
  const wire = asciiJson(
    subjects.map((subject) => ({
      subject,
      start: '2026-06-15T15:00:00.0000000+00:00',
      end: '2026-06-15T15:30:00.0000000+00:00',
      allDay: false,
      busy: 2,
    })),
  );
  assert.match(wire, /^[\x20-\x7e]*$/); // pure ASCII: identical bytes in every code page
  // ...so decoding those bytes as UTF-8 (what child_process does) is lossless.
  assert.equal(Buffer.from(wire, 'latin1').toString('utf8'), wire);
  assert.deepEqual(
    mapOutlookJson(JSON.parse(wire)).map((e) => e.title),
    subjects,
  );
});

test('folder names survive the ASCII-escaped wire too', () => {
  const wire = asciiJson([{ id: 'E1', store: 'S1', name: '予定表', default: true }]);
  assert.match(wire, /^[\x20-\x7e]*$/);
  assert.deepEqual(mapOutlookFolders(JSON.parse(wire)), [{ id: 'E1|S1', name: '予定表', primary: true }]);
});

test('the raw-byte failure mode this guards against', () => {
  // 「ソ」 in CP932 is 0x83 0x5C; decoded as UTF-8 the text is lost AND the 0x5C trail byte
  // survives as a stray backslash, which can make JSON.parse throw on the whole fetch.
  const decoded = Buffer.from([0x83, 0x5c]).toString('utf8');
  assert.notEqual(decoded, 'ソ');
  assert.ok(decoded.includes('\\'));
  assert.throws(() => JSON.parse(`{"subject":"${decoded}"}`));
});

test('both PowerShell scripts emit through ConvertTo-AsciiJson (regression guard)', () => {
  const src = fs.readFileSync(new URL('../src/main/calendar/outlook-local.js', import.meta.url), 'utf8');
  assert.match(src, /function ConvertTo-AsciiJson/); // defined in the shared prologue
  assert.equal((src.match(/ConvertTo-AsciiJson \$/g) || []).length, 2); // list + fetch both use it
  // The only pipe into ConvertTo-Json is inside the emitter itself: nothing else may print raw.
  assert.equal((src.match(/\|\s*ConvertTo-Json/g) || []).length, 1);
  assert.match(src, /\$value \| ConvertTo-Json -Compress/);
  // The escape's backslash comes from [char]92 (PowerShell single quotes take no escapes).
  assert.match(src, /AppendFormat\('\{0\}u\{1:x4\}', \[char\]92/);
});
