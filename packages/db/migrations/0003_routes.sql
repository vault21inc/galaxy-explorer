CREATE TABLE "route_waypoints" (
	"route_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"map_id" uuid NOT NULL,
	"object_id" uuid NOT NULL,
	CONSTRAINT "route_waypoints_pk" PRIMARY KEY("route_id","seq"),
	CONSTRAINT "route_waypoints_seq_check" CHECK ("route_waypoints"."seq" >= 0)
);
--> statement-breakpoint
CREATE TABLE "routes" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"map_id" uuid NOT NULL,
	"style" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "routes_entity_map_uq" UNIQUE("entity_id","map_id")
);
--> statement-breakpoint
ALTER TABLE "entities" DROP CONSTRAINT "entities_kind_check";--> statement-breakpoint
ALTER TABLE "field_definitions" DROP CONSTRAINT "field_definitions_applies_to_kind_check";--> statement-breakpoint
CREATE INDEX "route_waypoints_object_idx" ON "route_waypoints" USING btree ("object_id");--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_kind_check" CHECK ("entities"."kind" in ('celestial_object', 'group', 'route', 'place', 'event', 'character'));--> statement-breakpoint
ALTER TABLE "field_definitions" ADD CONSTRAINT "field_definitions_applies_to_kind_check" CHECK ("field_definitions"."applies_to_kind" in ('celestial_object', 'group', 'route', 'place', 'event', 'character'));--> statement-breakpoint
-- Hand-written (migrations/README.md): deferrable foreign keys, then the audit triggers.
ALTER TABLE "routes" ADD CONSTRAINT "routes_entity_fk" FOREIGN KEY (entity_id, map_id) REFERENCES "entities" (id, map_id) on delete cascade DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "route_waypoints" ADD CONSTRAINT "route_waypoints_route_fk" FOREIGN KEY (route_id, map_id) REFERENCES "routes" (entity_id, map_id) on delete cascade DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
ALTER TABLE "route_waypoints" ADD CONSTRAINT "route_waypoints_object_fk" FOREIGN KEY (object_id, map_id) REFERENCES "celestial_objects" (entity_id, map_id) on delete cascade DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
CREATE TRIGGER ge_audit AFTER INSERT OR UPDATE OR DELETE ON "routes" FOR EACH ROW EXECUTE FUNCTION ge_audit('entity_id');--> statement-breakpoint
CREATE TRIGGER ge_audit AFTER INSERT OR UPDATE OR DELETE ON "route_waypoints" FOR EACH ROW EXECUTE FUNCTION ge_audit('route_id', 'seq');
