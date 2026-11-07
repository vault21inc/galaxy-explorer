/**
 * What the global setup hands to test files through Vitest's `provide`/`inject`. Test files
 * run in worker processes, so they can't share variables with the setup directly.
 */
export interface TestDatabaseContext {
  /** TEST_DATABASE_URL: any database on the test server. */
  serverUrl: string;
  /** The migrated template that every test database is copied from. */
  templateName: string;
}

declare module 'vitest' {
  interface ProvidedContext {
    /** Missing when the package's Vitest config doesn't run the global setup. */
    geTestDatabase?: TestDatabaseContext;
  }
}

/** Test databases are named `ge_t_<created, base 36 seconds>_<random>`. */
export const TEST_DATABASE_PREFIX = 'ge_t_';

/** Template databases are named `ge_template_<hash of the migrations>`. */
export const TEMPLATE_PREFIX = 'ge_template_';
