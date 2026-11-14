import { configFor } from './eslint.js';

export default [
  // test-api.d.ts only describes test-api.js to the TypeScript packages that use it, whose
  // typecheck reads it; this package has no TypeScript project to lint it in.
  { ignores: ['test-api.d.ts'] },
  ...configFor('@ge/config', import.meta.dirname),
];
