# Phase 29 — Web reminder delivery and PWA support

Group: Personal organizer and private beta. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [27 — Reminder scheduling and durable delivery jobs](27-reminder-scheduling-and-durable-delivery-jobs.md)
- [05 — Responsive web navigation shell](05-responsive-web-navigation-shell.md)
- [03 — Platform and integration feasibility spikes](03-platform-and-integration-feasibility-spikes.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web service worker
- apps/api push subscriptions
- apps/worker web push

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Implement supported-browser Web Push subscription lifecycle and contextual permission controls.
2. Add a reviewed PWA shell/offline cache strategy excluding private API responses and secrets from shared caches.
3. Provide in-app reminder/agenda fallback and capability messaging where notifications or persistent background operation are unavailable.

## Acceptance

- Supported browsers receive an authorized notification with a safe deep link.
- Private account data never leaks through shared service-worker/CDN caching.
- Unsupported or denied notification environments remain useful and do not promise browser alarms.

## Verification and evidence

- Test subscription expiry/revoke, account logout, service-worker upgrade, offline shell, and shared-computer behavior.
- Review actual supported browser/device matrix rather than claiming universal PWA behavior.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/architecture/integrations-and-reminders.md](../../architecture/integrations-and-reminders.md)
- [docs/architecture/security-and-vault.md](../../architecture/security-and-vault.md)

## Commit target

`feat(web): add browser reminders and reviewed offline shell`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
