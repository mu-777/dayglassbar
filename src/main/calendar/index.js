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
  function status() {
    return Object.keys(PROVIDERS).map((id) => {
      const acct = accounts.find((a) => a.provider === id);
      return { provider: id, label: PROVIDERS[id].config.label, connected: Boolean(acct), email: acct ? acct.email : '' };
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

  async function fetchCloud(providerId, provider, group, start, end, out) {
    const acct = accounts.find((a) => a.provider === providerId);
    if (!acct) return;
    let token;
    try {
      token = await accessTokenFor(acct, provider);
    } catch (e) {
      log?.warn('calendar token refresh failed', { provider: providerId, error: e && e.message });
      return;
    }
    const ids = selections[providerId];
    // No selection → the provider's default calendar (undefined lets fetchEvents use its default).
    const targets = ids && ids.length ? ids : [undefined];
    // Per-calendar try/catch: one missing/forbidden calendar must not drop the others.
    for (const calId of targets) {
      try {
        const evs = await provider.fetchEvents(token, start, end, calId);
        for (const e of evs) out.push({ ...e, provider: group });
      } catch (e) {
        if (e && e.code === 401) acct._accessToken = null; // force re-auth next cycle
        log?.warn('calendar cloud fetch failed', { provider: providerId, calendar: calId, status: e && e.code, error: e && e.message });
      }
    }
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
    if (g.enabled) await fetchCloud('google', google, 'google', start, end, all);
    if (o.enabled && o.method === 'cloud') await fetchCloud('microsoft', microsoft, 'outlook', start, end, all);
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
        // not Windows / classic Outlook unavailable / COM error — skip, keep cloud sources
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
    persist();
    await refreshCloud(); // a freshly connected account is a cloud (OAuth) source
    notify();
    return status();
  }

  function disconnect(providerId) {
    accounts = accounts.filter((a) => a.provider !== providerId);
    if (selections[providerId]) { selections = { ...selections }; delete selections[providerId]; } // ids are account-scoped
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
    eventsAround: () => events, // already normalized + provider-tagged; the bar clips to the interval
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
