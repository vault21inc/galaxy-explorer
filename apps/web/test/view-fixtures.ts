import type { BaseType, ViewObject } from '@ge/domain';

/** A galaxy-view object for tests, with sensible defaults. */
/** Overrides, with a loosely typed appearance so tests can write plain color strings. */
type Overrides = Partial<Omit<ViewObject, 'appearance'>> & { appearance?: object };

export function viewObject(id: string, baseType: BaseType, overrides: Overrides = {}): ViewObject {
  return {
    id,
    baseType,
    subtypeId: null,
    namePlain: id,
    nameSpoiler: false,
    nameRedacted: id,
    isSpoiler: false,
    status: 'published',
    explorable: baseType === 'system',
    position: [0, 0, 0],
    appearance: { color: '#ffe6a8' },
    size: 120,
    ...overrides,
  } as ViewObject;
}
