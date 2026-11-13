# Phase 104: Current Daynori web/PWA readiness audit and critical core fixes

## Identity and scope

- Phase: [104 — Current Daynori web/PWA readiness audit and critical core fixes](../roadmap/phases/104-current-daynori-web-pwa-readiness-audit-and-critical-core-fixes.md).
- Status: **blocked** — Local web/PWA readiness audit, end-to-end user journeys verification, and critical core truthful UI fixes delivered. Full public deployment, live production publication, paid infrastructure spending, and unverified provider activation remain strictly blocked pending explicit owner authorization and open release gates.
  - Core readiness evaluation: audited and verified the full core organizer web/PWA experience across 8 distinct real user journeys using synthetic test credentials (`synthetic-alice-104@example.org`, `synthetic-bob-104@example.org`, `synthetic-operator-104@example.org`).
  - Gated feature truthfulness remediation (`DEF-V2-008`): identified that Ask Nori assistant previously appeared interactive before failing on API request. Updated `AssistantPanel.tsx` with a truthful gated banner informing users that live AI is gated under `DEF-V2-008` pending provider authorization and privacy compliance. Disabled input query textarea with explicit guidance placeholder, disabled "Ask" button, disabled starter suggestion pills, disabled voice recording, and updated `AppHeader.tsx` launcher button with explicit gating `aria-label` and tooltip.
  - Packaged candidate comparison: compared current commit (`3d65d14`) and dirty working tree against Phase 102 packaged distributable candidate (`artifacts/release/daynori-web-v2.0.0-rc1.tar.gz`, SHA-256: `663cc566011eecf6c78e1bfc99ca7e1ed6defb3c92ea59b6663c46d031801f5c`). Confirmed complete backward compatibility with core organizer data structures and verified all working-tree adaptations (API health version fallback, mobile Metro entry point resolution, mobile notification channel strict typing, web URL search param aliasing).
  - Preserved working-tree evidence: preserved all unrelated working-tree files, historical Android screenshots/XML hierarchy dumps, and performance rehearsal evidence intact without truncation or forced overwrites.
  - Rehearsal verification:
    - 8 E2E audit journeys verified in [`tests/e2e/phase104-v2-web-pwa-audit-journeys.test.ts`](../../tests/e2e/phase104-v2-web-pwa-audit-journeys.test.ts) (8/8 passed in 925ms).
    - 5 barrier and truthfulness unit tests verified in [`tests/unit/phase104-gated-features-truthfulness.test.ts`](../../tests/unit/phase104-gated-features-truthfulness.test.ts) (5/5 passed in 6ms).
- Contributor/date: Antigravity agent, 2026-11-13.
- Base revision/branch: `3d65d1486a85f1efaf79d74dbb517b54d8a76fc2`, `codex/free-core-preview`.
- Hard prerequisites: Phase **102** ([phase-102.md](phase-102.md)).
- Owner Scheduling Authorization: The owner explicitly authorized selecting Phase 104 for a current Daynori web/PWA readiness audit and critical core fixes, testing real user journeys, comparing the current commit and dirty tree with the Phase 102 packaged candidate, fixing reproducible defects within this phase, verifying that gated features (especially Ask Nori) are presented truthfully, using synthetic accounts, recording exact commands and limitations, and pushing under the standing repository workflow ([ADR 0074](../decisions/0074-standing-phase71-scheduling-and-push.md), [ADR 0104](../decisions/0104-current-web-pwa-readiness-audit-and-critical-core-fixes.md)). No production deployment or release readiness claimed from local tests.

---

## Result

### Implementation and Verifications Delivered

1. **Gated Feature Truthfulness Remediation (`DEF-V2-008`)**:
   - Diagnosed that in previous builds, the Ask Nori assistant panel presented active query controls and suggestion pills that appeared ready to accept user prompts, only to fail with a `403 Forbidden` response from the backend AI service.
   - Enhanced `apps/web/src/components/AssistantPanel.tsx`:
     - Added dynamic gate detection (`client.getAiConsentStatus()`) and `isGated?: boolean` prop.
     - Implemented `data-testid="assistant-gated-banner"` with clear, truthful copy: *"Ask Nori is Currently Gated (DEF-V2-008). Live AI assistant queries and voice transcription are intentionally disabled in this release under release gate DEF-V2-008 pending enterprise provider privacy and operating authorization. Manual note, task, routine, and journal editing remain fully operational."*
     - Disabled question input textarea when gated, setting `placeholder="Assistant is currently gated under DEF-V2-008. Use manual organizer controls."` and `cursor: 'not-allowed'`.
     - Disabled the "Ask" submission button when gated.
     - Disabled starter suggestion buttons with `cursor: 'not-allowed'` and subdued text color.
     - Disabled voice recording button.
     - Provided accessible links to `/help?article=assistant-optional` and `/settings`.
   - Enhanced `apps/web/src/components/AppHeader.tsx`:
     - Updated global assistant launcher button with `aria-label="Ask Nori assistant (Gated under DEF-V2-008)"` and matching tooltip.

2. **Comparison with Phase 102 Packaged Candidate**:
   - Packaged candidate baseline: `artifacts/release/daynori-web-v2.0.0-rc1.tar.gz` (size: 1,823,845 bytes; SHA-256: `663cc566011eecf6c78e1bfc99ca7e1ed6defb3c92ea59b6663c46d031801f5c`, commit `5b5c4f8`).
   - Audited differences across working tree:
     - `apps/api/src/routes/v1/health.ts`: Fallback to `"2.0.0"` when `npm_package_version` is unset.
     - `apps/mobile/metro.config.js`: Remapped `./apps/mobile/` entry resolution so Metro bundles cleanly in monorepo root.
     - `apps/mobile/src/notifications/adapter.ts`: Strictly typed Android notification channels (`'reminders' | 'routines' | 'system'`) and navigation destinations, eliminating unsafe `any` casts.
     - `apps/web/src/app/library/page.tsx`, `plan/page.tsx`, `journal/page.tsx`: URL search parameter aliasing (`?entryId=` and `?id=`; `?type=` and `?view=`) ensuring cross-route deep links resolve seamlessly.
     - `apps/web/src/components/AssistantPanel.tsx` & `AppHeader.tsx`: Truthful gated banner and disabled controls (`DEF-V2-008`).
   - Finding: All working-tree changes maintain strict backward compatibility with existing SQLite schemas and API contracts.

3. **Real User Journeys Audit (Synthetic Accounts)**:
   - **Journey 1: Sign-up / Sign-in & Profile Configuration**:
     - Registered synthetic user `synthetic-alice-104@example.org`.
     - Auto-provisioned personal workspace.
     - Retrieved user profile and updated workspace preferences (`theme: 'dark'`, `weekStart: 'monday'`, `timeZone: 'Asia/Dhaka'`).
   - **Journey 2: Workspace Isolation & Access Enforcement**:
     - Alice created a private note in Alice's personal workspace.
     - Bob (`synthetic-bob-104@example.org`) attempted to access Alice's workspace (`GET /v1/workspaces/:aliceWorkspaceId/notes/:aliceNoteId`), returning `404 Not Found` (tenant-scoped resource isolation).
     - Bob attempted to mutate Alice's note (`PATCH`), returning `404 Not Found`.
     - Cross-tenant boundary strictly verified.
   - **Journey 3: Note / Task / Routine / Journal CRUD**:
     - Note: Created rich text note with AST blocks (`paragraph`, `heading`), saved, reopened, verified revision counter.
     - Task: Created task with structured deadline `{ type: 'date', date: '2026-11-20' }` and high priority, reopened, and marked complete.
     - Routine: Created daily routine with timezone `Asia/Dhaka` and scheduled time `07:30`, reopened, and verified occurrence projection.
     - Journal: Created reflective entry with mood score `4`, tags `['focus', 'release']`, and reopened with full entry text.
   - **Journey 4: Omni Search Across Entities**:
     - Executed search query with unique synthetic marker string `AuditMarker-104`.
     - Search results correctly indexed and surfaced matching notes, tasks, routines, and journal entries with distinct entity metadata.
   - **Journey 5: Offline Reopen & Sync Conflict Recovery**:
     - Simulated offline edit scenario with optimistic local mutations.
     - Client tracked `baseRevision: 1`. Server accepted initial update (`baseRevision: 1` -> `revision: 2`).
     - Stale client attempted update with stale `baseRevision: 1`. API strictly rejected with `409 Conflict`.
     - Client re-read latest revision (`revision: 2`), reapplied resolved mutation with `baseRevision: 2`, and succeeded.
   - **Journey 6: Help & Guided Walkthroughs**:
     - Verified `/help` route resolves with searchable how-to articles, FAQ index, and deep links.
     - Verified 19-chapter guided tour data structure exists and maps to registered features.
   - **Journey 7: Support & Operator Feedback Triage**:
     - Synthetic user submitted feedback report (`category: 'bug'`, diagnostic payload attached).
     - Received feedback receipt with status `'received'`.
     - Operator (`synthetic-operator-104@example.org`) triaged report: transitioned status to `'investigating'`, set priority to `'high'`, and appended internal triage audit note.
   - **Journey 8: Gated Features Fail-Closed & Truthful Presentation**:
     - Live AI consent: `GET /v1/ai/consent` returned `403 Forbidden` (`code: 'RELEASE_GATE_BLOCKED'`).
     - Vault unlock: `POST /v1/vault/unlock` returned `403 Forbidden` (`code: 'RELEASE_GATE_BLOCKED'`).
     - Rooms invite: `POST /v1/rooms/invites` returned `403 Forbidden` (`code: 'RELEASE_GATE_BLOCKED'`).
     - Billing catalog: `GET /v1/billing/catalog` returned `403 Forbidden` (`code: 'RELEASE_GATE_BLOCKED'`).
     - Function register inspected: all 4 gated features marked with `readiness: 'blocked'` and `implementationStatus: 'gated'`.
     - UI presentation verified: `AssistantPanel` truthfully renders gated banner and disables interactive query controls.

---

## Acceptance evidence

1. **Test Execution Evidence**:
   - `pnpm vitest run tests/e2e/phase104-v2-web-pwa-audit-journeys.test.ts`:
     - Result: 8 tests passed (1 test file, 925ms).
   - `pnpm vitest run tests/unit/phase104-gated-features-truthfulness.test.ts`:
     - Result: 5 tests passed (1 test file, 6ms).
   - `pnpm typecheck`:
     - Result: 13 projects passed with 0 errors.
   - `pnpm lint`:
     - Result: 0 errors, 0 warnings across monorepo.
   - `node scripts/validate-planning.mjs`:
     - Result: 105 phases, 22 requirements, 464 markdown files passed.
   - `pnpm validate:function-register`:
     - Result: 109 actions, 13 defects, 22 families passed.

2. **Artifact Evidence**:
   - [`artifacts/phase104/evidence-summary.json`](../../artifacts/phase104/evidence-summary.json): Complete machine-readable audit report recording journey outcomes, diff comparison, defect remediation, and blocking gates.

---

## Gate-by-Gate Barrier Register (Grouped by Track)

### Track A: Bounded Web/PWA Beta Release Scope (Smallest Viable Release)

1. **`OWNER-RELEASE-AUTH`**:
   - Barrier: Requires explicit human owner sign-off on release candidate revision, hosting domain, test cohort size (20–50 users), and low-tier monthly budget ($5–$40/mo).
   - Status: **BLOCKED** (Awaiting owner authorization).
2. **`DEF-V2-001`**:
   - Barrier: Production Supabase / Google OAuth identity provider redirect URIs configured for public production web domain.
   - Status: **BLOCKED** (Awaiting production OAuth client credentials).
3. **`DEF-V2-008`**:
   - Barrier: Enterprise live AI provider contract and privacy compliance approval.
   - Remediation Status: **UI GATED & TRUTHFUL** (Live AI blocked fail-closed with HTTP 403; UI renders truthful banner and disables query input).
4. **`DEF-V2-013`**:
   - Barrier: Usability evaluation with $\ge 5$ consenting human participants ($\ge 4$ unassisted).
   - Status: **BLOCKED** (To be performed during initial invited beta cohort).

### Track B: Dedicated Android Release Track (Independent Hardware Track)

1. **`OWNER-SIGNING-KEYS`**:
   - Barrier: Production Android release keystore and credentials (`DAYNORI_RELEASE_STORE_*`).
   - Status: **BLOCKED** (Awaiting owner release keystore provision).
2. **`DEF-V2-011`**:
   - Barrier: Physical Android ARM64 hardware startup verification and physical TalkBack screen-reader latency profiling.
   - Status: **BLOCKED** (Requires physical test device).

---

## Remaining owner decisions

1. **Launch Authorization**: Review and approve candidate revision `3d65d14` (with Phase 104 audit fixes) for Bounded Web/PWA Beta testing.
2. **Domain & Hosting Provider**: Confirm target web hosting environment (`preview.daynori.com` or `app.daynori.com`).
3. **Identity Provider**: Provision production Supabase OAuth redirect URLs for candidate domain.
4. **AI Assistant Decision**: Confirm that Ask Nori remains visibly gated under `DEF-V2-008` for the initial public web beta release.

---

## Stop condition

Phase 104 is complete and bounded. All 8 user journeys pass with zero regressions. Gated features (especially Ask Nori) are presented truthfully. Working-tree changes from prior phases have been strictly preserved. Staged changes will be committed in a single conventional commit and pushed to `origin/codex/free-core-preview` under the standing repository workflow (ADR 0074). No production deployment or release readiness claimed from local tests.

