# Phase 97 — Version 2 security privacy and recovery audit

Group: V2 quality and release. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [75 — Files and audio attachment readiness](75-files-and-audio-attachment-readiness.md)
- [76 — Expenses and safe custom sections completion](76-expenses-and-safe-custom-sections-completion.md)
- [77 — Safe offline reopen sync and upgrade recovery](77-safe-offline-reopen-sync-and-upgrade-recovery.md)
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

- apps
- packages
- tests/security
- docs/architecture
- docs/engineering

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Audit the completed V2 attack surface including developer/support roles, feedback attachments, AI/voice, search, local boot and notifications.
2. Repair bounded high-severity findings and re-run cross-workspace/membership/consent/revision/redaction abuse cases; split large remediation explicitly.
3. Rehearse account erasure, metadata/object backup restore, deletion suppression and secret/provider rotation with synthetic environments.

## Acceptance

- No unresolved critical/high or data-loss/isolation release blockers remain; independent vault disposition is present.
- External input, rich content, file/URL boundaries, cookies/CSRF/CSP, quotas and sensitive logs satisfy documented threat controls.
- Actual restore recovers metadata and bytes while honoring deletion; no audit claims total security.

## Verification and evidence

- Run relevant security/integration/secret/dependency checks and documented abuse/restore drills.
- Record findings, fixes, residual risks, reviewer evidence and migration/recovery limitations.

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
- [docs/architecture/security-and-vault.md](../../architecture/security-and-vault.md)
- [docs/engineering/release-gates.md](../../engineering/release-gates.md)

## Commit target

`fix(security): close Version 2 privacy and recovery findings`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
