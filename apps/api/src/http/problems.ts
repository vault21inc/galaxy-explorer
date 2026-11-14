import { STATUS_CODES } from 'node:http';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';
import { BatchNotFoundError, databaseErrorOf, RevertConflictError } from '@ge/db';
import { z } from 'zod';
import {
  LinkGone,
  LinkNotFound,
  NotSignedIn,
  Refused,
  SignInFailed,
  TooManyAttempts,
  UsernameTaken,
} from '../auth/errors.ts';
import { BatchOperationError } from '../services/batch-service.ts';
import { UnsupportedImage } from '../storage/image-pipeline.ts';
import {
  ImportBlocked,
  InvalidRequest,
  NotFound,
  QuotaExceeded,
  RevertConflicts,
  RuleViolation,
  UpstreamError,
  VersionConflict,
} from '../services/errors.ts';

/**
 * Every error response is an RFC 9457 "problem details" document
 * (docs/plan/architecture.md §5, §12).
 */
export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  /** On a 409 version conflict: the record as it is now, so the client can merge. */
  current: z.unknown().optional(),
  /** For a batch request: the index of the operation that failed (0-based). */
  operationIndex: z.int().optional(),
  /** On a 409 revert conflict: the rows that changed since the batch, and their entities. */
  conflicts: z
    .array(
      z.object({
        table: z.string(),
        primaryKey: z.record(z.string(), z.unknown()),
        entityId: z.string().nullable(),
        name: z.string().nullable(),
      }),
    )
    .optional(),
  /** On a 409 blocked import (M7-T4): the report listing what stopped it. */
  report: z.unknown().optional(),
});

export type Problem = z.infer<typeof problemSchema>;

const PROBLEM_CONTENT_TYPE = 'application/problem+json';

export function problem(
  status: number,
  detail?: string,
  errors?: Problem['errors'],
  extra: Pick<Problem, 'current' | 'conflicts' | 'operationIndex' | 'report'> = {},
): Problem {
  return {
    type: 'about:blank',
    title: STATUS_CODES[status] ?? 'Error',
    status,
    ...(detail === undefined ? {} : { detail }),
    ...(errors === undefined ? {} : { errors }),
    ...extra,
  };
}

function sendProblem(reply: FastifyReply, body: Problem) {
  return reply.code(body.status).type(PROBLEM_CONTENT_TYPE).send(body);
}

/** Maps every thrown error to a problem response. Internal details stay in the log. */
export function handleError(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  if (hasZodFastifySchemaValidationErrors(error)) {
    const errors = error.validation.map((issue) => ({
      path: issue.instancePath || '/',
      message: issue.message ?? 'Invalid value',
    }));
    const part = error.validationContext ?? 'request';
    return sendProblem(reply, problem(400, `The ${part} is invalid.`, errors));
  }

  // Too many tries (M8-T1): say when to try again, in the header too.
  if (error instanceof TooManyAttempts) {
    void reply.header('retry-after', String(error.retryAfterS));
  }
  const domainProblem = problemForDomainError(error);
  if (domainProblem) {
    if (domainProblem.status >= 500) request.log.error({ err: error }, 'batch operation failed');
    return sendProblem(reply, domainProblem);
  }

  if (isResponseSerializationError(error)) {
    request.log.error({ err: error }, 'response did not match its schema');
    return sendProblem(reply, problem(500));
  }

  const status = error.statusCode ?? 500;
  if (status >= 400 && status < 500) {
    return sendProblem(reply, problem(status, error.message));
  }

  request.log.error({ err: error }, 'unhandled error');
  return sendProblem(reply, problem(500));
}

export function handleNotFound(request: FastifyRequest, reply: FastifyReply) {
  return sendProblem(reply, problem(404, `No route for ${request.method} ${request.url}.`));
}

/**
 * Problems for the services' typed errors (architecture.md §12) and for database constraint
 * violations that slipped past the service rules. Returns undefined for anything else.
 */
export function problemForDomainError(error: unknown): Problem | undefined {
  if (error instanceof BatchOperationError) return problemForOperation(error);
  const authProblem = problemForAuthError(error);
  if (authProblem) return authProblem;
  if (error instanceof RuleViolation) {
    return problem(
      422,
      error.message,
      error.path ? [{ path: error.path, message: error.message }] : undefined,
    );
  }
  if (error instanceof InvalidRequest) return problem(400, error.message, error.problems);
  if (error instanceof ImportBlocked) {
    return problem(409, error.message, undefined, { report: error.report });
  }
  if (error instanceof UpstreamError) return problem(502, error.message);
  // Too big for the owner's media quota (M8-T11): payload too large.
  if (error instanceof QuotaExceeded) return problem(413, error.message);
  // An upload that isn't an image we take: unsupported media type.
  if (error instanceof UnsupportedImage) return problem(415, error.message);
  if (error instanceof NotFound || error instanceof BatchNotFoundError)
    return problem(404, error.message);
  if (error instanceof VersionConflict)
    return problem(409, error.message, undefined, { current: error.current });
  if (error instanceof RevertConflicts) {
    return problem(409, error.message, undefined, { conflicts: error.conflicts });
  }
  if (error instanceof RevertConflictError) {
    return problem(409, error.message, undefined, {
      conflicts: [{ table: error.table, primaryKey: error.primaryKey, entityId: null, name: null }],
    });
  }
  if (error instanceof z.ZodError) {
    return problem(
      400,
      'The request body is invalid.',
      error.issues.map((issue) => ({ path: `/${issue.path.join('/')}`, message: issue.message })),
    );
  }
  const database = databaseErrorOf(error);
  switch (database?.code) {
    case '23505':
      return problem(
        409,
        `That would duplicate an existing record (${database.constraint ?? 'unique'}).`,
      );
    case '23503':
      return problem(
        422,
        `That refers to something that doesn't exist or is in use (${database.constraint ?? 'reference'}).`,
      );
    // A RESTRICT foreign key: deleting something still in use, such as a group type with groups.
    case '23001':
      return problem(
        409,
        `That is still in use, so it can't be deleted (${database.constraint ?? 'reference'}).`,
      );
    case '23514':
      return problem(
        422,
        `A value is out of range or badly formatted (${database.constraint ?? 'check'}).`,
      );
    default:
      return undefined;
  }
}

/** Fields of a batch operation itself, as opposed to its `data`. */
const OPERATION_FIELDS = new Set([
  '/id',
  '/version',
  '/mapId',
  '/universeId',
  '/externalKey',
  '/kind',
]);

/**
 * A failed batch operation: the underlying problem, with the operation's index and its error
 * paths pointing into the request (`/operations/37/data/parentId`).
 */
function problemForOperation(error: BatchOperationError): Problem {
  const inner = problemForDomainError(error.cause) ?? problem(500);
  const prefix = `/operations/${String(error.index)}`;
  return {
    ...inner,
    detail: `Operation ${String(error.index)} (${error.op}): ${inner.status === 500 ? 'it failed unexpectedly.' : (inner.detail ?? inner.title)}`,
    operationIndex: error.index,
    ...(inner.errors
      ? {
          errors: inner.errors.map((issue) => ({
            ...issue,
            path: OPERATION_FIELDS.has(issue.path)
              ? `${prefix}${issue.path}`
              : `${prefix}/data${issue.path === '/' ? '' : issue.path}`,
          })),
        }
      : {}),
  };
}

/** Problems for account and sign-in errors (M8-T1, auth/errors.ts). */
function problemForAuthError(error: unknown): Problem | undefined {
  if (error instanceof NotSignedIn || error instanceof SignInFailed) {
    return problem(401, error.message);
  }
  if (error instanceof Refused) return problem(403, error.message);
  if (error instanceof LinkNotFound) return problem(404, error.message);
  if (error instanceof UsernameTaken) return problem(409, error.message);
  if (error instanceof LinkGone) return problem(410, error.message);
  if (error instanceof TooManyAttempts) return problem(429, error.message);
  return undefined;
}
