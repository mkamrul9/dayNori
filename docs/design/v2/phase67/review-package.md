# Owner and usability review package

## Why this gate exists

Phase 67 acceptance and [docs/design/accessibility.md](../../accessibility.md) require:

1. Review with the **owner** and available usability participants; **record the chosen direction**.
2. Prototype gate: test core journeys with **at least five** prospective users (include enlarged-text or AT user where possible).

**Agent preference is not owner approval.** Fabricating participants is forbidden.

## Historical status (before owner decision)

Through the 2026-10-25 repair pass, Phase 67 remained **blocked** on unmet owner selection and unmet ≥5-participant sessions. Dual-phase work authorization alone was **not** treated as selection or waiver.

## Owner decision — 2026-10-25 (superseding)

**Source:** Owner chat message dated 2026-10-25 selecting Warm notebook and amending the participant gate.

| Gate | Status |
| --- | --- |
| Independent prototypes + docs + repair pass | Complete |
| Contrast helper (22 opaque pairs) | Pass (scoped calc only) |
| CDP capture + smoke under Node v24.21.0 | Capture `pass_capture_only` + smoke 11/11 |
| Manual visual inspection of captures | Representative Warm screens inspected |
| Owner direction selection | **Warm notebook** — recorded 2026-10-25 |
| ≥5 participant sessions | **Deferred to Phase 99** (explicit owner amendment). **Sessions did not occur.** Not claimed as completed testing. |
| Phase 67 complete in progress.json | Eligible under this scoped amendment |

### Scoped amendment (participant gate only)

The owner **explicitly deferred** the Phase 67 five-participant prototype usability sessions to **Phase 99**, before Version 2 release. This amendment:

- Applies **only** to that Phase 67 participant requirement.
- Does **not** waive other accessibility, security, recovery, or verification requirements.
- Does **not** invent participant results.
- Assigns the deferred validation obligation to **Phase 99** (release readiness).

## Uncoached tasks (for Phase 99 sessions)

Use synthetic data only. Moderator does not coach.

1. Save and reopen a note.
2. Distinguish a task from a routine on Plan.
3. Find an advanced feature via All features.
4. Hide and restore Journal; confirm three tabs.
5. Write a journal entry without accepting the prompt.
6. Find Help and resume/pause learning.
7. Recover from a simulated save/offline error.
8. Review and cancel an assistant proposal.

## Observation log template

| ID | Participant (anon) | Prototype rev | Task | Completed? | Assistance | Confusion | Severity | Proposed change | Retest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| U-001 | — | — | — | — | — | — | — | — | — |

Severity: blocked journey · significant friction · minor. **No rows completed for Phase 67.**

## Owner decision record

| Field | Value |
| --- | --- |
| Date | 2026-10-25 |
| Decision maker | Owner |
| Selected direction | **Warm notebook** |
| Participant gate | Explicitly deferred to **Phase 99** before V2 release; sessions did not occur |
| Source | Owner message 2026-10-25 (this chat); recorded in ADR 0069 and phase-67 report |
| Notes | Crisp utility remains archived as a fully prototyped alternate for reference |
| Signature / recorded by | Cursor agent from owner message |

Completion commit subject: `docs(design): establish the Version 2 visual and mobile direction`.
