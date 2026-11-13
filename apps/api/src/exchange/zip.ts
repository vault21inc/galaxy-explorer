import { unzipSync, zipSync, type Zippable } from 'fflate';
import { RuleViolation } from '../services/errors.ts';

/**
 * Zip files for import and export (M7-T4), with fflate (D-36): small, no dependencies, and
 * fast enough to pack a few thousand records in memory.
 */

/** The largest import upload, in bytes. */
export const MAX_IMPORT_BYTES = 200 * 1024 * 1024;
/** What an import may unpack to: a guard against a small zip that inflates to gigabytes. */
const MAX_UNZIPPED_BYTES = 1024 * 1024 * 1024;
const MAX_ENTRIES = 100_000;

export interface ZipEntry {
  path: string;
  data: Uint8Array;
  /** Already compressed (images): stored as is rather than deflated again. */
  stored?: boolean;
}

export function writeZip(entries: readonly ZipEntry[], mtime: Date): Uint8Array {
  const files: Zippable = {};
  for (const entry of entries) {
    files[entry.path] = [entry.data, { level: entry.stored ? 0 : 6, mtime }];
  }
  return zipSync(files);
}

/**
 * The files in a zip, by path. Sizes are checked from the zip's directory before anything is
 * inflated, and paths that climb out (`..`) or are absolute are refused; folders and macOS's
 * `__MACOSX` copies are skipped.
 */
export function readZip(data: Uint8Array): Map<string, Uint8Array> {
  let total = 0;
  let count = 0;
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(data, {
      filter: (file) => {
        if (file.name.endsWith('/') || file.name.startsWith('__MACOSX/')) return false;
        if (file.name.startsWith('/') || file.name.split('/').includes('..')) {
          throw new RuleViolation(`The zip has a path outside it: ${file.name}.`);
        }
        total += file.originalSize;
        count++;
        if (total > MAX_UNZIPPED_BYTES || count > MAX_ENTRIES) {
          throw new RuleViolation('The zip unpacks to more than an import may hold.');
        }
        return true;
      },
    });
  } catch (error) {
    if (error instanceof RuleViolation) throw error;
    throw new RuleViolation(`This isn’t a zip file that can be read (${String(error)}).`);
  }
  return new Map(Object.entries(unzipped));
}
