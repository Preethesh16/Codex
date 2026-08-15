const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
process.env.STARTUPFORGE_TOKEN_ENCRYPTION_KEY = 'test-only-startupforge-encryption-key';
const { requireExplicitApproval } = require('../dist/services/actionApproval.js');
const { encryptCredential, decryptCredential } = require('../dist/services/credentialVault.js');
const { githubRemoteUrl, getSshGithubConfig, rejectExecutableGitConfiguration, validateGithubOwner, validateGithubRepoName } = require('../dist/services/githubService.js');

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

test('GitHub remote construction rejects shell input and never embeds credentials', () => {
  assert.equal(validateGithubRepoName('orbit-demo_1'), 'orbit-demo_1');
  assert.throws(() => validateGithubRepoName('orbit; touch compromised'), /Invalid GitHub repository name/);
  assert.throws(() => validateGithubOwner('owner/name'), /Invalid GitHub owner/);
  const remote = githubRemoteUrl('Preethesh16', 'orbit-demo');
  assert.equal(remote, 'git@github.com:Preethesh16/orbit-demo.git');
  assert.doesNotMatch(remote, /token|x-access-token/i);
});

test('GitHub SSH status is configured from an owner, not a credential', () => {
  const previous = process.env.GITHUB_SSH_OWNER;
  process.env.GITHUB_SSH_OWNER = 'Preethesh16';
  assert.deepEqual(getSshGithubConfig(), { configured: true, owner: 'Preethesh16', mode: 'ssh' });
  if (previous === undefined) delete process.env.GITHUB_SSH_OWNER;
  else process.env.GITHUB_SSH_OWNER = previous;
});

test('GitHub publishing rejects executable local Git configuration', async (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'startupforge-git-policy-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  await assert.doesNotReject(rejectExecutableGitConfiguration(repo));
  execFileSync('git', ['config', '--local', 'url.file:///tmp/.insteadOf', 'https://github.com/'], { cwd: repo });
  await assert.rejects(rejectExecutableGitConfiguration(repo), /publishing refused/);
});
