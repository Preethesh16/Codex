const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  db, createBuildJob, updateBuildJob, getBuildJob, appendBuildEvent, listBuildEvents,
} = require('../dist/db/database.js');

test('HTTP build jobs and replayable events persist in SQLite', () => {
  const business = db.prepare('INSERT INTO business_profiles (business_name) VALUES (?)').run(`test-${Date.now()}`);
  const build = db.prepare(`INSERT INTO mvp_builds (business_id, status, project_path) VALUES (?, 'running', ?)`).run(business.lastInsertRowid, '/tmp/test-project');
  const jobId = crypto.randomUUID();
  try {
    createBuildJob({ jobId, buildId: Number(build.lastInsertRowid), projectPath: '/tmp/test-project' });
    const eventId = appendBuildEvent(jobId, 'codex:start', { buildId: Number(build.lastInsertRowid) });
    updateBuildJob(jobId, 'completed', { success: true });
    const job = getBuildJob(jobId);
    assert.equal(job.status, 'completed');
    assert.deepEqual(JSON.parse(job.result_json), { success: true });
    const events = listBuildEvents(jobId, eventId - 1);
    assert.equal(events.length, 1);
    assert.equal(events[0].event_name, 'codex:start');
  } finally {
    db.prepare('DELETE FROM build_events WHERE job_id = ?').run(jobId);
    db.prepare('DELETE FROM build_jobs WHERE job_id = ?').run(jobId);
    db.prepare('DELETE FROM mvp_builds WHERE id = ?').run(build.lastInsertRowid);
    db.prepare('DELETE FROM business_profiles WHERE id = ?').run(business.lastInsertRowid);
  }
});
