// Types for `import.meta.env`. Strict mode makes reading an undeclared variable a type error,
// so every VITE_* variable the app uses is listed here.
interface ViteTypeOptions {
  strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
  /** "1" in end-to-end test builds: exposes window.__GE_TEST__ (rendering.md §14). */
  readonly VITE_TEST_HOOKS?: string;
}
