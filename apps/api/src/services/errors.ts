/**
 * Domain errors (architecture.md §12). Services throw these; the API's error handler turns each
 * into a problem+json response with the status below.
 */

/** A request that is well-formed but breaks a rule of the model: 422. */
export class RuleViolation extends Error {
  override readonly name = 'RuleViolation';
  /** The input field the rule is about, as a JSON pointer such as `/parentId`, if any. */
  readonly path: string | undefined;

  constructor(message: string, path?: string) {
    super(message);
    this.path = path;
  }
}

/** The record doesn't exist, or the reader may not see it (a draft): 404. */
export class NotFound extends Error {
  override readonly name = 'NotFound';

  constructor(what: string, id: string) {
    super(`No ${what} with id ${id}.`);
  }
}

/** The client edited an old version: 409, with the current record so it can merge. */
export class VersionConflict extends Error {
  override readonly name = 'VersionConflict';
  readonly current: unknown;

  constructor(current: unknown) {
    super('This record was changed by someone else. Reload it and try again.');
    this.current = current;
  }
}

/** A revert is blocked because these rows changed after the batch (409). */
export class RevertConflicts extends Error {
  override readonly name = 'RevertConflicts';
  readonly conflicts: {
    table: string;
    primaryKey: Record<string, unknown>;
    entityId: string | null;
    name: string | null;
  }[];

  constructor(conflicts: RevertConflicts['conflicts']) {
    const names = conflicts
      .map((conflict) => conflict.name)
      .filter((name): name is string => Boolean(name));
    super(
      `Can't revert: ${names.length > 0 ? names.join(', ') : 'some records'} changed after this batch. Revert the later changes first.`,
    );
    this.conflicts = conflicts;
  }
}

/** Another service the API relies on (a wiki, M7-T3) failed or answered nonsense: 502. */
export class UpstreamError extends Error {
  override readonly name = 'UpstreamError';
}

/** The request is well-formed but asks for something that doesn't make sense: 400. */
export class InvalidRequest extends Error {
  override readonly name = 'InvalidRequest';
  /** Each thing wrong, where there are several: an import file's mistakes (M7-T4). */
  readonly problems: { path: string; message: string }[] | undefined;

  constructor(message: string, problems?: { path: string; message: string }[]) {
    super(message);
    this.problems = problems;
  }
}

/**
 * An import has conflicts or unresolved references, so nothing was written (M7-T4): 409, with
 * the report that lists them.
 */
export class ImportBlocked extends Error {
  override readonly name = 'ImportBlocked';
  readonly report: unknown;

  constructor(report: unknown) {
    super('The import has conflicts or references to nothing, so nothing was imported.');
    this.report = report;
  }
}

/** An upload that would take the universe's owner past their media quota (M8-T11): 413. */
export class QuotaExceeded extends Error {
  override readonly name = 'QuotaExceeded';
  readonly usedBytes: number;
  readonly quotaBytes: number;

  constructor(usedBytes: number, quotaBytes: number) {
    const mb = (bytes: number) => `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    super(
      `This image would take the universe’s owner past their media quota: ${mb(usedBytes)} of ${mb(quotaBytes)} is used. Delete images, or ask an admin for more.`,
    );
    this.usedBytes = usedBytes;
    this.quotaBytes = quotaBytes;
  }
}

/**
 * Refuses an update with nothing in it (`PATCH` with `{}`): there's nothing to write, and the
 * database can't run an update that sets no column. A 400, like any other bad request.
 */
export function requireChanges(patch: object): void {
  if (Object.keys(patch).length === 0)
    throw new InvalidRequest('Send at least one field to change.');
}
