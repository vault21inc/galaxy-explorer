import type { components } from '@ge/api-client';
import type { ImportMode } from '@ge/domain';
import { api } from './client.ts';

/** Import and export (M7-T4): the settings page's downloads and its import form. */

export type ImportReport = components['schemas']['ImportReport'];

/** Downloads: plain links, so the browser saves the zip the API names. */
export const universeExportUrl = (universeId: string) => `/api/v1/universes/${universeId}/export`;
export const mapExportUrl = (mapId: string) => `/api/v1/maps/${mapId}/export`;

/** The file couldn't be read: each mistake, with the file and place it's in. */
export class ImportFileError extends Error {
  readonly problems: { path: string; message: string }[];

  constructor(message: string, problems: { path: string; message: string }[]) {
    super(message);
    this.problems = problems;
  }
}

/**
 * Imports a file, or with `dryRun` reports what importing it would do. A blocked import's
 * report arrives with its 409 and is returned like any other: the form shows what stopped it.
 * Goes through the shared client, so a real import is an undo step like any other change.
 */
export async function runImport(
  universeId: string,
  file: File,
  options: { mode: ImportMode; dryRun: boolean; mapId?: string },
): Promise<ImportReport> {
  const form = new FormData();
  form.append('file', file);
  const { data, error, response } = await api.POST('/api/v1/universes/{universeId}/import', {
    params: {
      path: { universeId },
      query: {
        mode: options.mode,
        dryRun: options.dryRun ? 'true' : 'false',
        ...(options.mapId ? { mapId: options.mapId } : {}),
      },
    },
    // The browser sets the multipart boundary itself; JSON-encoding it would break it.
    body: form as never,
    bodySerializer: (body: unknown) => body as FormData,
  });
  if (data) return data.data;
  const problem = error as {
    report?: ImportReport;
    detail?: string;
    errors?: { path: string; message: string }[];
  };
  if (response.status === 409 && problem.report) return problem.report;
  throw new ImportFileError(
    problem.detail ?? `The import failed (${String(response.status)}).`,
    problem.errors ?? [],
  );
}
