import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execFileAsync = promisify(execFile);
const maxBuffer = 40 * 1024 * 1024;

function bubblewrapPath(): string | undefined {
  return ['/usr/bin/bwrap', '/bin/bwrap'].find((candidate) => fs.existsSync(candidate));
}

export async function runSandboxedProjectCommand(
  projectPath: string,
  program: string,
  args: string[],
  options: { network?: boolean; timeoutMs?: number } = {},
): Promise<string> {
  const sandbox = process.platform === 'linux' ? bubblewrapPath() : undefined;
  if (sandbox) {
    const mounts = ['/usr', '/bin', '/lib', '/lib64', '/etc'].flatMap((source) => fs.existsSync(source) ? ['--ro-bind', source, source] : []);
    const sandboxArgs = [
      '--die-with-parent', '--new-session', '--clearenv',
      ...(options.network ? [] : ['--unshare-net']),
      ...mounts,
      '--dev', '/dev', '--proc', '/proc', '--tmpfs', '/tmp',
      '--bind', projectPath, '/workspace', '--chdir', '/workspace',
      '--setenv', 'HOME', '/tmp', '--setenv', 'PATH', '/usr/local/bin:/usr/bin:/bin',
      '--setenv', 'NODE_ENV', 'production', '--setenv', 'npm_config_cache', '/tmp/npm-cache',
      program, ...args,
    ];
    const { stdout, stderr } = await execFileAsync(sandbox, sandboxArgs, { timeout: options.timeoutMs || 300_000, maxBuffer });
    return `${stdout}${stderr}`;
  }
  if (process.env.STARTUPFORGE_ALLOW_UNSANDBOXED_BUILDS !== 'true') {
    throw new Error('A generated-project sandbox is unavailable. Install Bubblewrap or explicitly set STARTUPFORGE_ALLOW_UNSANDBOXED_BUILDS=true.');
  }
  const safeEnv = { PATH: process.env.PATH || '', HOME: process.env.TMPDIR || '/tmp', NODE_ENV: 'production', npm_config_cache: path.join(projectPath, '.orbit', 'npm-cache') };
  const { stdout, stderr } = await execFileAsync(program, args, { cwd: projectPath, env: safeEnv, timeout: options.timeoutMs || 300_000, maxBuffer });
  return `${stdout}${stderr}`;
}
