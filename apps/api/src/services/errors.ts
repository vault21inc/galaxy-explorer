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
