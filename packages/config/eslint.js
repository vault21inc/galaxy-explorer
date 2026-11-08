import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
import { WORKSPACE_PACKAGES } from './workspace.js';

/**
 * The ESLint config for one workspace package. Each package's eslint.config.js is one line:
 *
 *   export default configFor('@ge/web', import.meta.dirname);
 *
 * React packages pass `{ react: true }` to add the Rules of Hooks and the React Compiler's checks
 * (eslint-plugin-react-hooks).
 *
 * @param {string} packageName - a package listed in workspace.js
 * @param {string} packageDir - the package's absolute path; type-aware rules read its tsconfig.json
 * @param {{ react?: boolean }} [options]
 */
export function configFor(packageName, packageDir, { react = false } = {}) {
  const pkg = WORKSPACE_PACKAGES.find((candidate) => candidate.name === packageName);
  if (!pkg) {
    throw new Error(`${packageName} is not listed in packages/config/workspace.js`);
  }

  return defineConfig(
    // src/generated/ holds generated code, such as the API client's types (M1-T10).
    { ignores: ['dist/', 'coverage/', 'src/generated/'] },
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    {
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir: packageDir },
      },
      rules: {
        'no-restricted-imports': ['error', { patterns: importRestrictions(pkg) }],
        // A leading underscore marks a deliberately unused name, and `const { a, ...rest } = x`
        // is how a field is dropped from an object.
        '@typescript-eslint/no-unused-vars': [
          'error',
          {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            destructuredArrayIgnorePattern: '^_',
            ignoreRestSiblings: true,
          },
        ],
      },
    },
    react ? { files: ['**/*.{ts,tsx}'], ...reactHooks.configs.flat['recommended-latest'] } : {},
    {
      // Config files are plain JavaScript run by Node, outside every tsconfig.
      files: ['**/*.{js,mjs,cjs}'],
      extends: [tseslint.configs.disableTypeChecked],
      languageOptions: { globals: globals.node },
    },
    {
      // AGENTS.md: no `any` and no non-null `!` outside tests. Tests read loosely typed JSON
      // responses, where both keep assertions short.
      files: ['**/*.test.{ts,tsx}', 'test/**'],
      rules: {
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
      },
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
