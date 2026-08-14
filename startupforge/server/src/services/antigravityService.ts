import type { Codex, Thread, ThreadEvent } from '@openai/codex-sdk';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const importCodex = new Function('return import("@openai/codex-sdk")') as () => Promise<typeof import('@openai/codex-sdk')>;

export interface EventSink { emit(event: string, payload: unknown): unknown; }

export interface BuildOptions {
  businessContext: string;
  command: string;
  projectPath: string;
  socket: EventSink;
  buildId: number;
  repoUrl?: string;
}

export interface BuildResult {
  success: boolean;
  filesCreated: string[];
  projectPath: string;
  snapshotId?: string;
  threadId?: string;
  diff?: Array<{ path: string; kind: string }>;
  buildOutput?: string;
  error?: string;
}

const LEGACY_EVENTS: Record<string, string> = {
  'codex:start': 'antigravity:start',
  'codex:model': 'antigravity:model',
  'codex:message': 'antigravity:chunk',
  'codex:file_changed': 'antigravity:file_written',
  'codex:complete': 'antigravity:complete',
  'codex:error': 'antigravity:error',
};

function emit(sink: EventSink, event: string, payload: Record<string, unknown>): void {
  sink.emit(event, payload);
  const legacy = LEGACY_EVENTS[event];
  if (legacy) sink.emit(legacy, payload);
}

export function generatedProjectsRoot(): string {
  return path.resolve(process.cwd(), process.env.GENERATED_MVPS_PATH || '../generated-mvps');
}

export function validateProjectPath(candidate: string): string {
  if (!candidate) throw new Error('Project path is required.');
  const resolved = path.resolve(candidate);
  const root = generatedProjectsRoot();
  if (resolved === root) throw new Error('Project root-level writes are not allowed.');
  if (!resolved.startsWith(root + path.sep)) throw new Error('Project path must be inside the configured generated MVP directory.');
  return resolved;
}

function ensureContainedFile(projectPath: string, candidate: string): string {
  const absolute = path.resolve(projectPath, candidate);
  if (!absolute.startsWith(projectPath + path.sep)) throw new Error(`Codex reported an unsafe path: ${candidate}`);
  return path.relative(projectPath, absolute).split(path.sep).join('/');
}

function snapshotsRoot(projectPath: string): string {
  return path.join(generatedProjectsRoot(), '.orbit-snapshots', path.basename(projectPath));
}

export function createSnapshot(projectPathInput: string): string {
  const projectPath = validateProjectPath(projectPathInput);
  const snapshotId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const destination = path.join(snapshotsRoot(projectPath), snapshotId);
  fs.mkdirSync(destination, { recursive: true });
  if (fs.existsSync(projectPath)) {
    fs.cpSync(projectPath, destination, {
      recursive: true,
      filter: (source) => !['node_modules', '.git'].includes(path.basename(source)),
    });
  }
  return snapshotId;
}

export function rollbackSnapshot(projectPathInput: string, snapshotId: string): void {
  const projectPath = validateProjectPath(projectPathInput);
  if (!/^[0-9]+-[a-f0-9-]+$/.test(snapshotId)) throw new Error('Invalid snapshot ID.');
  const source = path.join(snapshotsRoot(projectPath), snapshotId);
  if (!fs.existsSync(source)) throw new Error('Snapshot not found.');
  fs.mkdirSync(projectPath, { recursive: true });
  for (const entry of fs.readdirSync(projectPath)) {
    if (entry === '.git' || entry === 'node_modules') continue;
    fs.rmSync(path.join(projectPath, entry), { recursive: true, force: true });
  }
  fs.cpSync(source, projectPath, { recursive: true });
}

function threadMetadataPath(projectPath: string): string { return path.join(projectPath, '.orbit', 'codex-thread.json'); }

function loadThreadId(projectPath: string): string | undefined {
  try { return JSON.parse(fs.readFileSync(threadMetadataPath(projectPath), 'utf8')).threadId; } catch { return undefined; }
}

function saveThreadId(projectPath: string, threadId: string): void {
  fs.mkdirSync(path.dirname(threadMetadataPath(projectPath)), { recursive: true });
  fs.writeFileSync(threadMetadataPath(projectPath), JSON.stringify({ threadId, updatedAt: new Date().toISOString() }, null, 2));
}

async function codexClient(): Promise<Codex> {
  const { Codex } = await importCodex();
  return new Codex({ apiKey: process.env.OPENAI_API_KEY });
}

async function openThread(projectPath: string): Promise<Thread> {
  const client = await codexClient();
  const existing = loadThreadId(projectPath);
  const options = {
    model: process.env.CODEX_MODEL || 'gpt-5.6-sol',
    workingDirectory: projectPath,
    sandboxMode: 'workspace-write' as const,
    approvalPolicy: 'never' as const,
    skipGitRepoCheck: true,
    networkAccessEnabled: false,
  };
  return existing ? client.resumeThread(existing, options) : client.startThread(options);
}

async function streamTurn(thread: Thread, prompt: string, options: BuildOptions, files: Map<string, string>): Promise<void> {
  const streamed = await thread.runStreamed(prompt);
  for await (const event of streamed.events) {
    handleEvent(event, options, files);
    if (event.type === 'thread.started') saveThreadId(validateProjectPath(options.projectPath), event.thread_id);
    if (event.type === 'turn.failed') throw new Error(event.error.message);
    if (event.type === 'error') throw new Error(event.message);
  }
}

function handleEvent(event: ThreadEvent, options: BuildOptions, files: Map<string, string>): void {
  const { socket, buildId } = options;
  if (event.type === 'item.completed' && event.item.type === 'agent_message') {
    emit(socket, 'codex:message', { text: event.item.text, totalChars: event.item.text.length, buildId });
  }
  if (event.type === 'item.completed' && event.item.type === 'file_change') {
    for (const change of event.item.changes) {
      const relative = ensureContainedFile(validateProjectPath(options.projectPath), change.path);
      files.set(relative, change.kind);
      emit(socket, 'codex:file_changed', { path: relative, kind: change.kind, agent: 'Codex', buildId });
    }
  }
  if (event.type === 'item.completed' && event.item.type === 'command_execution') {
    socket.emit('codex:command', { command: event.item.command, status: event.item.status, exitCode: event.item.exit_code, output: event.item.aggregated_output.slice(-4000), buildId });
  }
  if (event.type === 'turn.completed') socket.emit('codex:usage', { ...event.usage, buildId });
}

async function verifyBuild(projectPath: string): Promise<string> {
  const packagePath = path.join(projectPath, 'package.json');
  if (!fs.existsSync(packagePath)) return 'No package.json; Codex verification only.';
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { scripts?: Record<string, string> };
  if (!pkg.scripts?.build) return 'No build script; Codex verification only.';
  const result = await execFileAsync('npm', ['run', 'build'], { cwd: projectPath, timeout: 180_000, maxBuffer: 4 * 1024 * 1024 });
  return `${result.stdout}\n${result.stderr}`.slice(-8000);
}

function implementationPrompt(context: string, command: string, existing: boolean): string {
  return `You are the implementation stage in StartupForge's Planner → Codex → Critic → Codex repair workflow.

First make a short internal plan, then ${existing ? 'inspect and modify the existing project' : 'create the complete MVP'} directly in the current working directory. Use filesystem tools; do not print pseudo file delimiters. Never access paths outside the working directory. Do not publish, deploy, spend money, or write to GitHub. Implement a polished, responsive, runnable MVP and run appropriate local checks.

BUSINESS CONTEXT (already privacy-filtered):
${context.slice(0, 24_000)}

APPROVED OBJECTIVE:
${command.slice(0, 8_000)}`;
}

async function executeBuild(options: BuildOptions, followUp: boolean): Promise<BuildResult> {
  const projectPath = validateProjectPath(options.projectPath);
  const snapshotId = createSnapshot(projectPath);
  fs.mkdirSync(projectPath, { recursive: true });
  const files = new Map<string, string>();
  emit(options.socket, 'codex:start', { message: 'Codex build thread starting…', projectPath, buildId: options.buildId, snapshotId });
  emit(options.socket, 'codex:model', { model: process.env.CODEX_MODEL || 'gpt-5.6-sol', agent: 'Codex', buildId: options.buildId });
  try {
    const thread = await openThread(projectPath);
    await streamTurn(thread, implementationPrompt(options.businessContext, options.command, followUp), options, files);
    let buildOutput = '';
    try {
      buildOutput = await verifyBuild(projectPath);
    } catch (error: any) {
      buildOutput = `${error.stdout || ''}\n${error.stderr || error.message}`.slice(-8000);
    }
    await streamTurn(thread, `Act as the Critic. Inspect the current diff and this build output, identify defects, then act as the repair stage: fix every reproducible issue in the working directory and rerun relevant checks. Do not publish or deploy.\n\nBUILD OUTPUT:\n${buildOutput}`, options, files);
    buildOutput = await verifyBuild(projectPath).catch((error: any) => `${error.stdout || ''}\n${error.stderr || error.message}`.slice(-8000));
    const filesCreated = [...files.keys()];
    const threadId = thread.id || loadThreadId(projectPath);
    const payload = { filesCreated, projectPath, totalFiles: filesCreated.length, buildId: options.buildId, snapshotId, threadId, message: `Codex build complete: ${filesCreated.length} changed file(s).` };
    emit(options.socket, 'codex:complete', payload);
    return { success: true, filesCreated, projectPath, snapshotId, threadId, diff: [...files].map(([filePath, kind]) => ({ path: filePath, kind })), buildOutput };
  } catch (error: any) {
    const message = error?.message || 'Codex build failed';
    emit(options.socket, 'codex:error', { message, buildId: options.buildId, snapshotId });
    return { success: false, filesCreated: [...files.keys()], projectPath, snapshotId, error: message };
  }
}

export async function runCodexBuild(options: BuildOptions): Promise<BuildResult> { return executeBuild(options, false); }
export async function runAntigravityBuild(options: BuildOptions): Promise<BuildResult> { return runCodexBuild(options); }

export async function sendFollowUpCommand(options: BuildOptions): Promise<BuildResult> {
  return executeBuild(options, true);
}
