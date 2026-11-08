import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, release, totalmem } from 'node:os';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { BUDGETS, REPO_ROOT, RESULTS_DIR, type FrameStats, type PerfResult } from './shared.ts';

/**
 * Turns `pnpm perf` results into a dated report in docs/perf/ (rendering.md §14), and fails
 * (exit code 1) if any budget of rendering.md §2 is missed. `PERF_LABEL` names the milestone
 * (default M2).
 */

const label = process.env.PERF_LABEL ?? 'M2';
const results: PerfResult[] = readdirSync(RESULTS_DIR)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => JSON.parse(readFileSync(resolve(RESULTS_DIR, name), 'utf8')) as PerfResult);
if (results.length === 0) throw new Error(`No results in ${RESULTS_DIR}. Run \`pnpm perf\`.`);

// ---- the machine ------------------------------------------------------------------------
const run = (command: string, args: string[]) => {
  try {
    return execFileSync(command, args, { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
};
const machine = {
  model: run('sysctl', ['-n', 'hw.model']),
  chip: cpus()[0]?.model ?? 'unknown',
  memoryGb: Math.round(totalmem() / 1024 ** 3),
  macOS: run('sw_vers', ['-productVersion']),
  kernel: release(),
  commit: run('git', ['-C', REPO_ROOT, 'rev-parse', '--short', 'HEAD']),
  dirty: run('git', ['-C', REPO_ROOT, 'status', '--porcelain']) !== '',
};

// ---- the initial JavaScript, from the build the run served ------------------------------
function initialJsKb(): { kb: number; viewChunks: string[] } {
  const dist = resolve(REPO_ROOT, 'apps/web/dist');
  const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
  // The entry script and the chunks it preloads: what a first visit downloads before running.
  const files = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1] ?? '');
  const bytes = files.reduce(
    (sum, file) => sum + gzipSync(readFileSync(resolve(dist, file))).length,
    0,
  );
  const viewChunks = readdirSync(resolve(dist, 'assets')).filter((name) =>
    /-level-.*\.js$/.test(name),
  );
  return { kb: bytes / 1024, viewChunks };
}
const js = existsSync(resolve(REPO_ROOT, 'apps/web/dist/index.html'))
  ? initialJsKb()
  : { kb: Number.NaN, viewChunks: [] };

// ---- checks -----------------------------------------------------------------------------
interface Check {
  metric: string;
  budget: string;
  values: string[];
  pass: boolean;
}
const fmt = (ms: number) => `${ms.toFixed(1)} ms`;
/**
 * WebKit rounds performance.now() to whole milliseconds, so a 60 Hz display's 16.7 ms frames
 * read as 16 and 17 ms and the median can land on 17.0. Its timings get that much leeway.
 */
const timerSlackMs = (r: PerfResult) => (r.project === 'webkit' ? 1 : 0);
const stats = (s: FrameStats) =>
  `${fmt(s.medianMs)} / ${fmt(s.p95Ms)} (${s.count.toString()} frames)`;
const each = (read: (r: PerfResult) => string) => results.map(read);
const all = (test: (r: PerfResult) => boolean) => results.every(test);

const checks: Check[] = [
  {
    metric: 'Idle: frames rendered over 3 s, after loading and after each phase',
    budget: '0',
    values: each((r) => r.idleFrames.join(', ')),
    pass: all((r) => r.idleFrames.every((frames) => frames === BUDGETS.idleFrames)),
  },
  {
    metric: 'Interaction (orbit, pan, zoom): median / p95 frame',
    budget: `≤ ${fmt(BUDGETS.interactionMedianMs)} (60 fps) / ≤ ${fmt(BUDGETS.interactionP95Ms)}`,
    values: each((r) => stats(r.interaction)),
    pass: all(
      (r) =>
        r.interaction.medianMs <= BUDGETS.interactionMedianMs + timerSlackMs(r) &&
        r.interaction.p95Ms <= BUDGETS.interactionP95Ms,
    ),
  },
  {
    metric: 'Draw calls, the most in any phase',
    budget: `≤ ${BUDGETS.galaxyDrawCalls.toString()}`,
    values: each((r) => r.maxDrawCalls.toString()),
    pass: all((r) => r.maxDrawCalls <= BUDGETS.galaxyDrawCalls),
  },
  {
    metric: 'First galaxy frame, from navigation',
    budget: `≤ ${fmt(BUDGETS.firstFrameMs)}`,
    values: each((r) => fmt(r.firstFrameMs)),
    pass: all((r) => r.firstFrameMs <= BUDGETS.firstFrameMs),
  },
  {
    metric: 'Label updates with every label shown: p95 (rendering.md §11)',
    budget: `≤ ${fmt(BUDGETS.labelUpdateP95Ms)}`,
    values: each((r) => {
      const labels = r.phases.labels?.labels;
      return labels
        ? `${fmt(labels.medianMs)} / ${fmt(labels.p95Ms)}, ${labels.shown.toString()} shown`
        : 'n/a';
    }),
    // WebKit rounds performance.now() to whole milliseconds, too coarse to judge 2 ms.
    pass: all(
      (r) =>
        r.project === 'webkit' ||
        (r.phases.labels?.labels?.p95Ms ?? Infinity) <= BUDGETS.labelUpdateP95Ms,
    ),
  },
  {
    metric: 'GPU memory: geometries / textures at the start and the end',
    budget: 'stable (20 view round trips arrive with M5)',
    values: each(
      (r) =>
        `${r.memory.start.geometries.toString()} / ${r.memory.start.textures.toString()} → ` +
        `${r.memory.end.geometries.toString()} / ${r.memory.end.textures.toString()}`,
    ),
    pass: all(
      (r) =>
        r.memory.start.geometries === r.memory.end.geometries &&
        r.memory.start.textures === r.memory.end.textures,
    ),
  },
];
const jsCheck: Check = {
  metric: 'Initial JavaScript, gzipped; each view its own chunk',
  budget: `≤ ${BUDGETS.initialJsGzipKb.toString()} kB`,
  values: [`${js.kb.toFixed(1)} kB; view chunks: ${js.viewChunks.join(', ') || 'none'}`],
  pass: js.kb <= BUDGETS.initialJsGzipKb && js.viewChunks.length > 0,
};

// ---- the report -------------------------------------------------------------------------
const date = new Date().toISOString().slice(0, 10);
const names = results.map((r) => `${r.project} ${r.browserVersion}`);
const row = (cells: string[]) => `| ${cells.join(' | ')} |`;
const phaseRows = results.flatMap((r) =>
  Object.entries(r.phases).map(([name, phase]) =>
    row([
      r.project,
      name,
      stats(phase.frames),
      phase.render.calls.toString(),
      phase.render.triangles.toLocaleString('en'),
      phase.render.points.toLocaleString('en'),
      phase.render.dpr.toString(),
    ]),
  ),
);
const failed = [...checks, jsCheck].filter((check) => !check.pass);

const markdown = `# Performance report: ${label}, ${date}

Written by \`pnpm perf\` (scripts/perf/) against the budgets in [rendering.md §2](../plan/rendering.md#2-performance-budget). ${failed.length === 0 ? '**Every budget is met.**' : `**${failed.length.toString()} budget(s) missed:** ${failed.map((check) => check.metric).join('; ')}.`}

## Setup

- **Machine:** ${machine.model}, ${machine.chip}, ${machine.memoryGb.toString()} GB, macOS ${machine.macOS}.
- **Code:** commit \`${machine.commit}\`${machine.dirty ? ' plus uncommitted changes' : ''}; a production build with the test hooks (\`VITE_TEST_HOOKS=1\`).
- **Browsers:** ${names.join('; ')}. Headed, ${results[0]?.viewport.width.toString() ?? '?'} × ${results[0]?.viewport.height.toString() ?? '?'} CSS px at device pixel ratio ${results[0]?.viewport.deviceScaleFactor.toString() ?? '?'}, default quality (Medium: DPR capped at 1.5).
- **Timers:** WebKit rounds \`performance.now()\` to whole milliseconds, so its frame times carry ±1 ms; the 60 fps check allows it that, and its label timings aren't judged.
- **Display refresh rate, measured:** ${results.map((r) => `${r.project} ${r.refreshHz.toString()} Hz`).join(', ')}. Frame intervals can't be shorter than the display's.
- **Content:** the stress map, ${results[0]?.objects.toLocaleString('en') ?? '?'} objects (300 groups and 50 routes are drawn from M4).
- **Path:** load; 3 s idle; orbit (3 left-drags); pan (2 right-drags); zoom toward the cursor (100 wheel steps at two points); orbit again holding Space (every label shown). 3 s idle after each phase. Pointer steps are 16 ms apart.

## Budgets

| Metric | Budget | ${results.map((r) => r.project).join(' | ')} | Result |
|---|---|${results.map(() => '---|').join('')}---|
${checks.map((check) => row([check.metric, check.budget, ...check.values, check.pass ? 'pass' : '**miss**'])).join('\n')}
${row([jsCheck.metric, jsCheck.budget, ...results.map((_, i) => (i === 0 ? (jsCheck.values[0] ?? '') : 'same build')), jsCheck.pass ? 'pass' : '**miss**'])}

Not measured yet: view transitions (M5) and GPU memory over 20 galaxy → system → orbit round trips (M5, M6).

## Phases

| Browser | Phase | Median / p95 frame | Draw calls | Triangles | Points | DPR at the end |
|---|---|---|---|---|---|---|
${phaseRows.join('\n')}
`;

const path = resolve(REPO_ROOT, 'docs/perf', `${date}-${label}.md`);
writeFileSync(path, markdown);
console.log(`Wrote ${path}`);
for (const check of [...checks, jsCheck]) {
  console.log(`${check.pass ? 'pass' : 'MISS'}  ${check.metric}: ${check.values.join(' | ')}`);
}
if (failed.length > 0) process.exitCode = 1;
