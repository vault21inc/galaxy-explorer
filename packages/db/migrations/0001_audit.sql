-- M1-T4: history (data-model §9). Hand-written: Drizzle can't express functions or triggers.
--
-- Every write to a content table runs inside a change batch: `withBatch()` in
-- packages/db/src/audit/ sets `ge.batch_id` for its transaction. The trigger below logs each
-- changed row to `change_log`, and `ge_revert_batch()` replays a batch's log backwards, which
-- is how undo, redo (a revert of a revert) and history rollback all work.

-- ---------------------------------------------------------------------------------------------
-- The audit trigger. Its arguments are the table's primary-key columns.
-- ---------------------------------------------------------------------------------------------
CREATE FUNCTION ge_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_batch uuid := nullif(current_setting('ge.batch_id', true), '')::uuid;
  v_row   jsonb := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
  v_pk    jsonb := '{}';
  v_col   text;
BEGIN
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
-- One trigger per table in AUDITED_TABLES (src/audit/tables.ts). An introspection test checks
-- that the two lists match and that each trigger names the table's primary key.
CREATE TRIGGER ge_audit AFTER INSERT OR UPDATE OR DELETE ON "universes" FOR EACH ROW EXECUTE FUNCTION ge_audit('id');--> statement-breakpoint
CREATE TRIGGER ge_audit AFTER INSERT OR UPDATE OR DELETE ON "maps" FOR EACH ROW EXECUTE FUNCTION ge_audit('id');--> statement-breakpoint
CREATE TRIGGER ge_audit AFTER INSERT OR UPDATE OR DELETE ON "entities" FOR EACH ROW EXECUTE FUNCTION ge_audit('id');--> statement-breakpoint
CREATE TRIGGER ge_audit AFTER INSERT OR UPDATE OR DELETE ON "celestial_objects" FOR EACH ROW EXECUTE FUNCTION ge_audit('entity_id');--> statement-breakpoint
CREATE TRIGGER ge_audit AFTER INSERT OR UPDATE OR DELETE ON "object_groups" FOR EACH ROW EXECUTE FUNCTION ge_audit('entity_id');--> statement-breakpoint
CREATE TRIGGER ge_audit AFTER INSERT OR UPDATE OR DELETE ON "group_members" FOR EACH ROW EXECUTE FUNCTION ge_audit('group_id', 'object_id');--> statement-breakpoint
CREATE TRIGGER ge_audit AFTER INSERT OR UPDATE OR DELETE ON "events" FOR EACH ROW EXECUTE FUNCTION ge_audit('entity_id');--> statement-breakpoint
CREATE TRIGGER ge_audit AFTER INSERT OR UPDATE OR DELETE ON "entity_locations" FOR EACH ROW EXECUTE FUNCTION ge_audit('entity_id');--> statement-breakpoint
CREATE TRIGGER ge_audit AFTER INSERT OR UPDATE OR DELETE ON "relations" FOR EACH ROW EXECUTE FUNCTION ge_audit('id');--> statement-breakpoint
CREATE TRIGGER ge_audit AFTER INSERT OR UPDATE OR DELETE ON "entity_links" FOR EACH ROW EXECUTE FUNCTION ge_audit('id');--> statement-breakpoint
CREATE TRIGGER ge_audit AFTER INSERT OR UPDATE OR DELETE ON "entity_images" FOR EACH ROW EXECUTE FUNCTION ge_audit('entity_id', 'asset_id', 'role');--> statement-breakpoint
CREATE TRIGGER ge_audit AFTER INSERT OR UPDATE OR DELETE ON "field_values" FOR EACH ROW EXECUTE FUNCTION ge_audit('entity_id', 'field_definition_id');--> statement-breakpoint
CREATE TRIGGER ge_audit AFTER INSERT OR UPDATE OR DELETE ON "group_types" FOR EACH ROW EXECUTE FUNCTION ge_audit('id');--> statement-breakpoint
CREATE TRIGGER ge_audit AFTER INSERT OR UPDATE OR DELETE ON "event_categories" FOR EACH ROW EXECUTE FUNCTION ge_audit('id');--> statement-breakpoint
CREATE TRIGGER ge_audit AFTER INSERT OR UPDATE OR DELETE ON "object_subtypes" FOR EACH ROW EXECUTE FUNCTION ge_audit('id');--> statement-breakpoint
CREATE TRIGGER ge_audit AFTER INSERT OR UPDATE OR DELETE ON "field_definitions" FOR EACH ROW EXECUTE FUNCTION ge_audit('id');--> statement-breakpoint
CREATE TRIGGER ge_audit AFTER INSERT OR UPDATE OR DELETE ON "assets" FOR EACH ROW EXECUTE FUNCTION ge_audit('id');--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- Revert helpers.
-- ---------------------------------------------------------------------------------------------

-- Two versions of a row count as the same if they differ only in bookkeeping: `updated_at`,
-- and `version`, which every restore bumps. Comparing versions too would make a batch that
-- changed one row twice impossible to revert, because its first restore bumps the version.
CREATE FUNCTION ge_revert_same(a jsonb, b jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT (a - 'updated_at' - 'version') = (b - 'updated_at' - 'version')
$$;
--> statement-breakpoint
-- Stops the revert if a row isn't as the batch left it: someone changed it since.
CREATE FUNCTION ge_revert_expect(p_current jsonb, p_expected jsonb, p_table text, p_pk jsonb)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_current IS NULL OR NOT ge_revert_same(p_current, p_expected) THEN
    RAISE EXCEPTION '% % changed after this batch, so it can''t be reverted', p_table, p_pk
      USING ERRCODE = 'GE409',
            DETAIL = jsonb_build_object('table', p_table, 'pk', p_pk)::text;
  END IF;
END $$;
--> statement-breakpoint
-- A row about to be written back gets the next version and a fresh `updated_at`, where the
-- table has them, so clients holding the old version see a conflict.
CREATE FUNCTION ge_revert_bump(p_row jsonb, p_current jsonb) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN p_row ? 'version'
              THEN jsonb_set(p_row, '{version}',
                             to_jsonb(coalesce((p_current ->> 'version')::int, (p_row ->> 'version')::int) + 1))
              ELSE p_row END
         || CASE WHEN p_row ? 'updated_at' THEN jsonb_build_object('updated_at', now()) ELSE '{}' END
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- ge_revert_batch: undoes one batch. Call it inside a new batch (revertBatch() in TypeScript
-- does), so the revert is itself logged and can be reverted (redo).
--
-- It walks the batch's log newest first:
--   INSERT → delete the row (skip it if it's already gone, for example removed by a cascade);
--   UPDATE → write back every column from `before`;
--   DELETE → insert `before` again (skip it if an identical row already exists).
-- Before each step the current row must match what the batch left; otherwise it raises GE409
-- and, because everything runs in one transaction, nothing is reverted.
--
-- It works for every audited table with no per-table code: the row goes to and from jsonb
-- with `to_jsonb` and `jsonb_populate_record(null::<table>, …)`, and the SQL is built with
-- `format()`, whose %I and %L quote identifiers and literals safely.
-- Returns the number of rows changed.
-- ---------------------------------------------------------------------------------------------
CREATE FUNCTION ge_revert_batch(p_batch uuid) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_entry   record;
  v_table   text;
  v_match   text;
  v_columns text;
  v_values  text;
  v_current jsonb;
  v_row     jsonb;
  v_count   integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM change_batches WHERE id = p_batch) THEN
    RAISE EXCEPTION 'change batch % does not exist', p_batch USING ERRCODE = 'GE404';
  END IF;

  -- Rows come back in reverse order, so a child may return before its parent. Deferring the
  -- (deferrable) foreign keys checks them at commit instead (data-model §2).
  SET CONSTRAINTS ALL DEFERRED;

  FOR v_entry IN SELECT * FROM change_log WHERE batch_id = p_batch ORDER BY id DESC LOOP
    v_table := format('%I', v_entry.table_name);
    -- "t.id = p.id AND …" over the primary-key columns; p is the logged key as a row.
    SELECT string_agg(format('t.%1$I = p.%1$I', key), ' AND ')
      INTO v_match FROM jsonb_object_keys(v_entry.pk) AS key;
    EXECUTE format(
      'SELECT to_jsonb(t) FROM %1$s t, jsonb_populate_record(null::%1$s, $1) p WHERE %2$s',
      v_table, v_match)
      INTO v_current USING v_entry.pk;

    IF v_entry.op = 'INSERT' THEN
      CONTINUE WHEN v_current IS NULL;
      PERFORM ge_revert_expect(v_current, v_entry.after, v_entry.table_name, v_entry.pk);
      EXECUTE format(
        'DELETE FROM %1$s t USING jsonb_populate_record(null::%1$s, $1) p WHERE %2$s',
        v_table, v_match)
        USING v_entry.pk;

    ELSIF v_entry.op = 'UPDATE' THEN
      PERFORM ge_revert_expect(v_current, v_entry.after, v_entry.table_name, v_entry.pk);
      v_row := ge_revert_bump(v_entry.before, v_current);
      SELECT string_agg(format('%I', key), ', '), string_agg(format('r.%I', key), ', ')
        INTO v_columns, v_values FROM jsonb_object_keys(v_row) AS key;
      EXECUTE format(
        'UPDATE %1$s t SET (%3$s) = (SELECT %4$s FROM jsonb_populate_record(null::%1$s, $2) r)
           FROM jsonb_populate_record(null::%1$s, $1) p WHERE %2$s',
        v_table, v_match, v_columns, v_values)
        USING v_entry.pk, v_row;

    ELSE -- DELETE
      IF v_current IS NOT NULL THEN
        CONTINUE WHEN ge_revert_same(v_current, v_entry.before);
        PERFORM ge_revert_expect(v_current, v_entry.before, v_entry.table_name, v_entry.pk);
      END IF;
      v_row := ge_revert_bump(v_entry.before, NULL);
      EXECUTE format('INSERT INTO %1$s SELECT (jsonb_populate_record(null::%1$s, $1)).*', v_table)
        USING v_row;
    END IF;

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;
