ALTER TABLE "entities" ADD COLUMN "search_public" "tsvector";--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "search_all" "tsvector";--> statement-breakpoint
CREATE INDEX "entities_search_public_idx" ON "entities" USING gin ("search_public");--> statement-breakpoint
CREATE INDEX "entities_search_all_idx" ON "entities" USING gin ("search_all");--> statement-breakpoint
-- M7-T6, hand-written: search's helpers, and the audit treating the search columns as derived.
--
-- `unaccent` folds accents, so "Gudrún" and "gudrun" index alike (to_tsvector's 'simple'
-- configuration only lower-cases). A trusted extension: the database's owner may create it.
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
-- The search columns are computed from the row and its facts and relations, and refreshed when
-- a change batch ends (packages/db/src/search/refresh.ts). An update that changes nothing else
-- isn't an edit: it isn't logged, and needs no batch, so a backfill can run on its own.
CREATE OR REPLACE FUNCTION ge_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_batch uuid := nullif(current_setting('ge.batch_id', true), '')::uuid;
  v_row   jsonb := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
  v_pk    jsonb := '{}';
  v_col   text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(OLD) - 'search_public' - 'search_all') = (to_jsonb(NEW) - 'search_public' - 'search_all') THEN
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
END $$;--> statement-breakpoint
-- A row whose search columns were refreshed since a batch is still as the batch left it.
CREATE OR REPLACE FUNCTION ge_revert_same(a jsonb, b jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT (a - 'updated_at' - 'version' - 'search_public' - 'search_all')
       = (b - 'updated_at' - 'version' - 'search_public' - 'search_all')
$$;
