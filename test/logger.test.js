import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLogger, levelFromEnv, formatLine } from '../src/main/logger.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dgb-log-'));
}

test('levelFromEnv: explicit wins, then DEBUG flag, then fallback', () => {
  assert.equal(levelFromEnv({ DAYGLASSBAR_LOG_LEVEL: 'warn' }), 'warn');
  assert.equal(levelFromEnv({ DAYGLASSBAR_LOG_LEVEL: 'WARN' }), 'warn');
  assert.equal(levelFromEnv({ DAYGLASSBAR_DEBUG: '1' }), 'debug');
  assert.equal(levelFromEnv({ DAYGLASSBAR_LOG_LEVEL: 'nonsense', DAYGLASSBAR_DEBUG: '1' }), 'debug');
  assert.equal(levelFromEnv({}), 'info');
});

test('writes records and honors the level threshold', () => {
  const dir = tmpDir();
  const log = createLogger({ dir, level: 'info' });
  log.info('hello', { a: 1 });
  log.debug('should be filtered out');
  log.child('calendar').warn('fetch failed', { provider: 'google' });
  const text = fs.readFileSync(log.filePath, 'utf8');
  assert.match(text, /INFO {2}\[app\] hello {"a":1}/);
  assert.match(text, /WARN {2}\[app:calendar\] fetch failed {"provider":"google"}/);
  assert.doesNotMatch(text, /filtered out/); // below threshold
});

test('redacts secret-looking keys and expands Errors', () => {
  const dir = tmpDir();
  const log = createLogger({ dir, level: 'debug' });
  log.info('token kept out', { refreshToken: 'abc', accessToken: 'xyz', ok: true });
  log.error('boom', new Error('kaboom'));
  const text = fs.readFileSync(log.filePath, 'utf8');
  assert.doesNotMatch(text, /abc|xyz/);
  assert.match(text, /\[redacted\]/);
  assert.match(text, /"ok":true/);
  assert.match(text, /kaboom/); // error message preserved
});

test('rotates when the size cap is exceeded, capping the number of files', () => {
  const dir = tmpDir();
  // Tiny cap so a couple of lines force rotation; keep 2 backups.
  const log = createLogger({ dir, level: 'info', maxBytes: 120, maxBackups: 2 });
  for (let i = 0; i < 20; i++) log.info(`line number ${i} with some padding to grow the file`);
  const files = fs.readdirSync(dir).sort();
  assert.ok(files.includes('main.log'));
  // Never more than main.log + .1 + .2
  assert.ok(files.length <= 3, `expected <=3 files, got ${files.join(',')}`);
  assert.ok(files.includes('main.log.1'));
});

test('formatLine shape is stable', () => {
  const line = formatLine(new Date('2026-06-28T03:00:00.000Z'), 'info', 'app:bar', 'started', { edge: 'right' });
  assert.equal(line, '2026-06-28T03:00:00.000Z INFO  [app:bar] started {"edge":"right"}');
});
