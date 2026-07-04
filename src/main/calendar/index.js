// CalendarService: the single source of calendar events for the bar. It refreshes a small
// cache on a timer (NOT every bar tick — spec 6 / invariant #1: the per-second tick just
// re-clips this cache against the wall clock) and tags each event with its provider so the
// bar can color Google vs Outlook differently.
//
// Two user-facing providers, each with its own show toggle + color:
//   - Google  — cloud OAuth (Google Calendar API).
//   - Outlook — ONE connection method: 'local' (classic Outlook via COM, no sign-in,
//               Windows desktop only) or 'cloud' (Microsoft Graph OAuth).
// (ICS feeds were removed: their provider-side cache lags hours, so they can't follow
// schedule changes fast enough — see docs/calendar-integration.md.)
import * as google from './google.js';
import * as microsoft from './microsoft.js';
import * as oauth from './oauth.js';
import { loadStore, saveStore, encryptionAvailable } from './token-store.js';
import { fetchOutlookLocalEvents, listOutlookLocalCalendars, decodeLocalCalendarId } from './outlook-local.js';
import { normalizeEvents } from '../../core/calendar.js';

const PROVIDERS = { google, microsoft }; // OAuth provider modules, by id
// Two cadences, deliberately split: cloud (Google / Graph) is a cheap HTTPS GET, so poll often
// to follow provider-side edits quickly; Outlook local spawns a PowerShell + Outlook COM process
// per fetch, so keep it infrequent (its own desktop sync is only every few minutes anyway). The
// two run on separate timers into one merged cache; the per-second bar tick still just re-clips.
const REFRESH_CLOUD_MS = 60 * 1000;
const REFRESH_LOCAL_MS = 5 * 60 * 1000;
const WINDOW_BACK_MS = 60 * 60 * 1000; // a bit behind now (in-progress events)
const WINDOW_AHEAD_MS = 26 * 60 * 60 * 1000; // today's remaining interval + overnight

// Only the durable OAuth fields are written to disk; in-memory access tokens never are.
const durable = (a) => ({ provider: a.provider, email: a.email, refreshToken: a.refreshToken, connectedAt: a.connectedAt });

// getCalendarSettings: () => appearance.calendar ({ google:{enabled,color}, outlook:{enabled,color,method} }).
export function createCalendarService({ timeSource, getCalendarSettings = () => ({}), log = null }) {
  const initial = loadStore();
  let accounts = initial.accounts; // OAuth cloud accounts (google / microsoft)
  // Which calendars each source shows, keyed by 'google' | 'microsoft' | 'outlook-local'. An
  // empty/absent list means "that source's default (primary) calendar only" (legacy behavior).
  let selections = initial.selections;
  if (!encryptionAvailable()) log?.warn('OS secure storage unavailable; OAuth tokens will not persist encrypted');
  let events = []; // merged + normalized [{ startMs, endMs, title, provider }]
  let cloudRaw = []; // last cloud (Google / Graph) result, provider-tagged, un-normalized
  let localRaw = []; // last Outlook-local result, provider-tagged, un-normalized
  // providerId ('google' | 'microsoft') -> most recent error message, or null when healthy.
  // Surfaced via status() so the settings UI can show "token expired" etc. instead of the
  // color band just silently going stale.
  const health = {};
  let cloudTimer = null;
  let localTimer = null;
  const listeners = new Set();
  const notify = () => { for (const fn of listeners) fn(); };
  const persist = () => saveStore({ accounts: accounts.map(durable), selections });
  const cal = () => getCalendarSettings() || {};
  // Cloud and local refresh on independent timers; merge their last results into one cache so a
  // fast cloud refresh keeps the slower local events (and vice versa) instead of dropping them.
  const recombine = () => {
    const next = normalizeEvents([...cloudRaw, ...localRaw]);
    if (next.length === 0 && events.length === 0) return; // nothing to show, nothing changed (e.g. calendar off)
    events = next;
    notify();
  };

  // OAuth connection state (no secrets) for the settings UI — both providers always listed.
  // `error` surfaces the last fetch/refresh failure for a connected account (e.g. an expired
  // token) so the UI can show a warning instead of silently going stale.
  function status() {
    return Object.keys(PROVIDERS).map((id) => {
      const acct = accounts.find((a) => a.provider === id);
      return { provider: id, label: PROVIDERS[id].config.label, connected: Boolean(acct), email: acct ? acct.email : '', error: acct ? (health[id] || '') : '' };
    });
  }

  async function accessTokenFor(acct, provider) {
    if (acct._accessToken && Date.now() < (acct._expiresAt || 0) - 60000) return acct._accessToken;
    const token = await oauth.refresh(provider.config, acct.refreshToken);
    acct._accessToken = token.access_token;
    acct._expiresAt = Date.now() + (token.expires_in ? token.expires_in * 1000 : 3300 * 1000);
    if (token.refresh_token && token.refresh_token !== acct.refreshToken) {
      acct.refreshToken = token.refresh_token; // Microsoft rotates refresh tokens
      persist();
    }
    return acct._accessToken;
  }

  // Returns true when the source is healthy enough to trust its result (nothing to do, or at
  // least one calendar fetched OK); false means "treat this pass as a failure" so the caller
  // can keep the previous cache instead of blanking the color band. Also updates health[] so
  // the settings UI can surface *why* (token refresh failure, or every calendar erroring out).
  async function fetchCloud(providerId, provider, group, start, end, out) {
    const acct = accounts.find((a) => a.provider === providerId);
    if (!acct) return true; // not connected: nothing attempted, so nothing failed
    let token;
    try {
      token = await accessTokenFor(acct, provider);
    } catch (e) {
      health[providerId] = e.message;
      log?.warn('calendar token refresh failed', { provider: providerId, error: e && e.message });
      return false;
    }
    health[providerId] = null; // token is fine; per-calendar failures below may still set it
    const ids = selections[providerId];
    // No selection → the provider's default calendar (undefined lets fetchEvents use its default).
    const targets = ids && ids.length ? ids : [undefined];
    // Per-calendar try/catch: one missing/forbidden calendar must not drop the others.
    let failures = 0;
    let lastError = null;
    for (const calId of targets) {
      try {
        const evs = await provider.fetchEvents(token, start, end, calId);
        for (const e of evs) out.push({ ...e, provider: group });
      } catch (e) {
        if (e && e.code === 401) acct._accessToken = null; // force re-auth next cycle
        failures += 1;
        lastError = e && e.message;
        log?.warn('calendar cloud fetch failed', { provider: providerId, calendar: calId, status: e && e.code, error: e && e.message });
      }
    }
    // Every targeted calendar failed (e.g. offline, revoked grant): the whole pass is bad.
    // A partial failure (some calendars OK) still counts as a healthy pass overall.
    if (targets.length > 0 && failures === targets.length) {
      health[providerId] = lastError;
      return false;
    }
    return true;
  }

  // Cloud sources (Google, and Microsoft Graph when Outlook uses 'cloud'): fast cadence.
  async function refreshCloud() {
    const c = cal();
    const g = c.google || {};
    const o = c.outlook || {};
    const now = timeSource.now();
    const start = now - WINDOW_BACK_MS;
    const end = now + WINDOW_AHEAD_MS;
    const all = [];
    // Each source is independent: one failing (offline, token expired) must not drop the others,
    // so per-provider failures are swallowed inside fetchCloud and the rest of this pass survives.
    const googleOk = g.enabled ? await fetchCloud('google', google, 'google', start, end, all) : true;
    const graphOk = (o.enabled && o.method === 'cloud') ? await fetchCloud('microsoft', microsoft, 'outlook', start, end, all) : true;
    // Keep-last-good: a source that fails outright (offline, expired token) would otherwise
    // blank its color band for a full refresh cycle. Re-seed this pass with its previous
    // events instead, so a transient hiccup doesn't flicker the bar. A *disabled* source never
    // attempted a fetch (ok=true above), so it is correctly cleared here as before.
    if (!googleOk) all.push(...cloudRaw.filter((e) => e.provider === 'google'));
    if (!graphOk) all.push(...cloudRaw.filter((e) => e.provider === 'outlook'));
    cloudRaw = all;
    log?.debug('calendar cloud refreshed', { count: all.length, google: Boolean(g.enabled), graph: Boolean(o.enabled && o.method === 'cloud') });
    recombine();
  }

  // Outlook local (classic Outlook via COM): slow cadence (spawns a PowerShell process).
  async function refreshLocal() {
    const o = cal().outlook || {};
    const all = [];
    if (o.enabled && o.method !== 'cloud') {
      const now = timeSource.now();
      const specs = (selections['outlook-local'] || []).map(decodeLocalCalendarId);
      try {
        const evs = await fetchOutlookLocalEvents(now - WINDOW_BACK_MS, now + WINDOW_AHEAD_MS, specs);
        for (const e of evs) all.push({ ...e, provider: 'outlook' });
      } catch (e) {
        // not Windows / classic Outlook unavailable / COM error — likely transient (e.g. Outlook
        // briefly busy), so keep last-good local events instead of blanking the band for 5min.
        all.push(...localRaw);
        log?.warn('outlook local fetch failed', { error: e && e.message });
      }
    }
    localRaw = all;
    log?.debug('calendar local refreshed', { count: all.length, outlook: Boolean(o.enabled && o.method !== 'cloud') });
    recombine();
  }

  // Refresh everything (boot, settings change, sleep-resume, connect/disconnect).
  function refreshAll() {
    return Promise.all([
      refreshCloud().catch((e) => log?.warn('calendar cloud refresh threw', e)),
      refreshLocal().catch((e) => log?.warn('calendar local refresh threw', e)),
    ]);
  }

  async function connect(providerId) {
    const provider = PROVIDERS[providerId];
    if (!provider) throw new Error(`unknown provider ${providerId}`);
    const token = await oauth.authorize(provider.config);
    if (!token.refresh_token) throw new Error(`${provider.config.label}: no refresh token (re-consent required)`);
    const email = await provider.fetchEmail(token.access_token).catch(() => '');
    accounts = accounts.filter((a) => a.provider !== providerId);
    accounts.push({ provider: providerId, email, refreshToken: token.refresh_token, connectedAt: Date.now() });
    health[providerId] = null; // fresh connection: clear any stale error from a previous account
    persist();
    await refreshCloud(); // a freshly connected account is a cloud (OAuth) source
    notify();
    return status();
  }

  function disconnect(providerId) {
    accounts = accounts.filter((a) => a.provider !== providerId);
    if (selections[providerId]) { selections = { ...selections }; delete selections[providerId]; } // ids are account-scoped
    delete health[providerId]; // no account → no error to report
    persist();
    refreshCloud().catch(() => {}); // recompute cloud from the remaining accounts (or clear)
    notify();
    return status();
  }

  // List the calendars a source exposes, with its current selection, for the settings UI.
  // sourceId: 'google' | 'microsoft' | 'outlook-local'. Throws on a not-connected cloud source.
  async function listCalendars(sourceId) {
    let calendars = [];
    if (sourceId === 'outlook-local') {
      calendars = await listOutlookLocalCalendars();
    } else {
      const provider = PROVIDERS[sourceId];
      if (!provider) throw new Error(`unknown source ${sourceId}`);
      const acct = accounts.find((a) => a.provider === sourceId);
      if (!acct) throw new Error('not connected');
      calendars = await provider.fetchCalendars(await accessTokenFor(acct, provider));
    }
    return { calendars, selected: selections[sourceId] || [] };
  }

  // Persist which calendars a source shows (empty array = its default calendar only) and refetch.
  function setCalendarSelection(sourceId, ids) {
    selections = { ...selections, [sourceId]: Array.isArray(ids) ? ids.filter((s) => typeof s === 'string') : [] };
    persist();
    refreshAll();
    return selections[sourceId];
  }

  return {
    status,
    connect,
    disconnect,
    listCalendars,
    setCalendarSelection,
    refresh: () => refreshAll(), // settings change / sleep-resume: re-fetch both cadences now
    getEvents: () => events, // already normalized + provider-tagged; the bar clips to the interval
    encryptionAvailable,
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    start() {
      log?.debug('calendar service started', { cloudMs: REFRESH_CLOUD_MS, localMs: REFRESH_LOCAL_MS });
      refreshAll();
      cloudTimer = setInterval(() => refreshCloud().catch((e) => log?.warn('calendar cloud refresh threw', e)), REFRESH_CLOUD_MS);
      localTimer = setInterval(() => refreshLocal().catch((e) => log?.warn('calendar local refresh threw', e)), REFRESH_LOCAL_MS);
    },
    dispose() {
      if (cloudTimer) clearInterval(cloudTimer);
      if (localTimer) clearInterval(localTimer);
    },
  };
}
