import type { Executor } from '@ge/db';
import {
  CONFIG_RESOURCES,
  refFieldOf,
  type ConfigResource,
  type ImportCounts,
  type ImportFinding,
  type ImportMode,
  type ImportReport,
  type References,
  type ReferenceTarget,
} from '@ge/domain';
import { problemForDomainError } from '../http/problems.ts';

/**
 * The state of one import (M7-T4): its report, and how references in the file become ids.
 */

type Row = Record<string, unknown>;

/** A reference that leads nowhere: to a record left out, or to nothing at all. */
export interface Missing {
  missing: 'skipped' | 'unknown';
  message: string;
}
export type Resolved = { id: string } | Missing;

export class ImportRun {
  readonly mode: ImportMode;
  readonly dryRun: boolean;
  readonly report: ImportReport;
  /** Image files a real import has written, deleted again if it fails. */
  readonly written: string[] = [];

  constructor(mode: ImportMode, dryRun: boolean) {
    this.mode = mode;
    this.dryRun = dryRun;
    this.report = {
      dryRun,
      mode,
      batchId: null,
      counts: {},
      conflicts: [],
      unresolved: [],
      skipped: [],
      notes: [],
      blocked: false,
    };
  }

  count(section: string, what: keyof ImportCounts): void {
    const counts = (this.report.counts[section] ??= { create: 0, update: 0, keep: 0, skip: 0 });
    counts[what]++;
  }

  #add(list: ImportFinding[], where: string, message: string): void {
    // A long list helps no one: the first few hundred say what's wrong.
    if (list.length < 500) list.push({ where, message });
  }
  conflict(where: string, message: string): void {
    this.#add(this.report.conflicts, where, message);
    this.report.blocked = true;
  }
  unresolved(where: string, message: string): void {
    this.#add(this.report.unresolved, where, message);
    this.report.blocked = true;
  }
  skip(where: string, message: string): void {
    this.#add(this.report.skipped, where, message);
  }
  note(where: string, message: string): void {
    this.#add(this.report.notes, where, message);
  }

  /** Reports a reference that leads nowhere: blocking if it's to nothing, a skip if not. */
  missing(where: string, missing: Missing): void {
    if (missing.missing === 'unknown') this.unresolved(where, missing.message);
    else this.skip(where, missing.message);
  }

  /**
   * Runs one record's writes in a savepoint. If a service refuses them (a rule, a constraint),
   * they're undone, the record is reported as a conflict, and the import goes on to find the
   * rest. Anything else is a bug and stops it.
   */
  async step<T>(
    tx: Executor,
    where: string,
    write: (sp: Executor) => Promise<T>,
  ): Promise<T | undefined> {
    try {
      return await tx.transaction((sp) => write(sp));
    } catch (error) {
      const problem = problemForDomainError(error);
      if (!problem) throw error;
      const field = problem.errors?.[0]?.path;
      const message = problem.detail ?? problem.title;
      this.conflict(where, field ? `${message} (${field})` : message);
      return undefined;
    }
  }
}

/**
 * Entity references in one file: the file's own refs first, then entries already in the
 * universe by external key. A map file reaches the universe file's refs through `parent`.
 */
export class EntityRefs {
  readonly #ids = new Map<string, string>();
  readonly #skipped = new Map<string, string>();
  readonly #existing: ReadonlyMap<string, string>;
  readonly #parent: EntityRefs | null;

  constructor(existing: ReadonlyMap<string, string>, parent: EntityRefs | null = null) {
    this.#existing = existing;
    this.#parent = parent;
  }

  set(ref: string, id: string): void {
    this.#ids.set(ref, id);
  }

  /** A record that wasn't imported: references to it say why. */
  skip(ref: string, why: string): void {
    this.#skipped.set(ref, why);
  }

  /** Whether the file itself has this ref (imported or not). */
  inFile(ref: string): boolean {
    return this.#ids.has(ref) || this.#skipped.has(ref);
  }

  #fromFile(ref: string): Resolved | undefined {
    const id = this.#ids.get(ref);
    if (id) return { id };
    const why = this.#skipped.get(ref);
    if (why) return { missing: 'skipped', message: `“${ref}” isn’t imported: ${why}` };
    return this.#parent ? this.#parent.#fromFile(ref) : undefined;
  }

  #fromUniverse(ref: string): string | undefined {
    return this.#existing.get(ref) ?? (this.#parent ? this.#parent.#fromUniverse(ref) : undefined);
  }

  resolve(ref: string): Resolved {
    const found = this.#fromFile(ref);
    if (found) return found;
    const id = this.#fromUniverse(ref);
    if (id) return { id };
    return {
      missing: 'unknown',
      message: `Nothing in the file or the universe is called “${ref}”.`,
    };
  }
}

/** Settings rows by the file's refs, then by the names of the rows already there. */
export class ConfigRefs {
  readonly #ids = new Map<ConfigResource, Map<string, string>>(
    CONFIG_RESOURCES.map((resource) => [resource, new Map()]),
  );
  readonly #existing: ReadonlyMap<ConfigResource, ReadonlyMap<string, string[]>>;

  constructor(existing: ReadonlyMap<ConfigResource, ReadonlyMap<string, string[]>>) {
    this.#existing = existing;
  }

  set(resource: ConfigResource, ref: string, id: string): void {
    this.#ids.get(resource)?.set(ref, id);
  }

  resolve(resource: ConfigResource, ref: string): Resolved {
    const id = this.#ids.get(resource)?.get(ref);
    if (id) return { id };
    const existing = this.#existing.get(resource)?.get(ref) ?? [];
    if (existing.length === 1 && existing[0]) return { id: existing[0] };
    const what = resource.replace(/_/g, ' ').replace(/s$/, '');
    return {
      missing: 'unknown',
      message:
        existing.length > 1
          ? `More than one ${what} is called “${ref}”; give the file’s row a ref.`
          : `No ${what} is called “${ref}”.`,
    };
  }
}

export interface Resolvers {
  entities: EntityRefs;
  config: ConfigRefs;
  /** Assets by sha256. */
  assets: Map<string, string>;
}

export function resolve(resolvers: Resolvers, target: ReferenceTarget, ref: string): Resolved {
  if (target === 'entity') return resolvers.entities.resolve(ref);
  if (target === 'asset') {
    const id = resolvers.assets.get(ref);
    return id ? { id } : { missing: 'unknown', message: `No asset has the sha256 “${ref}”.` };
  }
  return resolvers.config.resolve(target, ref);
}

/**
 * A record with its references swapped back for ids, the way the services take it, or the
 * first reference that leads nowhere. `drop` leaves fields out (aspects, the record's ref).
 */
export function withIds(
  record: Row,
  references: References,
  resolvers: Resolvers,
  options: { names?: Readonly<Record<string, string>>; drop?: readonly string[] } = {},
): { input: Row } | Missing {
  const { names = {}, drop = [] } = options;
  const input: Row = {};
  const refFields = new Map(
    Object.entries(references).map(([field, target]) => [
      names[field] ?? refFieldOf(field),
      { field, target },
    ]),
  );
  for (const [key, value] of Object.entries(record)) {
    if (drop.includes(key)) continue;
    const id = refFields.get(key);
    if (!id) {
      input[key] = value;
      continue;
    }
    if (value === null || value === undefined) {
      input[id.field] = value;
      continue;
    }
    const found = resolve(resolvers, id.target, value as string);
    if ('missing' in found) return found;
    input[id.field] = found.id;
  }
  return { input };
}
