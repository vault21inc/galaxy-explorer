import { X } from 'lucide-react';
import { useMaps, type GalaxyMap } from '@/api/containers.ts';
import { Button } from '@/components/ui/button.tsx';
import { useSidePanel } from '@/state/side-panel.ts';
import { GalaxySection } from './galaxy-section.tsx';
import { UnderlaySection } from './underlay-section.tsx';
import { useMapSave } from './use-map-save.ts';

/**
 * Map settings (M3-T8, ux.md §1), from the toolbar's Map button: the galaxy's shape and the
 * reference underlay. On the left, where the History panel also opens; one at a time.
 */
export default function MapSettingsPanel({
  universeId,
  mapId,
}: {
  universeId: string;
  mapId: string;
}) {
  const open = useSidePanel((state) => state.left === 'map-settings');
  const maps = useMaps(universeId);
  const map = maps.data?.find((item) => item.id === mapId);
  if (!open || !map) return null;
  return <Panel map={map} />;
}

function Panel({ map }: { map: GalaxyMap }) {
  const save = useMapSave(map);
  return (
    <aside
      aria-label="Map settings"
      className="absolute top-16 left-4 flex max-h-[calc(100%-9rem)] w-80 flex-col rounded-lg border bg-card"
    >
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <h2 className="text-sm font-semibold">Map settings</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close map settings"
          onClick={() => {
            useSidePanel.getState().close();
          }}
        >
          <X aria-hidden />
        </Button>
      </div>
      <div className="flex flex-col gap-5 overflow-y-auto p-3">
        <GalaxySection map={map} save={save} />
        <UnderlaySection map={map} save={save} />
      </div>
    </aside>
  );
}
