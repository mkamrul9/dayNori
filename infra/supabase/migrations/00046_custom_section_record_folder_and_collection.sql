-- 00046_custom_section_record_folder_and_collection.sql
-- Phase 43: Complete structured record canonical folder placement and collection identity

ALTER TABLE app.custom_section_records
    ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES app.items(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS collection_id text;

CREATE INDEX IF NOT EXISTS idx_custom_section_records_folder ON app.custom_section_records(folder_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_custom_section_records_collection ON app.custom_section_records(collection_id) WHERE deleted_at IS NULL;
