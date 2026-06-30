// DayGlassBar core: calendar event overlay.
// Pure logic — no Electron / DOM and no network (CLAUDE.md invariant #2). The main
// process fetches raw events from Google/Microsoft, maps them to the generic shape
// below, and this module decides what to show and where on the bar.
//
// An "event" overlays the interval the same way a break does (schedule.js): it only
// ever paints the *remaining* side, so a meeting that has already passed disappears
// together with the elapsed time. Events never become new bars — they recolor a slice
// of the one interval bar (spec 4.6: the "区間＝1本のバー" abstraction is preserved).

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Generic event shape produced by the providers:
//   { startMs, endMs, title?, allDay?, busy?, declined?, provider? }
// Policy (spec 10 decisions): drop all-day events, declined invites, and events you
// are explicitly free for — only times you are actually busy count as "予定". `busy`
// defaults to true (undefined = treat as busy); only an explicit `false` is dropped.
// `provider` ('google' | 'outlook') is preserved so the bar can color each event by its
// source. Returns the minimal shape the geometry needs: { startMs, endMs, title, provider }.
export function normalizeEvents(rawEvents) {
  const out = [];
  for (const e of rawEvents || []) {
    if (!e) continue;
    if (e.allDay === true) continue;
    if (e.declined === true) continue;
    if (e.busy === false) continue;
    const startMs = Number(e.startMs);
    const endMs = Number(e.endMs);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;
    out.push({ startMs, endMs, title: String(e.title ?? '').trim(), provider: e.provider });
  }
  return out;
}

// Event bands covering the remaining region [nowFrac, 1] of the axis, as axis
// fractions with their title for the hover label. Mirrors the break clipping in
// computeSegments (schedule.js): clip [max(start, now), end] into the interval and
// drop anything fully in the past or zero-length. Overlaps are NOT merged — each
// event keeps its own band so every title stays available on hover (painting
// overlapping bands in the same color is harmless).
//
// `events` is expected pre-normalized (see normalizeEvents). Returns
// [{ from, to, title }] sorted by start.
export function computeEventSegments(interval, nowMs, events) {
  const span = interval.endMs - interval.startMs;
  if (!(span > 0)) return [];
  const p = clamp01((nowMs - interval.startMs) / span);
  const out = [];
  for (const ev of events || []) {
    const from = clamp01((Math.max(ev.startMs, nowMs) - interval.startMs) / span);
    const to = clamp01((ev.endMs - interval.startMs) / span);
    if (to > from && to > p) out.push({ from: Math.max(from, p), to, title: ev.title, provider: ev.provider });
  }
  out.sort((a, b) => a.from - b.from);
  return out;
}
