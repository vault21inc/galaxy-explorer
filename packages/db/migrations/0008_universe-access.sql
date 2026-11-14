CREATE TABLE "universe_members" (
	"universe_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "universe_members_pk" PRIMARY KEY("universe_id","user_id"),
	CONSTRAINT "universe_members_role_check" CHECK ("universe_members"."role" in ('editor', 'viewer'))
);
--> statement-breakpoint
ALTER TABLE "universes" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
-- Hand-edited: universes made before accounts become public, as the installation had them
-- (D-34). Adding the column with that default fills existing rows without an UPDATE, which
-- the audit trigger would refuse outside a change batch; new universes then start private.
ALTER TABLE "universes" ADD COLUMN "visibility" text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "universes" ALTER COLUMN "visibility" SET DEFAULT 'private';--> statement-breakpoint
ALTER TABLE "universes" ADD COLUMN "share_key" text;--> statement-breakpoint
CREATE INDEX "universe_members_user_idx" ON "universe_members" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "universes" ADD CONSTRAINT "universes_share_key_uq" UNIQUE("share_key");--> statement-breakpoint
ALTER TABLE "universes" ADD CONSTRAINT "universes_visibility_check" CHECK ("universes"."visibility" in ('private', 'link', 'public'));--> statement-breakpoint
-- Hand-written below (migrations/README.md): foreign keys, deferrable like every other one. An
-- account that owns universes can't be deleted until they're transferred or deleted (M8-T13).
ALTER TABLE "universes" ADD CONSTRAINT "universes_owner_fk" FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE "universe_members" ADD CONSTRAINT "universe_members_universe_fk" FOREIGN KEY ("universe_id") REFERENCES "universes" ("id") ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE "universe_members" ADD CONSTRAINT "universe_members_user_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE "universe_members" ADD CONSTRAINT "universe_members_added_by_fk" FOREIGN KEY ("added_by") REFERENCES "users" ("id") ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE;
