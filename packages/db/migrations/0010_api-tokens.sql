CREATE TABLE "api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"scopes" text[] NOT NULL,
	"universe_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_tokens_token_hash_uq" UNIQUE("token_hash"),
	CONSTRAINT "api_tokens_scopes_check" CHECK ("api_tokens"."scopes" <@ array['read', 'write']::text[] and cardinality("api_tokens"."scopes") > 0),
	CONSTRAINT "api_tokens_name_check" CHECK (length("api_tokens"."name") between 1 and 60)
);
--> statement-breakpoint
CREATE INDEX "api_tokens_user_idx" ON "api_tokens" USING btree ("user_id");--> statement-breakpoint
-- Hand-written below (migrations/README.md): foreign keys, deferrable like every other one.
-- An account's tokens go with it (data-model §12), and so does a token for a deleted universe:
-- it could reach nothing else.
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_universe_fk" FOREIGN KEY ("universe_id") REFERENCES "universes" ("id") ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
