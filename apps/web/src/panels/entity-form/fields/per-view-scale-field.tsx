import {
  fieldSchemaIn,
  numberLimits,
  objectTypes,
  VIEW_LEVELS,
  viewLevels,
  viewsDrawnIn,
  type BaseType,
  type ObjectTypeDef,
  type ViewLevel,
} from '@ge/domain';
import { useEffect, useId, useRef, useState } from 'react';
import { editDescription, type FieldProps, type PathFieldDef } from '../field-props.ts';
import { changesFor, valueAt } from '../field-path.ts';
import { inheritedValue } from '../inherited.ts';
import { FieldRow, ResetButton } from './field-row.tsx';

/** Slider steps between the smallest and largest scale. */
const STEPS = 1_000;

/**
 * Size per view (U3): one slider per view the base type is drawn in among the view's objects
 * (`viewsDrawnIn`), multiplying its default size there. Never for the view it opens itself,
 * where it's the scale (a planet in its own orbit view), and a type that also appears in that
 * view around another body (a moon around its planet) says so. Inherited values (1, or the
 * subtype's) are dimmed; an override has Reset.
 *
 * The slider is logarithmic: the schema allows ×0.05 to ×20, and a linear slider would spend
 * almost all its travel above ×1. Position p (0 to STEPS) maps to min × (max / min)^(p / STEPS),
 * so ×1 sits in the middle-ish and halving or doubling is the same distance either way.
 */
export function PerViewScaleField({
  field,
  schema,
  record,
  title,
  subtypes,
  save,
}: FieldProps<PathFieldDef>) {
  const fields = record as typeof record & { baseType?: BaseType };
  if (!fields.baseType) return null;
  const type: ObjectTypeDef = objectTypes[fields.baseType];
  const sizes = type.size;
  const drawn = new Set(viewsDrawnIn(fields.baseType));
  const views = VIEW_LEVELS.filter((view) => sizes[view] !== undefined && drawn.has(view));
  // In the view it opens itself, it's the subject: its size there is around its parent's.
  const hintFor = (view: ViewLevel) => {
    if (type.explorableAs !== view) return undefined;
    const around = type.parents
      .flatMap((parent) => {
        const def = (objectTypes as Record<string, ObjectTypeDef | undefined>)[parent];
        return def?.explorableAs === view ? [def.label.toLowerCase()] : [];
      })
      .join(' or ');
    return `How big it’s drawn around its ${around}. In its own ${viewLevels[view].label.toLowerCase()}, everything is measured by it.`;
  };
  if (views.length === 0) return null;

  // The per-view record's value schema holds the limits: perView(z.number().min(0.05).max(20)).
  const limits = numberLimits(fieldSchemaIn(schema, `${field.path}.${views[0] ?? 'galaxy'}`));
  const min = limits.min ?? 0.05;
  const max = limits.max ?? 20;

  const saved = (valueAt(record, field.path) ?? {}) as Partial<Record<ViewLevel, number>>;
  const inherited = (inheritedValue(record, field.path, subtypes) ?? {}) as Partial<
    Record<ViewLevel, number>
  >;
  const commit = (view: ViewLevel, value: number | undefined) => {
    void save(
      changesFor(record, `${field.path}.${view}`, value),
      editDescription(title, `${field.label} in the ${viewLevels[view].label.toLowerCase()}`),
    );
  };

  return (
    <div className="flex flex-col gap-1">
      {views.map((view) => (
        <ScaleSlider
          key={view}
          label={`${field.label} · ${viewLevels[view].label.replace(' view', '')}`}
          hint={hintFor(view)}
          value={saved[view]}
          fallback={inherited[view] ?? 1}
          min={min}
          max={max}
          onCommit={(value) => {
            commit(view, value);
          }}
        />
      ))}
    </div>
  );
}

function ScaleSlider({
  label,
  hint,
  value,
  fallback,
  min,
  max,
  onCommit,
}: {
  label: string;
  hint?: string | undefined;
  value: number | undefined;
  fallback: number;
  min: number;
  max: number;
  onCommit: (value: number | undefined) => void;
}) {
  const id = useId();
  const slider = useRef<HTMLInputElement>(null);
  const toPosition = (scale: number) =>
    Math.round((Math.log(scale / min) / Math.log(max / min)) * STEPS);
  const toScale = (position: number) => roundScale(min * (max / min) ** (position / STEPS));
  const current = value ?? fallback;
  // While dragging, the slider shows its own position; the saved value takes over after.
  const [live, setLive] = useState<number | null>(null);

  // The range input's native `change` fires once, on release; React's onChange fires on every
  // step, which would save dozens of batches per drag.
  const commitRef = useRef(onCommit);
  useEffect(() => {
    commitRef.current = onCommit;
  });
  useEffect(() => {
    const element = slider.current;
    if (!element) return;
    const onChange = () => {
      commitRef.current(toScaleOf(Number(element.value), min, max));
    };
    element.addEventListener('change', onChange);
    return () => {
      element.removeEventListener('change', onChange);
    };
  }, [min, max]);

  return (
    <FieldRow
      label={label}
      htmlFor={id}
      hint={hint}
      inherited={value === undefined && live === null}
    >
      <input
        ref={slider}
        id={id}
        type="range"
        min={0}
        max={STEPS}
        step={1}
        value={live ?? toPosition(current)}
        aria-valuetext={`×${String(live === null ? current : toScale(live))}`}
        className="min-w-0 flex-1 accent-primary"
        onChange={(event) => {
          setLive(Number(event.currentTarget.value));
        }}
        onBlur={() => {
          setLive(null);
        }}
      />
      <output htmlFor={id} className="w-12 shrink-0 text-right text-xs tabular-nums">
        ×{live === null ? current : toScale(live)}
      </output>
      {value !== undefined && (
        <ResetButton
          label={label}
          onReset={() => {
            setLive(null);
            onCommit(undefined);
          }}
        />
      )}
    </FieldRow>
  );
}

function toScaleOf(position: number, min: number, max: number): number {
  return roundScale(min * (max / min) ** (position / STEPS));
}

/** Two significant digits: ×0.35, ×1.5, ×12. */
function roundScale(scale: number): number {
  return Number(scale.toPrecision(2));
}
