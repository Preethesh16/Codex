import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const uploadRoot = mkdtempSync(join(tmpdir(), 'orbit-media-test-'));
process.env.ORBIT_UPLOAD_DIR = uploadRoot;
const { offlineStoryboard, registerCreative } = await import('../dist/creative.js');

test('offline media fallback is complete and deterministic', () => {
  const first = offlineStoryboard('Orbit Test');
  const second = offlineStoryboard('Orbit Test');
  assert.deepEqual(first, second);
  assert.equal(first.shots.length, 4);
  assert.equal(first.shots.reduce((seconds, shot) => seconds + shot.durationSec, 0), 8);
  assert.match(first.shots[1].onScreenText, /Orbit Test/);
});

test('mock media API persists image, edit, voice, video, and quota fallback jobs', async (t) => {
  const onePixel = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');
  writeFileSync(join(uploadRoot, 'media-jobs.json'), JSON.stringify([{
    id: 'interrupted-job', workspaceId: 'media-test', kind: 'video', provider: 'openai', model: 'sora-2',
    status: 'running', outputPaths: [], traceId: 'trace-interrupted', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }]));
  let videoMode = 'complete';
  const fakeClient = {
    images: {
      generate: async () => ({ data: [{ b64_json: onePixel }] }),
      edit: async () => ({ data: [{ b64_json: onePixel }] }),
    },
    audio: { speech: { create: async () => ({ arrayBuffer: async () => Buffer.from('mock-mp3') }) } },
    videos: {
      create: async () => {
        if (videoMode === 'quota') throw Object.assign(new Error('quota exceeded'), { status: 429, code: 'rate_limit_exceeded' });
        return { id: 'video-job-1', status: 'queued' };
      },
      retrieve: async () => ({ id: 'video-job-1', status: 'completed' }),
      downloadContent: async () => ({ arrayBuffer: async () => Buffer.from('mock-mp4') }),
    },
  };
  const app = express();
  app.use(express.json({ limit: '25mb' }));
  registerCreative(app, {
    getContext: () => ({ companyName: 'Orbit Test' }),
    getSharedContext: () => 'privacy filtered context',
    logAgentAction: () => undefined,
  }, { client: () => fakeClient, sleep: async () => undefined, videoPollAttempts: 2 });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => { server.close(); rmSync(uploadRoot, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (path, body) => {
    const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { response, body: await response.json() };
  };

  const recoveredJobs = await (await fetch(`${base}/api/media/jobs?workspaceId=media-test`)).json();
  const recovered = recoveredJobs.find((job) => job.id === 'interrupted-job');
  assert.equal(recovered.status, 'fallback');
  assert.equal(recovered.error.code, 'server_restart');
  const waitForJob = async (jobId) => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const response = await fetch(`${base}/api/media/jobs/${jobId}`);
      const job = await response.json();
      if (['completed', 'failed', 'fallback'].includes(job.status)) return job;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`media job ${jobId} did not finish`);
  };

  const poster = await post('/api/marketing/poster', { prompt: 'Launch poster', count: 1, workspaceId: 'media-test' });
  assert.equal(poster.response.status, 200);
  assert.ok(existsSync(join(uploadRoot, poster.body.options[0].url.replace('/generated/', 'generated/'))));

  const edit = await post('/api/marketing/poster/edit', { image: `data:image/png;base64,${onePixel}`, prompt: 'Use blue', workspaceId: 'media-test' });
  assert.equal(edit.response.status, 200);
  assert.ok(existsSync(join(uploadRoot, edit.body.url.replace('/generated/', 'generated/'))));

  const voice = await post('/api/creative/voiceover', { text: 'Meet Orbit', workspaceId: 'media-test' });
  assert.equal(voice.response.status, 200);
  assert.equal(readFileSync(join(uploadRoot, voice.body.url.replace('/generated/', 'generated/')), 'utf8'), 'mock-mp3');

  const video = await post('/api/marketing/adkit', { product: 'Founder workspace', workspaceId: 'media-test' });
  assert.equal(video.response.status, 202);
  const completed = await waitForJob(video.body.jobId);
  assert.equal(completed.status, 'completed');
  assert.equal(completed.providerJobId, 'video-job-1');
  assert.ok(existsSync(join(uploadRoot, completed.outputPaths[0].replace('/generated/', 'generated/'))));

  videoMode = 'quota';
  const fallbackResponse = await post('/api/marketing/adkit', { product: 'Offline demo', workspaceId: 'media-test' });
  const fallback = await waitForJob(fallbackResponse.body.jobId);
  assert.equal(fallback.status, 'fallback');
  assert.equal(fallback.kind, 'storyboard');
  assert.equal(fallback.error.code, 'rate_limit_exceeded');
  assert.equal(fallback.error.retryable, true);
  assert.equal(fallback.output.stills.length, 3);
  assert.equal(fallback.output.storyboard.reduce((sum, shot) => sum + shot.durationSec, 0), 8);
});
