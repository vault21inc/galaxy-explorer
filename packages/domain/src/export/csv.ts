import { BASE_TYPES } from '../registry/object-types.ts';
import { rt } from '../richtext/schema.ts';

/**
 * CSV import of objects (M7-T4): quick bulk placement from a spreadsheet, one object per row.
 * The rows become object records and group memberships, imported by the same pipeline as an
 * export's map file.
 */

export const CSV_COLUMNS = [
  'name',
  'base_type',
  'x',
  'y',
  'z',
  'parent_key',
  'group_key',
  'external_key',
] as const;
export type CsvColumn = (typeof CSV_COLUMNS)[number];
const REQUIRED: readonly CsvColumn[] = ['name', 'base_type'];

/**
 * RFC 4180 fields: commas between fields, quotes around a field that holds commas, quotes or
 * line breaks, and `""` for a quote inside one. A leading byte-order mark is dropped, CRLF and
 * LF both end a line, and blank lines are skipped.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const input = text.startsWith('﻿') ? text.slice(1) : text;
  const endRow = () => {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
    field = '';
  };
  for (let i = 0; i < input.length; i++) {
    const character = input.charAt(i);
    if (quoted) {
      if (character === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field === '') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && input[i + 1] === '\n') i++;
      endRow();
    } else {
      field += character;
    }
  }
  if (field !== '' || row.length > 0) endRow();
  return rows;
}

export interface CsvProblem {
  /** The line in the file, counting the header as 1. */
  line: number;
  message: string;
}

export interface CsvObjects {
  /** Object records, as a map file's `objects` (schemas.ts). */
  objects: Record<string, unknown>[];
  /** `group_key`: the object joins the group with that key, which must be in the map already. */
  memberships: { object: string; group: string; line: number }[];
  problems: CsvProblem[];
}

/**
 * The rows as object records. An empty cell leaves that field out: a new object starts at
 * 0, 0, 0 at the top level, and an updated one keeps its value. A row without an external key
 * gets the ref `line-<n>`, so the report can name it.
 */
export function csvObjects(text: string): CsvObjects {
  const result: CsvObjects = { objects: [], memberships: [], problems: [] };
  const [header, ...rows] = parseCsv(text);
  if (!header) {
    result.problems.push({ line: 1, message: 'The file is empty.' });
    return result;
  }
  const columns = header.map((name) => name.trim().toLowerCase());
  for (const name of columns) {
    if (!(CSV_COLUMNS as readonly string[]).includes(name)) {
      result.problems.push({
        line: 1,
        message: `Unknown column “${name}”. The columns are ${CSV_COLUMNS.join(', ')}.`,
      });
    }
  }
  for (const name of REQUIRED) {
    if (!columns.includes(name)) {
      result.problems.push({ line: 1, message: `The column “${name}” is missing.` });
    }
  }
  if (result.problems.length > 0) return result;

  rows.forEach((cells, index) => {
    const line = index + 2;
    const cell = (column: CsvColumn) => {
      const at = columns.indexOf(column);
      const value = at < 0 ? '' : (cells[at] ?? '').trim();
      return value === '' ? undefined : value;
    };
    const problem = (message: string) => result.problems.push({ line, message });
    const name = cell('name');
    const baseType = cell('base_type')?.toLowerCase();
    if (!name) problem('The name is empty.');
    if (!baseType || !(BASE_TYPES as readonly string[]).includes(baseType)) {
      problem(`The base type “${baseType ?? ''}” isn’t one of ${BASE_TYPES.join(', ')}.`);
    }
    const record: Record<string, unknown> = {};
    const externalKey = cell('external_key');
    if (externalKey) record.externalKey = externalKey;
    else record.ref = `line-${String(line)}`;
    record.name = rt.plain(name ?? '');
    record.baseType = baseType;
    for (const axis of ['x', 'y', 'z'] as const) {
      const value = cell(axis);
      if (value === undefined) continue;
      const number = Number(value);
      if (Number.isFinite(number)) record[axis] = number;
      else problem(`${axis} isn’t a number: “${value}”.`);
    }
    const parent = cell('parent_key');
    if (parent) record.parent = parent;
    const group = cell('group_key');
    if (group) {
      result.memberships.push({ object: externalKey ?? `line-${String(line)}`, group, line });
    }
    result.objects.push(record);
  });
  return result;
}
