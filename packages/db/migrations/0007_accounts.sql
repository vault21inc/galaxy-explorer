CREATE TABLE "account_links" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"purpose" text NOT NULL,
	"role" text,
	"user_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "account_links_token_hash_uq" UNIQUE("token_hash"),
	CONSTRAINT "account_links_purpose_check" CHECK ("account_links"."purpose" in ('invite', 'reset')),
	CONSTRAINT "account_links_role_check" CHECK ("account_links"."role" in ('admin', 'member')),
	CONSTRAINT "account_links_invite_role_check" CHECK (("account_links"."purpose" = 'invite') = ("account_links"."role" is not null)),
	CONSTRAINT "account_links_reset_user_check" CHECK (("account_links"."purpose" = 'reset') = ("account_links"."user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text,
	CONSTRAINT "sessions_token_hash_uq" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"username" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"password_hash" text NOT NULL,
	"totp_secret_enc" "bytea" NOT NULL,
	"totp_last_step" bigint,
	"media_quota_bytes" bigint DEFAULT 2147483648 NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_username_uq" UNIQUE("username"),
	CONSTRAINT "users_username_check" CHECK ("users"."username" ~ '^[a-z0-9][a-z0-9_-]{2,31}$'),
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('admin', 'member'))
);
--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
-- Hand-written below (migrations/README.md): foreign keys, deferrable like every other one.
-- An account's sessions and reset links go with it; a link keeps existing if its creator goes.
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE "account_links" ADD CONSTRAINT "account_links_user_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE "account_links" ADD CONSTRAINT "account_links_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE;
