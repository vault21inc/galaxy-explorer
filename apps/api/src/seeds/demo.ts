import { schema, withBatch, type Actor, type Database } from '@ge/db';
import { rt } from '@ge/domain';
import { eq } from 'drizzle-orm';
import { setFact } from '../services/aspects/content.ts';
import { setLocation, setMembers } from '../services/aspects/placement.ts';
import {
  ensureAsset,
  ensureConfig,
  ensureEntity,
  ensureImage,
  ensureLink,
  ensureMap,
  ensureRelation,
  ensureUniverse,
} from './ensure.ts';

/**
 * `pnpm db:seed demo` (M1-T11): a small, generic "Example Universe" with one of everything the
 * proof of concept draws and edits, including every spoiler flag in data-model §7 and text in
 * all three formats. It runs through the same services as the API, so the rules apply, and it's
 * idempotent: run it again and nothing changes but versions.
 */

export const SEED_ACTOR: Actor = { type: 'system', label: 'seed' };

const md = rt.md;
const html = rt.html;
const plain = rt.plain;

export async function seedDemo(db: Database) {
  const { result } = await withBatch(db, SEED_ACTOR, 'Seed: demo', async (tx, batchId) => {
    // ---- the universe, its maps and settings ------------------------------------------------
    const universe = await ensureUniverse(tx, {
      slug: 'example-universe',
      name: plain('Example Universe'),
      description: md(
        'A small galaxy for trying things out. Its history hides ||a fallen sector||.',
      ),
      dateFormatNotes: plain('Years are counted from the Founding: "Year 312".'),
      settings: { distanceUnitLabels: { galaxy: 'ly', system: 'AU' }, accentColor: '#4fd1ff' },
    });
    const universeId = universe.id;
    const map = await ensureMap(tx, universeId, {
      slug: 'main',
      name: plain('The Present Era'),
      description: plain('The galaxy as it stands in Year 312.'),
      sortKey: 0,
      galaxySettings: {
        seed: 7,
        radiusLy: 50_000,
        thicknessLy: 1_000,
        arms: 4,
        armTwist: 1.2,
        armSpread: 0.35,
        bulgeRadiusLy: 7_500,
      },
    });
    // A whole map can be a spoiler (data-model §7).
    await ensureMap(tx, universeId, {
      slug: 'after-the-fall',
      name: plain('After the Fall'),
      description: html(
        '<p>The galaxy <span data-spoiler>after the Outer Reach went dark</span>.</p>',
        { spoiler: true },
      ),
      sortKey: 1,
      isSpoiler: true,
    });
    const mapId = map.id;
    const inMap = { mapId };

    const sector = await ensureConfig(tx, 'group_types', universeId, {
      name: 'Sector',
      layer: 'Administrative',
      defaultColor: '#4fd1ff',
      sortKey: 0,
    });
    const subSector = await ensureConfig(tx, 'group_types', universeId, {
      name: 'Sub-sector',
      layer: 'Administrative',
      parentGroupTypeId: sector,
      defaultColor: '#7fb8d9',
      sortKey: 1,
    });
    const battle = await ensureConfig(tx, 'event_categories', universeId, {
      name: 'Battle',
      icon: 'swords',
      color: '#e5484d',
      sortKey: 0,
    });
    const discovery = await ensureConfig(tx, 'event_categories', universeId, {
      name: 'Discovery',
      icon: 'telescope',
      color: '#4fd1ff',
      sortKey: 1,
    });
    const founding = await ensureConfig(tx, 'event_categories', universeId, {
      name: 'Founding',
      icon: 'flag',
      color: '#c8a24a',
      sortKey: 2,
    });
    const hiveWorld = await ensureConfig(tx, 'object_subtypes', universeId, {
      baseType: 'planet',
      name: 'Hive World',
      icon: 'building-2',
      description: plain('A planet covered by vast city-spires.'),
      defaultAppearance: { color: '#c9a66b', planet: { preset: 'city' } },
    });
    const forgeWorld = await ensureConfig(tx, 'object_subtypes', universeId, {
      baseType: 'planet',
      name: 'Forge World',
      icon: 'factory',
      defaultAppearance: { color: '#d9734a', planet: { preset: 'forge' } },
    });
    const population = await ensureConfig(tx, 'field_definitions', universeId, {
      key: 'population',
      label: 'Population',
      valueType: 'number',
      unit: 'billion',
      appliesToKind: 'celestial_object',
      appliesToBaseType: 'planet',
      sortKey: 0,
    });
    const climate = await ensureConfig(tx, 'field_definitions', universeId, {
      key: 'climate',
      label: 'Climate',
      valueType: 'text',
      appliesToKind: 'celestial_object',
      appliesToBaseType: 'planet',
      sortKey: 1,
    });
    const founded = await ensureConfig(tx, 'field_definitions', universeId, {
      key: 'founded',
      label: 'Founded',
      valueType: 'date_text',
      appliesToKind: 'place',
      sortKey: 0,
    });

    // ---- objects: 6 systems with stars, planets, moons, a belt, a station and two regions -----
    const object = (key: string, values: Record<string, unknown>) =>
      ensureEntity(tx, 'celestial_object', inMap, `demo-${key}`, values);
    const system = (
      key: string,
      name: string,
      x: number,
      y: number,
      z: number,
      extra: Record<string, unknown> = {},
    ) =>
      object(key, { name: plain(name), baseType: 'system', explorable: true, x, y, z, ...extra });
    const star = (key: string, name: string, parentId: string, temperatureK: number) =>
      object(key, {
        name: plain(name),
        baseType: 'star',
        parentId,
        appearance: { star: { temperatureK } },
      });

    const aster = await system('aster', 'Aster', 8_200, 40, -3_100, {
      summary: md('Capital of the **Inner Reach**.'),
    });
    const brennan = await system('brennan', 'Brennan', -12_400, -60, 6_800);
    const corvid = await system('corvid', 'Corvid', 21_500, 120, 14_800);
    const dalmatia = await system('dalmatia', 'Dalmatia', -3_000, 10, -22_000);
    // A whole entity can be a spoiler.
    const erebus = await system('erebus', 'Erebus', 15_500, -30, -9_000, {
      isSpoiler: true,
      summary: plain('Where the Outer Reach fell silent.'),
    });
    const fenwick = await system('fenwick', 'Fenwick', -24_000, 80, -14_500);
    await star('aster-star', 'Aster', aster, 5_800);
    await star('brennan-star', 'Brennan', brennan, 3_200);
    await star('corvid-star', 'Corvid', corvid, 9_500);
    await star('dalmatia-star', 'Dalmatia', dalmatia, 4_600);
    await star('erebus-star', 'Erebus', erebus, 2_900);
    await star('fenwick-star', 'Fenwick', fenwick, 6_400);

    const planet = (key: string, values: Record<string, unknown>) =>
      object(key, { baseType: 'planet', ...values });
    await planet('aster-i', {
      name: plain('Aster I'),
      parentId: aster,
      x: 1.2,
      appearance: { planet: { preset: 'barren' } },
    });
    const primus = await planet('aster-ii', {
      name: plain('Primus'),
      parentId: aster,
      subtypeId: hiveWorld,
      explorable: true,
      x: 4.5,
      z: 1.5,
      summary: plain('The hive world at the heart of the Inner Reach.'),
      // Inline spoiler in Markdown.
      description: md(
        'Primus houses forty billion people. Its governor is ||secretly loyal to the Outer Reach||.',
      ),
    });
    const brennanIii = await planet('brennan-iii', {
      name: plain('Brennan III'),
      parentId: brennan,
      explorable: true,
      x: 2.8,
      appearance: { planet: { preset: 'ocean', clouds: { enabled: true, coverage: 0.5 } } },
    });
    const corvidPrime = await planet('corvid-prime', {
      name: plain('Corvid Prime'),
      parentId: corvid,
      subtypeId: forgeWorld,
      explorable: true,
      x: 6,
    });
    await planet('dalmatia-iv', {
      name: plain('Dalmatia IV'),
      parentId: dalmatia,
      x: 9,
      appearance: {
        planet: {
          preset: 'gas_giant',
          rings: { enabled: true, innerRadius: 1.4, outerRadius: 2.3 },
        },
      },
    });
    await planet('erebus-i', {
      name: plain('Erebus I'),
      parentId: erebus,
      x: 1.5,
      appearance: { planet: { preset: 'lava' } },
    });
    await planet('wanderer', {
      name: plain('Wanderer'),
      explorable: true,
      x: -7_000,
      y: 0,
      z: 18_000,
      summary: plain('A rogue planet between the stars.'),
    });
    const primusMinor = await object('primus-minor', {
      name: plain('Primus Minor'),
      baseType: 'moon',
      parentId: primus,
      explorable: true,
      x: 3.2,
    });
    await object('brennan-iiia', {
      name: plain('Brennan IIIa'),
      baseType: 'moon',
      parentId: brennanIii,
      x: 4,
    });
    await object('aster-belt', {
      name: plain('Aster Belt'),
      baseType: 'asteroid_belt',
      parentId: aster,
      x: 6.5,
    });
    const fenwickWatch = await object('fenwick-watch', {
      name: plain('Fenwick Watch'),
      baseType: 'station',
      parentId: fenwick,
      x: 3,
    });
    await object('veil-nebula', {
      name: plain('Veil Nebula'),
      baseType: 'nebula',
      x: 2_000,
      z: 9_000,
      appearance: { region: { radius: 2_500 } },
    });
    // A whole name can be a spoiler, and HTML can hide part of a text.
    await object('the-maw', {
      name: plain('The Maw', { spoiler: true }),
      baseType: 'anomaly',
      x: 18_000,
      z: -12_000,
      description: html(
        '<p>A storm in the void. <span data-spoiler>It swallowed the Erebus fleet.</span></p>',
      ),
      appearance: { region: { radius: 1_800 } },
    });

    // ---- facts, images and links ----------------------------------------------------------
    await setFact(tx, primus, {
      fieldDefinitionId: population,
      value: { type: 'number', number: 40 },
    });
    await setFact(tx, primus, {
      fieldDefinitionId: climate,
      value: { type: 'text', text: md('Smog-choked; ||acid rain|| in the lower hives.') },
    });
    await setFact(tx, corvidPrime, {
      fieldDefinitionId: population,
      value: { type: 'number', number: 3.5 },
      isSpoiler: true,
    });
    const primusImage = await ensureAsset(tx, universeId, 'demo-primus', 'The spires of Primus');
    const corvidImage = await ensureAsset(tx, universeId, 'demo-corvid', 'A forge on Corvid Prime');
    await ensureImage(tx, primus, {
      assetId: primusImage,
      role: 'cover',
      caption: plain('The spires at dusk'),
    });
    await ensureImage(tx, corvidPrime, {
      assetId: corvidImage,
      role: 'gallery',
      caption: plain('Hidden forges', { spoiler: true }),
      isSpoiler: true,
    });
    await ensureLink(tx, primus, { url: 'https://example.com/primus', label: 'Survey report' });

    // ---- groups -------------------------------------------------------------------------------
    const vela = await ensureEntity(tx, 'group', inMap, 'demo-vela-sector', {
      name: plain('Vela Sector'),
      groupTypeId: sector,
    });
    const inner = await ensureEntity(tx, 'group', inMap, 'demo-inner-reach', {
      name: plain('Inner Reach'),
      groupTypeId: subSector,
      parentGroupId: vela,
    });
    const outer = await ensureEntity(tx, 'group', inMap, 'demo-outer-reach', {
      name: plain('Outer Reach'),
      groupTypeId: subSector,
      parentGroupId: vela,
    });
    await setMembers(tx, inner, [{ objectId: aster }, { objectId: brennan }, { objectId: corvid }]);
    // A membership can be a spoiler: Erebus belonged to the Outer Reach.
    await setMembers(tx, outer, [
      { objectId: dalmatia },
      { objectId: erebus, isSpoiler: true },
      { objectId: fenwick },
    ]);

    // ---- places and events, one per location mode ------------------------------------------
    const hiveSpire = await ensureEntity(tx, 'place', inMap, 'demo-hive-spire', {
      name: plain('Hive Spire'),
      summary: plain('The tallest spire on Primus.'),
    });
    await setLocation(tx, hiveSpire, {
      mode: 'surface',
      objectId: primus,
      latDeg: 12.5,
      lonDeg: -40.2,
    });
    await setFact(tx, hiveSpire, {
      fieldDefinitionId: founded,
      value: { type: 'date_text', text: 'Year 0', sort: 0 },
    });
    const archive = await ensureEntity(tx, 'place', inMap, 'demo-watch-archive', {
      name: plain('Watch Archive'),
    });
    await setLocation(tx, archive, { mode: 'object', objectId: fenwickWatch });

    const event = (key: string, values: Record<string, unknown>) =>
      ensureEntity(tx, 'event', inMap, `demo-${key}`, values);
    const foundingEvent = await event('founding', {
      name: plain('Founding of Hive Spire'),
      categoryId: founding,
      dateText: 'Year 0',
      dateSort: 0,
    });
    await setLocation(tx, foundingEvent, { mode: 'place', placeId: hiveSpire });
    const battleEvent = await event('battle-of-brennan', {
      name: plain('Battle of Brennan'),
      categoryId: battle,
      dateText: 'Year 312',
      dateSort: 312,
    });
    // A location can be a spoiler: the pin isn't drawn.
    await setLocation(tx, battleEvent, {
      mode: 'surface',
      objectId: brennanIii,
      latDeg: -20,
      lonDeg: 75,
      isSpoiler: true,
    });
    const discoveryEvent = await event('discovery-of-the-maw', {
      name: plain('Discovery of the Maw'),
      categoryId: discovery,
      dateText: 'Year 298',
      dateSort: 298,
    });
    await setLocation(tx, discoveryEvent, {
      mode: 'space',
      objectId: corvid,
      x: 12,
      y: 0,
      z: -4,
    });
    const silentFleet = await event('silent-fleet', {
      name: plain('The Silent Fleet'),
      isSpoiler: true,
      dateText: 'Year 311',
      dateSort: 311,
    });
    await setLocation(tx, silentFleet, { mode: 'object', objectId: primusMinor });

    // ---- characters and relations ------------------------------------------------------------
    const inUniverse = { universeId };
    const mara = await ensureEntity(tx, 'character', inUniverse, 'demo-mara-venn', {
      name: plain('Mara Venn'),
      summary: md('Admiral of the *Inner Reach* fleet.'),
    });
    const tobias = await ensureEntity(tx, 'character', inUniverse, 'demo-tobias-crane', {
      name: plain('Tobias Crane'),
      description: html(
        '<p>A surveyor who charted the Maw.</p><p><em>Missing since Year 299.</em></p>',
      ),
    });
    await ensureRelation(tx, mara, {
      relationType: 'participant',
      toEntityId: battleEvent,
      role: plain('Commander'),
    });
    await ensureRelation(tx, mara, {
      relationType: 'participant',
      toEntityId: foundingEvent,
      role: plain('Witness', { spoiler: true }),
    });
    // A relation can be a spoiler.
    await ensureRelation(tx, tobias, {
      relationType: 'participant',
      toEntityId: discoveryEvent,
      role: plain('Discoverer'),
      isSpoiler: true,
    });
    // A link can be a spoiler.
    await ensureLink(tx, mara, {
      url: 'https://example.com/mara-venn-fate',
      label: 'What became of her',
      isSpoiler: true,
    });

    // List the batch in the universe's history; the universe may not have existed at the start.
    await tx
      .update(schema.changeBatches)
      .set({ universeId })
      .where(eq(schema.changeBatches.id, batchId));
    return { universeId, mapId };
  });
  return result;
}
