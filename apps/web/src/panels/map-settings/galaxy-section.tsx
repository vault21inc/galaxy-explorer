import {
  GALAXY_PRESETS,
  GalaxySettings,
  numberLimits,
  resolveGalaxySettings,
  type ResolvedGalaxySettings,
} from '@ge/domain';
import { Shuffle } from 'lucide-react';
import { useId, useMemo } from 'react';
import type { GalaxyMap } from '@/api/containers.ts';
import { Button } from '@/components/ui/button.tsx';
import { useGalaxyPreview } from '@/state/galaxy-preview.ts';
import { FieldRow, INPUT_CLASS } from '../entity-form/fields/field-row.tsx';
import { SectionHeading } from '../sections/section-heading.tsx';
import { GalaxyThumbnail } from './galaxy-thumbnail.tsx';
import { SettingSlider } from './setting-slider.tsx';
import type { useMapSave } from './use-map-save.ts';

type NumericSetting =
  | 'arms'
  | 'armTwist'
  | 'armSpread'
  | 'barLengthRadii'
  | 'bulgeRadiusLy'
  | 'radiusLy'
  | 'thicknessLy';

const ly = (value: number) => `${Math.round(value).toLocaleString('en')} ly`;

/**
 * The sliders, in the order of M3-T8. Limits come from the `GalaxySettings` schema; the bulge
 * has no upper limit there, so it gets one here, and the sizes use a log scale.
 */
const SLIDERS: readonly {
  key: NumericSetting;
  label: string;
  step: number;
  max?: number;
  log?: boolean;
  format?: (value: number) => string;
}[] = [
  { key: 'arms', label: 'Arms', step: 1 },
  {
    key: 'armTwist',
    label: 'Arm twist',
    step: 0.05,
    format: (value) => `${value.toFixed(2)} turns`,
  },
  { key: 'armSpread', label: 'Arm spread', step: 0.01, format: (value) => value.toFixed(2) },
  {
    key: 'barLengthRadii',
    label: 'Bar length',
    step: 0.01,
    format: (value) => (value === 0 ? 'none' : value.toFixed(2)),
  },
  { key: 'bulgeRadiusLy', label: 'Bulge radius', step: 100, max: 60_000, format: ly },
  { key: 'radiusLy', label: 'Radius', step: 100, log: true, format: ly },
  { key: 'thicknessLy', label: 'Thickness', step: 10, log: true, format: ly },
];

const COLORS = [
  ['core', 'Core'],
  ['arm', 'Arms'],
  ['dust', 'Dust'],
] as const;

/**
 * Galaxy shape (D-24, M3-T8): presets first, then sliders, colors and the seed. Sliders preview
 * live and save on release; everything else saves at once. Each save is one undo step.
 */
export function GalaxySection({
  map,
  save,
}: {
  map: GalaxyMap;
  save: ReturnType<typeof useMapSave>;
}) {
  const seedId = useId();
  const preview = useGalaxyPreview((state) =>
    state.preview?.mapId === map.id ? state.preview.galaxySettings : undefined,
  );
  // Checked and typed by the domain schema (it brands the colors).
  const saved = useMemo(() => GalaxySettings.parse(map.galaxySettings), [map.galaxySettings]);
  // What the controls show: the preview while a slider moves, else what's saved.
  const current: ResolvedGalaxySettings = resolveGalaxySettings(preview ?? saved);

  const commit = (settings: GalaxySettings, description: string) =>
    void save({ galaxySettings: settings }, description);
  const withSetting = <K extends keyof GalaxySettings>(key: K, value: GalaxySettings[K]) => ({
    ...saved,
    ...preview,
    [key]: value,
  });

  return (
    <section aria-label="Galaxy shape" className="flex flex-col gap-2">
      <SectionHeading>Galaxy shape</SectionHeading>
      <ul aria-label="Presets" className="grid grid-cols-4 gap-1.5">
        {GALAXY_PRESETS.map((preset) => (
          <li key={preset.id}>
            <button
              type="button"
              title={preset.label}
              aria-label={`Preset: ${preset.label}`}
              className="flex w-full flex-col items-center gap-0.5 rounded-md p-1 text-[10px] leading-tight text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              onClick={() => {
                commit({ ...saved, ...preset.settings }, `Galaxy shape: ${preset.label}`);
              }}
            >
              <GalaxyThumbnail settings={{ ...saved, ...preset.settings }} sizePx={56} />
              {preset.label}
            </button>
          </li>
        ))}
      </ul>

      {SLIDERS.map(({ key, label, step, max, log, format }) => {
        const limits = numberLimits(GalaxySettings.shape[key]);
        return (
          <SettingSlider
            key={key}
            label={label}
            value={current[key]}
            min={limits.min ?? 0}
            max={max ?? limits.max ?? 1}
            step={step}
            {...(log ? { log } : {})}
            {...(format ? { format } : {})}
            onPreview={(value) => {
              useGalaxyPreview
                .getState()
                .show({ mapId: map.id, galaxySettings: withSetting(key, value) });
            }}
            onCommit={(value) => {
              commit(withSetting(key, value), `Galaxy shape: ${label.toLowerCase()}`);
            }}
          />
        );
      })}

      <FieldRow label="Colors">
        {COLORS.map(([key, label]) => (
          <label
            key={key}
            className="flex flex-col items-center gap-0.5 text-[10px] text-muted-foreground"
          >
            <input
              type="color"
              aria-label={`${label} color`}
              value={current.colors[key]}
              className="h-7 w-9 cursor-pointer rounded border border-input bg-transparent p-0.5"
              onChange={(event) => {
                const colors = { ...current.colors, [key]: event.currentTarget.value };
                // Colors only re-bake the disc: preview as the picker moves, save on blur.
                useGalaxyPreview
                  .getState()
                  .show({ mapId: map.id, galaxySettings: { ...saved, colors } });
              }}
              onBlur={(event) => {
                const colors = {
                  ...resolveGalaxySettings(saved).colors,
                  ...saved.colors,
                  [key]: event.currentTarget.value,
                };
                if (colors[key] !== resolveGalaxySettings(saved).colors[key]) {
                  commit({ ...saved, colors }, `Galaxy colors: ${label.toLowerCase()}`);
                }
              }}
            />
            {label}
          </label>
        ))}
      </FieldRow>

      <FieldRow label="Seed" htmlFor={seedId} hint="Shapes the noise and where the stars fall.">
        <input
          key={current.seed}
          id={seedId}
          type="number"
          step={1}
          defaultValue={current.seed}
          className={INPUT_CLASS}
          onBlur={(event) => {
            const seed = Math.trunc(Number(event.currentTarget.value));
            if (Number.isFinite(seed) && seed !== current.seed)
              commit({ ...saved, seed }, 'Galaxy seed');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Shuffle the seed"
          title="A new random seed"
          onClick={() => {
            commit({ ...saved, seed: Math.floor(Math.random() * 1_000_000) }, 'Galaxy seed');
          }}
        >
          <Shuffle aria-hidden />
        </Button>
      </FieldRow>

      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => {
          // Back to GALAXY_DEFAULTS: an empty document resolves to them. A star count the map
          // set stays, since it's a performance choice rather than a shape.
          commit(
            saved.starPoints === undefined ? {} : { starPoints: saved.starPoints },
            'Galaxy shape: reset to default',
          );
        }}
      >
        Reset to default
      </Button>
    </section>
  );
}
