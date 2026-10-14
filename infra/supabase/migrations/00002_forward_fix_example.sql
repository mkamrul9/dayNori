-- Migration: 00002_forward_fix_example
-- Description: Add rank ordering and index to app.items demonstrating forward-fix upgrade workflow

ALTER TABLE app.items
ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_items_order
ON app.items (workspace_id, display_order)
WHERE deleted_at IS NULL;
