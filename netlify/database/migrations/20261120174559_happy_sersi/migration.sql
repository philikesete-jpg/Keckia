-- The earlier records_unique_key migration (and runtime schema repair) can
-- already have created this index. Keep this snapshot migration safe to apply.
CREATE UNIQUE INDEX IF NOT EXISTS "records_collection_id_key" ON "records" ("collection","id");
