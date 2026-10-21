# Phase 61: iOS platform parity and native adaptation

## Identity and scope

- **Phase ID/specification:** [Phase 61 — iOS platform parity and native adaptation](../roadmap/phases/61-ios-platform-parity-and-native-adaptation.md).
- **Status:** `blocked` / incomplete — iOS configuration and adapters delivered; **native Simulator/physical verification unexecuted** (Windows host, no Xcode).
- **Contributor and report date:** Cursor agent, 2026-10-21.
- **Base revision:** `8213a35` on `main`.
- **Prerequisites:**
  - Phase 03 complete (feasibility / ADRs 0009–0012).
  - Phase 60 remains **blocked** for live public Android+web release (local preflight/rehearsal + consolidation only). Owner explicitly authorized starting Phase 61 without inventing a live store release.
- **Included scope:** Expo iOS config, SQLCipher/Keychain/notification/device-id adapters, support matrix, Apple policy review dated 2026-10-21, Mac verification procedure, ADR 0058, automated config/parity tests.
- **Excluded:** App Store submission, TestFlight, paid Apple services, production vault/AI/Drive/chat/billing enablement, Phase 62.
- **Commit subject (adapted):** `feat(ios): adapt organizer for iOS pending native verification` — canonical completion subject withheld until physical/simulator acceptance passes.

## Result

- Reproducible iOS path documented in [ios-development.md](../engineering/ios-development.md); host inspection via `pnpm ios:path`.
- `apps/mobile/app.json`: bundle id, associated domains, microphone purpose string, encryption export flag, SQLCipher iOS, deployment target 15.1, secure-store plugin.
- Platform-aware notifications, sync device ids, Keychain WHEN_UNLOCKED writes, sheet keyboard/home-indicator padding, Android-only BackHandler.
- Explicit [ios-support-matrix.md](../engineering/ios-support-matrix.md) and [Apple policy review](../policy/apple-privacy-notifications-purchases-review-2026-10-21.md).
- ADR [0058](../decisions/0058-ios-platform-parity-and-native-adapters.md).

## Acceptance evidence

| Condition | Result |
|---|---|
| Core organizer + enabled modules pass iOS-specific journeys | **FAIL / unmet** — no Simulator or physical iOS run |
| Device enrollment, vault recovery if enabled, purchases respect Apple rules | Vault/purchases **disabled by gate**; enrollment code adapted, **unverified on device** |
| Explicit iOS support/feature matrix published | **Pass** — `docs/engineering/ios-support-matrix.md` |
| Physical VoiceOver / interruption / push / secure-storage / offline | **Unexecuted** |
| Apple privacy/notification/purchase primary-source review | **Pass (docs)** — dated 2026-10-21; not App Store filing |

### Commands

Environment: Windows 10/11, Node `v24.21.0`, pnpm `9.15.5`. No Xcode / `xcodebuild` / CocoaPods / iOS Simulator.

| Command | Exit | Status |
|---|---|---|
| `pnpm ios:path inspect` | 0 | PASS (config invariants) |
| `pnpm ios:path host-capability` | 0 | PASS — `canRunNativeIosBuild: false` |
| `pnpm ios:path write-evidence` | 0 | PASS — `artifacts/release/ios-path-inspection.json` |
| `npx vitest run tests/unit/mobile-ios-path.test.ts apps/mobile/src/platform/nativePlatform.test.ts tests/integration/phase61-ios-parity.test.ts` | 0 | PASS (8 tests) |
| `npx vitest run tests/integration/phase28-android-notifications.test.ts` | 0 | PASS (16 tests; Android regression) |
| `pnpm --filter @daynori/mobile typecheck` | 0 | PASS |
| `pnpm --filter @daynori/ui-mobile typecheck` | 0 | PASS |
| `pnpm validate:planning` | 0 | PASS (skip `.tools` / `artifacts` walk) |
| `pnpm audit:secrets` | 0 | PASS (2232 files) |
| `git diff --check` | 0 | PASS |
| `pnpm --filter @daynori/mobile prebuild:ios` / `expo run:ios` | — | **UNEXECUTED** (non-macOS) |
| Physical VoiceOver / Keychain / push | — | **UNEXECUTED** |

### Evidence lanes (kept separate)

| Lane | Result |
|---|---|
| Automated (Vitest / config) | Config + synthetic parity tests |
| Simulator | Not run |
| Physical device | Not run |
| Manual accessibility | Not run |

## Defects and limits

1. Phase 61 **incomplete** until Mac development-build journeys and physical VoiceOver/Keychain/notification/offline evidence exist.
2. Phases 59–60 remain blocked for live publication (reconciled: owner finished prior *local* release work and authorized Phase 61; do not invent a verified public release).
3. iOS push uses `expo_push` only; native APNs token type not added to DB/contracts.
4. Drive OAuth platform enum still `web|android`; Drive remains release-gated off.
5. Preserve: vault off, rooms/chat off, live AI off, production billing off, Phase 50 deferred.

## Documentation and Git review

- Updated: ios-development, ios-support-matrix, Apple policy review, ADR 0058, decisions README, CHANGELOG, progress.json, Phase 60 handoff note, core-consolidation status.
- Intended subject: `feat(ios): adapt organizer for iOS pending native verification`.

## Handoff

**Next action:** On a Mac with Xcode — `cd apps/mobile && pnpm prebuild:ios && pnpm ios`, then execute the physical-device checklist in `docs/engineering/ios-development.md`. Record device/OS/build outcomes in this report before considering acceptance.

**Scheduling note (2026-10-21):** Owner authorized Phase 62 *local preparation* while this phase remains blocked for native evidence. Phase 62 docs must not invent Simulator/device results. Do not submit to App Store until Phase 61 evidence and explicit publication authorization exist.
