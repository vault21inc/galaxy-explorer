import { describe, expect, it } from 'vitest';
import { rt, type RichText } from '../src/richtext/index.ts';
import {
  HIDE_SPOILERS,
  redactEntity,
  redactMap,
  redactUniverse,
  SHOW_SPOILERS,
  spoilerKeys,
  type SpoilerPolicy,
} from '../src/spoilers/index.ts';

const ID = 'entity-1';
const revealing = (...keys: string[]): SpoilerPolicy => ({
  showAll: false,
  revealed: new Set(keys),
});

/** An entity with every aspect, nothing flagged. Each case flags one thing. */
function entity() {
  return {
    id: ID,
    kind: 'event',
    version: 3,
    isSpoiler: false,
    name: rt.plain('Fall of Gudrun'),
    summary: rt.md('A **siege**.') as RichText | null,
    description: rt.html('<p>Long story.</p>') as RichText | null,
    dateText: '240.M41' as string | null,
    images: [
      { assetId: 'a1', role: 'gallery', isSpoiler: false, sortKey: 1, caption: rt.plain('Ruins') },
    ],
    links: [
      { id: 'l1', url: 'https://example.com/x', label: 'Source', isSpoiler: false, sortKey: 0 },
    ],
    facts: [
      { fieldDefinitionId: 'f1', isSpoiler: false, value: { type: 'number', number: 5 } },
      {
        fieldDefinitionId: 'f2',
        isSpoiler: false,
        value: { type: 'text', text: rt.md('plain fact') },
      },
    ],
    relations: [
      {
        id: 'r1',
        relationType: 'participant',
        toEntityId: 'c9',
        isSpoiler: false,
        role: rt.plain('Leader'),
      },
    ],
    members: [{ objectId: 'o1', isSpoiler: false }],
    location: { mode: 'surface', objectId: 'p1', latDeg: 10, lonDeg: 20, isSpoiler: false },
  };
}
type Entity = ReturnType<typeof entity>;

const BAR = /^▇+$/;

interface Case {
  flag: string;
  /** Flags one item of a fresh entity. */
  flagIt: (e: Entity) => void;
  /** The key that reveals that item alone. */
  key: string;
  /** Checks the redacted output: the secret is gone, the rest kept. */
  expectHidden: (out: ReturnType<typeof redactEntity<Entity>>) => void;
}

const cases: Case[] = [
  {
    flag: 'a whole entity (entities.is_spoiler)',
    flagIt: (e) => (e.isSpoiler = true),
    key: spoilerKeys.record(ID),
    expectHidden: (out) => {
      expect(out.name.source).toMatch(BAR);
      expect(out.summary?.source).toMatch(BAR);
      expect(out.description?.source).toMatch(BAR);
      expect(out.dateText).toBeNull();
      expect(out.images).toEqual([
        { redacted: true, role: 'gallery', isSpoiler: false, sortKey: 1 },
      ]);
      expect(out.links).toEqual([{ redacted: true, id: 'l1', isSpoiler: false, sortKey: 0 }]);
      expect(out.facts?.map((f) => 'redacted' in f)).toEqual([true, true]);
      expect(out.relations).toEqual([
        { redacted: true, id: 'r1', relationType: 'participant', isSpoiler: false },
      ]);
      expect(out.members).toEqual([{ redacted: true, isSpoiler: false }]);
      expect(out.location).toEqual({ redacted: true, isSpoiler: false });
      expect([out.id, out.kind, out.version]).toEqual([ID, 'event', 3]);
    },
  },
  {
    flag: 'the name (RichText.spoiler)',
    flagIt: (e) => (e.name = rt.plain('Fall of Gudrun', { spoiler: true })),
    key: spoilerKeys.field(ID, 'name'),
    expectHidden: (out) => {
      expect(out.name).toEqual({ format: 'plain', source: '▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇', spoiler: true });
    },
  },
  {
    flag: 'the summary (RichText.spoiler)',
    flagIt: (e) => (e.summary = rt.md('A **siege**.', { spoiler: true })),
    key: spoilerKeys.field(ID, 'summary'),
    expectHidden: (out) => {
      expect(out.summary?.source).toMatch(BAR);
    },
  },
  {
    flag: 'part of the description (inline HTML spoiler)',
    flagIt: (e) => (e.description = rt.html('<p>By <span data-spoiler>Eisenhorn</span>.</p>')),
    key: spoilerKeys.inline(spoilerKeys.field(ID, 'description'), 0),
    expectHidden: (out) => {
      expect(out.description?.source).toBe('<p>By <span data-spoiler>▇▇▇▇▇▇▇▇▇</span>.</p>');
    },
  },
  {
    flag: 'part of the summary (inline Markdown spoiler)',
    flagIt: (e) => (e.summary = rt.md('By ||Eisenhorn||.')),
    key: spoilerKeys.inline(spoilerKeys.field(ID, 'summary'), 0),
    expectHidden: (out) => {
      expect(out.summary?.source).toBe('By ||▇▇▇▇▇▇▇▇▇||.');
    },
  },
  {
    flag: 'a fact (field_values.is_spoiler)',
    flagIt: (e) => (e.facts[0]!.isSpoiler = true),
    key: spoilerKeys.fact(ID, 'f1'),
    expectHidden: (out) => {
      expect(out.facts?.[0]).toEqual({ redacted: true, fieldDefinitionId: 'f1', isSpoiler: true });
    },
  },
  {
    flag: 'part of a text fact (inline spoiler)',
    flagIt: (e) => (e.facts[1]!.value = { type: 'text', text: rt.md('about ||five||') }),
    key: spoilerKeys.inline(spoilerKeys.fact(ID, 'f2'), 0),
    expectHidden: (out) => {
      expect(out.facts?.[1]).toMatchObject({ value: { text: { source: 'about ||▇▇▇▇▇▇||' } } });
    },
  },
  {
    flag: 'an image (entity_images.is_spoiler)',
    flagIt: (e) => (e.images[0]!.isSpoiler = true),
    key: spoilerKeys.image(ID, 'a1', 'gallery'),
    expectHidden: (out) => {
      expect(out.images?.[0]).toEqual({
        redacted: true,
        role: 'gallery',
        isSpoiler: true,
        sortKey: 1,
      });
    },
  },
  {
    flag: 'an image caption (RichText.spoiler)',
    flagIt: (e) => (e.images[0]!.caption = rt.plain('Ruins', { spoiler: true })),
    key: `${spoilerKeys.image(ID, 'a1', 'gallery')}/caption`,
    expectHidden: (out) => {
      expect(out.images?.[0]).toMatchObject({ assetId: 'a1', caption: { source: '▇▇▇▇▇▇' } });
    },
  },
  {
    flag: 'a link (entity_links.is_spoiler)',
    flagIt: (e) => (e.links[0]!.isSpoiler = true),
    key: spoilerKeys.link(ID, 'l1'),
    expectHidden: (out) => {
      expect(out.links?.[0]).toEqual({ redacted: true, id: 'l1', isSpoiler: true, sortKey: 0 });
    },
  },
  {
    flag: 'a relation (relations.is_spoiler)',
    flagIt: (e) => (e.relations[0]!.isSpoiler = true),
    key: spoilerKeys.relation('r1'),
    expectHidden: (out) => {
      expect(out.relations?.[0]).toEqual({
        redacted: true,
        id: 'r1',
        relationType: 'participant',
        isSpoiler: true,
      });
    },
  },
  {
    flag: 'a relation role (RichText.spoiler)',
    flagIt: (e) => (e.relations[0]!.role = rt.plain('Leader', { spoiler: true })),
    key: `${spoilerKeys.relation('r1')}/role`,
    expectHidden: (out) => {
      expect(out.relations?.[0]).toMatchObject({ toEntityId: 'c9', role: { source: '▇▇▇▇▇▇' } });
    },
  },
  {
    flag: 'a group membership (group_members.is_spoiler)',
    flagIt: (e) => (e.members[0]!.isSpoiler = true),
    key: spoilerKeys.member(ID, 'o1'),
    expectHidden: (out) => {
      expect(out.members?.[0]).toEqual({ redacted: true, isSpoiler: true });
    },
  },
  {
    flag: 'a location (entity_locations.is_spoiler)',
    flagIt: (e) => (e.location.isSpoiler = true),
    key: spoilerKeys.location(ID),
    expectHidden: (out) => {
      expect(out.location).toEqual({ redacted: true, isSpoiler: true });
    },
  },
];

describe('redactEntity', () => {
  it('leaves an entity with no flags exactly as it was', () => {
    expect(redactEntity(entity(), HIDE_SPOILERS, { contentFields: ['dateText'] })).toEqual(
      entity(),
    );
  });

  describe.each(cases)('$flag', ({ flagIt, key, expectHidden }) => {
    const flagged = () => {
      const e = entity();
      flagIt(e);
      return e;
    };

    it('is hidden by default, and nothing else changes', () => {
      const out = redactEntity(flagged(), HIDE_SPOILERS, { contentFields: ['dateText'] });
      expectHidden(out);
      // Every top-level field the case didn't hide is untouched.
      const untouched = Object.keys(entity()).filter(
        (field) =>
          JSON.stringify(out[field as keyof typeof out]) ===
          JSON.stringify(flagged()[field as keyof Entity]),
      );
      const changed = Object.keys(entity()).filter((field) => !untouched.includes(field));
      for (const field of changed) {
        expect(JSON.stringify(out[field as keyof typeof out])).not.toBe(
          JSON.stringify(entity()[field as keyof Entity]),
        );
      }
    });

    it('is shown when the reader shows all spoilers', () => {
      expect(redactEntity(flagged(), SHOW_SPOILERS)).toEqual(flagged());
    });

    it('is shown when the reader reveals just this item', () => {
      expect(redactEntity(flagged(), revealing(key), { contentFields: ['dateText'] })).toEqual(
        flagged(),
      );
    });
  });

  it('applies item flags once a hidden entity is revealed', () => {
    const e = entity();
    e.isSpoiler = true;
    e.links[0]!.isSpoiler = true;
    const out = redactEntity(e, revealing(spoilerKeys.record(ID)));
    expect(out.name).toEqual(e.name);
    expect(out.links?.[0]).toMatchObject({ redacted: true });
  });

  it('never leaks the secret parts of a hidden item', () => {
    const e = entity();
    e.isSpoiler = true;
    const json = JSON.stringify(redactEntity(e, HIDE_SPOILERS, { contentFields: ['dateText'] }));
    for (const secret of [
      'Gudrun',
      'siege',
      'Long story',
      '240.M41',
      'a1',
      'example.com',
      'Source',
      'c9',
      'Leader',
      'o1',
      'p1',
      '"latDeg"',
    ]) {
      expect(json).not.toContain(secret);
    }
  });
});

describe('a relation’s other end (M6-T6)', () => {
  const withEvent = (isSpoiler: boolean) => ({
    ...entity(),
    relations: [
      {
        id: 'r1',
        relationType: 'participant',
        toEntityId: 'e9',
        isSpoiler: false,
        role: null,
        other: {
          id: 'e9',
          namePlain: 'Siege of Calyx',
          isSpoiler,
          nameSpoiler: false,
          dateText: '240.M41',
        },
      },
    ],
  });

  it('blacks out a hidden event’s name and date', () => {
    const out = redactEntity(withEvent(true), HIDE_SPOILERS);
    expect(out.relations?.[0]).toMatchObject({ other: { namePlain: BAR, dateText: null } });
  });

  it('keeps a visible event’s date', () => {
    const out = redactEntity(withEvent(false), HIDE_SPOILERS);
    expect(out.relations?.[0]).toMatchObject({
      other: { namePlain: 'Siege of Calyx', dateText: '240.M41' },
    });
  });
});

describe('redactMap and redactUniverse', () => {
  const map = {
    id: 'm1',
    isSpoiler: false,
    name: rt.plain('M41'),
    description: rt.md('Before ||the fall||'),
  };

  it('hides a whole spoiler map', () => {
    const out = redactMap({ ...map, isSpoiler: true }, HIDE_SPOILERS);
    expect(out.name.source).toMatch(BAR);
    expect(out.description.source).toMatch(BAR);
    expect(redactMap({ ...map, isSpoiler: true }, revealing('m1')).name).toEqual(map.name);
  });

  it('hides spoilers inside map and universe texts', () => {
    expect(redactMap(map, HIDE_SPOILERS).description.source).toBe('Before ||▇▇▇▇▇▇▇▇▇||');
    const universe = {
      id: 'u1',
      name: rt.plain('Warhammer'),
      dateFormatNotes: rt.plain('secret', { spoiler: true }),
    };
    expect(redactUniverse(universe, HIDE_SPOILERS)).toEqual({
      ...universe,
      dateFormatNotes: rt.plain('▇▇▇▇▇▇', { spoiler: true }),
    });
  });
});

describe('namePlain', () => {
  const withPlain = {
    id: 'e9',
    isSpoiler: false,
    name: rt.md('The ||traitor|| king'),
    namePlain: 'The traitor king',
  };

  it('is rebuilt from the redacted name, so it never leaks', () => {
    expect(redactEntity(withPlain, HIDE_SPOILERS).namePlain).toBe('The ▇▇▇▇▇▇▇▇▇ king');
    expect(redactEntity({ ...withPlain, isSpoiler: true }, HIDE_SPOILERS).namePlain).toMatch(
      /^▇+$/,
    );
    expect(redactMap({ ...withPlain, isSpoiler: true }, HIDE_SPOILERS).namePlain).toMatch(/^▇+$/);
  });

  it('stays as it was when nothing is hidden', () => {
    expect(redactEntity(withPlain, SHOW_SPOILERS).namePlain).toBe('The traitor king');
  });
});
