import {
  ENTITY_KINDS,
  entityKinds,
  formGroups,
  isPlanetType,
  isRegionType,
  objectTypes,
  rt,
  SHOW_SPOILERS,
  type EntityKind,
  type FormCondition,
  type FormFieldDef,
  type RichText,
} from '@ge/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EntityForm } from '../src/panels/entity-form/entity-form.tsx';
import type { PanelEntity } from '../src/panels/types.ts';
import { RichTextEditor } from '../src/richtext/editor/rich-text-editor.tsx';
import { SpoilerContextProvider } from '../src/richtext/spoiler-context.tsx';

/**
 * Component tests for the generated editor form (M3-T4), rendered to static markup: a form
 * for every registered kind from its registry entry alone, and the editor each text format
 * gets. Saving, CodeMirror itself and Mark as spoiler in a real editor are in
 * e2e/entity-form.spec.ts; the wrapping logic is unit-tested in rich-text-editing.test.ts.
 */

const ID = '019a5b3c-7d2e-7f00-8a1b-2c3d4e5f6a7b';

function render(children: ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <SpoilerContextProvider
        value={{ policy: SHOW_SPOILERS, reveal: () => undefined, marked: true }}
      >
        {children}
      </SpoilerContextProvider>
    </QueryClientProvider>,
  );
}

/** An entity of any kind, its extension fields taken from the registry's example. */
function entityOf(kind: EntityKind): PanelEntity {
  const def = entityKinds[kind];
  return {
    ...def.example,
    id: ID,
    kind,
    universeId: ID,
    mapId: def.scope === 'map' ? ID : null,
    name: rt.plain('Corvid'),
    namePlain: 'Corvid',
    summary: rt.md('A **forge** world.'),
    description: null,
    isSpoiler: false,
    status: 'published',
    externalKey: null,
    clonedFromEntityId: null,
    version: 3,
    createdAt: '2026-11-08T00:00:00.000Z',
    updatedAt: '2026-11-08T00:00:00.000Z',
    ...(kind === 'celestial_object' ? { appearance: {}, subtypeId: null, parentId: null } : {}),
  } as unknown as PanelEntity;
}

const escape = (text: string) => text.replaceAll('&', '&amp;');

/** Whether a field's base-type conditions rule it out (the shape conditions are tested apart). */
function ruledOut(field: FormFieldDef, baseType: keyof typeof objectTypes | undefined): boolean {
  const { showWhen } = field;
  const conditions: readonly FormCondition[] =
    showWhen === undefined
      ? []
      : typeof showWhen === 'string' || !('length' in showWhen)
        ? [showWhen]
        : showWhen;
  return conditions.some(
    (condition) =>
      (condition === 'explorableType' &&
        (!baseType || objectTypes[baseType].explorableAs === null)) ||
      (condition === 'regionType' && (!baseType || !isRegionType(baseType))) ||
      (condition === 'planetType' && (!baseType || !isPlanetType(baseType))) ||
      // The fixture sits at the top level, not in a system (M5-T4).
      condition === 'systemChild',
  );
}

describe.each(ENTITY_KINDS)('the generated %s form', (kind) => {
  const html = render(
    <EntityForm kind={kind} entity={entityOf(kind)} fieldDefinitions={[]} subtypes={[]} />,
  );

  it('shows every field of its registry entry, under its group headings', () => {
    const entity = entityOf(kind) as PanelEntity & { baseType?: keyof typeof objectTypes };
    for (const group of formGroups(entityKinds[kind].form)) {
      if (group.heading) expect(html).toContain(`>${group.heading}<`);
      for (const field of group.fields) {
        const hidden = ruledOut(field, entity.baseType);
        if (hidden) expect(html).not.toContain(`>${escape(field.label)}<`);
        else expect(html, field.label).toContain(escape(field.label));
      }
    }
  });

  it('starts with the name, editable', () => {
    expect(html).toMatch(/<input[^>]*value="Corvid"/);
    expect(html).toContain('aria-label="Edit Corvid"');
  });
});

describe('a region’s form (M4-T6)', () => {
  const regionForm = (region: object) =>
    render(
      <EntityForm
        kind="celestial_object"
        entity={
          {
            ...entityOf('celestial_object'),
            baseType: 'anomaly',
            explorable: false,
            appearance: { region },
          } as unknown as PanelEntity
        }
        fieldDefinitions={[]}
        subtypes={[]}
      />,
    );

  it('shows a storm’s fields for a storm, and a rift’s points for a rift', () => {
    const storm = regionForm({ shape: 'storm' });
    expect(storm).toContain('>Shape<');
    expect(storm).toContain('>Rim color<');
    expect(storm).toContain('>Gaps in the rim<');
    expect(storm).not.toContain('>Points<');
    expect(storm).not.toContain('>Storm image<');
    expect(regionForm({ shape: 'storm', texture: 'upload' })).toContain('>Storm image<');
    const rift = regionForm({ shape: 'rift' });
    expect(rift).toContain('>Points<');
    expect(rift).not.toContain('>Rim color<');
  });

  it('falls back to the type’s default shape: a round cloud', () => {
    const cloud = regionForm({});
    expect(cloud).toContain('>Density<');
    expect(cloud).not.toContain('>Rim color<');
  });
});

describe('forms are generated', () => {
  it('no kind has a form file of its own', () => {
    // Vite lists the files without loading them (`eager` is off and nothing is awaited).
    const files = Object.keys(import.meta.glob('../src/panels/entity-form/**/*'));
    expect(files.length).toBeGreaterThan(5);
    for (const kind of ENTITY_KINDS) {
      for (const name of [kind, entityKinds[kind].plural, kind.replace('_', '-')]) {
        expect(files.filter((file) => file.includes(name))).toEqual([]);
      }
    }
  });
});

describe('each format renders its editor (ux.md §8)', () => {
  const editor = (value: RichText, singleLine = false) =>
    render(
      <RichTextEditor
        label="Text"
        value={value}
        singleLine={singleLine}
        fieldKey={`${ID}/text`}
        onCommit={() => undefined}
      />,
    );

  it('a name is a one-line input, in any format', () => {
    expect(editor(rt.plain('Corvid'), true)).toMatch(/<input[^>]*value="Corvid"/);
    expect(editor(rt.md('**Corvid**'), true)).toMatch(/<input[^>]*value="\*\*Corvid\*\*"/);
  });

  it('plain text is a textarea', () => {
    const html = editor(rt.plain('Some text'));
    expect(html).toContain('<textarea');
    expect(html).toContain('Some text');
  });

  it.each([rt.md('**x**'), rt.html('<p>x</p>')])(
    '$format gets the lazily loaded CodeMirror editor',
    (value) => {
      const html = editor(value);
      expect(html).not.toContain('<textarea');
      // The server render shows the placeholder while CodeMirror's chunk loads.
      expect(html).toContain('aria-busy="true"');
    },
  );

  it('offers the three formats, the spoiler switch, Mark as spoiler and Preview', () => {
    const html = editor(rt.md('x'));
    for (const format of ['Plain', 'Markdown', 'HTML']) expect(html).toContain(`>${format}<`);
    expect(html).toContain('aria-label="Text is a spoiler"');
    expect(html).toContain('aria-label="Mark as spoiler in Text"');
    expect(html).toContain('aria-label="Preview Text"');
  });

  it('Mark as spoiler is off for plain text, which has only whole-field spoilers', () => {
    expect(editor(rt.plain('x'))).toMatch(/aria-label="Mark as spoiler in Text"[^>]*disabled/);
  });
});
