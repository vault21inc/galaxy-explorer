import { schema } from '@ge/db';
import { redactionBar, toPlainText, type RichText } from '@ge/domain';
import { eq, type SQL } from 'drizzle-orm';
import type { Viewer } from './visibility.ts';

/** Shared by the view payload builders. */

const { entities } = schema;

/** The name fields every view record carries; `nameRedacted` is what labels show by default. */
export function named(row: { name: RichText; namePlain: string; isSpoiler: boolean }) {
  return {
    namePlain: row.namePlain,
    nameSpoiler: row.name.spoiler,
    nameRedacted: row.isSpoiler
      ? redactionBar(row.namePlain)
      : toPlainText(row.name, { redactSpoilers: true }),
    isSpoiler: row.isSpoiler,
  };
}

/** Anonymous readers see published records only (data-model §8). */
export const published = (viewer: Viewer): SQL | undefined =>
  viewer.includeDrafts ? undefined : eq(entities.status, 'published');
