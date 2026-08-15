/**
 * Approval-gated GitHub source publishing over the operator's local SSH setup.
 *
 * SSH can authenticate Git pushes, but it cannot create repositories or enable
 * GitHub Pages. The target repository must already exist under
 * GITHUB_SSH_OWNER; deployment remains a separate explicitly approved action.
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import { Socket } from 'socket.io';

const execFileAsync = promisify(execFile);
const safeGitConfig = ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false'];

export function validateGithubRepoName(value: string): string {
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(value) || value === '.' || value === '..') {
    throw new Error('Invalid GitHub repository name');
  }
  return value;
}

export function validateGithubOwner(value: string): string {
  if (!/^[A-Za-z0-9-]{1,100}$/.test(value)) throw new Error('Invalid GitHub owner');
  return value;
}

export function githubRemoteUrl(owner: string, repo: string): string {
  return `git@github.com:${validateGithubOwner(owner)}/${validateGithubRepoName(repo)}.git`;
}

export function getSshGithubConfig(): { configured: boolean; owner: string | null; mode: 'ssh' } {
  const configuredOwner = process.env.GITHUB_SSH_OWNER?.trim() || '';
  if (!configuredOwner) return { configured: false, owner: null, mode: 'ssh' };
  return { configured: true, owner: validateGithubOwner(configuredOwner), mode: 'ssh' };
}

async function run(program: string, args: string[], cwd: string): Promise<string> {
  const safeEnvironment: NodeJS.ProcessEnv = {
    PATH: process.env.PATH || '',
    HOME: process.env.HOME || process.env.TMPDIR || '/tmp',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_ALLOW_PROTOCOL: 'ssh',
    GIT_TERMINAL_PROMPT: '0',
    GIT_SSH_COMMAND: 'ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new',
  };
  if (process.env.SSH_AUTH_SOCK) safeEnvironment.SSH_AUTH_SOCK = process.env.SSH_AUTH_SOCK;
  const { stdout } = await execFileAsync(program, args, {
    cwd, env: safeEnvironment, timeout: 300_000, maxBuffer: 40 * 1024 * 1024,
  });
  return stdout;
}

async function runIgnoreError(program: string, args: string[], cwd: string): Promise<void> {
  try { await run(program, args, cwd); } catch { /* best-effort for no-op commits/remotes */ }
}

export async function rejectExecutableGitConfiguration(cwd: string): Promise<void> {
  const output = await run('git', ['config', '--local', '--name-only', '--list'], cwd);
  const unsafeKey = /^(core\.(hookspath|fsmonitor|sshcommand)|filter\.|diff\..*\.command|merge\..*\.driver|url\..*\.insteadof|remote\..*\.(receivepack|uploadpack|proxy)|credential\.)/i;
  if (output.split(/\r?\n/).some((key) => unsafeKey.test(key.trim()))) {
    throw new Error('Repository contains executable Git configuration; publishing refused.');
  }
}

async function requireExistingSshRepository(remote: string, cwd: string): Promise<void> {
  try {
    await run('git', ['ls-remote', remote], cwd);
  } catch {
    throw new Error('SSH could not access the target repository. Create it on GitHub first and verify this machine\'s SSH key has write access.');
  }
}

export interface PublishResult {
  repoUrl: string;
  pagesUrl: string;
  owner: string;
  repo: string;
}

export async function publishToGithub(options: {
  projectPath: string;
  repoName: string;
  socket: Socket;
}): Promise<PublishResult> {
  const { projectPath, repoName, socket } = options;
  if (!fs.existsSync(projectPath)) throw new Error('Project path does not exist.');

  const config = getSshGithubConfig();
  if (!config.configured || !config.owner) {
    throw new Error('GitHub SSH publishing is not configured. Set GITHUB_SSH_OWNER and restart StartupForge.');
  }

  const repo = validateGithubRepoName(repoName);
  const owner = config.owner;
  const remote = githubRemoteUrl(owner, repo);
  const repoUrl = `https://github.com/${owner}/${repo}`;
  const emit = (message: string) => socket.emit('github:progress', { message });

  emit(`🔐 Verifying SSH access to existing repository "${owner}/${repo}"...`);
  await requireExistingSshRepository(remote, projectPath);

  emit('📦 Committing source code...');
  const hasGit = fs.existsSync(path.join(projectPath, '.git'));
  if (!hasGit) await run('git', ['init', '-b', 'main'], projectPath);
  else await rejectExecutableGitConfiguration(projectPath);

  const gitignore = path.join(projectPath, '.gitignore');
  const ignoreLines = ['node_modules', 'dist', '.env', '.orbit'];
  let existingIgnore = fs.existsSync(gitignore) ? fs.readFileSync(gitignore, 'utf-8') : '';
  for (const line of ignoreLines) {
    if (!existingIgnore.split(/\r?\n/).includes(line)) existingIgnore += `\n${line}`;
  }
  fs.writeFileSync(gitignore, `${existingIgnore.trim()}\n`, 'utf-8');

  await run('git', [...safeGitConfig, 'add', '-A'], projectPath);
  await runIgnoreError('git', [
    ...safeGitConfig,
    '-c', 'user.email=startupforge@local',
    '-c', 'user.name=StartupForge',
    'commit', '-m', 'Update via StartupForge',
  ], projectPath);
  await runIgnoreError('git', ['remote', 'remove', 'origin'], projectPath);
  await run('git', ['remote', 'add', 'origin', remote], projectPath);

  emit('🚀 Pushing source to GitHub over SSH (main branch)...');
  await run('git', [...safeGitConfig, 'push', '-u', 'origin', 'HEAD:main'], projectPath);

  emit(`✅ Source published over SSH: ${repoUrl}. Deployment/Pages remains a separate approval.`);
  return { repoUrl, pagesUrl: '', owner, repo };
}
