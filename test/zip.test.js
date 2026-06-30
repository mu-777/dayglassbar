import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { createZip } from '../src/core/zip.js';

// Independent reader (walks the central directory) so we validate createZip's OUTPUT,
// not its internals. Small, non-Zip64 archives only — same scope as createZip.
function unzip(buf) {
  let p = buf.length - 22;
  while (p >= 0 && buf.readUInt32LE(p) !== 0x06054b50) p--;
  assert.ok(p >= 0, 'end-of-central-directory record present');
  const count = buf.readUInt16LE(p + 10);
  let cd = buf.readUInt32LE(p + 16);
  const out = {};
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(cd), 0x02014b50, 'central directory signature');
    const method = buf.readUInt16LE(cd + 10);
    const crc = buf.readUInt32LE(cd + 16);
    const compSize = buf.readUInt32LE(cd + 20);
    const nameLen = buf.readUInt16LE(cd + 28);
    const extraLen = buf.readUInt16LE(cd + 30);
    const commentLen = buf.readUInt16LE(cd + 32);
    const lho = buf.readUInt32LE(cd + 42);
    const name = buf.toString('utf8', cd + 46, cd + 46 + nameLen);
    assert.equal(buf.readUInt32LE(lho), 0x04034b50, 'local header signature');
    const dataStart = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const body = buf.subarray(dataStart, dataStart + compSize);
    out[name] = { method, crc: crc >>> 0, data: method === 0 ? Buffer.from(body) : zlib.inflateRawSync(body) };
    cd += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

test('round-trips text and binary entries', () => {
  const big = Buffer.from('hello world '.repeat(1000)); // compressible → deflate path
  const zip = createZip([
    { name: 'environment.json', data: '{"a":1}' },
    { name: 'logs/main.log', data: big },
  ]);
  const got = unzip(zip);
  assert.deepEqual(Object.keys(got).sort(), ['environment.json', 'logs/main.log']);
  assert.deepEqual(got['environment.json'].data, Buffer.from('{"a":1}'));
  assert.deepEqual(got['logs/main.log'].data, big);
  assert.equal(got['logs/main.log'].method, 8); // actually compressed
});

test('CRC-32 matches the standard reference value (0xCBF43926 for "123456789")', () => {
  const got = unzip(createZip([{ name: 'a', data: '123456789' }]));
  assert.equal(got['a'].crc, 0xcbf43926);
});

test('stores tiny/incompressible data instead of inflating it', () => {
  const got = unzip(createZip([{ name: 'x', data: 'hi' }]));
  assert.equal(got['x'].method, 0); // stored
  assert.deepEqual(got['x'].data, Buffer.from('hi'));
});
