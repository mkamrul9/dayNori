# Phase 09 — Authentication across web and Android

Group: Foundation and sync. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [05 — Responsive web navigation shell](05-responsive-web-navigation-shell.md)
- [06 — Android navigation shell](06-android-navigation-shell.md)
- [08 — API contracts and service foundation](08-api-contracts-and-service-foundation.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web auth
- apps/mobile auth
- packages/api-client

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Implement the selected initial sign-up/sign-in method with Supabase Auth, verified callbacks, and recovery journeys.
2. Use secure native token storage and a reviewed web session strategy; implement refresh, expiry, logout, and device state clearing.
3. Add understandable pending/error states, email link handling, and abuse controls without requesting unrelated permissions.

## Acceptance

- A user can sign up, verify, sign in, recover access, and sign out on each platform.
- Private routes and local cached content are hidden or cleared according to the session policy.
- Expired/revoked sessions stop synchronization and do not silently discard offline drafts.

## Verification and evidence

- Test callback replay/invalid links, expiry, logout, browser tab behavior, and Android process restart.
- Review session token locations and CSRF/XSS assumptions.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/architecture/security-and-vault.md](../../architecture/security-and-vault.md)
- [docs/design/journeys.md](../../design/journeys.md)

## Commit target

`feat(auth): add secure web and Android account journeys`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
