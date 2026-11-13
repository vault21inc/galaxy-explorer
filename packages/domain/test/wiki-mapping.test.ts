import { describe, expect, it } from 'vitest';
import {
  fieldForParam,
  mapWikiParams,
  normalizeWikiName,
  numberIn,
  wikiValue,
  type MappableField,
} from '../src/wiki/index.ts';

/** Mapping a wiki info box onto facts (M7-T3). */

const population: MappableField = {
  id: 'f1',
  key: 'population',
  label: 'Population',
  valueType: 'number',
  unit: 'billion',
  wikiAliases: ['pop'],
};
const subSector: MappableField = {
  id: 'f2',
  key: 'sub_sector',
  label: 'Sub-sector',
  valueType: 'text',
  wikiAliases: [],
};
const founded: MappableField = {
  id: 'f3',
  key: 'founded',
  label: 'Founded',
  valueType: 'date_text',
};
const source: MappableField = { id: 'f4', key: 'source', label: 'Source', valueType: 'url' };

describe('normalizeWikiName and fieldForParam', () => {
  it('treats spelling of names loosely', () => {
    expect(['sub-sector', 'subsector', 'Sub_sector', 'Sub-sector'].map(normalizeWikiName)).toEqual([
      'subsector',
      'subsector',
      'subsector',
      'subsector',
    ]);
  });

  it('maps by alias, else by key or label', () => {
    const fields = [population, subSector];
    expect(fieldForParam('pop', fields)).toBe(population);
    expect(fieldForParam('population', fields)).toBe(population);
    expect(fieldForParam('sub-sector', fields)).toBe(subSector);
    expect(fieldForParam('subsector', fields)).toBe(subSector);
    expect(fieldForParam('gravity', fields)).toBeUndefined();
  });
});

describe('numberIn and wikiValue', () => {
  it('reads numbers with separators and scale words', () => {
    expect(numberIn('5,000,000,000')).toBe(5e9);
    expect(numberIn('4.2 billion')).toBe(4.2e9);
    expect(numberIn('c. 12 million (est.)')).toBe(1.2e7);
    expect(numberIn('Unknown')).toBeNull();
  });

  it('converts to the field’s unit and type, and skips filler', () => {
    expect(wikiValue('5,000,000,000', population)).toEqual({ type: 'number', number: 5 });
    expect(wikiValue('4.2 billion', population)).toEqual({ type: 'number', number: 4.2 });
    expect(wikiValue('Unknown ', population)).toBeNull();
    expect(wikiValue('Helican Sub-sector', subSector)).toMatchObject({
      type: 'text',
      text: { format: 'plain', source: 'Helican Sub-sector' },
    });
    expect(wikiValue('240.M41', founded)).toEqual({ type: 'date_text', text: '240.M41' });
    expect(wikiValue('see https://example.org/x for more', source)).toEqual({
      type: 'url',
      url: 'https://example.org/x',
    });
    expect(wikiValue('no address', source)).toBeNull();
  });
});

describe('mapWikiParams', () => {
  it('fills each field once, and lists what fills none', () => {
    const { mapped, unmapped } = mapWikiParams(
      [
        { name: 'population', text: '5,000,000,000' },
        { name: 'pop', text: '7 billion' },
        { name: 'sub-sector', text: 'Helican Sub-sector' },
        { name: 'gravity', text: 'Unknown' },
      ],
      [population, subSector],
    );
    expect(mapped.map((item) => [item.param, item.field.key, item.value])).toEqual([
      ['population', 'population', { type: 'number', number: 5 }],
      ['sub-sector', 'sub_sector', expect.objectContaining({ type: 'text' })],
    ]);
    expect(unmapped).toEqual([{ name: 'gravity', text: 'Unknown' }]);
  });
});
