ALTER TABLE "celestial_objects" ADD COLUMN "orbit_center_id" uuid;--> statement-breakpoint
CREATE INDEX "celestial_objects_orbit_center_idx" ON "celestial_objects" USING btree ("map_id","orbit_center_id");--> statement-breakpoint
ALTER TABLE "celestial_objects" ADD CONSTRAINT "celestial_objects_not_own_orbit_center" CHECK ("celestial_objects"."orbit_center_id" is distinct from "celestial_objects"."entity_id");--> statement-breakpoint
-- Hand-written (migrations/README.md): the star an object orbits (D-29), on the same map.
-- Deleting the star clears only this column, so the object orbits the system's center again.
ALTER TABLE "celestial_objects" ADD CONSTRAINT "celestial_objects_orbit_center_fk" FOREIGN KEY (orbit_center_id, map_id) REFERENCES "celestial_objects" (entity_id, map_id) on delete set null (orbit_center_id) DEFERRABLE INITIALLY IMMEDIATE;
