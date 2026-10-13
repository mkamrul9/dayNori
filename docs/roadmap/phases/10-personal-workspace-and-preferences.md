# Phase 10 — Personal workspace and preferences

Group: Foundation and sync. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [09 — Authentication across web and Android](09-authentication-across-web-and-android.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/api workspace module
- packages/domain
- apps/web
- apps/mobile

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Create exactly one initial private workspace through an idempotent provision flow.
2. Store user time zone, locale, week start, display preferences, and workspace membership context.
3. Define preference versioning and account/workspace boundaries that later sharing can extend.

## Acceptance

- Repeated provisioning cannot duplicate the personal workspace.
- Clients cannot select a workspace without current membership.
- Time zone and week-start preferences survive re-login and have explicit defaults.

## Verification and evidence

- Test concurrent provisioning, stale membership, preference validation, and cross-tenant IDs.
- Run sign-in to workspace selection journeys on web and Android.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/architecture/data-model.md](../../architecture/data-model.md)
- [docs/product/requirements.md](../../product/requirements.md)

## Commit target

`feat(workspaces): add personal workspace and user preferences`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
