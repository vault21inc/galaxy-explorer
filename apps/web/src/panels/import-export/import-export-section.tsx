import { CSV_COLUMNS } from '@ge/domain';
import { Download } from 'lucide-react';
import { useId, useState } from 'react';
import { useMaps } from '@/api/containers.ts';
import { mapExportUrl, universeExportUrl } from '@/api/exchange.ts';
import { Button } from '@/components/ui/button.tsx';
import { cn } from '@/lib/utils.ts';
import { INPUT_CLASS } from '../entity-form/fields/field-row.tsx';
import { ImportForm } from './import-form.tsx';

/**
 * The settings page's "Import and export" (M7-T4): the universe or one map as a zip, and an
 * import of such a zip or of a CSV of objects, checked before it's applied.
 */
export function ImportExportSection({ universeId }: { universeId: string }) {
  const maps = useMaps(universeId).data ?? [];
  const [mapId, setMapId] = useState('');
  const mapSelectId = useId();
  const chosenMap = mapId || maps[0]?.id;
  return (
    <section aria-labelledby="settings-exchange" className="flex flex-col gap-4">
      <h2 id="settings-exchange" className="text-xs text-muted-foreground label-caps">
        Import and export
      </h2>
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground">
          A zip of the content as JSON, with its images: for a backup, another install, or editing
          outside the app. Drafts and spoilers are included.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild size="sm" variant="outline">
            <a href={universeExportUrl(universeId)} download>
              <Download aria-hidden />
              Export the universe
            </a>
          </Button>
          {maps.length > 0 && (
            <>
              <label htmlFor={mapSelectId} className="text-muted-foreground">
                or one map
              </label>
              <select
                id={mapSelectId}
                className={cn(INPUT_CLASS, 'w-56')}
                value={chosenMap ?? ''}
                onChange={(event) => {
                  setMapId(event.currentTarget.value);
                }}
              >
                {maps.map((map) => (
                  <option key={map.id} value={map.id}>
                    {map.namePlain}
                  </option>
                ))}
              </select>
              {chosenMap && (
                <Button asChild size="sm" variant="outline">
                  <a href={mapExportUrl(chosenMap)} download>
                    <Download aria-hidden />
                    Export the map
                  </a>
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground">
          Import an export’s zip, or a CSV of objects with the columns{' '}
          <span className="font-mono text-xs">{CSV_COLUMNS.join(', ')}</span> (keys refer to other
          rows or to entries already on the map). The import is checked first, and is one change you
          can undo.
        </p>
        <ImportForm universeId={universeId} maps={maps} />
      </div>
    </section>
  );
}
