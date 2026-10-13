# Phase 61 — iOS platform parity and native adaptation

Group: iOS. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [60 — Public Android and web release](60-public-android-and-web-release.md)
- [03 — Platform and integration feasibility spikes](03-platform-and-integration-feasibility-spikes.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/mobile ios
- packages/ui-mobile
- tests/e2e mobile
- docs/engineering

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Configure Apple development prerequisites and validate Expo native modules on supported physical iOS devices.
2. Adapt navigation, file/recording permissions, biometric key behavior, notification scheduling, safe areas, and platform purchase flows.
3. Document feature parity and unsupported capabilities honestly; never assume Android exact-alarm behavior transfers.

## Acceptance

- Core organizer and all intended enabled modules pass iOS-specific journeys.
- Device enrollment, vault recovery if enabled, and purchases respect Apple platform rules.
- An explicit support/feature matrix is published for iOS.

## Verification and evidence

- Run physical-device VoiceOver, interruption, push, secure-storage, recording, upgrade, and offline tests.
- Check current Apple privacy/purchase/notification requirements with primary references at implementation time.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/engineering/quality.md](../../engineering/quality.md)
- [docs/engineering/release-gates.md](../../engineering/release-gates.md)

## Commit target

`feat(ios): adapt organizer workflows and verify platform parity`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
