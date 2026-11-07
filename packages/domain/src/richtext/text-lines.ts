/**
 * Tidies extracted text into lines: trims each line and drops empty ones, so the plain text of
 * a field is predictable whatever its source formatting.
 */
export function normalizeLines(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t\r\f\v]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

/** Table cells are joined with this in plain text. */
export const CELL_SEPARATOR = ' | ';
