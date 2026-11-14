CREATE TABLE "access_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"actor_id" uuid,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"user_id" uuid,
	"universe_id" uuid,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "access_events_created_idx" ON "access_events" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "access_events_universe_idx" ON "access_events" USING btree ("universe_id");--> statement-breakpoint
-- Hand-written below (migrations/README.md): foreign keys, deferrable like every other one. An
-- event outlives the account and the universe it's about: their ids become null, and the names
-- stay in actor_label and detail.
ALTER TABLE "access_events" ADD CONSTRAINT "access_events_actor_fk" FOREIGN KEY ("actor_id") REFERENCES "users" ("id") ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE "access_events" ADD CONSTRAINT "access_events_user_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE "access_events" ADD CONSTRAINT "access_events_universe_fk" FOREIGN KEY ("universe_id") REFERENCES "universes" ("id") ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
-- M8-T12, hand-written: who may reach a universe isn't content (D-41). Its owner, visibility and
-- share key are changed only by its owner (and admins, M8-T13), recorded in access_events, and
-- never undone through History: otherwise an editor could revert the batch that made a universe
-- private, or the one that handed it to someone else.
--
-- ge_unaudited: a row as jsonb without the columns History ignores: the search columns, derived
-- from the row (M7-T6, D-37), and the universe's access columns.
CREATE FUNCTION ge_unaudited(p_row jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT p_row - 'search_public' - 'search_all' - 'owner_id' - 'visibility' - 'share_key'
$$;
--> statement-breakpoint
-- The audit trigger: an update that changes only those columns isn't logged, and needs no
-- change batch, so sharing a universe or changing its visibility leaves History alone.
CREATE OR REPLACE FUNCTION ge_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_batch uuid := nullif(current_setting('ge.batch_id', true), '')::uuid;
  v_row   jsonb := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
  v_pk    jsonb := '{}';
  v_col   text;
BEGIN
  IF TG_OP = 'UPDATE' AND ge_unaudited(to_jsonb(OLD)) = ge_unaudited(to_jsonb(NEW)) THEN
    RETURN NULL;
  END IF;
  IF v_batch IS NULL THEN
    RAISE EXCEPTION 'write to % outside a change batch', TG_TABLE_NAME
      USING ERRCODE = 'GE400', HINT = 'Wrap the write in withBatch().';
  END IF;
  FOREACH v_col IN ARRAY TG_ARGV LOOP
    v_pk := v_pk || jsonb_build_object(v_col, v_row -> v_col);
  END LOOP;
  INSERT INTO change_log (batch_id, table_name, op, pk, before, after)
  VALUES (v_batch, TG_TABLE_NAME, TG_OP, v_pk,
          CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END);
  RETURN NULL;
END $$;
--> statement-breakpoint
-- A row whose search or access columns changed since a batch is still as the batch left it, so
-- making a universe public doesn't stop an earlier edit to its name from being undone.
CREATE OR REPLACE FUNCTION ge_revert_same(a jsonb, b jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT (ge_unaudited(a) - 'updated_at' - 'version') = (ge_unaudited(b) - 'updated_at' - 'version')
$$;
--> statement-breakpoint
-- A row written back by a revert keeps its current access columns: undoing an edit to a
-- universe's name doesn't also undo who may read it. (A deleted row coming back, p_current
-- null, returns as it was.)
CREATE OR REPLACE FUNCTION ge_revert_bump(p_row jsonb, p_current jsonb) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN p_row ? 'version'
              THEN jsonb_set(p_row, '{version}',
                             to_jsonb(coalesce((p_current ->> 'version')::int, (p_row ->> 'version')::int) + 1))
              ELSE p_row END
         || CASE WHEN p_row ? 'updated_at' THEN jsonb_build_object('updated_at', now()) ELSE '{}' END
         || coalesce((SELECT jsonb_object_agg(key, value) FROM jsonb_each(p_current)
                      WHERE key IN ('owner_id', 'visibility', 'share_key')), '{}')
$$;
