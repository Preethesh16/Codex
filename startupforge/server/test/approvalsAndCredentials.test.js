const test = require('node:test');
const assert = require('node:assert/strict');
process.env.STARTUPFORGE_TOKEN_ENCRYPTION_KEY = 'test-only-startupforge-encryption-key';
const { requireExplicitApproval } = require('../dist/services/actionApproval.js');
const { encryptCredential, decryptCredential } = require('../dist/services/credentialVault.js');

test('deployment and GitHub actions require an explicit approval bit', () => {
  assert.throws(() => requireExplicitApproval('Deployment', false), /explicit human approval/);
  assert.throws(() => requireExplicitApproval('GitHub publishing', undefined), /explicit human approval/);
  assert.doesNotThrow(() => requireExplicitApproval('Deployment', true));
});

test('StartupForge credentials are encrypted at rest', () => {
  const encrypted = encryptCredential('github-token-value');
  assert.match(encrypted, /^enc:v1:/);
  assert.doesNotMatch(encrypted, /github-token-value/);
  assert.equal(decryptCredential(encrypted), 'github-token-value');
});
