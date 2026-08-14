import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readJson, writeJsonAtomic } from '../dist/atomicJson.js';

test('runtime JSON stores commit atomically with private file permissions', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-json-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, 'nested', 'state.json');
  writeJsonAtomic(file, { status: 'completed', secret: '[REDACTED]' });
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { status: 'completed', secret: '[REDACTED]' });
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(readdirSync(join(directory, 'nested')), ['state.json']);
  writeFileSync(file, '{interrupted');
  assert.deepEqual(readJson(file, { recovered: true }), { recovered: true });
});
