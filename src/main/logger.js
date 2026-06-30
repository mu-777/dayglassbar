// File logger for after-the-fact problem analysis. Writes newline-delimited records to
// userData/logs/main.log and rotates to main.log.1 / .2 once the file passes a size cap,
// so a long-running install never fills the disk and the diagnostics dump
// (src/main/diagnostics.js) always has a bounded, recent history to bundle.
//
// Deliberately NOT in core (it does file I/O and is a main-process concern), but it imports
// no Electron — the caller injects the directory — so it stays unit-tested (test/logger.test.js).
// Records are internal/English-only; this is not user-facing text (invariant #3 doesn't apply).
import fs from 'node:fs';
import path from 'node:path';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const ORDER = ['error', 'warn', 'info', 'debug'];

// Active level from the environment: DAYGLASSBAR_LOG_LEVEL=<name> wins, then
// DAYGLASSBAR_DEBUG=1 → debug, else the fallback (info). Exported for tests.
export function levelFromEnv(env = {}, fallback = 'info') {
  const explicit = String(env.DAYGLASSBAR_LOG_LEVEL || '').toLowerCase();
  if (explicit in LEVELS) return explicit;
  if (/^(1|true|yes|on)$/i.test(env.DAYGLASSBAR_DEBUG || '')) return 'debug';
  return fallback;
}

// Defensive redaction: secrets must never be logged, but if a token/account object slips
// into a data payload, don't write it in the clear. Errors are expanded to name+message+stack.
const SECRET_KEY = /token|secret|password|authorization|auth|cookie|refresh|client_?secret/i;
function replacer(key, value) {
  if (key && SECRET_KEY.test(key)) return '[redacted]';
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  return value;
}

function serialize(data) {
  if (data === undefined) return '';
  try {
    return ' ' + JSON.stringify(data, replacer);
  } catch {
    return ' [unserializable]';
  }
}

export function formatLine(date, level, scope, msg, data) {
  return `${date.toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${msg}${serialize(data)}`;
}

// Returns a logger bound to scope 'app' with .error/.warn/.info/.debug(msg, data?) and
// .child(scope) for sub-scopes (e.g. 'app:calendar'). Logging never throws — disk/permission
// failures drop the line rather than crashing the app.
export function createLogger({
  dir,
  level = 'info',
  maxBytes = 2 * 1024 * 1024,
  maxBackups = 2,
  mirror = false,
  now = () => new Date(),
} = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;
  const file = path.join(dir, 'main.log');
  let size = 0;
  try {
    fs.mkdirSync(dir, { recursive: true });
    size = fs.statSync(file).size;
  } catch {
    /* fresh install: log dir/file not there yet */
  }

  // main.log → main.log.1 → … → main.log.<maxBackups> (oldest dropped). Best-effort.
  function rotate() {
    try {
      const oldest = `${file}.${maxBackups}`;
      if (fs.existsSync(oldest)) fs.rmSync(oldest);
      for (let i = maxBackups - 1; i >= 1; i--) {
        if (fs.existsSync(`${file}.${i}`)) fs.renameSync(`${file}.${i}`, `${file}.${i + 1}`);
      }
      if (fs.existsSync(file)) fs.renameSync(file, `${file}.1`);
    } catch {
      /* never let rotation crash the app */
    }
    size = 0;
  }

  function write(lvl, scope, msg, data) {
    if (LEVELS[lvl] > threshold) return;
    const buf = Buffer.from(formatLine(now(), lvl, scope, msg, data) + '\n', 'utf8');
    if (size > 0 && size + buf.length > maxBytes) rotate();
    try {
      fs.appendFileSync(file, buf);
      size += buf.length;
    } catch {
      /* disk full / no permission: drop the line, never throw */
    }
    if (mirror) (lvl === 'error' ? console.error : lvl === 'warn' ? console.warn : console.log)(buf.toString('utf8').trimEnd());
  }

  function scoped(scope) {
    const api = { child: (sub) => scoped(`${scope}:${sub}`) };
    for (const lvl of ORDER) api[lvl] = (msg, data) => write(lvl, scope, msg, data);
    return api;
  }

  const root = scoped('app');
  root.filePath = file;
  root.level = level;
  return root;
}
