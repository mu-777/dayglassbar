// Local Outlook source (Windows + classic Outlook only). Reads the calendar of whatever
// account the user's already-signed-in *classic* Outlook is connected to — including an
// enterprise account — via the Outlook COM object model, driven by PowerShell. No OAuth,
// no cloud, no admin consent (we read the user's own desktop client, not a new app the
// tenant must approve). "New Outlook" / Outlook on the web have no COM model, so this does
// not apply to them (use the cloud Graph source there).
//
// Multiple calendars: listOutlookLocalCalendars() enumerates every calendar folder across
// the connected stores; fetchOutlookLocalEvents() reads the selected folders (or the default
// calendar when none are selected). A folder is identified by its EntryID + StoreID, which we
// join into one opaque id string ("EntryID|StoreID", both hex so '|' never collides) so the
// selection list is a flat array of ids like the cloud providers.
//
// mapOutlookJson / mapOutlookFolders are pure and unit-tested; the COM runs are verified by
// hand on Windows.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

const psEsc = (v) => String(v ?? '').replace(/'/g, "''");

// olFolderCalendar=9, olAppointment=26, olAppointmentItem(DefaultItemType)=1, BusyStatus 0=Free.

// Enumerate every calendar folder (DefaultItemType=1) across all connected stores, tagging
// the account's default calendar. Depth-bounded so a giant Public Folders tree can't stall.
const LIST_PS = `
$ErrorActionPreference = 'Stop'
$ol = New-Object -ComObject Outlook.Application
$ns = $ol.GetNamespace('MAPI')
$defId = $ns.GetDefaultFolder(9).EntryID
$script:out = @()
function Walk($folder, $depth) {
  if ($depth -gt 8) { return }
  try {
    if ($folder.DefaultItemType -eq 1) {
      $script:out += [pscustomobject]@{ id = $folder.EntryID; store = $folder.StoreID; name = $folder.Name; default = ($folder.EntryID -eq $defId) }
    }
  } catch {}
  try { foreach ($sub in $folder.Folders) { Walk $sub ($depth + 1) } } catch {}
}
foreach ($store in $ns.Stores) { try { Walk $store.GetRootFolder() 0 } catch {} }
$script:out | ConvertTo-Json -Compress
`;

// The Restrict filter matches by OVERLAP ([Start] <= windowEnd AND [End] >= windowStart), not
// by start time: an in-progress meeting that began before the window (e.g. hour two of a long
// workshop) must keep its remaining band, matching the cloud sources (Google's timeMin bounds
// the END time; Graph calendarView is overlap-based). The [Start] upper bound also keeps the
// window finite, which IncludeRecurrences needs (it expands recurring events infinitely
// otherwise). The "MM/dd/yyyy hh:mm tt" format is Microsoft's documented Restrict format
// (US-locale; a known limitation on some locales). Times are emitted as round-trip ISO ('o')
// so Node parses them back to the correct instant regardless of locale. <FOLDER_SPECS>
// is an array of @{id;store} pairs; empty means "the default calendar folder".
const FETCH_PS = `
$ErrorActionPreference = 'Stop'
$epoch = [datetime]'1970-01-01T00:00:00Z'
$start = $epoch.AddMilliseconds(<START_MS>).ToLocalTime()
$end = $epoch.AddMilliseconds(<END_MS>).ToLocalTime()
$fmt = 'MM/dd/yyyy hh:mm tt'
$filter = "[Start] <= '" + $end.ToString($fmt) + "' AND [End] >= '" + $start.ToString($fmt) + "'"
$ol = New-Object -ComObject Outlook.Application
$ns = $ol.GetNamespace('MAPI')
$specs = @(<FOLDER_SPECS>)
$folders = @()
if ($specs.Count -eq 0) {
  $folders += $ns.GetDefaultFolder(9)
} else {
  foreach ($s in $specs) { try { $folders += $ns.GetFolderFromID($s.id, $s.store) } catch {} }
}
$out = @()
foreach ($folder in $folders) {
  $items = $folder.Items
  $items.IncludeRecurrences = $true
  $items.Sort('[Start]')
  foreach ($it in $items.Restrict($filter)) {
    if ($it.Class -ne 26) { continue }
    $out += [pscustomobject]@{
      subject = $it.Subject
      start = $it.Start.ToString('o')
      end = $it.End.ToString('o')
      allDay = [bool]$it.AllDayEvent
      busy = [int]$it.BusyStatus
    }
  }
}
$out | ConvertTo-Json -Compress
`;

async function runPowerShell(script) {
  const { stdout } = await execFileP(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { timeout: 20000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  return stdout.trim();
}

// Outlook calendar-folder JSON (from LIST_PS) → [{ id, name, primary }]. Pure: no process/COM.
// `id` is "EntryID|StoreID" — the opaque token fetchOutlookLocalEvents takes back via specs.
export function mapOutlookFolders(items) {
  const arr = Array.isArray(items) ? items : items ? [items] : [];
  return arr.map((f) => ({ id: `${f.id}|${f.store}`, name: f.name || '', primary: Boolean(f.default) }));
}

// Split an "EntryID|StoreID" id back into the COM identifiers (EntryID/StoreID are hex, so the
// first '|' is the only separator). Used to re-open the folder via GetFolderFromID.
export function decodeLocalCalendarId(id) {
  const s = String(id || '');
  const sep = s.indexOf('|');
  return sep < 0 ? { entryId: s, storeId: '' } : { entryId: s.slice(0, sep), storeId: s.slice(sep + 1) };
}

// Outlook appointment JSON (from FETCH_PS) → generic events. Pure: no process/COM.
export function mapOutlookJson(items) {
  const arr = Array.isArray(items) ? items : items ? [items] : []; // ConvertTo-Json emits a bare object for a single item
  return arr.map((it) => ({
    startMs: Date.parse(it.start),
    endMs: Date.parse(it.end),
    title: it.subject || '',
    allDay: Boolean(it.allDay),
    busy: Number(it.busy) !== 0, // 0 = Free
    declined: false,
  }));
}

// List the calendar folders the connected classic Outlook can see (for the "choose calendars"
// UI). Windows-only; returns [] elsewhere.
export async function listOutlookLocalCalendars() {
  if (process.platform !== 'win32') return []; // COM/classic Outlook is Windows-only
  const text = await runPowerShell(LIST_PS);
  if (!text) return [];
  return mapOutlookFolders(JSON.parse(text));
}

// Read appointments in [startMs, endMs] from the selected folders. `folderSpecs` is an array of
// { entryId, storeId } (decode the selection ids with decodeLocalCalendarId); empty/omitted reads
// the account's default calendar folder (legacy behavior).
export async function fetchOutlookLocalEvents(startMs, endMs, folderSpecs = []) {
  if (process.platform !== 'win32') return []; // COM/classic Outlook is Windows-only
  const specs = (folderSpecs || [])
    .filter((s) => s && s.entryId)
    .map((s) => `@{id='${psEsc(s.entryId)}';store='${psEsc(s.storeId)}'}`)
    .join(',');
  const script = FETCH_PS.replace('<START_MS>', String(Math.floor(startMs)))
    .replace('<END_MS>', String(Math.floor(endMs)))
    .replace('<FOLDER_SPECS>', specs);
  const text = await runPowerShell(script);
  if (!text) return [];
  return mapOutlookJson(JSON.parse(text));
}
