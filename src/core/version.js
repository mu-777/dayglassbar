// Version comparison for the manual "check for updates" feature (F-3). Pure logic — no
// Electron/DOM, no network (CLAUDE.md invariant #2) — the main process does the actual
// GitHub API call and hands the two version strings here to decide if an update exists.

// "1.2.3" or "v1.2.3" -> [1, 2, 3]; anything else (missing/extra parts, non-numeric,
// empty) -> null. Deliberately strict: a version we can't fully parse should never be
// silently treated as "not newer" by accident.
export function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v ?? '').trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

// True when `candidate` is a strictly newer semver than `current`. If either string
// fails to parse, we can't know — return false rather than risk a false "update available".
export function isNewerVersion(candidate, current) {
  const c = parseVersion(candidate);
  const b = parseVersion(current);
  if (!c || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (c[i] !== b[i]) return c[i] > b[i];
  }
  return false; // equal
}
