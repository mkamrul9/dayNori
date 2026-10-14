# ADR-0013: PostgreSQL tenant isolation, row-level security, and migration foundations

- Status: accepted.
- Date: 2026-10-14.
- Owner/reviewer: Security & Database Architecture.
- Related phase and specifications: [Phase 07 Specification](../../docs/roadmap/phases/07-postgresql-and-tenant-isolation-foundation.md), [Data Model](../../docs/architecture/data-model.md), [Security & Vault](../../docs/architecture/security-and-vault.md).

## Context

Daynori supports multi-tenant personal workspaces and collaborative rooms. In multi-tenant database environments, application bugs, malicious user input, or compromised application endpoints risk exposing tenant records across workspace boundaries. Database-level tenant isolation, least-privilege role segregation, and immutable audit foundations must be established as core constraints before any product payload tables or domain features are built.

## Options

1. **Application-level filtering only (Rejected)**: Relying strictly on API route handlers appending `WHERE workspace_id = $1`. Rejected because a single missed WHERE clause or query interpolation defect can leak confidential notes, journals, or personal items across workspaces.
2. **Database-level RLS with superuser connections (Rejected)**: Connecting with database owner/superuser credentials and enabling RLS. In PostgreSQL, superusers and roles with `BYPASSRLS` automatically bypass all row-level security policies, rendering RLS ineffective for tenant isolation.
3. **Session-level GUC configuration (Rejected)**: Setting `SET app.current_workspace_id = ...` at the session connection level. Rejected because connection pooling (`pg.Pool`) reuses physical connections across disparate HTTP requests, risking catastrophic tenant identity leakage if a handler fails to clear the session variable.
4. **Least-privilege runtime role, transaction-local GUC context, and relational composite constraints (Chosen)**: Enforcing RLS on every table via `FORCE ROW LEVEL SECURITY`, using a non-owner runtime role (`daynori_runtime` with `NOBYPASSRLS`), establishing context strictly via `set_config(..., is_local = true)` inside transactions, and enforcing composite primary/foreign keys `(workspace_id, id)`.

## Decision

1. **Role Privilege Boundaries**:
   - Administrative migrations run strictly using administrative credentials (`postgres`) to create schemas, functions, triggers, and alter RLS policies.
   - Application API requests and workers connect exclusively as a dedicated least-privilege runtime role (`daynori_runtime`) configured with `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`.
2. **Transaction-Local Identity Isolation**:
   - Tenant context (`app.current_user_id` and `app.current_workspace_id`) is applied exclusively inside transactions via `set_config('app.current_user_id', $1, true)` where `is_local = true`.
   - Upon `COMMIT` or `ROLLBACK`, PostgreSQL automatically clears the GUC settings, guaranteeing zero cross-request identity leakage when connections return to the application connection pool.
3. **Forced Row Level Security**:
   - `ALTER TABLE ... FORCE ROW LEVEL SECURITY` is applied to all tenant tables (`app.profiles`, `app.workspaces`, `app.workspace_memberships`, `app.items`, `app.audit_events`, and `app.storage_objects`).
   - Anonymous or context-free queries executed through the runtime role evaluate RLS predicates to false and return zero rows.
4. **Non-Recursive Membership Authorization Helper**:
   - Access to workspace-scoped rows is checked through `app.user_has_workspace_role(workspace_id, required_roles)`.
   - The function is defined with `SECURITY DEFINER` and a pinned `search_path = app, pg_temp` to prevent search path hijacking attacks.
5. **Relational Composite Foreign Keys**:
   - Hierarchical items enforce a composite primary key `(workspace_id, id)` and folder relation `FOREIGN KEY (workspace_id, folder_id) REFERENCES app.items (workspace_id, id)`.
   - This physically prevents cross-workspace hierarchy references at the relational constraint layer, independent of RLS.
6. **Idempotent Forward-Only Migrations**:
   - Schema versioning is tracked in `app.schema_migrations` with SHA-256 checksum verification to detect accidental retroactive edits.

## Consequences

- All runtime queries that access tenant tables must execute within a `withTenantContext` transaction block.
- Connection pooling must never reuse un-isolated clients without transaction wrappers.
- Verified and enforced by automated integration test suite `tests/security/tenant-isolation.test.ts`.

## Verification and revisit

- **Verification evidence**: 16 integration tests in `tests/security/tenant-isolation.test.ts` passing against local PostgreSQL 17 (`daynori_test`), validating role permissions, cross-tenant read/write rejection, composite foreign keys, anonymous denial, membership revocation, pool reuse identity clearing, audit logging, and storage isolation.
- **Revisit triggers**: Expansion to shared collaborative rooms (Phase 51) requiring granular permission inheritance, introduction of read replicas, or performance profiling under high item cardinality necessitating materialized membership paths.
