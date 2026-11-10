import { spawnSync } from 'node:child_process';

/**
 * `pnpm perf [--edit]`: the scripted run, then the report (rendering.md §14).
 *
 * `--edit` runs the same path in edit mode with the reference underlay shown and 100 objects
 * selected: the M3 milestone check. Plain left-drags select in edit mode, so the path orbits
 * with Alt held, the editor's orbit modifier (ux.md §3). The report is labelled M3 unless
 * `PERF_LABEL` says otherwise.
 */
const edit = process.argv.includes('--edit');
const env = {
  ...process.env,
  PERF_MODE: edit ? 'edit' : 'view',
  PERF_LABEL: process.env.PERF_LABEL ?? (edit ? 'M3' : 'M2'),
};

const run = (command: string, args: string[]) =>
  spawnSync(command, args, { stdio: 'inherit', env, cwd: import.meta.dirname }).status ?? 1;

const tests = run('pnpm', ['exec', 'playwright', 'test', '-c', 'playwright.config.ts']);
if (tests !== 0) process.exit(tests);
process.exit(run('node', ['report.ts']));
