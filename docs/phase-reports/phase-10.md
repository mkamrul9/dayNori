# Phase 10: Personal workspace and preferences

Group: Foundation and sync. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [10 — Personal workspace and preferences](../roadmap/phases/10-personal-workspace-and-preferences.md)
- **Status:** `blocked` (Provisional personal workspace and user preferences implementation delivered and verified across PostgreSQL, Fastify API, web, and mobile. Completion blocked pending prerequisite Phase 04–06 and Phase 09 physical Android TalkBack hardware verification).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-15.
- **Base Git revision and branch:** `df5fbd0` on `main`.
- **Prerequisites:**
  - [Phase 09 — Authentication across web and Android](phase-09.md): Verified local Supabase Auth container daemon, same-origin cookies, native Android KeyStore integration, and session lifecycle.
  - [Phase 07 — PostgreSQL and tenant isolation foundation](phase-07.md): RLS policies, schemas `app` and `audit`, tenant isolation.
  - [Phase 08 — API contracts and service foundation](phase-08.md): Fastify REST service, canonical shared schemas, typed API client.
- **Included scope:**
  - Atomic idempotent workspace provisioning (`POST /v1/workspaces/provision`): Creates exactly one personal workspace (`kind = 'personal'`) and member profile (`app.profiles`) atomically. If called repeatedly or concurrently, returns 200 OK with the existing personal workspace, preserving configured preferences without overwriting.
  - Database-level single personal workspace uniqueness: Partial unique index `idx_workspaces_personal_owner` on `app.workspaces(owner_id) WHERE kind = 'personal'`. Secondary workspaces created via standard `POST /v1/workspaces` must be `kind = 'room'`; attempting to create a second personal workspace triggers 409 Conflict.
  - Legacy duplicate personal workspace reconciliation: Applied migration `00008_personal_workspace_and_preferences.sql`, reconciling legacy duplicate personal workspaces to `kind = 'room'` with suffix ` (Legacy Room)`, keeping the primary personal workspace without data loss.
  - User Preferences:
    - Supported IANA time zone validation (`Intl.DateTimeFormat(undefined, { timeZone })`), BCP 47 locale validation (`Intl.Locale`), week start (`monday | sunday | saturday`), display preferences (`theme`, `compactMode`).
    - Schema versioning (`preferences_schema_version = 1`) separated from optimistic concurrency revision (`revision: number`).
    - Concurrency conflict handling: `PATCH /v1/users/me/preferences` accepts `expectedRevision`; if mismatched, returns 409 `ConflictError` ("Conflict: preferences were modified concurrently; reload and retry").
  - Actor Identity & Workspace Boundaries:
    - User ID derived strictly from verified JWT actor (`request.userId`), never client-supplied actor spoofing.
    - `GET /v1/workspaces/personal` returns 404 if not yet provisioned.
    - Tenant isolation: users cannot read, list, or update workspaces where they lack membership (`GET /v1/workspaces/:workspaceId` returns 404).
  - Web Client Integration (`apps/web`):
    - Added route handlers `POST /api/workspaces/provision` and `GET/PATCH /api/users/preferences` protected with double-submit CSRF tokens and SameSite cookies.
    - Extended `AuthContext` with `workspaceId`, `preferences`, `provisionPersonalWorkspace`, `loadPreferences`, and `savePreferences`.
    - Extended `SettingsView` (`apps/web/src/app/settings/page.tsx`) with Personal Workspace status card, IANA time zone select, locale select, accessible week-start radio group, compact mode toggle, loading spinners, error alerts, and concurrency conflict warning banner.
  - Android Mobile Client Integration (`apps/mobile`):
    - Extended `MobileProviderAuthAdapter` with `provisionPersonalWorkspace`, `getPreferences`, `updatePreferences`, and `getAccessToken`.
    - Persisted `workspaceId` in OS-backed KeyStore (`expo-secure-store` / `SEC_KEY_WORKSPACE_ID`) and restored on cold restart. Purged on sign-out.
    - Extended `SettingsView` (`apps/mobile/src/views/SettingsView.tsx`) with Section 5b: Personal Workspace status card, week start radio selectors (48dp touch targets), and time zone display.
  - Concurrency & Ownership Repairs (Defects Repaired 2026-10-15):
    - Atomic revision predicate: Replaced TOCTOU read-then-update in `updateProfilePreferences` with atomic SQL predicate `WHERE id = $1 AND ($7::bigint IS NULL OR revision = $7::bigint)`. Two simultaneous updates with identical `expectedRevision` serialize deterministically; exactly one succeeds and the other returns 409 without overwriting.
    - Legacy workspace reconciliation ledger: Applied migration `00009_legacy_workspace_reconciliation_and_ownership.sql` inventorying historical workspaces reclassified by Migration 00008 into `app.legacy_workspace_reconciliation_inventory` with status `quarantined_pending_review`, added procedure `app.reconcile_legacy_workspace()`, and preflight verification script `scripts/preflight-database.mjs`.
    - Database-enforced personal workspace ownership: Trigger `trg_enforce_personal_workspace_ownership` on `app.workspace_memberships` and route `POST /v1/workspaces/:workspaceId/members` strictly forbid adding members to personal workspaces.
- **Excluded/deferred scope:**
  - Sharing/inviting other members into personal workspaces — personal workspaces remain strictly single-user. Multi-user workspace sharing is deferred to Phase 51.
  - Room workspaces UI management — deferred to Phase 51.
  - Product payload domains (todos, routines, notes, journals, tags) — deferred to later domain phases (Phase 14+); Phase 11 implements local persistence foundations and repositories only.
  - Offline sync engine and network synchronization — Phase 12 & Phase 13.
  - Physical Android TalkBack hardware verification (Phases 04, 06, 09) — remains blocked pending physical device.

## Result

Delivered the complete Phase 10 personal workspace provisioning and user preferences foundation across database schema, Fastify REST API, typed client, web application, and Android mobile client.

Key architectural properties enforced:

1. **Database-Enforced Personal Uniqueness:** Enforced via `CREATE UNIQUE INDEX idx_workspaces_personal_owner ON app.workspaces (owner_id) WHERE kind = 'personal'`. No race condition can produce duplicate personal workspaces.
2. **Atomic Idempotent Provisioning:** Provisioning performs atomic profile creation and workspace assignment. Subsequent calls return the existing workspace with status 200 OK without resetting user-customized display names or preferences (`ON CONFLICT (id) DO UPDATE SET updated_at = app.profiles.updated_at`).
3. **Independent Revision Concurrency:** `preferences_schema_version` (schema migration format) is cleanly separated from `revision` (integer sequence for optimistic concurrency control). Concurrent preference edits trigger 409 Conflict.
4. **Strict Boundary Scoping:** Actor identity is extracted solely from the verified JWT sub/userId. Cross-tenant workspace access attempts return 404 Not Found.
5. **Cross-Platform UX:** Both Web and Mobile clients provide accessible preference editing controls, optimistic revision checks, error banners, and persistence across logins.

## Acceptance evidence

| Acceptance Condition                               | Verification Method                             | Location / Artifact                                        | Result                                                                            |
| :------------------------------------------------- | :---------------------------------------------- | :--------------------------------------------------------- | :-------------------------------------------------------------------------------- |
| First-time personal workspace provisioning         | POST /v1/workspaces/provision                   | `tests/integration/phase10-workspaces-preferences.test.ts` | PASS (201 Created, returns workspace ID with kind='personal', role='owner')       |
| Idempotent repeated provisioning                   | POST /v1/workspaces/provision second call       | `tests/integration/phase10-workspaces-preferences.test.ts` | PASS (200 OK, returns same workspace ID without overwriting profile)              |
| Concurrent duplicate personal workspace race       | Promise.all concurrent provision requests       | `tests/integration/phase10-workspaces-preferences.test.ts` | PASS (All concurrent requests resolve to the identical single personal workspace) |
| Rejection of secondary personal workspace creation | POST /v1/workspaces with kind='personal'        | `tests/integration/phase10-workspaces-preferences.test.ts` | PASS (409 Conflict, idx_workspaces_personal_owner unique violation caught)        |
| Lookup personal workspace by authenticated actor   | GET /v1/workspaces/personal                     | `tests/integration/phase10-workspaces-preferences.test.ts` | PASS (200 OK, returns personal workspace metadata)                                |
| Unprovisioned personal workspace lookup            | GET /v1/workspaces/personal (new user)          | `tests/integration/phase10-workspaces-preferences.test.ts` | PASS (404 Not Found: Personal workspace not found for user)                       |
| Cross-tenant workspace isolation                   | GET /v1/workspaces/:wsId for non-member         | `tests/integration/phase10-workspaces-preferences.test.ts` | PASS (404 Not Found: Tenant isolation enforced)                                   |
| Valid IANA time zone persistence                   | PATCH /v1/users/me/preferences (Europe/Paris)   | `tests/integration/phase10-workspaces-preferences.test.ts` | PASS (200 OK, timeZone='Europe/Paris', revision incremented)                      |
| Invalid IANA time zone rejection                   | PATCH /v1/users/me/preferences (Mars/Phobos)    | `tests/integration/phase10-workspaces-preferences.test.ts` | PASS (400 Bad Request: Invalid IANA time zone identifier)                         |
| Invalid week start rejection                       | PATCH /v1/users/me/preferences (wednesday)      | `tests/integration/phase10-workspaces-preferences.test.ts` | PASS (400 Bad Request: weekStart must be monday, sunday, or saturday)             |
| Invalid locale rejection                           | PATCH /v1/users/me/preferences (invalid-locale) | `tests/integration/phase10-workspaces-preferences.test.ts` | PASS (400 Bad Request: Invalid BCP 47 language tag)                               |
| Optimistic concurrency revision conflict           | PATCH /v1/users/me/preferences (stale revision) | `tests/integration/phase10-workspaces-preferences.test.ts` | PASS (409 Conflict: preferences were modified concurrently)                       |
| Web personal workspace provision route handler     | POST /api/workspaces/provision with CSRF        | `apps/web/src/auth.test.ts`                                | PASS (200 OK, returns workspace metadata; 403 on missing CSRF)                    |
| Web user preferences route handlers (GET/PATCH)    | GET & PATCH /api/users/preferences with CSRF    | `apps/web/src/auth.test.ts`                                | PASS (200 OK, updates preferences, validates IANA timezone and CSRF)              |
| Android KeyStore workspace ID persistence          | MobileProviderAuthAdapter provisionWorkspace    | `apps/mobile/src/auth.test.ts`                             | PASS (Persists workspace ID to expo-secure-store SEC_KEY_WORKSPACE_ID)            |
| Android session restoration with workspace ID      | MobileProviderAuthAdapter restoreSession        | `apps/mobile/src/auth.test.ts`                             | PASS (Restores session with workspaceId intact from KeyStore)                     |
| Android preferences retrieval & update adapter     | getPreferences & updatePreferences              | `apps/mobile/src/auth.test.ts`                             | PASS (Fetches profile, updates timeZone/weekStart, increments revision)           |
| Android sign-out workspace purging                 | MobileProviderAuthAdapter signOut               | `apps/mobile/src/auth.test.ts`                             | PASS (Deletes SEC_KEY_WORKSPACE_ID from KeyStore, wipes currentUser)              |
| Full monorepo automated test suite                 | `pnpm test`                                     | Root workspace                                             | PASS (25 test files, 243 tests passed)                                            |
| Full monorepo typecheck                            | `pnpm typecheck`                                | Root workspace                                             | PASS (Exit code 0 across 13 packages)                                             |
| ESLint verification                                | `pnpm lint`                                     | Root workspace                                             | PASS (Exit code 0, 0 lint errors)                                                 |
| Prettier style validation                          | `pnpm format:check`                             | Root workspace                                             | PASS (All files adhere to Prettier code style)                                    |
| Secret scanning audit                              | `pnpm audit:secrets`                            | Root workspace                                             | PASS (1190 files checked, 0 unapproved secrets detected)                          |
| Planning validation                                | `pnpm validate:planning`                        | Root workspace                                             | PASS (64 phases, 22 mapped requirements, 152 Markdown files validated)            |

## Defects, limitations and recovery

- **Physical Android TalkBack Hardware Gate (Phases 04, 06, 09)**: Remains blocked on physical Android hardware availability; explicitly preserved in `docs/roadmap/progress.json`.
- **Dependency Advisory Warnings**: Non-blocking fail-closed advisory audit (`node-forge` and `braces`) remains visible without manufactured approval bypasses.

## Documentation and Git review

- Updated Documentation:
  - Phase 10 Report: `docs/phase-reports/phase-10.md` (this file).
  - Roadmap Progress: `docs/roadmap/progress.json` updated with Phase 10 blocked on hardware gate with provisional delivery.
  - Changelog: `CHANGELOG.md` updated with Phase 10 additions.
- `git diff --check`: Verified clean.
- Complete and staged diff review: Verified no secrets, private credentials, or synthetic fixtures added.
- Intended conventional commit subject: `feat(workspaces): add personal workspace and user preferences`.

## Handoff

- **Phase 10 Status:** Software implementation and prerequisite repairs complete and verified across database, backend API, web, and mobile. Completion marked blocked in `docs/roadmap/progress.json` strictly due to physical Android TalkBack hardware verification prerequisite from Phases 04–06 and 09.
- **Roadmap Progression State:** Phase 10 personal workspace and preferences foundation is repaired and ready for Phase 11 (Local data repositories and migrations: item headers, drafts, pending mutations, sync cursors, preference snapshots).
- **Next Required Action:** Execute the single conventional commit for Phase 10 repairs:
  `fix(workspaces): enforce personal workspace ownership, atomic revision predicate, and legacy reconciliation`
