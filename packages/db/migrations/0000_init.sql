CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"universe_id" uuid NOT NULL,
	"sha256" text NOT NULL,
	"mime_type" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"byte_size" integer NOT NULL,
	"variants" jsonb NOT NULL,
	"original_filename" text,
	"alt_text" text,
	"credit" text,
	"source_url" text,
	"license" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_universe_sha256_uq" UNIQUE("universe_id","sha256"),
	CONSTRAINT "assets_source_url_format" CHECK ("assets"."source_url" ~ '^https?://')
);
--> statement-breakpoint
CREATE TABLE "celestial_objects" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"map_id" uuid NOT NULL,
	"parent_id" uuid,
	"base_type" text NOT NULL,
	"subtype_id" uuid,
	"explorable" boolean DEFAULT false NOT NULL,
	"x" double precision DEFAULT 0 NOT NULL,
	"y" double precision DEFAULT 0 NOT NULL,
	"z" double precision DEFAULT 0 NOT NULL,
	"appearance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "celestial_objects_entity_map_uq" UNIQUE("entity_id","map_id"),
	CONSTRAINT "celestial_objects_base_type_check" CHECK ("celestial_objects"."base_type" in ('system', 'star', 'planet', 'moon', 'asteroid_belt', 'station', 'nebula', 'anomaly', 'black_hole', 'marker')),
	CONSTRAINT "celestial_objects_not_own_parent" CHECK ("celestial_objects"."parent_id" is distinct from "celestial_objects"."entity_id")
);
--> statement-breakpoint
CREATE TABLE "change_batches" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"universe_id" uuid,
	"actor_type" text NOT NULL,
	"actor_id" uuid,
	"actor_label" text NOT NULL,
	"description" text NOT NULL,
	"reverts_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "change_batches_actor_type_check" CHECK ("change_batches"."actor_type" in ('local', 'user', 'api_token', 'system'))
);
--> statement-breakpoint
CREATE TABLE "change_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "change_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"batch_id" uuid NOT NULL,
	"table_name" text NOT NULL,
	"op" text NOT NULL,
	"pk" jsonb NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "change_log_op_check" CHECK ("change_log"."op" in ('INSERT', 'UPDATE', 'DELETE'))
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"universe_id" uuid NOT NULL,
	"map_id" uuid,
	"kind" text NOT NULL,
	"name" jsonb NOT NULL,
	"name_plain" text NOT NULL,
	"summary" jsonb,
	"description" jsonb,
	"is_spoiler" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"external_key" text,
	"cloned_from_entity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "entities_id_map_uq" UNIQUE("id","map_id"),
	CONSTRAINT "entities_kind_check" CHECK ("entities"."kind" in ('celestial_object', 'group', 'place', 'event', 'character')),
	CONSTRAINT "entities_status_check" CHECK ("entities"."status" in ('draft', 'published')),
	CONSTRAINT "entities_scope_check" CHECK (("entities"."kind" in ('character')) = ("entities"."map_id" is null))
);
--> statement-breakpoint
CREATE TABLE "entity_images" (
	"entity_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"role" text DEFAULT 'gallery' NOT NULL,
	"caption" jsonb,
	"is_spoiler" boolean DEFAULT false NOT NULL,
	"sort_key" numeric DEFAULT 0 NOT NULL,
	CONSTRAINT "entity_images_pk" PRIMARY KEY("entity_id","asset_id","role"),
	CONSTRAINT "entity_images_role_check" CHECK ("entity_images"."role" in ('gallery', 'cover', 'surface_texture', 'cloud_texture'))
);
--> statement-breakpoint
CREATE TABLE "entity_links" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"entity_id" uuid NOT NULL,
	"url" text NOT NULL,
	"label" text,
	"is_spoiler" boolean DEFAULT false NOT NULL,
	"sort_key" numeric DEFAULT 0 NOT NULL,
	CONSTRAINT "entity_links_url_format" CHECK ("entity_links"."url" ~ '^https?://')
);
--> statement-breakpoint
CREATE TABLE "entity_locations" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"map_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"object_id" uuid,
	"place_id" uuid,
	"lat_deg" double precision,
	"lon_deg" double precision,
	"x" double precision,
	"y" double precision,
	"z" double precision,
	"is_spoiler" boolean DEFAULT false NOT NULL,
	CONSTRAINT "entity_locations_entity_map_uq" UNIQUE("entity_id","map_id"),
	CONSTRAINT "entity_locations_mode_check" CHECK ("entity_locations"."mode" in ('surface', 'object', 'space', 'place')),
	CONSTRAINT "entity_locations_lat_range" CHECK ("entity_locations"."lat_deg" between -90 and 90),
	CONSTRAINT "entity_locations_lon_range" CHECK ("entity_locations"."lon_deg" >= -180 and "entity_locations"."lon_deg" < 180),
	CONSTRAINT "entity_locations_mode_columns" CHECK (case mode
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
--> statement-breakpoint
CREATE TABLE "relations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"universe_id" uuid NOT NULL,
	"from_entity_id" uuid NOT NULL,
	"to_entity_id" uuid NOT NULL,
	"relation_type" text NOT NULL,
	"role" jsonb,
	"is_spoiler" boolean DEFAULT false NOT NULL,
	"sort_key" numeric DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relations_pair_type_uq" UNIQUE("from_entity_id","to_entity_id","relation_type"),
	CONSTRAINT "relations_type_check" CHECK ("relations"."relation_type" in ('participant', 'related')),
	CONSTRAINT "relations_not_self" CHECK ("relations"."from_entity_id" <> "relations"."to_entity_id")
);
--> statement-breakpoint
CREATE TABLE "event_categories" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"universe_id" uuid NOT NULL,
	"name" text NOT NULL,
	"icon" text NOT NULL,
	"color" text NOT NULL,
	"sort_key" numeric DEFAULT 0 NOT NULL,
	CONSTRAINT "event_categories_universe_name_uq" UNIQUE("universe_id","name"),
	CONSTRAINT "event_categories_color_format" CHECK ("event_categories"."color" ~ '^#[0-9a-f]{6}$')
);
--> statement-breakpoint
CREATE TABLE "events" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"map_id" uuid NOT NULL,
	"category_id" uuid,
	"date_text" text,
	"date_sort" numeric,
	CONSTRAINT "events_entity_map_uq" UNIQUE("entity_id","map_id")
);
--> statement-breakpoint
CREATE TABLE "field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"universe_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"value_type" text NOT NULL,
	"unit" text,
	"applies_to_kind" text NOT NULL,
	"applies_to_base_type" text,
	"applies_to_subtype_id" uuid,
	"wiki_aliases" text[] DEFAULT '{}' NOT NULL,
	"sort_key" numeric DEFAULT 0 NOT NULL,
	CONSTRAINT "field_definitions_universe_key_uq" UNIQUE("universe_id","key"),
	CONSTRAINT "field_definitions_key_format" CHECK ("field_definitions"."key" ~ '^[a-z][a-z0-9_]*$'),
	CONSTRAINT "field_definitions_value_type_check" CHECK ("field_definitions"."value_type" in ('text', 'number', 'date_text', 'url')),
	CONSTRAINT "field_definitions_applies_to_kind_check" CHECK ("field_definitions"."applies_to_kind" in ('celestial_object', 'group', 'place', 'event', 'character')),
	CONSTRAINT "field_definitions_applies_to_base_type_check" CHECK ("field_definitions"."applies_to_base_type" in ('system', 'star', 'planet', 'moon', 'asteroid_belt', 'station', 'nebula', 'anomaly', 'black_hole', 'marker'))
);
--> statement-breakpoint
CREATE TABLE "field_values" (
	"entity_id" uuid NOT NULL,
	"field_definition_id" uuid NOT NULL,
	"value" jsonb NOT NULL,
	"is_spoiler" boolean DEFAULT false NOT NULL,
	"sort_key" numeric,
	CONSTRAINT "field_values_pk" PRIMARY KEY("entity_id","field_definition_id")
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"group_id" uuid NOT NULL,
	"group_type_id" uuid NOT NULL,
	"map_id" uuid NOT NULL,
	"object_id" uuid NOT NULL,
	"is_spoiler" boolean DEFAULT false NOT NULL,
	CONSTRAINT "group_members_pk" PRIMARY KEY("group_id","object_id"),
	CONSTRAINT "group_members_one_group_per_type_uq" UNIQUE("object_id","group_type_id")
);
--> statement-breakpoint
CREATE TABLE "group_types" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"universe_id" uuid NOT NULL,
	"name" text NOT NULL,
	"layer" text NOT NULL,
	"parent_group_type_id" uuid,
	"default_color" text NOT NULL,
	"sort_key" numeric DEFAULT 0 NOT NULL,
	CONSTRAINT "group_types_universe_name_uq" UNIQUE("universe_id","name"),
	CONSTRAINT "group_types_default_color_format" CHECK ("group_types"."default_color" ~ '^#[0-9a-f]{6}$')
);
--> statement-breakpoint
CREATE TABLE "maps" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"universe_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" jsonb NOT NULL,
	"name_plain" text NOT NULL,
	"description" jsonb,
	"sort_key" numeric DEFAULT 0 NOT NULL,
	"galaxy_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"underlay_asset_id" uuid,
	"underlay" jsonb,
	"cloned_from_map_id" uuid,
	"is_spoiler" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "maps_universe_slug_uq" UNIQUE("universe_id","slug"),
	CONSTRAINT "maps_slug_format" CHECK ("maps"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "maps_status_check" CHECK ("maps"."status" in ('draft', 'published'))
);
--> statement-breakpoint
CREATE TABLE "object_groups" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"map_id" uuid NOT NULL,
	"group_type_id" uuid NOT NULL,
	"parent_group_id" uuid,
	"outline_color" text NOT NULL,
	"style" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "object_groups_entity_map_uq" UNIQUE("entity_id","map_id"),
	CONSTRAINT "object_groups_entity_type_uq" UNIQUE("entity_id","group_type_id"),
	CONSTRAINT "object_groups_outline_color_format" CHECK ("object_groups"."outline_color" ~ '^#[0-9a-f]{6}$')
);
--> statement-breakpoint
CREATE TABLE "object_subtypes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"universe_id" uuid NOT NULL,
	"base_type" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"description" jsonb,
	"default_appearance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_key" numeric DEFAULT 0 NOT NULL,
	CONSTRAINT "object_subtypes_universe_type_name_uq" UNIQUE("universe_id","base_type","name"),
	CONSTRAINT "object_subtypes_base_type_check" CHECK ("object_subtypes"."base_type" in ('system', 'star', 'planet', 'moon', 'asteroid_belt', 'station', 'nebula', 'anomaly', 'black_hole', 'marker'))
);
--> statement-breakpoint
CREATE TABLE "universes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"name" jsonb NOT NULL,
	"name_plain" text NOT NULL,
	"description" jsonb,
	"date_format_notes" jsonb,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "universes_slug_unique" UNIQUE("slug"),
	CONSTRAINT "universes_slug_format" CHECK ("universes"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE INDEX "celestial_objects_parent_idx" ON "celestial_objects" USING btree ("map_id","parent_id");--> statement-breakpoint
CREATE INDEX "change_batches_universe_idx" ON "change_batches" USING btree ("universe_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "change_log_batch_idx" ON "change_log" USING btree ("batch_id","id");--> statement-breakpoint
CREATE INDEX "entities_map_kind_idx" ON "entities" USING btree ("map_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_images_single_role_uq" ON "entity_images" USING btree ("entity_id","role") WHERE role <> 'gallery';--> statement-breakpoint
CREATE INDEX "entity_images_asset_idx" ON "entity_images" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "entity_links_entity_idx" ON "entity_links" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "entity_locations_object_idx" ON "entity_locations" USING btree ("object_id");--> statement-breakpoint
CREATE INDEX "entity_locations_place_idx" ON "entity_locations" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "relations_to_idx" ON "relations" USING btree ("to_entity_id");--> statement-breakpoint
CREATE INDEX "events_date_idx" ON "events" USING btree ("map_id","date_sort");
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written below this line (see migrations/README.md).
--
-- Foreign keys: Drizzle can't make them deferrable, and every one must be (data-model §2), so
-- revert and clone can write rows in any order inside one transaction. `initially immediate`
-- keeps normal writes checked at once. Composite keys (x_id, map_id) keep references inside
-- one map. Deleting rules follow data-model §11.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "maps" ADD CONSTRAINT "maps_universe_fk" FOREIGN KEY (universe_id) REFERENCES "universes" (id) on delete cascade DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "maps" ADD CONSTRAINT "maps_underlay_asset_fk" FOREIGN KEY (underlay_asset_id) REFERENCES "assets" (id) on delete restrict DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "maps" ADD CONSTRAINT "maps_cloned_from_fk" FOREIGN KEY (cloned_from_map_id) REFERENCES "maps" (id) on delete set null DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_universe_fk" FOREIGN KEY (universe_id) REFERENCES "universes" (id) on delete cascade DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_map_fk" FOREIGN KEY (map_id) REFERENCES "maps" (id) on delete cascade DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_cloned_from_fk" FOREIGN KEY (cloned_from_entity_id) REFERENCES "entities" (id) on delete set null DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "celestial_objects" ADD CONSTRAINT "celestial_objects_entity_fk" FOREIGN KEY (entity_id, map_id) REFERENCES "entities" (id, map_id) on delete cascade DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "celestial_objects" ADD CONSTRAINT "celestial_objects_parent_fk" FOREIGN KEY (parent_id, map_id) REFERENCES "celestial_objects" (entity_id, map_id) on delete cascade DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "celestial_objects" ADD CONSTRAINT "celestial_objects_subtype_fk" FOREIGN KEY (subtype_id) REFERENCES "object_subtypes" (id) on delete set null DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "object_groups" ADD CONSTRAINT "object_groups_entity_fk" FOREIGN KEY (entity_id, map_id) REFERENCES "entities" (id, map_id) on delete cascade DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "object_groups" ADD CONSTRAINT "object_groups_group_type_fk" FOREIGN KEY (group_type_id) REFERENCES "group_types" (id) on delete restrict DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "object_groups" ADD CONSTRAINT "object_groups_parent_fk" FOREIGN KEY (parent_group_id, map_id) REFERENCES "object_groups" (entity_id, map_id) on delete set null (parent_group_id) DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_type_fk" FOREIGN KEY (group_id, group_type_id) REFERENCES "object_groups" (entity_id, group_type_id) on delete cascade on update cascade DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_fk" FOREIGN KEY (group_id, map_id) REFERENCES "object_groups" (entity_id, map_id) on delete cascade DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_object_fk" FOREIGN KEY (object_id, map_id) REFERENCES "celestial_objects" (entity_id, map_id) on delete cascade DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_entity_fk" FOREIGN KEY (entity_id, map_id) REFERENCES "entities" (id, map_id) on delete cascade DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_category_fk" FOREIGN KEY (category_id) REFERENCES "event_categories" (id) on delete set null DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "entity_locations" ADD CONSTRAINT "entity_locations_entity_fk" FOREIGN KEY (entity_id, map_id) REFERENCES "entities" (id, map_id) on delete cascade DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "entity_locations" ADD CONSTRAINT "entity_locations_object_fk" FOREIGN KEY (object_id, map_id) REFERENCES "celestial_objects" (entity_id, map_id) on delete cascade DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "entity_locations" ADD CONSTRAINT "entity_locations_place_fk" FOREIGN KEY (place_id, map_id) REFERENCES "entities" (id, map_id) on delete cascade DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_universe_fk" FOREIGN KEY (universe_id) REFERENCES "universes" (id) on delete cascade DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_from_fk" FOREIGN KEY (from_entity_id) REFERENCES "entities" (id) on delete cascade DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_to_fk" FOREIGN KEY (to_entity_id) REFERENCES "entities" (id) on delete cascade DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_entity_fk" FOREIGN KEY (entity_id) REFERENCES "entities" (id) on delete cascade DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "entity_images" ADD CONSTRAINT "entity_images_entity_fk" FOREIGN KEY (entity_id) REFERENCES "entities" (id) on delete cascade DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "entity_images" ADD CONSTRAINT "entity_images_asset_fk" FOREIGN KEY (asset_id) REFERENCES "assets" (id) on delete restrict DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "field_values" ADD CONSTRAINT "field_values_entity_fk" FOREIGN KEY (entity_id) REFERENCES "entities" (id) on delete cascade DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "field_values" ADD CONSTRAINT "field_values_definition_fk" FOREIGN KEY (field_definition_id) REFERENCES "field_definitions" (id) on delete cascade DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "group_types" ADD CONSTRAINT "group_types_universe_fk" FOREIGN KEY (universe_id) REFERENCES "universes" (id) on delete cascade DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "group_types" ADD CONSTRAINT "group_types_parent_fk" FOREIGN KEY (parent_group_type_id) REFERENCES "group_types" (id) on delete set null DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "event_categories" ADD CONSTRAINT "event_categories_universe_fk" FOREIGN KEY (universe_id) REFERENCES "universes" (id) on delete cascade DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "object_subtypes" ADD CONSTRAINT "object_subtypes_universe_fk" FOREIGN KEY (universe_id) REFERENCES "universes" (id) on delete cascade DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "field_definitions" ADD CONSTRAINT "field_definitions_universe_fk" FOREIGN KEY (universe_id) REFERENCES "universes" (id) on delete cascade DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "field_definitions" ADD CONSTRAINT "field_definitions_subtype_fk" FOREIGN KEY (applies_to_subtype_id) REFERENCES "object_subtypes" (id) on delete cascade DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_universe_fk" FOREIGN KEY (universe_id) REFERENCES "universes" (id) on delete cascade DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "change_batches" ADD CONSTRAINT "change_batches_universe_fk" FOREIGN KEY (universe_id) REFERENCES "universes" (id) on delete set null DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "change_batches" ADD CONSTRAINT "change_batches_reverts_fk" FOREIGN KEY (reverts_batch_id) REFERENCES "change_batches" (id) on delete set null DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "change_log" ADD CONSTRAINT "change_log_batch_fk" FOREIGN KEY (batch_id) REFERENCES "change_batches" (id) on delete cascade DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
-- External keys are unique per map, and per universe for universe-scoped kinds, whose map_id
-- is null: `nulls not distinct` makes two nulls count as equal here. Drizzle can't express it.
CREATE UNIQUE INDEX "entities_external_key_uq" ON "entities" ("universe_id", "map_id", "external_key") NULLS NOT DISTINCT WHERE "external_key" IS NOT NULL;
