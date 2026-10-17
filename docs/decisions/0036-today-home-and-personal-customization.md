# ADR-0036: Today Home Layout Personalization, Widget Versioning, and Privacy Redaction

## Status

Accepted (Phase 30 implementation verified across web and mobile platforms with typed domain invariants, bounded customization schemas, optimistic revision concurrency, privacy redactions for journal/vault items, and accessible reordering alternatives; physical Android accessibility talkback and production external services remain explicit blocked release gates).

## Context

Phase 30 establishes the Today view and personal home customization ([docs/roadmap/phases/30-today-home-and-personal-customization.md](../roadmap/phases/30-today-home-and-personal-customization.md)). The Today view serves as the calm daily organizer dashboard where authenticated users review routine occurrences, pending and overdue tasks, upcoming horizon summaries, quick capture actions, and optional recent activity and favorite folders.

Key architectural challenges and invariants addressed in this ADR:

1. **Approved Widget & Module Shortcut Registry**:
   - To prevent arbitrary script or markup injection and maintain structural stability, home widgets and navigation shortcuts are strictly limited to an approved closed registry:
     - Approved Widgets: `tasks`, `routines`, `upcoming_summary`, `quick_capture`, `journal_prompt`, `recent_items`, `favorite_folders`.
     - Approved Module Shortcuts: `today`, `plan`, `library`, `journal`, `notes`, `tasks`, `routines`, `calendar`, `files`, `knowledge`.
   - Any unknown, unapproved, or unreleased module identifiers (such as `vault`, `expenses`, `rooms`, `ai_copilot`) are discarded during normalization and schema validation without throwing exceptions or corrupting the user's stored preferences.

2. **Calm Default Home Baseline & Non-Demonstration Empty States**:
   - New accounts start with a small, calm default layout consisting of 5 visible cards (`tasks`, `routines`, `upcoming_summary`, `quick_capture`, `journal_prompt`) and 2 optional heavier cards (`recent_items`, `favorite_folders`) hidden by default.
   - Meaningful empty states are used instead of seeded mock demonstration content. Each card gracefully renders clean semantic empty states (e.g. "No tasks due today", "No routines scheduled for today") that encourage intentional user engagement.

3. **Data Non-Destruction Invariant**:
   - Customizing card visibility, reordering widgets, renaming labels, changing theme/density, or clicking "Restore Defaults" strictly affects presentation metadata only.
   - Home customization operations **never** delete or mutate canonical tasks, routines, routine occurrences, notes, folders, or files. Canonical records remain 100% intact across all customization operations.

4. **Sanitized Custom Display Labels & Bounded Properties**:
   - Custom widget display labels are validated and sanitized via `validateCustomLabel`:
     - Bounded between 1 and 40 characters; empty or whitespace-only strings revert to null (falling back to standard default labels).
     - `<script>` and `<style>` blocks (including their inner contents) as well as all HTML/XML tags are stripped to eliminate XSS risks.
     - Custom section script execution or user-supplied SQL is strictly prohibited.

5. **Optimistic Revision Concurrency & Unrelated Preferences Preservation**:
   - Layout customizations are stored in `app.profiles.preferences->>'homeLayout'` as part of `DisplayPreferences`.
   - Concurrency is protected using `expectedRevision`. Concurrent edits from multiple devices or browser tabs with stale revisions receive HTTP 409 Conflict, preventing accidental layout overwrites.
   - Preference updates employ partial merging in the repository layer, guaranteeing that updating layout or density never inadvertently wipes or replaces unrelated preferences such as `quietHours`, `theme`, or privacy settings.

6. **Privacy Redaction for Recent Items**:
   - On the shared Today view, sensitive content must not leak through recent item summaries or fallback previews:
     - `journal` entries have `bodyPreview` stripped (set to `null`) and titles normalized to generic `'Journal entry'` when privacy masking is active.
     - Unreleased or sensitive `vault` items are completely excluded from recent items on Today.
     - Fallback titles and accessible announcements never expose private diary content.

7. **Cross-Platform Responsive Semantics & Accessible Navigation**:
   - Semantic widget ordering and visibility are synchronized across web and mobile clients, but desktop pixel coordinates and absolute layouts are never forced onto mobile devices.
   - Drag-and-drop interactions are augmented with accessible, keyboard-operable and screen-reader-announced "Move Up" and "Move Down" controls with boundary protection.
   - High-contrast tokens conforming to WCAG 2.2 AA (`palette.status.danger`, `palette.action.primary`, `palette.text.primary`) ensure readability across light and dark modes.

## Consequences

- Users gain a personalized daily dashboard that adapts to their daily focus while preserving calm aesthetic principles.
- Layout synchronization across devices operates cleanly with deterministic conflict detection.
- Sensitive journal and vault records remain protected against accidental display or leakage on the home screen.
- Layout migrations tolerate legacy or unreleased modules safely without client-side crashes.
