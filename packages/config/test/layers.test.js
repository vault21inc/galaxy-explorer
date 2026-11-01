import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { WORKSPACE_PACKAGES } from '../workspace.js';

// Proves the layering rules of docs/plan/architecture.md §2. For every package that exists,
// each module it must not import is reported by its own ESLint config, and each workspace
// package it depends on is not.

const repoRoot = resolve(import.meta.dirname, '../../..');
const createdPackages = WORKSPACE_PACKAGES.filter((pkg) =>
  existsSync(join(repoRoot, pkg.dir, 'eslint.config.js')),
);

/** @type {Map<string, ESLint>} */
const linters = new Map();

/**
 * Lints `source` as if it were `<package>/src/layer-check.ts`, using the package's own config,
 * and returns the `no-restricted-imports` messages.
 *
 * @param {{ name: string, dir: string }} pkg
 * @param {string} source
 */
async function restrictedImportMessages(pkg, source) {
  const packageDir = join(repoRoot, pkg.dir);
  let eslint = linters.get(pkg.name);
  if (!eslint) {
    eslint = new ESLint({
      cwd: packageDir,
      overrideConfigFile: join(packageDir, 'eslint.config.js'),
      // The linted file doesn't exist on disk, so rules that need type information are off.
      overrideConfig: tseslint.configs.disableTypeChecked,
    });
    linters.set(pkg.name, eslint);
  }
  const [result] = await eslint.lintText(source, {
    filePath: join(packageDir, 'src', 'layer-check.ts'),
  });
  return (result?.messages ?? []).filter((message) => message.ruleId === 'no-restricted-imports');
}

/**
 * Workspace packages a package lists as dependencies; @ge/config is tooling, not imported by code.
 *
 * @param {{ dir: string }} pkg
 */
function workspaceDependencies(pkg) {
  const manifest = JSON.parse(readFileSync(join(repoRoot, pkg.dir, 'package.json'), 'utf8'));
  return Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).filter(
    (name) => name.startsWith('@ge/') && name !== '@ge/config',
  );
}

/** A concrete module name for a pattern such as `@react-three/*`. */
const example = (/** @type {string} */ spec) => spec.replace('*', 'example');

describe('workspace layering', () => {
  it('covers the packages under test', () => {
    expect(createdPackages.map((pkg) => pkg.name)).toEqual(
      expect.arrayContaining(['@ge/domain', '@ge/db', '@ge/api-client', '@ge/api', '@ge/web']),
    );
  });
});

describe.each(createdPackages)('$name', (pkg) => {
  it.each(pkg.mustNotImport.map(example))('rejects importing %s', async (moduleName) => {
    const messages = await restrictedImportMessages(pkg, `import '${moduleName}';`);
    expect(messages.length).toBeGreaterThan(0);
  });

  it('rejects type-only imports of a forbidden module too', async () => {
    const forbidden = example(pkg.mustNotImport[0] ?? '');
    const messages = await restrictedImportMessages(pkg, `import type { X } from '${forbidden}';`);
    expect(messages.length).toBeGreaterThan(0);
  });

  it('rejects relative imports into another package', async () => {
    const source = `import '../../../packages/domain/src/index.ts';`;
    const messages = await restrictedImportMessages(pkg, source);
    expect(messages.length).toBeGreaterThan(0);
  });

  const dependencies = workspaceDependencies(pkg);
  if (dependencies.length > 0) {
    it.each(dependencies)('allows importing its dependency %s', async (moduleName) => {
      expect(await restrictedImportMessages(pkg, `import '${moduleName}';`)).toHaveLength(0);
    });
  }
});
