import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

import {
  db, listFeedback, getFeedback, createBuildJob, updateBuildJob, getBuildJob,
  appendBuildEvent, listBuildEvents, type BuildJobStatus,
} from './db/database';
import {
  getGithubAccount, saveGithubAccount, clearGithubAccount, listProjects
} from './db/database';
import { compileBusinessContext } from './services/contextService';
import { runCodexBuild, sendFollowUpCommand, rollbackSnapshot, validateProjectPath, type EventSink } from './services/antigravityService';
import { deployMVP } from './services/deployService';
import {
  importFromExcel, syncToExcel, ensureWorkbookExists, getWorkbookPath,
  mapFeedbackRow, computeScore
} from './services/feedbackService';
import {
  isOAuthConfigured, buildAuthorizeUrl, exchangeCodeForToken, fetchGithubUser, publishToGithub
} from './services/githubService';
import crypto from 'crypto';
import OpenAI, { toFile } from 'openai';
import { requireExplicitApproval } from './services/actionApproval';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 1e8 // 100MB for large context
});

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '50mb' }));

const requestBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(limit: number, windowMs: number): express.RequestHandler {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const bucket = requestBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) requestBuckets.set(key, { count: 1, resetAt: now + windowMs });
    else if (++bucket.count > limit) return res.status(429).json({ error: 'Too many requests; retry later.' });
    next();
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'startupforge', builder: 'codex-sdk' });
});

const buildEventSubscribers = new Map<string, Set<express.Response>>();

function emitContext(sink: EventSink, phase: 'start' | 'progress' | 'complete', payload: Record<string, unknown>): void {
  sink.emit(`context:${phase}`, payload);
  sink.emit(`gemma:${phase}`, payload); // temporary client compatibility alias
}

function writeSse(response: express.Response, id: number | undefined, event: string, data: unknown): void {
  if (id !== undefined) response.write(`id: ${id}\n`);
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcastJobStatus(jobId: string, status: BuildJobStatus, error = ''): void {
  const subscribers = buildEventSubscribers.get(jobId);
  if (!subscribers) return;
  for (const response of subscribers) {
    writeSse(response, undefined, 'job:status', { status, error });
    if (status === 'completed' || status === 'failed') response.end();
  }
  if (status === 'completed' || status === 'failed') buildEventSubscribers.delete(jobId);
}

function jobSink(jobId: string): EventSink {
  return {
    emit(event, data) {
      const id = appendBuildEvent(jobId, event, data);
      for (const response of buildEventSubscribers.get(jobId) || []) writeSse(response, id, event, data);
    }
  };
}

app.post('/api/builds', rateLimit(10, 60_000), async (req, res) => {
  const { businessId, command, existingProjectPath } = req.body as { businessId?: number; command?: string; existingProjectPath?: string };
  if (!businessId || !command?.trim()) return res.status(400).json({ error: 'businessId and command are required' });
  const business = db.prepare('SELECT id FROM business_profiles WHERE id = ?').get(businessId);
  if (!business) return res.status(404).json({ error: 'business profile not found' });
  let projectPath: string;
  try {
    projectPath = validateProjectPath(existingProjectPath || path.join(process.cwd(), process.env.GENERATED_MVPS_PATH || '../generated-mvps', `mvp-${Date.now()}`));
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
  const buildRow = db.prepare(`INSERT INTO mvp_builds (business_id, status, command_used, project_path) VALUES (?, 'running', ?, ?)`)
    .run(businessId, command, projectPath);
  const jobId = crypto.randomUUID();
  const buildId = Number(buildRow.lastInsertRowid);
  createBuildJob({ jobId, buildId, projectPath });
  res.status(202).json({ jobId, buildId, status: 'queued', projectPath });
  void (async () => {
    updateBuildJob(jobId, 'running');
    broadcastJobStatus(jobId, 'running');
    try {
      const context = await compileBusinessContext(businessId);
      const result = await runCodexBuild({ businessContext: context, command, projectPath, socket: jobSink(jobId), buildId });
      const status: BuildJobStatus = result.success ? 'completed' : 'failed';
      updateBuildJob(jobId, status, result, result.error || '');
      broadcastJobStatus(jobId, status, result.error || '');
      db.prepare('UPDATE mvp_builds SET status = ?, files_created = ? WHERE id = ?')
        .run(result.success ? 'built' : 'failed', JSON.stringify(result.filesCreated), buildId);
    } catch (error: any) {
      updateBuildJob(jobId, 'failed', undefined, error.message);
      broadcastJobStatus(jobId, 'failed', error.message);
      db.prepare('UPDATE mvp_builds SET status = ? WHERE id = ?').run('failed', buildId);
    }
  })();
});

app.get('/api/builds/:jobId', (req, res) => {
  const job = getBuildJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'build job not found' });
  res.json({
    jobId: job.job_id, buildId: job.build_id, status: job.status,
    projectPath: job.project_path, result: job.result_json ? JSON.parse(job.result_json) : undefined,
    error: job.error || undefined, createdAt: job.created_at, updatedAt: job.updated_at,
  });
});

app.get('/api/builds/:jobId/events', (req, res) => {
  const jobId = req.params.jobId;
  const job = getBuildJob(jobId);
  if (!job) return res.status(404).json({ error: 'build job not found' });
  const headerId = req.headers['last-event-id'];
  const after = Number(req.query.after || (Array.isArray(headerId) ? headerId[0] : headerId) || 0);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  for (const event of listBuildEvents(jobId, after)) {
    writeSse(res, event.id, event.event_name, JSON.parse(event.data_json));
  }
  writeSse(res, undefined, 'job:status', { status: job.status, error: job.error || undefined });
  if (job.status === 'completed' || job.status === 'failed') return res.end();
  const subscribers = buildEventSubscribers.get(jobId) || new Set<express.Response>();
  subscribers.add(res);
  buildEventSubscribers.set(jobId, subscribers);
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    subscribers.delete(res);
    if (!subscribers.size) buildEventSubscribers.delete(jobId);
  });
});

app.post('/api/builds/:jobId/rollback', (req, res) => {
  const job = getBuildJob(req.params.jobId);
  const snapshotId = String(req.body.snapshotId || '');
  if (!job) return res.status(404).json({ error: 'build job not found' });
  try {
    rollbackSnapshot(job.project_path, snapshotId);
    res.json({ success: true, projectPath: job.project_path, snapshotId });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ─── BUSINESS PROFILE ROUTES ───────────────────────────────────────────────

// Create or update business profile
app.post('/api/business', (req, res) => {
  const {
    businessName, founderName, industry, stage, location,
    problemStatement, solution, mission, vision, uniqueValueProp,
    productType, revenueModel, targetMarket, marketSize,
    preferredFrontend, preferredBackend, preferredDb, preferredCloud,
    designStyle, brandColors, githubRepoUrl, hasExistingCode
  } = req.body;

  const existing = db.prepare('SELECT id FROM business_profiles ORDER BY id DESC LIMIT 1').get() as any;

  if (existing) {
    db.prepare(`
      UPDATE business_profiles SET
        business_name=?, founder_name=?, industry=?, stage=?, location=?,
        problem_statement=?, solution=?, mission=?, vision=?, unique_value_prop=?,
        product_type=?, revenue_model=?, target_market=?, market_size=?,
        preferred_frontend=?, preferred_backend=?, preferred_db=?, preferred_cloud=?,
        design_style=?, brand_colors=?, github_repo_url=?, has_existing_code=?,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      businessName, founderName, industry, stage, location,
      problemStatement, solution, mission, vision, uniqueValueProp,
      productType, revenueModel, targetMarket, marketSize,
      preferredFrontend, preferredBackend, preferredDb, preferredCloud,
      designStyle, JSON.stringify(brandColors), githubRepoUrl, hasExistingCode ? 1 : 0,
      existing.id
    );
    return res.json({ id: existing.id, updated: true });
  } else {
    const result = db.prepare(`
      INSERT INTO business_profiles (
        business_name, founder_name, industry, stage, location,
        problem_statement, solution, mission, vision, unique_value_prop,
        product_type, revenue_model, target_market, market_size,
        preferred_frontend, preferred_backend, preferred_db, preferred_cloud,
        design_style, brand_colors, github_repo_url, has_existing_code
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      businessName, founderName, industry, stage, location,
      problemStatement, solution, mission, vision, uniqueValueProp,
      productType, revenueModel, targetMarket, marketSize,
      preferredFrontend, preferredBackend, preferredDb, preferredCloud,
      designStyle, JSON.stringify(brandColors), githubRepoUrl, hasExistingCode ? 1 : 0
    );
    return res.json({ id: result.lastInsertRowid, created: true });
  }
});

// Get business profile
app.get('/api/business/:id', (req, res) => {
  const business = db.prepare('SELECT * FROM business_profiles WHERE id = ?').get(req.params.id);
  const team = db.prepare('SELECT * FROM team_members WHERE business_id = ?').all(req.params.id);
  const features = db.prepare('SELECT * FROM core_features WHERE business_id = ? ORDER BY priority').all(req.params.id);
  const personas = db.prepare('SELECT * FROM user_personas WHERE business_id = ?').all(req.params.id);
  res.json({ business, team, features, personas });
});

// Team member endpoints
app.post('/api/business/:id/team', (req, res) => {
  const { name, role, skills, equity, linkedin, responsibilities } = req.body;
  const result = db.prepare(`
    INSERT INTO team_members (business_id, name, role, skills, equity, linkedin, responsibilities)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.id, name, role, JSON.stringify(skills || []), equity || 0, linkedin || '', JSON.stringify(responsibilities || []));
  res.json({ id: result.lastInsertRowid });
});

app.delete('/api/business/:id/team/:memberId', (req, res) => {
  db.prepare('DELETE FROM team_members WHERE id = ? AND business_id = ?').run(req.params.memberId, req.params.id);
  res.json({ deleted: true });
});

// Feature endpoints
app.post('/api/business/:id/features', (req, res) => {
  const { name, description, priority, isMvp } = req.body;
  const result = db.prepare(`
    INSERT INTO core_features (business_id, name, description, priority, is_mvp)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.params.id, name, description || '', priority || 1, isMvp ? 1 : 0);
  res.json({ id: result.lastInsertRowid });
});

app.delete('/api/business/:id/features/:featureId', (req, res) => {
  db.prepare('DELETE FROM core_features WHERE id = ? AND business_id = ?').run(req.params.featureId, req.params.id);
  res.json({ deleted: true });
});

// Compile a deterministic, privacy-filtered local context document.
app.get('/api/business/:id/context', async (req, res) => {
  try {
    const context = await compileBusinessContext(Number(req.params.id));
    res.json({ context });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get builds for a business
app.get('/api/business/:id/builds', (req, res) => {
  const builds = db.prepare('SELECT * FROM mvp_builds WHERE business_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json({ builds });
});

// ─── FEEDBACK / FIX CENTER ROUTES ──────────────────────────────────────────

// List all feedback, ranked by status + priority x urgency score
app.get('/api/feedback', (_req, res) => {
  const items = (listFeedback() as any[]).map(mapFeedbackRow);
  const stats = {
    total: items.length,
    open: items.filter((i) => i.status === 'open').length,
    fixing: items.filter((i) => i.status === 'fixing').length,
    pending: items.filter((i) => i.status === 'pending_approval').length,
    completed: items.filter((i) => i.status === 'completed').length,
    rejected: items.filter((i) => i.status === 'rejected').length
  };
  res.json({ items, stats, workbook: getWorkbookPath() });
});

// Add a single feedback item (simulates a Google Form / web form submission)
app.post('/api/feedback', (req, res) => {
  const {
    userName = '', email = '', projectPath = '', category = 'bug',
    message, priority = 'medium', urgency = 'normal', source = 'form'
  } = req.body;
  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: 'message is required' });
  }
  const score = computeScore(priority, urgency);
  const externalId = `manual|${email}|${Date.now()}`;
  const result = db.prepare(`
    INSERT INTO feedback
      (external_id, source, user_name, email, project_path, category, message,
       priority, urgency, score, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
  `).run(externalId, source, userName, email, projectPath, category, message,
    priority, urgency, score);
  const item = mapFeedbackRow(getFeedback(result.lastInsertRowid as number));
  io.emit('feedback:updated', { item });
  res.json({ id: result.lastInsertRowid, item });
});

// Re-import from the Excel workbook (Google Form export)
app.post('/api/feedback/import', (_req, res) => {
  try {
    const result = importFromExcel();
    const items = (listFeedback() as any[]).map(mapFeedbackRow);
    io.emit('feedback:refreshed', { items });
    res.json({ ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Write current statuses back to the Excel workbook
app.post('/api/feedback/sync', (_req, res) => {
  try {
    const result = syncToExcel();
    res.json({ ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── PROJECT LIBRARY ────────────────────────────────────────────────────────

// List every generated MVP (one row per unique project folder), newest first
app.get('/api/projects', (_req, res) => {
  const rows = listProjects() as any[];
  const projects = rows.map((r) => ({
    buildId: r.build_id,
    businessId: r.business_id,
    businessName: r.business_name,
    industry: r.industry,
    stage: r.stage,
    status: r.status,
    projectPath: r.project_path,
    deployUrl: r.deploy_url,
    githubUrl: r.github_url,
    githubPagesUrl: r.github_pages_url,
    filesCreated: JSON.parse(r.files_created || '[]'),
    commandUsed: r.command_used,
    createdAt: r.created_at
  }));
  res.json({ projects });
});

// ─── GITHUB CONNECT / PUBLISH ───────────────────────────────────────────────

const GITHUB_STATE_SECRET = crypto.randomBytes(16).toString('hex');

// Where to send the user after the GitHub OAuth callback
function githubCallbackUrl(req: express.Request): string {
  return process.env.GITHUB_CALLBACK_URL || `${req.protocol}://${req.get('host')}/api/github/callback`;
}

app.get('/api/github/status', (_req, res) => {
  const account = getGithubAccount() as any;
  res.json({
    connected: !!account,
    username: account?.username || null,
    avatarUrl: account?.avatar_url || null,
    oauthConfigured: isOAuthConfigured()
  });
});

// Step 1: client is redirected here, which redirects to GitHub's authorize page
app.get('/api/github/auth-url', (req, res) => {
  if (!isOAuthConfigured()) {
    return res.status(400).json({ error: 'GitHub OAuth is not configured. Set GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET, or use "Connect with token" instead.' });
  }
  const url = buildAuthorizeUrl(githubCallbackUrl(req), GITHUB_STATE_SECRET);
  res.json({ url });
});

// Step 2: GitHub redirects back here with ?code=...
app.get('/api/github/callback', async (req, res) => {
  const { code } = req.query as { code?: string };
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  if (!code) return res.redirect(`${clientUrl}/dashboard?github=error`);

  try {
    const token = await exchangeCodeForToken(code, githubCallbackUrl(req));
    const user = await fetchGithubUser(token);
    saveGithubAccount({ username: user.username, avatarUrl: user.avatarUrl, accessToken: token });
    res.redirect(`${clientUrl}/dashboard?github=connected`);
  } catch (error: any) {
    console.error('GitHub OAuth callback failed:', error.message);
    res.redirect(`${clientUrl}/dashboard?github=error`);
  }
});

// Fallback for users who don't want to register an OAuth App: paste a PAT.
app.post('/api/github/token', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token is required' });
  try {
    const user = await fetchGithubUser(token);
    saveGithubAccount({ username: user.username, avatarUrl: user.avatarUrl, accessToken: token });
    res.json({ connected: true, username: user.username, avatarUrl: user.avatarUrl });
  } catch (error: any) {
    res.status(401).json({ error: 'Invalid GitHub token: ' + (error.response?.data?.message || error.message) });
  }
});

app.post('/api/github/disconnect', (_req, res) => {
  clearGithubAccount();
  res.json({ disconnected: true });
});

// ─── VOICE — OpenAI speech-to-text proxy ──────────────────────────────────
app.post('/api/voice/transcribe', rateLimit(20, 60_000), async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Voice transcription is not configured. Set OPENAI_API_KEY in server/.env.' });
  }

  const { audio, mimeType, language } = req.body as {
    audio?: string; mimeType?: string; language?: string;
  };
  if (!audio) return res.status(400).json({ error: 'audio (base64) is required' });

  try {
    // Strip a possible data-URL prefix, then decode to a binary buffer.
    const b64 = audio.includes(',') ? audio.split(',')[1] : audio;
    const buffer = Buffer.from(b64, 'base64');

    const type = mimeType || 'audio/wav';
    const ext = type.includes('wav') ? 'wav' : type.includes('mp3') ? 'mp3' : type.includes('webm') ? 'webm' : 'wav';
    const client = new OpenAI({ apiKey, timeout: 60_000, maxRetries: 2 });
    const result = await client.audio.transcriptions.create({
      file: await toFile(buffer, `command.${ext}`, { type }),
      model: process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-transcribe',
      ...(language && language !== 'unknown' ? { language } : {}),
    });
    res.json({ transcript: result.text, languageCode: language || null });
  } catch (error: any) {
    console.error('Voice transcription failed:', error.message);
    res.status(500).json({ error: error.message || 'Transcription failed' });
  }
});

// ─── SOCKET.IO — MAIN ORCHESTRATION ───────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  /**
   * MAIN EVENT: User clicks "CREATE MVP" or sends a command
   * This is the full pipeline: local privacy context → Codex → optional approved deploy
   */
  socket.on('build:start', async (data: {
    businessId: number;
    command: string;
    autoDeploy: boolean;
    existingProjectPath?: string;
  }) => {
    const { businessId, command, autoDeploy, existingProjectPath } = data;

    // Create build record
    const buildResult = db.prepare(`
      INSERT INTO mvp_builds (business_id, status, command_used)
      VALUES (?, 'running', ?)
    `).run(businessId, command);
    const buildId = buildResult.lastInsertRowid as number;

    socket.emit('build:id', { buildId });

    try {
      // STEP 1: Compile business context directly from the profile
      emitContext(socket, 'start', {
        message: '📋 Compiling your business profile...',
        buildId
      });

      const context = await compileBusinessContext(businessId, (chars) => {
        emitContext(socket, 'progress', { chars, buildId });
      });

      emitContext(socket, 'complete', {
        message: '✅ Privacy-filtered context compiled! Sending to Codex...',
        contextLength: context.length,
        buildId
      });

      // STEP 2: Determine project path
      const projectName = `mvp-${Date.now()}`;
      const projectPath = existingProjectPath || path.join(
        process.cwd(),
        process.env.GENERATED_MVPS_PATH || '../generated-mvps',
        projectName
      );

      db.prepare('UPDATE mvp_builds SET project_path = ? WHERE id = ?').run(projectPath, buildId);

      // STEP 3: Codex builds and repairs the MVP in a contained directory.
      const buildOutput = await runCodexBuild({
        businessContext: context,
        command,
        projectPath,
        socket,
        buildId,
        repoUrl: existingProjectPath ?
          (db.prepare('SELECT github_repo_url FROM business_profiles WHERE id = ?').get(businessId) as any)?.github_repo_url
          : undefined
      });

      if (!buildOutput.success) {
        db.prepare('UPDATE mvp_builds SET status = ? WHERE id = ?').run('failed', buildId);
        return;
      }

      // Update build record
      db.prepare(`
        UPDATE mvp_builds SET
          status = 'built',
          files_created = ?
        WHERE id = ?
      `).run(JSON.stringify(buildOutput.filesCreated), buildId);

      if (autoDeploy) socket.emit('approval:required', { buildId, action: 'deploy', message: 'Auto-deploy is disabled. Review the build and click Deploy explicitly.' });
      socket.emit('build:done', {
        buildId,
        projectPath,
        filesCreated: buildOutput.filesCreated,
        message: `✅ Files written to ${projectPath}. Review the diff, then click Deploy to approve launch.`
      });

    } catch (error: any) {
      console.error('Build pipeline error:', error);
      db.prepare('UPDATE mvp_builds SET status = ? WHERE id = ?').run('failed', buildId);
      socket.emit('build:error', { message: error.message, buildId });
    }
  });

  /**
   * Follow-up command: Add feature, fix bug, improve UI, etc.
   */
  socket.on('build:followup', async (data: {
    businessId: number;
    command: string;
    projectPath: string;
  }) => {
    const { businessId, command, projectPath } = data;

    const buildResult = db.prepare(`
      INSERT INTO mvp_builds (business_id, status, command_used, project_path)
      VALUES (?, 'running', ?, ?)
    `).run(businessId, command, projectPath);
    const buildId = buildResult.lastInsertRowid as number;

    socket.emit('build:id', { buildId });

    try {
      emitContext(socket, 'start', {
        message: '📋 Compiling your business profile...',
        buildId
      });

      const context = await compileBusinessContext(businessId, (chars) => {
        emitContext(socket, 'progress', { chars, buildId });
      });

      emitContext(socket, 'complete', {
        message: '✅ Privacy-filtered context compiled! Sending to Codex...',
        contextLength: context.length,
        buildId
      });

      const result = await sendFollowUpCommand({
        businessContext: context,
        command,
        projectPath,
        socket,
        buildId
      });

      db.prepare(`
        UPDATE mvp_builds SET status = ?, files_created = ? WHERE id = ?
      `).run(result.success ? 'built' : 'failed', JSON.stringify(result.filesCreated), buildId);

      socket.emit('build:done', {
        buildId,
        projectPath,
        filesCreated: result.filesCreated,
        message: result.success
          ? `✅ Updated ${result.filesCreated.length} file(s) in ${projectPath}.`
          : `❌ Follow-up build failed: ${result.error}`
      });
    } catch (error: any) {
      console.error('Follow-up build error:', error);
      db.prepare('UPDATE mvp_builds SET status = ? WHERE id = ?').run('failed', buildId);
      socket.emit('build:error', { message: error.message, buildId });
    }
  });

  /**
   * Deploy an already-built project
   */
  socket.on('deploy:start', async (data: { projectPath: string; buildId: number; approved?: boolean }) => {
    try {
      requireExplicitApproval('Deployment', data.approved);
      const { url, isLocal } = await deployMVP(data.projectPath, socket);
      db.prepare('UPDATE mvp_builds SET status = ?, deploy_url = ? WHERE id = ?')
        .run('deployed', url, data.buildId);
      socket.emit('deploy:url', { url, isLocal });
    } catch (error: any) {
      socket.emit('deploy:error', { message: error.message, buildId: data.buildId });
    }
  });

  // ─── FEEDBACK: AUTONOMOUS FIX WORKFLOW ─────────────────────────────────────

  const emitFeedback = (id: number) => {
    const item = mapFeedbackRow(getFeedback(id));
    io.emit('feedback:updated', { item });
    return item;
  };

  /**
   * Autonomous fix: takes a feedback request, resolves a target project,
   * and runs the multi-agent pipeline (Planner → Builders → Critic → Fixer)
   * with the feedback text as the objective. On success the item moves to
   * `pending_approval` (admin must approve before it is ticked complete).
   */
  socket.on('feedback:fix', async (data: { feedbackId: number; businessId?: number; projectPath?: string }) => {
    const fb = getFeedback(data.feedbackId) as any;
    if (!fb) {
      socket.emit('feedback:error', { feedbackId: data.feedbackId, message: 'Feedback not found' });
      return;
    }
    if (fb.status === 'fixing') return; // already in progress

    // Resolve a business + a project path to fix.
    const business =
      (data.businessId && db.prepare('SELECT id FROM business_profiles WHERE id = ?').get(data.businessId) as any) ||
      (db.prepare('SELECT id FROM business_profiles ORDER BY id DESC LIMIT 1').get() as any);

    if (!business) {
      socket.emit('feedback:error', { feedbackId: fb.id, message: 'No business profile exists yet. Complete onboarding first.' });
      return;
    }

    const latestBuild = db.prepare(
      'SELECT project_path FROM mvp_builds WHERE business_id = ? AND project_path != \'\' ORDER BY created_at DESC LIMIT 1'
    ).get(business.id) as any;

    const projectPath = data.projectPath || fb.project_path || latestBuild?.project_path;
    if (!projectPath) {
      socket.emit('feedback:error', { feedbackId: fb.id, message: 'No generated project found to fix. Build an MVP first.' });
      return;
    }

    db.prepare('UPDATE feedback SET status = ?, project_path = ? WHERE id = ?')
      .run('fixing', projectPath, fb.id);
    emitFeedback(fb.id);

    const buildRow = db.prepare(`
      INSERT INTO mvp_builds (business_id, status, command_used, project_path)
      VALUES (?, 'running', ?, ?)
    `).run(business.id, `[FEEDBACK #${fb.id}] ${fb.message}`, projectPath);
    const buildId = buildRow.lastInsertRowid as number;

    db.prepare('UPDATE feedback SET build_id = ? WHERE id = ?').run(buildId, fb.id);
    socket.emit('feedback:fix_started', { feedbackId: fb.id, buildId, projectPath });

    try {
      const context = await compileBusinessContext(business.id);

      const command = `A user submitted this ${fb.category} report (priority ${fb.priority}, urgency ${fb.urgency}):\n"${fb.message}"\n\nDiagnose the root cause in the existing project and fix it. Only output files that must be created or modified.`;

      const result = await sendFollowUpCommand({
        businessContext: context,
        command,
        projectPath,
        socket,
        buildId
      });

      db.prepare('UPDATE mvp_builds SET status = ?, files_created = ? WHERE id = ?')
        .run(result.success ? 'built' : 'failed', JSON.stringify(result.filesCreated), buildId);

      if (result.success) {
        const summary = `Resolved by the agent team — ${result.filesCreated.length} file(s) updated.`;
        db.prepare(`
          UPDATE feedback SET status = 'pending_approval', files_changed = ?, fix_summary = ?, fixed_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(JSON.stringify(result.filesCreated), summary, fb.id);
        emitFeedback(fb.id);
        try { syncToExcel(); } catch { /* non-fatal */ }
        socket.emit('feedback:fix_complete', { feedbackId: fb.id, filesChanged: result.filesCreated });
      } else {
        db.prepare('UPDATE feedback SET status = ? WHERE id = ?').run('open', fb.id);
        emitFeedback(fb.id);
        socket.emit('feedback:error', { feedbackId: fb.id, message: result.error || 'Fix failed' });
      }
    } catch (error: any) {
      console.error('Feedback fix error:', error);
      db.prepare('UPDATE mvp_builds SET status = ? WHERE id = ?').run('failed', buildId);
      db.prepare('UPDATE feedback SET status = ? WHERE id = ?').run('open', fb.id);
      emitFeedback(fb.id);
      socket.emit('feedback:error', { feedbackId: fb.id, message: error.message });
    }
  });

  /** Admin approves a completed fix → ticked + statuses written back to Excel. */
  socket.on('feedback:approve', (data: { feedbackId: number; autoDeploy?: boolean }) => {
    const fb = getFeedback(data.feedbackId) as any;
    if (!fb) return;
    db.prepare(`UPDATE feedback SET status = 'completed', approved_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(fb.id);
    const item = mapFeedbackRow(getFeedback(fb.id));
    io.emit('feedback:updated', { item });
    try { syncToExcel(); } catch { /* non-fatal */ }

    if (data.autoDeploy && fb.project_path) {
      deployMVP(fb.project_path, socket)
        .then(({ url, isLocal }) => socket.emit('deploy:url', { url, isLocal }))
        .catch((e) => socket.emit('deploy:error', { message: e.message }));
    }
  });

  /** Admin rejects a fix → back to the open queue for another attempt. */
  socket.on('feedback:reject', (data: { feedbackId: number }) => {
    const fb = getFeedback(data.feedbackId) as any;
    if (!fb) return;
    db.prepare(`UPDATE feedback SET status = 'open', build_id = NULL WHERE id = ?`).run(fb.id);
    const item = mapFeedbackRow(getFeedback(fb.id));
    io.emit('feedback:updated', { item });
    try { syncToExcel(); } catch { /* non-fatal */ }
  });

  // ─── GITHUB: PUSH + PUBLISH ──────────────────────────────────────────────

  socket.on('github:publish', async (data: {
    projectPath: string;
    repoName: string;
    isPrivate?: boolean;
    buildId?: number;
    approved?: boolean;
  }) => {
    try {
      requireExplicitApproval('GitHub publishing', data.approved);
    } catch (error: any) {
      socket.emit('github:error', { message: error.message });
      return;
    }
    const account = getGithubAccount() as any;
    if (!account) {
      socket.emit('github:error', { message: 'Connect your GitHub account first.' });
      return;
    }
    if (!data.projectPath || !fs.existsSync(data.projectPath)) {
      socket.emit('github:error', { message: 'No project to publish — build an MVP first.' });
      return;
    }

    const repoName = (data.repoName || path.basename(data.projectPath)).replace(/[^a-zA-Z0-9._-]/g, '-');

    try {
      socket.emit('github:start', { message: `🐙 Publishing "${repoName}" to GitHub...` });
      const result = await publishToGithub({
        token: account.access_token,
        projectPath: data.projectPath,
        repoName,
        isPrivate: !!data.isPrivate,
        socket
      });

      if (data.buildId) {
        db.prepare('UPDATE mvp_builds SET github_url = ?, github_pages_url = ? WHERE id = ?')
          .run(result.repoUrl, result.pagesUrl, data.buildId);
      }

      socket.emit('github:complete', {
        repoUrl: result.repoUrl,
        pagesUrl: result.pagesUrl,
        message: `🎉 Published to GitHub! Repo: ${result.repoUrl}${result.pagesUrl ? ` · Live: ${result.pagesUrl}` : ''}`
      });
    } catch (error: any) {
      console.error('GitHub publish error:', error);
      socket.emit('github:error', { message: error.message });
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// Seed the sample feedback workbook and import it on boot so the Fix Center
// has data immediately (before any Google Form is connected).
try {
  ensureWorkbookExists();
  const r = importFromExcel();
  console.log(`📗 Feedback loaded from Excel — ${r.imported} new, ${r.updated} updated, ${r.total} total.`);
} catch (e: any) {
  console.warn('⚠️ Feedback import skipped:', e.message);
}

const PORT = Number(process.env.PORT) || 3001;
httpServer.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║   🚀 StartupForge Server RUNNING      ║
  ║   Port: ${PORT}                          ║
  ║   Builder: Codex SDK                  ║
  ║   Model: ${process.env.CODEX_MODEL || 'gpt-5.6-sol'}
  ╚═══════════════════════════════════════╝
  `);
});

// If the port is momentarily still held (e.g. a fast nodemon restart before the
// previous process fully released the socket), retry instead of hard-crashing.
httpServer.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`⚠️ Port ${PORT} busy, retrying in 1s...`);
    setTimeout(() => {
      httpServer.close();
      httpServer.listen(PORT);
    }, 1000);
  } else {
    console.error('HTTP server error:', err);
  }
});

// Release the port cleanly on shutdown so restarts don't collide.
const shutdown = () => {
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
