import test from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, DEFAULT_LANGUAGE, LANGUAGE_NAMES, MESSAGES, isLanguage, t } from '../src/core/i18n.js';

test('supported languages and English default', () => {
  assert.deepEqual(LANGUAGES, ['en', 'ja', 'zh']);
  assert.equal(DEFAULT_LANGUAGE, 'en');
  for (const lang of LANGUAGES) assert.equal(typeof LANGUAGE_NAMES[lang], 'string');
});

test('every language defines exactly the same keys (no gaps, no extras)', () => {
  const keys = new Set();
  for (const lang of LANGUAGES) for (const k of Object.keys(MESSAGES[lang])) keys.add(k);
  for (const lang of LANGUAGES) {
    for (const k of keys) {
      assert.ok(k in MESSAGES[lang], `missing key "${k}" in "${lang}"`);
      assert.equal(typeof MESSAGES[lang][k], 'string');
    }
    assert.equal(Object.keys(MESSAGES[lang]).length, keys.size, `extra keys in "${lang}"`);
  }
});

test('isLanguage', () => {
  assert.equal(isLanguage('en'), true);
  assert.equal(isLanguage('ja'), true);
  assert.equal(isLanguage('zh'), true);
  assert.equal(isLanguage('fr'), false);
  assert.equal(isLanguage(undefined), false);
});

test('t returns the localized string and interpolates params', () => {
  assert.equal(t('en', 'tray.quit'), 'Quit');
  assert.equal(t('ja', 'tray.quit'), '終了');
  assert.equal(t('zh', 'tray.quit'), '退出');
  assert.equal(t('en', 'v.breakFormat', { label: 'Monday', index: 2 }), 'Monday: break 2 has an invalid time format.');
  assert.equal(t('ja', 'bar.remainingFmt', { v: '1:30' }), '残り 1:30');
});

test('t falls back to English for an unknown language, and to the key for an unknown key', () => {
  assert.equal(t('xx', 'tray.quit'), 'Quit');
  assert.equal(t('en', 'no.such.key'), 'no.such.key');
});
