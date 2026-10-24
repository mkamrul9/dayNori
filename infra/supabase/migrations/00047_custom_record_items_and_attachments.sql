-- Migration 00047: Align custom section records with canonical app.items and item_attachments
-- Enforces canonical item identity, attachment lifecycle, and collection scoping.

-- 1. Allow 'custom_record' in app.items kind check constraint
ALTER TABLE app.items DROP CONSTRAINT IF EXISTS items_kind_check;
ALTER TABLE app.items ADD CONSTRAINT items_kind_check CHECK (
    kind IN ('note', 'todo', 'task', 'routine', 'journal_entry', 'file', 'file_item', 'calendar_event', 'folder', 'expense', 'custom_record')
);

-- 2. Backfill app.items for any existing custom_section_records that do not have one
INSERT INTO app.items (
    id,
    workspace_id,
    folder_id,
    kind,
    created_by,
    updated_by,
    revision,
    rank,
    is_archived,
    is_pinned,
    security_scope,
    created_at,
    updated_at,
    deleted_at
)
SELECT
    r.id,
    r.workspace_id,
    r.folder_id,
    'custom_record',
    r.created_by,
    r.updated_by,
    r.revision,
    r.rank,
    false,
    false,
    'standard',
    r.created_at,
    r.updated_at,
    r.deleted_at
FROM app.custom_section_records r
WHERE NOT EXISTS (
    SELECT 1 FROM app.items i WHERE i.id = r.id
)
ON CONFLICT (id) DO NOTHING;

-- 3. Add foreign key from custom_section_records to app.items
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_custom_section_records_item'
    ) THEN
        ALTER TABLE app.custom_section_records
            ADD CONSTRAINT fk_custom_section_records_item
            FOREIGN KEY (id) REFERENCES app.items(id) ON DELETE CASCADE;
    END IF;
END $$;
