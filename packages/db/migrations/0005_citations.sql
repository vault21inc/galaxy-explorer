CREATE TABLE "citations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"entity_id" uuid NOT NULL,
	"target" text NOT NULL,
	"source_url" text NOT NULL,
	"source_title" text,
	"license" text,
	"retrieved_at" timestamp with time zone NOT NULL,
	CONSTRAINT "citations_target_source_uq" UNIQUE("entity_id","target","source_url"),
	CONSTRAINT "citations_target_format" CHECK ("citations"."target" ~ '^(name|summary|description|field:[a-z][a-z0-9_]*)$'),
	CONSTRAINT "citations_source_url_format" CHECK ("citations"."source_url" ~ '^https?://')
);
--> statement-breakpoint
CREATE INDEX "citations_entity_idx" ON "citations" USING btree ("entity_id");--> statement-breakpoint
-- Hand-written (migrations/README.md): the deferrable foreign key, then the audit trigger.
ALTER TABLE "citations" ADD CONSTRAINT "citations_entity_fk" FOREIGN KEY (entity_id) REFERENCES "entities" (id) on delete cascade DEFERRABLE INITIALLY IMMEDIATE;--> statement-breakpoint
CREATE TRIGGER ge_audit AFTER INSERT OR UPDATE OR DELETE ON "citations" FOR EACH ROW EXECUTE FUNCTION ge_audit('id');
