# Daynori Controlled Private Beta — Observation & Triage Protocol

This protocol defines the governance, device coverage matrix, issue classification, stop criteria, and widening gates for the Daynori Controlled Private Beta (Phase 38).

---

## 1. Beta Cohort & Device Matrix

The initial private beta is restricted to an authorized cohort of **15–30 participants**:

| Category              | Target Profile                            | Minimum Representation | Key Focus                                                 |
| :-------------------- | :---------------------------------------- | :--------------------- | :-------------------------------------------------------- |
| **Android Midrange**  | Android 10 – 12 (2–4 GB RAM)              | 5 devices              | Cold start <= 3s, memory footprint, offline queue replay  |
| **Android Flagship**  | Android 13 – 15 (6–12 GB RAM)             | 5 devices              | TalkBack screen-reader fluidity, notification dispatch    |
| **Web Desktop**       | Chrome / Edge / Firefox (macOS/Win/Linux) | 5 participants         | Keyboard shortcuts, layout reflow, large library browsing |
| **Web Mobile Safari** | iOS 16 – 18 Mobile Safari                 | 5 participants         | 320px reflow, touch targets, offline service worker       |

---

## 2. Structured Task Scenarios for Participants

Each participant executes the following core organizer scenarios during the observation period:

1. **Onboarding & First Capture**: Complete first-use onboarding, configure interests, capture a bilingual note.
2. **Daily Routine & Tasks**: Schedule a recurring routine, mark occurrences complete/skipped, undo an accidental check.
3. **Journal Reflection**: Write a private journal entry, review timeline display, verify zero draft leakage.
4. **File Organization**: Create nested folders, upload a PDF/image, move items, trash and restore.
5. **Offline Durability**: Turn on Airplane mode, capture a note and task, close the app, reopen, turn off Airplane mode, verify clean sync without data loss.
6. **Portability & Exit**: Export workspace to ZIP, review contents, request account deletion, verify confirmation prompt.

---

## 3. Issue Severity Classification

| Severity          | Definition                                                                            | Target Resolution SLA  | Release Gate Impact                  |
| :---------------- | :------------------------------------------------------------------------------------ | :--------------------- | :----------------------------------- |
| **P0 — Blocker**  | Data loss, RLS security bypass, crash on startup, sync corruption, privacy leak.      | Immediate (< 12 hours) | **STOPS BETA IMMEDIATELY**           |
| **P1 — Critical** | Core scenario blocked without workaround, failed export/import, broken push reminder. | 24 – 48 hours          | Blocks access widening               |
| **P2 — Major**    | Visual distortion, sluggish pagination (>300ms), non-fatal sync conflict prompt.      | Next scheduled build   | Tracked; evaluated for beta widening |
| **P3 — Minor**    | Typography flaw, minor translation wording, non-blocking cosmetic detail.             | Backlog triage         | Non-blocking                         |

---

## 4. Beta Stop & Abort Criteria

The private beta must be immediately paused, builds recalled, or traffic suspended if ANY of the following occur:

1. **Any confirmed P0 data loss** (unrecoverable draft loss or incorrect merge truncation).
2. **Cross-tenant data exposure** (a participant sees any item, tag, or file belonging to another user).
3. **Crash-on-launch rate exceeding 1%** across active sessions.
4. **Database corruption or migration failure** requiring manual ledger surgery.

---

## 5. Explicit Widening Criteria (Exit from Controlled Beta)

Access may be widened beyond the initial 30-participant cohort only when ALL of the following criteria are met and formally recorded:

- [ ] Zero open P0 or P1 defects across all tested devices.
- [ ] At least 14 days of sustained observation completed without stop-criteria triggers.
- [ ] Offline durability validated across 100+ simulated or real offline/online reconnect cycles.
- [ ] Account deletion & disaster recovery verified end-to-end on beta infrastructure.
- [ ] Owner approval with signed release authorization record in `docs/security/approvals/`.
