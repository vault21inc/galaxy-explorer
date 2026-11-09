/** Steps for "2 min ago": each unit, and how many of the one below make it. */
const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.35],
  ['month', 12],
  ['year', Number.POSITIVE_INFINITY],
];

const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' });

/** "now", "2 min. ago", "yesterday": when a change was made, relative to `nowMs`. */
export function relativeTime(iso: string, nowMs: number): string {
  let amount = (Date.parse(iso) - nowMs) / 1_000;
  if (Math.abs(amount) < 10) return 'just now';
  for (const [unit, size] of UNITS) {
    if (Math.abs(amount) < size) return format.format(Math.round(amount), unit);
    amount /= size;
  }
  return format.format(Math.round(amount), 'year');
}
