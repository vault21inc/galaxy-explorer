import { STATUS_CODES } from 'node:http';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';
import { z } from 'zod';

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
});

export type Problem = z.infer<typeof problemSchema>;

const PROBLEM_CONTENT_TYPE = 'application/problem+json';

export function problem(status: number, detail?: string, errors?: Problem['errors']): Problem {
  return {
    type: 'about:blank',
    title: STATUS_CODES[status] ?? 'Error',
    status,
    ...(detail === undefined ? {} : { detail }),
    ...(errors === undefined ? {} : { errors }),
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
