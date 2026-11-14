# Galaxy Explorer: a guide for LLM agents

Galaxy Explorer builds galaxies by hand: universes, their maps, and everything on them. This guide is for agents that read and write that content through the **MCP server** (`apps/mcp`, tools such as `objects_create`) or the **REST API** (`/api/v1`, described at `/api/openapi.json`). Each MCP tool calls one REST route and takes the same fields, so everything below applies to both.

Read it once before you start. The tool descriptions give each field's details.

## 1. Concepts

- **Universe:** a fictional setting, such as Warhammer 40,000. It holds maps, characters, images, and its settings: group types, event categories, object subtypes and field definitions.
- **Map:** one galaxy at one point in time ("M41"). A universe can have several, for different eras. Everything except characters belongs to one map.
- **Entities**, the things you write about, come in six kinds:

  | Kind | Tools | What it is |
  |---|---|---|
  | `celestial_object` | `objects_*` | a system, star, planet, moon, asteroid belt, station, nebula, anomaly, black hole or marker (`baseType`) |
  | `group` | `groups_*` | a region such as a sector or sub-sector, of a group type; it has member objects |
  | `route` | `routes_*` | a line through objects (`waypoints`), such as a trade route |
  | `place` | `places_*` | somewhere on or near a body, such as a city; it has a location |
  | `event` | `events_*` | something that happened, with an optional date, category and location |
  | `character` | `characters_*` | a person; belongs to the universe, not a map, and is linked to events |

- **Every entity has** `name` (rich text, below), an optional `summary` (one or two sentences) and `description`, `isSpoiler`, `status` (`published` or `draft`), and an optional `externalKey`.

### The object tree

Objects nest: `parentId` is the object one sits inside, or `null` for the top level of the galaxy. Which parents each base type allows is fixed:

| Base type | Parents | Opens a view |
|---|---|---|
| `system` | map | system |
| `star` | system | — |
| `planet` | system, map | orbit |
| `moon` | planet | orbit |
| `asteroid_belt` | system | — |
| `station` | map, system, planet, moon | — |
| `nebula` | map | — |
| `anomaly` | map, system | — |
| `black_hole` | map, system | — |
| `marker` | map, system, planet, moon | — |

A system, planet or moon opens its own view only with `explorable: true`. Set it on any system you put stars and planets in, and on planets that get moons or surface locations.

### Frames and units

An object's `x`, `y`, `z` are in **its parent's frame**:

| Frame | For | Unit | Typical values |
|---|---|---|---|
| Galaxy | top-level objects (`parentId: null`) | light-years | the disc spans about ±50,000 on x and z, with y near 0 (the plane is x–z) |
| System | stars, planets, belts and stations in a system | system units, roughly AU | the main star at 0, 0, 0, then planets at x = 3, 6, 10… |
| Orbit | moons and stations of a planet or moon | the body's radii | moons at x = 3 to 12 |
| Surface | places and events on a body | degrees | `latDeg` −90 to 90, `lonDeg` −180 to 180 |

Spread things out so they can be told apart: planets a few system units apart, moons a few radii apart. `y` is up, out of the plane; keep it small.

### Rich text

Names, summaries, descriptions and text facts are rich text: `{ "format": "plain" | "markdown" | "html", "source": "…", "spoiler": false }`. Use `plain` for names. In Markdown, `||like this||` marks part of a text as a spoiler, and `"spoiler": true` hides the whole field.

### Settings

- **Group types** (`group_types_*`): Segmentum, Sector, Sub-sector…, each with a `layer` and a `defaultColor`. A group needs one.
- **Event categories** (`event_categories_*`): Battle, Founding…, each with an `icon` (`set:name`, such as `lucide:swords`) and a `color`.
- **Object subtypes** (`object_subtypes_*`): Hive World, Forge World…, for one `baseType`.
- **Field definitions** (`field_definitions_*`): the facts an entity can have ("Population"), with a `key`, `label`, `valueType` (`text`, `number`, `date_text`, `url`), an optional `unit`, and the kind (and optionally the base type or subtype) they apply to.

### Aspects

Aspects are set through `batch` operations, on the entity's `id`:

| Operation | Data |
|---|---|
| `setFacts` | `[{ "fieldDefinitionId", "value", "isSpoiler"? }]`; `value` is `{ "type": "number", "number": 5 }`, `{ "type": "text", "text": <rich text> }`, `{ "type": "date_text", "text": "240.M41", "sort"?: 240.041 }` or `{ "type": "url", "url", "label"? }` |
| `setLocation` | for a place or event: `{ "mode": "surface", "objectId", "latDeg", "lonDeg" }`, `{ "mode": "object", "objectId" }`, `{ "mode": "space", "objectId": <system or null>, "x", "y", "z" }` or `{ "mode": "place", "placeId" }` |
| `addMembers` | for a group: `[{ "objectId" }]`, top-level objects only, at most one group of each type per object |
| `setWaypoints` | for a route: top-level object ids in order |
| `addLink` | `{ "url", "label"? }` |
| `addRelation` | `{ "relationType": "participant", "toEntityId": <event>, "role"? }` on a character, or `"related"` between any two |

## 2. Rules

1. **Find before you make.** Use `universes_list`, `maps_list`, `search` and the `*_list` tools to get ids, and to check that something doesn't exist already.
2. **Give what you create an `externalKey`**, such as `gudrun-system`, and prefer `*_upsert_by_key`, or `upsert` operations in a batch. Running the same task again then updates instead of duplicating. Keys are unique per map (per universe for characters).
3. **Build structures in one `batch`.** A batch runs up to 1,000 operations in one transaction: all of them happen, or none. An operation refers to what an earlier one created as `"$op:N"` (counting from 0), anywhere an id goes.
4. **Dry-run first.** `batch` with `"dryRun": true` runs everything, reports the results and the rows it would touch, and rolls back. Do it for anything larger than one change, and for every delete.
5. **Updates and deletes need the current `version`**, from a get or list. A stale version is a `409`: read the entity again and retry. Upserts by key need no version.
6. **Never delete unless you were asked to.** A delete also removes everything inside: a system's stars and planets, a group's memberships.
7. **Say what you did.** Every write returns its `batchId`, and is listed in the History panel as "MCP: …". Tell the user which batches you made, so they can undo them.
8. **Read errors.** A rule the API enforces (a moon outside a planet, a fact for the wrong kind) comes back as a 422 that names the field and says why. Fix the input rather than retrying it as it was.
9. **Mind the rate limit.** A token may send about 600 requests a minute, and uploads and imports 120 an hour. Past it, a `429` says how many seconds to wait (`Retry-After`): wait, then go on. Many small writes go faster as one `batch` anyway.

## 3. Worked examples

The examples assume the user named the universe, which `universes_list` gives as `U`, and its map, which `maps_list` gives as `M`.

### A system with a star and planets

Dry-run first (`"dryRun": true`), then the same call without it:

```json
{
  "tool": "batch",
  "arguments": {
    "description": "Gudrun system",
    "operations": [
      { "op": "upsert", "kind": "celestial_object", "mapId": "M", "externalKey": "gudrun-system",
        "data": { "name": { "format": "plain", "source": "Gudrun System" }, "baseType": "system",
                  "explorable": true, "x": 1200, "y": 0, "z": -400 } },
      { "op": "upsert", "kind": "celestial_object", "mapId": "M", "externalKey": "gudrun-star",
        "data": { "name": { "format": "plain", "source": "Gudrun" }, "baseType": "star", "parentId": "$op:0" } },
      { "op": "upsert", "kind": "celestial_object", "mapId": "M", "externalKey": "gudrun-i",
        "data": { "name": { "format": "plain", "source": "Gudrun I" }, "baseType": "planet",
                  "parentId": "$op:0", "x": 4, "explorable": true } },
      { "op": "upsert", "kind": "celestial_object", "mapId": "M", "externalKey": "gudrun-ii",
        "data": { "name": { "format": "plain", "source": "Gudrun II" }, "baseType": "planet",
                  "parentId": "$op:0", "x": 8, "z": 3 } }
    ]
  }
}
```

The result lists each operation's entity. `results[2].id` is Gudrun I's id, for what follows.

### Moons around a planet

Moons sit in the planet's orbit frame, in its radii:

```json
{ "tool": "batch", "arguments": { "description": "Moons of Gudrun I", "operations": [
  { "op": "upsert", "kind": "celestial_object", "mapId": "M", "externalKey": "gudrun-i-a",
    "data": { "name": { "format": "plain", "source": "Gudrun I-a" }, "baseType": "moon", "parentId": "<Gudrun I>", "x": 4 } },
  { "op": "upsert", "kind": "celestial_object", "mapId": "M", "externalKey": "gudrun-i-b",
    "data": { "name": { "format": "plain", "source": "Gudrun I-b" }, "baseType": "moon", "parentId": "<Gudrun I>", "x": 7, "z": 2 } }
] } }
```

### An event on a planet's surface

```json
{ "tool": "batch", "arguments": { "description": "The siege of Gudrun I", "operations": [
  { "op": "upsert", "kind": "event", "mapId": "M", "externalKey": "siege-of-gudrun",
    "data": { "name": { "format": "plain", "source": "The siege of Gudrun I" }, "dateText": "240.M41", "dateSort": 240.041,
              "summary": { "format": "markdown", "source": "The hive held for a year. ||Its governor opened the gates.||" } } },
  { "op": "setLocation", "id": "$op:0", "data": { "mode": "surface", "objectId": "<Gudrun I>", "latDeg": 20, "lonDeg": 30 } }
] } }
```

The planet must be `explorable` for its globe, and the pin, to be seen.

### A sub-sector with its systems

```json
{ "tool": "group_types_create", "arguments": { "universeId": "U", "name": "Sub-sector", "layer": "Administrative", "defaultColor": "#c8a24a" } }
```

```json
{ "tool": "batch", "arguments": { "description": "Helican sub-sector", "operations": [
  { "op": "upsert", "kind": "group", "mapId": "M", "externalKey": "helican",
    "data": { "name": { "format": "plain", "source": "Helican" }, "groupTypeId": "<the group type>" } },
  { "op": "addMembers", "id": "$op:0", "data": [{ "objectId": "<Gudrun System>" }, { "objectId": "<another system>" }] }
] } }
```

Members are top-level objects (systems, not planets). The group's outline follows them.

### Facts and a subtype

Define the facts and the subtype once per universe:

```json
{ "tool": "field_definitions_create", "arguments": { "universeId": "U", "key": "population", "label": "Population",
  "valueType": "number", "unit": "billion", "appliesToKind": "celestial_object", "appliesToBaseType": "planet" } }
```

```json
{ "tool": "object_subtypes_create", "arguments": { "universeId": "U", "baseType": "planet", "name": "Hive World" } }
```

Then set them on planets:

```json
{ "tool": "batch", "arguments": { "description": "Gudrun I facts", "operations": [
  { "op": "update", "kind": "celestial_object", "id": "<Gudrun I>", "version": 1, "data": { "subtypeId": "<Hive World>" } },
  { "op": "setFacts", "id": "<Gudrun I>", "data": [
    { "fieldDefinitionId": "<population>", "value": { "type": "number", "number": 5 } }
  ] }
] } }
```

A fact must apply to the entity: right kind, and right base type or subtype if the definition narrows it.

### Undoing it

`history_list` (with `universeId`) lists the universe's batches, newest first. `history_revert` with a `batchId` undoes one batch completely, as a new batch, which can itself be reverted to redo it. If something in it changed since, the revert stops with a `409` naming what changed: revert the later batch first.

## 4. Reading

- `search` (`universeId`, `q`): entries whose words start with yours, with their kind, map, path and a snippet.
- `view_galaxy` (`mapId`), `view_system` and `view_orbit` (an object's `id`): what a view draws, with each object's resolved position, size and look. Use them to see what's there and where.
- `*_get` with `include` (`facts,images,links,relations,location,members,waypoints,citations,counterparts`) returns an entity with its aspects.
- `import_dry_run` checks a CSV of objects (`name, base_type, x, y, z, parent_key, group_key, external_key`) or an export zip against a universe, without importing it.
