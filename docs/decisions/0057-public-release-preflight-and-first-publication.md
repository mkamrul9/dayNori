# ADR-0057: Public release preflight and first Play publication

- Status: accepted (local preparation / rehearsal only).
- Date: 2026-10-21.
- Related: Phase 60; ADR 0056; [release-gates](../engineering/release-gates.md); [public-release-publication runbook](../engineering/runbooks/public-release-publication.md).

## Context

Phase 60’s roadmap text mentions staged rollout. Google Play’s percentage staged rollouts apply to **app updates**, not first publication ([Play staged rollouts](https://support.google.com/googleplay/android-developer/answer/6346149), checked 2026-10-21). Release eligibility also cannot be inferred from a valid provisional manifest JSON alone.

Stale generated `android/` trees can still silently debug-sign release builds; Expo `app.json` SDK settings are not artifact evidence.

## Decision

1. **Executable preflight** (`scripts/release-preflight.mjs`) fail-closes on missing/stale evidence, placeholders, contradictory flags, failed Android inspection, and always leaves human launch authorization **BLOCKED**. Successful local rehearsal never grants OA or initiates publication.
2. **Authoritative Android path**: Expo prebuild + `withReleaseSigningGuard` (task-graph fail-closed). Inspect generated Gradle via `scripts/mobile-android-release-path.mjs`. Reject silent debug fallbacks and `DAYNORI_ALLOW_DEBUG_RELEASE_SIGNING` for eligibility.
3. **First publication workflow**: use testing tracks / first production release as supported by the Play account; reserve percentage staged rollouts for **subsequent updates**. Roadmap “staged rollout” means controlled exposure (tracks / later %-updates), not a first-release %-slider.
4. Phase 60 remains **incomplete/blocked** until an approved Android build and matching web release are live at intended destinations.

## Consequences

- Preserve vault off, rooms/chat off for real users, live AI off, production billing off, Phase 50 deferred, Phase 49 live Google pending.
- Owner later selected Phase 61 for iOS adaptation; Phase 60 live-publication acceptance remains unmet.
- Do not create a public release tag without separate explicit owner authorization.
