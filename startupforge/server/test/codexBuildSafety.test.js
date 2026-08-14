const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createSnapshot, generatedProjectsRoot, rollbackSnapshot, validateProjectPath } = require('../dist/services/antigravityService.js');

test('project paths are contained beneath generated MVP root', () => {
  const safe = path.join(generatedProjectsRoot(), 'safe-project');
  assert.equal(validateProjectPath(safe), safe);
  assert.throws(() => validateProjectPath(path.resolve('/tmp/outside-orbit')), /inside the configured/);
  assert.throws(() => validateProjectPath(generatedProjectsRoot()), /root-level/);
});

test('snapshot rollback restores files without touching dependencies', () => {
  const root = generatedProjectsRoot();
  fs.mkdirSync(root, { recursive: true });
  const project = fs.mkdtempSync(path.join(root, 'snapshot-test-'));
  try {
    fs.writeFileSync(path.join(project, 'app.txt'), 'before');
    const snapshotId = createSnapshot(project);
    fs.writeFileSync(path.join(project, 'app.txt'), 'after');
    rollbackSnapshot(project, snapshotId);
    assert.equal(fs.readFileSync(path.join(project, 'app.txt'), 'utf8'), 'before');
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(path.join(root, '.orbit-snapshots', path.basename(project)), { recursive: true, force: true });
  }
});
