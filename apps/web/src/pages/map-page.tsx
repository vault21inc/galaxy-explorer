import { useParams } from 'react-router';

/** `/u/:universeSlug/:mapSlug`: the galaxy view of one map (M2). For now, it names the map. */
export function MapPage() {
  const { universeSlug, mapSlug } = useParams();
  return (
    <section className="absolute top-14 left-4 rounded-lg border bg-card p-4 text-sm">
      <h1 className="text-xs text-muted-foreground label-caps">Galaxy view</h1>
      <p>
        {universeSlug} / {mapSlug}
      </p>
    </section>
  );
}
