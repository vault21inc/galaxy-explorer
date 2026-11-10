import { isHidden, spoilerKeys } from '@ge/domain';
import { Layers } from 'lucide-react';
import { useId } from 'react';
import { Link, useParams } from 'react-router';
import { useViewPayload } from '@/api/hooks.ts';
import { useReadOptions } from '@/api/read-options.ts';
import { useUniverseRoute } from '@/app/use-universe-route.ts';
import { Button } from '@/components/ui/button.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.tsx';
import { activeLayerOf } from '@/editor/actions/group.ts';
import { labelText } from '@/render/labels/label-text.ts';
import { REDACTION_COLOR } from '@/render/tuning.ts';
import { useEditor } from '@/state/editor.ts';
import { isTypeShown, useLayers, useLayerVisibility } from '@/state/layers.ts';
import { useSpoilerPolicy } from '@/state/spoilers.ts';

/**
 * The Layers popover (M4-T5, ux.md §1): which layers and group types are drawn, remembered per
 * browser, and a legend of the groups shown, in their colors. In edit mode it also picks the
 * layer that grouping commands work in (⌘/Ctrl + Shift + G, "Remove from group").
 */
export function LayersPopover() {
  const id = useId();
  const { universeSlug = '', mapSlug } = useParams();
  const route = useUniverseRoute(universeSlug, mapSlug);
  const mapId = route.status === 'ready' ? route.map?.id : undefined;
  const view = useViewPayload('galaxy', mapId, useReadOptions());
  const universeId = route.status === 'ready' ? route.universe.id : '';
  const visibility = useLayerVisibility(universeId);
  const setLayerHidden = useLayers((state) => state.setLayerHidden);
  const setTypeHidden = useLayers((state) => state.setTypeHidden);
  const activeLayer = useLayers((state) => state.activeLayer);
  const setActiveLayer = useLayers((state) => state.setActiveLayer);
  const editing = useEditor((state) => state.editing);
  const policy = useSpoilerPolicy();

  const types = (view.data?.groupTypes ?? []).toSorted((a, b) => a.sortKey - b.sortKey);
  const layers = [...new Set(types.map((type) => type.layer))];
  const groupingLayer = activeLayerOf(activeLayer, types);
  const typesById = new Map(types.map((type) => [type.id as string, type]));
  const legend = (view.data?.groups ?? [])
    .filter((group) => isTypeShown(typesById.get(group.groupTypeId), visibility))
    .map((group) => {
      const redacted = isHidden(group.isSpoiler, spoilerKeys.record(group.id), policy);
      return {
        id: group.id,
        name: labelText(group, policy),
        color: redacted ? REDACTION_COLOR : group.outlineColor,
        order: types.findIndex((type) => type.id === group.groupTypeId),
      };
    })
    .toSorted((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="pointer-events-auto gap-1.5">
          <Layers aria-hidden />
          Layers
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex max-h-[70vh] w-72 flex-col gap-3 text-sm">
        {layers.length === 0 ? (
          <p className="text-muted-foreground">
            No layers yet: group types define them.{' '}
            <Link to={`/u/${universeSlug}/settings`} className="text-primary underline">
              Universe settings
            </Link>
          </p>
        ) : (
          <>
            {layers.map((layer) => {
              const layerShown = !visibility.hiddenLayers.has(layer);
              return (
                <fieldset key={layer} className="flex flex-col gap-1">
                  <legend className="sr-only">{layer}</legend>
                  <div className="flex items-center gap-2">
                    <label className="flex flex-1 cursor-pointer items-center gap-2 font-medium">
                      <input
                        type="checkbox"
                        checked={layerShown}
                        className="accent-primary"
                        onChange={(event) => {
                          setLayerHidden(universeId, layer, !event.currentTarget.checked);
                        }}
                      />
                      {layer}
                    </label>
                    {editing && (
                      <label
                        className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground"
                        title="⌘/Ctrl + Shift + G and Remove from group work in this layer"
                      >
                        <input
                          type="radio"
                          name={`${id}-grouping`}
                          checked={groupingLayer === layer}
                          className="accent-primary"
                          onChange={() => {
                            setActiveLayer(layer);
                          }}
                        />
                        Grouping
                      </label>
                    )}
                  </div>
                  {types
                    .filter((type) => type.layer === layer)
                    .map((type) => (
                      <label
                        key={type.id}
                        className="ml-5 flex cursor-pointer items-center gap-2 text-muted-foreground aria-disabled:opacity-50"
                        aria-disabled={!layerShown}
                      >
                        <input
                          type="checkbox"
                          checked={!visibility.hiddenTypes.has(type.id)}
                          disabled={!layerShown}
                          className="accent-primary"
                          onChange={(event) => {
                            setTypeHidden(type.id, !event.currentTarget.checked);
                          }}
                        />
                        {type.name}
                      </label>
                    ))}
                </fieldset>
              );
            })}
            <section aria-labelledby={`${id}-legend`} className="flex min-h-0 flex-col gap-1">
              <h3 id={`${id}-legend`} className="text-xs text-muted-foreground label-caps">
                Legend
              </h3>
              {legend.length === 0 ? (
                <p className="text-muted-foreground">No groups shown.</p>
              ) : (
                <ul aria-label="Legend" className="flex flex-col gap-1 overflow-y-auto">
                  {legend.map((entry) => (
                    <li key={entry.id} className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="size-3 shrink-0 rounded-sm border border-white/20"
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className="truncate">{entry.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
