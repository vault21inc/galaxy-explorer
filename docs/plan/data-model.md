# Data model

This is the PostgreSQL 18 schema. The SQL below is a precise sketch, not the migration itself: write the tables with Drizzle in `packages/db/src/schema/`, and write triggers and functions as custom SQL migrations. Table and column names are final unless a task says otherwise.

## 1. Overview

```
universes ─┬─ maps ─┬─ entities (kind: celestial_object, group, route, place, event)
           │        │     ├─ celestial_objects ──┐ parent_id: map › system › planet › moon/station
           │        │     │                      ◀┘
           │        │     ├─ object_groups ── group_members ──▶ celestial_objects
           │        │     ├─ routes ── route_waypoints ──▶ celestial_objects
           │        │     ├─ events
           │        │     └─ entity_locations (places and events) ──▶ celestial_objects / places
           ├─ entities (kind: character, map_id null)
           ├─ group_types · event_categories · object_subtypes · field_definitions   (universe settings)
           ├─ assets
           └─ change_batches ── change_log

Aspects shared by every entity: entity_images ──▶ assets, entity_links, field_values ──▶ field_definitions,
                                 relations (entity ──▶ entity), citations (M7)
Accounts and access (M8, D-34): users ── sessions, api_tokens, account_links (invites and resets)
                                universes.owner_id ──▶ users;  universe_members (editors and viewers) ──▶ users
                                access_events (what admins and owners did)
```

**Where each table arrives:** M1 creates everything above except `routes`/`route_waypoints` (M4), `citations` and search columns (M7), and accounts and access (M8).

## 2. Conventions

- **Primary keys:** `uuid` with `default uuidv7()`, which is built into Postgres 18 and gives time-ordered ids. Link tables use composite primary keys.
- **Bookkeeping columns:** `created_at` and `updated_at` (`timestamptz not null default now()`) and `version integer not null default 1` on universes, maps and entities. Updates set `updated_at = now()` and `version = version + 1`.
- **Same-map integrity:** map-scoped tables carry `map_id`, and every reference between map-scoped rows is a composite foreign key `(x_id, map_id)`. This makes it impossible to put a planet from map A into a system in map B, or to cross maps when cloning. Referenced tables declare `unique (entity_id, map_id)` (or `unique (id, map_id)`) for this purpose.
- **Deferrable foreign keys:** foreign keys are `deferrable initially immediate`. Revert and clone run with `set constraints all deferred`, so row order inside them doesn't matter. Unique constraints stay non-deferrable, because foreign keys must target them. Drizzle can't declare deferrable keys, so the Drizzle schema has none: every foreign key is written in SQL at the end of its migration ([packages/db/migrations/README.md](../../packages/db/migrations/README.md)), and a test checks they're all deferrable.
- **Enumerations** are `text` columns with `check (… in (…))` constraints, generated from the registries. Adding a value is a migration plus a registry entry, and the consistency tests keep them in sync.
- **jsonb** holds only the Zod-validated documents in §4. The API validates every jsonb write with the schema named in the column comment. Nothing that is joined, filtered or referenced lives in jsonb.
- **Slugs:** `^[a-z0-9]+(-[a-z0-9]+)*$`. **Colors:** `^#[0-9a-f]{6}$` (lower-case hex).

## 3. Tables

Abbreviations: `‹stamps›` = `created_at`, `updated_at`, `version` as in §2. `‹entity-fk›` = `unique (entity_id, map_id), foreign key (entity_id, map_id) references entities (id, map_id) on delete cascade deferrable`.

### 3.1 Containers

```sql
create table universes (
  id                 uuid primary key default uuidv7(),
  slug               text not null unique,
  name               jsonb not null,                -- RichText
  name_plain         text not null,                 -- derived on write
  description        jsonb,                         -- RichText
  date_format_notes  jsonb,                         -- RichText: how dates are written here (E2)
  settings           jsonb not null default '{}',   -- UniverseSettings
  -- From M8 (D-34, §8):
  owner_id           uuid references users on delete restrict,  -- null: the installation's own; admins edit it
  visibility         text not null default 'private' check (visibility in ('private', 'link', 'public')),
  share_key          text unique,                   -- random; set while visibility = 'link', part of the share link
  ‹stamps›
);

create table maps (                                 -- one galaxy at one point in time (U7)
  id                  uuid primary key default uuidv7(),
  universe_id         uuid not null references universes on delete cascade,
  slug                text not null,
  name                jsonb not null,               -- RichText
  name_plain          text not null,
  description         jsonb,                        -- RichText
  sort_key            numeric not null default 0,   -- order in the map switcher, e.g. by era
  galaxy_settings     jsonb not null default '{}',  -- GalaxySettings (procedural background)
  underlay_asset_id   uuid references assets on delete restrict, -- §11: an asset in use can't be deleted
  underlay            jsonb,                        -- Underlay (reference image placement, edit mode only)
  cloned_from_map_id  uuid references maps on delete set null,
  is_spoiler          boolean not null default false,
  status              text not null default 'published' check (status in ('draft', 'published')),
  ‹stamps›,
  unique (universe_id, slug)
);
```

### 3.2 Entities (base table)

```sql
create table entities (
  id                     uuid primary key default uuidv7(),
  universe_id            uuid not null references universes on delete cascade,
  map_id                 uuid references maps on delete cascade,      -- null for universe-scoped kinds
  kind                   text not null check (kind in ('celestial_object', 'group', 'route',
                                                       'place', 'event', 'character')),
  name                   jsonb not null,                              -- RichText
  name_plain             text not null,                               -- labels, sorting, breadcrumbs, search
  summary                jsonb,                                       -- RichText, one or two sentences
  description            jsonb,                                       -- RichText, long form
  is_spoiler             boolean not null default false,              -- the whole entity is a potential spoiler
  status                 text not null default 'published' check (status in ('draft', 'published')),
  external_key           text,                                        -- stable key for imports and LLM agents
  cloned_from_entity_id  uuid references entities on delete set null, -- lineage across cloned maps (U7)
  ‹stamps›,
  unique (id, map_id),                                                -- target of same-map composite FKs
  check ((kind = 'character') = (map_id is null))                     -- generated from each kind's scope
);
create unique index entities_external_key_uq on entities (universe_id, map_id, external_key)
  nulls not distinct where external_key is not null;
create index entities_map_kind_idx on entities (map_id, kind);
```

### 3.3 Kind extension tables

```sql
create table celestial_objects (
  entity_id    uuid primary key,
  map_id       uuid not null,
  parent_id    uuid,                                  -- null = top level, shown in the galaxy view
  base_type    text not null check (base_type in ('system', 'star', 'planet', 'moon', 'asteroid_belt',
                                                  'station', 'nebula', 'anomaly', 'black_hole', 'marker')),
  subtype_id   uuid references object_subtypes on delete set null,
  explorable   boolean not null default false,       -- opens its own view; only if the type has one (U3)
  x            double precision not null default 0,  -- position in the parent's frame, §5
  y            double precision not null default 0,
  z            double precision not null default 0,
  appearance   jsonb not null default '{}',          -- Appearance (sparse overrides)
  orbit_center_id uuid,                              -- a star in the same parent that this orbits (D-29, M5); null = the parent's center
  ‹entity-fk›,
  foreign key (parent_id, map_id) references celestial_objects (entity_id, map_id) on delete cascade deferrable,
  -- set null (orbit_center_id): clear only that column, not map_id, when the star is deleted (M5-T4)
  foreign key (orbit_center_id, map_id) references celestial_objects (entity_id, map_id) on delete set null (orbit_center_id) deferrable,
  check (parent_id is distinct from entity_id),
  check (orbit_center_id is distinct from entity_id)
);
create index celestial_objects_parent_idx on celestial_objects (map_id, parent_id);
-- Rules enforced in the service layer (registry-driven): parent's base_type is in objectTypes[base_type].parents
-- ('map' = parent_id null); explorable only if objectTypes[base_type].explorableAs is set; no cycles;
-- orbit_center_id names a 'star' with the same parent_id, never the object itself (D-29), and a star
-- that others orbit can't change its base type (M5-T4).

create table object_groups (                          -- territories, sectors, sub-sectors (T5, U6)
  entity_id        uuid primary key,
  map_id           uuid not null,
  group_type_id    uuid not null references group_types on delete restrict,
  parent_group_id  uuid,
  outline_color    text not null,                     -- defaults to the group type's color
  style            jsonb not null default '{}',       -- GroupStyle
  ‹entity-fk›,
  unique (entity_id, group_type_id),
  foreign key (parent_group_id, map_id) references object_groups (entity_id, map_id)
    on delete set null (parent_group_id) deferrable
);
-- Rule: the parent group's type must be this group type's parent_group_type_id (when that is set).

create table group_members (
  group_id       uuid not null,
  group_type_id  uuid not null,                       -- denormalized for the one-group-per-type rule
  map_id         uuid not null,
  object_id      uuid not null,
  is_spoiler     boolean not null default false,      -- membership itself is a spoiler
  primary key (group_id, object_id),
  unique (object_id, group_type_id),                  -- an object is in at most one group of each type
  foreign key (group_id, group_type_id) references object_groups (entity_id, group_type_id)
    on delete cascade on update cascade deferrable,
  foreign key (group_id, map_id) references object_groups (entity_id, map_id) on delete cascade deferrable,
  foreign key (object_id, map_id) references celestial_objects (entity_id, map_id) on delete cascade deferrable
);
-- Rule (PoC): members are top-level objects. A group's outline covers its members plus all members of
-- its descendant groups.

create table routes (                                 -- M4: lines between objects (U6)
  entity_id  uuid primary key,
  map_id     uuid not null,
  style      jsonb not null default '{}',             -- RouteStyle
  ‹entity-fk›
);

create table route_waypoints (
  route_id   uuid not null,
  seq        integer not null check (seq >= 0),
  map_id     uuid not null,
  object_id  uuid not null,
  primary key (route_id, seq),
  foreign key (route_id, map_id) references routes (entity_id, map_id) on delete cascade deferrable,
  foreign key (object_id, map_id) references celestial_objects (entity_id, map_id) on delete cascade deferrable
);
-- Rules (M4-T7): waypoints are top-level objects; an object may come again later in a route (a round
-- trip) but not twice in a row. Deleting an object removes its waypoints and leaves a gap in seq.

create table events (
  entity_id    uuid primary key,
  map_id       uuid not null,
  category_id  uuid references event_categories on delete set null,
  date_text    text,                                  -- free text in the universe's format, e.g. '240.M41'
  date_sort    numeric,                               -- optional sort key chosen by the author
  ‹entity-fk›
);
create index events_date_idx on events (map_id, date_sort);

-- 'place' and 'character' have no extension table: base entity + aspects + (places) a location.

create table entity_locations (                       -- where a place or event is (E3, E4)
  entity_id   uuid primary key,
  map_id      uuid not null,
  mode        text not null check (mode in ('surface', 'object', 'space', 'place')),
  object_id   uuid,             -- surface/object: the body; space: the system whose frame x,y,z use (null = galaxy)
  place_id    uuid,             -- mode 'place': the place entity (kind 'place', service-checked)
  lat_deg     double precision check (lat_deg between -90 and 90),
  lon_deg     double precision check (lon_deg >= -180 and lon_deg < 180),
  x           double precision,
  y           double precision,
  z           double precision,
  is_spoiler  boolean not null default false,          -- the location is a spoiler: the pin is not shown (P2)
  ‹entity-fk›,
  foreign key (object_id, map_id) references celestial_objects (entity_id, map_id) on delete cascade deferrable,
  foreign key (place_id, map_id) references entities (id, map_id) on delete cascade deferrable,
  check (case mode
    when 'surface' then object_id is not null and lat_deg is not null and lon_deg is not null
                        and place_id is null and x is null and y is null and z is null
    when 'object'  then object_id is not null and lat_deg is null and lon_deg is null
                        and place_id is null and x is null and y is null and z is null
    when 'space'   then x is not null and y is not null and z is not null
                        and lat_deg is null and lon_deg is null and place_id is null
    when 'place'   then place_id is not null and object_id is null and lat_deg is null
                        and lon_deg is null and x is null and y is null and z is null
  end)
);
create index entity_locations_object_idx on entity_locations (object_id);
create index entity_locations_place_idx on entity_locations (place_id);
```

### 3.4 Aspects (shared by every entity kind)

```sql
create table relations (
  id              uuid primary key default uuidv7(),
  universe_id     uuid not null references universes on delete cascade,
  from_entity_id  uuid not null references entities on delete cascade deferrable,
  to_entity_id    uuid not null references entities on delete cascade deferrable,
  relation_type   text not null check (relation_type in ('participant', 'related')),
  role            jsonb,                                -- RichText, e.g. "Inquisitor leading the hunt"
  is_spoiler      boolean not null default false,
  sort_key        numeric not null default 0,
  created_at      timestamptz not null default now(),
  unique (from_entity_id, to_entity_id, relation_type),
  check (from_entity_id <> to_entity_id)
);
create index relations_to_idx on relations (to_entity_id);
-- Rule: endpoint kinds must match relationTypes[relation_type].from / .to.

create table entity_links (
  id          uuid primary key default uuidv7(),
  entity_id   uuid not null references entities on delete cascade deferrable,
  url         text not null check (url ~ '^https?://'),
  label       text,
  is_spoiler  boolean not null default false,
  sort_key    numeric not null default 0
);
create index entity_links_entity_idx on entity_links (entity_id);

create table entity_images (
  entity_id   uuid not null references entities on delete cascade deferrable,
  asset_id    uuid not null references assets on delete restrict deferrable,
  role        text not null default 'gallery'
              check (role in ('gallery', 'cover', 'surface_texture', 'cloud_texture', 'region_texture')), -- region_texture: M4-T6
  caption     jsonb,                                    -- RichText
  is_spoiler  boolean not null default false,
  sort_key    numeric not null default 0,
  primary key (entity_id, asset_id, role)
);
create unique index entity_images_single_role_uq on entity_images (entity_id, role) where role <> 'gallery';
create index entity_images_asset_idx on entity_images (asset_id);

create table field_values (                             -- "facts": population, climate, tithe grade…
  entity_id            uuid not null references entities on delete cascade deferrable,
  field_definition_id  uuid not null references field_definitions on delete cascade deferrable,
  value                jsonb not null,                  -- FieldValue, by the definition's value_type
  is_spoiler           boolean not null default false,  -- authoritative for facts (RichText.spoiler unused here)
  sort_key             numeric,                         -- optional per-entity override of the definition's order
  primary key (entity_id, field_definition_id)
);

create table citations (                                -- M7: where filled-in content came from
  id            uuid primary key default uuidv7(),
  entity_id     uuid not null references entities on delete cascade deferrable,
  target        text not null,                          -- 'name' | 'summary' | 'description' | 'field:<key>'
  source_url    text not null,
  source_title  text,
  license       text,                                   -- e.g. 'CC BY-SA 3.0'
  retrieved_at  timestamptz not null,
  unique (entity_id, target, source_url)
);
```

### 3.5 Universe settings tables

```sql
create table group_types (                              -- T5: Segmentum, Sector, Sub-sector…
  id                    uuid primary key default uuidv7(),
  universe_id           uuid not null references universes on delete cascade,
  name                  text not null,
  layer                 text not null,                  -- e.g. 'Administrative', 'Political'
  parent_group_type_id  uuid references group_types on delete set null,
  default_color         text not null,
  sort_key              numeric not null default 0,
  unique (universe_id, name)
);

create table event_categories (
  id           uuid primary key default uuidv7(),
  universe_id  uuid not null references universes on delete cascade,
  name         text not null,
  icon         text not null,                          -- icon key, set:name, from the bundled sets (D-32)
  color        text not null,
  sort_key     numeric not null default 0,
  unique (universe_id, name)
);

create table object_subtypes (                          -- U2: Hive World, Forge World, Webway Gate…
  id                  uuid primary key default uuidv7(),
  universe_id         uuid not null references universes on delete cascade,
  base_type           text not null,                  -- same check list as celestial_objects.base_type
  name                text not null,
  icon                text,
  description         jsonb,                          -- RichText
  default_appearance  jsonb not null default '{}',    -- Appearance (partial)
  sort_key            numeric not null default 0,
  unique (universe_id, base_type, name)
);

create table field_definitions (                        -- custom facts per universe (U2, U4)
  id                     uuid primary key default uuidv7(),
  universe_id            uuid not null references universes on delete cascade,
  key                    text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  label                  text not null,
  value_type             text not null check (value_type in ('text', 'number', 'date_text', 'url')),
  unit                   text,                         -- e.g. 'billion', 'km'
  applies_to_kind        text not null,                -- entity kind
  applies_to_base_type   text,                         -- optional narrowing for celestial objects
  applies_to_subtype_id  uuid references object_subtypes on delete cascade,
  wiki_aliases           text[] not null default '{}', -- infobox parameter names, e.g. {'population','pop'}
  sort_key               numeric not null default 0,
  unique (universe_id, key)
);
```

### 3.6 Assets

```sql
create table assets (
  id                 uuid primary key default uuidv7(),
  universe_id        uuid not null references universes on delete cascade,
  sha256             text not null,                    -- of the original upload; dedupe
  mime_type          text not null,                    -- of the stored variants (image/webp)
  width              integer not null,
  height             integer not null,
  byte_size          integer not null,
  variants           jsonb not null,                   -- AssetVariants: { thumb: {key,w,h}, display: {…}, texture?: {…} }
  original_filename  text,
  alt_text           text,
  credit             text,                             -- A5
  source_url         text,
  license            text,
  created_at         timestamptz not null default now(),
  unique (universe_id, sha256)
);
```

### 3.7 History

```sql
create table change_batches (
  id                uuid primary key default uuidv7(),
  universe_id       uuid references universes on delete set null,
  actor_type        text not null check (actor_type in ('local', 'user', 'api_token', 'system')),
  actor_id          uuid,
  actor_label       text not null,                     -- 'local', 'owner', 'token: claude-code', 'seed'
  description       text not null,                     -- 'Moved 12 objects', 'MCP: objects.create'
  reverts_batch_id  uuid references change_batches on delete set null,
  created_at        timestamptz not null default now()
);
create index change_batches_universe_idx on change_batches (universe_id, created_at desc);

create table change_log (
  id          bigint generated always as identity primary key,
  batch_id    uuid not null references change_batches on delete cascade,
  table_name  text not null,
  op          text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  pk          jsonb not null,                          -- primary-key columns of the row
  before      jsonb,                                   -- to_jsonb(old), null for INSERT
  after       jsonb,                                   -- to_jsonb(new), null for DELETE
  created_at  timestamptz not null default now()
);
create index change_log_batch_idx on change_log (batch_id, id);
```

### 3.8 Accounts and access (M8, D-34)

```sql
create table users (
  id                 uuid primary key default uuidv7(),
  username           text not null unique check (username ~ '^[a-z0-9][a-z0-9_-]{2,31}$'),
  role               text not null default 'member' check (role in ('admin', 'member')),
  password_hash      text not null,                    -- argon2id
  totp_secret_enc    bytea not null,                   -- encrypted with a key derived from GE_SESSION_SECRET
  media_quota_bytes  bigint not null default 2147483648,  -- 2 GiB across the universes it owns; admins change it
  disabled_at        timestamptz,                      -- set: can't sign in, sessions and tokens stop
  created_at         timestamptz not null default now(),
  last_login_at      timestamptz
);

-- Single-use links an admin hands over: an invite makes an account; a reset sets a new password
-- and new two-factor codes for an existing one.
create table account_links (
  id          uuid primary key default uuidv7(),
  token_hash  bytea not null unique,                   -- sha256 of the link's token; the link is shown once
  purpose     text not null check (purpose in ('invite', 'reset')),
  role        text check (role in ('admin', 'member')),-- invite: the new account's role
  user_id     uuid references users on delete cascade, -- reset: whose
  created_by  uuid references users on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,                    -- invites 7 days, resets 24 hours
  used_at     timestamptz,
  check ((purpose = 'invite') = (role is not null)),
  check ((purpose = 'reset') = (user_id is not null))
);

-- Who a universe is shared with. Its owner is universes.owner_id, not a row here.
create table universe_members (
  universe_id  uuid not null references universes on delete cascade,
  user_id      uuid not null references users on delete cascade,
  role         text not null check (role in ('editor', 'viewer')),
  added_by     uuid references users on delete set null,
  created_at   timestamptz not null default now(),
  primary key (universe_id, user_id)
);
create index universe_members_user_idx on universe_members (user_id);

-- Account and access changes, by admins and owners: the admin screens' own history. Content
-- history stays in change_batches.
create table access_events (
  id           uuid primary key default uuidv7(),
  actor_id     uuid references users on delete set null,
  actor_label  text not null,                          -- the username at the time, or 'cli'
  action       text not null,                          -- 'invite.create', 'user.disable', 'user.reset', 'universe.transfer',
                                                       -- 'universe.visibility', 'universe.takedown', 'member.add', 'member.remove', …
  user_id      uuid references users on delete set null,      -- the account it concerns, if any
  universe_id  uuid references universes on delete set null,  -- the universe it concerns, if any
  detail       jsonb not null default '{}',            -- such as { "from": "private", "to": "public" }
  created_at   timestamptz not null default now()
);
create index access_events_created_idx on access_events (created_at desc);

create table sessions (
  id_hash     bytea primary key,                       -- sha256 of the cookie value; the raw value is never stored
  user_id     uuid not null references users on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  user_agent  text
);

create table api_tokens (
  id            uuid primary key default uuidv7(),
  user_id       uuid not null references users on delete cascade,  -- the account it acts for (D-34)
  name          text not null,                         -- 'claude-code on laptop'
  token_hash    bytea not null unique,                 -- sha256 of the token; shown once at creation
  scopes        text[] not null check (scopes <@ array['read', 'write']),
  universe_id   uuid references universes on delete cascade,   -- null = every universe the account can reach
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);
```

- **The migration** gives existing universes `visibility = 'public'` and no owner, so an installation that had no accounts behaves as before; new universes start `private` and belong to the account that made them.
- **A token** can do what its account can at the moment of each request, no more: narrowed by its scopes and, if set, to one universe. There is no admin scope: account and admin actions need a session.
- **Media quota:** the sum of `assets.byte_size` over the universes an account owns. An upload that would pass it is refused with a 413 that says how much is used. Uploads by an editor count against the universe's owner.

## 4. Documents stored as jsonb

These are defined in `packages/domain/src/schemas/`. Optional fields fall back to registry defaults (§6).

```ts
const HexColor = z.string().regex(/^#[0-9a-f]{6}$/);

const RichText = z.object({
  format: z.enum(['plain', 'markdown', 'html']),
  source: z.string().max(100_000),
  spoiler: z.boolean().default(false),               // the whole field is a potential spoiler
});

const PerView = <T extends z.ZodTypeAny>(t: T) =>
  z.object({ galaxy: t, system: t, orbit: t }).partial();

const Appearance = z.object({
  color: HexColor,                                    // body color in galaxy and system views
  scale: PerView(z.number().min(0.05).max(20)),        // multiplies the type's default size per view (U3)
  labelPriority: z.number().int().min(0).max(10),      // higher wins when labels collide
  showOrbit: z.boolean(),                              // draw this object's orbit ring in the system view
  star: z.object({ temperatureK: z.number().min(1_500).max(50_000), glow: z.number().min(0).max(3) }).partial(),
  planet: PlanetAppearance,                            // planets and moons
  region: z.object({                                   // nebulae and anomalies (M4-T6, D-25)
    radius: z.number().positive(),                     // in the parent frame's unit (ly in the galaxy); a rift's half-width
    shape: z.enum(['sphere', 'disc', 'storm', 'rift']),
    density: z.number().min(0).max(1),
    color: HexColor,                                   // a storm's interior color
    // storm: a top-down disc
    innerRadius: z.number().min(0).max(0.9),           // the darker core, as a share of the radius
    rimColor: HexColor,
    filaments: z.number().min(0).max(1),
    gaps: z.array(z.object({ angleDeg: z.number(), widthDeg: z.number().min(1).max(120) })).max(4),
    texture: z.enum(['procedural', 'upload']),         // 'upload' uses entity_images role 'region_texture'
    rotationDeg: z.number().min(-360).max(360),
    // rift: a band along a curve
    path: z.array(z.tuple([z.number(), z.number()])).min(2).max(64), // [x, z] in ly, relative to the object
  }).partial(),
}).partial();

const PlanetAppearance = z.object({
  preset: z.enum(['barren', 'desert', 'ice', 'ocean', 'jungle', 'lava', 'toxic', 'gas_giant', 'city', 'forge']),
  seed: z.number().int(),
  palette: z.array(HexColor).min(2).max(6),            // overrides the preset's color stops
  seaLevel: z.number().min(0).max(1),
  texture: z.enum(['preset', 'upload']),               // 'upload' uses entity_images role 'surface_texture'
  axialTiltDeg: z.number().min(-90).max(90),
  atmosphere: z.object({ enabled: z.boolean(), color: HexColor, thickness: z.number().min(0).max(0.3) }).partial(),
  clouds: z.object({ enabled: z.boolean(), coverage: z.number().min(0).max(1), color: HexColor }).partial(),
  rings: z.object({ enabled: z.boolean(), innerRadius: z.number().min(1), outerRadius: z.number().min(1),
                    color: HexColor, opacity: z.number().min(0).max(1), tiltDeg: z.number() }).partial(),
  nightLights: z.object({ enabled: z.boolean(), color: HexColor, intensity: z.number().min(0).max(2) }).partial(),
}).partial();

const GalaxySettings = z.object({
  seed: z.number().int(),
  radiusLy: z.number().min(1_000).max(500_000),        // default 50_000
  thicknessLy: z.number().min(10).max(20_000),         // default 1_000
  arms: z.number().int().min(0).max(8),                // default 4; 0 = elliptical
  armTwist: z.number().min(0).max(3),                  // turns of the log spiral across the radius
  armSpread: z.number().min(0).max(1),
  bulgeRadiusLy: z.number().min(0),
  barLengthRadii: z.number().min(0).max(0.6),          // default 0 = no bar; half-length of a central bar (D-24)
  starPoints: z.number().int().min(1_000).max(50_000), // capped further by the quality setting
  colors: z.object({ core: HexColor, arm: HexColor, dust: HexColor }),
}).partial();

const Underlay = z.object({                            // reference image under the galaxy (G1), edit mode only
  widthLy: z.number().positive(),                      // world width the image spans
  rotationDeg: z.number(),
  offsetX: z.number(), offsetZ: z.number(),
  opacity: z.number().min(0).max(1),
  visible: z.boolean(),
});

const GroupStyle = z.object({
  fillOpacity: z.number().min(0).max(0.5),             // default 0.06
  lineWidthPx: z.number().min(1).max(6),               // default 2
  dashed: z.boolean(),
  shape: z.enum(['hull']),                             // later: 'voronoi' territories, 'freeform'
}).partial();

const RouteStyle = z.object({ color: HexColor, widthPx: z.number().min(1).max(6), dashed: z.boolean() }).partial();

const UniverseSettings = z.object({
  distanceUnitLabels: z.object({ galaxy: z.string(), system: z.string() }).partial(), // e.g. 'ly', 'AU'
  accentColor: HexColor,
  defaultMapId: z.string().uuid(),
}).partial();

const FieldValue = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: RichText }),
  z.object({ type: z.literal('number'), number: z.number() }),
  z.object({ type: z.literal('date_text'), text: z.string(), sort: z.number().optional() }),
  z.object({ type: z.literal('url'), url: z.string().url(), label: z.string().optional() }),
]);
```

## 5. Coordinates and units

| Frame | Origin | Axes | Unit | Used by |
|---|---|---|---|---|
| Galaxy | galactic center | X/Z = galactic plane, +Y = galactic north | light-years (the label comes from universe settings) | top-level objects, deep-space locations |
| System | system center (the primary star at the origin by default) | X/Z = ecliptic plane, +Y up | "system units" (su): schematic, roughly AU; the author spaces planets for readability | children of a system, locations inside a system |
| Orbit | body center | +Y = north pole before axial tilt | body radii (the globe's radius = 1) | moons and stations of a body |
| Surface | — | `lat_deg` ∈ [−90, 90], `lon_deg` ∈ [−180, 180) | degrees | places and events on a body |

- An object's `x, y, z` are in **its parent's frame**. Top-level objects use the galaxy frame.
- Float precision is fine: positions reach about ±500,000 ly and the camera never needs sub-0.01 ly precision in the galaxy view, because views below that scale have their own frames.
- The lat/lon conversion is defined once in `packages/domain/src/geo/latlon.ts`, and a unit test proves that a pin placed at (lat, lon) lands on the matching pixel of an equirectangular texture (M6-T3). `lon_deg = 0` is the texture's horizontal center.

## 6. Appearance resolution

`resolveAppearance(object, subtype, view)` in `packages/domain` merges, in increasing priority:

1. `objectTypes[baseType]` defaults (size per view, color, icon);
2. `object_subtypes.default_appearance`;
3. `celestial_objects.appearance` overrides.

The displayed size in a view is `objectTypes[baseType].size[view] × appearance.scale[view]`, in that view's unit. The galaxy view then clamps it to a minimum and maximum size on screen ([rendering.md §6](rendering.md#6-galaxy-view)).

The API stores and returns overrides only; view payloads carry the resolved result. The editor shows inherited values greyed out, each with a "reset to default" button.

## 7. Spoiler flags

| What can be a spoiler (P1) | Where the flag lives |
|---|---|
| A whole map | `maps.is_spoiler` |
| A whole object, group, route, place, event or character | `entities.is_spoiler` |
| Any text field: name, summary, description, captions, roles, universe and map texts | `RichText.spoiler` inside the value |
| Part of a text | inline markup: `\|\|…\|\|` in Markdown, `<span data-spoiler>…</span>` in HTML |
| A fact | `field_values.is_spoiler` |
| An image | `entity_images.is_spoiler` |
| A link | `entity_links.is_spoiler` |
| A relation, such as a character's part in an event | `relations.is_spoiler` |
| Membership in a group | `group_members.is_spoiler` |
| Where a place or event is | `entity_locations.is_spoiler` |

How each is shown when hidden is in [ux.md §6](ux.md#6-spoilers). One function, `redactEntity(entity, policy)` in `packages/domain/src/spoilers/`, implements the rules for every surface.

When redaction removes content (`spoilers=exclude`), a hidden text keeps its shape with `▇` in place of the words, and a hidden image, link, fact, relation, membership or location becomes a placeholder `{ redacted: true, isSpoiler, sortKey?, … }` that keeps only what isn't secret, such as which fact it is. Each item has a key from `spoilerKeys` (`<entityId>/description#0`, `<entityId>/fact/<fieldDefinitionId>`, …), which is how a reader reveals one item.

## 8. Drafts and visibility

- `status = 'draft'` exists on maps and entities. For anonymous requests, the service layer:
  - drops draft rows;
  - drops descendants of draft objects (children of a draft system);
  - drops everything in a draft map.
- `GE_AUTH_MODE=none` treats every request as an editor.
- Edits go live immediately in the proof of concept (A3), so new rows default to `published`. The draft workflow (publish buttons, a "drafts only" filter) arrives with the public site.

**From M8, who may reach a universe (D-34).** One function in the API's service layer, `universeAccess(viewer, universe)`, answers for every route:

| Access | Who has it | What it allows |
|---|---|---|
| `none` | everyone else | Nothing: every route answers 404, as if the universe didn't exist. |
| `read` | anyone, for a `public` universe; anyone holding the share key, for a `link` one; its viewers | Published content. Never drafts. |
| `edit` | its editors | All content, drafts included: entities, maps, the settings tables, uploads, History and revert. |
| `own` | its owner; an admin, for an unowned universe; everyone with `GE_AUTH_MODE=none` | Also its address, visibility, share link, members, transfer and deletion. |

- **Drafts and access combine:** the draft rules above apply to anyone with only `read`; `includeDrafts=true` is honored from `edit` up.
- **Admins get no access from being admins,** except to unowned universes. The admin routes (transfer, takedown, delete) work on a universe without reading its content.
- **Lists show only what the requester can read:** `GET /universes` returns public universes, plus the requester's own and those shared with them. A `link` universe is never listed for someone who only has its key.
- **Media follow their universe:** a file under `u/{universeId}/…` is served only to someone with at least `read` there (architecture §8).

## 9. History: batches, audit trigger, revert

**Audit trigger.** One generic function is attached `after insert or update or delete … for each row` to every content table:

- universes, maps;
- entities and all extension tables (celestial_objects, object_groups, group_members, routes, route_waypoints, events, entity_locations);
- the aspect tables (relations, entity_links, entity_images, field_values, citations);
- the settings tables (group_types, event_categories, object_subtypes, field_definitions);
- assets.

```sql
create function ge_audit() returns trigger language plpgsql as $$
declare
  v_batch uuid := nullif(current_setting('ge.batch_id', true), '')::uuid;
  v_row   jsonb := to_jsonb(coalesce(new, old));
  v_pk    jsonb := '{}';
  v_col   text;
begin
  if v_batch is null then
    raise exception 'write to % outside a change batch', tg_table_name using errcode = 'GE400';
  end if;
  foreach v_col in array tg_argv loop                    -- trigger args = primary-key column names
    v_pk := v_pk || jsonb_build_object(v_col, v_row -> v_col);
  end loop;
  insert into change_log (batch_id, table_name, op, pk, before, after)
  values (v_batch, tg_table_name, tg_op, v_pk,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end $$;

create trigger ge_audit after insert or update or delete on celestial_objects
  for each row execute function ge_audit('entity_id');
```

The trigger is not attached to `change_batches`, `change_log`, or the account tables (`users`, `sessions`, `api_tokens`, `account_links`, `universe_members`, `access_events`): who may reach a universe isn't content, and isn't undone with it. A consistency test lists every table and fails if a content table lacks the trigger.

**Batches.** `withBatch(actor, description, fn)` in `packages/db`:

1. Begin a transaction.
2. Insert the `change_batches` row.
3. Run `set_config('ge.batch_id', id, true)`; the setting is local to the transaction.
4. Run `fn(tx)`.
5. Commit, and return `{ result, batchId }`.

Cascaded deletes fire the trigger on child tables inside the same transaction, so they land in the same batch.

**Revert** is a PL/pgSQL function, `ge_revert_batch(p_batch uuid)`, called inside a new batch whose `reverts_batch_id = p_batch`:

1. `set constraints all deferred`.
2. Walk the batch's `change_log` rows in **reverse id order**. For each row:
   - `INSERT` → delete the row by `pk`. If it's already gone (for example, a cascade removed it), skip it.
   - `UPDATE` → restore every column from `before`, with `version = current.version + 1` and `updated_at = now()` where those columns exist.
   - `DELETE` → insert `before` again, bumping `version` where the column exists. If an identical row already exists, skip it.
3. **Conflict check** before each step: the current row must equal the logged `after` (or `before` for re-inserts), ignoring `updated_at` and `version`, because every restore bumps the version. Otherwise someone changed it since, so raise SQLSTATE `GE409` with the conflicting table and pk. The API returns 409, and nothing is reverted, because the whole revert is one transaction.
4. Use dynamic SQL with `jsonb_populate_record(null::<table>, …)` so the function works for every audited table without per-table code.

Redo is the revert of a revert. The web app's undo stack and the history panel's "Revert" button both call `POST /history/{batchId}/revert`. A test reverts and re-applies an insert, update and delete on **every** audited table; the test is generated from the table list.

## 10. Cloning a map

`cloneMap(srcMapId, { slug, name })` in `packages/db/src/clone/` runs as one batch ("Clone map M41 as M42"), so a clone can be reverted:

1. Insert the new `maps` row: copy settings, set `cloned_from_map_id = src`, and use the new slug and name.
2. Create a temporary table `clone_ids(old_id uuid primary key, new_id uuid)` holding every entity id where `map_id = src`, each with a fresh `uuidv7()`.
3. With constraints deferred, copy each map-scoped table listed in `CLONE_SPEC`, in its listed order: `entities`, `celestial_objects`, `object_groups`, `group_members`, `routes`, `route_waypoints`, `events`, `entity_locations`, `entity_images`, `entity_links`, `field_values`, `citations`, `relations`. For each copied row:
   - remap every column listed in the spec through `clone_ids`;
   - set `map_id` to the new map;
   - set `cloned_from_entity_id` to the old id;
   - reset `version` to 1;
   - keep `external_key`, which is unique per map, so it can't collide.
4. Assets aren't copied (both maps reference the same files). Universe-scoped rows aren't copied: characters, settings tables, and relations between two universe-scoped entities. A relation from a character to an event in the map is copied, pointing at the new event.

`CLONE_SPEC` is a single constant that lists each table, its id columns and its columns to remap. A consistency test fails if a table with a `map_id` column or an `entities` foreign key is missing from it. The UI's "same object on other maps" switcher follows `cloned_from_entity_id` in both directions.

## 11. Deleting things

Deletes are hard deletes: the change log keeps everything needed to revert them. The UI confirms each delete and lists what else it affects (count by kind).

| Deleting | Effect |
|---|---|
| Universe | Cascades to everything in it. The UI requires typing the universe's name. From M8, only its owner or an admin may, with a current two-factor code. |
| Account (M8) | Blocked while it owns universes: transfer or delete them first. Removes its sessions, tokens and memberships; history keeps its name (`actor_label`). Disabling an account is the usual way to stop it. |
| Map | Cascades to all map-scoped entities. |
| Object | Cascades to child objects, its group memberships and route waypoints, and **locations** pointing at it. Places and events located there survive but become unplaced; they're listed under "Unplaced" in the outliner. The database cascade removes child `celestial_objects` rows only, so the entity service deletes the whole subtree's `entities` rows in one statement. |
| Group | Removes its memberships; child groups lose their parent. |
| Place | Events located at the place become unplaced. |
| Character | Removes its relations. |
| Asset | Blocked while any entity, map underlay or texture uses it. Deleting removes only the row. A cleanup job deletes the files 30 days after their row is gone, so reverting within that window restores a working asset. |
| Group type | Blocked while groups use it. |
| Event category | Its events lose their category. |
| Object subtype | Objects keep their base type and lose the subtype. |

## 12. Indexes and migrations

- The indexes in §3 cover the hot paths:
  - view payloads: `celestial_objects (map_id, parent_id)`, `entities (map_id, kind)`;
  - pins: `entity_locations (object_id)`;
  - history: `change_log (batch_id, id)`.
- M7 adds `search_public` and `search_all` `tsvector` columns to `entities`, maintained by the service on write because the spoiler-aware text extraction is TypeScript, with GIN indexes.
- **Migrations:**
  - Drizzle generates the table DDL.
  - Triggers, functions, `nulls not distinct` indexes, `on delete set null (col)` and other constructs Drizzle can't express go in custom SQL migrations (`drizzle-kit generate --custom`).
  - Never edit a migration once it has been applied anywhere; add a new one. Each task adds at most one migration: the generated SQL plus, at the end of the same file, the hand-written parts (foreign keys, special indexes, triggers).
  - CI applies all migrations to an empty database and then runs the consistency tests.
