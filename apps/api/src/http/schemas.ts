import { ENTITY_INCLUDES, Uuid } from '@ge/domain';
import { z } from 'zod';
import { problemSchema } from './problems.ts';

/** Shared pieces of route schemas (architecture.md §5). */

/** `{ data: … }` for single items. */
export const envelope = <T extends z.ZodType>(item: T) => z.object({ data: item });

/** `{ data: [...], nextCursor }` for lists. */
export const page = <T extends z.ZodType>(item: T) =>
  z.object({
    data: z.array(item),
    /** Pass as `cursor` to get the next page; null on the last page. */
    nextCursor: Uuid.nullable(),
  });

/** Query flags that arrive as text: "true" or "false". */
const flag = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();

export const listQuery = z.object({
  cursor: Uuid.optional().describe('The `nextCursor` of the previous page.'),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(1_000)
    .default(100)
    .describe('Items per page (1–1,000).'),
});

export const readQuery = z.object({
  spoilers: z
    .enum(['include', 'exclude'])
    .default('include')
    .describe(
      '`exclude` blacks out everything flagged as a potential spoiler before it leaves the server.',
    ),
  includeDrafts: flag.describe('Editors only: include unpublished drafts.'),
});

export const includeQuery = z.object({
  include: z
    .string()
    .regex(new RegExp(`^(${ENTITY_INCLUDES.join('|')})(,(${ENTITY_INCLUDES.join('|')}))*$`))
    .optional()
    .describe(`Comma-separated aspects to embed: ${ENTITY_INCLUDES.join(', ')}.`),
});

/** Splits `include=facts,images` into its parts. */
export function includesOf(include: string | undefined) {
  return (include?.split(',') ?? []) as (typeof ENTITY_INCLUDES)[number][];
}

export const idParams = z.object({ id: Uuid });
export const versionBody = z.strictObject({
  version: z.int().positive().describe('The version you read; a stale one is a 409 conflict.'),
});

/** The error responses every route may give, for the documentation. */
export const problemResponses = {
  400: problemSchema.describe('The request is invalid.'),
  401: problemSchema.describe('Signed out: sign in to do this (M8).'),
  403: problemSchema.describe('This universe can be read, but not changed this way (M8-T11).'),
  404: problemSchema.describe(
    'Not found, or in a universe the requester can’t read, which looks the same (M8-T11).',
  ),
  409: problemSchema.describe('Conflict: a stale version or a duplicate.'),
  422: problemSchema.describe('A rule of the model was broken.'),
} as const;

/** A hidden item under `spoilers=exclude`: only its non-secret fields remain (data-model §7). */
export const redactedItem = z.looseObject({ redacted: z.literal(true), isSpoiler: z.boolean() });
