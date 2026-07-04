import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVersion, isNewerVersion } from '../src/core/version.js';

test('parseVersion accepts plain and v-prefixed semver, rejects the rest', () => {
  assert.deepEqual(parseVersion('1.2.3'), [1, 2, 3]);
  assert.deepEqual(parseVersion('v1.2.3'), [1, 2, 3]);
  assert.deepEqual(parseVersion('0.1.0'), [0, 1, 0]);
  assert.equal(parseVersion('1.2'), null);
  assert.equal(parseVersion('1.2.3.4'), null);
  assert.equal(parseVersion('1.2.x'), null);
  assert.equal(parseVersion('not-a-version'), null);
  assert.equal(parseVersion(''), null);
  assert.equal(parseVersion(undefined), null);
});

test('isNewerVersion: a genuinely newer version is newer', () => {
  assert.equal(isNewerVersion('1.2.4', '1.2.3'), true);
  assert.equal(isNewerVersion('1.3.0', '1.2.9'), true);
  assert.equal(isNewerVersion('2.0.0', '1.9.9'), true);
  assert.equal(isNewerVersion('v1.2.4', '1.2.3'), true); // v-prefix on either side
});

test('isNewerVersion: same version is not newer', () => {
  assert.equal(isNewerVersion('1.2.3', '1.2.3'), false);
  assert.equal(isNewerVersion('v1.2.3', '1.2.3'), false);
});

test('isNewerVersion: an older version is not newer', () => {
  assert.equal(isNewerVersion('1.2.2', '1.2.3'), false);
  assert.equal(isNewerVersion('0.9.9', '1.0.0'), false);
});

test('isNewerVersion: unparsable input on either side is never treated as newer', () => {
  assert.equal(isNewerVersion('not-a-version', '1.2.3'), false);
  assert.equal(isNewerVersion('1.2.3', 'not-a-version'), false);
  assert.equal(isNewerVersion('', ''), false);
});
