# ADR-0081: Advanced recovery and optional-feature tour coverage

- Status: accepted (implementation); acceptance evidence for real UI journeys tracked separately in the phase report.
- Date: 2026-11-05.
- Owner/reviewer: Antigravity agent (owner-authorized Phase 81).
- Related: [Phase 81](../roadmap/phases/81-advanced-recovery-and-optional-feature-tour-coverage.md), [ADR 0079](0079-action-verified-resumable-tour-engine.md), [ADR 0080](0080-everyday-guided-practice-chapters.md), [guided-tours.md](../roadmap/v2/guided-tours.md), [function-register.json](../roadmap/v2/function-register.json).
- Supersedes/superseded by: none. Extends ADR 0079 and ADR 0080; does not waive Phase 71/75/80/99 gates.

## Context

Phase 80 established everyday guided practice chapters (starter, navigation, personalization, tasks, routines, calendar, notes, journal, search, and help return). However, the full application function inventory includes advanced capabilities (attachments, audio recordings, expense logging, approved custom sections, offline recovery, and Trash restoration), unreleased capability-gated features (reminders, cryptographic vault, Google Drive sync, rooms, billing, and AI assistant), and irreversible/sensitive actions (account deletion, real purchases, member invitations, and recovery secrets).

Learning must never require destructive, financial, or privacy-compromising operations:
1. No user should be forced to delete their account, make a financial payment, disclose passphrases, or send external invitations just to finish a guided tour.
2. Unreleased features must not launch simulated or fake live practice that fabricates system state.
3. Every inventory action in `docs/roadmap/v2/function-register.json` must map to a real tour chapter/step, an explicit safe explanatory treatment, or a dormant capability-gated definition.

## Options Considered

1. **Simulate all features with fake client-side mocks** — rejected. Faking payments, invitations, or vault encryption without genuine platform capabilities creates false mental models, risks accidental real charges, and violates acceptance criteria.
2. **Omit unreleased and sensitive features from tours entirely** — rejected. Leaves gaps in learning coverage and violates the requirement that every inventory action maps to guided guidance.
3. **Structured tiering: Available Advanced Practice + Fail-Closed Gated Chapters + Safe Explanatory Treatments (chosen)** — extends the action-verified engine with clear capability gates, safe non-destructive treatments, and complete function register coverage.

## Decision

- **Available Advanced Practice Chapters**:
  - `tour.files-audio`: action-verified file reservation, upload, audio attachment, and durable receipt correlation.
  - `tour.expenses`: exact money string validation, currency code, category assignment, and durable expense receipt.
  - `tour.custom-sections`: approved schema composition (field collection, checklist blocks), layout mode, and section receipts.
  - `tour.offline-sync`: inspection of safe conflict resolution and offline queue replay without data loss.
  - `tour.trash-recovery`: soft-deletion, Trash view, item restoration, and preserved timestamps.

- **Dormant Capability-Gated Chapters**:
  - `tour.reminders-gated`, `tour.vault-gated`, `tour.drive-gated`, `tour.rooms-gated`, `tour.billing-gated`, `tour.assistant-gated`.
  - Marked with `isGated: true` and excluded from `listRunnableTourChapterIds()`.
  - Gated chapters fail closed on `start` control via `applyTourControl`, returning `{ ok: false, code: 'feature_gated' }`. Unavailable features cannot launch fake live practice. Owning feature phases activate and verify them.

- **Safe Explanatory Treatments**:
  - `tour.account-deletion-safe`: explains multi-stage deletion confirmation, grace periods, and irreversibility without deleting accounts.
  - `tour.recovery-secrets-safe`: teaches zero-knowledge recovery passphrase backup without disclosing or requiring real passphrases.
  - `tour.billing-safe`: previews plan tiers and feature comparisons without prompting for payment cards or creating real charges.
  - `tour.sharing-safe`: previews workspace roles (owner, admin, member, viewer) without sending live emails or invitations.

- **Selective Cleanup and Provenance Safeguards**:
  - Extended `TourPracticeArtifactSchema.entityType` to include `'file' | 'expense' | 'custom_section'`.
  - `listCleanupCandidates` strictly filters out user-owned items (`a.userOwned: true`), ensuring personal user content is never presented as a candidate for deletion review.

- **Complete Inventory Coverage**:
  - Mapped all 109 inventory actions across 22 families in `docs/roadmap/v2/function-register.json` to real tour definitions, safe explanatory treatments, or gated definitions. Validated cleanly via `pnpm validate:function-register`.

## Consequences

- The guided practice catalog now contains 25 typed chapters covering 100% of the function register.
- Help Learn UI displays runnable advanced tours alongside everyday tours, while retaining `coming_later` and `gated_unavailable` indicators for future integrations.
- Physical device and spoken review gates remain honestly marked `unmet` until physical testing environments are available.
