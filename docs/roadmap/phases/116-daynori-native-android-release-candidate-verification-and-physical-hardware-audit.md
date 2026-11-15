# Phase 116 — Daynori native Android release-candidate verification and physical hardware audit

Group: V2 quality and release. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [71 — Native Android interface and navigation parity](71-native-android-interface-and-navigation-parity.md)
- [106 — Daynori native Android interface refinement and component overhaul](106-daynori-native-android-interface-refinement-and-component-overhaul.md)
- [115 — Daynori voice-assistant audio memory cleanup correction and speech capture verification](115-daynori-voice-assistant-audio-memory-cleanup-correction-and-speech-capture-verification.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/mobile
- packages/ui-mobile
- docs/engineering
- docs/decisions
- docs/roadmap
- docs/phase-reports
- artifacts/phase116
- tests/e2e
- CHANGELOG.md

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Verify release-candidate artifact identity across apps/mobile/app.json, android/app/build.gradle, and packages/contracts: packageId com.daynori.app, targetSdk 36, compileSdk 36, minSdk 24, versionCode 1, versionName 2.0.0-candidate, Hermes, and React Native New Architecture (newArchEnabled=true).
2. Inspect and enforce fail-closed release signing architecture: daynoriReleaseSigningGuard in apps/mobile/android/app/build.gradle halts distributable release tasks when owner release keystore is unconfigured, preventing silent debug.keystore fallback.
3. Verify strict separation of debug APKs: app-debug-arm64.apk, app-debug-x86_64.apk, and app-embedded-x86_64.apk are signed with debug keystores and strictly barred from distribution as release builds.
4. Audit official Google Play policy compliance: target API 34+ requirement, Play App Signing Android App Bundle (.aab) format requirement, 64-bit architecture requirement (arm64-v8a), sensitive permissions exclusions (USE_EXACT_ALARM, MANAGE_EXTERNAL_STORAGE), and account deletion pathways.
5. Author docs/engineering/android-release-candidate-identity-and-signing.md and docs/engineering/android-talkback-verification-protocol.md defining candidate specifications and human TalkBack spoken listen-through protocols.
6. Execute and verify 7 e2e tests in tests/e2e/phase116-android-release-verification.test.ts and 9 mobile interaction journey tests in apps/mobile/src/phase116-native-android-journeys.test.ts covering sign-in and account switching isolation, local storage recovery, create/save/reopen lifecycle, offline restart, notifications, microphone behavior, landscape/large-text scaling, hardware Back navigation stack, and TalkBack accessibility contracts.
7. Truthfully record physical ARM64 hardware absence (adb devices -l empty) and unconfigured owner production keystore as blocked under DEF-V2-011 and OWNER-SIGNING-KEYS; keep emulator evidence separate.
8. Author ADR 0116, Phase 116 report, artifacts/phase116 package, update function register, progress.json, CHANGELOG.md, and rebuild blueprint.

## Acceptance

- Release-candidate artifact identity verified: packageId com.daynori.app, targetSdk 36, compileSdk 36, minSdk 24, versionCode 1, newArchEnabled true.
- Fail-closed release signing guard (daynoriReleaseSigningGuard) actively halts distributable release tasks when owner production keystore is unconfigured.
- Debug APKs (app-debug-arm64.apk, etc.) are strictly segregated as local test artifacts and never distributed as release builds.
- Current Google Play developer requirements verified against official documentation (Target API 36, App Bundle format, 64-bit, zero restricted exact alarm permissions, in-app/web account deletion).
- Comprehensive human TalkBack spoken verification protocol authored in docs/engineering/android-talkback-verification-protocol.md covering navigation chrome, forms, validation errors (accessibilityRole='alert'), modal containment (accessibilityViewIsModal=true), and focus return.
- Physical ARM64 smartphone absence and unprovisioned release keystore truthfully recorded as blocked under DEF-V2-011 and OWNER-SIGNING-KEYS; emulator evidence strictly separated.
- All 16 automated tests (7 e2e, 9 mobile journeys) pass cleanly.
- Standing release gates (DEF-V2-001, DEF-V2-004, DEF-V2-005, DEF-V2-007, DEF-V2-008, DEF-V2-011, DEF-V2-013, OWNER-SIGNING-KEYS, OWNER-RELEASE-AUTH, Phase 71) remain strictly blocked.
- docs/roadmap/plan.json, progress.json, and blueprint.html updated and pass all planning validators.

## Verification and evidence

- node scripts/validate-planning.mjs
- node scripts/build-phase-plans.mjs --check
- node scripts/build-blueprint.mjs --check
- pnpm validate:function-register
- node scripts/mobile-android-release-path.mjs inspect
- pnpm vitest run tests/e2e/phase116-android-release-verification.test.ts apps/mobile/src/phase116-native-android-journeys.test.ts
- pnpm --filter @daynori/mobile typecheck
- pnpm --filter @daynori/ui-mobile typecheck
- pnpm lint

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/roadmap/v2/README.md](../v2/README.md)
- [docs/decisions/0071-native-android-settings-hub-and-insets.md](../../decisions/0071-native-android-settings-hub-and-insets.md)
- [docs/decisions/0074-standing-phase71-scheduling-and-push.md](../../decisions/0074-standing-phase71-scheduling-and-push.md)
- [docs/decisions/0106-daynori-native-android-interface-refinement-and-component-overhaul.md](../../decisions/0106-daynori-native-android-interface-refinement-and-component-overhaul.md)
- [docs/decisions/0115-voice-assistant-audio-memory-cleanup-and-speech-capture-correction.md](../../decisions/0115-voice-assistant-audio-memory-cleanup-and-speech-capture-correction.md)
- [docs/decisions/0116-native-android-release-verification-and-physical-hardware-audit.md](../../decisions/0116-native-android-release-verification-and-physical-hardware-audit.md)
- [docs/phase-reports/phase-71.md](../../phase-reports/phase-71.md)
- [docs/phase-reports/phase-106.md](../../phase-reports/phase-106.md)
- [docs/phase-reports/phase-115.md](../../phase-reports/phase-115.md)
- [docs/phase-reports/phase-116.md](../../phase-reports/phase-116.md)
- [docs/engineering/android-release-candidate-identity-and-signing.md](../../engineering/android-release-candidate-identity-and-signing.md)
- [docs/engineering/android-talkback-verification-protocol.md](../../engineering/android-talkback-verification-protocol.md)
- [docs/engineering/release-gates.md](../../engineering/release-gates.md)

## Commit target

`test(android): verify release candidate signing and physical hardware release gates`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
