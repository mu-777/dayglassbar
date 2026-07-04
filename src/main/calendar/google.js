// Google Calendar provider. The client_id is a PUBLIC desktop-app identifier (no secret;
// PKCE protects the flow — RFC 8252). It is set centrally in config.js (env or a gitignored
// local file). `mapEvents` is pure and unit-tested; the fetch helpers use the global fetch
// (no Electron) so this module stays testable.
import { CLIENT_IDS, CLIENT_SECRETS } from './config.js';

// Per-request cap. Each call is a small GET; 10s is generous yet keeps a wedged request —
// several calendars are fetched sequentially per pass — well inside the 60s cloud cadence.
const FETCH_TIMEOUT_MS = 10000;

export const config = {
  id: 'google',
  label: 'Google',
  clientId: CLIENT_IDS.google,
  clientSecret: CLIENT_SECRETS.google, // Google's token endpoint requires it even with PKCE
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  // events.readonly = read events on any calendar the user can access (incl. secondary/shared);
  // calendarlist.readonly = list those calendars (calendarList.list) for the "choose calendars"
  // picker. events.readonly alone does NOT authorize calendarList.list (403). Adding a scope means
  // existing accounts must reconnect to re-consent (prompt:'consent' above shows the dialog again).
  scope:
    'openid email https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  // Required for the desktop/loopback flow to return a refresh token on first consent.
  authExtra: { access_type: 'offline', prompt: 'consent' },
};

// Google events.list item → generic event shape (see core/calendar.js normalizeEvents).
// Pure: no network. All-day events carry start.date (not start.dateTime); a 'transparent'
// event is shown as Free; an attendee self.responseStatus of 'declined' means declined.
export function mapEvents(json) {
  const items = (json && json.items) || [];
  return items.map((ev) => {
    const start = ev.start || {};
    const end = ev.end || {};
    const allDay = Boolean(start.date && !start.dateTime);
    const self = (ev.attendees || []).find((a) => a && a.self);
    return {
      startMs: Date.parse(start.dateTime || start.date || ''),
      endMs: Date.parse(end.dateTime || end.date || ''),
      title: ev.summary || '',
      allDay,
      busy: ev.transparency !== 'transparent',
      declined: self ? self.responseStatus === 'declined' : ev.status === 'cancelled',
    };
  });
}

// Google calendarList item → { id, name, primary }. Pure: no network. `id` is the value
// fetchEvents takes as calendarId (the primary calendar's id is the account email).
export function mapCalendars(json) {
  const items = (json && json.items) || [];
  return items.map((c) => ({ id: c.id, name: c.summary || c.id, primary: Boolean(c.primary) }));
}

// List the calendars this account can read (for the "choose calendars" UI).
export async function fetchCalendars(accessToken) {
  const url = new URL('https://www.googleapis.com/calendar/v3/users/me/calendarList');
  url.searchParams.set('minAccessRole', 'reader'); // skip calendars we can't read events from
  url.searchParams.set('maxResults', '250');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (res.status === 401) throw Object.assign(new Error('unauthorized'), { code: 401 });
  if (!res.ok) throw new Error(`google calendarList ${res.status}`);
  return mapCalendars(await res.json());
}

// calendarId defaults to 'primary' (legacy single-calendar behavior); pass a specific id
// from fetchCalendars to read a secondary/shared calendar.
export async function fetchEvents(accessToken, startMs, endMs, calendarId = 'primary') {
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set('timeMin', new Date(startMs).toISOString());
  url.searchParams.set('timeMax', new Date(endMs).toISOString());
  url.searchParams.set('singleEvents', 'true'); // expand recurrences into instances
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', '50');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (res.status === 401) throw Object.assign(new Error('unauthorized'), { code: 401 });
  if (!res.ok) throw new Error(`google events ${res.status}`);
  return mapEvents(await res.json());
}

export async function fetchEmail(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return '';
  return (await res.json()).email || '';
}
