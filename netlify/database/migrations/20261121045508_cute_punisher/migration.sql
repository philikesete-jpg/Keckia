-- The index was already created by 20260817090000_records_unique_key, which had
-- no schema snapshot. This migration records it in the snapshot; IF NOT EXISTS
-- keeps it a no-op on databases that already have it.
CREATE UNIQUE INDEX IF NOT EXISTS "records_collection_id_key" ON "records" ("collection","id");
