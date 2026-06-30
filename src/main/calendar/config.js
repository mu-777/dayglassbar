// Single place to set the OAuth credentials. A client_id is a PUBLIC identifier (RFC 8252).
// Microsoft is a true public client (client_id + PKCE, NO secret). Google "Desktop app"
// clients are different: their token endpoint REQUIRES a client_secret even with PKCE —
// Google issues one to embed and explicitly does NOT treat it as confidential. So Google
// needs both client_id and client_secret here; Microsoft needs only client_id.
// Real values are kept out of the repo: copy client-ids.local.example.json →
// client-ids.local.json and fill it in (or set the env vars). See docs/calendar-integration.md.
import fs from 'node:fs';

function localIds() {
  try {
    return JSON.parse(fs.readFileSync(new URL('./client-ids.local.json', import.meta.url), 'utf8'));
  } catch {
    return {}; // file absent (the normal case in a fresh clone / CI) → rely on env
  }
}

const local = localIds();

// Env wins (handy for dev / build injection), then the local file, then empty.
export const CLIENT_IDS = {
  google: process.env.DAYGLASSBAR_GOOGLE_CLIENT_ID || local.google || '',
  microsoft: process.env.DAYGLASSBAR_MS_CLIENT_ID || local.microsoft || '',
};

// Only Google uses one (see above). Not treated as confidential by Google, but required.
export const CLIENT_SECRETS = {
  google: process.env.DAYGLASSBAR_GOOGLE_CLIENT_SECRET || local.google_secret || '',
};
