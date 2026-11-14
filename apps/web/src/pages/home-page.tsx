import { Link } from 'react-router';
import { useUniverses } from '@/api/containers.ts';
import { useCanEdit } from '@/editor/use-can-edit.ts';
import { containerName } from '@/lib/container-name.ts';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { StatusPanel } from '@/app/status-panel.tsx';
import { NewUniverseForm } from './new-universe-form.tsx';

/** `/`: every universe, and a form to start a new one (ux.md §9). */
export function HomePage() {
  const universes = useUniverses();
  const policy = useSpoilerPolicy();
  const canEdit = useCanEdit();

  if (universes.error) {
    return (
      <StatusPanel
        tone="error"
        title="Couldn't load the universes"
        onRetry={() => void universes.refetch()}
      >
        {errorMessage(universes.error)}
      </StatusPanel>
    );
  }
  if (!universes.data) return <StatusPanel tone="loading" title="Loading universes…" />;

  return (
    <main className="absolute top-16 left-4 flex max-h-[calc(100%-5rem)] w-80 flex-col gap-4 overflow-y-auto rounded-lg border bg-card p-4 text-sm">
      <section aria-labelledby="universes-heading">
        <h1 id="universes-heading" className="mb-2 text-xs text-muted-foreground label-caps">
          Universes
        </h1>
        {universes.data.length === 0 ? (
          <p className="text-muted-foreground">No universes yet. Start one below.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {universes.data.map((universe) => (
              <li key={universe.id}>
                <Link
                  to={`/u/${universe.slug}`}
                  className="block rounded-md px-2 py-1.5 hover:bg-accent focus-visible:bg-accent"
                >
                  {containerName(universe, policy)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {/* Anyone may create a universe on a server without accounts; with them, a signed-in
          account (M8-T1; M8-T11 makes it the owner). */}
      {canEdit && <NewUniverseForm />}
    </main>
  );
}
