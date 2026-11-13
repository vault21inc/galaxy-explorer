import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, release, totalmem } from 'node:os';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { BUDGETS, REPO_ROOT, RESULTS_DIR, type FrameStats, type PerfResult } from './shared.ts';

/**
 * Turns `pnpm perf` results into a dated report in docs/perf/ (rendering.md §14), and fails
 * (exit code 1) if any budget of rendering.md §2 is missed. `PERF_LABEL` names the milestone
 * (perf.ts sets M2, or M3 for `--edit`); an edit-mode report's file name ends in `-edit`.
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
    metric: 'Galaxy view draw calls, the most in any phase',
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
    // A geometry or texture reaches the GPU the first time it's drawn, so something first seen
    // when the camera turns (edit mode's height gizmo, say) arrives during the first orbit. A
    // leak keeps growing; what matters is that nothing grows after that warm-up.
    metric: 'GPU memory: geometries / textures at the start, after the first orbit, and at the end',
    budget: 'level after the first orbit',
    values: each((r) => {
      const warm = r.phases.orbit?.render ?? r.memory.start;
      const show = (info: { geometries: number; textures: number }) =>
        `${info.geometries.toString()} / ${info.textures.toString()}`;
      return `${show(r.memory.start)} → ${show(warm)} → ${show(r.memory.end)}`;
    }),
    pass: all((r) => {
      const warm = r.phases.orbit?.render ?? r.memory.start;
      return warm.geometries === r.memory.end.geometries && warm.textures === r.memory.end.textures;
    }),
  },
  ...systemChecks(),
];

/**
 * The system view and moving between views (M5-T5), in view-mode runs. The transition budget
 * applies "including data when cached", so the first entry, which also loads the system view's
 * code and payload, is shown but not judged.
 */
function systemChecks(): Check[] {
  const runs = results.filter((r) => r.system);
  if (runs.length !== results.length) return [];
  const sys = (r: PerfResult) => {
    if (!r.system) throw new Error('No system result.');
    return r.system;
  };
  const warm = (times: number[]) => times.slice(1);
  const transitions = (r: PerfResult) => {
    const { enterMs, exitMs } = sys(r).transitions;
    return [...warm(enterMs), ...exitMs];
  };
  const memory = (info: { geometries: number; textures: number }) =>
    `${info.geometries.toString()} / ${info.textures.toString()}`;
  const drift = (before: number, after: number) => Math.abs(after - before) / Math.max(before, 1);
  return [
    {
      metric:
        'System view (1 star, 12 planets, 2 belts, 5 stations), orbit and zoom: median / p95 frame',
      budget: `≤ ${fmt(BUDGETS.interactionMedianMs)} (60 fps) / ≤ ${fmt(BUDGETS.interactionP95Ms)}`,
      values: each((r) => stats(sys(r).interaction)),
      pass: all(
        (r) =>
          sys(r).interaction.medianMs <= BUDGETS.interactionMedianMs + timerSlackMs(r) &&
          sys(r).interaction.p95Ms <= BUDGETS.interactionP95Ms,
      ),
    },
    {
      metric: 'System view draw calls, the most in any phase',
      budget: `≤ ${BUDGETS.systemDrawCalls.toString()}`,
      values: each((r) => sys(r).maxDrawCalls.toString()),
      pass: all((r) => sys(r).maxDrawCalls <= BUDGETS.systemDrawCalls),
    },
    {
      metric:
        'View transitions, request to faded-in view: entering (first, with loading; then cached) / leaving',
      budget: `≤ ${fmt(BUDGETS.transitionMs)} with data cached`,
      values: each((r) => {
        const { enterMs, exitMs } = sys(r).transitions;
        return `${enterMs.map((ms) => ms.toFixed(0)).join(', ')} / ${exitMs.map((ms) => ms.toFixed(0)).join(', ')} ms`;
      }),
      pass: all((r) => transitions(r).every((ms) => ms <= BUDGETS.transitionMs)),
    },
    {
      metric: `Orbit view (an ocean planet with clouds, a moon and ${String(runs[0]?.system?.orbit.pins ?? 0)} pins), orbit and zoom: median / p95 frame`,
      budget: `≤ ${fmt(BUDGETS.interactionMedianMs)} (60 fps) / ≤ ${fmt(BUDGETS.interactionP95Ms)}`,
      values: each((r) => stats(sys(r).orbit.interaction)),
      pass: all(
        (r) =>
          sys(r).orbit.interaction.medianMs <= BUDGETS.interactionMedianMs + timerSlackMs(r) &&
          sys(r).orbit.interaction.p95Ms <= BUDGETS.interactionP95Ms,
      ),
    },
    {
      metric: 'Orbit view draw calls, the most in any phase',
      budget: `≤ ${BUDGETS.orbitDrawCalls.toString()}`,
      values: each((r) => sys(r).orbit.maxDrawCalls.toString()),
      pass: all((r) => sys(r).orbit.maxDrawCalls <= BUDGETS.orbitDrawCalls),
    },
    {
      metric: 'Orbit view transitions, system → orbit (first, with loading; then cached) / back',
      budget: `≤ ${fmt(BUDGETS.transitionMs)} with data cached`,
      values: each((r) => {
        const { enterMs, exitMs } = sys(r).orbit.transitions;
        return `${enterMs.map((ms) => ms.toFixed(0)).join(', ')} / ${exitMs.map((ms) => ms.toFixed(0)).join(', ')} ms`;
      }),
      pass: all((r) => {
        const { enterMs, exitMs } = sys(r).orbit.transitions;
        return [...warm(enterMs), ...exitMs].every((ms) => ms <= BUDGETS.transitionMs);
      }),
    },
    {
      metric: 'Planet surface bake at 2,048 × 1,024: ocean / gas giant / city',
      budget: `≤ ${fmt(BUDGETS.planetBakeMs)} each`,
      values: each((r) =>
        Object.values(sys(r).planetBakeMs)
          .map((ms) => ms.toFixed(1))
          .join(' / ')
          .concat(' ms'),
      ),
      pass: all((r) =>
        Object.values(sys(r).planetBakeMs).every((ms) => ms <= BUDGETS.planetBakeMs),
      ),
    },
    {
      metric: 'Planet look preview: a slider moved to the re-baked globe, 5 times (M6-T2)',
      budget: `≤ ${fmt(BUDGETS.planetPreviewMs)} each`,
      values: each((r) =>
        sys(r)
          .planetPreviewMs.map((ms) => ms.toFixed(0))
          .join(', ')
          .concat(' ms'),
      ),
      pass: all((r) => sys(r).planetPreviewMs.every((ms) => ms <= BUDGETS.planetPreviewMs)),
    },
    {
      metric: `GPU memory: geometries / textures before and after ${String(runs[0]?.system?.roundTrips.count ?? 20)} galaxy ↔ system round trips`,
      budget: `within ±${(BUDGETS.memoryDrift * 100).toFixed(0)} %`,
      values: each((r) => {
        const { before, after } = sys(r).roundTrips;
        return `${memory(before)} → ${memory(after)}`;
      }),
      pass: all((r) => {
        const { before, after } = sys(r).roundTrips;
        return (
          drift(before.geometries, after.geometries) <= BUDGETS.memoryDrift &&
          drift(before.textures, after.textures) <= BUDGETS.memoryDrift
        );
      }),
    },
    {
      metric: `GPU memory: geometries / textures before and after ${String(runs[0]?.system?.orbitRoundTrips.count ?? 20)} galaxy → system → orbit round trips (M6-T3)`,
      budget: `within ±${(BUDGETS.memoryDrift * 100).toFixed(0)} %`,
      values: each((r) => {
        const { before, after } = sys(r).orbitRoundTrips;
        return `${memory(before)} → ${memory(after)}`;
      }),
      pass: all((r) => {
        const { before, after } = sys(r).orbitRoundTrips;
        return (
          drift(before.geometries, after.geometries) <= BUDGETS.memoryDrift &&
          drift(before.textures, after.textures) <= BUDGETS.memoryDrift
        );
      }),
    },
  ];
}

const jsCheck: Check = {
  metric: 'Initial JavaScript, gzipped; each view its own chunk',
  budget: `≤ ${BUDGETS.initialJsGzipKb.toString()} kB`,
  values: [`${js.kb.toFixed(1)} kB; view chunks: ${js.viewChunks.join(', ') || 'none'}`],
  pass: js.kb <= BUDGETS.initialJsGzipKb && js.viewChunks.length > 0,
};

// ---- the report -------------------------------------------------------------------------
const date = new Date().toISOString().slice(0, 10);
const editing = results.some((r) => r.mode === 'edit');
const modeLine = editing
  ? `edit mode, with the reference underlay shown (${results.every((r) => r.edit?.underlay) ? 'drawn in every run' : '**not drawn in every run**'}) and ${results.map((r) => `${(r.edit?.selected ?? 0).toString()} selected`).join(' / ')}; left-drags orbit with Alt held, as edit mode requires`
  : 'view mode, as a reader sees it';
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
- **Mode:** ${modeLine}.
- **Content:** the stress map, ${results[0]?.objects.toLocaleString('en') ?? '?'} objects (300 groups and 50 routes are drawn from M4).
- **Path:** load; 3 s idle; orbit (3 left-drags); pan (2 right-drags); zoom toward the cursor (100 wheel steps at two points); orbit again holding Space (every label shown). ${editing ? '' : "Then the system view: the map's first system made busy (1 star, 12 planets, one ringed, 2 belts, 5 stations); 3 timed entries and exits; orbit (3 left-drags) and zoom (48 wheel steps over empty space) inside it; 20 more round trips; then 20 galaxy → system → orbit round trips through an explorable planet with a moon. "}3 s idle after each phase. Pointer steps are 16 ms apart.

## Budgets

| Metric | Budget | ${results.map((r) => r.project).join(' | ')} | Result |
|---|---|${results.map(() => '---|').join('')}---|
${checks.map((check) => row([check.metric, check.budget, ...check.values, check.pass ? 'pass' : '**miss**'])).join('\n')}
${row([jsCheck.metric, jsCheck.budget, ...results.map((_, i) => (i === 0 ? (jsCheck.values[0] ?? '') : 'same build')), jsCheck.pass ? 'pass' : '**miss**'])}

${editing ? 'The system view and transitions are measured in view-mode runs.' : 'The orbit view (M6-T8): from inside the busy system, 3 timed entries and exits of its explorable planet (ocean, clouds, a moon, places with events at them), then orbit (3 left-drags) and zoom (24 wheel steps) around the globe; it also joins the memory check through 20 galaxy → system → orbit round trips.'}

## Phases

| Browser | Phase | Median / p95 frame | Draw calls | Triangles | Points | DPR at the end |
|---|---|---|---|---|---|---|
${phaseRows.join('\n')}
`;

const path = resolve(REPO_ROOT, 'docs/perf', `${date}-${label}${editing ? '-edit' : ''}.md`);
writeFileSync(path, markdown);
console.log(`Wrote ${path}`);
for (const check of [...checks, jsCheck]) {
  console.log(`${check.pass ? 'pass' : 'MISS'}  ${check.metric}: ${check.values.join(' | ')}`);
}
if (failed.length > 0) process.exitCode = 1;
