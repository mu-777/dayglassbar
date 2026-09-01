// Matching a *saved* display choice against the live display list. Pure — no Electron
// (CLAUDE.md invariant #2); main passes plain descriptors in, and the settings renderer
// runs the very same function over the `displays:list` payload.
//
// Why this exists: a display's numeric id is not stable. On Windows the id Chromium reports
// is derived from the monitor device / enumeration and can come back different after a
// reboot, a driver update, a cable swap or a display-arrangement change. Storing only the id
// therefore silently loses a non-primary display choice on the next launch — the bar
// reappears on the primary display and the settings dropdown falls back to "Auto", so the
// user has to pick their monitor again every restart. We keep the id (it is the exact match
// when it still resolves) and save a descriptor beside it to re-find the same physical
// monitor when it doesn't.

// Electron `Display` → the flat descriptor used everywhere else here. Reads only plain
// properties, so it stays Electron-free.
export function displayInfo(d) {
  const b = (d && d.bounds) || {};
  return {
    id: d?.id,
    label: String(d?.label ?? ''),
    x: Math.round(b.x || 0),
    y: Math.round(b.y || 0),
    width: Math.round(b.width || 0),
    height: Math.round(b.height || 0),
  };
}

// The part of a descriptor we persist next to `displayId` (`appearance.displayMatch`).
export function displayMatchOf(info) {
  if (!info) return null;
  const { label = '', x = 0, y = 0, width = 0, height = 0 } = info;
  return { label: String(label), x, y, width, height };
}

// Find the entry a saved choice refers to, or null for "no stored choice / cannot tell"
// (callers then use the primary display). Each fallback only fires when it is unambiguous:
// with two identical side-by-side monitors the geometry differs, and with two monitors moved
// to the same slot the label differs — but if a rule matches more than one display we would
// be guessing, so we drop through instead.
export function findDisplay(entries, displayId, match) {
  const list = Array.isArray(entries) ? entries : [];
  const byId = displayId == null ? null : list.find((d) => d.id === displayId);
  if (byId) return byId;
  if (!match) return null;
  const sameGeometry = (d) =>
    d.x === match.x && d.y === match.y && d.width === match.width && d.height === match.height;
  const sameLabel = (d) => Boolean(match.label) && d.label === match.label;
  for (const rule of [(d) => sameLabel(d) && sameGeometry(d), sameGeometry, sameLabel]) {
    const hits = list.filter(rule);
    if (hits.length === 1) return hits[0];
  }
  return null;
}
