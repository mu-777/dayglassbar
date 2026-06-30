// Dev-only stand-in for a real calendar, mirroring the time-simulation env vars
// (docs/spec-v2 §7). Lets Phase-1 calendar rendering be checked on a real bar before
// any OAuth provider exists. In production this contributes nothing (env var unset);
// Phase 2's CalendarService becomes the real event source.
//
//   DAYGLASSBAR_FAKE_EVENTS="16:00-16:30 Standup;18:00-19:00 Review"
//
// Each entry is a daily template "H:MM-H:MM Title" (over-24h end allowed, like the
// schedule), anchored to the local day of `nowMs` so it lands inside today's interval.
import { parseTimeToMinutes } from '../../core/schedule.js';

export function parseFakeEventTemplates(spec) {
  const out = [];
  for (const part of String(spec || '').split(';')) {
    const s = part.trim();
    if (!s) continue;
    const m = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s+(.+)$/.exec(s);
    if (!m) continue;
    const startMin = parseTimeToMinutes(m[1]);
    const endMin = parseTimeToMinutes(m[2]);
    if (startMin == null || endMin == null || endMin <= startMin) continue;
    out.push({ startMin, endMin, title: m[3].trim() });
  }
  return out;
}

export function createFakeEventSource(env) {
  const templates = parseFakeEventTemplates(env?.DAYGLASSBAR_FAKE_EVENTS);
  return {
    enabled: templates.length > 0,
    // Already in the normalized { startMs, endMs, title } shape getBarState expects.
    eventsAround(nowMs) {
      const now = new Date(nowMs);
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      return templates.map((t) => ({
        startMs: midnight + t.startMin * 60000,
        endMs: midnight + t.endMin * 60000,
        title: t.title,
        provider: 'google', // dev: color them with the Google tint
      }));
    },
  };
}
