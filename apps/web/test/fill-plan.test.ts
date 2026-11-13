import { describe, expect, it } from 'vitest';
import { rt, type ConfigReadOf, type WikiPreview } from '@ge/domain';
import { fillDescription, fillOperations, fillPlan } from '@/panels/wiki-fill/fill-plan.ts';
import type { PanelEntity } from '@/panels/types.ts';

/** What "Fill from wiki" offers and applies (M7-T3). */

const definition = (overrides: Partial<ConfigReadOf<'field_definitions'>>) =>
  ({
    id: overrides.key,
    appliesToKind: 'celestial_object',
    appliesToBaseType: null,
    appliesToSubtypeId: null,
    unit: null,
    wikiAliases: [],
    sortKey: 0,
    ...overrides,
  }) as unknown as ConfigReadOf<'field_definitions'>;

const population = definition({
  key: 'population',
  label: 'Population',
  valueType: 'number',
  unit: 'billion',
});
const subSector = definition({ key: 'sub_sector', label: 'Sub-sector', valueType: 'text' });

const preview: WikiPreview = {
  source: 'w40k',
  title: 'Gudrun',
  redirectedFrom: null,
  url: 'https://warhammer40k.fandom.com/wiki/Gudrun',
  license: 'CC-BY-SA',
  licenseUrl: 'https://www.fandom.com/licensing',
  retrievedAt: '2026-11-13T12:00:00.000Z',
  templates: [
    {
      name: 'Planet',
      params: [
        { name: 'population', text: '5,000,000,000' },
        { name: 'sub-sector', text: 'Helican Sub-sector' },
        { name: 'tithe_grade', text: 'Unknown' },
        { name: 'gravity', text: '1.1 g' },
        { name: 'image1', text: '' },
      ],
    },
  ],
  lead: '**Gudrun** is a world.',
};

const entity = (overrides: Partial<PanelEntity> = {}) =>
  ({
    id: 'e1',
    namePlain: 'Gudrun',
    version: 3,
    description: null,
    facts: [],
    ...overrides,
  }) as unknown as PanelEntity;

describe('fillPlan', () => {
  it('offers the description and each mapped fact, ticked when empty or changed', () => {
    const plan = fillPlan(preview, 0, entity(), [population, subSector]);
    expect(plan.rows.map((row) => [row.target, row.current, row.wiki, row.checked])).toEqual([
      ['description', null, 'Gudrun is a world.', true],
      ['field:population', null, '5 billion', true],
      ['field:sub_sector', null, 'Helican Sub-sector', true],
    ]);
    // Parameters with no field, other than empty ones, are offered as aliases.
    expect(plan.unmapped.map((param) => param.name)).toEqual(['tithe_grade', 'gravity']);
  });

  it('leaves an existing description and an unchanged fact unticked', () => {
    const plan = fillPlan(
      preview,
      0,
      entity({
        description: rt.plain('Our own words.'),
        facts: [
          {
            entityId: 'e1',
            fieldDefinitionId: 'population',
            value: { type: 'number', number: 5 },
            isSpoiler: true,
            sortKey: null,
          },
        ] as never,
      }),
      [population],
    );
    expect(plan.rows.map((row) => [row.target, row.current, row.checked])).toEqual([
      ['description', 'Our own words.', false],
      ['field:population', '5 billion', false],
    ]);
  });
});

describe('fillOperations', () => {
  it('builds one batch: the description, the facts with their spoiler flags, and citations', () => {
    const subject = entity({
      facts: [
        {
          entityId: 'e1',
          fieldDefinitionId: 'population',
          value: { type: 'number', number: 4 },
          isSpoiler: true,
          sortKey: null,
        },
      ] as never,
    });
    const plan = fillPlan(preview, 0, subject, [population, subSector]);
    const operations = fillOperations('celestial_object', subject, preview, plan.rows);
    expect(operations.map((operation) => operation.op)).toEqual([
      'update',
      'setFacts',
      'addCitation',
      'addCitation',
      'addCitation',
    ]);
    expect(operations[0]).toMatchObject({
      version: 3,
      data: { description: { format: 'markdown' } },
    });
    expect(operations[1]).toMatchObject({
      data: [
        { fieldDefinitionId: 'population', value: { type: 'number', number: 5 }, isSpoiler: true },
        { fieldDefinitionId: 'sub_sector', isSpoiler: false },
      ],
    });
    expect(operations[2]).toMatchObject({
      data: { target: 'description', sourceUrl: preview.url, license: 'CC-BY-SA' },
    });
    expect(fillDescription(subject, preview)).toBe('Filled Gudrun from warhammer40k.fandom.com');
  });
});
