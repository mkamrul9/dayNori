-- Match the public item cursor order. The previous updated_at index forced a
-- sort of every live workspace item before returning a small page under RLS.
CREATE INDEX IF NOT EXISTS idx_items_live_keyset
  ON app.items (workspace_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;
