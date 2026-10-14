# Phase 07: PostgreSQL and tenant isolation foundation

Group: Foundation and sync. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [07 — PostgreSQL and tenant isolation foundation](../roadmap/phases/07-postgresql-and-tenant-isolation-foundation.md)
- **Status:** `complete` (Database security defects repaired; verified independently of unresolved Phase 04–06 physical hardware gates following direct dependency on Phase 03).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-14.
- **Base Git revision and branch:** `3569463` on branch `main`.
- **Prerequisites:**
  - [Phase 03 — Platform and integration feasibility spikes](phase-03.md): Feasibility spikes for storage models, platform policy constraints, and native capabilities established.
- **Included scope:**
  - Database schema migrations (`infra/supabase/migrations/` 00001 through 00006) defining `app` schema, tenant tables (`profiles`, `workspaces`, `workspace_memberships`, `items`, `audit_events`, `storage_objects`), and security-definer helper `app.user_has_workspace_role()` with pinned `search_path = app, pg_temp`.
  - Dedicated least-privilege runtime role (`daynori_runtime`) configured with `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`.
  - Explicit least-privilege grants to tenant tables only; administrative migration ledger (`app.schema_migrations`) is strictly inaccessible to `daynori_runtime`.
  - Forced Row Level Security (`ALTER TABLE ... FORCE ROW LEVEL SECURITY`) applied across all tenant tables, guaranteeing that even table-privileged roles are constrained by RLS.
  - Relational composite primary key `(workspace_id, id)` and composite folder foreign key `(workspace_id, folder_id) REFERENCES app.items (workspace_id, id)` on `app.items`, rendering cross-workspace tree references impossible at the relational constraint level. Composite deletion rule sets `folder_id` to NULL while preserving non-null `workspace_id`.
  - Strict membership privilege defense: `memberships_insert` restricts initial owner bootstrap exclusively to the verified creator-owner of an unpopulated workspace, preventing unauthorized self-enrollment into existing workspaces.
  - Transaction-local tenant context isolation (`set_config('app.current_user_id', ..., true)` and `set_config('app.current_workspace_id', ..., true)`) inside `withTenantContext`, guaranteeing automatic context destruction upon `COMMIT` or `ROLLBACK`.
  - Robust connection sanitization in `apps/api/src/db/client.ts`: failed transactions or rollbacks actively discard/destroy the pooled client (`client.release(true)`) to prevent poisoned connection reuse.
  - Advisory locking (`pg_advisory_lock`) in `infra/supabase/migrator.ts` ensuring serialized, collision-free migration runs.
  - Environment-based credential loading: hardcoded passwords removed from code; credentials loaded from ignored `.env` with placeholder `.env.example`; published local runtime secret rotated.
  - Declarative private storage policies documented in `infra/supabase/policies/storage.sql` and `infra/supabase/policies/README.md`.
  - Comprehensive security integration test suite (`tests/security/tenant-isolation.test.ts`) verifying all 22 security invariants against a real PostgreSQL 17 instance (`127.0.0.1:5432/daynori_test`).
  - [ADR-0013: PostgreSQL tenant isolation, row-level security, and migration foundations](../decisions/0013-postgresql-tenant-isolation-and-rls.md).
- **Excluded/deferred scope:**
  - Product payload tables (todos, routines, notes, journals, tags) — scheduled for Phase 10 & Phase 11.
  - External authentication providers and OAuth tokens — scheduled for Phase 09.
  - Worker shared DB access — `apps/worker` remains a smoke scaffold; its database path has not been exercised.
  - Supabase storage service integration — local binary object bucket enforcement is recorded as an acceptance gap until Phase 10+ (custom metadata `app.storage_objects` RLS verified).
  - Physical Android TalkBack verification (Phase 04 & Phase 06) — remains blocked pending physical device.

## Result

Delivered the repaired PostgreSQL multi-tenant isolation and migration foundation for Daynori, establishing verified tenant isolation boundaries at both the relational constraint and database RLS layers.

Key architectural and platform achievements:

1. **Least-Privilege Database Role Architecture:**
   - Administrative tasks and schema migrations execute strictly via admin credentials (`postgres`).
   - Ordinary API request handling operates exclusively under the `daynori_runtime` role (`NOBYPASSRLS`), preventing superuser bypasses of tenant boundaries.
   - Migration ledger table `app.schema_migrations` has privileges explicitly revoked from `daynori_runtime`.
2. **Transaction-Local Identity & Pool Sanitization:**
   - Identity variables (`app.current_user_id`, `app.current_workspace_id`) are injected strictly using PostgreSQL `is_local = true` inside transactional blocks (`withTenantContext`).
   - When connections are returned to the `pg.Pool`, PostgreSQL automatically resets local GUCs. In the event of a transaction failure or rollback error, the pooled client is explicitly destroyed/discarded.
3. **Defense-in-Depth Relational Constraints:**
   - Hierarchical folders enforce composite foreign keys: `FOREIGN KEY (workspace_id, folder_id) REFERENCES app.items (workspace_id, id)`.
   - Folder deletion sets `folder_id` to `NULL` while preserving `workspace_id`.
4. **Privilege Escalation Defense:**
   - Self-enrollment into another workspace via spoofed context is rejected by RLS.
   - Initial bootstrap is restricted to the legitimate workspace creator when no previous membership exists.
5. **Authoritative Migration Management:**
   - Migrations are tracked in `app.schema_migrations` with SHA-256 cryptographic checksums, advisory locks for concurrency safety, and transaction rollback recovery.

## Acceptance evidence

| Acceptance Condition                                        | Verification Method                          | Location / Artifact                       | Result                                                                                     |
| :---------------------------------------------------------- | :------------------------------------------- | :---------------------------------------- | :----------------------------------------------------------------------------------------- |
| Runtime role is non-superuser and cannot bypass RLS         | Integration query on `pg_roles`              | `tests/security/tenant-isolation.test.ts` | PASS (`rolsuper = false`, `rolbypassrls = false`)                                          |
| Denied administrative migration ledger mutation             | Runtime role attempting INSERT on migrations | `tests/security/tenant-isolation.test.ts` | PASS (permission denied for table schema_migrations)                                       |
| Reproduces empty dedicated database from zero               | Scratch database migration execution         | `tests/security/tenant-isolation.test.ts` | PASS (All 6 migrations applied from scratch on fresh DB)                                   |
| Migration concurrency with advisory locking                 | Concurrent migration runner execution        | `tests/security/tenant-isolation.test.ts` | PASS (Advisory lock serializes execution without collision)                                |
| Checksum tampering rejection & rollback recovery            | Tampered file checksum & syntax error tests  | `tests/security/tenant-isolation.test.ts` | PASS (Throws checksum mismatch / rolls back failed migration cleanly)                      |
| Self-enrollment privilege escalation defense                | User 2 attempting insert into User 1 space   | `tests/security/tenant-isolation.test.ts` | PASS (RLS rejects unauthorized self-enrollment)                                            |
| Legitimate creator owner bootstrap                          | User 1 bootstrapping owned workspace         | `tests/security/tenant-isolation.test.ts` | PASS (Creator successfully bootstrapped as initial owner)                                  |
| Composite folder deletion tenant integrity                  | Parent folder deletion                       | `tests/security/tenant-isolation.test.ts` | PASS (Sets `folder_id` to NULL while preserving `workspace_id`)                            |
| Cross-tenant item read, list, update, and delete prevention | Cross-tenant queries under User 2 context    | `tests/security/tenant-isolation.test.ts` | PASS (getItem returns null, list returns empty, update returns null, delete returns false) |
| Cross-tenant insert rejection                               | Attempting insert with mismatched workspace  | `tests/security/tenant-isolation.test.ts` | PASS (RLS with check option rejects insert)                                                |
| Relational composite foreign key integrity                  | Cross-workspace folder reference attempt     | `tests/security/tenant-isolation.test.ts` | PASS (foreign key constraint violation raised)                                             |
| Anonymous / Context-free denial                             | Querying runtime pool without GUC context    | `tests/security/tenant-isolation.test.ts` | PASS (returns 0 rows for all tenant tables)                                                |
| Role-based privilege escalation rejection                   | Viewer role attempting insert/update         | `tests/security/tenant-isolation.test.ts` | PASS (RLS denies viewer write operations)                                                  |
| Immediate membership revocation cutoff                      | Querying workspace items after removal       | `tests/security/tenant-isolation.test.ts` | PASS (access revoked immediately upon membership delete)                                   |
| Connection cleanup failure discard                          | Poisoned connection released with discard    | `tests/security/tenant-isolation.test.ts` | PASS (Dirty connection closed and removed from pool)                                       |
| Zero identity leakage across pooled connections             | Testing connection after COMMIT and ROLLBACK | `tests/security/tenant-isolation.test.ts` | PASS (`current_setting` evaluates to empty/null on reuse)                                  |
| Actor-field integrity                                       | Insert with mismatched actor ID              | `tests/security/tenant-isolation.test.ts` | PASS (RLS rejects insert when actor does not match current user)                           |
| Workspace isolation for audit and storage objects           | Cross-tenant audit and storage queries       | `tests/security/tenant-isolation.test.ts` | PASS (User 2 cannot read User 1 audit logs or storage objects)                             |
| Storage bucket privacy enforcement                          | User 2 accessing User 1 private bucket       | `tests/security/tenant-isolation.test.ts` | PASS (RLS rejects cross-workspace bucket queries)                                          |
| Cross-workspace storage path access denial                  | User 2 accessing User 1 storage objects      | `tests/security/tenant-isolation.test.ts` | PASS (RLS rejects read/write across workspace paths)                                       |
| Storage path traversal defense                              | Path containing `..` or leading `/`          | `tests/security/tenant-isolation.test.ts` | PASS (Workspace extractor rejects path traversal and returns NULL)                         |
| Storage malformed object name rejection                     | Non-UUID prefix in object name               | `tests/security/tenant-isolation.test.ts` | PASS (Extractor rejects invalid format, RLS blocks insert)                                 |
| Full monorepo typecheck                                     | `pnpm typecheck`                             | Root workspace                            | PASS (Exit code 0 across 13 packages)                                                      |
| Lint validation                                             | `pnpm lint`                                  | Root workspace                            | PASS (Exit code 0, 0 lint errors)                                                          |
| Prettier style validation                                   | `pnpm format:check`                          | Root workspace                            | PASS (All files adhere to code style)                                                      |
| Secret scanning                                             | `pnpm audit:secrets`                         | Root workspace                            | PASS (1162 files checked, 0 unapproved secrets)                                            |

### Executed verification commands

```powershell
# 1. Run security tenant isolation integration test suite against local PostgreSQL 17
pnpm vitest run tests/security/tenant-isolation.test.ts
# Result: Exit code 0 (28 tests passed in 934ms)

# 2. Run full test suite across monorepo
pnpm test
# Result: Exit code 0 (22 test files, 193 tests passed)

# 3. Typecheck all workspace packages
pnpm typecheck
# Result: Exit code 0 across 13 workspace projects

# 4. ESLint verification
pnpm lint
# Result: Exit code 0, 0 warnings, 0 errors

# 5. Format check
pnpm format:check
# Result: Exit code 0 (All matched files use Prettier code style)

# 6. Planning validation
pnpm validate:planning
# Result: Exit code 0 (64 phases, 22 mapped requirements, 145 Markdown files validated)

# 7. Secret scanner audit
pnpm audit:secrets
# Result: Exit code 0 (checked 1162 files without detecting unapproved secrets)
```

## Defects, limitations and recovery

- **Physical Android TalkBack Hardware Gate (Phases 04 & 06)**: Remains blocked on physical Android hardware availability; explicitly preserved in `docs/roadmap/progress.json`.
- **Worker Runtime DB Path**: `apps/worker` remains a smoke scaffold; its database path has not been exercised.
- **Supabase Storage Service Integration**: Local binary storage bucket enforcement remains a documented acceptance gap; metadata isolation is verified on `app.storage_objects`.
- **Dependency Advisory Warnings**: Fail-closed advisory audit (`node-forge` and `braces`) remains visible without invented approval bypasses.
- **Forward-Fix Workflow**: Schema changes must be applied as forward-only SQL migrations (e.g., `00003_...sql` through `00006_...sql`) with checksum tracking.

## Documentation and Git review

- Architecture Decision Record: [ADR-0013: PostgreSQL tenant isolation, row-level security, and migration foundations](../decisions/0013-postgresql-tenant-isolation-and-rls.md).
- Infrastructure Documentation: `infra/supabase/README.md`, `infra/supabase/migrations/README.md`, and `infra/supabase/policies/README.md`.
- Roadmap Progress: Updated `docs/roadmap/progress.json` marking Phase 07 as complete and pointing `nextPhase` to `08`.
- Changelog: Updated `CHANGELOG.md` with Phase 07 security repairs.
- `git diff --check`: Verified clean.
- Staged paths: Scoped strictly to database infrastructure, API repositories, test suite, and planning documentation.
- Commit message: `fix(database): enforce strict membership bootstrap, narrow grants, and composite constraints`.

## Handoff

- **Phase 07 Status:** Complete and verified.
- **Next Eligible Phase:** [Phase 08 — API contracts and service foundation](../roadmap/phases/08-api-contracts-and-service-foundation.md).
- **Prerequisites for Phase 08:** Phase 07 (repaired and verified).
