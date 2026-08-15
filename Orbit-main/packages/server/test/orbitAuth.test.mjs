import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOrbitAuthStore } from '../dist/orbitAuth.js';

test('Orbit password login stores only a salted hash and signs sessions', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'orbit-auth-test-'));
  const file = join(directory, 'orbit-auth.json');
  const auth = createOrbitAuthStore(file);
  const password = 'local-test-password';

  const setupSession = await auth.setup('CAZ', password);
  const persisted = readFileSync(file, 'utf8');
  assert.equal(persisted.includes(password), false);
  assert.equal(auth.hasCredential(), true);
  assert.equal(auth.loginName(), 'CAZ');
  await assert.rejects(() => auth.setup('CAZ', password), /already been configured/i);

  assert.equal(await auth.authenticate('CAZ', 'wrong-password'), undefined);
  const session = await auth.authenticate('caz', password);
  assert.equal(session?.loginName, 'CAZ');

  const token = auth.sessionToken(session);
  assert.equal(auth.verifyToken(token)?.loginName, 'CAZ');
  assert.equal(auth.verifyToken(`${token}tampered`), undefined);
  assert.match(auth.cookieFor(session, false), /HttpOnly; SameSite=Strict/);
  assert.equal(auth.cookieFor(session, false).includes(password), false);
  assert.match(auth.clearCookie(false), /Max-Age=0/);
});
