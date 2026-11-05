# Phase 100 — Full Version 2 beta and readiness reconciliation

Group: V2 quality and release. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [99 — Accessibility responsive and fresh-user acceptance](99-accessibility-responsive-and-fresh-user-acceptance.md)
- [83 — Developer feedback triage and verified support contact](83-developer-feedback-triage-and-verified-support-contact.md)
- [84 — Mobile PWA push and reminder delivery proof](84-mobile-pwa-push-and-reminder-delivery-proof.md)
- [85 — Native Android reminder and notification readiness](85-native-android-reminder-and-notification-readiness.md)
- [86 — Vault review recovery and release gate closure](86-vault-review-recovery-and-release-gate-closure.md)
- [87 — Google Drive connection and scope readiness](87-google-drive-connection-and-scope-readiness.md)
- [88 — Rooms chat and staffed moderation readiness](88-rooms-chat-and-staffed-moderation-readiness.md)
- [89 — Billing entitlements and sustainable plan readiness](89-billing-entitlements-and-sustainable-plan-readiness.md)
- [94 — Structured organizer tools and multi-action creation](94-structured-organizer-tools-and-multi-action-creation.md)
- [95 — Voice capture transcription and reviewed creation](95-voice-capture-transcription-and-reviewed-creation.md)
- [96 — Nori original companion and assistant launcher](96-nori-original-companion-and-assistant-launcher.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- docs/roadmap/v2
- docs/release
- docs/engineering
- tests/e2e

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Run a bounded owner-agreed beta of the full requested scope and reconcile every feature/action/platform/Help/tour evidence row.
2. Rehearse V1 account upgrades, durable saves, offline/reconnect, provider failure, two-account isolation and support triage on the candidate environment.
3. Produce the complete enabled-feature manifest, known defects, operating/retention/support ownership and legacy-gate reconciliation.

## Acceptance

- Every full-target function has passing applicable real-device/provider evidence and learning coverage; missing optional gates still block full V2.
- Any smaller preview or changed scope is an explicit owner decision with accurate claims, never a hidden completion shortcut.
- No fabricated beta participation, moderation/support staffing or legacy release supersession appears in reports.

## Verification and evidence

- Run integrated core/advanced/assistant/feedback/tour journeys against candidate builds and record exact failures/results.
- Review coverage/defect/legacy-gate reconciliation and actual beta observations before readiness sign-off.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/roadmap/v2/README.md](../v2/README.md)
- [docs/roadmap/v2/feature-coverage.md](../v2/feature-coverage.md)
- [docs/engineering/handoff.md](../../engineering/handoff.md)
- [docs/roadmap/v2/quality-and-release.md](../v2/quality-and-release.md)
- [docs/engineering/release-gates.md](../../engineering/release-gates.md)

## Commit target

`docs(beta): reconcile complete Version 2 readiness evidence`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
