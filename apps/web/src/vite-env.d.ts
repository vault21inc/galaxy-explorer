// Types for `import.meta.env`. Strict mode makes reading an undeclared variable a type error,
// so every VITE_* variable the app uses is listed here.
interface ViteTypeOptions {
  strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
  /** "1" in end-to-end test builds: exposes window.__GE_TEST__ (rendering.md §14). */
  readonly VITE_TEST_HOOKS?: string;
  /**
   * First-visit defaults a deployment may set at build time (D-38), such as the private
   * preview showing everything to its testers. A visitor's own choice, once made, wins.
   * `hover` (the default), `groups` or `all`.
   */
  readonly VITE_DEFAULT_LABEL_MODE?: string;
  /** `hidden` (the default, P3) or `shown`. */
  readonly VITE_DEFAULT_SPOILERS?: string;
}
