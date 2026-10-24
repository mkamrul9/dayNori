# infra/supabase/policies

Documented role grants and tenant/storage policy definitions for Daynori.

## Contents

- `storage.sql`: Declarative Row-Level Security policies for the Supabase `storage.objects` table. Enforces private asset isolation by workspace path prefix (`{workspace_id}/...`) and role (`app.user_has_workspace_role`).

## Environment Separation & Acceptance Gap

In local standalone PostgreSQL environments where the Supabase storage daemon is not active, `app.storage_objects` provides metadata isolation testing. Physical binary object upload enforcement via Supabase Storage remains a documented acceptance gap until the storage daemon is integrated in Phase 10+.
