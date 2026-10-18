# Phase 31: First-use tutorial and progressive discovery

Group: Personal organizer and private beta. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [31 — First-use tutorial and progressive discovery](../roadmap/phases/31-first-use-tutorial-and-progressive-discovery.md)
- **Status:** `blocked` (Software implementation, Web OnboardingTutorial dialog, Mobile OnboardingSheet, pure domain onboarding state machine, deterministic starter items, skippable tutorial, replay invariants, preferences synchronization, and 10 integration tests verified locally; completion status recorded as `blocked` in `docs/roadmap/progress.json` due to prerequisite physical Android TalkBack / KeyStore hardware gates and external production provider push services).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-18.
- **Base Git revision and branch:** `45f6315` on `main`.
- **Prerequisites:**
  - [Phase 10 — Personal workspace and preferences](phase-10.md): User display preferences, locale, and timezone.
  - [Phase 30 — Today home and personal customization](phase-30.md): Home layout, module shortcuts, and widget customization.
- **Included scope:**
  - **Prerequisite Software Repairs (Phase 29 & 30 Defects)**:
    - Fixed in dedicated prior commit `45f6315` (`fix(organizer): repair preference routing, push transport encryption, and cache migration`):
      - Created Web BFF proxy client (`apps/web/src/data/webApiClient.ts`) with automatic CSRF token injection to prevent unauthenticated 403s on `/api/v1/push/subscriptions`.
      - Scoped web push deactivations and sign-out cleanup strictly to the signing-out user's ID, avoiding session bleed across accounts.
      - Fixed atomic SQL preference merging in `workspaceRepository.ts` via Postgres `COALESCE(preferences, '{}'::jsonb) || $6::jsonb` to prevent concurrent wiping of user preferences.
      - Upgraded web push encryption in `apps/worker/src/crypto/webPushEncryption.ts` to RFC 8291 `aes128gcm` with P-256 ECDH, HKDF, RFC 8292 VAPID ES256 signing, DNS IP lookup validation blocking loopback/private/link-local/carrier-grade NAT destinations, and strict redirect denial.
      - Migrated service worker cache in `apps/web/public/sw.js` to `daynori-static-v2`, purging stale v1 cache and stripping query parameters from static asset cache keys.
  - **Pure Domain Onboarding Engine (`packages/domain/src/onboarding.ts`)**:
    - Created zero-dependency onboarding state machine supporting steps `'capture'`, `'planning'`, `'organize'`, and `'completed'`.
    - Implemented `getDefaultOnboardingState()`, `shouldShowOnboarding()`, `advanceOnboardingStep()`, `completeOnboarding()`, and `skipOnboarding()`.
    - Implemented `deriveModuleShortcutsFromInterests()`: Dynamically configures visible module shortcuts on the user's Home layout matching selected goals (`notes`, `planning`, `journal`, `files`).
    - Enforced transparency invariant: Goal selection alters presentation visibility on the Home screen only; it never restricts authorization, denies API access, or deletes data. Unreleased modules (e.g. `knowledge`) remain strictly gated (`visible: false`).
    - Deterministic starter content generation (`getSampleFolderId`, `getSampleNoteId`, `getSampleTaskId`): Generates RFC 4122 v5 UUIDs deterministically from `namespace:workspaceId:userId` via SHA-256 to ensure complete mathematical idempotency across reloads, retries, and multi-device sync without creating duplicate items.
    - Replay preservation invariant (`resetOnboardingForReplay`): Preserves `createdSampleItemIds` and `createdFolderId` so replaying the tutorial from Settings never re-creates sample items or removes user content.
  - **API Contracts & User Preferences Integration**:
    - Defined `OnboardingInterestSchema`, `OnboardingStepSchema`, and `OnboardingStateSchema` in `packages/contracts/src/api/user.ts`.
    - Integrated `onboarding: OnboardingStateSchema.optional()` into `DisplayPreferencesSchema` and `UpdatePreferencesRequestSchema`.
    - Updated `apps/api/src/routes/v1/users.ts` and `apps/api/src/routes/v1/workspaces.ts` to map and persist `onboarding` preferences alongside `homeLayout`.
  - **Web Onboarding Experience (`apps/web/src/components/OnboardingTutorial.tsx`)**:
    - 3-step accessible dialog with live region announcements (`aria-live="polite"`), step progress bar, and keyboard navigation.
    - Step 1 (Capture & Focus): Interest checklist for primary goals with transparency notice ("Visibility changes presentation, not authorization").
    - Step 2 (Organization & Progressive Discovery): Comparison cards explaining one-time Upcoming Tasks vs recurring Daily Routines, with privacy callout that camera, microphone, and notifications are deferred until their respective features are used.
    - Step 3 (Starter Setup): Opt-in toggles for starter folder, sample note, and sample task, with Finish and Skip actions.
    - Automatic first-sign-in launch in `apps/web/src/components/TodayView.tsx` when `shouldShowOnboarding` is true.
    - "Replay Onboarding Tutorial" action in `apps/web/src/app/settings/page.tsx`.
  - **Mobile Onboarding Experience (`apps/mobile/src/views/OnboardingSheet.tsx`)**:
    - Modal bottom sheet with TalkBack accessibility announcements (`AccessibilityInfo.announceForAccessibility`), minimum 48dp touch targets, WCAG 2.2 AA token compliance, and hardware back-button handling.
    - Added `'onboarding'` to `ActiveModal` in `apps/mobile/src/navigation/types.ts`.
    - Integrated automatic launch in `apps/mobile/src/views/TodayView.tsx` and wired into `apps/mobile/App.tsx`.
    - Added "Tutorial & Getting Started" replay section in `apps/mobile/src/views/SettingsView.tsx`.

## Verification results

1. **Automated Integration Suite (`tests/integration/phase31-onboarding.test.ts`)**:
   - 10/10 tests passing:
     - Fresh account baseline: Detects that a new user requires onboarding by default (`shouldShowOnboarding` true).
     - Tutorial metadata: Verifies step descriptions, announcements, and interest labels across all steps.
     - Goal selection: Derives module shortcuts showing selected interests while keeping unselected and unreleased modules hidden.
     - Deterministic UUIDs: Produces RFC 4122 v5 UUIDs that are idempotent across calls and unique across entities.
     - Server starter items: Creates starter folder, note, and task on server and stores tracked IDs in user preferences.
     - Skippable onboarding: Skipping persists `skipped: true` and enters home without creating sample items.
     - Replay safety: Replaying resets step to `'capture'` without duplicating items or deleting user data.
     - Multi-device sync: Onboarding state and home layout sync across devices with optimistic concurrency (HTTP 409 conflict detection on stale revisions).
2. **Full Monorepo Integration & Unit Test Suite (`pnpm test`)**:
   - 52/52 test files passed.
   - 732/732 tests passed (including all prior phases: 10, 12-25, 27-30).
3. **Type Checking & Linting**:
   - `pnpm typecheck`: Passed (exit code 0 across all 13 workspace packages and apps).
4. **Production Build Validation (`pnpm build`)**:
   - Passed: Next.js 15 web application production bundle compiled and static pages prerendered; Expo Android bundle exported.
5. **Planning & Roadmap Validation**:
   - `node scripts/validate-planning.mjs`: Passed (64 phases, 22 mapped requirements, 194 markdown files verified).

## Blocked gates and hardware dependencies

- **Physical Android TalkBack & Native KeyStore**: Provisional mobile implementation verified in automated headless test suites; physical TalkBack screen-reader gesture navigation and physical KeyStore hardware verification remain recorded as blocked gates.
- **External Production Push Providers**: Production FCM and Mozilla push gateway credentials remain blocked external dependencies. Push encryption repairs and offline deactivation queuing were verified locally in software.
