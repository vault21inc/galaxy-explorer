import { describe, expect, it } from 'vitest';
import {
  summarizeEntities,
  summarizeOthers,
  type LogRow,
} from '../src/services/history-summary.ts';

const E = 'e1';
const row = (
  tableName: string,
  op: LogRow['op'],
  pk: Record<string, unknown>,
  before: object | null,
  after: object | null,
): LogRow => ({
  tableName,
  op,
  pk,
  before: before as Record<string, unknown> | null,
  after: after as Record<string, unknown> | null,
});

describe('summarizeEntities', () => {
  it('describes an edit: simple values with old→new, rich text as "changed"', () => {
    const rows = [
      row(
        'entities',
        'UPDATE',
        { id: E },
        { name: { source: 'Gudrun' }, name_plain: 'Gudrun', version: 1, kind: 'celestial_object' },
        {
          name: { source: 'Gudrun Prime' },
          name_plain: 'Gudrun Prime',
          version: 2,
          kind: 'celestial_object',
        },
      ),
      row(
        'celestial_objects',
        'UPDATE',
        { entity_id: E },
        { entity_id: E, x: 120, explorable: false },
        { entity_id: E, x: 140, explorable: true },
      ),
    ];
    const [change] = summarizeEntities(
      rows,
      new Map([[E, { name: 'Gudrun Prime', kind: 'celestial_object' }]]),
    );
    expect(change).toMatchObject({
      entityId: E,
      change: 'updated',
      fields: [
        { field: 'name' },
        { field: 'x', from: 120, to: 140 },
        { field: 'explorable', from: false, to: true },
      ],
      summary: 'Gudrun Prime: name changed, x 120→140, explorable false→true',
    });
  });

  it('describes creation and deletion, naming deleted entities from the log', () => {
    const rows = [
      row('entities', 'INSERT', { id: 'new' }, null, {
        id: 'new',
        name_plain: 'Siege',
        kind: 'event',
      }),
      row(
        'entities',
        'DELETE',
        { id: 'gone' },
        { id: 'gone', name_plain: 'Old Fort', kind: 'place' },
        null,
      ),
    ];
    const summaries = summarizeEntities(rows, new Map()).map((change) => change.summary);
    expect(summaries).toEqual(['Siege: created', 'Old Fort: deleted']);
  });

  it('rolls aspect changes up to their entity and counts repeats', () => {
    const rows = [
      row('group_members', 'INSERT', { group_id: E, object_id: 'a' }, null, {
        group_id: E,
        object_id: 'a',
      }),
      row('group_members', 'INSERT', { group_id: E, object_id: 'b' }, null, {
        group_id: E,
        object_id: 'b',
      }),
      row('entity_links', 'DELETE', { id: 'l' }, { id: 'l', entity_id: E }, null),
      row('entity_locations', 'INSERT', { entity_id: E }, null, { entity_id: E }),
    ];
    const [change] = summarizeEntities(rows, new Map([[E, { name: 'Helican', kind: 'group' }]]));
    expect(change?.summary).toBe('Helican: 2 members added, link removed, location set');
  });
});

describe('summarizeOthers', () => {
  it('describes universes, maps and settings by name', () => {
    const rows = [
      row('group_types', 'INSERT', { id: 'g' }, null, { id: 'g', name: 'Sector' }),
      row(
        'maps',
        'UPDATE',
        { id: 'm' },
        { id: 'm', name_plain: 'M41', sort_key: 0 },
        { id: 'm', name_plain: 'M41', sort_key: 2 },
      ),
    ];
    expect(summarizeOthers(rows).map((change) => change.summary)).toEqual([
      'Group type "Sector": created',
      'Map "M41": sortKey 0→2',
    ]);
  });
});
