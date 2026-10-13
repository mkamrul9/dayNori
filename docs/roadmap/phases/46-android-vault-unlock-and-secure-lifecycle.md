# Phase 46 — Android vault unlock and secure lifecycle

Group: Vault and Drive. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [45 — Encrypted vault records and sync protocol](45-encrypted-vault-records-and-sync-protocol.md)
- [06 — Android navigation shell](06-android-navigation-shell.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/mobile vault
- packages/ui-mobile
- apps/mobile secure-storage

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Implement the reviewed PIN/device-key wrapping and optional biometric gate, auto-lock, and explicit recovery/enrollment journeys.
2. Handle background/resume, biometric enrollment changes, failed attempts, session expiry, and key revocation.
3. Prevent sensitive notifications/previews and limit plaintext lifetime, clipboard exposure, screenshots where platform controls permit.
4. Provide deliberate create/edit/organize/attach/trash vault flows only after unlock, including the reviewed transfer-to-vault preview and recovery state.

## Acceptance

- Locked screens reveal no sensitive preview content and cannot access decrypted records.
- Repeated PIN failure follows the documented recovery/retry policy.
- Biometric changes or device loss cannot silently bypass key enrollment controls.

## Verification and evidence

- Test physical-device biometric available/unavailable/changed, lock/resume, process death, and offline unlock.
- Review sensitive data in memory/storage/logs and complete recovery drills.

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

`feat(vault): add Android PIN and biometric unlock journeys`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
