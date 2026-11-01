import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { WORKSPACE_PACKAGES } from './workspace.js';

/**
 * The ESLint config for one workspace package. Each package's eslint.config.js is one line:
 *
 *   export default configFor('@ge/web', import.meta.dirname);
 *
 * @param {string} packageName - a package listed in workspace.js
 * @param {string} packageDir - the package's absolute path; type-aware rules read its tsconfig.json
 */
export function configFor(packageName, packageDir) {
  const pkg = WORKSPACE_PACKAGES.find((candidate) => candidate.name === packageName);
  if (!pkg) {
    throw new Error(`${packageName} is not listed in packages/config/workspace.js`);
  }

  return defineConfig(
    { ignores: ['dist/', 'coverage/'] },
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    {
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir: packageDir },
      },
      rules: {
        'no-restricted-imports': ['error', { patterns: importRestrictions(pkg) }],
      },
    },
    {
      // Config files are plain JavaScript run by Node, outside every tsconfig.
      files: ['**/*.{js,mjs,cjs}'],
      extends: [tseslint.configs.disableTypeChecked],
      languageOptions: { globals: globals.node },
    },
    {
      files: ['**/*.test.{ts,tsx}', 'test/**'],
      rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
    },
  );
}

/**
 * `no-restricted-imports` patterns for one package: each module it must not import (and that
 * module's subpaths), plus relative paths that climb into another package's folder.
 *
 * @param {{ name: string, mustNotImport: readonly string[] }} pkg
 */
function importRestrictions(pkg) {
  return [
    ...pkg.mustNotImport.map((spec) => ({
      regex: `^${escapeRegex(spec).replace('\\*', '.*')}(?:/.*)?$`,
      message: `${pkg.name} must not import ${spec} (docs/plan/architecture.md §2).`,
    })),
    {
      regex: '^\\.{1,2}/(?:.*/)?(?:apps|packages)/',
      message: 'Import other workspace packages by name (@ge/...), not by relative path.',
    },
  ];
}

/** @param {string} text */
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
