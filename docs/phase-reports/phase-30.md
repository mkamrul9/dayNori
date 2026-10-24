# Phase 30: Today home and personal customization

Group: Personal organizer and private beta. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [30 — Today home and personal customization](../roadmap/phases/30-today-home-and-personal-customization.md)
- **Status:** `blocked` (Software implementation, web TodayView, mobile TodayView, approved widget/shortcut registry, label sanitization, optimistic revision concurrency, privacy redaction, and 13 integration tests verified locally; completion status recorded as `blocked` in `docs/roadmap/progress.json` due to prerequisite physical Android TalkBack / KeyStore hardware gates and external production provider push services).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-17.
- **Base Git revision and branch:** `1e3e4a2` on `main`.
- **Prerequisites:**
  - [Phase 23 — Journal writing and reflection experience](phase-23.md): Reflection prompts and entry creation.
  - [Phase 25 — Files and previews](phase-25.md): Safe file metadata and binary preview validation.
  - [Phase 26 — Calendar views and deadline projections](phase-26.md): Calendar dates and deadline calculations.
  - [Phase 28 — Android notifications and alarms](phase-28.md): Native notification coordination and device lifecycle.
  - [Phase 29 — Web reminder delivery and PWA support](phase-29.md): Web push lifecycle, VAPID security, and PWA caching.
- **Included scope:**
  - **Today View Core Architecture (`apps/web/src/components/TodayView.tsx`, `apps/mobile/src/views/TodayView.tsx`)**:
    - Connected real authenticated data across both web and mobile environments:
      - Routine occurrences scheduled for today with independent action controls (Done, Skip, Reopen, and Undo).
      - Tasks due today, with collapsible overdue tasks section displaying counts and explicit deadlines.
      - Upcoming 7-day summary calculating future deadlines and scheduled routines without clutter.
      - Quick capture action bar for rapid item, task, routine, or note creation.
      - Optional recent items summary across notes, tasks, routines, and files with strict privacy redaction.
      - Optional favorite folders section with safe fallback for unpinned or deleted folders.
      - Daily reflection prompt with quick capture action, strictly suppressing body preview snippets.
    - Calm default home baseline: New accounts start with 3 to 5 visible cards (`tasks`, `routines`, `upcoming_summary`, `quick_capture`, `journal_prompt`), while heavier cards (`recent_items`, `favorite_folders`) remain optional and hidden by default.
    - Meaningful empty states: Avoids seeded demo content; renders clean, actionable empty states for each card.
  - **Versioned Personalization Metadata (`packages/domain/src/home.ts`, `packages/contracts/src/api/user.ts`)**:
    - Modeled `HomeLayout` (version 1) holding `density` (`'comfortable' | 'compact'`), `widgets: HomeWidgetConfig[]`, `moduleShortcuts: ModuleShortcutConfig[]`, and `favoriteFolderIds: string[]`.
    - Enforced closed registry of approved widgets (`APPROVED_HOME_WIDGET_IDS`) and shortcuts (`APPROVED_MODULE_SHORTCUT_IDS`).
    - Input sanitization (`validateCustomLabel`): Custom display labels are bounded to 1-40 characters, stripping script/style blocks and HTML tags to prevent XSS. User-supplied script or SQL execution is strictly prohibited.
    - Migration & normalization (`sanitizeAndMigrateHomeLayout`): Safely drops unreleased or unapproved identifiers (`vault`, `expenses`, `rooms`, `ai_copilot`), restores missing approved cards, deduplicates folder UUIDs, and normalizes order indices.
    - Accessible reordering helpers (`reorderWidgets`, `reorderModuleShortcuts`): Provide deterministic swap logic with boundary protection as accessible alternatives to drag-and-drop.
  - **Persistence, Concurrency & Unrelated Preferences Preservation (`apps/api`, `packages/api-client`)**:
    - Added `homeLayout` to `DisplayPreferencesSchema` and `UpdatePreferencesRequestSchema`.
    - Integrated optimistic concurrency in `updateProfilePreferences`: Updates check `expectedRevision`, returning HTTP 409 Conflict upon stale revision collisions.
    - Repository layer shallow-merges updated preferences with current preferences, ensuring that customizing layout or density never wipes unrelated preferences like `quietHours`, `theme`, or privacy settings.
  - **Privacy Redaction & Safety Boundaries**:
    - Implemented `filterRecentItemsForPrivacy`: Strips body previews from journal entries, forces fallback title to generic `'Journal entry'`, and strictly excludes sensitive or unreleased vault items from the Today home.
    - Restore Defaults Invariant: Restoring default layout resets display preferences only and **never** deletes or alters canonical tasks, routines, notes, files, or folders.

## Verification results

1. **Automated Integration Suite (`tests/integration/phase30-today-home.test.ts`)**:
   - 13/13 tests passing:
     - Calm small default layout (5 visible cards) for new accounts.
     - New profile preferences reflect defaults and preserve quietHours.
     - Malicious `<script>` tags and HTML sanitized from custom labels.
     - Accessible Move Up and Move Down alternatives reorder widgets cleanly with boundary bounds.
     - Reordering module shortcuts functions with boundary checks.
     - Persisting customized layout via PATCH `/v1/users/me/preferences` preserves `quietHours` and theme.
     - Concurrent layout updates with stale revision reject with HTTP 409 Conflict.
     - Multi-session client synchronization reflects identical updated home layout.
     - Privacy filter strips journal body previews, normalizes titles, and excludes vault items.
     - Migration safely discards unreleased/unapproved module IDs (`vault`, `expenses`, `ai_copilot`).
     - Gracefully tolerates deleted favorite folders without runtime errors.
     - Restoring default layout leaves canonical tasks, routines, and folders completely intact.
     - Multi-tenant isolation ensures user customizations are invisible across accounts.
2. **Domain Unit Tests (`packages/domain/src/domain.test.ts`)**:
   - 61/61 tests passing.
3. **Mobile Tests (`apps/mobile/src/mobile.test.ts`)**:
   - 30/30 tests passing.
4. **Static Analysis & Monorepo Health**:
   - `pnpm typecheck`: Exit code 0 across all 13 monorepo packages and applications.
   - `pnpm lint`: Exit code 0 (ESLint clean, no warnings or errors).
   - `node scripts/validate-planning.mjs`: Validated successfully with schema compliance.
   - `git diff --check`: No whitespace or git diff errors.

## Subsequent Software Repairs (Mobile Offline Preference Durability)

- **Durable Pending Preferences**:
  - In `apps/mobile/src/views/TodayView.tsx`, offline preference updates previously guessed a revision increment without storing a durable outbound mutation.
  - Fixed to preserve the authoritative server revision, store pending layout/display adjustments in `_pendingPreferences` within the local preference snapshot, and immediately apply pending edits to the local UI.
  - Upon reconnection or refresh, pending preferences are submitted to the API with authoritative `expectedRevision`, handling 409 conflicts and refreshing Today presentation without requiring manual page reload.

## Blocked gates and hardware dependencies

- **Physical Android TalkBack & Native KeyStore**: Provisional mobile implementation verified in headless test environment; formal physical screen-reader and device hardware verification remain recorded as blocked gates.
- **External Production Push Providers**: Production FCM and Mozilla push gateway credentials remain blocked external dependencies. Software defect repairs for Phase 28 and Phase 29 were verified locally and scoped into local repair commit `1e3e4a2`.
