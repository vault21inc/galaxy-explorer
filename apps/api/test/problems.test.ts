import { BatchNotFoundError, RevertConflictError } from '@ge/db';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { problemForDomainError } from '../src/http/problems.ts';
import { NotFound, RuleViolation, VersionConflict } from '../src/services/errors.ts';

/** A Postgres error as Drizzle wraps it: the driver error is the `cause`. */
const databaseError = (code: string, constraint: string) =>
  Object.assign(new Error('query failed'), {
    cause: Object.assign(new Error('pg'), { code, constraint }),
  });

describe('problemForDomainError (architecture.md §12)', () => {
  it.each([
    [
      'RuleViolation',
      new RuleViolation('Bad parent.', '/parentId'),
      {
        status: 422,
        detail: 'Bad parent.',
        errors: [{ path: '/parentId', message: 'Bad parent.' }],
      },
    ],
    ['NotFound', new NotFound('map', 'm1'), { status: 404, detail: 'No map with id m1.' }],
    ['BatchNotFoundError', new BatchNotFoundError('b1'), { status: 404 }],
    [
      'VersionConflict',
      new VersionConflict({ id: 'e1', version: 3 }),
      { status: 409, current: { id: 'e1', version: 3 } },
    ],
    [
      'RevertConflictError',
      new RevertConflictError('entities', { id: 'e1' }),
      { status: 409, conflict: { table: 'entities', primaryKey: { id: 'e1' } } },
    ],
    [
      'a unique violation',
      databaseError('23505', 'entities_external_key_uq'),
      { status: 409, detail: expect.stringContaining('entities_external_key_uq') as string },
    ],
    ['a foreign key violation', databaseError('23503', 'entity_images_asset_fk'), { status: 422 }],
    ['a check violation', databaseError('23514', 'maps_slug_format'), { status: 422 }],
  ])('maps %s', (_label, error, expected) => {
    expect(problemForDomainError(error)).toMatchObject({ type: 'about:blank', ...expected });
  });

  it('maps a Zod error to 400 with paths', () => {
    const result = z.object({ x: z.number() }).safeParse({ x: 'no' });
    expect(problemForDomainError(result.error)).toMatchObject({
      status: 400,
      errors: [{ path: '/x' }],
    });
  });

  it('leaves other errors to the generic handler', () => {
    expect(problemForDomainError(new Error('boom'))).toBeUndefined();
  });
});
