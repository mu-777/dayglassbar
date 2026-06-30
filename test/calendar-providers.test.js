import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createVerifier, challengeFromVerifier, randomToken } from '../src/main/calendar/pkce.js';
import { buildAuthUrl, tokenRequestBody, refreshRequestBody } from '../src/main/calendar/oauth-url.js';
import * as google from '../src/main/calendar/google.js';
import * as microsoft from '../src/main/calendar/microsoft.js';

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

test('PKCE verifier is 43+ url-safe chars and challenge is S256(verifier)', () => {
  const v = createVerifier();
  assert.ok(v.length >= 43 && v.length <= 128);
  assert.match(v, /^[A-Za-z0-9\-._~]+$/);
  const expected = b64url(crypto.createHash('sha256').update(v).digest());
  assert.equal(challengeFromVerifier(v), expected);
  assert.notEqual(randomToken(), randomToken()); // unique
});

test('buildAuthUrl carries PKCE S256, redirect, scope and provider extras', () => {
  const cfg = { clientId: 'cid', authUrl: 'https://auth.example/a', scope: 'openid x' };
  const url = new URL(
    buildAuthUrl(cfg, {
      redirectUri: 'http://127.0.0.1:5000',
      codeChallenge: 'chal',
      state: 'st',
      extra: { access_type: 'offline' },
    }),
  );
  assert.equal(url.origin + url.pathname, 'https://auth.example/a');
  const q = url.searchParams;
  assert.equal(q.get('client_id'), 'cid');
  assert.equal(q.get('response_type'), 'code');
  assert.equal(q.get('redirect_uri'), 'http://127.0.0.1:5000');
  assert.equal(q.get('code_challenge'), 'chal');
  assert.equal(q.get('code_challenge_method'), 'S256');
  assert.equal(q.get('state'), 'st');
  assert.equal(q.get('access_type'), 'offline');
});

test('token/refresh request bodies use the right grant types', () => {
  const cfg = { clientId: 'cid', scope: 'openid x' };
  const code = new URLSearchParams(tokenRequestBody({ config: cfg, code: 'C', codeVerifier: 'V', redirectUri: 'R' }));
  assert.equal(code.get('grant_type'), 'authorization_code');
  assert.equal(code.get('code'), 'C');
  assert.equal(code.get('code_verifier'), 'V');
  const refr = new URLSearchParams(refreshRequestBody({ config: cfg, refreshToken: 'RT' }));
  assert.equal(refr.get('grant_type'), 'refresh_token');
  assert.equal(refr.get('refresh_token'), 'RT');
});

test('client_secret is included only when the provider config carries one (Google, not Microsoft)', () => {
  const pub = { clientId: 'cid', scope: 'x' }; // Microsoft-style public client: no secret
  const conf = { clientId: 'cid', clientSecret: 'sek', scope: 'x' }; // Google desktop client
  assert.equal(new URLSearchParams(tokenRequestBody({ config: pub, code: 'C', codeVerifier: 'V', redirectUri: 'R' })).has('client_secret'), false);
  assert.equal(new URLSearchParams(tokenRequestBody({ config: conf, code: 'C', codeVerifier: 'V', redirectUri: 'R' })).get('client_secret'), 'sek');
  assert.equal(new URLSearchParams(refreshRequestBody({ config: conf, refreshToken: 'RT' })).get('client_secret'), 'sek');
});

test('google.mapEvents flags all-day, free, and declined events', () => {
  const out = google.mapEvents({
    items: [
      { summary: 'Standup', start: { dateTime: '2026-06-15T15:00:00Z' }, end: { dateTime: '2026-06-15T15:30:00Z' } },
      { summary: 'Holiday', start: { date: '2026-06-15' }, end: { date: '2026-06-16' } },
      {
        summary: 'Free block',
        transparency: 'transparent',
        start: { dateTime: '2026-06-15T16:00:00Z' },
        end: { dateTime: '2026-06-15T17:00:00Z' },
      },
      {
        summary: 'Declined',
        attendees: [{ self: true, responseStatus: 'declined' }],
        start: { dateTime: '2026-06-15T18:00:00Z' },
        end: { dateTime: '2026-06-15T18:30:00Z' },
      },
    ],
  });
  assert.equal(out[0].title, 'Standup');
  assert.equal(out[0].allDay, false);
  assert.equal(out[0].busy, true);
  assert.equal(out[0].startMs, Date.parse('2026-06-15T15:00:00Z'));
  assert.equal(out[1].allDay, true);
  assert.equal(out[2].busy, false);
  assert.equal(out[3].declined, true);
});

test('google.mapCalendars maps id/name and flags the primary calendar', () => {
  const out = google.mapCalendars({
    items: [
      { id: 'me@example.com', summary: 'My calendar', primary: true },
      { id: 'team@group.calendar.google.com', summary: 'Team' },
      { id: 'noname@group.calendar.google.com' }, // missing summary → id is the fallback name
    ],
  });
  assert.deepEqual(out[0], { id: 'me@example.com', name: 'My calendar', primary: true });
  assert.deepEqual(out[1], { id: 'team@group.calendar.google.com', name: 'Team', primary: false });
  assert.equal(out[2].name, 'noname@group.calendar.google.com');
  assert.equal(out[2].primary, false);
  assert.deepEqual(google.mapCalendars(null), []);
});

test('microsoft.mapCalendars maps id/name and flags the default calendar', () => {
  const out = microsoft.mapCalendars({
    value: [
      { id: 'AAA', name: 'Calendar', isDefaultCalendar: true },
      { id: 'BBB', name: 'Birthdays' },
    ],
  });
  assert.deepEqual(out[0], { id: 'AAA', name: 'Calendar', primary: true });
  assert.deepEqual(out[1], { id: 'BBB', name: 'Birthdays', primary: false });
  assert.deepEqual(microsoft.mapCalendars(undefined), []);
});

test('microsoft.mapEvents handles UTC-without-Z, showAs free, all-day and declined', () => {
  const out = microsoft.mapEvents({
    value: [
      {
        subject: 'Sync',
        start: { dateTime: '2026-06-15T15:00:00.0000000', timeZone: 'UTC' },
        end: { dateTime: '2026-06-15T15:30:00.0000000', timeZone: 'UTC' },
        showAs: 'busy',
      },
      { subject: 'OOO', isAllDay: true, start: { dateTime: '2026-06-15T00:00:00.0000000' }, end: { dateTime: '2026-06-16T00:00:00.0000000' }, showAs: 'oof' },
      { subject: 'FYI', showAs: 'free', start: { dateTime: '2026-06-15T16:00:00.0000000' }, end: { dateTime: '2026-06-15T17:00:00.0000000' } },
      { subject: 'Nope', responseStatus: { response: 'declined' }, start: { dateTime: '2026-06-15T18:00:00.0000000' }, end: { dateTime: '2026-06-15T18:30:00.0000000' }, showAs: 'busy' },
    ],
  });
  assert.equal(out[0].startMs, Date.parse('2026-06-15T15:00:00Z')); // 'Z' appended
  assert.equal(out[0].busy, true);
  assert.equal(out[1].allDay, true);
  assert.equal(out[2].busy, false);
  assert.equal(out[3].declined, true);
});
