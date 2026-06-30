// Connected accounts + refresh tokens, plus per-source calendar selections. Kept in a
// SEPARATE encrypted file (not in settings.json) so settings export/import never carries
// credentials and the core validator never touches secrets (CLAUDE.md invariant: tokens via
// OS-standard storage, spec 4.5). Encrypted at rest with the OS keychain/DPAPI via Electron
// safeStorage.
//
// Account shape: { provider, email, refreshToken, connectedAt, selectedCalendars? }.
// `selections` is { [sourceId]: [calendarId, ...] } keyed by 'google' | 'microsoft' |
// 'outlook-local'; it lives here (not in exportable settings.json) because a Google calendar
// id can be the account email — selection is account-scoped metadata, not a portable display
// pref (see docs/calendar-integration.md 決定4/決定9).
import fs from 'node:fs';
import path from 'node:path';
import { app, safeStorage } from 'electron';

const filePath = () => path.join(app.getPath('userData'), 'calendar-accounts.enc');
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function encryptionAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

// Read the whole encrypted blob: { accounts: [...], selections: { sourceId: [ids] } }.
export function loadStore() {
  try {
    const raw = fs.readFileSync(filePath());
    // Written encrypted when available; the plaintext fallback (below) is dev-only.
    const json = encryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8');
    const data = JSON.parse(json);
    return {
      accounts: Array.isArray(data.accounts) ? data.accounts : [],
      selections: isPlainObject(data.selections) ? data.selections : {},
    };
  } catch {
    return { accounts: [], selections: {} };
  }
}

export function saveStore({ accounts = [], selections = {} }) {
  const json = JSON.stringify({ version: 1, accounts, selections });
  const buf = encryptionAvailable() ? safeStorage.encryptString(json) : Buffer.from(json, 'utf8');
  const file = filePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, file);
}
