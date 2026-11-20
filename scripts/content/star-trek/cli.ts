import { buildUniverse } from '../build-universe.ts';
import { PLAN } from './plan.ts';

/**
 * `pnpm --filter @ge/content star-trek build` (README.md): makes the Star Trek universe and its
 * map (REST), its settings (MCP tools), then every world, power, route, event and person in one MCP
 * `batch`: a dry run first, then for real. One undo step.
 */
if (process.argv[2] === 'build') {
  await buildUniverse(PLAN);
} else {
  console.log('Usage: pnpm --filter @ge/content star-trek build');
  process.exitCode = 1;
}
