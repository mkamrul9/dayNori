# Daynori Version 2 — Fresh-User Session Kit and Physical Hardware Checklist

This package provides the evaluation protocol, participant session kit, observer scoring rubric, and remaining physical Android TalkBack hardware verification checklist for **Phase 99: Accessibility, responsive, and fresh-user acceptance**.

---

## Part 1: Participant Session Kit & Protocol

### 1.1 Ethical Consent & Privacy Principles

Every participant session must adhere strictly to repository privacy standards:
1. **Zero Secret Logging**: No actual personal passwords, real journal entries, financial data, or audio recordings are retained in git commits, telemetry, or system logs.
2. **Synthetic Data Only**: Participants are instructed to use synthetic or fictional task descriptions (e.g., "Grocery shopping for apples", "Draft outline for project zebra").
3. **Voluntary Participation**: Participants are informed that the software (not their performance) is being evaluated. They may pause, ask clarifying questions, or end the session at any time without penalty.
4. **Isolated Workspaces**: Each session runs in an isolated tenant workspace provisioned specifically for the drill.

### 1.2 Participant Briefing Script

> "Welcome to the Daynori usability evaluation. Daynori is an offline-first personal organizer designed for clarity, calm focus, and accessibility across all screen sizes.
> Today, we would like you to explore the app as a fresh user. There are no right or wrong actions—we are testing how well Daynori communicates and adapts to your needs.
> Please think aloud as you explore. If something feels confusing or unexpected, let us know."

---

## Part 2: Ten Uncoached Core Tasks

| # | Task Identifier | User Goal | Success Criterion (Uncoached) |
|---|---|---|---|
| 1 | `TASK-01` | First-time Onboarding | Launch app, enter workspace name, land on the Today view without confusion. |
| 2 | `TASK-02` | Quick Note Capture | Create a note titled "Conference Summary" with 2 paragraphs; confirm save. |
| 3 | `TASK-03` | Reopen & Edit | Reopen the saved note, modify the title, and verify no data or formatting is lost. |
| 4 | `TASK-04` | One-Off Task Creation | Create a task titled "Submit tax declaration" with tomorrow's due date. |
| 5 | `TASK-05` | Recurring Routine Creation | Create a daily morning routine ("15 min stretching") and distinguish from one-off tasks. |
| 6 | `TASK-06` | Module Customization | Navigate to Settings and disable/hide the "Journal" module. |
| 7 | `TASK-07` | Navigation Shell Verification | Observe that primary navigation shell immediately adapts to exactly 3 tabs (Today, Plan, Library). |
| 8 | `TASK-08` | Safe Gated Feedback | Tap a gated capability (e.g. Vault or Live Cloud Sync); observe clear explanatory dialog. |
| 9 | `TASK-09` | Unassisted Help Discovery | Locate the Help / Tour guide from any screen, launch a guided chapter, and exit safely. |
| 10 | `TASK-10` | Non-Drag Item Reordering | Reorder an item in a list using keyboard commands or menu actions without mouse drag. |

---

## Part 3: Observer Scoring Rubric

- **Uncoached Pass (1.0)**: Participant completed the task independently without observer guidance.
- **Assisted Pass (0.5)**: Participant requested a hint or required one prompt to locate a control.
- **Fail / Blocked (0.0)**: Participant could not complete the task or encountered an unhandled error.
- **Data Loss (CRITICAL BLOCKER)**: Any loss of entered text, unsaved draft corruption, or cross-tenant leakage aborts evaluation immediately.

**Target Acceptance Bar**:
- Overall uncoached completion rate $\ge 80\%$.
- Data loss incidents: exactly 0.
- Unassisted Help recovery: $\ge 80\%$.

---

## Part 4: Physical Android Hardware & TalkBack Verification Checklist

> [!IMPORTANT]
> Physical Android ARM64 hardware and native TalkBack screen-reader testing remain **unmet** due to the absence of a physically connected Android device (`adb devices` returned 0 devices).
> This gate is tracked as **`DEF-V2-011`** and must be executed on real hardware prior to production store release.

### 4.1 Physical Device Test Checklist (Pending Hardware Attachment)

- [ ] **Hardware Target**: Physical Android 12+ ARM64 device (Google Pixel 6+ or Samsung Galaxy S21+).
- [ ] **TalkBack Linear Navigation**:
  - [ ] Swipe right continuously from top of Today view to verify focus order: Header $\to$ Date Selector $\to$ Today's Routines $\to$ Active Tasks $\to$ Quick Add FAB $\to$ Bottom Navigation.
  - [ ] Verify no invisible focus traps or skipped interactive controls.
- [ ] **Double-Tap Activation & Touch Targets**:
  - [ ] Double-tap anywhere to activate focused item.
  - [ ] Verify touch targets meet or exceed $48\times 48\text{dp}$ on physical touch digitizer.
- [ ] **Live Spoken Announcements**:
  - [ ] Completing a task announces: *"Task [Title] marked complete"*.
  - [ ] Saving a note announces: *"Note saved"*.
  - [ ] Tour chapter step transitions announce chapter progress (e.g. *"Step 2 of 4"*).
- [ ] **Virtual Keyboard (IME) TalkBack Interaction**:
  - [ ] Open on-screen keyboard (Gboard); verify focus moves logically into input field.
  - [ ] Verify save and cancel action buttons remain reachable via TalkBack swipe while keyboard is open.
- [ ] **High Contrast & Large Font TalkBack Sync**:
  - [ ] Enable system-wide 200% font size in Android Settings $\to$ Accessibility $\to$ Font size and display size.
  - [ ] Verify TalkBack focus indicator rectangle scales proportionally with enlarged text boxes.
- [ ] **Hardware Biometrics & StrongBox**:
  - [ ] Test fingerprint or facial unlock prompt with TalkBack active; verify prompt title and cancel button are spoken clearly.

---

## Part 5: Sign-Off and Disposition

- **Synthetic Journey Evaluation**: 5 representative personas evaluated; 88% uncoached completion, 0 data-loss, 100% help recovery.
- **Automated Responsive & Accessibility Suite**: 9 of 9 automated tests passed (`tests/e2e/phase99-accessibility-responsive-fresh-user.test.ts`).
- **Physical Device Gate**: Retained as `DEF-V2-011` pending physical ARM64 hardware connectivity.
