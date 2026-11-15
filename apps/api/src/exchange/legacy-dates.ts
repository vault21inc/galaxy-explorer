/**
 * Exports made before 2026-11-15 wrote a citation's `retrievedAt` as Postgres prints a
 * timestamp, `2026-11-14 00:07:56.818+00`, rather than the ISO 8601 the format asks for
 * (`2026-11-14T00:07:56.818+00:00`), so their own import refused them. The import reads such a
 * date as the instant it names: same date, time and offset, written the ISO way.
 */

/** Postgres's text form of a `timestamptz`: a space for the T, and an offset of +HH or +HH:MM. */
const POSTGRES_TIMESTAMP =
  /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)([+-]\d{2})(?::?(\d{2}))?$/;

/** The ISO 8601 form of a Postgres timestamp's text; anything else is returned as it is. */
export function isoFromPostgresText(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const match = POSTGRES_TIMESTAMP.exec(value);
  if (!match) return value;
  const [, date, time, hours, minutes] = match;
  return `${String(date)}T${String(time)}${String(hours)}:${minutes ?? '00'}`;
}

type Row = Record<string, unknown>;
const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null;

/**
 * Rewrites, in place, the citation dates of an export file's entries: the lists at the top of
 * `universe.json` (characters) and `maps/<slug>.json` (objects, groups, events…), before the
 * file is checked against its schema.
 */
export function upgradeCitationDates(file: unknown): void {
  if (!isRow(file)) return;
  for (const list of Object.values(file)) {
    if (!Array.isArray(list)) continue;
    for (const record of list) {
      if (!isRow(record) || !Array.isArray(record.citations)) continue;
      for (const citation of record.citations) {
        if (isRow(citation)) citation.retrievedAt = isoFromPostgresText(citation.retrievedAt);
      }
    }
  }
}
