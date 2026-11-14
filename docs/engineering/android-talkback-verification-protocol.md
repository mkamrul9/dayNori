# Daynori Android TalkBack Screen-Reader Verification Protocol and Spoken Listen-Through Checklist

**Phase:** Phase 116 — Daynori Native Android Release-Candidate Verification and Physical Hardware Audit  
**Date:** 2026-11-14  
**Status:** **SPECIFIED; BLOCKED PENDING PHYSICAL ARM64 HARDWARE AND HUMAN EAR AUDIT (`DEF-V2-011`)**

---

## 1. Executive Summary & Objective

Accessibility is a non-negotiable core invariant of the Daynori organizer. Automated layout hierarchy dumps (`adb exec-out uiautomator dump`) verify XML attributes (`accessibilityLabel`, `accessibilityRole`, `accessibilityState`), but **cannot substitute for a human ear audit of spoken TalkBack announcements**.

This document defines the authoritative spoken audio verification protocol and checklist for human testers evaluating Daynori on physical ARM64 Android smartphones. It covers five critical accessibility domains:
1. Navigation chrome (headers, bottom tabs, subviews).
2. Form fields and entity selector chips.
3. Live validation errors and alert announcements (`accessibilityRole="alert"`).
4. Explicit confirmation dialogs and modal containment (`accessibilityViewIsModal`).
5. Accessibility focus return upon sheet/dialog dismissal.

---

## 2. Hardware and Testing Setup Prerequisites

| Parameter | Required Value | Notes |
|---|---|---|
| **Device Model** | Physical ARM64 Android Smartphone (e.g. Google Pixel 7/8/9, Samsung Galaxy S23/S24) | Emulators are prohibited for spoken audio verification |
| **Android Version** | Android 14 (API 34) or Android 15 (API 35) | Production target baseline |
| **Accessibility Suite** | Android Accessibility Suite v14.0+ / Google TalkBack | Current Google Play version |
| **Speech Engine** | Google Speech Services (Speech Recognition & Synthesis) | Default Android TTS engine |
| **Audio Output** | Built-in device speaker or wired/Bluetooth headphones | Audible volume $\ge 50\%$ |
| **Speech Rate / Pitch** | Normal (1.0x rate, 1.0x pitch) | Default user accessibility settings |
| **Touch Mode** | Explore by touch + single-finger swipe navigation | Standard TalkBack navigation gestures |

---

## 3. The 5 Spoken Audio Verification Sections

### Section 1: Navigation Chrome & Header Actions
Verify that every navigation element speaks its role, accessible name, and current selection state clearly without truncating or speaking unexpanded identifiers:

| UI Element | TestID | Expected Spoken TalkBack Announcement | Expected Gesture / State |
|---|---|---|---|
| **Search Button** | `header-search-btn` | *"Search organizer, button. Double-tap to activate."* | Single tap focuses; double tap opens Search sheet |
| **Assistant Button** | `header-assistant-btn` | *"Ask Nori assistant (Gated under DEF-V2-008), button. Double-tap to activate."* | Single tap focuses; double tap opens Assistant sheet |
| **Create Button** | `header-create-btn` | *"Create item, button. Double-tap to activate."* | Single tap focuses; double tap opens Create sheet |
| **Settings Button** | `header-settings-btn` | *"Settings and help, button. Double-tap to activate."* | Single tap focuses; double tap opens Settings hub |
| **Today Tab** | `nav-tab-today` | *"Today tab, selected, 1 of 4. Double-tap to activate."* | Announces `selected` state and index |
| **Plan Tab** | `nav-tab-plan` | *"Plan tab, not selected, 2 of 4. Double-tap to activate."* | Announces `not selected` state |
| **Library Tab** | `nav-tab-library` | *"Library tab, not selected, 3 of 4. Double-tap to activate."* | Announces `not selected` state |
| **Journal Tab** | `nav-tab-journal` | *"Journal tab, not selected, 4 of 4. Double-tap to activate."* | Announces `not selected` state |

---

### Section 2: Forms, Inputs, and Entity Selector Chips
Inspect the `CreateSheet` form flow. Ensure TalkBack announces input types, current values, and character limits:

| Form Element | TestID | Expected Spoken TalkBack Announcement | Invariant |
|---|---|---|---|
| **Task Pill Chip** | `create-type-task` | *"Item type Task, selected, button. Double-tap to activate."* | Announces selected item type |
| **Routine Pill Chip** | `create-type-routine` | *"Item type Routine, not selected, button. Double-tap to activate."* | Announces unselected item type |
| **Note Pill Chip** | `create-type-note` | *"Item type Note, not selected, button. Double-tap to activate."* | Announces unselected item type |
| **Journal Pill Chip** | `create-type-journal` | *"Item type Journal, not selected, button. Double-tap to activate."* | Announces unselected item type |
| **Title Edit Box** | `create-title-input` | *"Title, edit box. Give your task a clear title. Double-tap to edit text."* | Reads label + hint placeholder |
| **Details Edit Box** | `create-details-input` | *"Details or Notes (optional), edit box. Add tags, deadlines, or additional context. Double-tap to edit text."* | Reads multiline field |
| **Voice Memo Button** | `create-voice-btn` | *"Record voice memo, button. Double-tap to activate."* | Decoupled audio option |
| **Submit Button** | `create-submit-btn` | *"Create Task, button. Double-tap to activate."* | Dynamic label reflects selected type |
| **Cancel Button** | `create-cancel-btn` | *"Cancel item creation, button. Double-tap to activate."* | Closes sheet without writes |

---

### Section 3: Live Validation Errors and Alerts
Triggering form submission with an empty title must generate an immediate audible alert:

1. **Submission Action**: Focus `create-submit-btn` with empty title input; double-tap.
2. **Immediate Alert Announcement**: TalkBack must immediately interrupt and speak:
   > *"Please provide a title for the item, alert."*
   *(Enforced by `<Text accessibilityRole="alert">` in `MobileTextField.tsx`)*.
3. **Re-focused Input Announcement**: Navigating back to the Title field must speak:
   > *"Title, error: Please provide a title for the item, edit box."*
4. **Error Dismissal**: Typing a character into the field immediately clears the error state and suppresses the alert announcement.

---

### Section 4: Modal Containment and Confirmation Dialogs
Verify modal focus trapping and critical action confirmations:

1. **Modal Containment (`accessibilityViewIsModal={true}`)**:
   - When `CreateSheet`, `SettingsHubView`, or `AssistantSheet` is visible, swiping backwards past the sheet header must **never** escape the sheet to read background content on `TodayView`.
   - Focus is strictly trapped inside the modal container.
2. **Backdrop Dismissal**:
   - Tapping the scrim outside the sheet announces *"Dismiss sheet, button. Double-tap to activate."*
3. **Confirmation Dialogs**:
   - Deleting an account (`MobileAccountDeletionSheet`): Speaks *"Delete account confirmation, dialog. Are you sure you want to permanently delete your account? All notes and tasks will be erased."*
   - Discarding an active draft: Speaks *"Discard draft, alert. You have unsaved changes. Discard or Keep editing?"*

---

### Section 5: Accessibility Focus Return
Upon dismissing any overlay, accessibility focus must return predictably to the element that triggered it:

```
[Main Screen]                             [Modal Sheet]
Header: [Create Button] ----(tap)-------> [CreateSheet]
          ^                                  |
          |                                  |
          +-------(Cancel / Back)------------+ (Focus returns to Create Button)
```

1. **Create Sheet Dismissal**: Dismissing via Cancel button or Hardware Back button must restore accessibility focus directly to `header-create-btn`.
2. **Settings Hub Dismissal**: Dismissing via Close button or Hardware Back button must restore accessibility focus directly to `header-settings-btn`.
3. **Search Sheet Dismissal**: Dismissing via Close button or Hardware Back button must restore accessibility focus directly to `header-search-btn`.
4. **Nested Settings Navigation**: Dismissing a nested setting (e.g. Appearance) must return focus to the originating row in `SettingsHubView` (`settings-group-appearance`).

---

## 4. Human Listen-Through Execution Protocol & Log Template

When an authorized human tester conducts this review on physical hardware, they must log their findings in the table below:

| Checklist Item | Device Model / OS | Spoken Text Heard by Ear | Pronunciation / Cadence | Focus Return OK? | Result (PASS / FAIL) | Tester Signature |
|---|---|---|---|---|---|---|
| **NAV-01: Header Search** | *Pixel 8 / Android 15* | *"Search organizer, button"* | Clear, natural pause | N/A | **[ ] PENDING** | Pending human audit |
| **NAV-02: Header Assistant** | *Pixel 8 / Android 15* | *"Ask Nori assistant (Gated under DEF-V2-008), button"* | Clear, speaks gate ID | N/A | **[ ] PENDING** | Pending human audit |
| **NAV-03: Header Create** | *Pixel 8 / Android 15* | *"Create item, button"* | Clear | Returns from sheet | **[ ] PENDING** | Pending human audit |
| **NAV-04: Header Settings** | *Pixel 8 / Android 15* | *"Settings and help, button"* | Clear | Returns from hub | **[ ] PENDING** | Pending human audit |
| **NAV-05: Bottom 4 Tabs** | *Pixel 8 / Android 15* | Speaks selected/not selected & 1-of-4 | Clean tab role | N/A | **[ ] PENDING** | Pending human audit |
| **FORM-01: Type Chips** | *Pixel 8 / Android 15* | Speaks item type + selection state | Responsive | Focusable | **[ ] PENDING** | Pending human audit |
| **FORM-02: Title Input** | *Pixel 8 / Android 15* | Speaks label + hint placeholder | Natural cadence | Retains IME | **[ ] PENDING** | Pending human audit |
| **ERR-01: Empty Title Alert** | *Pixel 8 / Android 15* | *"Please provide a title for the item, alert"* | Immediate speech interruption | Sets error state | **[ ] PENDING** | Pending human audit |
| **MOD-01: Modal Trapping** | *Pixel 8 / Android 15* | Swipe does not escape sheet boundary | Focus trapped | Scrim accessible | **[ ] PENDING** | Pending human audit |
| **FOC-01: Focus Return** | *Pixel 8 / Android 15* | Dismiss returns focus to trigger | Accurate | Verified | **[ ] PENDING** | Pending human audit |

---

## 5. Current Release Gate Status

Because no physical ARM64 hardware or human tester is attached in this test runner environment:
- **`DEF-V2-011`**: **BLOCKED** — Physical ARM64 smartphone testing and spoken TalkBack ear listen-through remain uncertified.
- Local test execution is recorded strictly as emulator/headless verification.
