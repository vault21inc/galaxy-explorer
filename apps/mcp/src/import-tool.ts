import type { ApiClient } from '@ge/api-client';
import { loose, resultOf, type ToolResult } from './call-tool.ts';

/**
 * `import_dry_run` (M7-T4, M7-T7): what importing a file would do, without writing anything.
 * The import route takes a multipart upload, which a tool can't describe as JSON, so this tool
 * takes the file's content instead: a CSV as text, or an export's zip in base64.
 */

export const IMPORT_TOOL = {
  name: 'import_dry_run',
  description:
    'Checks an import without writing anything: a CSV of objects (columns name, base_type, x, y, z, parent_key, group_key, external_key; it needs `mapId`), or an export zip in base64. ' +
    'Returns the report: records created, updated, kept and left out per kind; conflicts and references to nothing (which would block the import); notes. ' +
    '`mode` is create (everything new; keys or map slugs already used are conflicts) or merge (update by externalKey, add the rest, leave out entries without a key).',
  inputSchema: {
    type: 'object',
    properties: {
      universeId: { type: 'string', format: 'uuid' },
      mode: { type: 'string', enum: ['create', 'merge'], default: 'create' },
      mapId: {
        type: 'string',
        format: 'uuid',
        description: 'For a CSV: the map its objects go on.',
      },
      csv: { type: 'string', description: 'A CSV file’s text.' },
      zipBase64: { type: 'string', description: 'An export zip, base64-encoded.' },
    },
    required: ['universeId'],
    additionalProperties: false,
  },
} as const;

export async function importDryRun(
  client: ApiClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const {
    universeId,
    mode = 'create',
    mapId,
    csv,
    zipBase64,
  } = args as {
    universeId: string;
    mode?: string;
    mapId?: string;
    csv?: string;
    zipBase64?: string;
  };
  const file =
    typeof csv === 'string'
      ? new Blob([csv], { type: 'text/csv' })
      : typeof zipBase64 === 'string'
        ? new Blob([Buffer.from(zipBase64, 'base64')], { type: 'application/zip' })
        : null;
  if (!file) {
    return { isError: true, content: [{ type: 'text', text: 'Give `csv` or `zipBase64`.' }] };
  }
  const form = new FormData();
  form.append('file', file, typeof csv === 'string' ? 'import.csv' : 'import.zip');
  const result = await loose(client).POST('/api/v1/universes/{universeId}/import', {
    params: {
      path: { universeId },
      query: { mode, dryRun: 'true', ...(mapId ? { mapId } : {}) },
    },
    body: form,
    // The multipart boundary is the runtime's to set; JSON-encoding the form would break it.
    bodySerializer: (body) => body,
  });
  return resultOf(result);
}
