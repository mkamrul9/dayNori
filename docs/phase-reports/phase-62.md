# Phase 62: iOS store release gate (local preparation)

## Identity and scope

- **Phase ID/specification:** [Phase 62 — iOS store release gate](../roadmap/phases/62-ios-store-release-gate.md).
- **Status:** `blocked` / incomplete — local release package prepared; **no** TestFlight, App Review, or live App Store availability.
- **Contributor and report date:** Cursor agent, 2026-10-21.
- **Base revision:** icon cleanup `5143c99` (Phase 61 `c98b8e9`).
- **Prerequisites:**
  - Phase 61 **blocked** — adapters/config only; Simulator/physical evidence **unexecuted** (preserved; not invented).
  - Phase 58 remains blocked/provisional for production capacity/ops ownership.
- **Included:** `docs/release/ios/*` package, ADR 0060, Apple primary-source review dated 2026-10-21, owner action list.
- **Excluded:** App Store upload, TestFlight distribution, paid Apple services, StoreKit activation, gated module enablement, Phase 63.
- **Commit subject (adapted):** `chore(ios-release): prepare local App Store package pending native evidence` — canonical completion subject withheld.

## Result

Concrete release package at [docs/release/ios/README.md](../release/ios/README.md): RC identity/build, signing, TestFlight checklist, privacy/dependencies, support/deletion, reviewer access, screenshot rules (unverified), monitoring/recovery, enabled-scope exclusions, owner actions.

## Acceptance evidence

| Condition | Result |
|---|---|
| TestFlight evidence covers supported devices + enabled scope | **FAIL / unmet** |
| Store approval / live availability recorded | **FAIL / unmet** |
| No incomplete platform feature advertised as supported | **Pass (docs)** — enabled-scope + matrix exclude gated modules |
| iOS release-build smoke / upgrade / a11y / purchase checks | **UNEXECUTED** (no Mac archive; purchases disabled) |
| Current App Store policies checked | **Pass (docs)** — 2026-10-21 primary URLs in package README |

### Commands

Environment: Windows, Node `v24.21.0`, pnpm `9.15.5`. No Xcode.

| Command | Exit | Status |
|---|---|---|
| `pnpm ios:path inspect` | 0 | PASS (config only) |
| `pnpm ios:path host-capability` | 0 | `canRunNativeIosBuild: false` |
| `pnpm icons:check` | 0 | PASS (prior icon commit) |
| `pnpm validate:planning` | 0 | PASS |
| `pnpm audit:secrets` | 0 | PASS |
| `git diff --check` | 0 | PASS |
| TestFlight upload / App Review submit | — | **UNEXECUTED** |
| iPhone screenshots from app | — | **NOT CAPTURED** (forbidden to fabricate) |

## Defects and limits

1. Phase 62 incomplete until TestFlight + store outcomes exist with Phase 61 native evidence.
2. Phases 59–61 live/native gates remain unmet.
3. Domains, legal entity, support inbox, Apple membership: owner.
4. Preserve gated modules off.

## Documentation and Git review

- ADR 0060; release package; CHANGELOG; progress.json.
- Intended subject: `chore(ios-release): prepare local App Store package pending native evidence`.

## Handoff

**Next action:** owner Mac verification for Phase 61, then follow [owner-actions.md](../release/ios/owner-actions.md). **Stop before Phase 63.**
