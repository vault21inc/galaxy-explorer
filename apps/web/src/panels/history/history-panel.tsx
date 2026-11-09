import { ApiError } from '@ge/api-client';
import { useInfiniteQuery } from '@tanstack/react-query';
import { RotateCcw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { historyPage, type HistoryBatch } from '@/api/history.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { Button } from '@/components/ui/button.tsx';
import { useRevert } from '@/editor/use-undo.ts';
import { useHistory } from '@/state/history.ts';
import { useToasts } from '@/state/toasts.ts';
import { relativeTime } from './relative-time.ts';

/** The clock for relative times, ticking every half minute while the panel is open. */
function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, intervalMs);
    return () => {
      window.clearInterval(timer);
    };
  }, [intervalMs]);
  return now;
}

/**
 * The History panel (ux.md §5, M3-T6): every change to the universe, newest first, whoever
 * made it (this session, another one, an API token), with Revert on each. A revert from here
 * is itself a change, so ⌘/Ctrl + Z undoes it. A conflict ("Gudrun changed after this
 * batch") changes nothing and says so in a toast.
 */
export function HistoryPanel({ universeId }: { universeId: string }) {
  const open = useHistory((state) => state.panelOpen);
  if (!open) return null;
  return <HistoryList universeId={universeId} />;
}

function HistoryList({ universeId }: { universeId: string }) {
  const setPanelOpen = useHistory((state) => state.setPanelOpen);
  const changes = useHistory((state) => state.changes);
  const revert = useRevert();
  const [reverting, setReverting] = useState<string | null>(null);
  const now = useNow();
  const history = useInfiniteQuery({
    queryKey: ['history', universeId],
    queryFn: ({ pageParam, signal }) => historyPage(universeId, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  // A change made in this session (or undone) shows up at once.
  const { refetch } = history;
  useEffect(() => {
    void refetch();
  }, [changes, refetch]);

  const onRevert = async (batch: HistoryBatch) => {
    setReverting(batch.id);
    try {
      const id = await revert(batch.id);
      useHistory.getState().record(id);
      useToasts.getState().show(`Reverted “${batch.description}”`);
    } catch (error) {
      const reason =
        error instanceof ApiError || error instanceof Error ? errorMessage(error) : 'unknown error';
      useToasts.getState().show(reason, 'error');
    } finally {
      setReverting(null);
    }
  };

  const batches = history.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <aside
      aria-label="History"
      className="absolute top-16 left-4 flex max-h-[calc(100%-9rem)] w-80 flex-col rounded-lg border bg-card"
    >
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <h2 className="text-sm font-semibold">History</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close history"
          onClick={() => {
            setPanelOpen(false);
          }}
        >
          <X aria-hidden />
        </Button>
      </div>
      <div className="overflow-y-auto p-1">
        {history.error ? (
          <p role="alert" className="p-2 text-sm text-destructive">
            {errorMessage(history.error)}
          </p>
        ) : !history.data ? (
          <p role="status" className="p-2 text-sm text-muted-foreground">
            Loading…
          </p>
        ) : batches.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">No changes yet.</p>
        ) : (
          <ol aria-label="Changes" className="flex flex-col">
            {batches.map((batch) => (
              <li
                key={batch.id}
                className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm" title={batch.description}>
                    {batch.description}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {batch.actorLabel} ·{' '}
                    <time dateTime={batch.createdAt}>{relativeTime(batch.createdAt, now)}</time>
                    {batch.revertedBy.length > 0 && <> · reverted</>}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Revert “${batch.description}”`}
                  title={batch.revertedBy.length > 0 ? 'Already reverted' : 'Revert this change'}
                  disabled={batch.revertedBy.length > 0 || reverting !== null}
                  onClick={() => {
                    void onRevert(batch);
                  }}
                >
                  <RotateCcw aria-hidden />
                </Button>
              </li>
            ))}
          </ol>
        )}
        {history.hasNextPage && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            disabled={history.isFetchingNextPage}
            onClick={() => {
              void history.fetchNextPage();
            }}
          >
            Show older changes
          </Button>
        )}
      </div>
    </aside>
  );
}
