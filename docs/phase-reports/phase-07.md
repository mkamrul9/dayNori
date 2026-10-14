# Phase 07: PostgreSQL and tenant isolation foundation

Group: Foundation and sync. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [07 — PostgreSQL and tenant isolation foundation](../roadmap/phases/07-postgresql-and-tenant-isolation-foundation.md)
- **Status:** `complete` (Authorized to proceed independently of unresolved Phase 04–06 physical hardware gates following its direct dependency on Phase 03).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-14.
- **Base Git revision and branch:** `3569463` on branch `main`.
- **Prerequisites:**
  - [Phase 03 — Platform and integration feasibility spikes](phase-03.md): Feasibility spikes for storage models, platform policy constraints, and native capabilities established.
- **Included scope:**
  - Initial database schema migrations (`infra/supabase/migrations/00001_initial_schema.sql` and `00002_forward_fix_example.sql`) defining `app` schema, tenant tables (`profiles`, `workspaces`, `workspace_memberships`, `items`, `audit_events`, `storage_objects`), and security-definer helper `app.user_has_workspace_role()` with pinned `search_path = app, pg_temp`.
  - Dedicated least-privilege runtime role (`daynori_runtime`) configured with `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`.
  - Forced Row Level Security (`ALTER TABLE ... FORCE ROW LEVEL SECURITY`) applied across all tenant tables, guaranteeing that even table-privileged roles are constrained by RLS.
  - Relational composite primary key `(workspace_id, id)` and composite folder foreign key `(workspace_id, folder_id) REFERENCES app.items (workspace_id, id)` on `app.items`, rendering cross-workspace tree references impossible at the relational constraint level.
  - Transaction-local tenant context isolation (`set_config('app.current_user_id', ..., true)` and `set_config('app.current_workspace_id', ..., true)`) inside `withTenantContext`, guaranteeing automatic context destruction upon `COMMIT` or `ROLLBACK` and preventing identity leakage across pooled connections (`pg.Pool`).
  - Database access layer in `apps/api/src/db/`: config, client, and repositories (`workspaceRepository`, `membershipRepository`, `itemRepository`, `auditRepository`, `storageRepository`).
  - Migration runner (`infra/supabase/migrator.ts`) with `app.schema_migrations` tracking applied versions and SHA-256 checksums to detect accidental retroactive edits.
  - Security integration test suite (`tests/security/tenant-isolation.test.ts`) verifying all 10 security invariants against a real PostgreSQL 17 instance (`127.0.0.1:5432/daynori_test`).
  - [ADR-0013: PostgreSQL tenant isolation, row-level security, and migration foundations](../decisions/0013-postgresql-tenant-isolation-and-rls.md).
- **Excluded/deferred scope:**
  - Product payload tables (todos, routines, notes, journals, tags) — scheduled for Phase 10 & Phase 11.
  - External authentication providers and OAuth tokens — scheduled for Phase 09.
  - Redis cache and distributed rate limiting — scheduled for Phase 08.
  - Network sync engine and offline mutation queues — scheduled for Phase 12 & Phase 13.
  - Physical Android TalkBack verification (Phase 04 & Phase 06) — remains blocked pending physical device.

## Result

Delivered the complete PostgreSQL multi-tenant isolation and migration foundation for Daynori, establishing bulletproof tenant isolation at both the relational constraint and database RLS layers.

Key architectural and platform achievements:

1. **Least-Privilege Database Role Architecture:**
   - Administrative tasks and schema migrations execute strictly via admin credentials (`postgres`).
   - Ordinary API request handling and background workers operate exclusively under the `daynori_runtime` role (`NOBYPASSRLS`), preventing superuser bypasses of tenant boundaries.
2. **Transaction-Local Identity & Zero Pool Leakage:**
   - Identity variables (`app.current_user_id`, `app.current_workspace_id`) are injected strictly using PostgreSQL `is_local = true` inside transactional blocks (`withTenantContext`).
   - When connections are returned to the `pg.Pool`, PostgreSQL automatically resets local GUCs, guaranteeing zero identity leakage across pool reuses.
3. **Defense-in-Depth Relational Constraints:**
   - Hierarchical folders enforce composite foreign keys: `FOREIGN KEY (workspace_id, folder_id) REFERENCES app.items (workspace_id, id)`.
   - Cross-tenant folder nesting attacks are physically impossible at the database engine level, even if application RLS were bypassed.
4. **Authoritative Migration Management:**
   - Migrations are tracked in `app.schema_migrations` with SHA-256 cryptographic checksums. Idempotent re-runs skip applied migrations without side effects.

## Acceptance evidence

| Acceptance Condition                                        | Verification Method                          | Location / Artifact                       | Result                                                                                     |
| :---------------------------------------------------------- | :------------------------------------------- | :---------------------------------------- | :----------------------------------------------------------------------------------------- |
| Runtime role is non-superuser and cannot bypass RLS         | Integration query on `pg_roles`              | `tests/security/tenant-isolation.test.ts` | PASS (`rolsuper = false`, `rolbypassrls = false`)                                          |
| Migration reproducibility and idempotency                   | Re-running migration runner                  | `infra/supabase/migrator.ts`              | PASS (0 reapplied, skipped existing migrations cleanly)                                    |
| Cross-tenant item read, list, update, and delete prevention | Cross-tenant queries under User 2 context    | `tests/security/tenant-isolation.test.ts` | PASS (getItem returns null, list returns empty, update returns null, delete returns false) |
| Cross-tenant insert rejection                               | Attempting insert with mismatched workspace  | `tests/security/tenant-isolation.test.ts` | PASS (RLS with check option rejects insert)                                                |
| Relational composite foreign key integrity                  | Cross-workspace folder reference attempt     | `tests/security/tenant-isolation.test.ts` | PASS (foreign key constraint violation raised)                                             |
| Anonymous / Context-free denial                             | Querying runtime pool without GUC context    | `tests/security/tenant-isolation.test.ts` | PASS (returns 0 rows for all tenant tables)                                                |
| Role-based privilege escalation rejection                   | Viewer role attempting insert/update         | `tests/security/tenant-isolation.test.ts` | PASS (RLS denies viewer write operations)                                                  |
| Immediate membership revocation cutoff                      | Querying workspace items after removal       | `tests/security/tenant-isolation.test.ts` | PASS (access revoked immediately upon membership delete)                                   |
| Zero identity leakage across pooled connections             | Testing connection after COMMIT and ROLLBACK | `tests/security/tenant-isolation.test.ts` | PASS (`current_setting` evaluates to empty/null on reuse)                                  |
| Workspace isolation for audit and storage objects           | Cross-tenant audit and storage queries       | `tests/security/tenant-isolation.test.ts` | PASS (User 2 cannot read User 1 audit logs or storage objects)                             |
| Full monorepo typecheck                                     | `pnpm typecheck`                             | Root workspace                            | PASS (Exit code 0 across 13 packages)                                                      |
| Lint validation                                             | `pnpm lint`                                  | Root workspace                            | PASS (Exit code 0, 0 lint errors)                                                          |
| Prettier style validation                                   | `pnpm format:check`                          | Root workspace                            | PASS (All files adhere to code style)                                                      |
| Secret scanning                                             | `pnpm audit:secrets`                         | Root workspace                            | PASS (1132 files checked, 0 unapproved secrets)                                            |

### Executed verification commands

```powershell
# 1. Run security tenant isolation integration test suite against local PostgreSQL 17
pnpm vitest run tests/security/tenant-isolation.test.ts
# Result: Exit code 0 (16 tests passed in 317ms)

# 2. Run full test suite across monorepo
pnpm test
# Result: Exit code 0 (22 test files, 139 tests passed)

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
# Result: Exit code 0 (checked 1132 files without detecting unapproved secrets)
```

## Defects, limitations and recovery

- **Physical Android TalkBack Hardware Gate (Phases 04 & 06)**: Remains blocked on physical Android hardware availability; explicitly preserved in `docs/roadmap/progress.json`.
- **Dependency Advisory Warnings**: Fail-closed advisory audit (`node-forge` and `braces`) remains visible without invented approval bypasses.
- **Forward-Fix Workflow**: Schema changes must be applied as forward-only SQL migrations (e.g., `00003_...sql`) with checksum tracking. Rollbacks in production are performed by authoring inverse forward-fix migrations.

## Documentation and Git review

- Architecture Decision Record: [ADR-0013: PostgreSQL tenant isolation, row-level security, and migration foundations](../decisions/0013-postgresql-tenant-isolation-and-rls.md).
- Infrastructure Documentation: `infra/supabase/README.md` and `infra/supabase/migrations/README.md`.
- Roadmap Progress: Updated `docs/roadmap/progress.json` marking Phase 07 as complete and pointing `nextPhase` to `08`.
- Changelog: Updated `CHANGELOG.md` with Phase 07 accomplishments.
- `git diff --check`: Verified clean (no whitespace or conflict markers).
- Staged paths: Scoped strictly to database infrastructure, API repositories, test suite, and planning documentation.
- Commit message: `feat(database): establish workspace isolation and migration foundations`.

## Handoff

- **Phase 07 Status:** Complete and verified.
- **Next Eligible Phase:** [Phase 08 — API contracts and service foundation](../roadmap/phases/08-api-contracts-and-service-foundation.md).
- **Prerequisites for Phase 08:** Phase 07 (PostgreSQL foundation, satisfied).
