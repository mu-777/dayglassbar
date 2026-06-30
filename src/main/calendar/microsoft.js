// Microsoft (Outlook / Graph) provider. The client_id is a PUBLIC client identifier (no
// secret; PKCE protects the flow — RFC 8252). It is set centrally in config.js (env or a
// gitignored local file). `mapEvents` is pure and unit-tested.
import { CLIENT_IDS } from './config.js';

export const config = {
  id: 'microsoft',
  label: 'Microsoft',
  clientId: CLIENT_IDS.microsoft,
  // 'common' lets both personal and work/school accounts sign in.
  authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  scope: 'openid email offline_access Calendars.Read',
  authExtra: {},
};

// Graph returns dateTime WITHOUT a zone designator plus a separate timeZone field. We ask
// Graph for UTC (Prefer header below), so append 'Z' when the string has no offset.
function graphIsoUtc(d) {
  if (!d || !d.dateTime) return '';
  const dt = d.dateTime;
  return /[zZ]|[+-]\d\d:?\d\d$/.test(dt) ? dt : `${dt}Z`;
}

// Graph calendarView event → generic event shape. Pure: no network. showAs 'free' counts
// as not busy; responseStatus.response 'declined' means declined; isAllDay flags all-day.
export function mapEvents(json) {
  const items = (json && json.value) || [];
  return items.map((ev) => ({
    startMs: Date.parse(graphIsoUtc(ev.start)),
    endMs: Date.parse(graphIsoUtc(ev.end)),
    title: ev.subject || '',
    allDay: Boolean(ev.isAllDay),
    busy: ev.showAs !== 'free',
    declined: Boolean(ev.responseStatus && ev.responseStatus.response === 'declined'),
  }));
}

// Graph calendar → { id, name, primary }. Pure: no network. `id` is the value fetchEvents
// takes as calendarId; isDefaultCalendar marks the account's default calendar.
export function mapCalendars(json) {
  const items = (json && json.value) || [];
  return items.map((c) => ({ id: c.id, name: c.name || c.id, primary: Boolean(c.isDefaultCalendar) }));
}

// List the calendars this account can read (for the "choose calendars" UI).
export async function fetchCalendars(accessToken) {
  const url = new URL('https://graph.microsoft.com/v1.0/me/calendars');
  url.searchParams.set('$select', 'id,name,isDefaultCalendar');
  url.searchParams.set('$top', '100');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 401) throw Object.assign(new Error('unauthorized'), { code: 401 });
  if (!res.ok) throw new Error(`graph calendars ${res.status}`);
  return mapCalendars(await res.json());
}

// calendarId null/undefined → the account's default calendar (legacy behavior). Pass a
// specific id from fetchCalendars to read another calendar.
export async function fetchEvents(accessToken, startMs, endMs, calendarId = null) {
  const base = calendarId
    ? `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/calendarView`
    : 'https://graph.microsoft.com/v1.0/me/calendarView';
  const url = new URL(base);
  url.searchParams.set('startDateTime', new Date(startMs).toISOString());
  url.searchParams.set('endDateTime', new Date(endMs).toISOString());
  url.searchParams.set('$select', 'subject,start,end,isAllDay,showAs,responseStatus');
  url.searchParams.set('$orderby', 'start/dateTime');
  url.searchParams.set('$top', '50');
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
  });
  if (res.status === 401) throw Object.assign(new Error('unauthorized'), { code: 401 });
  if (!res.ok) throw new Error(`graph events ${res.status}`);
  return mapEvents(await res.json());
}

export async function fetchEmail(accessToken) {
  const res = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return '';
  const j = await res.json();
  return j.mail || j.userPrincipalName || '';
}
