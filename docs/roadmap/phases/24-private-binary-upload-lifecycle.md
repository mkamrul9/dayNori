# Phase 24 — Private binary upload lifecycle

Group: Personal organizer and private beta. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [15 — Folder browsing and organization interfaces](15-folder-browsing-and-organization-interfaces.md)
- [08 — API contracts and service foundation](08-api-contracts-and-service-foundation.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/api files module
- apps/worker
- infra/supabase storage
- packages/contracts

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Implement authorized upload reservations, quota checks, provider-expiring signed upload capabilities, completion verification, and item linking. Return actual provider expiry (Supabase upload URLs are documented as two hours) rather than claiming a configurable five-minute upload lifetime.
2. Quarantine untrusted files, verify declared/actual type and size, and add malware scanning policy before share/preview.
3. Add idempotent finalize, orphan cleanup, deletion jobs, immutable versions, and resumable/retry behavior where supported.
4. Bound temporary/orphan storage before issuing capabilities: prove a per-upload byte bound or reserve the maximum the provider capability can accept, limit outstanding reservations, and reconcile after capability expiry; finalize-only quota checks are insufficient.

## Acceptance

- A binary becomes available only after ownership, integrity, size, and safety checks.
- Guessing object paths cannot download another workspace's files.
- Interrupted uploads and retries cannot create unlimited orphan storage or bypass quota.

## Verification and evidence

- Test wrong MIME/size, malicious filename, quota races, missing objects, duplicate finalize, and unauthorized reads.
- Run failed-upload and cleanup job fault-injection tests.
- Attempt a larger-than-declared upload through the raw signed capability, concurrent reservations, and writes before capability expiry; prove temporary storage remains within enforced exposure limits.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/architecture/security-and-vault.md](../../architecture/security-and-vault.md)
- [docs/architecture/integrations-and-reminders.md](../../architecture/integrations-and-reminders.md)

## Commit target

`feat(files): add private verified uploads and storage lifecycle`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
