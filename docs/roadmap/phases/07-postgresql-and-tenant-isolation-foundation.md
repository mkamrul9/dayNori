# Phase 07 — PostgreSQL and tenant isolation foundation

Group: Foundation and sync. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [03 — Platform and integration feasibility spikes](03-platform-and-integration-feasibility-spikes.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- infra/supabase
- apps/api database modules
- tests/security

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Define versioned migrations for profiles, workspaces, memberships, audit metadata, and shared item identities.
2. Implement least-privilege application DB access using a restricted non-owner runtime role, tenant-scoped queries, RLS for application tables, and private storage policies; verify the actual pooled connection role and transaction-local identity reset.
3. Create synthetic fixtures and repeatable local database setup; define migration ownership and hosted environment separation.

## Acceptance

- Two users cannot read, update, enumerate, or reference each other's private workspace data.
- Migrations reproduce a database from zero and support the chosen forward-fix workflow.
- Service credentials remain server-side and cannot be read from client bundles.

## Verification and evidence

- Run fresh/upgrade migration checks and cross-tenant RLS tests through the actual API/worker runtime role, including pooled connection identity reset.
- Inspect role grants, foreign-key tenant consistency, and indexes for primary queries.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/architecture/data-model.md](../../architecture/data-model.md)
- [docs/architecture/security-and-vault.md](../../architecture/security-and-vault.md)

## Commit target

`feat(database): establish workspace isolation and migration foundations`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
