const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

async function freePort() {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

test('authenticated Orbit imports remain isolated by workspace', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'startupforge-import-test-'));
  const port = await freePort();
  const token = 'integration-test-service-token';
  const feedbackPath = join(directory, 'feedback.csv');
  writeFileSync(feedbackPath, 'ID,Message,Priority,Urgency\nfeedback-1,"Button, checkout is broken",high,critical\n');
  const child = spawn(process.execPath, ['dist/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env, PORT: String(port), STARTUPFORGE_DB_PATH: join(directory, 'test.db'),
      STARTUPFORGE_SERVICE_TOKEN: token, FEEDBACK_CSV_PATH: feedbackPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  t.after(async () => {
    if (child.exitCode === null) child.kill('SIGTERM');
    await new Promise((resolve) => child.exitCode === null ? child.once('exit', resolve) : resolve());
    rmSync(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ }
    if (child.exitCode !== null) throw new Error(`StartupForge exited during test: ${stderr}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const feedback = await (await fetch(`${base}/api/feedback`)).json();
  assert.equal(feedback.items.find((item) => item.externalId === 'feedback-1').message, 'Button, checkout is broken');
  const importProfile = async (externalWorkspaceId, businessName, authorization = `Bearer ${token}`) => {
    const response = await fetch(`${base}/api/import/business`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: authorization },
      body: JSON.stringify({ externalWorkspaceId, businessName, brandColors: [] }),
    });
    return { status: response.status, body: await response.json() };
  };

  assert.equal((await importProfile('workspace-a', 'Unauthorized', 'Bearer wrong')).status, 401);
  const firstA = await importProfile('workspace-a', 'Workspace A');
  const firstB = await importProfile('workspace-b', 'Workspace B');
  const secondA = await importProfile('workspace-a', 'Workspace A updated');
  assert.equal(firstA.status, 200);
  assert.equal(firstB.status, 200);
  assert.notEqual(firstA.body.id, firstB.body.id);
  assert.equal(secondA.body.id, firstA.body.id);
  assert.equal(secondA.body.updated, true);
  const storedA = await (await fetch(`${base}/api/business/${firstA.body.id}`)).json();
  const storedB = await (await fetch(`${base}/api/business/${firstB.body.id}`)).json();
  assert.equal(storedA.business.business_name, 'Workspace A updated');
  assert.equal(storedB.business.business_name, 'Workspace B');
});
