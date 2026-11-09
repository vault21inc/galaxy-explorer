import type { Underlay } from '@ge/domain';
import { ImageUp, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { useAsset } from '@/api/assets.ts';
import type { GalaxyMap } from '@/api/containers.ts';
import { Button } from '@/components/ui/button.tsx';
import { Switch } from '@/components/ui/switch.tsx';
import { useGalaxyPreview } from '@/state/galaxy-preview.ts';
import { FieldRow, INPUT_CLASS } from '../entity-form/fields/field-row.tsx';
import { valueKey } from '../entity-form/field-path.ts';
import { AssetPicker } from '../images/asset-picker.tsx';
import { SectionHeading } from '../sections/section-heading.tsx';
import { SettingSlider } from './setting-slider.tsx';
import type { useMapSave } from './use-map-save.ts';

/** Where a new underlay starts: as wide as the baked disc, centred, half see-through. */
function defaultUnderlay(map: GalaxyMap): Underlay {
  const radiusLy = map.galaxySettings.radiusLy ?? 50_000;
  return {
    widthLy: 2.4 * radiusLy,
    rotationDeg: 0,
    offsetX: 0,
    offsetZ: 0,
    opacity: 0.5,
    visible: true,
  };
}

/**
 * The reference underlay (G1, M3-T8): an image under the galaxy, drawn only in edit mode, for
 * tracing positions from a printed or published map. Its width in light-years, rotation,
 * offsets and opacity line it up; each change is one save.
 */
export function UnderlaySection({
  map,
  save,
}: {
  map: GalaxyMap;
  save: ReturnType<typeof useMapSave>;
}) {
  const [picking, setPicking] = useState(false);
  const asset = useAsset(map.underlayAssetId);
  const preview = useGalaxyPreview((state) =>
    state.preview?.mapId === map.id ? state.preview.underlay : undefined,
  );
  const saved = map.underlay;
  const current = preview ?? saved;

  const commit = (underlay: Underlay, description: string) => void save({ underlay }, description);
  const previewWith = (change: Partial<Underlay>) => {
    if (!saved) return;
    useGalaxyPreview.getState().show({ mapId: map.id, underlay: { ...saved, ...change } });
  };

  return (
    <section aria-label="Reference underlay" className="flex flex-col gap-2">
      <SectionHeading>Reference underlay</SectionHeading>
      <p className="text-xs text-muted-foreground">
        An image under the galaxy, shown only in edit mode, to trace positions from.
      </p>
      {map.underlayAssetId && asset.data && (
        <img
          src={asset.data.urls.thumb}
          alt={asset.data.altText ?? 'The underlay image'}
          className="max-h-28 self-start rounded border"
        />
      )}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setPicking(true);
          }}
        >
          <ImageUp aria-hidden />
          {map.underlayAssetId ? 'Replace image' : 'Choose image'}
        </Button>
        {map.underlayAssetId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void save({ underlayAssetId: null, underlay: null }, 'Remove the underlay');
            }}
          >
            <Trash2 aria-hidden />
            Remove
          </Button>
        )}
      </div>

      {map.underlayAssetId && current && saved && (
        <>
          <NumberRow
            label="Width (ly)"
            value={current.widthLy}
            min={1}
            onCommit={(widthLy) => {
              commit({ ...saved, widthLy }, 'Underlay width');
            }}
          />
          <SettingSlider
            label="Rotation"
            value={current.rotationDeg}
            min={-180}
            max={180}
            step={1}
            format={(value) => `${value.toString()}°`}
            onPreview={(rotationDeg) => {
              previewWith({ rotationDeg });
            }}
            onCommit={(rotationDeg) => {
              commit({ ...saved, rotationDeg }, 'Underlay rotation');
            }}
          />
          <NumberRow
            label="Offset X (ly)"
            value={current.offsetX}
            onCommit={(offsetX) => {
              commit({ ...saved, offsetX }, 'Underlay position');
            }}
          />
          <NumberRow
            label="Offset Z (ly)"
            value={current.offsetZ}
            onCommit={(offsetZ) => {
              commit({ ...saved, offsetZ }, 'Underlay position');
            }}
          />
          <SettingSlider
            label="Opacity"
            value={current.opacity}
            min={0}
            max={1}
            step={0.05}
            format={(value) => `${Math.round(value * 100).toString()}%`}
            onPreview={(opacity) => {
              previewWith({ opacity });
            }}
            onCommit={(opacity) => {
              commit({ ...saved, opacity }, 'Underlay opacity');
            }}
          />
          <FieldRow label="Shown">
            <Switch
              aria-label="Show the underlay"
              checked={current.visible}
              onCheckedChange={(visible) => {
                commit({ ...saved, visible }, visible ? 'Show the underlay' : 'Hide the underlay');
              }}
            />
          </FieldRow>
        </>
      )}

      <AssetPicker
        open={picking}
        universeId={map.universeId}
        attached={new Set(map.underlayAssetId ? [map.underlayAssetId] : [])}
        onClose={() => {
          setPicking(false);
        }}
        onChoose={(assets) => {
          setPicking(false);
          const [chosen] = assets;
          if (!chosen) return;
          void save(
            { underlayAssetId: chosen.id, underlay: saved ?? defaultUnderlay(map) },
            'Set the underlay image',
          );
        }}
      />
    </section>
  );
}

/** A number saved on blur or Enter, if it changed. */
function NumberRow({
  label,
  value,
  min,
  onCommit,
}: {
  label: string;
  value: number;
  min?: number;
  onCommit: (value: number) => void;
}) {
  const id = useId();
  return (
    <FieldRow label={label} htmlFor={id}>
      <input
        key={valueKey(value, 0)}
        id={id}
        type="number"
        step="any"
        {...(min === undefined ? {} : { min })}
        defaultValue={value}
        className={INPUT_CLASS}
        onBlur={(event) => {
          const next = Number(event.currentTarget.value);
          if (
            event.currentTarget.value.trim() !== '' &&
            Number.isFinite(next) &&
            next !== value &&
            (min === undefined || next >= min)
          ) {
            onCommit(next);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </FieldRow>
  );
}
