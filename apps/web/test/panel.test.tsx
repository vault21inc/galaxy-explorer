import { rt, type SpoilerPolicy } from '@ge/domain';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EntityDetails } from '../src/panels/entity-details.tsx';
import type { PanelEntity, SectionProps } from '../src/panels/types.ts';
import { RichTextView } from '../src/richtext/rich-text-view.tsx';
import { SpoilerContextProvider } from '../src/richtext/spoiler-context.tsx';

/**
 * Component tests for the panel's spoiler handling: each row of ux.md §6 that applies to the
 * panel (text, a whole entity, a fact, a link, a relation), hidden by default, revealed one at
 * a time, and shown with the global toggle. Rendered to static markup: no browser needed.
 */

const ID = '019a5b3c-7d2e-7f00-8a1b-2c3d4e5f6a7b';
const FIELD = '019a5b3c-7d2e-7f00-8a1b-2c3d4e5f6a7c';
const LINK = '019a5b3c-7d2e-7f00-8a1b-2c3d4e5f6a7d';
const RELATION = '019a5b3c-7d2e-7f00-8a1b-2c3d4e5f6a7e';
const OTHER = '019a5b3c-7d2e-7f00-8a1b-2c3d4e5f6a7f';

const HIDDEN: SpoilerPolicy = { showAll: false, revealed: new Set() };
const SHOWN: SpoilerPolicy = { showAll: true, revealed: new Set() };
const revealing = (...keys: string[]): SpoilerPolicy => ({
  showAll: false,
  revealed: new Set(keys),
});

function entity(overrides: Partial<PanelEntity> = {}): PanelEntity {
  return {
    id: ID,
    kind: 'celestial_object',
    universeId: ID,
    mapId: ID,
    name: rt.plain('Corvid'),
    namePlain: 'Corvid',
    summary: rt.md('A forge world. ||It burns.||'),
    description: null,
    isSpoiler: false,
    status: 'published',
    externalKey: null,
    version: 1,
    createdAt: '2026-11-08T00:00:00.000Z',
    updatedAt: '2026-11-08T00:00:00.000Z',
    baseType: 'system',
    subtypeId: null,
    parentId: null,
    explorable: true,
    x: 0,
    y: 0,
    z: 0,
    appearance: {},
    facts: [],
    links: [],
    relations: [],
    images: [],
    ...overrides,
  } as unknown as PanelEntity;
}

function render(props: Partial<SectionProps> & { entity: PanelEntity }, policy: SpoilerPolicy) {
  return renderToStaticMarkup(
    <SpoilerContextProvider value={{ policy, reveal: () => undefined }}>
      <EntityDetails
        kind="celestial_object"
        fieldDefinitions={[
          { id: FIELD, label: 'Population', unit: 'billion', sortKey: 0 } as never,
        ]}
        subtypes={[]}
        {...props}
      />
    </SpoilerContextProvider>,
  );
}

/** Text a reader can see: tags stripped, the bars' characters kept. */
const visibleText = (html: string) => html.replace(/<[^>]+>/g, ' ');

describe('panel spoilers (ux.md §6)', () => {
  it('text: an inline spoiler is a bar until it or everything is revealed', () => {
    const hidden = render({ entity: entity() }, HIDDEN);
    expect(visibleText(hidden)).not.toContain('It burns');
    expect(hidden).toContain('Potential spoiler: click to reveal');
    expect(hidden).toContain(`data-spoiler-key="${ID}/summary#0"`);

    expect(visibleText(render({ entity: entity() }, revealing(`${ID}/summary#0`)))).toContain(
      'It burns',
    );
    const shown = render({ entity: entity() }, SHOWN);
    expect(visibleText(shown)).toContain('It burns');
    // Shown spoiler content keeps a marker.
    expect(shown).toContain('Flagged as a potential spoiler');
  });

  it('text: a whole spoiler field is one bar', () => {
    const html = render(
      { entity: entity({ summary: rt.plain('Secret history', { spoiler: true }) }) },
      HIDDEN,
    );
    expect(visibleText(html)).not.toContain('Secret history');
    expect(html).toContain(`data-spoiler-key="${ID}/summary"`);
  });

  it('a whole entity: a redacted title, a notice and a Reveal button', () => {
    const html = render({ entity: entity({ isSpoiler: true }) }, HIDDEN);
    expect(visibleText(html)).not.toContain('Corvid');
    expect(html).toContain('This entry contains potential spoilers.');
    expect(html).toContain('Reveal');
    expect(visibleText(render({ entity: entity({ isSpoiler: true }) }, revealing(ID)))).toContain(
      'Corvid',
    );
  });

  it("a fact: the value is blacked out, the field's name isn't", () => {
    const facts = [
      {
        entityId: ID,
        fieldDefinitionId: FIELD,
        value: { type: 'number', number: 3.5 },
        isSpoiler: true,
        sortKey: null,
      },
    ] as PanelEntity['facts'];
    const html = render({ entity: entity({ facts }) }, HIDDEN);
    expect(visibleText(html)).toContain('Population');
    expect(visibleText(html)).not.toContain('3.5');
    expect(
      visibleText(render({ entity: entity({ facts }) }, revealing(`${ID}/fact/${FIELD}`))),
    ).toContain('3.5');
  });

  it('a link: neither its label nor its address shows', () => {
    const links = [
      {
        id: LINK,
        entityId: ID,
        url: 'https://example.com/fall',
        label: 'The Fall',
        isSpoiler: true,
        sortKey: 0,
      },
    ] as PanelEntity['links'];
    const html = render({ entity: entity({ links }) }, HIDDEN);
    expect(html).not.toContain('The Fall');
    expect(html).not.toContain('example.com/fall');
    expect(render({ entity: entity({ links }) }, SHOWN)).toContain(
      'href="https://example.com/fall"',
    );
  });

  it('a relation: the row is blacked out; a spoiler at the other end hides that name', () => {
    const relation = (isSpoiler: boolean, otherSpoiler: boolean) =>
      [
        {
          id: RELATION,
          relationType: 'related',
          fromEntityId: ID,
          toEntityId: OTHER,
          role: null,
          isSpoiler,
          sortKey: 0,
          other: {
            id: OTHER,
            kind: 'character',
            namePlain: 'Inquisitor Vey',
            isSpoiler: otherSpoiler,
            nameSpoiler: false,
          },
        },
      ] as PanelEntity['relations'];
    expect(
      visibleText(render({ entity: entity({ relations: relation(true, false) }) }, HIDDEN)),
    ).not.toContain('Inquisitor Vey');
    const otherHidden = render({ entity: entity({ relations: relation(false, true) }) }, HIDDEN);
    expect(visibleText(otherHidden)).toContain('Related to');
    expect(visibleText(otherHidden)).not.toContain('Inquisitor Vey');
    expect(
      visibleText(render({ entity: entity({ relations: relation(false, false) }) }, HIDDEN)),
    ).toContain('Inquisitor Vey');
  });
});

describe('RichTextView', () => {
  const view = (value: Parameters<typeof RichTextView>[0]['value']) =>
    renderToStaticMarkup(
      <SpoilerContextProvider value={{ policy: SHOWN, reveal: () => undefined }}>
        <RichTextView value={value} fieldKey="x/description" />
      </SpoilerContextProvider>,
    );

  it('renders all three formats', () => {
    expect(view(rt.plain('One\ntwo'))).toContain('<p>One<br/>two</p>');
    expect(view(rt.md('**bold** [site](https://example.com)'))).toContain(
      '<strong>bold</strong> <a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow ugc">site</a>',
    );
    expect(view(rt.html('<h2>Title</h2><ul><li>item</li></ul>'))).toContain(
      '<h2>Title</h2><ul><li>item</li></ul>',
    );
  });

  it('renders hostile HTML inert', () => {
    const html = view(
      rt.html(
        '<p onclick="alert(1)">Hi<script>alert(2)</script><img src="x" onerror="alert(3)">' +
          '<a href="javascript:alert(4)">bad</a><iframe src="https://evil.example"></iframe></p>',
      ),
    );
    expect(html).toContain('<p>Hi');
    expect(html).not.toMatch(/alert|onerror|onclick|javascript:|<script|<iframe/);
  });
});
