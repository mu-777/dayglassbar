// The RFC 8252 "AppAuth pattern": authorization-code + PKCE in the SYSTEM browser with a
// loopback redirect. One generic flow serves both providers (only the config differs).
// This module touches Electron (shell) and opens a local socket, so it is verified by
// hand on Windows, not in unit tests — the testable pieces live in pkce.js / oauth-url.js.
import http from 'node:http';
import { shell } from 'electron';
import { createVerifier, challengeFromVerifier, randomToken } from './pkce.js';
import { buildAuthUrl, tokenRequestBody, refreshRequestBody } from './oauth-url.js';

// Run the full flow and return the token response { access_token, refresh_token, ... }.
export async function authorize(config) {
  if (!config.clientId) throw new Error(`${config.label}: client_id not configured`);
  const verifier = createVerifier();
  const challenge = challengeFromVerifier(verifier);
  const state = randomToken();
  const { code, redirectUri } = await runLoopback((redirectUri) => {
    shell.openExternal(
      buildAuthUrl(config, { redirectUri, codeChallenge: challenge, state, extra: config.authExtra }),
    );
  }, state);
  return exchange(config.tokenUrl, tokenRequestBody({ config, code, codeVerifier: verifier, redirectUri }));
}

export async function refresh(config, refreshToken) {
  return exchange(config.tokenUrl, refreshRequestBody({ config, refreshToken }));
}

async function exchange(tokenUrl, body) {
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = [json.error, json.error_description].filter(Boolean).join(': ');
    throw new Error(`token endpoint ${res.status}${detail ? ` (${detail})` : ''}`);
  }
  return json;
}

// One-shot loopback server on an ephemeral 127.0.0.1 port. Calls openBrowser(redirectUri)
// once listening, then resolves with the auth code from the redirect. Requests without a
// code/error (e.g. favicon) are ignored so they don't abort the wait.
function runLoopback(openBrowser, expectedState, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    let redirectUri = '';
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      const code = u.searchParams.get('code');
      const error = u.searchParams.get('error');
      if (!code && !error) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<!doctype html><meta charset="utf-8"><body style="font:14px system-ui;padding:2rem">' +
          'DayGlassBar: sign-in complete. You can close this tab.</body>',
      );
      cleanup();
      if (error) return reject(new Error(error));
      if (u.searchParams.get('state') !== expectedState) return reject(new Error('state mismatch'));
      resolve({ code, redirectUri });
    });
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('authorization timed out'));
    }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      server.close();
    }
    server.on('error', (e) => {
      cleanup();
      reject(e);
    });
    server.listen(0, '127.0.0.1', () => {
      redirectUri = `http://127.0.0.1:${server.address().port}`;
      openBrowser(redirectUri);
    });
  });
}
