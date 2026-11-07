/** `/`: will list the universes and their maps. For now, a note over the placeholder sky. */
export function HomePage() {
  return (
    <section className="absolute top-14 left-4 max-w-sm rounded-lg border bg-card p-4 text-sm">
      <h1 className="mb-1 text-xs text-muted-foreground label-caps">Placeholder</h1>
      <p>
        Drag to orbit, scroll or pinch to zoom. The galaxy view arrives in M2; add{' '}
        <code className="text-primary">?perf=1</code> to the address for the performance HUD.
      </p>
    </section>
  );
}
