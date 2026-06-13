// Wall-clock abstraction. The bar position must always be derived from
// timeSource.now() — never from accumulated elapsed time. This is what makes
// sleep/resume, NTP corrections and manual clock changes "just work"
// (spec 4.5, CLAUDE.md invariant #1).

export function createTimeSource({ startAtMs = null, offsetMs = 0, scale = 1, realNow = Date.now } = {}) {
  const anchorRealMs = realNow();
  const baseMs = startAtMs ?? anchorRealMs;
  return {
    now() {
      return baseMs + (realNow() - anchorRealMs) * scale + offsetMs;
    },
  };
}

// Time simulation via env vars (development aid, spec 7):
//   DAYGLASSBAR_FAKE_NOW="2026-06-15 16:30"   start the clock at this local instant
//   DAYGLASSBAR_TIME_OFFSET_MIN=120           shift the clock by N minutes
//   DAYGLASSBAR_TIME_SCALE=60                 fast-forward (60 = 1 min per real second; 0 = frozen)
export function timeSourceFromEnv(env = {}, realNow = Date.now) {
  let startAtMs = null;
  if (env.DAYGLASSBAR_FAKE_NOW) {
    // "YYYY-MM-DD HH:MM" → "YYYY-MM-DDTHH:MM" (no offset ⇒ parsed as local time)
    const parsed = Date.parse(String(env.DAYGLASSBAR_FAKE_NOW).trim().replace(' ', 'T'));
    if (!Number.isNaN(parsed)) startAtMs = parsed;
  }
  const offsetMs = (Number(env.DAYGLASSBAR_TIME_OFFSET_MIN) || 0) * 60000;
  const scaleRaw = env.DAYGLASSBAR_TIME_SCALE;
  const scaleNum = scaleRaw === undefined || scaleRaw === '' ? 1 : Number(scaleRaw);
  const scale = Number.isFinite(scaleNum) ? scaleNum : 1;
  return createTimeSource({ startAtMs, offsetMs, scale, realNow });
}

export function isSimulated(env = {}) {
  return Boolean(env.DAYGLASSBAR_FAKE_NOW || env.DAYGLASSBAR_TIME_OFFSET_MIN || env.DAYGLASSBAR_TIME_SCALE);
}
