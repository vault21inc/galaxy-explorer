import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { latestRead, type Citation } from '../src/panels/citations/citation-note.tsx';
import { SourcesSection } from '../src/panels/citations/sources-section.tsx';
import type { PanelEntity, SectionProps } from '../src/panels/types.ts';

/** The Sources section (M7-T3): one line per page, with when it was last read. */

const PAGE = 'https://warhammer40k.fandom.com/wiki/Gudrun';
const cite = (target: string, retrievedAt: string): Citation => ({
  id: crypto.randomUUID(),
  entityId: 'gudrun',
  target,
  sourceUrl: PAGE,
  sourceTitle: 'Gudrun',
  license: 'CC-BY-SA',
  retrievedAt,
});

// The API lists them by target, so the first is the description, read two days before the
// facts filled from the same page (the owner's M7 demo).
const citations = [
  cite('description', '2026-11-13T00:07:56.818Z'),
  cite('field:population', '2026-11-15T22:30:00.000Z'),
  cite('field:sub_sector', '2026-11-15T22:30:00.000Z'),
];

describe('latestRead', () => {
  it('is the newest of the citations, whatever their order', () => {
    expect(latestRead(citations)).toBe('2026-11-15T22:30:00.000Z');
    expect(latestRead(citations.toReversed())).toBe('2026-11-15T22:30:00.000Z');
    expect(latestRead([])).toBeUndefined();
  });
});

describe('SourcesSection', () => {
  it('says when the page was last read, not when it was first', () => {
    const props = {
      kind: 'celestial_object',
      entity: { citations } as unknown as PanelEntity,
      fieldDefinitions: [
        { key: 'population', label: 'Population' },
        { key: 'sub_sector', label: 'Sub-sector' },
      ],
      subtypes: [],
    } as unknown as SectionProps;
    const html = renderToStaticMarkup(<SourcesSection {...props} />);
    expect(html).toContain('description, Population, Sub-sector');
    expect(html).toContain(`read ${new Date('2026-11-15T22:30:00.000Z').toLocaleDateString()}`);
    expect(html).not.toContain(new Date('2026-11-13T00:07:56.818Z').toLocaleDateString());
  });
});
