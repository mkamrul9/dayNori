# Phase 08 — API contracts and service foundation

Group: Foundation and sync. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [07 — PostgreSQL and tenant isolation foundation](07-postgresql-and-tenant-isolation-foundation.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/api
- packages/contracts
- packages/api-client

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Add Fastify module registration, versioned REST routes, runtime request/response validation, and OpenAPI generation.
2. Implement JWT verification, membership authorization, structured redacted logging, request IDs, errors, limits, and health/readiness checks.
3. Generate or type the shared API client from canonical contracts and document pagination/cancellation.

## Acceptance

- Unauthenticated and unauthorized requests fail consistently without leaking object existence.
- Invalid input is rejected at the boundary and contract drift fails checks.
- Health and readiness reveal operational state without secrets.

## Verification and evidence

- Run route schema, expired token, authorization, rate-limit, and error contract tests.
- Inspect representative logs for content and credential leakage.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/architecture/api-conventions.md](../../architecture/api-conventions.md)
- [docs/architecture/system-overview.md](../../architecture/system-overview.md)

## Commit target

`feat(api): establish validated authenticated service contracts`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
