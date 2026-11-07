/**
 * @ge/domain: pure TypeScript shared by every package: Zod schemas, registries, rich text,
 * spoiler redaction and geo math. No database, React, three.js or Node built-ins
 * (architecture.md §2), because it runs in the browser too.
 */
export { HexColor } from './colors.ts';
export { Slug, Uuid } from './ids.ts';
export * from './richtext/index.ts';
export * from './spoilers/index.ts';
export type { Deg, Ly, Px, Radii, Su } from './units.ts';
