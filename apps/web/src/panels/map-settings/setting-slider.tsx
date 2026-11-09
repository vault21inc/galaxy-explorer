import { useEffect, useId, useRef, useState } from 'react';
import { FieldRow } from '../entity-form/fields/field-row.tsx';

/** Positions on a logarithmic slider's track. */
const LOG_STEPS = 1_000;

export interface SettingSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  /** Rounds values to this step (1 for whole numbers); on a linear slider, one arrow-key press. */
  step: number;
  /**
   * A logarithmic scale, for ranges over several orders of magnitude (a radius from 1,000 to
   * 500,000 ly): equal slider distances are equal ratios, so the small end isn't crammed.
   */
  log?: boolean;
  format?: (value: number) => string;
  /** Every step while dragging: the live preview. */
  onPreview: (value: number) => void;
  /** Once, on release (or each key press): the save. */
  onCommit: (value: number) => void;
}

/**
 * Track position and value, both ways. A linear slider's track is the value itself (so arrow
 * keys move by `step`); a log slider's runs 0–LOG_STEPS, position p meaning
 * min × (max / min)^(p / LOG_STEPS).
 */
export function sliderScale(min: number, max: number, step: number, log: boolean) {
  const round = (value: number) => Math.min(max, Math.max(min, Math.round(value / step) * step));
  if (!log) {
    return { trackMin: min, trackMax: max, trackStep: step, toValue: round, toTrack: round };
  }
  return {
    trackMin: 0,
    trackMax: LOG_STEPS,
    trackStep: 1,
    toValue: (position: number) => round(min * (max / min) ** (position / LOG_STEPS)),
    toTrack: (value: number) =>
      Math.round(
        (Math.log(Math.min(max, Math.max(min, value)) / min) / Math.log(max / min)) * LOG_STEPS,
      ),
  };
}

/**
 * A slider for one map setting (M3-T8). Dragging previews every step and saves once, on
 * release: React's onChange fires on every step, the input's native `change` event only when
 * the value is let go of (or a key moves it).
 */
export function SettingSlider({
  label,
  value,
  min,
  max,
  step,
  log = false,
  format = (shown) => shown.toString(),
  onPreview,
  onCommit,
}: SettingSliderProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  // While dragging, the slider shows its own position; the saved value takes over after.
  const [live, setLive] = useState<number | null>(null);
  const scale = sliderScale(min, max, step, log);

  const commitRef = useRef(onCommit);
  useEffect(() => {
    commitRef.current = onCommit;
  });
  useEffect(() => {
    const element = input.current;
    if (!element) return;
    const { toValue } = sliderScale(min, max, step, log);
    const onChange = () => {
      commitRef.current(toValue(Number(element.value)));
      setLive(null);
    };
    element.addEventListener('change', onChange);
    return () => {
      element.removeEventListener('change', onChange);
    };
  }, [min, max, step, log]);

  const shown = live ?? value;
  return (
    <FieldRow label={label} htmlFor={id}>
      <input
        ref={input}
        id={id}
        type="range"
        min={scale.trackMin}
        max={scale.trackMax}
        step={scale.trackStep}
        value={scale.toTrack(shown)}
        aria-valuetext={format(shown)}
        className="min-w-0 flex-1 accent-primary"
        onChange={(event) => {
          const next = scale.toValue(Number(event.currentTarget.value));
          setLive(next);
          onPreview(next);
        }}
      />
      <output htmlFor={id} className="w-16 shrink-0 text-right text-xs tabular-nums">
        {format(shown)}
      </output>
    </FieldRow>
  );
}
