import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { accountFromLink, signInThrough, siteApi } from './accounts.ts';

/**
 * The stack's tests' setup (playwright.stack.config.js, M8-T4): an account made through an
 * invite link that the API's container prints, as an admin would on the server, then signed
 * in; the browser contexts start from its session.
 */
export default async function setUp(): Promise<void> {
  const session = process.env.GE_STACK_SESSION;
  const envFile = process.env.GE_STACK_ENV_FILE;
  if (!session) throw new Error('Run these tests with -c playwright.stack.config.js.');
  if (!envFile) throw new Error('Set GE_STACK_ENV_FILE to the env file the stack runs with.');
  const repoRoot = resolve(import.meta.dirname, '../../..');
  const output = execFileSync(
    'docker',
    [
      'compose',
      '-f',
      'docker/compose.prod.yml',
      '--env-file',
      envFile,
      'exec',
      '-T',
      'api',
      'node',
      'apps/api/src/auth/cli.ts',
      'invite',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  const token = /\/link\/([A-Za-z0-9_-]+)/.exec(output)?.[1];
  if (!token) throw new Error(`No link in the invite's output:\n${output}`);
  const account = await accountFromLink(token);
  const api = await siteApi();
  try {
    await signInThrough(api, account);
    mkdirSync(dirname(session), { recursive: true });
    await api.storageState({ path: session });
  } finally {
    await api.dispose();
  }
}
