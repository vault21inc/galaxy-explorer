import { useId } from 'react';
import { Link } from 'react-router';
import { useStorage } from '@/api/account.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { formatBytes } from '@/lib/bytes.ts';

/** Storage (ux.md §13): how much of the media quota is used, by universe. */
export function StorageSection() {
  const id = useId();
  const storage = useStorage();
  const data = storage.data;
  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-2">
      <h2 id={`${id}-heading`} className="text-xs text-muted-foreground label-caps">
        Storage
      </h2>
      {storage.error && (
        <p role="alert" className="text-destructive">
          {errorMessage(storage.error)}
        </p>
      )}
      {data && (
        <>
          <p>
            {formatBytes(data.usedBytes)} of {formatBytes(data.quotaBytes)} used by the images in
            your universes.
          </p>
          <meter
            aria-label="Media quota used"
            min={0}
            max={data.quotaBytes}
            value={data.usedBytes}
            className="h-2 w-full"
          />
          {data.universes.length > 0 && (
            <ul className="flex flex-col gap-1">
              {data.universes.map((universe) => (
                <li key={universe.id} className="flex justify-between gap-3">
                  <Link to={`/u/${universe.slug}`} className="text-primary underline">
                    {universe.name}
                  </Link>
                  <span className="text-muted-foreground">{formatBytes(universe.bytes)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
