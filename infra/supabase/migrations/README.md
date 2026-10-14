# infra/supabase/migrations

Append-only, reviewed SQL schema history; one canonical migration authority for Daynori.

## Migration Files

- `00001_initial_schema.sql`: Core PostgreSQL schema foundations, least-privilege role setup (`daynori_runtime`), `app` schema, tenant tables (`profiles`, `workspaces`, `workspace_memberships`, `items`, `audit_events`, `storage_objects`), RLS policies with `FORCE ROW LEVEL SECURITY`, security-definer authorization helpers with pinned `search_path`, and composite foreign keys preventing cross-tenant tree hierarchies.
- `00002_forward_fix_example.sql`: Example forward-fix migration adding `display_order` index on `app.items`.

## Principles and Invariants

1. **Forward-Only**: Never edit or overwrite previously applied migrations. Always author a new migration file with the next sequential integer prefix (e.g. `00003_...sql`).
2. **Checksum Verification**: `app.schema_migrations` records the SHA-256 hash of each applied file. Tampering with historical files raises a fatal migration error.
3. **Transaction Safety**: Every migration executes inside an atomic database transaction (`BEGIN ... COMMIT`).
4. **Least-Privilege Runtime Role**: Table ownership belongs to the migration administrator (`postgres`). API and worker connections operate strictly as `daynori_runtime` (`NOBYPASSRLS`).
