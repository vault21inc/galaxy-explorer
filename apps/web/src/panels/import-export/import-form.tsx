import type { ImportMode } from '@ge/domain';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import type { GalaxyMap } from '@/api/containers.ts';
import { ImportFileError, runImport, type ImportReport } from '@/api/exchange.ts';
import { Button } from '@/components/ui/button.tsx';
import { cn } from '@/lib/utils.ts';
import { useToasts } from '@/state/toasts.ts';
import { INPUT_CLASS } from '../entity-form/fields/field-row.tsx';
import { ImportReportView } from './import-report.tsx';

/**
 * Importing a file (M7-T4): choose it, say how, check it (a dry run, whose report shows what
 * would happen), then import it. Changing the file or the mode asks for a new check.
 */

const MODES: { mode: ImportMode; label: string; hint: string }[] = [
  {
    mode: 'create',
    label: 'Add as new',
    hint: 'Everything in the file becomes a new entry. A key, or a map with entries, already here is a conflict; an empty map of the same name is filled.',
  },
  {
    mode: 'merge',
    label: 'Update by key',
    hint: 'Entries whose key is already here are updated; the rest are added. Entries without a key are left out.',
  },
];

const isCsv = (file: File | null) => file?.name.toLowerCase().endsWith('.csv') ?? false;

export function ImportForm({
  universeId,
  maps,
}: {
  universeId: string;
  maps: readonly GalaxyMap[];
}) {
  const queryClient = useQueryClient();
  const fileId = useId();
  const mapSelectId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<ImportMode>('create');
  const [mapId, setMapId] = useState('');
  const [busy, setBusy] = useState<'check' | 'import' | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [failure, setFailure] = useState<ImportFileError | null>(null);
  const csv = isCsv(file);
  const target = csv ? mapId || maps[0]?.id : undefined;

  /** Any change to what would be imported needs a new check. */
  const changed = () => {
    setReport(null);
    setFailure(null);
  };

  const send = async (dryRun: boolean) => {
    if (!file) return;
    setBusy(dryRun ? 'check' : 'import');
    setFailure(null);
    try {
      const result = await runImport(universeId, file, { mode, dryRun, mapId: target });
      setReport(result);
      if (!dryRun && !result.blocked) {
        // An import can touch anything in the universe: refetch it all.
        await queryClient.invalidateQueries();
        useToasts.getState().show(`Imported ${file.name}`, 'info');
      }
    } catch (error) {
      setReport(null);
      if (error instanceof ImportFileError) setFailure(error);
      else useToasts.getState().show(`The import failed: ${String(error)}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const checked = report !== null && report.dryRun && !report.blocked;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={fileId} className="text-muted-foreground">
          File to import
        </label>
        <input
          id={fileId}
          type="file"
          accept=".zip,.csv,application/zip,text/csv"
          className="text-xs file:mr-3 file:rounded-md file:border file:bg-transparent file:px-2 file:py-1 file:text-sm"
          onChange={(event) => {
            setFile(event.currentTarget.files?.[0] ?? null);
            changed();
          }}
        />
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-muted-foreground">How</legend>
        {MODES.map((item) => (
          <label key={item.mode} className="flex items-start gap-2">
            <input
              type="radio"
              name="import-mode"
              className="mt-1"
              checked={mode === item.mode}
              onChange={() => {
                setMode(item.mode);
                changed();
              }}
            />
            <span>
              {item.label}
              <span className="block text-xs text-muted-foreground">{item.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {csv && (
        <div className="flex items-center gap-3">
          <label htmlFor={mapSelectId} className="text-muted-foreground">
            Map for the CSV’s objects
          </label>
          <select
            id={mapSelectId}
            className={cn(INPUT_CLASS, 'w-56')}
            value={target ?? ''}
            onChange={(event) => {
              setMapId(event.currentTarget.value);
              changed();
            }}
          >
            {maps.map((map) => (
              <option key={map.id} value={map.id}>
                {map.namePlain}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!file || busy !== null || (csv && !target)}
          onClick={() => void send(true)}
        >
          {busy === 'check' ? 'Checking…' : 'Check'}
        </Button>
        <Button size="sm" disabled={!checked || busy !== null} onClick={() => void send(false)}>
          {busy === 'import' ? 'Importing…' : 'Import'}
        </Button>
      </div>
      {failure && (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-md border border-destructive p-3 text-xs"
        >
          <p className="font-medium text-destructive">{failure.message}</p>
          <ul className="max-h-48 overflow-y-auto">
            {failure.problems.map((problem, index) => (
              <li key={`${problem.path}-${String(index)}`}>
                <span className="font-mono text-muted-foreground">{problem.path}</span>:{' '}
                {problem.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {report && <ImportReportView report={report} />}
    </div>
  );
}
