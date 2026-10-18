-- Migration: 00030_global_search_indexes
-- Description: Trigram and full-text search indexes for authorized organizer search across notes, tasks, journals, files, folders, and tags
-- Search Path: app, pg_temp

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Notes search indexes
CREATE INDEX IF NOT EXISTS idx_notes_title_trgm 
    ON app.notes USING gin (title gin_trgm_ops);

-- 2. Tasks search indexes
CREATE INDEX IF NOT EXISTS idx_tasks_title_trgm 
    ON app.tasks USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_tasks_details_trgm 
    ON app.tasks USING gin (details gin_trgm_ops) 
    WHERE details IS NOT NULL;

-- 3. Journal entries search indexes
CREATE INDEX IF NOT EXISTS idx_journal_entries_title_trgm 
    ON app.journal_entries USING gin (title gin_trgm_ops) 
    WHERE title IS NOT NULL;

-- 4. File items search indexes
CREATE INDEX IF NOT EXISTS idx_file_items_name_trgm 
    ON app.file_items USING gin (file_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_file_items_fts 
    ON app.file_items USING gin (to_tsvector('simple', file_name));

-- 5. Folders and Tags trigram indexes
CREATE INDEX IF NOT EXISTS idx_folders_name_trgm 
    ON app.folders USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_tags_name_trgm 
    ON app.tags USING gin (name gin_trgm_ops);

-- 6. Items standard scope index to accelerate vault-excluded scans
CREATE INDEX IF NOT EXISTS idx_items_search_standard 
    ON app.items (workspace_id, kind, deleted_at, updated_at DESC) 
    WHERE security_scope != 'vault';
