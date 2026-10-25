# Phase 86 — Vault review recovery and release gate closure

Group: V2 advanced capability gates. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [71 — Native Android interface and navigation parity](71-native-android-interface-and-navigation-parity.md)
- [75 — Files and audio attachment readiness](75-files-and-audio-attachment-readiness.md)
- [77 — Safe offline reopen sync and upgrade recovery](77-safe-offline-reopen-sync-and-upgrade-recovery.md)
- [81 — Advanced recovery and optional-feature tour coverage](81-advanced-recovery-and-optional-feature-tour-coverage.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web/src/vault
- apps/mobile/src/vault
- apps/api
- tests/security/vault
- docs/architecture
- docs/engineering

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Audit provisional vault behavior against the existing threat model and obtain independent qualified review before enabling any encrypted capability.
2. Repair bounded review findings for key lifecycle, recovery, device enrollment/revocation, ciphertext attachments/export and background locking.
3. Validate actual browser/native devices and activate only reviewed functionality with honest Help/tour; record unresolved legacy gates rather than rewriting them as passed.

## Acceptance

- Independent review and required physical crypto/recovery evidence exist with no unresolved gate-blocking findings.
- Vault plaintext stays out of server storage/sync, ordinary caches/search, logs, notifications and AI; lock UI is never described as encryption.
- Lost-secret/recovery/upgrade behavior is explicit and tested; missing external audit keeps the phase blocked.

## Verification and evidence

- Run vault security harnesses, ciphertext/metadata leakage, export/recovery and key-loss/biometric-change cases.
- Record external review disposition and physical web/native lifecycle evidence; split material remediation into appended bounded phases.

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
- [docs/architecture/security-and-vault.md](../../architecture/security-and-vault.md)
- [docs/engineering/release-gates.md](../../engineering/release-gates.md)
- [docs/roadmap/v2/quality-and-release.md](../v2/quality-and-release.md)

## Commit target

`fix(vault): close independently reviewed recovery and release gates`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
