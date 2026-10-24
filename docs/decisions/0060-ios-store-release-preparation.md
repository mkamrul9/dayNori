# ADR-0060: iOS store release preparation without invented native evidence

- Status: accepted (local preparation only).
- Date: 2026-10-21.
- Related: Phase 62; Phase 61 report; ADR 0058; [docs/release/ios/](../release/ios/README.md).

## Context

Phase 62’s roadmap acceptance requires TestFlight coverage and store readiness. Phase 61 explicitly lacks Simulator/physical verification. Inventing device results or screenshots would falsify the release gate.

## Decision

1. Deliver a complete **local** iOS release package under `docs/release/ios/` covering RC identity, signing requirements, TestFlight checklist, privacy/dependency drafts, support/deletion pointers, reviewer access draft, screenshot rules, and monitoring/recovery drafts.
2. Preserve Phase 61 status: native verification remains **unexecuted** until Mac/device evidence is attached.
3. Limit store claims to the enabled personal-organizer scope; keep vault/rooms/AI/Drive/StoreKit excluded.
4. Mark Phase 62 `blocked` until TestFlight evidence and owner-authorized store outcomes exist. Adapted commit subject — not the canonical “verified store readiness” subject — until acceptance passes.
5. Check Apple privacy/submission/TestFlight primary docs at preparation time (2026-10-21) and record URLs in the package README.

## Consequences

- Engineering can proceed on docs/checklists without Apple accounts.
- No App Store upload, TestFlight distribution, or paid services are authorized by this ADR.
- Phase 60 Android/web live publication remains a separate unmet gate.

## Verification and revisit

Revisit when Phase 61 native evidence lands, App Store Connect app exists, or Apple policy changes require label/capability updates.
