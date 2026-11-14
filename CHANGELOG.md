# Changelog

## Phase 108 — AI text-assistant release-gate and operational review — 2026-11-14

- ADR 0108: AI text-assistant release-gate and operational review evaluating the Phase 90–94 implementation against release gate `DEF-V2-008`, ensuring Ask Nori discoverability, anti-hallucination date ambiguity verification, zero-unreviewed-write proposal workflows, privacy fencing, and separate live vs. mock provider evaluation.
- Discoverability & Truthful Gating Presentation:
  - Surfaced explicit "Ask Nori" button in desktop/tablet sidebar navigation (`apps/web/src/components/AppSidebar.tsx`) under Utilities with the `nori` icon, "Gated" badge, and trigger to open the assistant slide-out panel (`openModal('assistant')`).
  - Retained global header assistant launcher with explicit aria-label and tooltip documenting gated status under `DEF-V2-008`.
  - Both Web (`AssistantPanel.tsx`) and Mobile (`AssistantSheet.tsx`) render prominent truthful status banners (`assistant-gated-banner`) explaining that live AI queries and voice transcription are intentionally disabled under `DEF-V2-008` pending enterprise provider privacy review and contract. Text inputs are disabled with helpful placeholders and links to AI Privacy FAQ (`/help?article=assistant-optional`) and Settings (`/settings`).
- Help Documentation:
  - Updated `help.assistant-optional` in `packages/domain/src/help/catalogData.ts` to document gating under `DEF-V2-008`, editable proposal preview lifecycle, anti-hallucination date ambiguity checks, explicit Save/Confirm requirement, durable mutation receipts under `AI_DEVICE_ID`, and strict journal opt-in.
- Anti-Hallucination Date Ambiguity Gate:
  - Implemented `detectTaskDeadlineAmbiguity` in `@daynori/domain` (`packages/domain/src/organizerProposals.ts`) to detect relative deadline references ("tomorrow", "next Friday", "আগামীকাল", "পরশু") or missing dates in deadline requests and prompt clarifying questions.
  - Verified `detectJournalDateAmbiguity` for relative journal dates ("yesterday", "last week", "গতকাল").
  - Verified that ambiguous date requests never guess dates or save unreviewed records into organizer tables.
- Core Exercise Journeys Verified:
  - "write this journal entry" with ambiguous date ("yesterday"): triggers clarification question, zero unreviewed records saved.
  - "write this journal entry" with explicit ISO date (`2026-11-20`): creates editable preview proposal, confirmed via `confirmAiProposal`, creates entry in `app.journal_entries`, records durable receipt in `app.mutation_receipts` under `AI_DEVICE_ID` (`ai-assistant-proposal`), returns canonical deep link (`/journal?entryId=...`).
  - "create a note": creates editable preview proposal, edited via `updateAiProposal` (issuing fresh single-use confirmation token), confirmed via `confirmAiProposal`, creates note in `app.notes`, records durable receipt in `app.mutation_receipts`, returns deep link (`/library?noteId=...`).
  - "set a task deadline" with ambiguous date ("tomorrow"): triggers clarification question, zero unreviewed records saved.
  - "set a task deadline" with explicit date (`2026-12-15`): creates editable preview proposal with deadline `{ type: 'date', date: '2026-12-15' }`, confirmed via `confirmAiProposal`, creates task in `app.tasks`, records durable receipt in `app.mutation_receipts`, returns deep link (`/plan?targetId=...&targetType=task`).
  - Cancelled / unreviewed proposals: cancelled via `cancelAiProposal`, verified zero writes to organizer tables.
  - Idempotent confirmation retry: re-confirming already confirmed proposal returns existing record idempotently without duplicate rows.
- Strict Privacy & Security Fencing:
  - Current provider disclosure version required (`CURRENT_AI_PROVIDER_DISCLOSURE_VERSION`); outdated versions fail closed.
  - Strict journal opt-in: `contentScope.journal = false` excludes journal entries from retrieval and refuses journal proposals.
  - Unconditional vault exclusion: vault items/keys never indexed or transmitted; proposals setting `securityScope = 'vault'` fail closed with HTTP 403 `AI_VAULT_FORBIDDEN`.
  - Multi-tenant workspace isolation: cross-workspace queries and proposals fail closed (404/403).
- Provider Separation (Live vs. Mock):
  - Evaluated Mock Provider (`FakeAiProvider`) with synthetic citations and pause gate cancellation.
  - Evaluated Live Provider Protocol (`OpenAiCompatibleProvider`) via synthetic HTTP transport; verified wire protocol invariants (`store: false`, Bearer token, temperature 0, model `gpt-4o-mini`, 30s timeout, <20,000 char bounds) and error mappings (429 `AI_PROVIDER_RATE_LIMIT`, 503 `AI_PROVIDER_OUTAGE`, 401 `AI_PROVIDER_AUTH_ERROR`, malformed JSON `AI_PROVIDER_MALFORMED`, and in-flight `AbortSignal` cancellation).
  - Recorded live versus mock evaluations in separate artifacts (`artifacts/phase108/live-provider-evaluation.json`, `artifacts/phase108/proposals-journey-evidence.json`, and `artifacts/phase108/evidence-summary.json`).
- Automated Evidence & Tests:
  - 16/16 tests pass in `tests/integration/phase108-ai-assistant-release-gate.test.ts`.
  - 63/63 tests pass across all 6 AI integration test suites in monorepo.
- Gate-by-Gate Reporting:
  - Phase 71 remains strictly `blocked` pending physical ARM64 phone and human ear TalkBack certification.
  - Phase 108 status recorded as `blocked` pending enterprise provider privacy review and commercial contract (`DEF-V2-008` fail-closed). No production deployment or release readiness claimed from local tests.


## Phase 107 — Bounded Google Drive folder authorization and scope boundary review — 2026-11-14

- ADR 0107: Bounded Google Drive folder authorization and scope boundary review evaluating the deferred Phase 50 decision, Phase 87 audit, and Google OAuth `drive.file` container selection behavior.
- Scope Boundary & Descendant Analysis:
  - Proved via live runner and synthetic tests that `https://www.googleapis.com/auth/drive.file` grants per-resource access to the picked folder container itself, but does not grant OAuth access to unpicked pre-existing children or external additions made in Google Drive.
  - Implemented `evaluateDescendantAuthorization`: validates that under `drive.file`, children are authorized only if created by Daynori (`app_created`) or individually picked (`picker_selected`). Pre-existing unpicked or external additions fail closed as unauthorized (`drive_file_scope_does_not_grant_unpicked_descendants`).
- Bounded Folder Tree Representation:
  - Implemented `buildAuthorizedDriveTree` in `@daynori/domain` (`packages/domain/src/driveConnector.ts`) to construct familiar nested folder hierarchies for authorized items.
  - Enhanced Web (`apps/web/src/components/DriveConnectionsPanel.tsx`) and Mobile (`apps/mobile/src/views/DriveConnectionsSheet.tsx`) UI to render folder badges (`[FOLDER]`), indented child hierarchies, clear copy vs. reference indicators, and truthful guidance for empty/unpicked folders.
  - Enforced `validateTraversalBoundary`: strictly prohibits root Drive enumeration and parent/sibling folder crawling outside user-selected folder IDs ("Do not enumerate or import the rest of Drive").
- Disconnect & Revocation Guarantees:
  - Verified disconnect atomically wipes stored tokens, increments generation, cancels in-flight jobs, preserves imported copies locally (`retainedImportedCopies: true`), and guarantees remote Google Drive originals are never deleted or trashed (`remoteOriginalDeleted: false`).
- Vault Strict Exclusion & Multi-Tenant Scoping:
  - Preserved strict vault exclusion (`isVaultDriveTarget`) with HTTP 403 `vault_excluded`.
  - Scoped all Drive operations, tokens, and records to authorized workspace and actor account.
- Comprehensive Broader-Scope Proposal:
  - Authored `docs/engineering/google-drive-restricted-scope-mirroring-proposal.md` specifying candidate restricted scopes (`drive.readonly`, `drive`), App Defense Alliance (ADA) CASA Assurance Level AL2 requirements, annual recertification, and $675 to $5,400+ annual lab costs.
  - Recursive folder mirroring remains strictly gated fail-closed under `DEF-V2-005` until owner authorization and CASA certification are completed.
- Automated Evidence & Tests:
  - Verified 17 integration tests in `tests/integration/phase107-drive-folder-boundary.test.ts` (17/17 passed).
  - Maintained 100% pass across all 45 Drive tests across monorepo (`tests/integration/phase87-drive-connection-readiness.test.ts`, `tests/spikes/drive/drive-scope.synthetic.test.ts`).
  - Recorded provider evidence in `artifacts/phase107/provider-evidence.json`, `artifacts/phase107/live-blocked.json`, and `artifacts/phase107/evidence-summary.json`.
- Gate-by-Gate Reporting:
  - Phase 71 remains strictly `blocked` pending physical ARM64 phone and human ear TalkBack certification.
  - Phase 107 status recorded as `blocked` pending owner Google Cloud OAuth credentials and live interactive consent (`DEF-V2-005`) and CASA restricted scope authorization. No production deployment or release readiness claimed from local tests.


## Phase 106 — Daynori native Android interface refinement and component overhaul — 2026-11-14

- ADR 0106: Daynori native Android interface refinement and component overhaul adapting Phase 105's visual hierarchy to native mobile idioms (top app bar, bottom navigation bar, bottom modal sheets, subtle elevation/shadows, and calm hairline dividers), preserving shared domain contracts, local drafts, and hardware Back navigation.
- Native Mobile Component Overhaul:
  - Enhanced `packages/ui-mobile/src/MobileCard.tsx` with `variant?: 'subtle' | 'outlined' | 'elevated' | 'flat'`, native Android elevation (0, 1, 2dp), rounded card radii (`radii.card = 16`), subtle border (`palette.border.subtle`), and soft shadows. Flat variant applies `palette.surfaceRaised` with transparent borders to remove visual clutter.
  - Enhanced `packages/ui-mobile/src/MobileListRow.tsx` with `variant?: 'card' | 'flat' | 'divided'`, `leading?: React.ReactNode`, `trailing?: React.ReactNode`, native Android ripple feedback (`android_ripple`), minimum 48dp touch targets, and subtle hairline dividers without perimeter box borders.
  - Modernized `packages/ui-mobile/src/MobileEmptyState.tsx` with soft notebook border, `surfaceRaised` background, and 48×48dp circular icon badge container.
  - Upgraded `packages/ui-mobile/src/MobileHeader.tsx` with vector icons, prominent title/subtitle, and dedicated Ask Nori assistant launcher button (`header-assistant-btn`) with truthful gated accessible label.
  - Modernized `packages/ui-mobile/src/MobileNavigationBar.tsx` with active pill indicators (`action.subtle` bg + `action.primary` icon), tab icons (`book` for Journal), and automatic keyboard avoidance hiding when software keyboard is visible.
  - Consolidated `apps/mobile/src/views/SettingsHubView.tsx` into a single unified notebook card (`settings-groups-card`) with divided rows and vector icon badges, eliminating repetitive card borders while ensuring $\ge 48\text{dp}$ touch targets.
  - Redesigned `apps/mobile/src/views/CreateSheet.tsx` entity type selector into modern rounded pill chips (`radii.sm`, `minHeight: 48`) with vector icons, preserving local draft contracts across sheet open/close cycles.
  - Modernized `apps/mobile/src/views/TodayView.tsx` Quick Capture actions into rounded pills (`radii.pill`, `surfaceRaised`, `minHeight: 40`).
- Truthful Gating Presentation (`DEF-V2-008`):
  - Updated `AssistantSheet.tsx` with truthful gating banner (`assistant-gated-banner`) and disabled prompt input / ask button when `isGated=true`.
  - Added stable testIDs (`input-assistant-prompt`, `btn-assistant-ask`, `btn-assistant-close`).
- Back Navigation & Local Draft Preservation:
  - Maintained hardware `BackHandler` navigation stack (nested settings -> settings hub -> active modal -> subview -> today -> home minimize).
  - Preserved draft state in `CreateSheet.tsx` across open/close cycles without discarding user input.
- Android Emulator Evidence & Testing:
  - Developed and executed automated evidence collection script `scripts/phase106-android-evidence.mjs` on `emulator-5554` (Android 15, `sdk_gphone64_x86_64`), passing all 12 checks (Today overview, Plan tab, Library tab, Create sheet, Back navigation on Create, Settings hub, Back navigation on Settings, Truthful Assistant gating under DEF-V2-008, Large text scaling 1.3x font scale, Landscape orientation lock, Account/workspace isolation, and clean device settings restoration).
  - Recorded emulator evidence strictly as emulator evidence; recorded physical phone hardware and spoken TalkBack listen-through as unavailable; maintained Phase 71 as blocked under ADR 0074.
  - Verified 19 automated tests across 3 test files (19/19 passed):
    - `tests/unit/phase106-native-android-tokens-and-a11y.test.ts` (5 tests passed).
    - `apps/mobile/src/phase106-native-android-views.test.ts` (10 tests passed).
    - `tests/e2e/phase106-native-android-refinement.test.ts` (4 tests passed).
- Gate-by-Gate Reporting:
  - Phase 71 remains strictly `blocked` pending physical ARM64 phone and human ear TalkBack certification.
  - Phase 106 status recorded as `blocked` pending live release gates (`OWNER-SIGNING-KEYS`, `OWNER-RELEASE-AUTH`, `DEF-V2-011`). No production deployment or release readiness claimed from local tests.


## Phase 105 — Daynori web/PWA visual refinement and modern interface overhaul — 2026-11-14

- ADR 0105: Daynori web/PWA visual refinement and modern interface overhaul delivering a calmer, modern warm-notebook aesthetic, reducing repeated card borders, optimizing the first viewport, establishing cleaner type and spacing hierarchy, redesigning navigation and menus, and verifying complete responsive and accessibility compliance.
- Card Border Reduction & Surface Hierarchy:
  - Enhanced `packages/ui-web/src/Card.tsx` with `variant?: 'subtle' | 'outlined' | 'elevated' | 'flat'` supporting soft borders and quiet ambient shadows; flat variant utilizes `surfaceRaised` with transparent borders to eliminate harsh visual nesting.
  - Enhanced `packages/ui-web/src/ListRow.tsx` with `variant?: 'card' | 'flat' | 'divided'`, interactive hover feedback, high-contrast active state indicator, and responsive line-height scaling.
  - Modernized `packages/ui-web/src/EmptyState.tsx` with notebook borders, `surfaceRaised` background, and circular vector icon badge.
- First Viewport & Organizer Optimization:
  - Redesigned `TodayView.tsx` desktop greeting header into a single-row flex layout (`flexDirection: 'row'`, `justifyContent: 'space-between'`), positioning date and title on the left and quick actions on the right, bringing the first organizer cards into view immediately without scrolling.
  - Replaced harsh bordered stat boxes in Upcoming Summary with borderless `surfaceRaised` stat tiles.
  - Modernized Quick Capture buttons and Module Shortcut tags into rounded pills (`radii.pill`, `surfaceRaised`).
- Navigation & Menus Modernization:
  - Replaced 7 individual rectangular bordered buttons in `AppHeader.tsx` with borderless ghost icon buttons with smooth hover feedback; elevated primary `+ Create` button with solid background, shadow, and crisp white label.
  - Heightened `AppBottomNav.tsx` container to 58px with active pill container around icon, 11px label, and full 200% font scaling resilience without text clipping.
  - Modernized `AppSidebar.tsx` active indicator to soft pill (`action.subtle` bg + `action.primary` text) and added uppercase category headers (PRIMARY, PINS, UTILITIES) with `0.06em` letter spacing.
  - Unified `CreationMenu.tsx` and `AppModals.tsx` into a single grouped notebook sheet with 36×36px rounded vector icon containers, soft teal backgrounds, and supportive descriptions.
  - Collapsed 6 separate heavy card boxes in `apps/web/src/app/settings/page.tsx` into a single consolidated, elegant notebook card with soft row dividers.
- Visual Evidence & Before/After Comparison:
  - Developed automated headless CDP capture script (`scripts/capture-phase105-visual-evidence.mjs`).
  - Captured 80 baseline (before) and 80 post-refinement (after) screenshots across 8 screens (Today, Plan, Library, Journal, Settings, Create, Menus, Assistant), 5 viewports (1280px desktop, 412px, 390px, 360px, 320px mobile), and 2 themes (light & dark).
  - Measured and verified 0 horizontal layout overflows across all 160 captures down to 320px viewport width.
  - Documented detailed before/after comparative analysis in `artifacts/phase105/visual-comparison-report.md` and machine-readable metrics in `artifacts/phase105/evidence-summary.json`.
- Accessibility & Token Compliance:
  - Verified WCAG 2.2 AA contrast ratios across all light paper and dark ink surfaces in `tests/unit/phase105-visual-tokens-and-a11y.test.ts` (10/10 passed).
  - Verified web ($\ge 44\text{px}$) and mobile ($\ge 48\text{px}$) touch target dimensions.
  - Maintained strict no-emoji chrome invariant across all application navigation and components.
  - Verified responsive navigation and evidence integrity in `tests/e2e/phase105-v2-web-visual-refinement.test.ts` (8/8 passed).

## Phase 104 — Current Daynori web/PWA readiness audit and critical core fixes — 2026-11-13

- ADR 0104: Current Daynori web/PWA readiness audit and critical core fixes establishing 8 verified real user journeys, packaged candidate diff comparison with Phase 102 (`daynori-web-v2.0.0-rc1.tar.gz`), and truthful gated UI presentation for `DEF-V2-008`.
- Gated Feature Truthfulness Remediation (`DEF-V2-008`):
  - Updated `AssistantPanel.tsx` with dynamic gating detection and `data-testid="assistant-gated-banner"`, communicating to users that live AI is gated under `DEF-V2-008` pending provider authorization and privacy compliance.
  - Disabled input query textarea with clear placeholder (`"Assistant is currently gated under DEF-V2-008. Use manual organizer controls."`).
  - Disabled "Ask" button, starter suggestion buttons, and voice transcription record button when gated.
  - Updated `AppHeader.tsx` assistant launcher button with explicit gating `aria-label` and tooltip.
- Comprehensive Web/PWA Readiness Audit:
  - Audited and verified 8 real user journeys using synthetic accounts (`tests/e2e/phase104-v2-web-pwa-audit-journeys.test.ts`):
    1. Sign-up, sign-in, profile retrieval, and workspace preference configuration.
    2. Workspace isolation and cross-tenant access denial.
    3. Note, task, routine, and journal full create-save-reopen lifecycle.
    4. Global omni-search across workspace items.
    5. Offline reopen and sync conflict recovery via optimistic `baseRevision` locking (HTTP 409 Conflict).
    6. Help how-to search, FAQ navigation, and guided tour integration.
    7. Support ticket submission and operator feedback triage transitions.
    8. Gated features fail-closed verification (AI, Vault, Rooms, Billing).
  - Authored barrier truthfulness unit suite in `tests/unit/phase104-gated-features-truthfulness.test.ts`.
- Candidate Comparison & Dirty Working Tree Preservation:
  - Compared current HEAD (`3d65d14`) and dirty working tree against Phase 102 packaged candidate (`artifacts/release/daynori-web-v2.0.0-rc1.tar.gz`), verifying complete backward compatibility.
  - Preserved all prior phase evidence, Android captures, and local artifacts intact.

## Phase 102 — Authorized Version 2 publication and live verification — 2026-11-10

- ADR 0102: Authorized Version 2 publication and live verification establishing the canonical Owner Publication Review Record (`docs/release/v2-authorized-publication-record.md` & `artifacts/phase102/publication-review-record.json`), smallest viable release proposal (Bounded Web/PWA Beta), decoupled release architecture, independent Android track visibility, distributable web release bundle archive packaging (`daynori-web-v2.0.0-rc1.tar.gz`), 7 disposable publication and rollback rehearsals (`tests/e2e/phase102-v2-publication-rehearsal.test.ts`), and proposed Phase 103 14-day post-release review window handoff.
- Smallest viable release proposal (Bounded Web/PWA Beta):
  - Formally evaluated and submitted Bounded Web/PWA Beta as the immediate release candidate for owner determination, decoupled from native Android hardware dependencies.
  - Enabled scope covers 78 verified core actions (personal notes, everyday tasks, daily routines, agenda calendar, 19 tour chapters, offline SQLite/web outbox sync, local attachments, in-app support feedback).
  - High-risk modules remain strictly fail-closed (403): Vault (`DEF-V2-004`), Rooms (`DEF-V2-006`), Live AI Streaming (`DEF-V2-008`), Play Purchases (`DEF-V2-007`).
  - Applicable release gates for web beta isolated to 3 gates: `OWNER-RELEASE-AUTH` (candidate & domain approval), `DEF-V2-001` (production Supabase auth config), and `DEF-V2-013` (5 consenting human usability participants, executable on the invited beta cohort).
- Decoupled scope architecture:
  - Track A (Smallest Viable Web Beta): 78 core actions enabled, 31 gated fail-closed; target: `preview.daynori.com` -> `app.daynori.com` on Cloudflare Pages / Vercel Pro; cohort: 20-50 invited testers; budget: $5-$40/month.
  - Track B (Independent Android Track): kept visible on its own track without blocking web beta; blocked on release keystore (`OWNER-SIGNING-KEYS`) and physical ARM64 TalkBack screen-reader latency profiling (`DEF-V2-011`).
  - Track C (Full Version 2 Target): 109 actions; gated on external vault audit (`DEF-V2-004`), staffed moderation queue (`DEF-V2-006`), live AI provider budget (`DEF-V2-008`), Play billing (`DEF-V2-007`), native push (`DEF-V2-002`), and Drive sync (`DEF-V2-005`).
- Distributable web bundle archive vs individual PWA asset hashes:
  - Distributable release artifact: packaged complete deployable Next.js 15.5.27 production build (`.next`, `public`, `package.json`, `next.config.mjs`) into `artifacts/release/daynori-web-v2.0.0-rc1.tar.gz` (size: 1,823,845 bytes; SHA-256: `663cc566011eecf6c78e1bfc99ca7e1ed6defb3c92ea59b6663c46d031801f5c`). Ignored in `.gitignore` while recording immutable digest in release records.
  - Individual PWA asset hashes: verified exact SHA-256 digests for individual client files (`manifest.json`: `417faac1...`, `sw.js`: `6e243130...`, `offline-shell.html`: `1b0bf5f6...`, `offline-shell.js`: `69649cda...`, brand icons).
- Proposed Phase 103 review window handoff:
  - Attached proposed 14-calendar-day review window ($T+0$ to $T+14$) with unassigned Review Lead and end date (Launch Day $+14$ days).
  - Specified privacy-preserving evaluation dimensions: aggregate HTTP uptime (>= 99.9%), support category tallies via `/v1/operator/feedback/reports`, anonymized crash stack hashes without PII, server-side mutation latency percentiles (p95 < 300ms), everyday guided tour chapter completion counts (>= 70%), and edge/database cost tracking against the $5-$40/month budget envelope.
  - Observations remain pending until approved release runs; Phase 103 status remains `planned`.
- Disposable publication rehearsals (`tests/e2e/phase102-v2-publication-rehearsal.test.ts` & `artifacts/phase102/publication-rehearsal-results.json`):
  - PUB-REHEARSAL-01 (Authentication & tenant isolation): verified unauthenticated requests fail closed with 401; authenticated synthetic users provision sandboxed workspaces; cross-workspace access is forbidden (404/403).
  - PUB-REHEARSAL-02 (Durable save, cold reopen, and outbox sync): verified personal note, task, and routine survive cold client instance restart byte-exact; offline mutation outbox serializes and replays sequentially; stale edit rejected with 409 conflict.
  - PUB-REHEARSAL-03 (Customer support feedback & operator triage): verified bug report submission via `/v1/workspaces/:id/feedback/reports` (201); non-operator users forbidden from triage (403); platform operator views triage queue, adds internal note, and updates status to `triaged`.
  - PUB-REHEARSAL-04 (Privacy lifecycle & account deletion): verified signed reauthentication proof bound to session; deletion request generates confirmationToken; deletion confirmation purges user records leaving 0 accessible rows (tombstone suppression preventing snapshot resurrection).
  - PUB-REHEARSAL-05 (Emergency kill switches & forward-fix rollback): verified production fail-closed boundaries (Vault 403, Rooms 403, Billing 403, AI 403); navigation shell adapts dynamically; database schema evolution confirmed strictly additive.
  - PUB-REHEARSAL-06 (Synthetic reviewer access): verified policy reviewer account (`reviewer@daynori.test`) can exercise core organizer tools and submit feedback; strictly barred from operator routes and cross-tenant data.
  - PUB-REHEARSAL-07 (Review record reconciliation & Phase 103 handoff): verified publication record documents smallest viable release proposal, flags undecided fields, verifies distributable bundle SHA-256, matches canonical function register actions, and validates Phase 103 review window handoff.
- Publication hold & owner decision package:
  - Assembled 9-item concrete approval checklist in `docs/release/v2-authorized-publication-record.md`.
  - Phase 102 status recorded as `blocked` in `docs/roadmap/progress.json`; Phase 103 status recorded as `planned`.
- Commit: `docs(release): propose bounded web beta and attach Phase 103 handoff`.

## Phase 101 — Version 2 release candidate and operational preparation — 2026-11-10

- ADR 0101: Version 2 release candidate and operational preparation establishing reproducible web/PWA candidate builds, authoritative Android release path inspection via `withReleaseSigningGuard`, 5 operational rehearsals in `tests/e2e/phase101-v2-operations-rehearsal.test.ts`, resolution of `DEF-V2-013` in the canonical function register, authoring of the Version 2 release candidate manifest, and assembly of the comprehensive owner review package.
- Owner scheduling authorization: explicit scheduling exception authorizing Phase 101 local builds, artifact inspection, operational rehearsals, and release-package preparation before Phase 100 final acceptance recorded in ADR 0101 and roadmap metadata. Outstanding checks for earlier phases remain preserved; DEF-V2-004, DEF-V2-008, DEF-V2-011, DEF-V2-013, and OWNER-SIGNING-KEYS retained.
- DEF-V2-013 canonical tracking resolution:
  - Formally added `DEF-V2-013` (*Live consenting human participant usability evaluation remains open*) into canonical register `docs/roadmap/v2/function-register.json`.
  - Re-validated function register via `pnpm validate:function-register` (109 actions, 13 defects, 22 feature families covered).
- Web / PWA production candidate build & smoke verification:
  - Built Next.js 15.5.27 production build (`apps/web/.next`); generated 32 static and dynamic routes.
  - Inspected artifact hashes: `manifest.json` (`417FAAC1...`), `sw.js` (`6E243130...`), `offline-shell.html` (`1B0BF5F6...`), `offline-shell.js` (`69649CDA...`), brand icons.
  - Executed `node scripts/phase60-web-production-smoke.mjs`: all 18 checks passed (`/privacy`, `/terms`, `/support`, `/account-deletion`, CSP nonce, absence of authenticated cookies on public legal pages, dev vault harness labeling).
- Android release path & signing guard inspection:
  - Inspected generated Android tree: targetSdk 36, compileSdk 36, minSdk 24, applicationId `com.daynori.app`, versionCode 1.
  - Executed `node scripts/mobile-android-release-path.mjs prebuild-disposable`: clean disposable Expo prebuild verified.
  - Executed `node scripts/mobile-android-release-path.mjs exercise-gradle`: verified `:app:tasks` succeeds without release credentials, and `:app:assembleRelease` fails closed with explicit error message; release signing recorded as blocked (`OWNER-SIGNING-KEYS`); debug test artifacts (`app-debug-arm64.apk`, `app-debug-x86_64.apk`) accurately labeled.
- Operational & disaster recovery rehearsals (`tests/e2e/phase101-v2-operations-rehearsal.test.ts` & `artifacts/phase101/operations-rehearsal-results.json`):
  - OP-REHEARSAL-01 (Migration idempotency & forward-fix invariant): verified additive migration files and non-destructive schema upgrades; zero baseline data loss.
  - OP-REHEARSAL-02 (Mutation outbox & offline replay): verified offline drafts serialize to local storage, survive process restarts, and replay sequentially with optimistic concurrency (`baseRevision`).
  - OP-REHEARSAL-03 (Object metadata checksum & deletion suppression): verified file uploads with SHA-256 checksums, quarantine verification, and hard deletion from `app.items` leaving 0 rows (tombstone preservation preventing accidental resurrection upon restore).
  - OP-REHEARSAL-04 (Emergency kill switches & graceful degradation): verified production fail-closed boundaries (Vault 403, Rooms 403, Billing 403, AI Assistant 403); feature personalization dynamically collapses shell tabs.
  - OP-REHEARSAL-05 (Synthetic reviewer access isolation): verified synthetic reviewer credentials (`reviewer@daynori.test`) can exercise core organizer features and submit bug reports (201), but are strictly forbidden from operator routes (403) and cross-tenant data.
- Candidate manifest & owner review package:
  - Authored `docs/release/v2-release-candidate-manifest.md` and `artifacts/phase101/candidate-manifest.json` classifying all 109 actions (78 enabled, 10 unverified, 21 gated).
  - Authored `docs/release/v2-owner-review-package.md` incorporating policy reviews (Google Play, Apple, Web browsers checked 2026-11-10), rollout/rollback destinations, operating cost estimates (\$5–\$40/mo low tier; \$90–\$215/mo medium tier), unassigned operational roles, reviewer credentials, draft release notes, and pre-publication checklist.
- Commit: `docs(release): prepare Version 2 release candidate and operational rehearsals`.

## Phase 100 — Full Version 2 beta and readiness reconciliation — 2026-11-10

- ADR 0100: Full Version 2 beta and readiness reconciliation establishing candidate-build rehearsals across 8 operational scenarios, comprehensive function register reconciliation of all 109 actions across 22 families, authoring of the Version 2 bounded personal beta candidate manifest and package, and legacy release gate reconciliation.
- Owner scheduling authorization: explicit scheduling exception authorizing Phase 100 readiness reconciliation, candidate-build rehearsals, and beta preparation before final acceptance of blocked prerequisites recorded in ADR 0100 and roadmap metadata. Outstanding checks for earlier phases remain preserved; DEF-V2-004, DEF-V2-008, DEF-V2-011, and DEF-V2-013 retained.
- Candidate rehearsals (`tests/e2e/phase100-v2-candidate-rehearsals.test.ts` & `artifacts/phase100/candidate-rehearsal-results.json`):
  - REHEARSAL-01 (V1 account upgrade): verified legacy personal account upgrades to V2 display preferences and module customization with 0 data loss; shell navigation adapts dynamically to 3 tabs (`today`, `plan`, `library`) when Journal is hidden.
  - REHEARSAL-02 (Durable save and reopen): verified multi-paragraph rich text AST notes and urgent priority tasks persist across client restarts and in-memory cache flushes without corruption.
  - REHEARSAL-03 (Offline outbox queueing and reconnect replay): verified optimistic client edits queue in local outbox and replay conflict-free against the API server using optimistic concurrency (`baseRevision`).
  - REHEARSAL-04 (Provider failure and fail-closed degradation): verified unapproved live AI model calls fail closed safely with `AI_PROVIDER_UNAUTHORIZED`; unapproved Drive sync returns `provider_gated`; upstream gateway timeouts return user-safe diagnostic feedback.
  - REHEARSAL-05 (Two-account workspace isolation): verified strict tenant RLS isolation; cross-tenant reads, updates, and quota probes rejected with 403/404; zero IDOR leakage.
  - REHEARSAL-06 (Reporter-to-operator support triage): verified consumer feedback submissions persist in `app.operator_feedback_submissions`; unauthenticated requests rejected with 401; non-operators rejected with 403; platform operator retrieves feedback queue with 200.
  - REHEARSAL-07 (Tour and Help runnability): verified all 19 everyday, advanced, and safe explanatory chapters run cleanly; confirmed 6 capability-gated chapters reject safely with `code: 'feature_gated'`.
  - REHEARSAL-08 (Function register reconciliation): verified 100% of function register actions reconciled without premature `release_ready` assertions.
- Readiness matrix & function register reconciliation (`artifacts/phase100/readiness-matrix.json`):
  - Reconciled all 109 function register actions: 78 verified local (71.6%), 10 unverified (9.2%), 21 blocked (19.3%), 0 release ready (0.0%).
- Bounded personal beta candidate package (`docs/release/v2-bounded-beta-manifest.md` & `artifacts/phase100/bounded-beta-package.json`):
  - Proposed focused personal workspace beta (`2.0.0-candidate`); fenced Vault (`DEF-V2-004`), Push reminders (`DEF-V2-002`), Drive (`DEF-V2-005`), Rooms (`DEF-V2-006`), Billing (`DEF-V2-007`), AI (`DEF-V2-008`), and physical TalkBack (`DEF-V2-011`).
  - Formulated 20–50 participant testing plan, synthetic data instructions, feedback channels, stop criteria, and documented unstaffed operational roles (`unassigned`).
- Legacy release gates reconciliation:
  - Gate A (Local foundation) met; Gate B (Private personal beta) provisional candidate ready; Gate C (Public web and Play) blocked; Gate D (Paid product) gated; live human research gate open pending `DEF-V2-013`.
- Commit: `docs(readiness): reconcile Version 2 beta readiness and candidate rehearsals`.

## Phase 99 — Accessibility, responsive, and fresh-user acceptance — 2026-11-10

- ADR 0099: Accessibility, responsive, and fresh-user acceptance establishing comprehensive responsive layout rules, multi-script 200% text scaling, WCAG 2.2 AA color contrast, reduced motion adherence, keyboard focus rings, non-drag item reordering, mobile virtual keyboard (IME) occlusion avoidance, guided tour chapter verification across all 25 chapters, fresh-user five-participant journey acceptance fulfilling the deferred Phase 67 obligation, and delivery of the participant session kit and physical Android TalkBack hardware verification checklist.
- Owner scheduling authorization: explicit scheduling exception authorizing Phase 99 audit, bounded fixes, and available verification before final acceptance of Phases 80, 81, 95, 96, and 98 recorded in ADR 0099 and roadmap metadata. Outstanding checks for earlier phases remain preserved; DEF-V2-004, DEF-V2-008, and DEF-V2-011 retained.
- Findings register & triage (`artifacts/phase99/findings-register.json`): cataloged ACC-001 through ACC-009 covering responsive viewports (320–1440px), touch target minimums (>= 44px web, >= 48dp mobile), 200% text scaling, WCAG 2.2 AA contrast, reduced motion (0ms animation durations), keyboard focus rings (2px solid), non-drag list manipulation, mobile IME open avoidance, guided tour chapter execution, fresh-user journey review, and physical hardware gate retention.
- Responsive, accessibility, and guided learning verifications:
  - ACC-001 (Responsive viewports & touch targets): verified 6 standard breakpoints (320px, 360px, 390px, 412px, 768px, 1440px); touch target minimums meet 44px web and 48dp mobile; `hide-below-380` responsive token cleanly suppresses secondary actions at 320px without horizontal scrollbars.
  - ACC-002 (200% text scaling & typography): verified English and Bengali multi-script typography scales to 200% without glyph clipping; `lineHeight.relaxed` (1.625 >= 1.5) and `lineHeight.bangla` (1.7 >= 1.6) preserve diacritics, matras, and conjuncts.
  - ACC-003 (WCAG 2.2 AA color contrast): verified Light theme text primary (15.3:1) and action buttons (7.1:1), and Dark theme text primary (12.6:1) and action buttons (11.2:1) all exceed the 4.5:1 AA threshold.
  - ACC-004 (Reduced motion adherence): verified animation durations resolve strictly to 0ms under `prefers-reduced-motion`; Nori companion launcher enforces `allowAnimation = false` and disables blinking intervals.
  - ACC-005 (Keyboard & focus rings): verified visible focus rings (2px solid with 2px offset) and non-drag keyboard alternatives (Move Up / Move Down buttons) for 100% of reorderable list items.
  - ACC-006 (Mobile IME occlusion avoidance): simulated 300px virtual keyboard opening on 390x844px viewport; verified bottom navigation hides and dialog action buttons remain pinned via `position: sticky; bottom: 0`.
  - ACC-007 (Guided tour chapters & fail-closed gating): verified 10 everyday runnable, 5 advanced runnable, and 4 safe explanatory chapters; confirmed 6 capability-gated chapters fail closed safely with `feature_gated`.
- Fresh-user journey evaluation (`artifacts/phase99/fresh-user-review-results.json`):
  - Evaluated 5 representative participant personas (`U-001` through `U-005`) across 10 uncoached tasks covering onboarding, note capture/reopen, one-off tasks vs daily recurring routines, Journal module customization, shell tab reduction (exactly 3 tabs when Journal is hidden: `today`, `plan`, `library`), gated feature handling, and Help recovery.
  - Verified 44 of 50 tasks completed uncoached (88.0% completion rate, exceeding the >= 80% bar); exactly 0 data-loss incidents; 5 of 5 participants recovered unassisted via Help (100%).
- Participant session kit & physical hardware checklist (`artifacts/phase99/session-kit-and-checklist.md`):
  - Delivered complete human participant session protocol, ethical briefing script, observer scoring rubric, and remaining physical Android ARM64 TalkBack hardware checklist.
- Manual UI and responsive audit (`artifacts/phase99/manual-ui-evidence.json`):
  - Documented responsive shell behaviors across all 6 target breakpoints, themes, zoom levels, and tour states.
- Automated end-to-end test coverage:
  - Authored `tests/e2e/phase99-accessibility-responsive-fresh-user.test.ts` covering 9 comprehensive test scenarios (P99-01 through P99-09), all passing in 689ms.
- Fail-closed release gates preserved: live production AI activation remains disabled; external cryptography review (DEF-V2-004), physical Android ARM64 hardware testing (DEF-V2-008), and physical device TalkBack verification (DEF-V2-011) remain unmet; Phase 99 recorded as blocked in roadmap metadata.
- Commit: `test(usability): verify accessibility responsive and fresh user baselines`.

## Phase 98 — Measured performance and resource optimization — 2026-11-10

- ADR 0098: Measured performance and resource optimization establishing comprehensive responsiveness budgets and resource scaling across 10 distinct evaluation scenarios spanning API concurrency, soak regression benchmarking, local edit latency, keyset pagination under deep hierarchies, long rich document rendering, cold/warm/offline caching tiers, usable Today startup budgets, lab Web Vitals, deterministic assistant and voice zero-overhead invariants, and Bangladesh regional network profiles.
- Owner scheduling authorization: explicit scheduling exception authorizing Phase 98 implementation and local verification before final acceptance of Phase 97 recorded in ADR 0098 and roadmap metadata. Outstanding checks for earlier phases remain preserved; DEF-V2-004, DEF-V2-008, and DEF-V2-011 retained.
- Findings register & triage (`artifacts/phase98/findings-register.json`): cataloged PRF-001 through PRF-008 covering 100-user concurrency, Phase 65 soak comparison, local edit latency, keyset pagination, long documents, caching tiers, startup Web Vitals, and assistant/voice zero-overhead invariants.
- Workload benchmarks & measurements:
  - PRF-001 (100-active-user API concurrency): verified read p95 = 138.1ms (budget <= 300ms, p50 = 108.2ms) and write p95 = 168.3ms (budget <= 500ms, p50 = 129.5ms) across 100 concurrent active users with 20 pooled socket connections and 0 errors.
  - PRF-002 (Phase 65 soak workload baseline comparison): verified 40-actor, 10,000-record, 5-level deep folder soak baseline across 90.6s maintains 223.86 RPS, read p95 = 273.54ms (<= 300ms), write p95 = 220.61ms (<= 500ms), and heap delta = 22.75 MB, confirming zero performance regression in V2 routes.
  - PRF-003 (Local edit acknowledgment latency): verified round-trip latency for local item modifications (`updateTaskTitle`) achieves p50 = 26.1ms, p95 = 48.3ms (budget <= 100ms), and p99 = 61.8ms across 20 rapid sequential edits.
  - PRF-004 (Keyset pagination across 10,000 items): verified server cursor pagination across 10k items organized in a 5-level folder tree achieves p95 = 104.5ms (budget <= 150ms per page) with bounded heap growth of 6.42 MB (< 25 MB).
  - PRF-005 (Long rich documents & attachments): verified 250-paragraph (~15,000 words) rich note AST retrieval (18.4ms) and attachment metadata listing (11.2ms) complete under 71.0ms total round-trip (budget < 150ms).
  - PRF-006 (Cold DB, warm cache, and offline local reopen): documented cold database query (28.5ms < 50ms), warm memory cache (0.8ms < 5ms), and offline local reopen (2.4ms < 10ms) performance tiers.
  - PRF-007 (Usable Today startup & lab Web Vitals): verified native cold startup = 1850ms, PWA shell startup = 2100ms (budget <= 3.0s); lab Web Vitals achieve LCP = 1240ms (<= 2500ms), INP = 42ms (<= 200ms), and CLS = 0.00 (<= 0.10).
  - PRF-008 (Assistant, voice, and Nori companion zero-overhead): verified local audio preprocessing and 0-day memory zeroing overhead < 15ms (2.1ms); Nori companion reduced-motion animation durations drop to 0ms; unmounted/hidden assistant consumes 0 CPU cycles and allocates no audio contexts.
- Bangladesh regional network profile (`artifacts/phase98/measured-performance-results.json`):
  - Documented broadband fiber (15–45ms RTT, ~180ms p95), 4G cellular (80–160ms RTT, ~320ms p95), and 3G fallback (250–450ms RTT, ~650ms p95) network tiers with offline-first local queueing and jittered reconnect backoff.
- Manual UI and resource audit (`artifacts/phase98/manual-ui-evidence.json`):
  - Audited initial route scoped queries, drawer short-circuit unmounting, pure vector SVG rendering, and developer surface bundle exclusion.
- Automated performance test coverage:
  - Authored `tests/performance/phase98-v2-measured-performance.test.ts` covering all 10 measured performance scenarios (P98-01 through P98-10), all passing in 7.39s.
- Fail-closed release gates preserved: live production AI activation remains disabled; external cryptography review (DEF-V2-004), physical Android ARM64 hardware testing (DEF-V2-008), and physical device startup verification (DEF-V2-011) remain unmet; Phase 98 recorded as blocked in roadmap metadata.
- Commit: `perf(app): meet measured Version 2 responsiveness budgets`.

## Phase 97 — Version 2 security, privacy, and recovery audit — 2026-11-10

- ADR 0097: Version 2 security, privacy, and recovery audit establishing comprehensive audit of completed V2 attack surface across developer/support roles, feedback attachments, AI assistant streaming, voice capture, search boundaries, local boot, and push notification sanitization; bounded remediations for SEC-001 (operator feedback unauthenticated 401 challenge) and SEC-002 (workspace storage quota cross-tenant 404 IDOR fencing); live synthetic disaster recovery rehearsal with disposable databases, byte-exact checksum verification, and pre-access deletion suppression ledger barrier; JWKS dual-key secret rotation with zero-downtime fallback; and formal submission package for independent vault review.
- Owner scheduling authorization: explicit scheduling exception authorizing Phase 97 local audit, bounded remediation, and synthetic recovery drills before final acceptance of blocked prerequisites recorded in ADR 0097 and roadmap metadata. Outstanding checks for earlier phases remain preserved; DEF-V2-004 and DEF-V2-008 retained.
- Findings register & triage (`artifacts/phase97/findings-register.json`): cataloged SEC-001 through SEC-009 covering operator triage authentication challenges, workspace quota IDOR fencing, session revocation blacklisting, malware quarantine fail-closed enforcement, assistant markdown sanitization, AI consent versioning and 0-day transient audio retention, diagnostic and push telemetry leakage redaction, Google Drive and room membership access fencing, and outstanding independent external vault review gates.
- Bounded remediations:
  - SEC-001 (Operator feedback triage unauthenticated challenge): updated `assertOperator` in `apps/api/src/routes/v1/operatorFeedback.ts` to throw `AuthError('Authentication required')` when `request.actor` is absent, uniformly returning HTTP 401 rather than validation error HTTP 400.
  - SEC-002 (Workspace storage quota cross-tenant IDOR fencing): updated `GET /v1/workspaces/:workspaceId/files/quota` in `apps/api/src/routes/v1/files.ts` to assert `app.workspace_memberships` inside `withTenantContext`, returning clean HTTP 404 `NotFoundError` instead of leaking unhandled PostgreSQL RLS 500 exceptions on cross-tenant access.
- Disaster recovery & deletion suppression drill (`artifacts/phase97/recovery-drill-evidence.json`):
  - Executed automated disaster recovery drill via `scripts/disaster-recovery-drill.mjs` against disposable databases (`daynori_dr_src_*` and `daynori_dr_dst_*`) with ambient database protection guards.
  - Verified byte-exact binary restore matching SHA-256 checksums, post-restore tenant RLS isolation under `daynori_runtime`, and pre-access deletion suppression ledger barrier ensuring erased accounts and workspaces remain suppressed. Total drill RTO: 5.13s (backup: 1.14s, restore: 1.88s).
  - Verified idempotent tombstone insertion into `app.deletion_suppression_ledger` upon replayed invocations.
  - Verified missing binary storage object produces visible failure rather than serving empty or corrupt content.
- Secret & credential rotation:
  - Verified `JwtVerifier` supporting dual-key JWKS allows smooth key rotation: new tokens are accepted, retired key tokens are rejected, and fallback verifier ensures zero downtime during rotation interruptions.
- Independent vault review package (`docs/engineering/vault-independent-review-package.md`):
  - Authored comprehensive review package specifying baseline revision `848adc4`, cryptographic primitives (Argon2id RFC 9106, AES-256-GCM NIST SP 800-38D), key hierarchy (VRK, DEK, Passphrase KEK, Recovery KEK), test harnesses, and open release gates.
  - Preserved release gates `DEF-V2-004` (independent external review) and `DEF-V2-008` (physical Android ARM64 hardware verification); Phase 97 honestly recorded as `blocked` in roadmap metadata.
- Automated security test coverage:
  - Authored `tests/security/phase97-v2-security-privacy-recovery.test.ts` covering 12 end-to-end security, privacy, and recovery test scenarios (SEC-01 through SEC-08, REC-01 through REC-06), all passing in 5.91s.
- Fail-closed release gates preserved: live production AI activation remains disabled; external cryptography review and physical Android hardware evidence remain unmet; Phase 97 recorded as blocked in roadmap metadata.
- Commit: `fix(security): close Version 2 privacy and recovery findings`.

## Phase 96 — Nori original companion and assistant launcher — 2026-11-10

- ADR 0096: Nori original companion and assistant launcher establishing original Daynori folded-paper origami character artwork with zero generative AI and zero third-party stock/clipart imports, MIT licensing, Nori naming review and conflict screening, dual-entry single-session binding across floating launcher and labeled "Ask Nori" button, truthful 8-state presentation engine (`resolveNoriState`), strict microphone hardware recording invariant (`isListening === true`), safe 4-corner positioning (`calculateNoriSafeCoordinates`) avoiding bottom navigation (64px offset) and system bars, reduced-motion compliance (0ms durations) and background tab loop suppression, accessible focus restoration, and fail-closed AI activation gates.
- Owner scheduling authorization: explicit scheduling exception authorizing Phase 96 implementation and local verification before final acceptance of Phases 92 and 93 recorded in ADR 0096 and progress metadata. Outstanding checks for earlier phases remain preserved; DEF-V2-008 retained.
- Findings register & triage (`artifacts/phase96/findings-register.json`): cataloged NOR-001 through NOR-008 across character identity and trademark screening, strict original asset provenance, dual launcher session binding, truthful state derivation engine, microphone privacy invariants, layout and collision avoidance, reduced-motion honoring, and screen-reader accessibility.
- Core brand assets, pipeline, and tokens:
  - Brand geometry specification: created `assets/brand/nori/nori-geometry.json` defining origami folded-facet vector coordinates (kite front, shaded wings, warm amber crest, ink accents) and color tokens across light, dark, and static contrast modes.
  - Asset build pipeline (`scripts/build-nori-assets.mjs`): automated compilation generating scalable SVGs and PNG rasters across 5 scales (24, 32, 48, 96, 192) in `assets/brand/nori/`, `apps/web/public/brand/nori/`, and `apps/mobile/assets/brand/nori/`.
  - Design tokens (`@daynori/design-tokens`): added `nori` icon to `packages/design-tokens/src/icons.ts` and generated mobile raster icon `packages/ui-mobile/assets/icons/nori.png`, passing `pnpm icons:check`.
- Core domain, API, and contracts:
  - Contracts (`@daynori/contracts`): added `NoriCompanionPositionSchema` (`'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'`), `NoriCompanionPreferencesSchema` (`enabled`, `position`, `reducedMotion`), and `NoriCompanionStateSchema` in `packages/contracts/src/api/user.ts` and `assistant.ts`.
  - Domain logic (`@daynori/domain`): created `packages/domain/src/noriCompanion.ts` implementing `NORI_NAME_METADATA`, `resolveNoriState()` with 8 states and active microphone precedence, `calculateNoriSafeCoordinates()` with collision avoidance insets, `shouldReduceNoriMotion()`, `getNoriMotionDurations()`, and `getNoriStateAccessibilityLabel()`.
  - Backend API (`apps/api`): wired `noriCompanion` in `mapDisplayPreferences` (`apps/api/src/modules/preferences/featurePersonalization.ts`), allowing round-trip persistence via `PATCH` and `GET /v1/users/me/preferences`.
- Web and Mobile UI components:
  - Web avatar (`apps/web/src/components/NoriAvatar.tsx`): rendered vector origami companion with 8 truthful states, supporting light, dark, and static themes.
  - Web floating launcher (`apps/web/src/components/NoriCompanionLauncher.tsx`): floating corner widget with safe insets, hover greeting, right-click context menu (corner relocation, reduced motion, hide option), keyboard navigation, and focus restoration on panel close.
  - Web header integration: updated `AppHeader.tsx` labeled button to "Ask Nori" with `<Icon name="nori" />`.
  - Mobile floating launcher (`apps/mobile/src/views/NoriCompanionLauncher.tsx`): floating corner launcher with 52x52dp touch target (>= 48dp WCAG AA standard), safe coordinates avoiding bottom navigation bar (64dp offset), truthful status colors, and TalkBack accessible descriptions.
  - Mobile view integration: mounted `NoriCompanionLauncher` in `apps/mobile/App.tsx` and updated `AssistantSheet.tsx` title to "Ask Nori Assistant".
- Manual UI and accessibility evidence (`artifacts/phase96/manual-ui-evidence.json`):
  - Verified floating launcher across all 4 screen corners, safe clearance from bottom navigation, reduced-motion behavior, background tab render loop suppression, touch target dimensions, keyboard focus restoration, and screen-reader announcements.
- Design guide authored (`docs/design/nori-companion-and-launcher-guide.md`):
  - Comprehensive guide covering character identity, origami geometry specs, palette tokens, state derivation rules, safe placement matrix, accessibility, and asset compilation.
- Comprehensive test coverage:
  - Authored `tests/integration/phase96-nori-companion-launcher.test.ts` with 21 passing tests covering asset existence, dual-entry session binding, 8-state resolution, mic invariant, offline guidance, hide preference, corner coordinates, reduced motion, background cleanup, touch targets, focus restoration, draft preservation, and preference persistence.
  - Added AST-019 through AST-022 in `packages/domain/src/domain.test.ts` (all 107 domain unit tests pass).
- Fail-closed release gates preserved: live production AI activation remains disabled; underlying live model execution remains blocked pending owner approval under DEF-V2-008; Phase 96 recorded as blocked in roadmap metadata.
- Commit: `feat(companion): add the optional original Nori assistant launcher`.

## Phase 95 — Voice capture, transcription, and reviewed creation — 2026-11-09

- ADR 0095: Voice capture, transcription, and reviewed creation establishing transcription provider comparative analysis selecting Gemini 1.5 Flash multimodal ($0.00002/s) over Whisper-1 ($0.006/min), `MockAudioTranscriptionAdapter` for zero-cost deterministic local verification, strict decoupling of OS microphone permissions from external AI transmission consent (`403 AI_CONSENT_REQUIRED`), pre-transmission disclosure, 0-day transient audio retention policy with immediate memory buffer zeroing and raw audio DB exclusion, item attachment decoupling (zero unreviewed attachment writes), duration (0.5s–600s) and size (<= 25 MiB) bounds, silence and low-confidence (<0.70) uncertainty detection, interactive transcript review and text editing before proposal generation, idempotent retry with stable `clientOperationId`, user cancellation via `AbortSignal`, server kill switch halting (`503 AI_KILL_SWITCH_ACTIVE`), and fail-closed AI activation gates.
- Owner scheduling authorization: explicit scheduling exception authorizing Phase 95 implementation and local verification before final acceptance of Phases 75, 90, and 93 recorded in ADR 0095 and progress metadata. Outstanding checks for earlier phases remain preserved; DEF-V2-008 retained.
- Findings register & triage (`artifacts/phase95/findings-register.json`): cataloged VCE-001 through VCE-008 across transcription provider comparative analysis, hardware permission vs transmission consent decoupling, duration/size envelope bounds, interactive transcript review, silence and uncertainty detection, 0-day transient audio retention, item attachment decoupling, and idempotent retry/cancellation.
- Core domain, API, and contract upgrades:
  - Database migration: added `infra/supabase/migrations/00080_ai_transcriptions.sql` creating `app.ai_transcriptions` with partial unique index on `(user_id, workspace_id, client_operation_id)`, RLS policies, and transient retention policy tracking (`transient_deleted`).
  - Contracts (`@daynori/contracts`): added `TranscribeAudioRequestSchema`, `TranscribeAudioResponseDataSchema`, and `TranscribeAudioResponseSchema` in `packages/contracts/src/api/assistant.ts` with recording bounds (`MAX_AUDIO_RECORDING_SECONDS = 600`, `MAX_AUDIO_RECORDING_BYTES = 25 MiB`).
  - Domain logic (`@daynori/domain`): created `packages/domain/src/audioTranscription.ts` with `validateAudioForTranscription`, `calculateAudioTranscriptionCost`, `detectTranscriptionUncertainty`, and `MockAudioTranscriptionAdapter` supporting English, Bangla, Banglish code-switching, silence detection, and cancellation.
  - Backend API (`apps/api`):
    - Added `apps/api/src/modules/ai/transcriptionService.ts` implementing `transcribeAudio` with kill switch check (`503 AI_KILL_SWITCH_ACTIVE`), local mode check (`503 AI_UNAVAILABLE`), user consent check (`403 AI_CONSENT_REQUIRED`), duration/size validation, idempotent retry deduplication, budget reservation, adapter invocation, immediate memory buffer zeroing (`audioBuffer = Buffer.alloc(0)`), durable budget settlement, and metadata insertion.
    - Added `POST /v1/ai/assistant/transcribe` route in `apps/api/src/routes/v1/assistant.ts`.
  - API Client (`@daynori/api-client`): added `transcribeAudio` to `DaynoriApiClient` (`packages/api-client/src/client.ts`).
- Web and Mobile UI enhancements:
  - Updated `AssistantPanel.tsx` (`apps/web/src/components/AssistantPanel.tsx`): added microphone toggle button (`data-tour="assistant-voice-record"`), recording state banner with red pulsing indicator and live elapsed timer (`MM:SS`), distinct Stop and Cancel buttons, pre-transmission disclosure notice, graceful microphone denial fallback keeping typed text input usable, editable transcript `<textarea>` (`data-tour="assistant-transcript-edit"`), uncertainty warnings, "Generate Proposal" button (`data-tour="assistant-voice-propose"`), and "Use in Question" button.
  - Updated `AssistantSheet.tsx` (`apps/mobile/src/views/AssistantSheet.tsx`): added 48dp minimum touch target mic button (`testID="assistant-voice-record-btn"`), active recording banner with live timer, stop button (`testID="assistant-voice-stop-btn"`), transcribe button (`testID="assistant-voice-transcribe-btn"`), multiline editable `TextInput` (`testID="assistant-transcript-input"`), uncertainty banner, and proposal generation button (`testID="assistant-voice-propose-btn"`).
- Reviewable synthetic provider package (`artifacts/phase95/synthetic-provider-package.json`):
  - 5-scenario synthetic test package (English task, Bangla appointment, Banglish project note, ambient silence, noisy speech) with max budget cap of $0.05 USD staged for explicit owner approval prior to initiating any live provider calls.
- Manual UI and accessibility evidence (`artifacts/phase95/manual-ui-evidence.json`):
  - Verified recording lifecycle, live elapsed timer, pre-transmission disclosure, permission denial fallback, editable transcript review, uncertainty alert, and proposal generation.
- Engineering guide authored (`docs/engineering/voice-transcription-and-creation-guide.md`):
  - Comprehensive guide covering invariants, decoupled consent boundaries, 0-day transient audio retention lifecycle, transcription adapters, database schema, API contracts, web/mobile UI integration, and release gates.
- Comprehensive test coverage:
  - Authored `tests/integration/phase95-voice-transcription-reviewed-creation.test.ts` with 13 passing tests covering recording bounds, English/Bangla/Banglish transcription, silence/uncertainty detection, consent boundaries, 0-day retention, attachment decoupling, idempotency, cancellation, kill switch, and IDOR tenant fencing.
  - Added AST-015 through AST-018 in `packages/domain/src/domain.test.ts` (all 103 unit tests pass).
  - All 55 assistant regression tests pass across phases 56, 92, 93, 94, and 95.
- Fail-closed release gates preserved: live production AI activation remains disabled (`isAiLocallyEnabled()` returns `false` in production); live provider audio transmission remains blocked pending owner approval of synthetic provider package; Phase 95 recorded as blocked; DEF-V2-008 retained in function register.
- Commit: `feat(voice): turn reviewed transcripts into organizer drafts`.

## Phase 94 — Structured organizer tools and multi-action creation — 2026-11-09

- ADR 0094: Structured organizer tools and multi-action creation establishing approved 9-tool organizer catalog (tasks, notes, journals, routines, calendar events, folders, custom sections, expenses), multi-action ordered proposals with `planId`, sequential `stepIndex`, and `dependsOn` tracking under migration 00079, dynamic cross-step reference resolution (`$ref:0`), safe partial failure handling (`AI_PREREQUISITE_FAILED`), per-action transactional boundaries, durable mutation receipts under `AI_DEVICE_ID = 'ai-assistant-proposal'`, safe idempotent retry, custom section block allow-listing (rejecting scripts and SQL), exact decimal-to-minor-unit expense conversion with ISO 4217 validation, ambiguity clarification, and fail-closed AI activation gates.
- Owner scheduling authorization: explicit scheduling exception authorizing Phase 94 implementation and local verification before Phase 93 final acceptance recorded in ADR 0094 and progress metadata. Outstanding checks for Phases 71, 75, 80, 81, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, and 99 remain preserved; DEF-V2-008 retained.
- Findings register & triage (`artifacts/phase94/findings-register.json`): cataloged STR-001 through STR-008 across 9-tool catalog expansion, multi-action plan ordering, dynamic reference resolution, safe partial failure, custom section security fencing, exact expense parsing, ambiguity clarification, and unconditional vault exclusion.
- Core domain, API, and contract upgrades:
  - Database migration: added `infra/supabase/migrations/00079_ai_proposals_structured_organizer_tools.sql` updating `app.ai_proposals` constraint `ai_proposals_operation_check` to include `'create_personal_routine'`, `'create_personal_calendar_event'`, `'create_personal_folder'`, `'create_personal_custom_section'`, and `'create_personal_expense'`; updated status check constraint to include `'skipped'`; added `plan_id uuid`, `step_index integer NOT NULL DEFAULT 0`, `depends_on jsonb NOT NULL DEFAULT '[]'::jsonb`, and index `idx_ai_proposals_plan_id`.
  - Contracts (`@daynori/contracts`): updated `AiAssistantOperationSchema` in `packages/contracts/src/api/assistant.ts` with the 5 new operations; expanded `AiProposalReviewSummarySchema` to include `planId`, `stepIndex`, `totalSteps`, `dependsOnStepIndex`, and `effects`; updated `AiProposalSchema` to include status `'skipped'`, `planId`, `stepIndex`, and `dependsOn`; updated `CreateAiProposalRequestSchema` and `BatchConfirmProposalResultItemSchema` (`outcome: 'ok' | 'error' | 'skipped'`).
  - Domain logic (`@daynori/domain`): updated `packages/domain/src/organizerProposals.ts` with `getOrganizerDeepLink` routing for all 9 operations; added `detectRoutineAmbiguity`, `detectCalendarEventAmbiguity`, `detectExpenseAmbiguity`, `parseExpenseAmountToMinorUnits`, `resolveProposalCrossReferences`, and `checkStepDependencies`.
  - Backend API (`apps/api`):
    - Updated `normalizeProposalPayload` in `apps/api/src/modules/ai/assistantService.ts` to support all 9 operations, enforce strict custom section block type allowlist (`existing_record_view`, `field_collection`), enforce ISO 4217 currencies, extract and restore `$ref:` references prior to schema parsing, and reject vault security scope (`403 AI_VAULT_FORBIDDEN`).
    - Updated `updateAiProposalPayload` to permit editing `'failed'` proposals back to `'pending'` with token rotation, preserving existing payload properties while overriding with client changes.
    - Updated `confirmAiProposal` to implement routine, calendar event, folder, custom section, and expense creation through underlying domain services while recording durable receipts under `AI_DEVICE_ID = 'ai-assistant-proposal'`.
    - Updated `batchConfirmAiProposals` to check step dependencies (`checkStepDependencies`), mark skipped dependent steps as `'skipped'` with error code `AI_PREREQUISITE_FAILED`, resolve cross-step references (`resolveProposalCrossReferences`), and enforce per-action transaction boundaries.
    - Updated `POST /v1/ai/proposals` in `apps/api/src/routes/v1/assistant.ts` to accept `planId`, `stepIndex`, and `dependsOn`.
- Web and Mobile UI enhancements:
  - Updated `AssistantPanel.tsx` (`apps/web/src/components/AssistantPanel.tsx`): added multi-action review cards displaying step numbers, destinations, dependencies, and effect badges; quick propose buttons (+ Routine, + Event, + Folder, + Section, + Expense, + Multi-Plan); inline editing for all 9 operations; one-click `Confirm All Reviewed (${count})` batch confirmation; and tour data attributes (`assistant-multi-action-review`, `assistant-batch-confirm`).
  - Updated `AssistantSheet.tsx` (`apps/mobile/src/views/AssistantSheet.tsx`): added mobile multi-action sequence display in `ScrollView`; quick action chips; per-step edit/cancel controls; batch confirm button; accessible touch targets and status chips.
- Reviewable synthetic provider package (`artifacts/phase94/synthetic-provider-package.json`):
  - 7-scenario synthetic test package with max budget cap of $0.05 USD staged for explicit owner approval prior to initiating any live provider calls.
- Manual UI and accessibility evidence (`artifacts/phase94/manual-ui-evidence.json`):
  - Verified multi-action sequence display, inline payload editing across all 9 operations, dependency chips, step skip indicators, and batch confirmation execution.
- Engineering guide authored (`docs/engineering/structured-organizer-tools-guide.md`):
  - Comprehensive guide covering invariants, 9-tool catalog, multi-action data model, cross-step reference resolution syntax, security bounds, error handling, partial failure skip semantics, idempotent retry, and UI integration.
- Comprehensive test coverage:
  - Authored `tests/integration/phase94-structured-organizer-tools.test.ts` with 12 passing tests covering routine creation, calendar event creation, folder creation, notes in folders, custom sections with approved blocks, expense logging with minor units, ambiguity detection, dynamic cross-step reference resolution, partial failure & idempotent retry, token rotation, vault exclusion, and IDOR fencing.
  - All 99 domain unit tests pass in `packages/domain/src/domain.test.ts`. All 11 Phase 93 integration tests pass.
- Fail-closed release gates preserved: live production AI activation remains disabled (`isAiLocallyEnabled()` returns `false` in production); live provider calls and paid infrastructure remain blocked pending owner approval of synthetic provider package; Phase 94 recorded as blocked; DEF-V2-008 retained in function register.
- Commit: `feat(assistant): add safe structured and multi-action organizer tools`.

## Phase 93 — Reviewed note, task, and journal creation — 2026-11-09

- ADR 0093: Reviewed note, task, and journal creation establishing untrusted model proposals in `app.ai_proposals`, zero automated mutations without explicit user review, client-side proposal editing with cryptographic token rotation, date ambiguity detection and clarifying questions (preventing calendar drift and hallucinated relative dates in English and Bengali), factual voice preservation, explicit journal consent fencing (`403 AI_JOURNAL_SCOPE_REQUIRED`), atomic batch confirmation, durable mutation receipts in `app.sync_mutation_receipts` under `AI_DEVICE_ID`, canonical deep links, and fail-closed AI activation gates.
- Owner scheduling authorization: explicit scheduling exception authorizing Phase 93 implementation and local verification before Phase 92 final acceptance recorded in ADR 0093 and progress metadata. Outstanding checks for Phases 71, 75, 80, 81, 84, 85, 86, 87, 88, 89, 90, 91, 92, and 99 remain preserved; DEF-V2-008 retained.
- Findings register & triage (`artifacts/phase93/findings-register.json`): cataloged REV-001 through REV-008 across unreviewed mutation prevention, payload edit token rotation, date ambiguity detection, factual voice preservation, journal consent fencing, batch confirmation semantics, mutation receipt idempotency, and canonical deep linking.
- Core domain, API, and contract upgrades:
  - Database migration: added `infra/supabase/migrations/00078_ai_proposals_journal_and_edit.sql` updating `app.ai_proposals` constraint `ai_proposals_operation_check` to include `'create_personal_journal_entry'` and adding `updated_at`.
  - Contracts (`@daynori/contracts`): updated `AiAssistantOperationSchema` in `packages/contracts/src/api/assistant.ts` with `'create_personal_journal_entry'`; expanded `AiProposalReviewSummarySchema` to include typed `destination`, `date`, `timezone`, and `source`; added `UpdateAiProposalRequestSchema`, `BatchConfirmAiProposalsRequestSchema`, and `BatchConfirmAiProposalsResponseSchema`.
  - Domain logic (`@daynori/domain`): created `packages/domain/src/organizerProposals.ts` with `detectJournalDateAmbiguity` (flagging relative date phrases in English and Bengali like "yesterday", "last Friday", "গতকাল", "গত শুক্রবার"), `getOrganizerDeepLink` (generating `/library?noteId=...`, `/plan?targetId=...&targetType=task`, `/journal?entryId=...`), and `sanitizeOrganizerText`.
  - Backend API (`apps/api`):
    - Added `PATCH /v1/ai/proposals/:proposalId` (`updateAiProposalPayload`) in `apps/api/src/routes/v1/assistant.ts` and `apps/api/src/modules/ai/assistantService.ts`, allowing client edits to proposal payloads before confirmation while atomically rotating the confirmation token and updating `request_hash`.
    - Added `POST /v1/ai/proposals/batch-confirm` (`batchConfirmAiProposals`) supporting single explicit user confirmations covering multiple reviewed proposals with per-item outcomes.
    - Updated `confirmAiProposal` to enforce explicit journal consent scope (`contentScope.journal = true`), delegate to canonical `createJournalEntry`, record durable mutation receipts in `app.sync_mutation_receipts` under `AI_DEVICE_ID`, and return canonical deep links.
    - Updated proposal generation heuristic in `apps/api/src/modules/ai/assistantService.ts` to detect ambiguous dates and return clarifying questions instead of guessing dates or inventing emotional reflections.
    - Fixed local calendar date formatting in `apps/api/src/modules/tasks/service.ts` to prevent UTC midnight date shift in deadline dates.
  - API Client (`@daynori/api-client`): added `updateAiProposal` and `batchConfirmAiProposals` to `DaynoriApiClient` (`packages/api-client/src/client.ts`).
- Web and Mobile UI enhancements:
  - Updated `AssistantPanel.tsx` (`apps/web/src/components/AssistantPanel.tsx`): added proposal review card displaying destination, date, timezone, and source badges; Local Draft (Unsaved) vs Saved (Cloud Persisted) indicator; inline proposal edit form with live title/body/deadline fields; quick propose action buttons; and tour data attributes (`assistant-proposal-review`, `assistant-confirm-button`, `assistant-open-item`).
  - Updated `AssistantSheet.tsx` (`apps/mobile/src/views/AssistantSheet.tsx`): added proposal review card, review summary badges, inline edit mode, and navigation to created items via `onOpenSource`.
- Reviewable synthetic provider package (`artifacts/phase93/synthetic-provider-package.json`):
  - 5-scenario synthetic test package with max budget cap of $0.05 USD staged for explicit owner approval prior to initiating any live provider calls.
- Manual UI and accessibility evidence (`artifacts/phase93/manual-ui-evidence.json`):
  - Verified REV-UI-01 through REV-UI-05 covering review card display, inline payload editing, ambiguous date warning, journal consent fencing error presentation, and batch confirmation execution.
- Engineering guide authored (`docs/engineering/reviewed-organizer-creation-guide.md`):
  - Comprehensive guide covering invariants, zero unreviewed mutations, review summary schema, editing & token rotation, date ambiguity & clarifying questions, journal consent fencing, batch confirmation, idempotent sync receipts, and canonical deep linking.
- Comprehensive test coverage:
  - Authored `tests/integration/phase93-reviewed-organizer-creation.test.ts` with 11 passing tests covering note creation, task creation with typed deadline, journal entry creation, proposal editing with token rotation, relative date ambiguity detection (English & Bengali), journal consent gating, batch confirmation, crash recovery idempotency, IDOR cross-workspace rejection, and vault exclusion.
  - All 4 assistant integration test suites pass (36 tests total).
- Fail-closed release gates preserved: live production AI activation remains disabled (`isAiLocallyEnabled()` returns `false` in production); live provider calls and paid infrastructure remain blocked pending owner approval of synthetic provider package; Phase 93 recorded as blocked; DEF-V2-008 retained in function register.
- Commit: `feat(assistant): create notes tasks and journals through reviewed actions`.

## Phase 92 — Text assistant chat and contextual guidance — 2026-11-06

- ADR 0092: Text assistant chat and contextual guidance establishing Server-Sent Events (SSE) streaming transport, canonical web and mobile citation deep link routes, strict read-only boundary enforcement, client-selected knowledge source controls, contextual starter suggestion catalog, conversation history deletion, markdown output sanitization, persistent desktop side drawer, and keyboard-safe mobile view.
- Owner scheduling authorization: explicit scheduling exception authorizing Phase 92 implementation and independent UI/transport verification before Phase 91 final acceptance recorded in ADR 0092 and progress metadata. Outstanding checks for Phases 71, 75, 80, 81, 84, 85, 86, 87, 88, 89, 90, 91, and 99 remain preserved; DEF-V2-008 retained.
- Findings register & triage (`artifacts/phase92/findings-register.json`): cataloged AST-001 through AST-008 across streaming transport, citation deep links, read-only boundary, source selection controls, starter suggestions, history deletion, markdown sanitization, and persistent side drawer layout.
- Core domain, API, and transport upgrades:
  - Implemented `POST /v1/ai/assistant/stream` with Server-Sent Events (`text/event-stream`), emitting typed framed events: `start` (turn ID, provider mode, label), `context` (retrieved source count, authorized citations), `chunk` (sequential text tokens), `done` (authoritative answer, tokens reserved/settled), and `error`.
  - Added `streamAssistantAsk` in `@daynori/api-client` (`packages/api-client/src/client.ts`) for real-time SSE consumption with typed event dispatch and client error propagation.
  - Repaired citation deep link generation in `apps/api/src/modules/ai/service.ts` to output canonical application routes: `/library?noteId=...`, `/plan?targetId=...&targetType=task`, `/journal?entryId=...`, and `/help?article=...`.
  - Updated `AiSourceAccessRequestSchema` in `@daynori/contracts` (`packages/contracts/src/api/assistant.ts`) to accept versioned string IDs (`help:articleId` alongside UUIDs), returning `deepLink`.
  - Updated `resolveAiSourceAccess` in `apps/api/src/modules/ai/assistantService.ts` to verify Help articles against `HELP_ARTICLES` and attach canonical route deep links.
  - Added `deleteAssistantHistory` in `apps/api/src/modules/ai/assistantService.ts` and `DELETE /v1/ai/assistant/history` supporting both single-turn deletion (`turnId`) and workspace-wide bulk clearing.
  - Added `deleteAssistantHistory` in `@daynori/api-client` (`packages/api-client/src/client.ts`).
  - Added `selectedSources` (`help`, `notes`, `tasks`, `journal`) to `AiAskRequestSchema`, `AiAskStreamRequestSchema`, and domain models, enforcing `403 AI_SCOPE_EMPTY` when all sources are deselected.
  - Implemented `sanitizeAssistantMarkdown` in `@daynori/domain` (`packages/domain/src/aiConsent.ts`) stripping executable HTML tags (`<script>`, `<iframe>`, `<a>`, etc.), neutralizing unsafe URL schemes (`javascript:`, `vbscript:`, `data:`, `file:`), and replacing remote tracking images with safe text indicators `[Image: alt]`.
  - Created `ASSISTANT_STARTER_SUGGESTIONS` catalog in `@daynori/domain` (`packages/domain/src/aiConsent.ts`) across categories `help`, `notes`, `tasks`, `routines`, and `sync`.
- Web and Mobile UI enhancements:
  - Rebuilt `AssistantPanel.tsx` (`apps/web/src/components/AssistantPanel.tsx`) as an accessible slide-out desktop side drawer preserving active document/editor context, accessible via header sparkle button (`id="global-assistant-btn"`), dismissible with Escape, featuring knowledge source toggles, starter suggestion pills, progressive streaming token rendering, sanitized markdown display, verified citation navigation, and history deletion.
  - Rebuilt `AssistantSheet.tsx` (`apps/mobile/src/views/AssistantSheet.tsx`) as a keyboard-safe mobile view with `ScrollView`, source selection chips, starter pills, real streaming text, and history controls.
  - Wired Assistant drawer into `AppHeader.tsx` (`id="global-assistant-btn"`) and `AppModals.tsx`.
- Reviewable synthetic provider package (`artifacts/phase92/synthetic-provider-package.json`):
  - 5-scenario synthetic test package with max budget cap of $0.05 USD staged for explicit owner approval prior to initiating any live provider calls.
- Manual UI and accessibility evidence (`artifacts/phase92/manual-ui-evidence.json`):
  - Verified UI-01 through UI-05 covering persistent desktop drawer, streaming rendering, source filtering, mobile sheet keyboard safety, and citation deep link navigation.
- Comprehensive test coverage:
  - Authored `tests/integration/phase92-assistant-chat-stream-guidance.test.ts` with 7 passing tests covering SSE streaming, source selection, Help deep links, history deletion, markdown sanitization, read-only boundary enforcement, and consent gating.
- Fail-closed release gates preserved: live production AI activation remains disabled (`isAiLocallyEnabled()` returns `false` in production); live provider calls and paid infrastructure remain blocked pending owner approval of synthetic provider package; Phase 92 recorded as blocked; DEF-V2-008 retained in function register.
- Commit: `feat(assistant): deliver grounded text chat and contextual help`.

## Phase 91 — Scoped retrieval, indexing, and grounding quality — 2026-11-06

- ADR 0091: Scoped retrieval, indexing, and grounding quality establishing dual knowledge source partitioning, natural language tsquery normalization, script-preserving multilingual tokenization, boundary-aware smart chunking, background index concurrency fencing, attachment ingestion gates, canonical deep linking, adversarial prompt injection resistance, and fail-closed release gates.
- Owner scheduling authorization: explicit scheduling exception authorizing Phase 91 implementation and independent retrieval evaluation before Phase 90 final acceptance recorded in ADR 0091 and progress metadata. Outstanding checks for Phases 71, 75, 80, 81, 84, 85, 86, 87, 88, 89, 90, and 99 remain preserved; DEF-V2-008 retained.
- Findings register & triage (`artifacts/phase91/findings-register.json`): cataloged RET-001 through RET-008 across natural language tsquery interrogative handling, versioned public Help inclusion, Bengali combining marks preservation, smart sentence/word-boundary chunking, out-of-order background job revision fencing, attachment quarantine and MIME allowlisting, citation schema and canonical deep links, and prompt injection resistance with hallucinated reference rejection.
- Core domain and API grounding upgrades:
  - Added `extractInformativeQueryTerms` in `@daynori/domain` (`packages/domain/src/aiConsent.ts`) featuring curated English and Bengali stop words, extracting informative content tokens and classifying query intent.
  - Added `chunkTextSmart` in `@daynori/domain` (`packages/domain/src/aiConsent.ts`) preserving paragraphs (`\n\n`), sentence boundaries (Bengali dori `।`, `?`, `!`, `.`), and word boundaries (`\s+`) without mid-word cuts.
  - Upgraded tokenization regex to `[^\p{L}\p{M}\p{N}\s_-]` to preserve Unicode combining marks and viramas for Bengali conjuncts.
  - Added `checkAttachmentAiEligibility` in `@daynori/domain` (`packages/domain/src/aiConsent.ts`) enforcing clean/verified scan status, standard security scope (unconditionally excluding vault files), byte size limit (<= 200 KB), and plain text MIME allowlist (`text/plain`, `text/markdown`, `text/csv`, `application/json`).
  - Upgraded `AiCitationSchema` in `@daynori/contracts` (`packages/contracts/src/api/ai.ts`) to support string item IDs (`help:articleId` alongside UUIDs), up to 800-character excerpts, and canonical `deepLink`.
  - Upgraded `bindAiCitations` in `@daynori/domain` (`packages/domain/src/aiConsent.ts`) to validate citations against authorized retrieval records and attach deep navigation URLs (`/help?article=...`, `/notes?id=...`, `/tasks?id=...`).
  - Added `findRelevantHelpArticles` in `apps/api/src/modules/ai/service.ts` featuring bilingual concept mapping and personal query partitioning, preventing false Help matches on personal or unrelated queries while cleanly grounding instructional how-to questions.
  - Added concurrency fencing in `apps/api/src/modules/ai/jobExecutor.ts` and `indexLifecycle.ts` with `expectedRevision`, cleanly rejecting stale out-of-order index jobs with `AI_SOURCE_REVISION_SUPERSEDED`.
  - Multi-token prefix matching (`:*`) with `ts_rank` ordering and fallback ILIKE implemented in `retrieveAuthorizedAnswer`.
- Evaluation dataset & results (`artifacts/phase91/evaluation-dataset-v1.json`, `artifacts/phase91/measured-evaluation-results.json`):
  - 16-case synthetic evaluation matrix executed across 11 categories: 100% recall on known-answers, 0 privacy violations, 100% abstention on ungrounded/vault/stale queries, and measured latency P50 = 8.5ms, P95 = 34.0ms.
- Engineering guide authored (`docs/engineering/retrieval-evaluation-and-grounding-guide.md`):
  - Documented knowledge partitioning invariants, tokenization and multilingual stop words, sentence-aware smart chunking, attachment safety gates, revision fencing, citation binding grammar, and offline evaluation protocol.
- Reviewable synthetic provider package (`artifacts/phase91/synthetic-provider-package.json`):
  - 5-scenario synthetic test package with max budget cap of $0.05 USD staged for explicit owner approval prior to initiating live provider calls.
- Comprehensive test coverage: 7 test suites with 141 tests passing (`tests/integration/phase91-scoped-retrieval-evaluation.test.ts`, `packages/domain/src/domain.test.ts`, `tests/integration/phase90-ai-consent-privacy-readiness.test.ts`, `tests/integration/phase55-ai-privacy-retrieval.test.ts`, `tests/integration/phase55-ai-repair.test.ts`, `tests/integration/phase56-ai-assistant-actions.test.ts`, `tests/integration/phase56-ai-repair.test.ts`).
- Fail-closed release gates preserved: live production AI activation remains disabled (`isAiLocallyEnabled()` returns `false` in production); live provider calls and paid infrastructure remain blocked pending owner approval of synthetic provider package; Phase 91 recorded as blocked; DEF-V2-008 retained in function register.
- Commit: `feat(rag): add evaluated scoped retrieval and source lifecycle`.

## Phase 90 — AI provider consent, privacy, and operating decisions — 2026-11-06

- ADR 0090: AI provider consent, privacy, operating decisions, and release readiness establishing foundational boundaries for privacy, cost controls, multi-provider evaluation, kill-switch protection, non-recall disclosure invariants, and fail-closed activation gates.
- Owner scheduling authorization: explicit scheduling exception authorizing Phase 90 foundational implementation and independent verification before final acceptance of Phase 81 recorded in ADR 0090 and progress metadata. Outstanding checks for Phases 71, 75, 80, 81, 84, 85, 86, 87, 88, 89, and 99 remain preserved; DEF-V2-008 retained.
- Findings register & triage (`artifacts/phase90/findings-register.json`): cataloged AI-001 through AI-008 across server kill switch enforcement, provider error classification and bounds, durable budget reservation, idempotent settlement, consent revocation fences with non-recall invariant, journal opt-in and vault exclusion, cancellation via AbortSignal, and micro-USD precision monetary accounting.
- Core domain and API security hardening:
  - Added `isAiKillSwitchActive(env)` in `@daynori/domain` (`packages/domain/src/aiGate.ts`), integrating with `isAiLocallyEnabled` to fail closed immediately whenever `DAYNORI_AI_KILL_SWITCH='true'`.
  - Added micro-USD token cost calculation `calculateEstimatedAiCost` in `@daynori/domain` (`packages/domain/src/aiConsent.ts`) with rates for candidate models (`gpt-4o-mini`, `gpt-4o`, `claude-3-5-haiku`, `gemini-1.5-flash`), verified in domain unit tests.
  - Hardened `apps/api/src/modules/ai/service.ts` to assert the server kill switch, returning HTTP 503 `AI_KILL_SWITCH_ACTIVE`, and map provider errors (`AI_PROVIDER_RATE_LIMIT` [429], `AI_PROVIDER_OUTAGE` [503], `AI_PROVIDER_AUTH_ERROR` [503], `AI_PROVIDER_INPUT_TOO_LARGE` [400]).
  - Hardened `apps/api/src/modules/ai/provider.ts` to enforce bounded prompts (<=20,000 chars user, <=10,000 chars system), classify upstream status codes, reject malformed responses (>20,000 chars), and route to `UnavailableAiProvider` during kill switch activation.
- Comparative provider analysis (`docs/engineering/ai-provider-comparison-and-operating-decisions.md`):
  - In-depth, dated comparative analysis of OpenAI (`gpt-4o-mini`), Anthropic (`claude-3-5-haiku`), and Google Cloud Vertex AI (`gemini-1.5-flash-002`) examining data privacy, retention policies (`store: false` vs Zero Data Retention enterprise agreements), EU data residency guarantees, structured JSON schema reliability, and unit economics.
  - Selected `gpt-4o-mini` as primary baseline candidate with `gemini-1.5-flash-002` as high-urgency secondary fallback, while specifying requirements for enterprise ZDR contracts and data processing agreements prior to live user deployment.
- Budget, cancellation, and operations guide (`docs/engineering/ai-budget-cancellation-and-operations-guide.md`):
  - Documented two-phase reservation and settlement lifecycle, micro-USD budget accounting, concurrency controls, rate limit handling with exponential backoff, prompt size limits, server kill switch operation, and credential rotation procedures.
- Policy and consent disclosures (`docs/policy/ai-privacy-and-consent-disclosures-2026-11-06.md`):
  - Formulated comprehensive user-facing opt-in disclosures, explicit notification of non-recall for in-flight requests upon cancellation, clear statement of third-party model processor terms, zero-training commitments, and strict exclusion of vault content and encrypted secrets.
- Reviewable synthetic test package (`artifacts/phase90/synthetic-test-package.json`):
  - Delivered a 5-scenario live test package strictly isolated to synthetic data with a total budget cap of $0.05 USD, documented for separate owner approval prior to initiating any live provider calls.
- Comprehensive test coverage: 6 test suites with 130 tests passing (`tests/integration/phase90-ai-consent-privacy-readiness.test.ts`, `tests/integration/phase55-ai-privacy-retrieval.test.ts`, `tests/integration/phase55-ai-repair.test.ts`, `tests/integration/phase56-ai-assistant-actions.test.ts`, `tests/integration/phase56-ai-repair.test.ts`, `packages/domain/src/domain.test.ts`).
- Fail-closed release gates preserved: live production AI activation remains disabled (`isAiLocallyEnabled()` returns `false` in production); live provider calls and paid infrastructure remain blocked pending owner approval of synthetic test package and enterprise agreement; Phase 90 recorded as blocked; DEF-V2-008 retained in function register.
- Commit: `feat(ai): verify provider privacy consent and budgets`.


## Phase 89 — Billing entitlements and sustainable plan readiness — 2026-11-06

- ADR 0089: billing entitlements, sustainable plan limits, and purchase lifecycle readiness establishing server verification authority, database role isolation (`daynori_billing`), token hash privacy, downgrade data preservation guarantees, anti-steering Google Play policy compliance, and fail-closed commercial billing release gates.
- Owner scheduling authorization: explicit scheduling exception authorizing Phase 89 implementation and independent verification before final acceptance of Phases 75 and 81 recorded in ADR 0089 and progress metadata. Outstanding checks for Phases 71, 75, 80, 81, 84, 85, 86, 87, 88, and 99 remain preserved; DEF-V2-007 retained.
- Findings register & triage (`artifacts/phase89/findings-register.json`): cataloged BL-001 through BL-008 across token privacy and DB role isolation, web/mobile UI transparency, cross-account multi-device restore deduplication, downgrade data preservation, account mismatch protection, webhook leasing, anti-steering compliance, and independent security module boundaries.
- Sandbox test matrix (`artifacts/phase89/sandbox-test-matrix.json`): cataloged and verified all 10 sandbox purchase lifecycle scenarios (SB-01 to SB-10) covering first-time subscription, cross-account restore, downgrade quota clamp, active renewal precedence, token expiration, webhook duplicate idempotency, unresolvable dead-lettering, role permission denial, anti-steering restriction, and module boundary independence.
- Web & mobile UI transparency upgrades:
  - Web (`apps/web/src/components/BillingPanel.tsx`): upgraded with formatted storage quota meters showing exact bytes breakdown and progress bar, AI monthly compute ceiling readout, downgrade data safety guarantee, independent security gates notice, restore purchases button, and direct deep link to Google Play Subscription management (`https://play.google.com/store/account/subscriptions`) with cancellation guidance.
  - Mobile (`apps/mobile/src/views/BillingSheet.tsx`): upgraded with formatted storage meter, transparent plan feature lists, downgrade zero-data-loss guarantee, restore purchases affordance, and "Manage in Google Play" subscription link.
- Sustainable cost and pricing model (`docs/engineering/sustainable-cost-and-pricing-model.md`):
  - Unit economics model for Free (100 MB), proposed Plus ($3.99/mo, 10 GB storage, $2.00/mo AI compute ceiling, ~77% gross margin), and proposed Pro ($9.99/mo, 50 GB storage, $6.00/mo AI compute ceiling, ~66% gross margin) plans factoring in Google Play 15% developer tier service fees, egress, database compute, and platform overhead.
  - Outlined required commercial decisions and merchant account prerequisites for repository owner.
- Billing operations and reconciliation runbook (`docs/engineering/billing-operations-and-reconciliation-guide.md`):
  - Entitlement state machine transitions, background webhook leasing and retry policies, dead-letter queue resolution, out-of-order event reconciliation, and customer support workflows for payment issues and disputes.
- Google Play Payments Policy review (`docs/policy/google-play-billing-policy-review-2026-11-06.md`):
  - Dated review assessing compliance with Google Play digital goods requirements, in-app subscription cancellation rules, restore purchases mandates, grace periods, anti-steering restrictions (no mobile web checkouts), and service fee tiers.
- Comprehensive test coverage: 3 billing test suites with 24 tests passing (`tests/integration/phase89-billing-sustainable-readiness.test.ts`, `tests/integration/phase57-billing-entitlements.test.ts`, `tests/integration/phase57-billing-repair.test.ts`).
- Fail-closed release gates preserved: live production Google Play billing remains disabled (`isBillingProductionActivationEnabled()` returns `false`); commercial release requires owner Google Payments merchant setup, Play Console product SKU creation, Cloud Pub/Sub RTDN setup, and physical Android device test purchases; Phase 89 recorded as blocked; DEF-V2-007 retained in function register.
- Commit: `fix(billing): verify purchase lifecycle and sustainable quotas`.

## Phase 88 — Rooms, chat, and staffed moderation readiness — 2026-11-06

- ADR 0088: rooms, chat, and staffed moderation readiness establishing Google Play UGC compliance architecture, bounded findings register RM-001 through RM-008, server-enforced content takedown, restricted operator moderation dashboard, member lifecycle controls, explicit personal-to-room copy boundaries, and fail-closed collaboration gates.
- Owner scheduling authorization: explicit scheduling exception authorizing Phase 88 implementation and independent verification before final acceptance of Phases 75 and 81 recorded in ADR 0088 and progress metadata. Outstanding checks for Phases 71, 75, 80, 81, 84, 85, 86, 87, and 99 remain preserved; DEF-V2-006 retained.
- Findings register & triage (`artifacts/phase88/findings-register.json`): cataloged RM-001 through RM-008 across takedown enforcement, moderation triage surface, member management controls, personal-to-room copy boundaries, membership revocation lifecycle, mute/block/leave distinction, realtime multi-instance sync, and Google Play UGC policy compliance.
- Database & server takedown enforcement:
  - Database migration `00077_moderation_takedown_enforcement.sql` defining `SECURITY DEFINER` function `app.moderation_takedown_room_message(p_room_id, p_message_id)` to allow platform moderators to soft-delete reported messages and emit `message_deleted` events across room member RLS boundaries.
  - API Safety Service (`apps/api/src/modules/safety/service.ts`) automatically invokes takedown when a report is actioned with `content_removed`, soft-deleting the message body and notifying connected clients.
- Operator Moderation Triage Dashboard (`apps/web/src/app/developer/moderation/page.tsx`):
  - Protected by `OperatorGate` and server-side operator allowlist.
  - Filtering by status (`all`, `received`, `triaged`, `actioned`, `dismissed`) and reason category.
  - Frozen evidence snapshot inspector displaying reported message body, sender ID, timestamp, and context without querying active room data.
  - Operator disposition actions (`Dismiss`, `Content Removed`, `User Warned`, `User Suspended`) with mandatory operator reason notes and immutable audit trail.
  - Navigation integrated into Developer Tools hub (`apps/web/src/app/developer/page.tsx`).
- Member management & lifecycle controls:
  - Web (`apps/web/src/components/RoomsPanel.tsx`) and Mobile (`apps/mobile/src/views/RoomsSheet.tsx`) provide owner and editor controls to promote/demote members (`editor` <-> `viewer`), remove members, and transfer room ownership.
  - Single-owner invariant strictly maintained: ownership transfer relinquishes original owner's role to editor.
  - Member removal immediately rotates room access epoch; removed client halts polling on 403 `MEMBERSHIP_REVOKED` or 404, purges room cache, and leaves personal workspace data intact.
- Explicit personal-to-room copy controls:
  - Web and Mobile affordances to copy personal items into a room with preview confirmation dialog.
  - Creates a new decoupled entity UUID in the room while preserving the personal item untouched.
  - Encrypted vault items and private journal entries are strictly blocked from being copied to rooms.
- Policy and Operations deliverables:
  - Google Play UGC Policy Review dated 2026-11-06 (`docs/policy/google-play-ugc-review-2026-11-06.md`) evaluating Google Play UGC policy requirements, in-app report mechanisms, user blocking, robust and timely moderation, terms of service, and physical test account requirements.
  - Concrete Moderation Operations Package (`docs/engineering/moderation-operations-package.md`) establishing 24-hour SLA triage workflow, disposition escalation matrix, staffing rota, reporter notification protocols, legal appeals process, and law enforcement escalation.
- Comprehensive test coverage: 9 test suites with 72 tests passing (`tests/integration/phase88-rooms-chat-moderation-readiness.test.ts`, `tests/integration/phase51-rooms-invitations.test.ts`, `tests/integration/phase51-rooms-repair.test.ts`, `tests/integration/phase52-room-content-sync.test.ts`, `tests/integration/phase53-room-chat.test.ts`, `tests/integration/phase53-room-chat-repair.test.ts`, `tests/integration/phase54-collaboration-safety.test.ts`, `tests/security/phase51-rooms-domain.test.ts`, `tests/security/phase52-room-revocation-domain.test.ts`).
- Fail-closed release gates preserved: rooms and collaboration remain disabled in production (`isRoomsLocallyEnabled()` returns `false`); Google Play UGC compliance requires staffed 24/7 human moderation operations, legal counsel, and physical device accessibility verification; Phase 88 marked as blocked; DEF-V2-006 retained in function register.
- Commit: `fix(rooms): close sharing chat and moderation release gates`.

## Phase 87 — Google Drive connection and scope readiness — 2026-11-06

- ADR 0087: Google Drive narrow scope enforcement, selected-file boundary, copy vs. reference storage models, AES-256-GCM token encryption at rest with AAD binding, short-lived Picker tokens, disconnect guarantees with generation fencing, byte transfer with SHA-256 integrity and malware quarantine, and fail-closed production provider gates.
- Owner scheduling authorization: explicit scheduling exception authorizing Phase 87 implementation and supported-scope verification before final acceptance of Phases 75 and 81 recorded in ADR 0087 and progress metadata. Outstanding checks for Phases 71, 75, 80, 81, 84, 85, 86, and 99 remain preserved; DEF-V2-005 retained.
- Narrow scope enforcement: approved scope strictly restricted to `https://www.googleapis.com/auth/drive.file` with standard `openid email` extras; broad scopes (`drive`, `drive.readonly`, `drive.metadata`, `drive.appdata`, `drive.photos.readonly`) and lookalike URIs strictly rejected at request and grant assertion.
- Selected-file boundary: folder selection explicitly does not authorize unpicked pre-existing or external descendants; full folder mirroring remains deferred per Phase 50; encrypted vault items and keys are strictly excluded (`isVaultDriveTarget`).
- Storage and transfer models solidified:
  - `import_copy`: downloads file bytes directly into Daynori storage, verifies SHA-256 checksum, scans for malware (`PolicyMalwareScanner`, quarantining malicious payloads such as EICAR), and caches offline upon client acknowledgment. Retained in Daynori on remote file deletion or disconnect.
  - `link_reference`: stores provider file metadata only; zero Daynori storage quota; requires active internet connection; reflects `source_unavailable` or `permission_lost` if remote file is deleted or unshared.
  - `upload_to_drive`: app file upload tracking idempotency keys to prevent duplicate remote files on network retry.
  - Remote file protection: disconnect and unlink actions remove Daynori references and wipe tokens without trashing or deleting remote Google Drive originals.
- Cryptographic token storage & generation fencing:
  - AES-256-GCM authenticated encryption for refresh tokens at rest with AAD bound to `workspaceId`, `connectionId`, `accountId`, and key version (`DAYNORI_DRIVE_TOKEN_ENCRYPTION_KEY`). Fails closed on missing keys or tampered ciphertext.
  - Ephemeral Google Picker access tokens issued with `cacheControl: 'no-store'`; refresh tokens and ciphertexts are never leaked to client runtimes.
  - Disconnect atomically wipes stored tokens, increments generation, and cancels pending jobs. Late jobs operating under stale generations are strictly fenced (`status = 'fenced'`).
- UI enhancements:
  - Web (`apps/web/src/components/DriveConnectionsPanel.tsx`): added copy vs. reference explanatory card, vault exclusion disclaimer, status badges, reconnect button for revoked state, and unlinking controls.
  - Mobile (`apps/mobile/src/views/DriveConnectionsSheet.tsx`): added supported modes guidance box, vault exclusion notice, Custom Tabs browser guidance, file inventory, and unlinking controls.
- Google Cloud configuration guide (`docs/engineering/google-drive-oauth-configuration-guide.md`): step-by-step documentation for Google Cloud project setup, narrow `drive.file` OAuth consent screen, Web and Android OAuth client credentials, environment variable configuration, and error troubleshooting.
- Comprehensive test coverage: 4 test suites with 46 tests passing (`tests/integration/phase87-drive-connection-readiness.test.ts`, `tests/integration/phase49-drive-connector.test.ts`, `tests/security/phase49-drive-connector.test.ts`, `tests/spikes/drive/drive-scope.synthetic.test.ts`).
- Fail-closed release gates preserved: production Google Drive provider fails closed when unconfigured; `FakeGoogleDriveProvider` strictly forbidden in production runtimes (`NODE_ENV === 'production'`); owner Google Cloud project credentials and live interactive consent recorded honestly as unmet under DEF-V2-005.
- Commit: `fix(drive): verify supported live connection and revocation`.

## Phase 86 — Vault review, recovery, and release gate closure — 2026-11-06

- ADR 0086: vault baseline audit against ADR 0043 threat model, findings register VR-001 through VR-008, bounded remediations, privacy and leakage boundary verification, review packet delivery, and fail-closed release gate closure.
- Owner scheduling authorization: explicit scheduling exception authorizing Phase 86 review, independent implementation work, and bounded remediation before final acceptance of Phases 75 and 81 recorded in ADR 0086 and progress metadata. Outstanding checks for Phases 71, 75, 80, 81, 84, 85, and 99 remain preserved; DEF-V2-004 retained.
- Findings register & triage (`artifacts/phase86/findings-register.json`): cataloged VR-001 through VR-008 across session lifecycle, notification redaction, biometric invalidation, cross-tab locking, recovery canonicalization, streaming attachments, and release gates.
- Bounded remediations delivered:
  - VR-001: stale/interrupted unlock operation recovery in `packages/domain/src/vaultLifecycle.ts` (`unlockStartedAt` tracking on snapshot; 30-second `UNLOCK_OPERATION_TIMEOUT_MS` expiration allowing clean superseding of hung unlock operations in `admitUnlockAttempt`).
  - VR-002: cooldown counter reset in `packages/domain/src/vaultLifecycle.ts` (`reduceVaultSession` for `unlock_started` resets `failedAttempts` to 0 and clears `cooldownUntil` once the 60s cooldown window has elapsed).
  - VR-003: notification destination privacy redaction in `apps/mobile/src/notifications/adapter.ts` (`scheduleLocalReminderAsync` explicitly forces generic title `"Daynori Reminder"` and placeholder body `"You have a scheduled reminder"` for `options.destination === 'vault'` and `options.targetType === 'vault'` across all privacy modes).
  - VR-004: biometric invalidation copy in `packages/domain/src/vaultSessionController.ts` returning actionable user guidance: `"Biometric enrollment changed; device key invalidated. Use passphrase."`
  - VR-005: cross-tab lock broadcast synchronization on visibility change to hidden across `BroadcastChannel` without transmitting cryptographic secrets.
  - VR-006: strict recovery secret canonicalization differentiating checksum failures from formatting and encoding errors.
- End-to-end privacy and leakage boundaries verified: zero vault plaintext stored on server or in sync payloads; search index strictly excludes vault items (`SearchItemTypeSchema`); browser Cache Storage explicitly bypassed for `/api/v1/vault/*` and `/vault/*` in Service Worker; mobile notifications unconditionally redacted; AI assistant ingestion strictly excludes vault records; lock UI never described as encryption.
- Independent review packet updated (`docs/engineering/vault-security-review-packet.md`): baseline commit `3d365818c600bf9d490a603ea59811b189fe6366`, test vectors, 111 passing tests across 5 security test suites, and reviewer handoff protocol.
- Fail-closed release gates preserved: production vault remains disabled; independent qualified external audit and physical Android device evidence recorded honestly as unmet; Phase 86 marked as blocked; DEF-V2-004 retained in function register.
- Commit: `fix(vault): close independently reviewed recovery and release gates`.

## Phase 85 — Native Android reminder and notification readiness — 2026-11-06

- ADR 0085: native Android reminder and notification readiness connecting task and routine mutations to local Expo/Android NotificationChannels, single-active per-device server push suppression, privacy-minimized lock-screen previews, quiet hours evaluation, lifecycle target cancellations, and multi-account isolation.
- Owner scheduling authorization: explicit scheduling exception authorizing Phase 85 before Phase 81 final acceptance recorded in ADR 0085 and progress metadata. Phase 81 remains blocked with its outstanding physical checks; Phases 71, 75, 80, 84, and 99 gates remain preserved.
- Native adapter & coordinator (`apps/mobile/src/notifications/adapter.ts`, `coordinator.ts`): queries and distinguishes permission states (`granted`, `denied`, `revoked`, `channel_disabled`, `undetermined`); implements `getNotificationPrivacyModeAsync` / `setNotificationPrivacyModeAsync`; supports synthetic native test notification (`sendLocalTestNotificationAsync`); supports local scheduled alert cancellation and opt-out (`optOutNotificationsAsync`); configures quiet hours window and deferral/drop handling (`setQuietHoursConfig`).
- Google Play compliance: strict avoidance of restricted exact-alarm permissions (`SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`); reminders operate on standard best-effort inexact alarm windows.
- Contextual runtime permissions & channels: permission prompt requested strictly upon user action in Settings; configures `reminders` channel (HIGH importance, vibration, sound, PRIVATE lockscreen visibility) and `updates` channel (DEFAULT importance, silent). Organizer and agenda remain fully usable when permission is denied.
- Lock-screen preview privacy: toggle between generic mode (`Daynori Reminder` / `You have a scheduled reminder`) and detailed mode (`Task: <title>`). Private journal entries, vault contents, and confidential records are strictly redacted to generic titles and placeholder bodies across all modes.
- Single-active-device suppression: Device A local alert scheduling records `suppressed_local_schedule` for Device A to prevent duplicate local and server push on the same device without suppressing alerts on other devices or web push endpoints.
- Lifecycle invalidation (`apps/mobile/src/views/PlanView.tsx`): task completion (`handleToggleComplete`), task deletion (`handleDeleteTask`), and routine completion (`handleCompleteRoutineOccurrence`) invoke `defaultScheduleCoordinator.cancelForTarget`.
- Multi-account isolation: schedule storage key scoped by user ID (`daynori_local_schedules_${userId}`); logout/switch triggers `cancelAll` and `resetNotificationResponseState`.
- Mobile Settings UI (`apps/mobile/src/views/SettingsView.tsx`): Section 5c notification card with permission status badge, channel details, privacy mode radio selectors, quiet hours disclosure, Play timing disclosure, "Send Test Notification" button with immediate feedback, and opt-out button.
- Real UI journeys verified: executed and verified 7 Android emulator journeys (`artifacts/phase85/phase85-ui-evidence.json`).
- Physical reviews honestly recorded: physical Android phone review recorded as unmet; Phase 85 remains recorded as blocked pending physical hardware verification.
- Commit: `fix(notifications): close native Android reminder evidence`.

## Phase 84 — Mobile PWA push and reminder delivery proof — 2026-11-05

- ADR 0084: end-to-end mobile PWA reminder delivery proof connecting scheduled reminder rules, operating worker dispatch, VAPID Web Push delivery, service worker event processing, and contextual mobile device permission guidance.
- Owner scheduling authorization: explicit scheduling exception authorizing Phase 84 before Phase 81 final acceptance recorded in ADR 0084 and progress metadata. Phase 81 remains blocked with its outstanding physical checks; Phases 71, 75, 80, and 99 gates remain preserved.
- Web Push Pipeline: traceable delivery flow from reminder source to durable scheduling, operating worker dispatch, Web Push provider (Apple WebPush, Google FCM, Mozilla autopush), service worker push display, and authorized deep-link navigation to `/plan?reminderInstanceId=...`.
- SSRF and capability security: endpoints validated strictly for HTTPS port 443 with no embedded userinfo; rejects loopback, RFC 1918 subnets, cloud metadata (`169.254.169.254`), `.internal`/`.local` suffixes, octal/hex representations, and IPv6 private spaces. VAPID private key held exclusively on server.
- Mobile PWA guidance (`apps/web/src/notifications/webPushManager.ts`): detects iOS 16.4+ Home Screen requirement (`Share` > `Add to Home Screen` before push notification permission is available), Android Chrome site and OS channel settings, and prompts permission strictly upon deliberate user interaction without nagging.
- Content privacy controls: user lock-screen preference toggle between generic mode (`Daynori Reminder` / `You have a scheduled reminder`) and detailed mode (task/routine titles). Private journal entries, vault passphrases, and secret files are strictly excluded from push notification payloads under all configurations.
- Synthetic test notification: `POST /v1/workspaces/:workspaceId/reminders/test-push` endpoint, `@daynori/api-client` `sendTestWebPushNotification` method, and `sendLocalTestNotificationAsync` in web client proving end-to-end delivery on user request.
- Truthful delivery state model: agenda items explicitly distinguish `Scheduled`, `Worker Dispatched`, `Provider Accepted`, `Failed / Expired`, and `Observed Display / Tapped`; provider acceptance confirms HTTP receipt by push services and is never misrepresented as confirmed physical phone display.
- Real UI journeys verified: executed and verified 14 journeys across Desktop Web (1440x900) and Narrow PWA (390x844) (`artifacts/phase84/phase84-ui-evidence.json`).
- Physical reviews honestly recorded: physical iPhone Home Screen (iOS 16.4+) and physical Android phone reviews recorded as unmet; Phase 84 remains recorded as blocked pending physical hardware verification.
- Commit: `feat(notifications): verify mobile PWA reminder delivery`.

## Phase 81 — Advanced recovery and optional-feature tour coverage — 2026-11-05

- ADR 0081: comprehensive guided practice catalog covering available advanced features, safe non-destructive explanatory treatments, fail-closed dormant capability gates, and complete function register inventory mapping.
- Available advanced practice chapters: `tour.files-audio`, `tour.expenses`, `tour.custom-sections`, `tour.offline-sync`, and `tour.trash-recovery` with action verification, deterministic practice entity titles, and correlated durable mutation receipts.
- Fail-closed dormant capability gates: `tour.reminders-gated`, `tour.vault-gated`, `tour.drive-gated`, `tour.rooms-gated`, `tour.billing-gated`, and `tour.assistant-gated` fail closed with `feature_gated` on start, preventing simulated or fake live practice until owning feature phases pass.
- Safe non-destructive learning treatments: `tour.account-deletion-safe`, `tour.recovery-secrets-safe`, `tour.billing-safe`, and `tour.sharing-safe` explain sensitive, financial, and irreversible actions safely without requiring real account deletions, payment card charges, invitation dispatches, or secret disclosures.
- Selective cleanup provenance: `TourPracticeArtifactSchema.entityType` extended with `'file' | 'expense' | 'custom_section'`; `listCleanupCandidates` strictly strips user-owned items (`a.userOwned: true`) to ensure personal content is never offered for deletion.
- Function register: 100% of the 109 inventory actions across 22 families in `docs/roadmap/v2/function-register.json` mapped to real tour chapters or safe treatments; validated cleanly via `pnpm validate:function-register`.
- Real UI journeys: executed and recorded all 13 journeys across Desktop Web (1440x900), Narrow PWA (390x844), and Native Android Emulator (`emulator-5554`) with 52 verified artifacts in `artifacts/phase81/journeys/`.
- Commit: `feat(tours): cover advanced features and safe recovery practice`.

## Phase 83 — Developer feedback triage and verified support contact — 2026-11-05

- ADR 0083: restricted operator feedback triage surface at `/developer/triage` protected by `OperatorGate` and server-side `DAYNORI_OPERATOR_USER_IDS` allowlist check.
- Confidential internal notes: segregated `app.feedback_internal_notes` table with dual-boundary PostgreSQL RLS ensuring internal operator notes are never disclosed to reporters.
- Immutable triage audit trail: `app.feedback_triage_audit` capturing operator mutations, status transitions, priority updates, notes, and responses without logging user secrets or report bodies.
- Verified reporter support contact: operator response composer storing verified developer responses delivered to reporters on `/support` with live status refresh.
- Bounded retention & cleanup: database function `app.purge_expired_feedback_reports(retention_days)` and background worker job `feedback_retention_cleanup`.
- DEF-V2-009 resolved locally via in-app verified developer contact route and restricted triage dashboard.
- Real UI journeys verified: reporter bug submission, operator triage with notes and response, reporter verified response inspection, and unauthorized access denial (`artifacts/phase83/phase83-journey-summary.json`).
- Commit: `feat(support): provide verified developer contact and report triage`.

## Phase 82 — Durable bug, suggestion, and contact submissions — 2026-11-05

- ADR 0082: first-party durable feedback intake with PostgreSQL Row-Level Security, unique client report IDs for idempotency and replay safety, account/workspace-scoped draft quarantine, opt-in reviewable redacted technical diagnostics, truthful unconfigured delivery notices, and background worker delivery jobs.
- Shared contracts and pure domain: `@daynori/contracts` schemas and `@daynori/domain/feedback` sanitizers stripping tokens, passwords, cookies, journal entries, prompts, and audio.
- Web UI (`apps/web/src/app/support/page.tsx`): Bug, Suggestion, and Contact forms with scoped auto-save drafts, reviewable diagnostics toggle, Phase 75 attachment capability notice, and durable server receipt card (`feedback-receipt-card`).
- Native Mobile UI (`apps/mobile/src/views/SupportFeedbackView.tsx`): integrated in `Settings -> Help and feedback -> Feedback & Support` with segmented type control, category chips, diagnostics switch, and server receipt card.
- Fresh embedded x86_64 debug APK built (`artifacts/local/phase82/phase82-embedded-x86_64.apk`, SHA-256 `8825480553d0fdd10b2d1b21409dd93bc7346901713d82ca1dc013d51a9e1c8d`), installed and verified on Android emulator `emulator-5554` (API 35).
- Executed and verified real UI journeys across desktop web (1440x900 bug report), narrow PWA (390x844 suggestion report), desktop contact (1440x900), and native Android emulator (`artifacts/phase82/evidence-summary.json`).
- Commit: `feat(feedback): add durable private bug and suggestion reports`.

## Phase 80 — Everyday guided practice chapters — 2026-11-05

- Fresh native debug APK built with verified current-source JS bundle provenance (SHA-256 `17e66a5a2e86c4aab5cd6632b1bec8c10947ab676de334080c520841284875b2`, 1013 bundled modules). Verified standalone launch on Android emulator `emulator-5554` without Metro.
- Executed and recorded genuine real-control UI journeys across all 14 `PHASE80_JOURNEYS` for desktopWeb (1440x900), narrowPwa (390x844), and nativeAndroid emulator, capturing canonical record IDs, durable operation receipts, screenshots, and XML dumps (`artifacts/phase80/manual-ui-evidence.json`).
- Automated tests pass (Phase 80 everyday tours, recovery/safety, Phase 79 engine regressions, Phase 78 Help catalog/return context, domain/contracts builds, mobile/web typechecks).
- Physical Android phone and human spoken screen-reader reviews honestly marked unmet; required evidence mode correctly exits nonzero; Phase 80 remains blocked in roadmap progress pending physical device verification.
- Commit: `fix(tours): complete everyday chapter wiring and UI verification`.

## Phase 80 — Everyday guided practice chapters (blocked on UI evidence) — 2026-10-27

- ADR 0080: extend Phase 79 engine with everyday chapters (navigation, personalization, tasks, routines, calendar, notes, journal, folders/search, Help return), practice provenance, selective cleanup, stronger open/save predicates.
- Help Learn marks everyday chapters runnable; Phase 81/gated topics stay honest. Function-register tour mappings updated for core everyday families.
- Required UI journey attestation still unmet (`scripts/phase80-tour-evidence.mjs --required`). Phase 80 remains blocked — not release-ready.
- Commit: `feat(tours): teach everyday workflows through real actions`.

## Phase 79 — Action-verified resumable tour engine — 2026-10-27

- ADR 0079: shared versioned tour definitions/state machine, durable scoped `preferences.tourProgress`, action/result correlation, web + native adapters, safe V1 migration, one proof chapter (`tour.task-create-save`).
- Help Learn the app marks only the verified proof chapter `runnable`; Next cannot fake action steps; practice IDs deterministic and non-duplicating on replay.
- Evidence: `tests/unit/phase79-tour-engine.test.ts`, Phase 78 Help regressions, `scripts/phase79-tour-evidence.mjs --required`. Progress scheduling text reconciled with completed Phase 77.
- Commit: `feat(tours): add action-verified resumable guidance`.

## Phase 77 acceptance — Installed PWA and native cold recovery — 2026-10-27

- Prove installed production-PWA cold offline reopen (isolated Edge profile, process kill, connectivity disabled before reopen) and Metro-free native emulator cold launch with embedded x86_64 APK.
- Product repairs: SW navigate fallback inlines offline-shell JS; durable `offline_boot.trustedDeviceConsent`; evidence helpers required-mode nonzero exits (fixture ≠ acceptance; attestation env ignored).
- DEF-V2-003 closed for local installed-PWA + emulator native; Phase 77 marked complete. Phase 78 scheduling preserved; Phase 79 not started.
- Commit: `test(offline): prove installed PWA and native cold recovery`.

## Phase 78 — Complete contextual Help and user instructions — 2026-10-27

- ADR 0078: Phase 78 hard dependsOn 73+74+76; Phases 75 and 77 referenced only (not waived). Phase 77 progress reconciled to blocked (installed-PWA/native cold launch unmet; `a4fb4cc` retained).
- Shared versioned Help catalog in `@daynori/domain` with full function-register action coverage, instructional search, Learn-the-app chapter states, and public essential offline JSON (`help-essential.json` / SW v9).
- Web Help rebuilt (search, categories, articles, deep links, contextual links without losing drafts); native Help catalog from Settings with Back handling.
- Commit: `feat(help): add complete contextual instructions and learning catalog`.

## Phase 77 — Safe offline reopen, sync, and upgrade recovery — 2026-10-27

- ADR 0077: trusted-device offline boot/session boundaries; public executable shell; local unlock ≠ API auth; supersedes ADR 0066 cold-organizer claim while retaining private-cache and safe-update rules.
- Service worker `daynori-static-v8` precaches `/offline-shell.html` + `/offline-shell.js`; navigate fallback prefers the shell then `offline.html`; required-asset install failures keep the prior worker.
- IndexedDB v9: durable `offline_boot` + `auth_quarantine`; web sign-out quarantines drafts; native `DraftQuarantineManager` persists via SecureStore across process restart.
- Cold Edge CDP drill proves local organizer reopen offline with zero forbidden Cache Storage entries; native installed cold launch remains unmet without device attestation.
- Commit: `feat(offline): preserve organizer access and upgrade recovery`.

## Phase 76 — Expenses and safe custom sections completion — 2026-10-27

- ADR 0076: Phase 76 proceeds with hard prerequisites 73+74; Phase 75 stays blocked with real attachment evidence outstanding; receipt/section attachment UI stays capability-gated (no file/audio waiver). Phase 71 TalkBack remains blocked (ADR 0074).
- Expense capture required-fields-first with Details for optional category/note/receipt/payment (web + native); honest receipt-unavailable messaging under core preview.
- Custom section entry attachments no longer fabricate local-only file names; builder reorder announces via aria-live; Help how-tos for expenses and custom sections.
- Commit: `feat(extensions): finish expenses and approved custom sections`.

## Phase 75 — Files and audio attachment readiness (blocked) — 2026-10-27

- Harden private file/audio readiness: account-scoped web audio drafts + logout clear; Expo/mobile unsaved-recording preservation (`peekLastRecording`); non-production local memory storage and policy-scanner opt-ins (ADR 0075); Help upload/audio how-tos; `.env.example` storage/scanner placeholders.
- Reconfirm cancel/retry/quota/delete and audio attachment local suites; function-register local readiness updated. Hosted preview uploads/audio stay off (DEF-V2-002).
- Phase 75 remains **blocked** pending physical Android and nominated-browser capture evidence; completion commit deferred. Phase 71 TalkBack still blocked.

## Phase 74 — Library writing journal and search completion — 2026-10-27

- Standing ADR 0074: Phase 71 unfinished verification no longer blocks later phases; completed phases commit and push to `origin/codex/free-core-preview` without force. Plan edges for 74/85/86/88/89/92/96 updated accordingly.
- Canonical note save/sync vocabulary (Unsaved / Saved on this device / Waiting to sync / Synchronized / Failed — retry); library filter scope copy; mobile search honors journal preview privacy preference; Help updated.
- Commit: `feat(content): complete focused writing and library workflows`.

## Phase 73 — Tasks routines and calendar workflow completion — 2026-10-27

- Required-fields-first task/routine editors (web + native Plan): title/deadline or schedule first; optional notes/priority/folder/tags/subtasks under Details.
- Fix canonical calendar deep links (`taskId` / `routineId`) so projections open the same task or routine; Help and function-register calendar family updated.
- Reconfirm no tomorrow copies on task completion and independent routine occurrences (domain + API journeys). Phase 71 TalkBack remains blocked. Commit: `feat(planning): complete clear task routine and calendar journeys`.

## Phase 72 — Welcome startup onboarding and authentication polish — 2026-10-27

- Polish web/native auth copy and failure classification so outages/rate limits do not impersonate invalid credentials; keep sign-in distinct from workspace readiness with retry that preserves the session.
- Fix AccountSheet provision abort after password sign-in (`sessionGeneration` race), Autofill cross-account clobber on Android fields, and FirstLoginOnboardingGate false-open when preference fetch fails.
- Prove ordinary Account C→B isolation and return-to-C on AVD with local GoTrue/API (journey run18); Phase 71 remains blocked on TalkBack. Commit: `feat(onboarding): polish welcome and account journeys`.

## Phase 71 — Native Android interface (in progress) — 2026-10-26

- Settings hub/groups, BackHandler priority, androidInsets keyboard helper, and density-portable StatusBar top pad (`max(reported, 48dp×density)`) so header taps clear edge-to-edge StatusBar intercept (ADR 0071).
- CreateSheet stable testIDs (`create-type-*`, `create-title-input`, `create-submit-btn`); journeys use node-scoped resource-id parsing and strong save/reopen assertions; prior create-* passes without those IDs remain provisional.
- MobileModalSheet pads by measured Android IME height; journeys restore a11y/font/rotation; ordinary Account sign-in path uses local GoTrue + JWKS API (no operator synthetic-login).
- Short-root APK rebuild: disable Gradle VFS watch (NativeException bad allocation); force hoisted `node-linker` after sync; x86_64 Dev Client with linked `expo-crypto` (`getRandomBytesAsync`).
- Key manager fail-closed error classes; Settings wires `workspaceId` / Provision; storage open/close serialized against Strict Mode SQLite races. Persistence proven on clean synthetic account C; spoken TalkBack / IME-open Save / pin-hide / isolation still open — no completion commit.

## Phase 70 — Mobile web and PWA layout redesign — 2026-10-26

- Compact phone chrome, labeled Create, registry bottom tabs, and grouped Settings subpages (`/settings/*`).
- Mobile full-screen task/routine editors with sticky actions and unsaved-work Update protection; agenda-first calendar; visualViewport/safe-area banner coordination (ADR 0070).
- Responsive e2e and CDP overflow captures at 320–412/768; physical installed-PWA IME still unverified. No release_ready claim.

## Phase 69 — Desktop shell and focused Today — 2026-10-25

- Desktop sidebar Primary/Pins/Utilities hierarchy; Warm page density; registry-driven mobile drawer.
- Focused Today defaults (≤4 visible cards; module chips and Quick Capture off by default); Create opens shell menu.

## Phase 68 — Warm notebook tokens and accessible primitives — 2026-10-25

- Align design tokens to Warm notebook (muted contrast, radii 10/14/18, density, reduced-motion map).
- Add web/mobile primitives: icon button, text link, textarea, checkbox/radio/switch, segmented control, sync status, loading/error-retry, creation menu, reorder controls, coachmark, nav item.
- Extend operator-only `/review` gallery; preserve Phase 66 operator boundaries.

## Phase 67 — Warm notebook visual direction — 2026-10-25

- Add isolated Phase 67 review package under `docs/design/v2/phase67/` (Warm notebook vs Crisp utility interactive prototype, journeys/states, reference board, contrast helper).
- Repair pass: CDP/iframe capture with explicit pass/fail/skipped semantics; prototype interaction and SVG icon CSS fixes; expanded opaque contrast pairs; smoke assertions.
- Owner selects **Warm notebook** (2026-10-25). ADR 0069 accepted. Five-participant prototype sessions explicitly deferred to Phase 99 before V2 release (sessions did not occur).

## Phase 66 — Simple navigation personalization and developer boundaries — 2026-10-25

- Add shared feature registry and eligibility (release × auth × personal visibility) with user-profile `featurePersonalization` migration from legacy homeLayout shortcuts.
- Ship searchable All features (web `/features`, mobile sheet), pin/hide/restore, and Journal-hide → three primary tabs (ADR 0068).
- Move developer galleries/harnesses/provisional panels behind deny-by-default `DAYNORI_OPERATOR_USER_IDS` and `/v1/operator/session`; ordinary Settings keeps recovery tools only.
- DEF-V2-010 verified locally for web/API/domain; physical Android and production operator identity remain unmet. No gated-module production enablement.

## Phase 65 — Version 2 function inventory and readiness baseline — 2026-10-25

- Add machine-readable `docs/roadmap/v2/function-register.json` (109 actions, 12 defects, 22 families), schema, validator, and readiness baseline narrative.
- Record nominated local environment, synthetic core organizer journey results, short performance soak summary, and fresh visual emulation manifest (historical `artifacts/web-e2e` labeled separately).
- Map gaps to repair/Help/tour phases without implementing redesigns or enabling gated vault/Drive/rooms/AI/billing/notification delivery. No `release_ready` claims.

## Phase 64 — Version 2 roadmap and experience planning — 2026-10-25

- Append 40 bounded phases (64–103), detailed specifications, acceptance gates and Antigravity handoff rules; retain every original phase definition and blocked/deferred status.
- Plan a professional icon-based redesign with no app-authored emoji, simple personalized navigation, restricted developer tools, mobile-specific layouts, welcome/auth polish and complete action-verified tours.
- Specify richer Help, durable bug/suggestion/contact reports, verified developer support, physical PWA/native notification evidence, and an optional grounded text/voice creation assistant with the proposed original Nori companion.
- Include existing-function readiness, safe offline reopen, vault/Drive/rooms/billing gate closure, measured security/performance/accessibility and full-scope beta/release evidence. App behavior and deployment are unchanged; Phase 65 remains unstarted.

## Phase 60 — Session cold-start, dirty editors, SW v7 (preview) — 2026-10-22

- Refresh/session routes no longer clear cookies on temporary auth outages (503 keep-session); invalid refresh still clears.
- Journal wires `data-daynori-unsaved`; first-login tour gate on any route; SW `v7` public `/_next/static` warm precache; capture script fails on CSS overflow.
- Dead Install/SW components removed; Library/QuickReference narrow layout polish. Rooms/chat remain production-off. Phase 60 store release still incomplete.

## Phase 60 — Library simplify, session resilience, safe updates (preview) — 2026-10-22

- Library default: search, Write note, New folder; filters/uploads/saved views under More tools; demo controls removed from ordinary use.
- Stacked Install/Update banners; Update blocked while unsaved (`data-daynori-unsaved`); SW `v6`; improved offline.html (ADR 0066).
- Session check no longer clears auth on network/cold-start failures; refresh single-flight; honest Rooms/chat and Support copy.
- Menu progressive disclosure (Everyday / More). Phase 60 store release still incomplete.

## Phase 60 — Mobile PWA usability follow-up (preview, blocked) — 2026-10-22

- Narrow-safe Library/Settings/Review grids; Today shortcut `/today`; shorter Today/bottom-nav chrome; Help/Today text wrapping.
- Beginner guide optional practice Write note / Add task; one-shot Chrome Install banner; SW cache `v5`.
- Regression tests + headless mobile screenshots script. Free preview limits unchanged; Phase 60 not release-complete.

## Phase 60 — Mobile PWA usability repair (preview, blocked) — 2026-10-22

- Narrow-screen layout: safe-area bottom nav, dialog viewport sheet, text wrapping, compact Today actions, hide duplicate mobile shortcuts.
- Compact expandable preview notice; Help searchable how-tos + beginner-guide replay; simplified onboarding with PWA install tip and semantic icons.
- Service-worker Update/Later banner; manifest `start_url` `/today`; ADR 0065. Uploads/audio/reminders stay preview-gated; Phase 60 not release-complete.

## Phase 60 — live web and Android testing downloads — 2026-10-22

- Publish the verified standalone ARM64 APK and SHA-256 file in an explicitly labeled GitHub prerelease; confirm anonymous download access.
- Complete the native cloud build on revision `840f147`, including unauthorized-signing refusal, embedded bundle and APK signature verification. Confirm package, SDKs, checksum and actual hosted origins locally.
- Record deployment/install instructions and reconcile the audit register with the live free web/API, migrated database and downloadable APK.
- Keep owner account/email entry, signed-in cross-device saving, physical Android checks, dependency/performance findings and full release gates pending. Phase 60 remains incomplete.

## Phase 60 — standalone build signing repair — 2026-10-22

- Handle fresh Expo Android templates that define only a debug signing configuration: attach an empty release configuration before variant setup while retaining the fail-closed signing guard.
- Exercise unsigned-release refusal in the cloud workflow before explicitly authorized test signing. The first assembly attempt failed before producing an APK; a repaired build is required.
- Resolve signing values during Gradle evaluation before Android finalizes variants, retaining task-graph refusal for unauthorized packaging and safe in-place guard upgrades.
- Declare Expo SDK 52's required asset runtime directly for standalone bundling; verify the embedded Android bundle with the actual public cloud endpoints.

## Phase 60 — hosted core preview — 2026-10-22

- Deploy the restricted API and existing web service on Render Free in Singapore; verify API health/readiness and website health over HTTPS.
- Configure exact live web/Android authentication return URLs with email verification retained. Send only restricted app credentials to the API host under owner approval.
- Trigger the free Android standalone build against the verified hosted API.
- Repair the live sign-in panel to use existing themed Dialog/Button/TextField controls with focus containment and remove an unsupported absolute security claim.
- Keep authenticated cloud journeys, APK verification/download, hardware and existing release gates pending.

## Phase 60 — managed preview database setup — 2026-10-22

- Verify 74 cloud migration receipts using the owner's project-only setup token; keep setup credentials local and activate only the restricted runtime login.
- Record managed Storage and disabled-billing adaptations separately from immutable source checksums. Preserve Storage ownership, RLS and policies; create no buckets.
- Verify the real pooler login with the Supabase-provided public CA and TLS validation; normal migration tooling refuses adapted preview histories pending explicit promotion.
- Keep hosted web/API, APK, physical-device checks and full release acceptance pending.

## Phase 60 — $0 core preview preparation — 2026-10-21

- Record the owner's $0 budget and newly created Singapore Supabase preview project.
- Add explicit free-preview API barriers and web/Android notices for unavailable uploads, audio attachments and reminder delivery; allow bounded server wake-up time.
- Add a TLS-verified, project-pinned migration runner with transactional role safeguards. Fixture passwords never become committed cloud credentials; unused billing/worker logins remain disabled.
- Display pending account cleanup accurately on web and Android, preserve the mobile runtime-config contract, and configure separate API reauthentication credentials.
- Keep deployment, APK download and physical-phone verification pending. Phase 60 remains incomplete.
- Add a dedicated preview-build branch trigger for the public repository, allowing an APK build without merging unfinished release work into the old default branch.

## Phase 60 — durable preview providers (blocked on live setup) — 2026-10-21

- Add a live Supabase object transport and durable, tenant-checked API capabilities; serialize upload/cancel races and close direct Storage quarantine bypasses.
- Wire bounded private-network ClamAV scanning and FCM/Expo push adapters into executable services. Missing scanner/storage cannot produce false completion.
- Remove duplicate quota adjustments from physical file cleanup and target the current file schema.
- Keep object deletion in the committed durable job so transaction rollback preserves bytes; the final affected lifecycle suites pass 14/14 checks.
- Add a separate application-worker database role with explicit production credentials; API runtime cannot assume it.
- Add the cursor-order index without relaxing performance gates; the final full suite passes 1,336 tests across 113 files, including the new provider and deployment regressions.
- Package production server dependencies separately and add a manual standalone Android preview workflow with a public-configuration gate and bundle/signature checks.
- Confirm Supabase/Render browser sign-in, create the free Daynori Preview organization, and prepare free Singapore web hosting. Database password/project creation and a hosting budget decision remain with the owner. No deployed URL or new APK yet; dependency advisories and hardware/release gates remain open.

## Phase 60 — project audit and phone-preview prerequisites (blocked) — 2026-10-21

- Repair API process startup, configurable web origin checks, mobile public service configuration and per-request bearer credentials.
- Add the real mobile account sheet and initialize storage after workspace provisioning; clean up account-specific repositories and sync engines.
- Persist mobile quick capture through the existing local sync transaction, retain failed drafts, use UUIDs for native task/subtask capture, and show the current date.
- Append migration 00070 to permit own-consent deletion under existing forced RLS, fixing account-deletion rollback.
- Add restrictive context-free read guards (migration 00071) and scope the simulated restore to its own fixture; retain membership policies and test timeouts.
- Update old integration fixtures to the current room invitation/UGC terms and versioned PWA cache contracts; retain the actual authorization checks.
- Add independent container targets, an internal standalone APK build profile, and an explicit deployment handoff (ADR 0061).
- No live deployment or new APK produced. Production file storage/scanning, push, connected accounts, dependency advisories, and hardware evidence remain blockers; see the Phase 60 audit report for exact checks and limits.

## Phase 60 — Android/web verification resume (blocked / NO-GO) — 2026-10-21

- Repaired web production build: removed unused `IconText` imports left from the semantic-icon migration (seven organizer pages/components).
- Re-ran local release path: `icons:check`, web build, `validate:core`, phase 59/60 gates, web production smoke, `release:preflight` (`releaseEligible=false`), disposable rehearsal, typecheck, lint, planning, secrets.
- Debug APK evidence unchanged (not release-eligible). No `adb` device; no signed AAB; no store/web publication. Phases 61–62 native/TestFlight status preserved. Stop before Phase 63.

## Phase 62 — iOS store release gate preparation (blocked) — 2026-10-21

- Local App Store package under `docs/release/ios/` (RC identity/build, signing, TestFlight checklist, privacy/dependencies, support/deletion, reviewer access, screenshot rules, monitoring/recovery, owner actions).
- ADR 0060: preparation without inventing Phase 61 Simulator/physical evidence or fabricating iPhone screenshots.
- No TestFlight upload, App Review, StoreKit, or gated-module activation. Stop before Phase 63.

## UI — professional icon system (no emoji chrome) — 2026-10-21

- Shared semantic icon registry (`packages/design-tokens/src/icons.ts`) with web SVG and mobile PNG `Icon` components.
- Replaced application-authored emoji/Unicode pictograms across web and mobile organizer UI with semantic icon names.
- Design-system no-emoji chrome rule + artwork provenance (`docs/design/icon-artwork.md`); `pnpm icons:check` / `pnpm icons:build`.
- Daynori logo/identity assets preserved (ADR 0059). User content emoji left untouched.

## Daynori logo — local application identity — 2026-10-21

- Custom folded D symbol and vector lettering, with editable geometry, transparent SVG/PNG wordmarks, inverse/monochrome variants and a 1024 px app icon.
- Web header, favicon, Apple touch icon and PWA any/maskable icons; versioned public asset caching. Native header symbol plus Expo launcher, adaptive/themed, notification and light/dark splash assets.
- Rebuild/check scripts and usage guidance under `assets/brand/`; ADR 0059. Public clearance and native device appearance remain separate verification gates.
- Pinned Metro compatibility patch enables bundled PNGs with the existing image-size 2.0.4 override; Android export includes the native logo.

## Phase 61 — iOS platform parity and native adaptation (blocked) — 2026-10-21

- Expo iOS config: bundle id `com.daynori.app`, SQLCipher iOS, Keychain secure-store plugin, associated domains, microphone purpose string, deployment target 15.1.
- Platform adapters: iOS device registration/`expo_push`, notification triggers without Android channels, Keychain WHEN_UNLOCKED writes, platform-prefixed sync device ids, sheet keyboard/safe-area tweaks.
- Published iOS support matrix, Mac verification procedure, Apple privacy/notification/purchase review (2026-10-21), ADR 0058. `pnpm ios:path` inspect/host-capability/evidence.
- Native Simulator/physical VoiceOver/Keychain/push evidence unexecuted on Windows. Vault/AI/Drive/chat/billing remain gated. Stop before Phase 62.

## Core consolidation — installable debug APK + walkthrough (blocked) — 2026-10-21

- Built installable **debug** arm64 APK from space-free `D:\d\daynori` (`node scripts/build-android-debug-apk.mjs`); SHA-256 recorded; **not** release-eligible.
- Extended `pnpm validate:core`: sync push (offline stand-in), export denied without reauth, web-proxy deletion.
- Signing-guard resolve supports hoisted monorepo `node_modules`. Device/beta/owner OA and signed AAB still blocked. No Phase 61/iOS.

## Core consolidation — Android/web local gaps (blocked) — 2026-10-21

- Portable Node `v24.21.0` under `.tools/` (gitignored); regenerate Android with fail-closed signing guard fix (whenReady always appended; Expo resolve via realpath).
- `pnpm validate:core` / core-organizer local validation: production notes/tasks/routines/journal/files quota/sync + web proxy account-deletion.
- Installable APK path workaround documented. See `docs/engineering/core-consolidation-status.md`.

## Phase 60 — Public Android and web release preflight / rehearsal (blocked) — 2026-10-21

- Executable `pnpm release:preflight` fail-closes without human launch authorization; provisional manifest cannot become release-eligible from JSON validity alone.
- Production-mode release boundary tests; web production smoke for legal/deletion pages + CSP; disposable local rehearsal script.
- Publication runbook + ADR 0057: Play percentage staged rollouts are for **updates only**; first publication uses testing tracks / first production release.
- No store upload, no public release tag, no verified live release. Stop before Phase 61.

## Phase 59 repair — Android signing and build-path (blocked) — 2026-10-21

- `withReleaseSigningGuard` defers fail-closed signing to Gradle `taskGraph.whenReady`; debug/configure tasks usable without credentials; silent debug.keystore fallback neutralized.
- Authoritative path: `scripts/mobile-android-release-path.mjs` (inspect / disposable prebuild / exercise-gradle). Launch checklist demotes overstated signing LV.
- Stale workspace `android/` rejected until regenerated; disposable prebuild verified target/compile SDK 36 + fail-closed `assembleRelease`.

## Phase 59 — Google Play and web launch preparation (blocked / provisional) — 2026-10-21

- Provisional release manifest, store/listing drafts, launch checklist; draft `/privacy` `/terms` `/support`; deletion contact no longer invents a monitored inbox.
- Android target/compile SDK 36 via expo-build-properties; release signing fails closed without owner keystore (explicit local-test debug flag only). Play policy review 2026-10-21. ADR 0056.
- Local preparation only — not store submission or launch authorization. Stop before Phase 60.

## Phase 58 repair — Workload validity, scoped faults, lint (blocked) — 2026-10-21

- Heavy baseline seeds complete notes + depth-5 folders; 90s soak labeled short local baseline; quality.md targets reported separately.
- Fault suite: no global job dead-letter; sentinel survival; handler-failure vs process-interrupt lease reclaim with durable audit effect.
- Repo-wide `pnpm lint` cleaned (harness env overrides + code fixes). ADR 0055 amended.

## Phase 57 authority repair — Billing role boundary (blocked) — 2026-10-21

- Privileged billing helpers require `session_user = daynori_billing` (migrations 00068–00069); ordinary runtime cannot self-assert via `set_config` or the local synthetic token.
- Dedicated billing DB pool; token activation revoked from `daynori_runtime`. ADR 0054 amended.

## Phase 58 — Reliability, scale, and operating cost gate (blocked / provisional) — 2026-10-21

- Engineering synthetic baseline: 40 concurrent actors, 10k-item heavy workspace, depth-8 folders, full 90s paced soak; tails/errors in `tests/performance/results/phase58-baseline.json`.
- Fault drills: worker crash/lease reclaim; development kill switches return 403 (not success) while core organizer remains usable.
- Re-ran disposable DR drill + Phase 57 billing regressions. Provisional cost model and incident runbooks (ownership unassigned). ADR 0055.
- Not beta-derived production capacity; cloud PITR/commercial/ops unmet. Stop before Phase 59.

## Phase 57 repair — Billing authority, lifecycle, durable events, quotas (blocked) — 2026-10-21

- SECURITY DEFINER billing helpers require `billing_activate_service_session` (service token); ordinary bypass denied.
- Explicit Play `SUBSCRIPTION_STATE_*` mapping; pending/canceled/grace/hold/expiry/revocation with validity windows; recompute aggregates purchases.
- Synthetic harness separated from gated provider ingest; events pending until worker claim; RTDN labels do not override verified state.
- AI monthly reservation uses effective entitlement ceiling; storage ceiling synced on recompute. ADR 0054 amended.

## Phase 57 — Entitlements, subscriptions, and purchase lifecycle (blocked / provisional) — 2026-10-21

- Server-authoritative entitlements with synthetic local catalog; clients cannot grant premium via local state or SQL.
- Fake Play verify/restore + durable billing events (idempotent message ids, claim/lease, dead-letter); Google Play `subscriptionsv2` adapter gated off.
- Purchase tokens bound to authenticated app accounts; cross-account reuse rejected. Downgrade/expiry preserves content; quotas update personal storage ceilings.
- Web BillingPanel and Android BillingSheet (synthetic labels; Expo Go ≠ Play Billing). ADR 0054. Production activation and real charges remain disabled. Stop before Phase 58.

## Phase 56 repair — Proposal recovery, durable status, drafts, source access (blocked) — 2026-10-20

- Create recovery binds to proposal `operation_id` + mutation receipt/`request_hash`; unrelated id collision → conflict, not recovered success.
- Terminal proposal states (`expired`/`failed`/`cancelled`) commit before API errors; review summaries for Confirm UI.
- Update-target vault/kind/revision validation; draft get/save/clear; history scoped to current consent generation; ask AbortSignal cancel.
- Source-access recheck for citations; `ai_cleanup_expired_assistant_data` physical deletion. ADR 0053 amended.

## Phase 56 — AI assistant and confirmed organizer actions (blocked / provisional) — 2026-10-20

- Assistant ask reuses Phase 55 retrieval with labeled fake/gated answers, history/draft retention, and source citation links on web and Android.
- Durable `ai_proposals` with opaque confirmation tokens; allow-listed personal task create/update and note create via existing domain services only after explicit Confirm.
- Cancel, expiry, consent change, cross-tenant, vault scope, and payload-substitution rejects; concurrent confirm and retry return a single receipt.
- Disable/purge and account deletion clear assistant turns and proposals. ADR 0053. Live provider and production AI remain disabled. Stop before Phase 57.

## Phase 55 repair — Consent fencing, durable budgets, citation binding (blocked) — 2026-10-20

- Provider I/O outside reservation transactions; post-provider consent/generation revalidation; AbortSignal cancellation (non-recall documented).
- Durable `ai_budget_requests` with estimate-based reserve and actual-usage settle (may exceed reservation); concurrent connection tests.
- Citations bound to authorized `[source:uuid#rN]`; eligibility filtered before ranking; referenced ≠ retrieved context.
- Index lifecycle enqueue/invalidate from notes/tasks/journal/import; jobs require `consentGeneration`.
- OpenAI adapter `store:false` + mock-transport validation; ADR 0052 amended. Executable fake eval runner. Live provider still disabled.

## Phase 55 — AI provider privacy and retrieval foundation (blocked / provisional) — 2026-10-20

- Versioned AI consent with provider disclosure and distinct journal opt-in; default-off personal-workspace indexing/retrieval with citation checks.
- FakeAiProvider for local tests; OpenAI-compatible live adapter remains gated (`DAYNORI_AI_LIVE_ENABLED` + credentials); missing keys → unavailable without breaking core organizer flows.
- Derived index chunks, atomic monthly budgets, disable/purge lifecycle, account-deletion AI fence, durable `ai_index_source` / `ai_purge_derived` jobs.
- Settings harness for consent/index/retrieve/disable. ADR 0052. Live provider, ZDR, residency, and production activation remain unmet. Stop before Phase 56.

## Phase 54 repair — Moderation DB auth, hide consistency, terms/idempotency (blocked) — 2026-10-20

- Protected `app.platform_moderators` membership enforced inside SECURITY DEFINER helpers; audit actors bound to caller; self-service block audit separated.
- Blocker-only hide applied to chat events (cursor preserved); notification suppress for blocked pairs.
- Terms required for chat edit, room copy, and room sync writes; report immutable request hash + concurrency-safe limits; actioned needs disposition/reason.
- Web/Android user report, block list/unblock, and selectable message report. ADR 0051 amended. Status remains blocked.

## Phase 54 — Collaboration safety and policy gate (blocked / provisional) — 2026-10-20

- Durable UGC reports (categories, explanation bounds, idempotent client ids, rate limits, frozen evidence snapshots) and viewer-capable reporting.
- User block/unblock with invitation restrictions and blocker-only message hide; mute remains notification-only (ADR 0051).
- Versioned terms acceptance enforced on chat send; invitation create rate limits; platform-moderator allow-list queue + moderation audit (no staffed owner claimed).
- Web/Android report, block, and terms controls under local rooms gate. Policy docs + Play UGC review 2026-10-20. Status blocked on staffing and rooms release prerequisites.

## Phase 53 repair — Chat idempotency, cursors, persistence, publication recovery (blocked) — 2026-10-20

- Lock-first send: idempotency lookup and rate limits run under chat-state lock; immutable `original_payload_hash` survives edit/delete retries; replays do not republish.
- Event cursor separated from message-order acks; read-state clamped to server high-water; stale overwrite guards on clients.
- Account/room-scoped durable drafts and pending sends (web + Android) with stable `clientMessageId`, revoke purge, edit/delete controls.
- Process lifecycle publication recovery with outbox claim/mark; verified-file attachment gate; tighter message/event RLS.
- ADR 0050 amended. Status remains blocked; no real-user/production chat enablement.

## Phase 53 — Room chat and realtime events (blocked / provisional) — 2026-10-20

- Durable room messages with client IDs, idempotent send/retry, server ordering, pagination, author edit/delete, and role-based send.
- Authorized history and event cursor poll; process-local realtime bus with unpublished-event recovery (not a production provider).
- Per-user unread cursor and mute; synthetic privacy-safe notification planning (no real push). Attachment refs limited to room-owned files.
- Web RoomChatPanel and Android RoomsSheet chat journey under local rooms gate. ADR 0050. Status blocked on rooms release prerequisites.

## Phase 51/52 repair — Revocation vs sync reset, durable purge, production gate (blocked) — 2026-10-20

- Confirmed room purge only on structured `MEMBERSHIP_REVOKED` / `ROOM_ARCHIVED`; `SYNC_RESET_REQUIRED` rebases while preserving drafts/pending/conflicts.
- `ROOM_ROLE_INSUFFICIENT` for editor→viewer write rejection without membership-loss purge.
- Typed `clearWorkspaceData` purge (cursor, conflicts, drafts, mutations, projections); SyncEngine handles push-result revocation and purge failure.
- Shared `isRoomsLocallyEnabled` fails closed in production even when the local flag is set.
- ADR 0049 amended. Status remains blocked; no real-user/production rooms enablement.

## Phase 52 — Shared content sync and revocation (blocked / provisional) — 2026-10-20

- Room-scoped note/task/file sync with role revalidation on pull/push/bootstrap/receipts/downloads; journal/vault excluded.
- Explicit `MEMBERSHIP_REVOKED` / `ROOM_ARCHIVED` signals; client purge protocol and SyncEngine `room_revoked` event; offline copy limits documented.
- Concurrent shared edit conflicts reuse Phase 34 revision rules (no live OT). Web/Android room content UI under local gate.
- ADR 0049. Phase 52 is sync/revocation — chat remains Phase 53. Status blocked on Phases 51/34 release evidence. Vault stays disabled.

## Phase 51 repair — Quarantine, ownership concurrency, copy boundaries (blocked) — 2026-10-20

- Quarantine uses reconciliation inventory status (not the renameable Legacy Room name suffix); rename cannot unlock invites.
- Last-owner trigger locks the workspace row; canonical `owner_id` must keep an owner membership; concurrent demotion/leave/transfer races covered by integration tests.
- Invitation accept binds to session actor; copy verifies note/task payloads, rejects embedded private refs and attachments, emits change-feed; manual-token harness documented.
- Cleared synthetic secret-scan false positive in phase47 vault test. Local flag alone does not enable production rooms.

## Phase 51 — Shared rooms, invitations, and roles (blocked / provisional) — 2026-10-20

- Provisional local shared rooms: separate `kind=room` workspaces, owner/editor/viewer roles, hashed expiring single-use invitations, last-owner DB protection, legacy `(Legacy Room)` quarantine, explicit personal→room note/todo copy with journal/vault exclusion.
- API `/v1/rooms*` + typed api-client; web RoomsPanel and Android RoomsSheet with local invite-link copy (no outbound messages). Local gate: test/dev or `DAYNORI_ROOMS_LOCAL_ENABLED`.
- ADR 0048. Corrected Phase 50 handoff: Phase 51 is rooms (prereqs 38/10), not vault. Phase remains blocked on private-beta/release evidence. Stop before Phase 52. Vault stays disabled.

## Phase 50 — External Drive folder mirroring (deferred) — 2026-10-20

- Owner-authorized deferral: Phase 48’s narrow `drive.file` decision (ADR 0046) does not approve recursive external folder access; live folder evidence, broader-scope verification, and cost/assessment prerequisites are absent.
- No folder-mirroring implementation or OAuth broadening. Selected-file connector preserved. Deferral is not implemented completion.

## Phase 49 repair — Drive worker bytes, selection, OAuth resume (blocked) — 2026-10-20

- Worker dispatches to shared `jobExecutor` with atomic lease claim, binding validation, and real provider I/O.
- Imports use Phase 24 reserve→storage→finalize; uploads send verified local bytes; offline stays `pending_offline` until client acknowledge.
- Session-bound Drive OAuth callback (`complete-by-state`); reject fake provider in production; fence-before-revoke; upload idempotency via `appProperties` + `drive_upload_operations`.
- Classify Google HTTP 403s (permission / rate / quota / forbidden). Tests cover worker path, quarantine failure, transport-mocked Google adapter.
- Live Google verification still unexecuted. Vault activation stays disabled.

## Phase 49 — Drive selected-file connector (blocked / provisional) — 2026-10-19

- Provisional selected-file Google Drive connector: OAuth intents + PKCE, AES-256-GCM server token storage, connection lifecycle with disconnect fencing, linked-file link/import/upload/offline jobs, web Settings + Android connections UI.
- Production Google provider fails closed without OAuth config and `DAYNORI_DRIVE_PRODUCTION_ENABLED`; fake provider is tests/labeled harness only.
- ADR 0047. Live Google verification and real-user enablement remain unmet. Vault activation stays disabled.

## Phase 48 — Drive spike repair (blocked) — 2026-10-19

- Live CLI now runs interactive PKCE OAuth, callback listener, optional Picker, and Drive API probes (`src/liveRunner.ts`); missing config yields explicit `blocked` / `blocked_unexecuted`, not a fake pass.
- Centralized exact-URI scope validation in `@daynori/domain` (`driveScopes.ts`); rejects broader+narrow combinations, lookalike URIs, and unclean grants.
- Evidence lanes separated: documentation/synthetic vs live; unmeasured folder children stay `unverified`; OAuth selection ≠ mutating capability proof.
- Inventory/`--mode=mock` documented as non-live preparation only.

## Phase 48 — Drive scope feasibility spike (blocked) — 2026-10-19

- Added isolated spike under `tests/spikes/drive` (mock inventory, config inspection without logging secrets, live handoff).
- ADR 0046: choose selected/app-created-file mode under `drive.file`; do not promise recursive folder children; broader scopes deferred.
- Updated integrations architecture with dated Google scope links. Live Google experiments remain unverified until owner OAuth consent.

## Phase 47 — Local verification repair (blocked / provisional) — 2026-10-19

- Restored normal linted `pnpm --filter @daynori/web build` by typing expense drafts/filters and handling empty catches.
- Production CSP via Next.js 15 middleware nonces (`script-src` without `unsafe-inline`/`unsafe-eval`); `Permissions-Policy` allows `microphone=(self)` except vault routes.
- Playwright web vault lifecycle runner (18 checks) under `tests/security/vault/harnesses`; unlock-sheet retry host fix.
- Phase status remains `blocked` pending independent review and Phase 45 integration.

## Phase 47 — Provisional web unlock lifecycle harness (blocked) — 2026-10-19

- Added browser vault interfaces reusing `@daynori/domain` session controller; production providers remain unavailable (no silent synthetic fallback).
- Development-only harness at `/dev/vault-harness`; production `/vault` stays a disabled status page.
- Cross-tab lock/session signals without sharing keys or plaintext; visibility/idle/account-change locking; CSP headers with documented residual `unsafe-inline`.
- Tests: `tests/security/phase47-web-vault.test.ts`. Status remains `blocked` pending Phase 45 integration and independent review.

## Phase 46 — Unlock admission and immediate lock cleanup repair (blocked / provisional) — 2026-10-19

- Reject unlock attempts during cooldown (and other disallowed states) before invoking key providers; require exact pending operation/generation/account binding on completion.
- Lock immediately (invalidate pending ops, detach key handle, close protected navigation) then clean up asynchronously; cleanup failures keep the session locked with a redacted diagnostic.
- Host fixes: stale list/detail races, idle lock scheduling, account/workspace change wiring, clipboard adapter honesty, `__DEV__`-only harness entry.
- Moved session controller + provider contracts into `@daynori/domain` for reuse by Phase 47 without importing mobile modules.
- Tests: `tests/security/phase46-vault-lifecycle.test.ts` (23 tests). Status remains `blocked`.

## Phase 46 — Android vault unlock lifecycle harness (blocked / provisional) — 2026-10-19

- Added domain vault lifecycle reducer, production-unavailable providers, and labeled synthetic harness providers (no silent mock fallback).
- Delivered Android unlock/recovery/locked-shell UI and Settings entry for the synthetic harness only; production vault remains disabled.
- Lifecycle covers background/idle lock, stale unlock rejection, account/workspace changes, revocation-when-online, transfer status copy, and presentation redaction helpers.
- ADR 0044 records offline unlock policy and non-claims. Vitest lifecycle suite: 15 tests.

## Phase 45 — Encrypted vault records preparation safety repair (blocked) — 2026-10-19

- Repaired disconnected transfer model so safety gates are enforced inside `transitionTransfer` (verification evidence, source-edit disposition, cleanup completion, shared-reference disclosure, idempotent binding).
- Added focused negative tests for each bypass; scheduling a versions-cleanup job alone cannot complete a transfer.
- Phase status remains `blocked` / prepared — no production vault tables, routes, or unlock UI.

## Phase 44 — Vault cryptography proof repair (harnesses + Android target) — 2026-10-19

- Fixed JVM harness unresolved KDF identifier; required shared-fixture parse with expected-byte comparisons; Node↔JVM envelope exchange and Argon2id expected-byte checks.
- Added isolated Android `:android-app` instrumentation target with pinned `bcprov-jdk18on:1.78.1`; emulator connected tests PASS on API 35 x86_64.
- Physical Android device evidence and independent qualified review remain unmet; emulator does not clear the physical-device gate.
- Completed security review packet handoff with separate browser/JVM/emulator/physical lanes.

## Phase 45 — Encrypted vault records preparation strengthened (blocked) — 2026-10-19

- Strengthened disconnected preparation: purpose/field-role AAD binding, checkpoint/replay rules, ciphertext conflict preservation, transfer state machine with cleanup gates and retained-copy disclosure, default-deny exclusion registry (`protocol-models.ts`).
- Relabeled Vitest coverage as preparation checks (not production integration proof).
- Attachment evaluation lists pinned candidate versions and proposes libsodium secretstream for independent review (not adopted).
- Phase status remains `blocked` / prepared — no production vault tables, routes, or unlock UI.

## Phase 44 — Vault cryptography proof repair (continued) — 2026-10-19

- Empty authenticated payloads: empty ciphertext string allowed; nonce/tag remain mandatory; cross-adapter regressions added.
- Browser harness: vault profile rejects non-32-byte keys before `importKey`; native 128-bit AES-GCM capability recorded separately; Edge headless evidence PASS.
- Android/JVM candidate harness: buildable Gradle/Kotlin project with `argon2-jvm:2.11` + AES-GCM; host JVM PASS; physical device unverified.
- KDF scheduler: worker_threads, bounded active/queue, validate-before-admit, cancel/fail capacity release, overload rejection.
- Vector attribution corrected to McGrew/Viega GCM Appendix B Cases 13–14 (not SP 800-38D appendices).
- Removed unsupported “prevent cost-effective GPU/ASIC cracking” claim from ADR.

## Phase 45 — Encrypted vault records preparation (blocked) — 2026-10-19

- Initial preparation docs and synthetic fixtures (`2e53c29`).

## Phase 44 — Vault cryptography proof repair — 2026-10-19

- **Repaired isolated prototype** (`tests/security/vault/vault-crypto.ts`) after reproducing defects in the initial `e07c454` proof:
  - Complete RFC 9106 §5.3 Argon2id vector (password, salt, secret, AD → `0d640df5…`); retain `03aab965…` as password+salt-only regression fixture; isolate reference-vector parameters from application KDF policy.
  - AES-GCM known-answer fixtures initially mis-attributed; later corrected to McGrew/Viega GCM Appendix B (see continued repair entry).
  - Strict recovery-secret validation (hex + separators, exactly 32 bytes); checksum is transcription-only.
  - Explicit envelope profile: 32-byte keys, 12-byte nonces, 16-byte tags; outer/AAD `keyVersion` consistency; reject malformed encodings before crypto work.
  - Application KDF: finite integer parameters, exact 32-byte output, concurrent derivation limit, no silent downgrade.
  - Rename adapters to `NodeWebCryptoVaultAdapter` / `NodeCreateCipherivVaultAdapter` (Node-only evidence).
  - Recovery rewrap limitation regression: old envelope + old secret still unwraps the same VRK.
  - Document AAD does not alone prevent same-item older-version replay.
- **Platform harnesses** (runnable; browser/Android execution unverified here): `tests/security/vault/harnesses/`.
- **Attachment encryption evaluation** pending maintained format/library choice — homegrown chunk-index protocol not authorized.
- **Review packet:** `docs/engineering/vault-security-review-packet.md`.
- **ADR 0043 / architecture / phase-44 report** corrected to match observed evidence; gate remains **blocked**.
- Tests: `tests/security/phase44-vault-crypto.test.ts` (29 tests).

## Phase 44 — Vault cryptography and recovery proof (initial) — 2026-10-19

- Initial provisional prototype and ADR 0043 authored under owner authorization (commit `e07c454`). Subsequent repair entry above supersedes overstated platform/recovery claims; production vault remains **BLOCKED**.

## Phase 43 — Custom section builder and personal templates — 2026-10-19

- **ADR 0042 Authored (`docs/decisions/0042-custom-section-builder-and-personal-templates.md`):**
  - Documented builder dialogs, starter templates, personal template lifecycle (fork-on-use, zero private record leakage), schema evolution preview modal with plain-language impacts, canonical folder and collection scoping, accessible non-drag reordering, and read-only fallback rendering.
- **Database Migrations (`infra/supabase/migrations/`):**
  - Added `00045_custom_section_templates.sql` creating `app.custom_section_templates` with workspace-scoped RLS policies and indexes.
  - Added `00046_custom_section_record_folder_and_collection.sql` introducing `folder_id` and `collection_id` to `app.custom_section_records` with composite indexing.
- **Contracts & Schemas (`@daynori/contracts`):**
  - Added schemas for `CustomSectionTemplateItem`, `CreateCustomSectionTemplateRequest`, `ListCustomSectionTemplatesResponse`, `PreviewSchemaMigrationRequest`, `FieldMigrationImpact`, and `SchemaMigrationPreviewResponse`.
- **Pure Domain & Validation (`@daynori/domain`):**
  - Implemented `generateSchemaMigrationPreview` computing plain-language impact breakdowns and archive explanations.
  - Implemented `createSectionPayloadFromTemplate` with isolated instance IDs and fork behavior.
  - Added approved starter templates: Reading List, Study Hub, Project Tracker, Equipment Log.
  - Added 79 unit tests in `packages/domain/src/domain.test.ts`.
- **API Services & Routes (`apps/api`):**
  - Added personal template CRUD under `/v1/workspaces/:workspaceId/custom-section-templates`.
  - Added schema migration preview under `/v1/workspaces/:workspaceId/custom-sections/:sectionId/schemas/preview`.
  - Added `folder_id` and `collection_id` scoping to custom section record endpoints.
- **API Client SDK (`@daynori/api-client`):**
  - Added `previewCustomSectionSchema`, `createCustomSectionTemplate`, `listCustomSectionTemplates`, `getCustomSectionTemplate`, and `deleteCustomSectionTemplate` to `DaynoriApiClient`.
- **UI Web Primitives (`@daynori/ui-web`):**
  - Created `CustomSectionBuilderDialog` with starter template selection, personal templates, collection/existing-view/combined modes, accessible Move Up/Down field reordering, and folder selection.
  - Created `SchemaMigrationPreviewModal` displaying record counts, affected fields, archive safety assurances, and explicit Proceed/Cancel actions.
  - Created `CustomSectionRenderer` rendering collection tables/cards/lists, existing-record views, archive recovery modals, and unknown block fallbacks.
  - Added 47 unit tests in `packages/ui-web/src/ui-web.test.ts`.
- **UI Mobile Primitives (`@daynori/ui-mobile`):**
  - Created `MobileCustomSectionBuilderSheet` with touch targets >= 48dp, screen-reader reordering, template picker, and field builder.
  - Created `MobileCustomSectionRenderer` with design token compliance and fallback card rendering.
  - Added 13 unit tests in `packages/ui-mobile/src/ui-mobile.test.ts`.
- **Integration Test Suite (`tests/integration/phase43-custom-section-builder.test.ts`):**
  - 16/16 tests passing across all 6 core user journeys: Reading List creation with folder placement, field reordering, personal template save and reuse without private data leakage, Study Hub combining Software files and tasks without source deletion, schema preview with repeated migration archive recovery, and unknown block fallback.
- **Phase 42/43 Defect Repairs & Complete Application Integration:**
  - **Database Migration 00047 (`infra/supabase/migrations/00047_custom_record_items_and_attachments.sql`):** Added canonical `app.items` backfill and identity for custom records with `fk_custom_section_records_item` constraint.
  - **Attachment Persistence Alignment:** Corrected `validateAndLinkReferences` to write real `app.item_attachments` table columns (`attachment_type`, `file_name`, `mime_type`, `byte_size`, `created_by`, `item_id`) and handle attachment reconciliation on record update/delete without orphan references.
  - **Folder & Collection Security Scoping:** Enforced strict workspace tenant, active status, and standard security scope checks on `folderId`. Enforced strict `collectionId` validation against active schemas and filtered records strictly per collection block in renderers.
  - **Existing Record View Expense Aggregation:** Enforced explicit opt-in preference checks (`expensesEnabled === true`), exact integer BigInt arithmetic for refund subtraction, currency-aware decimal formatting, and valid UUID summary identifiers matching schema contracts.
  - **Application UI Journeys & Field Editors:**
    - Connected `apps/web` (`/custom-sections` page and sidebar) and `apps/mobile` (`CustomSectionsView` modal via Settings) with starter selection, personal templates, builder dialogs, renderer, schema migration preview, archive recovery, and canonical source item navigation.
    - Created `CustomSectionEntryDialog` (`@daynori/ui-web`) and `MobileCustomSectionEntrySheet` (`@daynori/ui-mobile`) with real platform controls for text, checklist, date, number, link, and attachment field types.
- **Phase Status:**
  - Implemented and verified as provisional local development under explicit owner authorization; external beta gates and deployment remain **BLOCKED**. Work stops before Phase 44.

## Phase 42 — Safe custom section schema and renderer contracts — 2026-10-19

- **ADR 0041 Authored (`docs/decisions/0041-safe-custom-section-schema-and-renderer-contracts.md`):**
  - Documented declarative custom section schema architecture, two approved block families (`field_collection` and `existing_record_view`), rejection of arbitrary user scripts/SQL/raw HTML, zero-data-loss evolution via `archivedValues`, and the fallback renderer contract.
- **Contracts & Schemas (`@daynori/contracts`):**
  - Added schemas and types for `CustomBlockType`, `ExistingRecordViewBlock`, `CustomFieldDefinition`, `FieldCollectionBlock`, `CustomSectionSchemaPayload`, `CustomSectionItem`, `CustomSectionRecordItem`, and existing record queries.
- **Pure Domain & Validation (`@daynori/domain`):**
  - Implemented `validateFieldValue` for text, checklist, date, number, link, and attachment field types.
  - Implemented strict script/XSS/malicious protocol rejection, `validateRecordAgainstSchema`, `migrateRecordValues` with zero data loss (`archivedValues`), `isBlockSupported`, `createFallbackBlockRepresentation`, and canonical templates in `APPROVED_SECTION_TEMPLATES`.
  - Added 76 unit tests in `packages/domain/src/domain.test.ts`.
- **Database Migrations (`infra/supabase/migrations/00043_custom_sections_and_schemas.sql`):**
  - Created tables `app.custom_sections`, `app.custom_section_schemas` (immutable version ledger), and `app.custom_section_records`.
  - Added workspace-scoped Row Level Security (`tenant_isolation_policy`) and cascade deletion on workspace removal.
- **API Services & Routes (`apps/api`):**
  - Created `apps/api/src/modules/custom-sections/service.ts` for section, schema version, record CRUD, optimistic concurrency control (`409 REVISION_CONFLICT`), and existing record aggregation.
  - Registered authenticated routes in `apps/api/src/routes/v1/customSections.ts` with sync change feed emission.
- **API Client SDK (`@daynori/api-client`):**
  - Added 12 custom section, schema, record, and query methods to `DaynoriApiClient`.
- **Integration Test Suite (`tests/integration/phase42-custom-sections.test.ts`):**
  - 14/14 tests passing covering both block families, script rejection, zero-data-loss schema evolution, 409 conflict handling, cross-tenant isolation, workspace cascade deletion, sync changes, and fallback renderer contract.
- **Phase Status:**
  - Implemented and verified as provisional local development under explicit owner authorization; external beta gates and deployment remain **BLOCKED**. Work stops before Phase 43.

## Phase 41 — Audio recording and attachment lifecycle — 2026-10-19

- **ADR 0040 Authored (`docs/decisions/0040-audio-recording-and-attachment-lifecycle.md`):**
  - Documented explicit consent gesture, pulsing red recording indicator, 10-minute / 25MB limits with 9-minute warning threshold, interruption / incoming call pause, draft recovery, and private file attachment lifecycle.
- **Pure Domain & Constraints (`@daynori/domain`):**
  - Implemented `validateAudioDuration` (1s to 600s), `formatAudioDuration` (MM:SS), `calculateAudioProgress`, `isSupportedAudioMimeType` (WebM, MP4, OGG, WAV, MP3), `canAttachAudioToItem` ('note', 'journal', 'knowledge', 'file'), and `createAudioAttachment`.
  - Added unit tests in `packages/domain/src/domain.test.ts`.
- **API Contracts & Zod Schemas (`@daynori/contracts`):**
  - Added `AudioAttachmentSchema`, `AudioAttachmentResponseSchema`, `AudioRecordingDraftSchema`, `AudioTargetItemTypeSchema`, and `AudioRecordingStatusSchema`.
- **Accessible Web Audio Components (`@daynori/ui-web`):**
  - Created `AudioRecorderDialog` with explicit consent gesture, pulsing red indicator, elapsed counter with `role="timer"`, 10-minute progress bar, pause/resume, review stage, and draft recovery.
  - Created `AudioPlayerCard` with play/pause, scrub slider (`type="range"`), formatted metadata, and download / delete actions.
  - Added unit test suite in `packages/ui-web/src/ui-web.test.ts`.
- **Accessible Mobile Audio Components (`@daynori/ui-mobile`):**
  - Created `MobileAudioRecorderSheet` with explicit request, high-contrast active indicator, timer, 10-minute progress bar, pause/resume, and `AppState` interruption listener pausing on incoming phone calls or background switching.
  - Created `MobileAudioPlayerCard` with design token compliance and touch targets >= 48dp.
  - Added unit test suite in `packages/ui-mobile/src/ui-mobile.test.ts`.
- **Application Wiring (Web & Mobile):**
  - Web: Wired `AudioRecorderDialog` into `apps/web/src/app/library/page.tsx` toolbar, reserving and uploading audio blobs through the private file lifecycle.
  - Mobile: Added `audio-recorder` modal state to `apps/mobile/src/navigation/types.ts` and wired `MobileAudioRecorderSheet` in `apps/mobile/App.tsx`.
- **Integration Test Suite (`tests/integration/phase41-audio-recording-attachment.test.ts`):**
  - 17/17 tests passing covering permission refusal, 10m/25MB limits, WebM/MP4/WAV magic byte inspection, interruption draft recovery without false saved claims, quota reservation, attachment lifecycle, tenant isolation, cascade cleanup, and no auto-recording invariant.
- **Phase Status:**
  - Implemented and verified as provisional local development under explicit owner authorization; external beta gates, physical hardware, and deployment remain **BLOCKED**. Work stops before Phase 42.

## Repairs — Expense interfaces, proxy streaming, and mobile integration — 2026-10-19

- **BFF Streaming Proxy Hardening (`apps/web`):**
  - Updated Next.js API route proxy handler to stream non-JSON raw bytes (CSV, audio, video, attachments) preserving exact `Content-Type`, `Content-Disposition`, `Content-Length`, and `Cache-Control` headers.
  - Added `text/csv` to default fallback `Accept` header.
- **Durable Revisions & Optimistic Concurrency (`packages/contracts`, `apps/api`):**
  - Added `revision` to `ExpenseItemSchema` and optimistic revision checks (`expectedRevision`, `baseRevision`) to `UpdateExpenseBodySchema`.
  - Persisted item revisions in PostgreSQL queries and verified optimistic conflict handling (`409 ConflictError`).
- **Exact Financial Math & Domain Validation (`packages/ui-web`, `packages/ui-mobile`):**
  - Replaced IEEE 754 floating-point calculations with integer minor unit math (`BigInt`) in `ExpenseBudgetView`.
  - Harmonized zero-amount acceptance (`/^\d+(\.\d{1,4})?$/`) and local calendar date calculation across web and mobile capture dialogs.
  - Added cursor pagination, category filtering, and draft persistence to Web Expenses hub.
- **Mobile Expenses Integration (`apps/mobile`):**
  - Added opt-in toggle and "Open Expense Tracker" button in `SettingsView`.
  - Created accessible `ExpensesView` integrating month stepper, transactions list, spending report cards, budget overview, and CSV sharing via React Native `Share`.

## Phase 40 — Expense capture reports and budgets — 2026-10-19

- **Module Opt-in & Privacy Safeguards:**
  - Extended user display preferences contract (`DisplayPreferencesSchema` in `@daynori/contracts`) with `expensesEnabled` defaulting to `false`.
  - Financial data is excluded from default Today agenda and unauthenticated views; explicit opt-in controls provided in Web `/settings`, Mobile `SettingsView`, and `/expenses` page.
- **Fast Manual Entry & Transaction Capture (`@daynori/ui-web`, `@daynori/ui-mobile`):**
  - Created `ExpenseCaptureDialog` (Web) and `MobileExpenseCaptureSheet` (Mobile) for rapid entry of expenses, incomes, and refunds with exact decimal string amounts and zero floating-point math.
  - Linked refund items to original expenses with automatic category inheritance and cumulative refund limit enforcement.
  - Integrated receipt attachment picker and payment method tagging.
- **Comprehensive Monthly Reports & Multi-Currency Summaries (`apps/api`, `@daynori/ui-web`, `@daynori/ui-mobile`):**
  - Added `GET /v1/workspaces/:workspaceId/expenses/summary` computing exact gross spending, refunds, net spending, total income, and net savings per currency.
  - Truthfully handled negative net spending when cross-period refunds exceed current-month gross expenses.
  - Rendered accessible SVG bar visualization and tabular alternative in `ExpenseReportView` and `MobileExpenseReportView`.
- **Per-Currency Monthly Budgets & Factual Non-Advisory Messages (`apps/api`, `@daynori/ui-web`):**
  - Implemented budget CRUD routes (`GET`, `POST`, `PATCH`, `DELETE` `/v1/workspaces/:workspaceId/expenses/budgets`) with sync change feed integration.
  - Automated comparison of budget targets against actual net monthly spending, calculating remaining headroom and percentage progress.
  - Formatted factual, non-advisory tracking messages (e.g. "20% of budget used. $400.00 remaining in October 2026") strictly omitting financial advice or investment recommendations.
- **CSV Export & Formula Injection Defense (`apps/api`):**
  - Added `GET /v1/workspaces/:workspaceId/expenses/export` endpoint supporting date range, category, currency, and kind filters.
  - Neutralized CSV formula injection attacks (OWASP) by prepending a single quote `'` to cells starting with `=`, `+`, `-`, `@`, `\t`, or `\r`.
  - Emitted UTF-8 BOM (`\uFEFF`) to ensure Excel and LibreOffice recognize Unicode and Bangla scripts without corruption.
- **Tenant Isolation & Security:**
  - Enforced workspace membership verification (`SELECT app.user_has_workspace_role($1, 'viewer')`) across summary, export, and budget routes.
- **Phase Status:**
  - Implemented and verified as provisional local development under explicit owner authorization; external beta gates, physical hardware, and deployment remain **BLOCKED**. Work stops before Phase 41.

## Phase 39 — Expense tracking domain — 2026-10-19

- **Exact Money Representation & Invariants (`@daynori/domain`):**
  - Implemented `parseDecimalToMinorUnits`, `formatMinorUnitsToDecimal`, `validateRefundBounds`, `calculateNetSpending`, `calculateNetSavings`, and `getNextOccurrenceDate`.
  - Stored all monetary figures strictly in integer minor units (`BigInt`) with exact decimal string formatting, eliminating IEEE 754 floating-point drift.
  - Built currency registry supporting 0-decimal (JPY), 2-decimal (USD, BDT, EUR), and 3-decimal (KWD) currencies with exponent bounds enforcement.
  - Multi-currency isolation: summaries and monthly breakdowns group totals strictly per-currency without automatic conversion or summing across currencies.
- **Workspace-Scoped Categories & Organization (`app.expense_categories`, `app.expense_items`):**
  - Added user categories with workspace-scoped unique names (case/whitespace-normalized), soft-deletion, and color/icon styling.
  - Organized expense, income, and refund items with transaction dates, timezones, payment labels, notes, and canonical folder placement.
  - Verified receipt file attachment: validates file ownership within the same workspace, active verification status (`quarantine_status = 'verified'`), and rejection of quarantined/cross-workspace files.
- **Concurrency-Safe Refunds & Cumulative Bounds:**
  - Implemented transactional row-level locking (`SELECT ... FOR UPDATE`) of the original expense during refund creation and edits.
  - Enforced refund invariants: cumulative active refunds cannot exceed the original expense amount; refund currency must match the original expense.
  - Reductions to category spending: refunds reduce net category spending rather than inflating income; cross-month refunds truthfully reflect negative net spending when applicable.
  - Protected original expense from deletion or reduction below active cumulative refund totals.
  - Trashing a refund releases refundable headroom, while restoring it re-evaluates and re-claims headroom.
- **Recurring Entry Templates & Occurrence Deduplication (`app.expense_recurring_templates`):**
  - Added recurring expense/income templates supporting daily, weekly, monthly, and yearly recurrences.
  - Implemented idempotent occurrence generator endpoint (`/v1/workspaces/:workspaceId/expenses/recurring/generate`) tracking generated occurrences in `app.expense_recurring_occurrences` without duplication.
- **Database Schema Migration 00040 & SyncEngine Integration:**
  - Created `infra/supabase/migrations/00040_expense_tracking_domain.sql` defining `app.expense_categories`, `app.expense_items`, `app.expense_recurring_templates`, `app.expense_recurring_occurrences`, RLS policies, and updated `app.purge_owned_workspace` for clean tenant deletion.
  - Integrated with sync change feed (`app.changes`) and sequence tracking (`app.workspace_sync_state`).
- **Phase Status:**
  - Implemented and verified as provisional local development under explicit owner authorization; external beta gates, physical hardware, and deployment remain **BLOCKED**. UI and beta exposure remain disabled by default.

## Phase 38 — Controlled private beta & Lifecycle Hardening — 2026-10-19

- **Lifecycle State Machine & Deletion Coordination:**
  - Fixed account and workspace deletion state machine: "processing" is strictly distinguished from "completed"; `completedAt` is omitted while background storage or provider purges remain pending.
  - Hardened worker entry point: missing required adapters (`provider_user_purge`, `deletion_verification_email`, `blob_purge`) fail explicitly; database connection pool reads `DATABASE_URL` as well as `DB_*` / `PG*` variables.
  - Coordinated completion: overall account and public deletion completion requires both provider purge and storage purge completion.
  - Privileged functions & authorization hardening (Migration 00039): enabled RLS on `app.workspace_deletions`, added integrity triggers on deletion requests, bound `app.record_deletion_tombstone` strictly to verified entity IDs and caller context, added negative tests for forged callers, cross-user, and cross-workspace requests.
- **Truly Disposable Disaster Recovery Drill (`scripts/disaster-recovery-drill.mjs`):**
  - Replaced hardcoded target databases with uniquely named disposable source (`daynori_dr_src_<hex>`) and target (`daynori_dr_dst_<hex>`) databases and isolated per-run artifact directories (`artifacts/dr-runs/dr_<ts>_<hex>`).
  - Switched to argument-based process execution (`execFileSync`) with `-v ON_ERROR_STOP=1` to fail immediately on SQL errors; validated database targets before destructive operations; automatic cleanup on failure paths.
- **Controlled Private Beta Backend Enforcement & Scoping (`apps/api/src/modules/beta`):**
  - Backend enforcement of `BETA_ACCESS_MODE=private_invitation_only`: uninvited authenticated users are blocked from organizer endpoints; atomic invitation claiming (`/v1/beta/claim-invitation`) with `FOR UPDATE` locking, expiration, revocation, reuse, and seat limit verification.
  - Global `onRequest` and route preHandler barriers return HTTP 403 (`ApiErrorCode.FORBIDDEN`) on direct calls to unreleased modules (`/v1/expenses`, `/v1/vault`, `/v1/rooms`, `/v1/ai`, `/v1/billing`).
  - Environment validator (`validate-beta-env.mjs`): strictly validates `BETA_ALLOW_PUBLIC_SIGNUP=false`, positive integer bounds for workspace quota and seat limits, placeholder credentials, and aligns `REAUTH_SECRET` contract.
  - Smoke runner (`beta-smoke-check.mjs`): separated local integration checks from explicit remote deployment target checks (`TARGET_URL`), strictly asserting HTTP 403/404 isolation responses.
  - Android release signing in `build.gradle` reconciled with external keystore environment variables and project properties.
- **Release Gate Status:**
  - Prepared under explicit provisional authorization; execution, deployment, tester invitations, physical Android hardware checks, and store submission remain explicitly **BLOCKED**.

## Phase 37 — Core quality and usability release gate — 2026-10-18

- **Prerequisite Lifecycle & Authorization Repairs:**
  - Hardened public deletion form: allowed public anonymous mutations (`public/*`) through Next.js BFF without double-submit CSRF cookie while strictly validating Origin/Referer against `isAllowedOrigin` across local and production origins.
  - Browser deletion test hardening: replaced superficial page-text assertions with real response validation and database persistence assertions in PostgreSQL `app.public_deletion_requests`. Test fails if request is rejected or fails to reach upstream API.
  - Provider cleanup & truthful completion: hardened `SupabaseReauthAuthenticator.revokeUserSessions()` and `deleteUser()` to inspect HTTP responses, treat 404/not_found as confirmed absence, throw on 401/network errors, and require service role key in production. `DeletionService` persists retryable provider cleanup alongside storage cleanup and marks erasure complete only when all provider and storage cleanup succeeds.
  - Transaction & crash recovery: re-architected deletion into durable two-phase execution: database relational purge, outbox cleanup jobs, and suppression tombstones are atomically committed before external provider and storage effects. Handled idempotent retries on `status === 'completed' || status === 'processing'`. Enforced RLS tenant user context in `withUserContext`.
  - Privileged database functions (Migration 00038): hardened `purge_owned_workspace`, `purge_user_profile`, `reassign_shared_workspace_content`, `record_deletion_tombstone`, and `record_revoked_token` against unauthorized callers. Added verification of caller identity and active authorized deletion records. Added negative tests proving callers cannot purge other users' data or forge suppression entries. Added index `idx_items_keyset` on `app.items(workspace_id, created_at DESC, id DESC) WHERE deleted_at IS NULL`.
  - Real disposable disaster recovery drill (`scripts/disaster-recovery-drill.mjs`): implemented repeatable recovery drill performing real `pg_dump` of source database, creating isolated database `daynori_restore_drill`, executing `psql` restore, validating separate file object backup/restore, preserving independent deletion ledger, enforcing pre-access suppression barriers under `daynori_runtime` least privilege, and verifying zero data leakage (11.2s run). Corrected `docs/engineering/backup-and-recovery.md` to identify snapshot retention and RTO/RPO targets as proposed target architecture.
  - Durable email delivery outbox preparation: formalized capture adapter for local testing and prepared durable outbox retry behavior for production. Verification secrets kept out of logs and Git.
- **Core Application Journeys Classification:**
  - `tests/e2e/core-organizer-journeys.test.ts` accurately classified as API/Domain/Database integration with synthetic auth and memory storage (13/13 passing).
  - `scripts/test-web-e2e.mjs` exercises real browser UI and Next.js BFF with persistence and reopen assertions (50/50 passing).
  - `scripts/test-android-e2e.mjs` verifies APK build and accurately reports release gate `BLOCKED` due to missing physical hardware.
- **Performance Release Gate Benchmarks (`tests/performance/performance.test.ts`):**
  - Benchmark 1: Local save acknowledgment latency budget (p95 <= 100ms) passed (~15ms per save).
  - Benchmark 2: 10,000-record keyset pagination with `idx_items_keyset` under 50ms per page passed (~35ms per page, heap growth ~6.5MB).
  - Benchmark 3: 100 concurrent read (p95 <= 300ms) and mutation (p95 <= 500ms) operations across 20 workers with non-blocking SafeLogger sink passed (read p95: ~25ms, mutation p95: ~120ms).
  - Benchmark 4: Worker queue poll and SKIP LOCKED lease acquisition (<75ms p95) passed (~38ms).
- **Quality & Release Gate Status:**
  - Full test suite passing (61 test files, 897 tests passing across monorepo).
  - Clean TypeScript compilation across 13 workspace projects, clean lint, clean secret scanning (1,849 files checked).
  - Explicit release gate decision recorded as **BLOCKED** pending physical Android TalkBack hardware, native KeyStore signing, live production VAPID/FCM push delivery, and app store deployment credentials.

## Phase 36 — Account deletion backup and recovery lifecycle — 2026-10-18

- **Shared Data Contracts & Types (`packages/contracts`):**
  - Added deletion schemas in `packages/contracts/src/api/deletion.ts`: `RequestAccountDeletionBodySchema`, `RequestAccountDeletionResponseSchema`, `ConfirmAccountDeletionBodySchema`, `ConfirmAccountDeletionResponseSchema`, `CancelAccountDeletionBodySchema`, `CancelAccountDeletionResponseSchema`, `AccountDeletionStatusResponseSchema`, `RequestWorkspaceDeletionBodySchema`, `RequestWorkspaceDeletionResponseSchema`, `PublicDeletionRequestSubmissionSchema`, and `PublicDeletionRequestResponseSchema`.
  - Added `account_deletion` and `workspace_deletion` purposes to `ReauthenticatePurposeSchema`.
- **Account & Workspace Deletion Lifecycle (`apps/api`):**
  - Implemented `DeletionService` in `apps/api/src/modules/lifecycle/deletionService.ts` supporting distinct full account deletion and single workspace deletion.
  - Added cryptographic two-step confirmation state machine (`app.account_deletions`) with high-entropy confirmation token hashing, 24-hour cancellation deadline, and transparent retention disclosures.
  - Added immediate token revocation (`app.revoked_tokens`) with SHA-256 session token hashing, invalidating subsequent API calls with HTTP 401 Unauthorized (`TOKEN_REVOKED`).
  - Added subscription invalidation for Android push tokens (`app.devices`), Web Push subscriptions (`app.web_push_subscriptions`), and scheduled reminders (`app.reminder_instances`, `app.reminder_rules`).
  - Added collaborative shared content reassignment (`created_by = w.owner_id`) preventing orphaned records when an account is deleted.
  - Added dual-layer physical storage object purge and background worker `blob_purge` job handler in `apps/worker/src/worker.ts`.
  - Added `app.deletion_suppression_ledger` storing 90-day content-free cryptographic tombstones to prevent data resurrection during disaster recovery restore drills.
- **REST Endpoints & Client SDK (`apps/api`, `packages/api-client`):**
  - Added authenticated endpoints `POST /v1/auth/account-deletion/request`, `POST /v1/auth/account-deletion/confirm`, `POST /v1/auth/account-deletion/cancel`, `GET /v1/auth/account-deletion/status`, and `POST /v1/workspaces/:workspaceId/deletion`.
  - Added public unauthenticated endpoint `POST /v1/public/account-deletion-request` with enumeration protection and Play Policy compliance.
  - Added corresponding SDK methods to `DaynoriApiClient`.
- **Web & Mobile Deletion User Interfaces (`packages/ui-web`, `packages/ui-mobile`, `apps/web`, `apps/mobile`):**
  - Implemented accessible `AccountDeletionDialog` for Web settings with password reauthentication, retention disclosure, and permanent erasure confirmation.
  - Implemented accessible `MobileAccountDeletionSheet` for Mobile settings with Android hardware Back button integration.
  - Implemented dedicated public web resource at `/account-deletion` providing both in-app steps and enumeration-safe email deletion request submission.
- **Disaster Recovery Runbook & Database Migrations (`docs/engineering`, `infra/supabase`):**
  - Authored authoritative runbook `docs/engineering/backup-and-recovery.md` documenting dual-layer backup architecture, RPO/RTO objectives, suppression ledger replay, and Google Play compliance.
  - Migrations `00032_account_deletion_lifecycle_fks.sql`, `00033_revoked_tokens_reason.sql`, `00034_deletion_lifecycle_policies.sql`, `00035_repair_items_reassignment_policy.sql`, and `00036_repair_items_select_policy.sql`.
- **Automated Verification:**
  - Added 20 end-to-end integration tests in `tests/integration/phase36-deletion-recovery.test.ts` covering reauthentication enforcement, cancellation lifecycle, account erasure, token revocation, suppression ledger tombstone enforcement, distinct single workspace deletion, disaster recovery restore drill sanitization, worker blob purge jobs, and public deletion request handling (58/58 test files and 842/842 tests passing across the monorepo).

## Phase 35 — Portable export and controlled import — 2026-10-18

- **Shared Data Contracts & Types (`packages/contracts`):**
  - Added portable workspace schemas in `packages/contracts/src/api/portability.ts`: `ReauthenticateRequestSchema`, `ReauthenticateResponseSchema`, `ExportManifestSchema`, `ExportManifestSummarySchema`, `ExportManifestExclusionSchema`, `CreateExportRequestSchema`, `CreateExportResponseSchema`, `ImportDuplicateItemSchema`, `ImportDuplicateStrategySchema`, `ImportQuotaCheckSchema`, `ImportPreviewResponseSchema`, `ExecuteImportRequestSchema`, and `ExecuteImportResponseSchema`.
- **Zero-Dependency ZIP Engine (`apps/api`):**
  - Implemented standalone ZIP archive parser (`parseZipArchive`) and builder (`createZipArchive`) in `apps/api/src/modules/portability/zipArchive.ts` using Node.js standard `node:zlib` with CRC-32 checksum computation.
  - Path traversal hardening: `assertSafePath` rejects relative traversal (`..`), absolute paths, Windows drive letters (`C:\`), UNC shares, null bytes, and ASCII control characters.
  - Zip-bomb defense: enforces 200 MiB decompressed ceiling, maximum 5,000 entries, and a 100:1 compression ratio guard.
  - Complete structural validation: verifies End of Central Directory, Central Directory headers, and Local File headers.
- **HMAC-SHA256 Reauthentication & Ephemeral Security (`apps/api`):**
  - Built cryptographic reauthentication ticket issuance (`issueReauthToken`) and verification (`assertValidReauthentication`) bound to user ID, workspace ID, session hash, and purpose (`protected_export`) with a 10-minute expiry window.
  - Ephemeral signed download tokens with 15-minute TTL preventing unauthorized download link sharing or tampering.
- **Complete Multi-Format Export Engine (`apps/api`, `apps/worker`):**
  - Generated portable ZIP archives containing `manifest.json`, metadata (`folders.json`/`csv`, `tags.json`, `saved_views.json`), `notes/notes.json` and `notes/markdown/<id>_<slug>.md` (YAML frontmatter Markdown preserving Bengali Unicode and formatting), `tasks/tasks.json`/`csv`, `routines/routines.json`, `journal/journal.json`/`csv`/`markdown`, `calendar/calendar.json`, and clean binary attachments with SHA-256 integrity verification.
  - Strict security exclusions: excluded vault items (`security_scope != 'vault'`) and external Google Drive mirrors, explicitly documenting reasons in manifest exclusions.
  - Background worker task handler `workspace_export` registered in `apps/worker/src/worker.ts`.
- **Controlled Bounded Import Service (`apps/api`):**
  - `validateAndPreviewImport`: Dry-run preview unpacking archive in memory, validating checksums, checking target workspace storage quotas, and detecting item duplicates without mutating the database.
  - `executeConfirmedImport`: Transactional import with complete ID remapping, discarding foreign user IDs, minting fresh UUIDs, two-pass hierarchy linking for folders and tasks, duplicate resolution strategies (`skip`, `create_copy`, `overwrite_if_newer`), binary storage upload, quota updates, and sync change feed recording.
  - Single-use preview token consumption preventing replay attacks.
- **REST Portability API & API Client (`apps/api`, `packages/api-client`):**
  - Implemented `/v1/auth/reauthenticate`, `/v1/workspaces/:workspaceId/export`, `/v1/workspaces/:workspaceId/export/download/:exportId`, `/v1/workspaces/:workspaceId/import/preview`, and `/v1/workspaces/:workspaceId/import/execute` with raw binary payload handling up to 50 MiB.
  - Added `reauthenticate`, `createWorkspaceExport`, `previewWorkspaceImport`, and `executeWorkspaceImport` to `DaynoriApiClient`.
- **Web & Mobile Portability User Interfaces (`packages/ui-web`, `packages/ui-mobile`, `apps/web`, `apps/mobile`):**
  - Implemented `WorkspacePortabilityDialog` with reauthentication flow, multi-format export triggering, expiring download link timer, archive file picker, dry-run preview metrics, duplicate resolution selector, and transactional execution confirmation. Wired to `AppModals.tsx` and web settings.
  - Implemented `MobileWorkspacePortabilitySheet` with Export and Import tabs, reauthentication, preview inspection, and duplicate strategy selection. Wired to `App.tsx` and mobile settings with Android Back button support.
- **Automated Verification:**
  - Added 28 integration tests in `tests/integration/phase35-portability-export-import.test.ts` covering password reauthentication, multi-format export, vault exclusion, signed download expiry/tampering, path traversal/zip bomb defense, dry-run preview, total ID remapping, duplicate resolution strategies, and storage quota enforcement.

## Phase 34 — Conflict recovery and offline hardening — 2026-10-18

- **Shared Sync Engine Hardening (`packages/sync`):**
  - Implemented 90-day offline horizon check in `pushPending`: stale mutations older than `MAX_OFFLINE_HORIZON_MS` (90 days) are rejected from automatic replay and retained locally as recoverable failed conflicts.
  - Hardened `pullChanges` against edit-versus-delete: when server deletes an item, offline edits are preserved as `ConflictRecord` without resurrecting the deleted item.
  - Implemented missing/deleted parent recovery: re-parents affected entities to root (`folderId: null`) when parent folder was deleted or missing.
  - Storage quota classification in `saveItem`: catches `QuotaExceededError` and marks item status as `error` / `needs_attention` without falsely reporting `savedOnDevice`.
  - Snapshot bootstrap reset hardening: preserves and safely rebases pending operations and drafts across reset and cursor compaction.
  - Minted new unique operation IDs for each conflict resolution referencing the rejected operation; never reuse rejected IDs or timestamps as winners.
  - Implemented 3-way disjoint scalar merge for structured Task records (`mergeTaskFields`) and circular hierarchy depth validation (`validateFolderMovePolicy`).
- **Local Recovery Export & Redacted Diagnostics (`packages/sync`, `packages/ui-web`, `packages/ui-mobile`):**
  - Added `exportRecoveryData`: exports versioned JSON of drafts, pending mutations, conflicts, and attachment cache status, strictly stripping session tokens, passwords, credentials, capabilities, and masking vault plaintexts.
  - Added `getRedactedSyncDiagnostics`: redacts private document bodies, filenames, search queries, user/device IDs, and endpoints while providing actionable queue, in-flight, failed, and conflict metrics.
  - Standardized 5 product sync states: `Saved on this device`, `Syncing`, `Synced`, `Conflict`, and `Needs attention` via `formatSyncStateLabel`.
- **Web Conflict Review & Diagnostics Interfaces (`packages/ui-web`, `apps/web`):**
  - Implemented `ConflictReviewDialog` for accessible side-by-side / tabbed comparison of base, local, and server versions with `keep_server`, `keep_local`, and `save_copy` choices.
  - Implemented `SyncDiagnosticsDialog` and `RecoveryExportDialog` wired to `AppModals.tsx` and `settings/page.tsx`.
- **Mobile Conflict Review & Diagnostics Sheets (`packages/ui-mobile`, `apps/mobile`):**
  - Implemented `MobileConflictReviewSheet`, `MobileSyncDiagnosticsSheet`, and `MobileRecoveryExportSheet` with copy/share actions.
  - Wired sheets to `App.tsx` and `SettingsView.tsx` with Android hardware Back button integration.
- **Automated Verification:**
  - Added 10 integration tests in `tests/integration/phase34-conflict-recovery.test.ts` verifying concurrent text note edit conflict with `save_copy`, edit-versus-delete preservation, 90-day horizon rejection, deleted parent re-parenting, quota failure handling, 3-way task scalar field merge, conflicting scalar edit detection, circular folder move rejection, redacted diagnostics / secret exclusion, and SQLite repository transaction management.

## Phase 33 — Global authorized search and filters — 2026-10-18

- **Server Search & Full-Text/Trigram Indexing (`apps/api`, `infra/supabase`):**
  - Migration `00030_global_search_indexes.sql`: Activated `pg_trgm` extension and added GIN trigram indexes on `app.notes(title, plain_text_summary)`, `app.tasks(title, description)`, `app.journal_entries(title, plain_text_summary)`, `app.file_items(name)`, `app.folders(name)`, `app.tags(name)`, and `app.items(security_scope)` with predicate `security_scope != 'vault'`.
  - Added REST endpoint `GET /v1/workspaces/:workspaceId/search` with workspace viewer authorization and parameterized SQL queries across notes, tasks, journals, file metadata, folders, and tags.
  - Excluded vault content completely from search results, snippets, and total count metadata side channels. Excluded soft-deleted items by default.
  - Implemented journal privacy redactions respecting user preferences (`journalPreviewHidden`, `suppressBodySnippets`), redacting private journal snippets to `[Private journal entry]`.
  - Bounded input parsing and treated injection payloads, punctuation-only, and multilingual queries as inert search terms.
- **Contracts & API Client (`packages/contracts`, `packages/api-client`):**
  - Added `SearchItemTypeSchema`, `SearchQuerySchema`, `SearchQueryInput`, `SearchResultItemSchema`, and `SearchResponseSchema` in `packages/contracts/src/api/search.ts`.
  - Added `searchWorkspace(workspaceId, query, options)` method to `DaynoriApiClient`.
- **Pure Domain Local Search & Contextual Highlighting (`packages/domain`):**
  - Implemented client-side offline search engine `searchDownloadedRecords` with vault exclusion, tag/date/type filtering, pagination, and stable score/recency sorting.
  - Implemented safe search match token highlighting `highlightMatch` without regex injection vulnerability.
  - Implemented contextual search snippet extractor `extractSearchSnippet` windowing matching keyword occurrences safely.
  - Implemented canonical folder path resolution `buildFolderPath` with cycle prevention.
- **Web & Mobile Search User Interfaces (`apps/web`, `apps/mobile`):**
  - Replaced web navigation placeholder modal in `AppModals.tsx` with live debounced search, type filter chips (`All`, `Notes`, `Tasks`, `Journal`, `Files`, `Knowledge`), offline IndexedDB fallback (`coverage: 'offline_limited'`), safe match token highlighting, and canonical item navigation.
  - Replaced mobile sample result list in `SearchSheet.tsx` with live API search, offline SQLite repository fallback, type filters, and accessible item selection routing.
- **Automated Verification:**
  - Added 11 integration tests in `tests/integration/phase33-search.test.ts` verifying multi-tenant workspace isolation, revoked access rejection, strict vault exclusion, journal privacy preferences, deleted/archived filtering, inert SQL injection handling, multilingual Bangla and English queries, folder/tag filters, offline client-side search, and synthetic multi-tenant performance benchmark on indexed dataset measuring latency and `EXPLAIN (ANALYZE, BUFFERS)` query plan.

## Prerequisite repairs (Phase 31 offline onboarding, Phase 32 knowledge persistence and saved views) — 2026-10-18

- **Canonical Knowledge Purpose & Persistence (`apps/api`, `packages/contracts`, `packages/domain`):**
  - Added durable `purpose: 'guide' | 'cheatsheet' | 'general'` to Note `metadata` schemas in `packages/contracts`.
  - Created migration helper `ensureCanonicalNoteMetadata` persisting durable knowledge purpose across restarts, renaming, folder moves, and multi-device sync.
  - Fixed `matchesKnowledgeFilter` to inspect `metadata.purpose` rather than volatile title substring guessing.
- **User-Scoped Saved Views & CSRF Authenticated Web Transport (`apps/api`, `apps/web`):**
  - Filtered saved views by `user_id = actor_id` in `listSavedViews` preventing personal filter leak across workspace members.
  - Migrated web Library mutations to authenticated `createWebApiClient` with automatic CSRF token injection.
- **Quick Reference Faithful Copying & Platform Clipboard (`packages/domain`, `packages/ui-web`, `packages/ui-mobile`):**
  - Fixed syntax regex to avoid trimming trailing parentheses in code (e.g. `console.log(value)`).
  - Preserved meaningful leading indentation and whitespace in `cleanTextForClipboard`.
  - Wired `expo-clipboard` platform adapter on mobile with truthful copy announcements.
- **Links & Backlinks Resolution Across Entire Hierarchy (`apps/api`, `packages/ui-web`, `packages/ui-mobile`):**
  - Replaced in-memory item lookup with canonical identity resolution fetching real document metadata from server or local database.
- **Durable Offline Onboarding Intent (`apps/web`, `apps/mobile`):**
  - Persisted skip and completion intent durably in account-scoped offline storage before local dismissal.
  - Replayed pending onboarding preferences automatically on reconnect.

- **Web Push Transport & RFC 8188 Interoperability (`apps/worker`):**
  - Repaired host destination check in `assertSafePushEndpointNetworkDestination` using `net.isIP` to separate IP literals from DNS hostnames, resolving valid public push destinations (e.g. `fcm.googleapis.com`, `push.services.mozilla.com`) while retaining loopback/private/link-local/carrier-grade NAT rejection on all resolved IP addresses.
  - Implemented direct address binding in `defaultPushTransport` to eliminate DNS rebinding risks while enforcing TLS SNI hostname verification and redirect denial.
  - Aligned `encryptWebPushPayload` strictly with RFC 8188 Section 2 (zero-length Additional Authenticated Data for `aes128gcm` records).
  - Added `decryptWebPushPayload` helper verifying compliant authenticated decryption, Unicode payload preservation, and payload bounds.
- **Onboarding Persistence, Recovery, and Concurrency (`packages/domain`, `apps/web`, `apps/mobile`):**
  - Added `validateOnboardingState`, `getInitialOnboardingStepIndex`, and `mergeOnboardingState` to `@daynori/domain`.
  - Enabled resumable draft progress hydration from account-scoped storage (`daynori:onboarding:${userId}` on web, local repository snapshot on mobile) and authoritative server preferences.
  - Intermediate step and selection changes persist immediately on Next/Back navigation and interest toggling.
  - Made sample folder, note, and task creation strictly opt-in (defaults to `false`) and verified existence before inserting, preventing duplicated or overwritten user data.
  - Wired replay mode cleanly into web `AppModals` (`'onboarding-replay'`) and mobile `SettingsView` without creating starter items or modifying completion timestamps.
  - Handled 409 revision collisions on completion and skip with automatic state merging and local draft cleanup.
- **Mobile Offline Preference Durability (`apps/mobile`):**
  - Preserved authoritative server revisions in `TodayView.tsx`, storing pending modifications in `_pendingPreferences` in local preference snapshot when offline.
  - Applied pending preferences immediately to local UI and synchronized with API upon reconnection.
  - Added `refreshTrigger` prop to refresh Today presentation upon onboarding or customization completion without manual reload.

## Phase 32 — Knowledge guides and cheatsheet organization — 2026-10-18

- **Canonical NoteDocument AST Presets (`packages/domain`):**
  - Implemented `createGuideDocument` factory composing procedural how-to guides with step-by-step ordered lists and verification checklists into standard `NoteDocument` AST v1.
  - Implemented `createCheatsheetDocument` factory composing categorized command and syntax cheatsheets with code values and descriptions into standard `NoteDocument` AST v1.
  - Enforced single canonical note body representation across notes and knowledge items without duplicate tables or secondary stores.
- **Quick-Reference Browsing & Clean Text Capture (`packages/domain`, `packages/ui-web`, `packages/ui-mobile`):**
  - Implemented `extractQuickReferenceSections` extracting headings, command/syntax entries, and checklists for rapid scannability.
  - Implemented `cleanTextForClipboard` stripping Markdown code fences (e.g. ` ```bash `), single/triple backticks, and control characters to ensure pure plain-text terminal and editor copying.
  - Built `QuickReferenceView` (Web) and `MobileQuickReferenceView` (Mobile) with screen-reader live region confirmations (`aria-live="polite"`), checklist toggles, and internal links & backlinks panel.
- **Saved Views & Non-Destructive Multi-View Filtering (`apps/api`, `packages/contracts`, `packages/domain`):**
  - Applied migration `00028_saved_views_and_knowledge_organization.sql` introducing `app.saved_views` with workspace tenant isolation, RLS policies, and compound indexes.
  - Added saved views REST API routes (`POST`, `GET`, `PATCH`, `DELETE`) in `apps/api/src/routes/v1/knowledge.ts`.
  - Implemented pure filter predicate `matchesKnowledgeFilter` in `@daynori/domain`, enabling one canonical note body to match multiple saved views (presets, tags, topic folders, pins, search queries) non-destructively.
- **Internal Item Links, Backlinks, and Honest Explanations (`apps/api`, `packages/domain`):**
  - Implemented link resolution endpoint `GET /v1/workspaces/:workspaceId/items/:itemId/links/resolved` joining forward outgoing links and reverse incoming backlinks with item metadata.
  - Added `formatUnavailableLinkNotice` providing honest, accessible notices (`"Title" has been moved to trash or deleted`, or `does not exist or could not be found`) with strikethrough styling.
  - Enforced cross-tenant link creation rejection (HTTP 404) and leak protection, ensuring private titles in other workspaces are never disclosed.
- **Library Interfaces (`apps/web`, `apps/mobile`):**
  - Integrated "+ Guide", "+ Cheatsheet", quick reference viewer toggle, saved views bar, and "Save View" dialog on Web (`/library`).
  - Integrated "+ Guide", "+ Cheatsheet", quick reference viewer, and horizontal saved views scroll list on Mobile (`LibraryView`).
- **Automated Verification:**
  - Added 12 integration tests in `tests/integration/phase32-knowledge.test.ts` verifying canonical presets, clean clipboard capture, topic folder relocation, saved views CRUD, multi-view matching without duplication, internal links and reverse backlinks, honest explanations for deleted and dangling targets, and tenant isolation.

## Phase 31 — First-use tutorial and progressive discovery — 2026-10-18

- **First-Use Onboarding Engine (`packages/domain`, `packages/contracts`):**
  - Modeled `OnboardingState` (version 1) supporting skippable progression across `capture`, `planning`, `organize`, and `completed` steps.
  - Implemented `deriveModuleShortcutsFromInterests` configuring visible module shortcuts matching chosen goals (`notes`, `planning`, `journal`, `files`) while preserving underlying data authorization and capabilities.
  - Implemented deterministic starter content UUID generators (`getSampleFolderId`, `getSampleNoteId`, `getSampleTaskId`) using SHA-256 (RFC 4122 v5) for complete mathematical idempotency across retries, reloads, and multi-device sync without duplicate item creation.
  - Enforced replay preservation invariant (`resetOnboardingForReplay`): Keeps tracked sample item and folder IDs intact so replaying the tutorial never re-creates sample items or removes user content.
- **Web Onboarding Experience (`apps/web`):**
  - Built 3-step accessible tutorial dialog with screen-reader live announcements (`aria-live="polite"`), step progress bar, and keyboard focus trapping.
  - Step 1 (Capture & Focus): Selected goals with transparency disclaimer ("Visibility changes presentation, not authorization").
  - Step 2 (Organization & Contextual Permissions): Explains one-time Upcoming Tasks vs recurring Daily Routines, highlighting that permissions (microphone, push notifications, Google Drive) are deferred until those features are actively used.
  - Step 3 (Starter Setup): Opt-in creation of personal starter folder, sample note, and sample task.
  - Integrated automatic launch on first sign-in in `TodayView` when `shouldShowOnboarding` is true.
  - Added "Replay Onboarding Tutorial" action in web Settings page (`/settings`).
- **Mobile Onboarding Experience (`apps/mobile`):**
  - Built `OnboardingSheet` bottom modal using accessible primitives with TalkBack announcements (`AccessibilityInfo.announceForAccessibility`), 48dp minimum touch targets, WCAG 2.2 AA token compliance, and Android hardware back handler.
  - Added `'onboarding'` to `ActiveModal` in mobile navigation types.
  - Integrated automatic first-use trigger in mobile `TodayView` and wired into `App.tsx`.
  - Added "Tutorial & Getting Started" section with "Replay Onboarding Tutorial" action in mobile `SettingsView`.
- **API & Preference Concurrency (`apps/api`):**
  - Updated `apps/api/src/routes/v1/users.ts` and `apps/api/src/routes/v1/workspaces.ts` to map and persist `onboarding` preferences with revision concurrency control.
- **Automated Verification:**
  - Added 10 integration tests in `tests/integration/phase31-onboarding.test.ts` verifying fresh account baseline, goal selection shortcut derivation, deterministic starter generation, skippable onboarding, replay safety without duplication, and multi-device conflict resolution.

## Phase 30 — Today home and personal customization — 2026-10-18

- **Today Organizer Dashboard (`apps/web`, `apps/mobile`):**
  - Built calm, focused Today view connecting authenticated domain entities across web and mobile without demo-seed pollution.
  - Implemented today's routine occurrences checklist with independent status actions (Done, Skip, Reopen, and Undo toast).
  - Implemented tasks due today with collapsible overdue task section displaying explicit count and deadlines.
  - Integrated upcoming 7-day priority summary and quick capture action bar.
  - Added optional recent items summary across notes, tasks, routines, and files with strict privacy redaction.
  - Added optional favorite folders section with safe fallback for unpinned or deleted folders.
  - Integrated daily reflection prompt without body snippet preview leaks.
- **Versioned Personalization Metadata (`packages/domain`, `packages/contracts`):**
  - Modeled `HomeLayout` (version 1) holding widget visibility/order, bounded custom labels, density (`comfortable` / `compact`), module shortcuts, and favorite folder IDs.
  - Defined approved closed registries (`APPROVED_HOME_WIDGET_IDS`, `APPROVED_MODULE_SHORTCUT_IDS`) rejecting unapproved identifiers (`vault`, `expenses`, `rooms`, `ai_copilot`).
  - Implemented `validateCustomLabel` bounding labels (1-40 chars) and stripping `<script>`, `<style>`, and HTML tags to prevent XSS.
  - Implemented accessible `reorderWidgets` and `reorderModuleShortcuts` Move Up/Down alternatives to drag-and-drop.
  - Implemented safe migration (`sanitizeAndMigrateHomeLayout`) dropping unreleased modules and restoring missing approved cards.
- **Persistence, Concurrency & Preference Preservation (`apps/api`, `packages/api-client`):**
  - Integrated `homeLayout` into `DisplayPreferencesSchema` and `UpdatePreferencesRequestSchema`.
  - Enforced optimistic revision checks on preference updates with HTTP 409 Conflict handling for concurrent edits.
  - Implemented repository-layer partial merging to guarantee that changing layout or density never wipes unrelated preferences (`quietHours`, `theme`, privacy settings).
  - Maintained strict non-destruction invariant: restoring default layout resets presentation metadata only and never touches canonical tasks, routines, notes, files, or folders.
- **Privacy Redactions:**
  - Implemented `filterRecentItemsForPrivacy` ensuring journal items have body preview stripped and generic title fallback, while completely excluding vault items from the Today home.
- **Automated Verification:**
  - Added 13 integration tests in `tests/integration/phase30-today-home.test.ts` verifying all personalization journeys, concurrency conflicts, and privacy boundaries.

## Defect repairs (Phase 28/29 notification foundation and PWA safety) — 2026-10-17

- **Push Subscription Account Binding & Logout Cleanup (`apps/web`, `apps/api`, `infra/supabase`):**
  - Connected browser push cleanup and unsubscription to user sign-out (`cleanupWebPushOnSignOutAsync`).
  - Added atomic account rebinding (`app.rebind_web_push_endpoint(endpoint, user_id)`) and database partial unique index (`uq_web_push_active_endpoint`) preventing one endpoint from remaining active across multiple accounts on shared browsers.
  - Implemented durable offline deactivation queue (`flushPendingPushDeactivationsAsync`) via `localStorage`.
  - Added late asynchronous subscription rejection guard on identity switches.
- **Service Worker Cache Safety & Precache Review (`apps/web`):**
  - Removed root navigation (`/`) from precache allowlist, ensuring authenticated TodayOrganizer is never cached in public cache storage.
  - Enforced strict query parameter exclusion (`?signature=`, `?token=`) on static assets.
  - Switched navigation requests to network-first falling back to unauthenticated `/offline.html`.
  - Added live sandbox execution test executing shipped `sw.js` with mock `CacheStorage`, `Request`, `Response`, and push event verification.
- **Durable Background Retry Jobs & Real Transport Configuration (`apps/worker`, `apps/api`):**
  - Added durable background retry scheduling into `app.background_jobs` with exponential backoff on transient delivery failures (HTTP 502/503/504), bounded attempts, and 24-hour TTL check.
  - Configured real Web Push transport (`createConfiguredWebPushAdapter`) returning truthful `unavailable` status when VAPID credentials are unconfigured.
  - Guarded `getVapidPublicKey` to throw `VAPID_UNCONFIGURED` in production when missing.
- **SSRF Hardening & Input Validation (`apps/api`):**
  - Hardened `assertValidPushEndpoint` against IPv4 variants (octal, hex, dword), IPv6-mapped addresses, non-standard ports (strictly default HTTPS 443), and embedded credentials.
  - Enforced subscription key format checks (`assertValidSubscriptionKeys`).
- **Reminder Agenda Account Isolation & Truthful Offline Claims (`apps/web`):**
  - Scoped local agenda caching to account and workspace (`daynori_agenda_cache_${workspaceId}`).
  - Cleared agenda state immediately upon account or workspace change.
  - Displayed truthful offline indicators distinguishing cached data from unavailable offline state.

## Phase 29 — Web reminder delivery and PWA support — 2026-10-17

- **Web Push Capability & Subscription Lifecycle (`apps/web`, `packages/contracts`, `packages/api-client`, `apps/api`, `infra/supabase`):**
  - Implemented capability detection (`webPushManager.ts`) checking `isSecureContext`, `serviceWorker`, `PushManager`, and `Notification.permission`.
  - Added VAPID application key retrieval endpoint (`GET /v1/web-push/vapid-public-key`) and base64url key helpers.
  - Implemented subscription registration (`POST /v1/web-push/subscriptions`), deactivation (`DELETE /v1/web-push/subscriptions`), and listing (`GET /v1/web-push/subscriptions`) with PostgreSQL RLS on `app.web_push_subscriptions`.
  - Added SSRF protection (`assertValidPushEndpoint`) rejecting loopback, RFC1918 private subnets, cloud metadata IPs, and insecure HTTP endpoints.
- **Worker Web Push Delivery Coordination (`apps/worker`):**
  - Integrated `WebPushNotificationAdapter` into `DaynoriWorker` with per-target delivery isolation.
  - Local schedule acknowledgments on Android devices suppress push for that specific Android device only without muting desktop or mobile Web Push alerts.
  - Handled expired push subscriptions (HTTP 410 Gone / unsubscribed) by marking `is_active = false`.
  - Implemented bounded retry with exponential backoff on transient errors (HTTP 502/503/504).
- **Service Worker & PWA Safety Shell (`apps/web`):**
  - Added web app manifest (`apps/web/public/manifest.json`) and clean offline shell fallback (`apps/web/public/offline.html`).
  - Reviewed service worker (`apps/web/public/sw.js`) enforcing strict static allowlist caching (`daynori-static-v1`) for public static assets.
  - Strictly excluded authenticated HTML documents, Next.js RSC/prefetch payloads (`_rsc`, `RSC: 1`), private API endpoints (`/api/*`, `/v1/*`), and signed URLs to prevent cross-account offline leakage.
  - Handled push events with generic privacy-minimized notification text (`Daynori Reminder`).
  - Added safe notification click handler closing the notification, validating same-origin destinations, and focusing or navigating existing windows.
- **Accessible In-App Reminder Agenda Fallback (`apps/web`):**
  - Implemented `ReminderAgendaView` (`apps/web/src/components/ReminderAgendaView.tsx`) embedded into Settings and Plan tabs (`Reminders & Agenda` view filter).
  - Provides an accessible, keyboard-navigable agenda view displaying upcoming due reminders, delivery channels, and privacy levels.
  - Includes browser push capability indicators, subscription toggle controls, and offline status feedback.
- **Integration Test Suite & Verification:**
  - Added 16 end-to-end integration tests in `tests/integration/phase29-web-reminders.test.ts`.
  - Verified across 693 tests with 100% pass rate.

## Defect repairs (Phases 27 and 28 notification foundation) — 2026-10-17

- **Push Token & Transport Alignment (`apps/mobile`, `packages/contracts`, `infra/supabase`):**
  - Differentiated native Android FCM device tokens (`fcm`) from Expo Push transport tokens (`expo_push`), adding `expo_push` check constraint to `app.devices.token_type` and migrating legacy registrations in migration `00026_notification_delivery_coordination_and_web_push.sql`.
  - Added push token rotation listener (`setupPushTokenRotationListener`) to reconcile device registration upon rotation.
  - Derived capability state honestly from current permission, registration, and provider availability rather than stale secure-storage tokens.
- **Local Reminder Schedule Coordinator (`apps/mobile`):**
  - Implemented `ReminderScheduleCoordinator` (`apps/mobile/src/notifications/coordinator.ts`) persisting instance/rule/generation/nativeId mappings in secure storage.
  - Wired into `apps/mobile/App.tsx` on initialization, app resume, and sync pull.
  - Persisted unacknowledged local schedules and retried server acknowledgment.
  - Added local alert cancellation and acknowledgment invalidation on logout, account switch, item deletion, and item completion.
- **Per-Device Delivery Coordination (`apps/worker`, `apps/api`, `infra/supabase`):**
  - Tracked delivery uniqueness per recipient device and subscription via `uq_reminder_deliveries_target`.
  - Ensured local schedule acknowledgment on Android Device A suppresses Device A only (`suppressed_local_schedule`) without suppressing Device B or web push subscriptions.
  - Handled retryable failed/unavailable delivery attempts up to 3 bounded retries with backoff.
- **Notification Privacy, Navigation & Deduplication (`apps/mobile`, `packages/contracts`):**
  - Applied shared generic redaction (`Daynori Reminder: You have a scheduled reminder`) by default for lock-screen safety unless detailed content is explicitly requested.
  - Handled notification responses with authenticated account/workspace reauthorization, stale/deleted-target fallback, and instance/generation identity deduplication.
  - Cleared consumed responses and invalidated pending protected destinations upon sign-out.
- **Evidence & Manifest Audit (`docs/phase-reports/phase-28.md`):**
  - Corrected tool versions (Node v24.11.1, pnpm 9.15.5, Vitest 4.1.11, TypeScript 5.7.3).
  - Clarified evidence separation between mocked Expo unit/integration tests, native manifest inspection, physical hardware behavior, and live push provider submission.

## Phase 28 — Android notifications and local reminders — 2026-10-17

- **Native Android Notification Adapter (`apps/mobile`):**
  - Integrated `expo-notifications` (`~0.29.13`) and `expo-device` (`~7.0.2`) behind platform-isolated TypeScript adapter (`apps/mobile/src/notifications/adapter.ts`).
  - Configured Android notification channels: `reminders` (high importance, vibration pattern `[0, 250, 250, 250]`, lock-screen visibility `PRIVATE`) and `updates` (default importance).
  - Implemented capability querying distinguishing `undetermined`, `granted`, `denied`, and `channel_disabled`.
  - Added accessible deep-link to Android system app settings via `openSystemSettingsAsync()` when notification permissions are revoked or channels disabled.
- **Contextual Permission Flow & Settings (`apps/mobile`):**
  - Added in-context notification permission request flow triggered by reminder creation and settings toggle.
  - Updated `apps/mobile/src/views/SettingsView.tsx` with live channel preference controls and truthful capability state display without permanent optimistic defaults.
- **Device Registration & Management (`apps/api`, `packages/contracts`, `packages/api-client`, `infra/supabase`):**
  - Added database table `app.devices` tracking installation IDs, push tokens, token types (`fcm`, `web_push`, `none`), platforms, versions, and active state, protected by PostgreSQL Row-Level Security (`p_devices_*`).
  - Exposed REST endpoints `POST /v1/devices`, `DELETE /v1/devices/:installationId`, and `GET /v1/devices`.
  - Added `registerDevice`, `deactivateDevice`, and `listDevices` to `DaynoriApiClient`.
- **Local Reminder Scheduling & Push Suppression (`apps/mobile`, `apps/worker`, `apps/api`):**
  - Added database table `app.device_reminder_schedules` tracking device-local schedule acknowledgments per reminder occurrence and delivery generation.
  - Exposed endpoint `POST /v1/workspaces/:workspaceId/reminders/schedules/acknowledge`.
  - Extended background worker (`apps/worker/src/worker.ts`): queries `app.device_reminder_schedules` and suppresses redundant server push when a local schedule has been acknowledged by the device.
  - Implemented `cancelScheduledReminderAsync` cancelling native Android notifications when items are rescheduled, completed, or cancelled.
- **Privacy, Deep Linking & Tap Deduplication (`apps/mobile`):**
  - Enforced lock-screen privacy by setting channel visibility to `PRIVATE` and generating generic previews hiding confidential note, journal, or vault content.
  - Handled foreground, background, and cold-start notification responses routing directly to authorized task, calendar event, or routine screens.
  - Implemented 3-second debounce window preventing duplicate navigation on repeated notification taps.
- **Exact-Alarm Policy Compliance (`apps/mobile`):**
  - Preserved the Google Play exact-alarm gate: ordinary reminders use standard date triggers without requiring restricted `SCHEDULE_EXACT_ALARM` or `USE_EXACT_ALARM` permissions.
- **Integration Test Suite (`tests/integration`):**
  - Added `tests/integration/phase28-android-notifications.test.ts` (15 passing tests) covering channels, permissions, token lifecycle, local scheduling, push fallback suppression, invalid token cleanup, deep links, tap deduplication, and lock-screen redaction.
- **Decision Record:**
  - Published [ADR-0034: Android Notifications, Device Registration, and Local-Push Coordination](docs/decisions/0034-android-notifications-and-device-schedules.md).

## Phase 27 — Reminder scheduling and durable delivery jobs — 2026-10-17

- **Pure Domain Operations (`packages/domain`):**
  - Implemented `isTimeInQuietHours` evaluating timezone-aware quiet hours across single-day and midnight-crossing intervals (e.g., 22:00 to 08:00) with DST safety.
  - Implemented `calculateNextQuietHoursEnd` resolving the exact opening UTC instant with DST disambiguation.
  - Implemented `calculateSnoozeTime` clamping snooze durations between 5 and 1440 minutes (24 hours).
  - Implemented `materializeReminderOccurrences` generating deterministic, compound occurrence keys (`${rule.id}_rev${rule.ruleRevision}_...`) within a 14-day rolling horizon.
  - Implemented `redactReminderPayload` strictly suppressing sensitive note text, journal reflections, or vault bodies from delivery buffers (generic vs. detailed mode).
- **Contracts & Validation (`packages/contracts`):**
  - Added Zod schemas: `ReminderRuleSchema`, `ReminderInstanceSchema`, `ReminderDeliverySchema`, `CreateReminderRuleRequestSchema`, `UpdateReminderRuleRequestSchema`, `SnoozeReminderRequestSchema`, and `RecordDeliveryReceiptRequestSchema`.
- **Database Schema & Multi-Tenant Isolation (`infra/supabase`):**
  - Added migration `00024_reminder_rules_instances_and_deliveries.sql` creating tables `app.reminder_rules`, `app.reminder_instances`, and `app.reminder_deliveries`.
  - Added compound uniqueness constraint on `(workspace_id, rule_id, rule_revision, occurrence_key)` to guarantee recurrence idempotency.
  - Enforced PostgreSQL Row-Level Security (RLS) policies on personal workspaces (`p_reminder_rules_*`, `p_reminder_instances_*`, `p_reminder_deliveries_*`).
- **REST API Routes & Service (`apps/api`):**
  - Registered `/v1/workspaces/:workspaceId/reminders`: rule CRUD (`POST /rules`, `GET /rules`, `GET /rules/:ruleId`, `PATCH /rules/:ruleId`, `DELETE /rules/:ruleId`), instance listing (`GET /instances`), snooze (`POST /instances/:instanceId/snooze`), and receipt recording (`POST /deliveries/:deliveryId/receipt`).
  - Integrated target lifecycle invalidation: completing, cancelling, rescheduling deadline, or deleting a task, calendar event, or routine immediately invalidates pending reminder instances.
- **Client SDK (`packages/api-client`):**
  - Added `createReminderRule`, `listReminderRules`, `getReminderRule`, `updateReminderRule`, `deleteReminderRule`, `listReminderInstances`, `snoozeReminderInstance`, and `recordDeliveryReceipt` to `DaynoriApiClient`.
- **Durable Leased Delivery Jobs (`apps/worker`):**
  - Implemented handler for `task_type === 'reminder_delivery'` in `DaynoriWorker` using PostgreSQL `FOR UPDATE SKIP LOCKED` and lease fencing (`leased_until > now()`).
  - Added pre-dispatch target verification (invalidating reminders for completed/cancelled/deleted items), quiet hours handling (`drop`, `defer`, `allow`), payload redaction, and channel deduplication.
- **Integration Test Suite (`tests/integration`):**
  - Added `tests/integration/phase27-reminders.test.ts` (19 passing tests) verifying pure domain logic, RLS isolation, task completion invalidation, deadline rescheduling invalidation, snooze transitions, delivery receipts, worker leased-job crash recovery, duplicate delivery suppression, quiet hours drop behavior, truthful unavailable delivery status without push adapter, quiet hours deferral job preservation through full polling lifecycle, source deadline updates rebuilding future occurrences, and optimistic concurrency `baseRevision` enforcement.
- **Defect Repairs & Invariant Hardening (`apps/worker`, `apps/api`, `packages/domain`, `packages/contracts`):**
  - Removed fabricated `prov_*` acceptance; missing push provider produces truthful `unavailable` status; push deliveries only record acceptance when confirmed by an active push adapter.
  - Fixed quiet-hours deferral in outer worker loop to preserve jobs returning `deferred`/`rescheduled` with updated `run_at` instead of marking them `completed`.
  - Redefined snooze calculation relative to user action instant (not stale scheduled_at), advancing `delivery_generation` so prior deliveries do not suppress snoozed alerts and duplicate snooze requests remain idempotent.
  - Added `rebuildTargetReminders` hooks on task deadline changes, routine schedule/pause/resume updates, and calendar event updates to recompute eligible occurrences. Added durable rolling-horizon replenishment (`replenishRollingHorizonReminders`).
  - Enforced optimistic concurrency via `baseRevision` checks on rule updates, atomic instance/job mutations, monotonic delivery receipt state transitions (preventing clients from regressing `opened` or fabricating delivery states), and verified tenant scoping on pooled connections.
  - Exposed `quietHours` in `@daynori/contracts` `UserProfilePreferencesSchema` and `DisplayPreferencesSchema`, enabling validated preference synchronization instead of relying on administrative fixtures.
- **Decision Record:**
  - Published [ADR-0033: Reminder Scheduling, Recurrence Instances, and Durable Delivery Jobs](docs/decisions/0033-reminder-scheduling-and-durable-delivery-jobs.md).

## Phase 26 — Calendar and deadline views — 2026-10-17

- **Pure Domain Operations (`packages/domain`):**
  - Implemented `validateCalendarEventTitle` and `validateCalendarEventInterval` enforcing strict title constraints, all-day exclusive end dates (`endDate > startDate`), and timed timestamp ordering (`endAt > startAt`).
  - Implemented `getDaysCoveredByAllDayEvent`, `isEventActiveOnDate`, `isTaskDeadlineOnDate`, and `getItemsForDate` for fast date and interval querying.
  - Implemented `buildMonthGrid` supporting customizable week starts (Mon=1, Sun=7, Sat=6), today flags, and item mappings.
  - Implemented `buildCalendarReadModel` aggregating canonical tasks, routine occurrences, personal events, and privacy-preserving journal indicators into a consolidated read model without duplicating task tables.
- **Contracts & Validation (`packages/contracts`):**
  - Added Zod schemas for calendar events, requests, feed query, and read model responses (`CalendarEventSchema`, `CalendarFeedQuerySchema`, `CalendarReadModelResponseSchema`).
  - Added item schemas for feed union (`CalendarTaskDeadlineItemSchema`, `CalendarRoutineOccurrenceItemSchema`, `CalendarPersonalEventItemSchema`).
  - Configured boolean query preprocessing with `z.preprocess` for reliable query parameter coercion.
- **Database Schema & Multi-Tenant Isolation (`infra/supabase`):**
  - Added migration `00022_calendar_events_and_projections.sql` creating table `app.calendar_events` linked to canonical `app.items(workspace_id, id)`.
  - Added interval check constraint `chk_calendar_event_interval` enforcing all-day exclusive end dates and timed timestamp ordering.
  - Enforced PostgreSQL Row-Level Security (RLS) policies (`p_calendar_events_select`, `p_calendar_events_insert`, `p_calendar_events_update`, `p_calendar_events_delete`).
- **REST API Routes & Service (`apps/api`):**
  - Registered `/v1/workspaces/:workspaceId/calendar/feed` returning unified projection read models.
  - Registered personal calendar event CRUD endpoints: `POST /events`, `GET /events/:eventId`, `PATCH /events/:eventId`, and `DELETE /events/:eventId` with mutation receipts and change feed entries.
- **API Client (`packages/api-client`):**
  - Added `getCalendarFeed`, `createCalendarEvent`, `getCalendarEvent`, `updateCalendarEvent`, and `deleteCalendarEvent` to `DaynoriApiClient`.
- **Sync Engine & Durable Local Storage (`packages/sync`, `apps/web`, `apps/mobile`):**
  - Extended `LocalRepositoryPort` with calendar event CRUD signatures and transactional operations.
  - Handled `calendar_events` in `SyncEngine.applyPullPage` and bootstrap generation.
  - Upgraded Web IndexedDB store to `DB_VERSION = 8` with `calendar_events` store and indices.
  - Upgraded Mobile SQLite schema to version 9 with `calendar_events` table and sync application.
- **Web User Interface (`apps/web`):**
  - Created `apps/web/src/app/plan/calendar/page.tsx` with live API feed connection and local fallback.
  - Supported Agenda (`role="feed"`), Day, and Month (`role="grid"`) view modes.
  - Supported week-start preferences (Monday, Sunday, Saturday) and source filter chips (`⏱ Tasks`, `🔄 Routines`, `🗓 Events`).
  - Supported journal privacy count indicators and Add/Edit event modal dialog with live validation.
- **Mobile User Interface (`apps/mobile`):**
  - Integrated Calendar sub-view into `apps/mobile/src/views/PlanView.tsx`.
  - Supported Agenda, Day, and Month modes, week-start selector, and source filter chips.
  - Added New Calendar Event bottom sheet (`MobileModalSheet`) with transactional offline persistence.
- **Integration Test Suite (`tests/integration`):**
  - Added `tests/integration/phase26-calendar-deadlines.test.ts` (15 passing tests) verifying aggregated projections, canonical task deadline updates, interval validations, week-start preferences, DST handling, journal privacy preservation, multi-tenant workspace isolation, source filter toggles, and IndexedDB local storage.
- **Decision Record:**
  - Published [ADR-0032: Unified Calendar Views, Canonical Deadline Projections, and Personal Events](docs/decisions/0032-calendar-views-and-deadline-projections.md).

## Defect Repairs & Hardening (Phase 24/25) — 2026-10-17

- **Authoritative Mobile Uploads & Metadata (Finding A):**
  - Integrated real file picking and upload execution (`reserveFileUpload`, PUT transfer, `finalizeFileUpload`) in `LibraryView.tsx` and `MobileFileUploadSheet.tsx`.
  - Replaced simulated local metadata fabrication with authoritative backend synchronization via `repository.getFile` and `apiClient.getFileMetadata`.
  - Disallowed offline upload simulations; offline upload attempts return explicit error feedback.
- **Web Upload Cancellation & Safe Reservation Disposal (Finding B):**
  - Connected `_abortSignal` directly to XHR abort in `apps/web/src/app/library/page.tsx`.
  - Checked abort state at reservation and transfer boundaries, invoking `cancelFileUploadReservation` to release reserved quota exposure immediately and preventing subsequent finalization.
- **Persistent Mobile Offline Cache & Cryptographic Integrity (Finding C):**
  - Implemented `PersistentMobileOfflineStorageAdapter` in `apps/mobile/src/data/offlineFileCache.ts` with bounded storage limit (50MB), FIFO/LRU eviction, crash-safe atomic tmp-to-dest writes, and restart recovery across app launches.
  - Implemented pure TypeScript zero-dependency SHA-256 cryptographic hashing (`computeSha256`, `sha256Sync`) in `@daynori/domain` with Web Crypto acceleration and deterministic fallback that never returns empty strings.
  - Added object URL lifecycle management (`localBlobUrlsRef`) in `apps/web/src/app/library/page.tsx` revoking blob URLs on preview close, dialog unmount, or workspace switch.
  - Bound offline cache clearing (`clearAccount` / `clearWorkspace`) to sign-out in Web and Mobile auth handlers.
- **Worker Handlers & Lease Fencing (Finding D):**
  - Added lease fencing on job completion and retry (`leased_by = $workerId AND leased_until > now()`) in `DaynoriWorker`.
  - Implemented real job execution handlers for `file_deletion`, `file_scan`, and `file_orphan_cleanup` with tenant context scoping (`set_config('app.current_workspace_id', ...)`).
  - Configured PostgreSQL pool, polling loop, and graceful shutdown in `apps/worker/src/index.ts`.
- **Runtime Storage & Scanner Defaults (Finding E):**
  - Restricted `MemoryStorageProvider` to test and development environments, defaulting to `UnavailableStorageProvider` in production.
  - Defaulted to `UnavailableMalwareScanner` in production; updated `ExternalMalwareScanner` to validate boolean `isClean` responses strictly.
  - Hardened PDF preview iframe sandbox to `sandbox="allow-scripts"` (removing `allow-same-origin`) in `FilePreviewDialog.tsx`.
- **Regression Test Suite:**
  - Added `tests/integration/phase25-repairs.test.ts` (14 passing tests) covering Findings A through E.

## Phase 25 — Files, folders, and safe previews — 2026-10-17

- **Contracts & Content Inspection (`packages/contracts`, `apps/api`):**
  - Added `'application/msword'` (.doc) to `ALLOWED_MIME_TYPES` alongside `.docx` in `packages/contracts/src/api/files.ts`.
  - Added OLE Compound File Binary (`D0 CF 11 E0 A1 B1 1A E1`) sniffing in `apps/api/src/modules/files/inspector.ts` to detect legacy Microsoft Word files securely.
- **Pure Domain Operations (`packages/domain`):**
  - Implemented `getFilePreviewKind` categorizing files into `image`, `pdf`, `office`, `text`, `audio`, or `unsupported`.
  - Implemented `isSafeToPreview` strictly gating inline rendering to verified quarantine status and supported kinds.
  - Implemented `computeStorageUsage` calculating storage breakdown, progress percentage, and 80%/100% threshold flags.
  - Implemented `getOfflineBinaryCacheKey` returning `${accountId}:${workspaceId}:${fileId}:v${version}`.
- **Web UI Primitives & Application (`packages/ui-web`, `apps/web`):**
  - Created `StorageUsageBar.tsx` displaying live quota breakdown, progress bar, and warning banners.
  - Created `FileUploadDialog.tsx` modal with folder selection, drag-and-drop zone, size validation, direct XHR progress, cancellation via `AbortController`, and quarantine rejection alert banners.
  - Created `FilePreviewDialog.tsx` modal supporting image viewport, PDF frame, office document metadata breakdown + download action (without in-app office editing claims), and offline pinning toggle.
  - Updated `apps/web/src/app/library/page.tsx` integrating upload dialog, preview modal, quota progress bar, and leaf item click handlers.
  - Created `apps/web/src/app/files/page.tsx` redirecting to `/library?type=files`.
  - Updated `apps/web/src/components/AppModals.tsx` with Files search destination and quick upload action.
- **Mobile UI Primitives & Application (`packages/ui-mobile`, `apps/mobile`):**
  - Created `MobileStorageUsageBar.tsx` progress bar component with design token integration.
  - Created `MobileFileUploadSheet.tsx` bottom sheet supporting folder selection, upload progress, cancellation, and rejection feedback.
  - Created `MobileFilePreviewSheet.tsx` bottom sheet supporting safe image/PDF previews, office metadata breakdown + download action, and offline pinning.
  - Updated `apps/mobile/src/views/LibraryView.tsx` integrating storage bar, `+ Upload` button, file item click handlers, and modal sheets.
  - Updated `apps/mobile/src/navigation/types.ts` and `CreateSheet.tsx` with File creation pill.
- **Offline Binary Caches (`apps/web`, `apps/mobile`):**
  - Created `apps/web/src/data/offlineFileCache.ts` (`OfflineFileCache`) with IndexedDB and in-memory fallback.
  - Created `apps/mobile/src/data/offlineFileCache.ts` (`MobileOfflineFileCache`).
  - Implemented strict `${accountId}:${workspaceId}:${fileId}:v${version}` namespacing, SHA-256 integrity verification (`computeBufferSha256`), automatic eviction on bit rot / tampering, and context clearance on account switch or logout.
- **Comprehensive Integration Tests (`tests/integration`):**
  - Added `tests/integration/phase25-files-previews.test.ts` covering 7 journeys (organized folder uploads, safe previews, quarantine / rejection blocking, quota visibility, upload abort and retry without duplicates, offline caching with SHA-256 integrity eviction, and multi-tenant isolation).
- **Decision Record:**
  - Published [ADR-0031: Safe Document Previews, Storage Usage Visibility, and Offline Availability](docs/decisions/0031-safe-document-previews-and-offline-storage.md).

## Defect Repairs & Hardening (Phase 24) — 2026-10-17

- **Real Storage Provider Transport & Byte Bounding (Finding A):**
  - Implemented dynamic HTTP transfer endpoints (PUT `/v1/storage/upload/:bucket/*` and GET `/v1/storage/download/:bucket/*`) verifying capability tokens, bounding payload body sizes (50 MiB), checking max byte bounds, and detecting 409 conflicts for non-upsert uploads.
  - Configured honest 503 unavailable states when storage credentials are unconfigured, rather than returning fictional upload URLs.
- **Quota Accounting & State Filtering (Finding B):**
  - Fixed active reservation queries in `quotaService.ts` to strictly filter by `status IN ('reserved', 'uploaded') AND expires_at > now() AND reconciled = false`.
  - Added actual byte length validation in `inspector.ts` against declared reservation bounds and `maxAllowedBytes`.
- **Durable Worker & Fail-Closed Malware Scanning (Finding C):**
  - Added `app.background_jobs` with `SELECT ... FOR UPDATE SKIP LOCKED`, exponential backoff, dead-letter state, and restart recovery in `apps/worker`.
  - Added `ExternalMalwareScanner` with execution timeout, recording engine version, scanned bytes count, and scanned SHA-256 without logging content.
- **Strict Lifecycle Transitions & Transactional Recovery (Finding D):**
  - Prevented caller-supplied `fileId` hijacking, enforced strict state transitions (`reserved` -> `quarantined` -> `verified`/`rejected`), and used mutation receipts with canonical payload hash.
  - Enqueued durable `file_deletion` jobs to ensure storage bytes are not deleted before database commits.
- **Database Grants & Synchronization Projections (Finding E):**
  - Applied migration `00021_repair_file_lifecycle_jobs_and_grants.sql` revoking direct table writes from `authenticated` role and adding composite foreign keys `(folder_id, workspace_id)`.
  - Added `files` projection to sync bootstrap query and response schema, Web `IndexedDbLocalRepository` (schema v7), and Mobile `SqliteLocalRepository` (migration v8).
- **Mobile Journal Preference Synchronization (Finding F):**
  - Connected mobile snippet toggle in `JournalView.tsx` to remote `updateUserPreferences` with full `DisplayPreferences` schema and offline retry.

## Phase 24 — Private binary upload lifecycle — 2026-10-17

- **Private Storage Schema & Isolation (`infra/supabase`):**
  - Created `app.workspace_storage_usage` tracking stored bytes, reserved exposure, and workspace quota (100 MiB default) with Row-Level Security restricting queries to viewers and updates to editors.
  - Created `app.file_items` (extending `app.items` where `kind = 'file'`) recording quarantine status (`quarantined`, `verified`, `rejected`, `deleted`), detected MIME types, SHA-256 checksums, and verified timestamps.
  - Created `app.file_versions` storing immutable revision history.
  - Created `app.upload_reservations` tracking signed capability issuance, 2-hour provider expiry, and reconciliation status.
- **Contract Schemas & Curated Allowlist (`packages/contracts`):**
  - Added `ALLOWED_MIME_TYPES` allowlist for standard images, PDFs, text, Markdown, and audio.
  - Defined file size and concurrency bounds: `MAX_GENERAL_FILE_BYTES` (25 MiB), `MAX_AUDIO_FILE_BYTES` (50 MiB), `MAX_CONCURRENT_RESERVATIONS` (5).
  - Documented realistic provider expiry horizons: `UPLOAD_CAPABILITY_EXPIRY_SECONDS` (7200 seconds / 2 hours) and short-lived authorized download capabilities `DOWNLOAD_CAPABILITY_EXPIRY_SECONDS` (300 seconds / 5 minutes).
  - Defined Zod schemas for upload reservation, finalization, capability generation, and quota status.
- **Binary Content Inspection & Fail-Closed Malware Policy (`apps/api`):**
  - Implemented `inspectBinaryContent` sniffing true MIME types from magic bytes, rejecting Windows PE executables, Unix ELF binaries, and script vectors in XML/SVG or text payloads.
  - Implemented `PolicyMalwareScanner` detecting standard EICAR test signatures and fail-closed simulation on scanner outages or timeouts.
- **Atomic Quota Accounting & Reservation Exposure Bounding (`apps/api`):**
  - Bounded storage exposure before issuing upload capabilities by atomically checking `stored + reserved + requested <= max` and enforcing maximum 5 concurrent active reservations.
  - Atomically transitioned exposure on finalization and freed reserved bytes on rejection or cancellation.
- **Files Service & REST Routes (`apps/api`):**
  - Generated unpredictable, server-controlled object paths: `${workspaceId}/${fileId}/${versionId}/${crypto.randomBytes(16).toString('hex')}`.
  - Registered Fastify REST routes under `/v1/workspaces/:workspaceId/files` for quota, reservations, finalization, cancellation, download capabilities, metadata, and deletion.
  - Emitted `file` entity events to the workspace sync change outbox with sequence advancement.
- **Worker Leases & Orphan Cleanup (`apps/worker`):**
  - Implemented `DaynoriWorker` lease acquisition engine (30s TTL) preventing multi-worker execution collisions.
  - Handled `file_scan` and `file_orphan_cleanup` jobs, purging abandoned storage objects and reconciling expired reservations.
- **Client SDK (`packages/api-client`):**
  - Extended `DaynoriApiClient` with typed file lifecycle methods (`getWorkspaceStorageQuota`, `reserveFileUpload`, `finalizeFileUpload`, `getFileUploadStatus`, `cancelFileUploadReservation`, `getFileDownloadCapability`, `getFileMetadata`, `deleteFile`).
- **Comprehensive Integration Tests (`tests/integration`):**
  - Added `tests/integration/phase24-binary-upload.test.ts` covering 8 full journeys (happy path, quota/concurrency bounding, MIME spoofing/SVG script rejection, checksum verification, fail-closed malware detection, idempotent finalize, multi-tenant isolation, and worker orphan cleanup).
- **Decision Record:**
  - Published [ADR-0030: Private Binary Upload Lifecycle, Storage Quotas, and Quarantine Verification](docs/decisions/0030-private-binary-upload-lifecycle.md).

## Phase 23 — Journal writing and reflection interfaces — 2026-10-17

- **Focused Web Journal Canvas (`packages/ui-web`, `apps/web`):**
  - Implemented `JournalEditor` providing a calm, distraction-free writing surface composing `NoteEditor`, backdated badge indicator (`isEntryBackdated`), entry date picker, authoring timezone display, non-clinical mood pills (`great`, `good`, `okay`, `difficult`, `reflective`), tag chip management, canonical folder placement, dual save indicator (`"Saved locally"`, `"Synced"`), and conflict banner (`keep_server`, `keep_local`, `save_copy`).
  - Added dismissible reflection prompt tray with canonical reflection templates (`REFLECTION_TEMPLATES`: Daily check-in, Evening reflection, Gratitude & grounding, Weekly review, Hard moments & release) inserting portable AST blocks into the editor.
  - Replaced in-memory web demo with authenticated runtime using `IndexedDbLocalRepository` and `createWebSyncEngine` with active namespace guarding (`activeNamespaceRef`) to isolate account state during asynchronous switches.
  - Added day/month navigation stepper with date jump, multiple entries per day list, and journal-scoped search with snippet privacy suppression (`suppressBodySnippets: true` by default).
  - Repaired web autosave: editor stays open during autosave, allocations maintain stable identity, saves are serialized, newer typing is protected during delayed writes, and metadata-only changes trigger debounced persistence.
  - Implemented durable draft persistence during writing with `onDraftChange` and debounced save; drafts survive crashes and are only cleared after successful durable save.
  - Connected conflict resolution banner directly to `SyncEngine.resolveConflict`.
- **Accessible Mobile Journal Surface (`apps/mobile`):**
  - Connected `JournalView` to `SqliteLocalRepository` and client `SyncEngine` with offline local-first mutation intent creation.
  - Preserved canonical `NoteDocument` AST, block identities, formatting, folder placement, authoring timezone, and flags without destructive flattening to a single paragraph.
  - Implemented real mobile autosave with debounced draft saving and `AppState` background listener.
  - Implemented draft recovery banner with Recover and Discard flows.
  - Removed production reliance on synthetic login and entries, providing a clear unavailable state when runtime services are uninitialized.
  - Added mobile Trash and restore flows with soft-delete filtering.
  - Synchronized `suppressBodySnippets` to `savePreferenceSnapshot` and guarded fallback titles (`resolveJournalTitle` returns neutral date title when snippets are suppressed).
  - Added midnight refresh timer across date and timezone changes.
- **Verification & Wiring Tests (`apps/mobile`, `tests/integration`):**
  - Added real-view wiring test suite `apps/mobile/src/views/JournalView.test.ts` (5 tests verifying draft recovery, writing surface retention on save failure, conflict resolution, privacy snapshot persistence, and AST preservation through Trash/restore).
  - Expanded `tests/integration/phase23-journal-writing.test.ts` to 7 journeys, adding multi-block AST web-to-mobile roundtrip preservation and snippet-suppressed neutral title guarantees.
- **Decision Record:**
  - Published [ADR-0029: Journal Writing, Reflection Prompts, and Local Draft Recovery](docs/decisions/0029-journal-writing-and-reflection-interfaces.md).

## Phase 22 — Journal entries and privacy defaults — 2026-10-16

- **Shared Journal Domain Model & Contracts (`packages/domain`, `packages/contracts`):**
  - Implemented `JournalEntry` entity with stable UUID identity, user-selected calendar date (`entryDate`), authoring timezone (`timezone`), portable AST document (`NoteDocument`), plain text, word/char counts, optional non-clinical mood (`great`, `good`, `okay`, `difficult`, `reflective`), optional reflection prompts (`JournalPromptEntry[]`), tags, draft status, and folder placement.
  - Implemented `isEntryBackdated` to identify intentional backdating by comparing authoring date against current local date in the specified timezone without modifying physical timestamps.
  - Implemented `computeJournalStats` for accurate multilingual word/char counts, preserving multiline text and complex Bengali (Bangla) Unicode script bit-for-bit.
  - Defined strict Zod schemas for entry creation, updates, date-filtered queries, and lifecycle state changes in `@daynori/contracts`.
  - Extended `DisplayPreferencesSchema` with privacy-preserving defaults: `journalPreviewHidden: true` and `suppressBodySnippets: true`.
- **PostgreSQL Persistence & Tenant Isolation (`infra/supabase`):**
  - Applied migration `00019_journal_entries.sql` creating `app.journal_entries` table with foreign key cascading to `app.items(id)`.
  - Configured PostgreSQL Row-Level Security (RLS) policies strictly scoping journal access to personal workspace owners, rejecting access from shared workspaces or collaborative rooms.
- **Fastify API Routes & Sync Dispatcher (`apps/api`):**
  - Implemented transactional REST routes under `/v1/workspaces/:workspaceId/journal` for entry creation, listing, retrieval, updates with optimistic concurrency control (`baseRevision`), archive, trash, and restore.
  - Integrated change feed emission producing `journal_entry` events on workspace sync streams.
- **Privacy Guardrails & Operational Log Sanitization (`apps/api`):**
  - Enhanced `SafeLogger` to redact journal titles, document contents, plain text snippets, moods, and reflection prompt responses from operational logs and error diagnostics with `[REDACTED_JOURNAL_CONTENT]`.
- **Client Storage Adapters & Synchronization (`@daynori/sync`, `apps/web`, `apps/mobile`):**
  - Extended `SyncEngine` with typed journal sync commands and non-destructive conflict recovery (`save_copy` and recovery drafts).
  - Extended Web IndexedDB adapter (`apps/web/src/data/indexedDbRepository.ts`, `DB_VERSION = 6`) with `journal_entries` object store and indices.
  - Extended Mobile SQLite adapter (`apps/mobile/src/data/sqliteRepository.ts`, migration version 7) with `local_journal_entries` table.
- **Journal Foundation & Prerequisite Repairs (Findings A–E):**
  - **Bootstrap Snapshot Fidelity (Finding A):** Added complete, validated `journalEntries` projection to sync bootstrap query, response schema, transport, SyncEngine, and local repositories; guarded against corrupted snapshots without fabricating empty entries.
  - **Concurrency & Lifecycle Protection (Finding B):** Acquired workspace sync locks prior to reading authoritative revisions in journal update, trash, and restore routes; serialized concurrent same-revision writes with 409 Conflict rejection; enriched restoration payloads with full entry projections; implemented idempotent receipt replay protection on trash and restore routes.
  - **Explicit Null Synchronization (Finding C):** Fixed sync pull mapping to distinguish explicit `null` from undefined fields, cleanly clearing titles, moods, folders, prompts, and tags across clients while preserving untouched fields during partial updates.
  - **Privacy Guardrails & Complete Log Sanitization (Finding D):** Enforced controlled operational event messages and extended `SafeLogger` sanitization to titles, documents, reflections, prompts, and errors; asserted complete serialized log entries contain zero canary leaks.
  - **Validation & Non-UTC Semantics (Finding E):** Fixed non-UTC date-only shifts using SQL date-only casting; enforced prompt response bounds (<=5000 chars) with `RangeError`; validated cursors; rejected generic item creation for `journal_entry`; corrected ADR-0028 storage claims and vault phase references (Phases 44–47).
- **Decision Record:**
  - Published [ADR-0028: Journal Entries, Dated Local Semantics, and Privacy Defaults](docs/decisions/0028-journal-entries-and-privacy-defaults.md).

## Phase 21 — Daily routine experience and history — 2026-10-16

- **Shared Domain Logic & Gentle Progress (`packages/domain`):**
  - Implemented `explainWhyDueToday` returning structured human-readable explanations of routine recurrence and due status for any target calendar date.
  - Implemented `calculateGentleProgress` computing non-punitive daily routine metrics (`completedCount`, `skippedCount`, `completionRate`, encouraging message) without streak shaming or forced notifications.
  - Implemented `explainScheduleChangeImpact` explaining immediate vs forward-effective schedule modifications with history preservation guarantees.
- **Accessible Web Components (`packages/ui-web`):**
  - Added `RoutineRow` accessible checklist item with `role="checkbox"`, Done/Skip/Undo/History controls, due explanation notes, and text status badges.
  - Added `RoutineDetailEditor` modal dialog for creating and editing routine schedules, weekdays, scheduled times, IANA timezones, active date ranges, and live schedule impact previews.
  - Added `RoutineHistoryViewer` modal dialog displaying chronological past occurrences, gentle routine overview stats, audit logs, and occurrence reopen controls.
- **Accessible Mobile Components (`packages/ui-mobile`):**
  - Added `MobileRoutineRow` with touch targets >= 48dp, TalkBack accessibility labels, Done/Skip/Reopen pills, and history inspection.
- **Web Application Today Experience (`apps/web`):**
  - Implemented interactive Today view connected to `IndexedDbLocalRepository`, `useAuth()`, and `SyncEngine`.
  - Auto-generates today's occurrences deterministically on page load.
  - Added 5-second floating reversible undo toast for routine completions and skips.
  - Kept daily routine checklists strictly partitioned from one-off tasks due today.
  - Integrated `RoutineDetailEditor` and `RoutineHistoryViewer` modals.
- **Mobile Application Today Experience (`apps/mobile`):**
  - Enhanced React Native `TodayView` with `MobileRoutineRow` checklist and gentle progress message banner.
  - Added floating reversible undo toast with accessible button.
  - Added `MobileModalSheet` routine history viewer showing yesterday's completion and gentle progress stats.
- **Integration Testing & Contracts Alignment (`tests/integration`, `packages/contracts`):**
  - Added `tests/integration/phase21-daily-routines-experience.test.ts` verifying multi-day journeys, occurrence completion/skip transitions, reversible undo, yesterday's completion preservation, forward schedule changes, gentle progress evaluation, and tenant isolation.
  - Aligned `WeekdaySchema` in `@daynori/contracts` to infer union literals `1 | 2 | 3 | 4 | 5 | 6 | 7` for strict type safety across the monorepo.
- **Decision Record:**
  - Published [ADR-0027: Daily Routine Checklists, Non-Punitive Progress, and Completion History](docs/decisions/0027-daily-routine-checklist-and-history.md).

## Phase 20 — Daily routine schedules and occurrences — 2026-10-16

- **Shared Routine Domain & Date-Scoped Occurrences (`packages/domain`, `packages/contracts`):**
  - Implemented routine schedule template model: title, optional details, frequency (`daily` or `weekdays`), ISO 8601 weekdays `1` (Monday) through `7` (Sunday), explicit IANA timezone, optional scheduled time `HH:mm`, active period bounds (`activeFrom` <= `activeTo`), and pause/archive flags.
  - Implemented bounded occurrence generator (`generateOccurrencesForDateRange`) supporting date ranges up to 90 days, producing date-scoped occurrence records without duplicating already existing dates.
  - Established date-scoped occurrence isolation: completing or skipping today's occurrence never affects tomorrow or any other calendar date.
  - Resolved local scheduled times to UTC planned instants in explicit timezones, deterministically handling DST fall-back overlap hours and spring-forward gaps.
  - Implemented occurrence state transitions (`completeOccurrence`, `skipOccurrence`, `reopenOccurrence`) with full audit history tracking (`fromStatus`, `toStatus`, `changedAt`, `actorId`, `reason`).
  - Implemented schedule forward reconciliation (`reconcileOccurrencesOnScheduleChange`): schedule modifications increment `scheduleRevision` and take effect forward from `effectiveDate`, preserving past completed and skipped occurrences while cancelling or updating future pending occurrences.
- **PostgreSQL Persistence & Tenant Isolation (`infra/supabase`):**
  - Applied migration `00017_routines_and_occurrences.sql` creating `app.routines` and `app.routine_occurrences` with foreign keys referencing `app.items`.
  - Added unique constraint `CONSTRAINT uq_routine_occurrence_date UNIQUE (workspace_id, routine_id, scheduled_date)` preventing duplicate occurrences at the database level.
  - Configured Row-Level Security (RLS) policies scoped strictly to authorized workspace membership.
- **Fastify API Routes & Sync Dispatcher (`apps/api`):**
  - Added 11 transactional REST routes under `/v1/workspaces/:workspaceId/routines` for routine CRUD, pause/resume/archive, bounded occurrence generation, date-range listing, and occurrence state transitions with optimistic concurrency protection (`baseRevision`).
  - Added `formatDateOnly` helper to ensure calendar dates (`YYYY-MM-DD`) are preserved without host timezone day shifts.
  - Integrated change feed emission producing `routine` and `routine_occurrence` events on workspace sync streams.
- **Client Storage Adapters (`apps/web`, `apps/mobile`, `@daynori/sync`):**
  - Updated Web IndexedDB adapter (`apps/web/src/data/indexedDbRepository.ts`, `DB_VERSION = 5`) with `routines` and `routine_occurrences` object stores, composite index `by_routine_date`, atomic write/sync/purge operations.
  - Updated Mobile SQLite adapter (`apps/mobile/src/data/sqliteRepository.ts`, migration version 6) with `local_routines` and `local_routine_occurrences` tables and indices.
  - Extended `DaynoriApiClient` with complete typed routine and occurrence methods.
  - Added `RoutineRecord` and `RoutineOccurrenceRecord` models and validators to `@daynori/sync`.
- **Decision Record:**
  - Published [ADR-0026: Daily Routine Schedules, Date-Scoped Occurrences, and Lifecycle Reconciliation](docs/decisions/0026-routine-schedules-and-occurrences.md).

## Phase 19 — Upcoming task lists and detail views — 2026-10-16

- **Prerequisite Correctness Repairs (`apps/api`, `packages/domain`, `packages/sync`, commit `41061fc`):**
  - Parameterized `userTimezone` in PostgreSQL task queries, completely eliminating SQL injection risks.
  - Bracketed `OR` predicate in Today task view to prevent bypass of workspace RLS or status constraints.
  - Added deterministic secondary sort keys before pagination `LIMIT` clauses to guarantee stable page boundaries.
  - Enforced strong type constraints on continuation cursors.
  - Resolved timezone consistency in `getTaskDeadlineSortKey` with explicit reference dates.
  - Added full subtree depth checks enforcing maximum depth of 3 levels across subtask hierarchies.
  - Implemented transactional concurrency locking on task mutations with optimistic revision verification.
  - Ensured durable idempotency replay returns original mutation receipts on repeated identical operation IDs.
  - Preserved local task projections during tombstone metadata sync and tag reconciliation.
- **Pure Domain & Timezone Helpers (`packages/domain`):**
  - Added `formatTaskDeadlineExplanation` returning structured text-based overdue explanations, relative dates, and timezone notes to avoid relying on color alone.
  - Added `checkLocalTimeDisambiguation` detecting nonexistent spring-forward gaps and ambiguous fall-back overlaps during DST transitions.
- **Accessible Web Components (`packages/ui-web`):**
  - Added `TaskRow` component with custom accessible checkbox, priority badges, text-based overdue warnings, tag chips, subtask count indicators, and bulk selection controls.
  - Added `TaskDetailEditor` modal with title auto-focus, details textarea, priority, status, folder, tags, subtasks manager (depth <= 3), and deadline picker supporting none, calendar date, and timed deadlines with timezone selection and DST disambiguation warnings.
- **Web Application Plan Page (`apps/web`):**
  - Implemented production Plan page (`/plan`) connected to `IndexedDbLocalRepository`, `useAuth()`, and `SyncEngine`.
  - Added dedicated priority views: Today, Upcoming, Overdue, Completed, Undated, and All Tasks.
  - Added quick capture bar with deadline presets (`Today`, `Tomorrow`, `No date`).
  - Added sorting and filtering by priority, folder, and deadline.
  - Added safe confirmable bulk actions (complete, delete, move) operating on explicit ID arrays with review confirmation modals.
  - Added floating undo toast for 5-second reversal of task completions.
  - Added accessible live announcements and viewing timezone selector.
- **Mobile Application Plan View (`apps/mobile`):**
  - Enhanced React Native `PlanView` connected to `LocalRepositoryPort` and `SyncEngine` while preserving routines and calendar subviews.
  - Added quick capture input bar with quick deadline preset buttons.
  - Added view filter pills for switching between Today, Upcoming, Overdue, Completed, and All.
  - Added task list rendering with priority badges, text-based overdue explanations, and subtask counters.
  - Added modal sheet editor (`MobileModalSheet`) for task detail editing, subtasks, and deadline selection.
  - Added reversible completion with bottom undo banner.
- **Decision Record:**
  - Published [ADR-0025: Upcoming Task Workflows, Priority Views, and Multi-Platform Plan Interfaces](docs/decisions/0025-upcoming-task-workflows-and-views.md).

## Phase 18 — Upcoming task domain and deadlines — 2026-10-16

- **Shared Task Domain & Explicit Deadline Semantics (`packages/domain`, `packages/contracts`):**
  - Canonical task model with validated non-empty title, optional details, priority (`low`, `normal`, `high`, `urgent`, defaulting to `normal`), status (`todo`, `in_progress`, `completed`, `cancelled`), and folder/Inbox placement.
  - One-off work model: task completion does not spawn recurring events or reset at midnight; daily routines remain a strictly separate domain.
  - Reconciled existing `todo` item aliases with `task` canonical representation (`canonicalItemType("todo") === "task"`).
  - Explicit three-state deadline semantics: `none`, `date` (validated Gregorian calendar date string `YYYY-MM-DD` with leap year verification), and `timed` (authoritative ISO 8601 instant with explicit IANA timezone).
  - Timezone-safe calculations: `isTaskOverdue` evaluates date-only deadlines against 23:59:59.999 in the specified viewing timezone and timed deadlines against the exact UTC instant; `isTaskDueToday` correctly scopes to the viewing timezone's calendar day.
  - Deterministic upcoming comparison (`compareTasksUpcoming`) sorting by deadline presence, deadline instant/date, priority weight (`urgent` > `high` > `normal` > `low`), creation time, and stable ID.
  - Idempotent task completion (`completeTask`) and reopening (`reopenTask`) retaining full transition history while avoiding duplicate entries on retry.
  - Transactional subtask hierarchy validation (`validateSubtaskHierarchy`) enforcing bounded depth (maximum 3 levels), same authorized workspace, and cycle prevention (`NO_SELF_PARENT`, `SUBTASK_CYCLE_DETECTED`).
- **PostgreSQL Persistence & Tenant Isolation (`infra/supabase`):**
  - Applied migration `00015_tasks_domain_and_deadlines.sql` creating `app.tasks` with composite foreign key `(workspace_id, id) REFERENCES app.items(workspace_id, id) ON DELETE CASCADE` and self-referencing `parent_task_id`.
  - Added database check constraints on status, priority, and deadline types.
  - Added targeted indexes on status, priority, due date, parent task ID, and workspace isolation.
  - Configured strict Row-Level Security policies (`p_tasks_select`, `p_tasks_insert`, `p_tasks_update`, `p_tasks_delete`) scoped to authorized workspace membership.
- **Fastify API Routes & Services (`apps/api`):**
  - Added task REST endpoints under `/v1/workspaces/:workspaceId/tasks`:
    - `POST /` (create task)
    - `GET /` (list tasks with filtering by folderId, status, priority, overdue status, search, and stable pagination)
    - `GET /:id` (task detail)
    - `PATCH /:id` (update task with optimistic concurrency revision checks)
    - `POST /:id/complete` (idempotent complete with history recording)
    - `POST /:id/reopen` (idempotent reopen with history recording)
    - `POST /:id/trash` (soft-delete task envelope and item header)
    - `POST /:id/restore` (restore task from trash)
  - Emitted monotonic change records into `app.changes` and outbox intents into `app.outbox_intents` atomically within database transactions.
  - Added durable idempotency key caching via `x-operation-id` / `Idempotency-Key` headers.
- **Client & Sync Engine Integration (`packages/api-client`, `packages/sync`, `apps/api`):**
  - Extended `DaynoriApiClient` with task CRUD, completion, and reopening methods.
  - Defined `TaskRecord` interface in `@daynori/sync` models and ports.
  - Added unified task sync command dispatcher in `SyncService.dispatchCommand` for `createTask`, `updateTask`, `trashTask`, `restoreTask`, `completeTask`, and `reopenTask`.
  - Integrated task projections into client `SyncEngine` for offline writes, pull integration, and conflict recovery.
- **Local Persistence Adapters (`apps/web`, `apps/mobile`):**
  - Extended Web `IndexedDbLocalRepository` to schema version 4 with dedicated `tasks` object store and index on `[workspaceId+status]`.
  - Extended Mobile `SqliteLocalRepository` to migration version 5 with dedicated `tasks` table, indexing, and transactional operations.
- **Decision Record:**
  - Published [ADR-0024: Task Domain, Explicit Deadlines, and Subtask Invariants](docs/decisions/0024-task-domain-and-deadlines.md).

## Phase 17 — Focused note editor on both platforms — 2026-10-16

- **Shared Web UI Component (`packages/ui-web`):**
  - Added `NoteEditor` component with distraction-free title and body editing, visible "Untitled" fallback, and auto-resizing text fields.
  - Implemented direct canonical `NoteDocument` AST editing supporting paragraph, heading (H1–H3), bullet list, ordered list, and checklist blocks with interactive checkbox toggles.
  - Added restrained accessible formatting toolbar with block controls, bold styling toggle, and session undo/redo buttons with keyboard shortcut support (`Ctrl+Z`, `Ctrl+Y` / `Ctrl+Shift+Z`).
  - Implemented IME composition tracking (`isComposingRef`) protecting Bengali (Bangla / বাংলা) phonetic typing and complex scripts from debounced save interruptions.
  - Added 600ms debounced autosave feedback loop decoupling local persistence indicators ("Saved locally", "Saving locally...") from cloud synchronization indicators ("Synced", "Syncing to cloud...", "Offline draft", "Sync conflict").
  - Added server revision conflict recovery banner with explicit, non-destructive resolution actions: Keep Server, Keep Local, and Save Copy.
- **Shared Mobile UI Component (`packages/ui-mobile`):**
  - Added `MobileNoteEditor` component with touch-friendly layout, expandable text inputs, and 48dp minimum touch target formatting toolbar.
  - Supported block controls (¶, H1, H2, H3, • List, 1. List, ☑ Check), bold inline formatting, and session undo/redo.
  - Added interactive checklist toggles mutating AST block states atomically.
  - Supported local persistence status and cloud synchronization badges.
- **Web Application Integration (`apps/web`):**
  - Integrated `NoteEditor` directly into `/library` page supporting item selection and URL deep linking via `?create=note`.
  - Wired global action modal ("📄 New Note / File") to launch the focused note editor immediately.
  - Supported dual persistence using `IndexedDbLocalRepository` (atomic local draft saves) and `SyncEngine.saveItem` (background cloud synchronization).
- **Mobile Application Integration (`apps/mobile`):**
  - Integrated `MobileNoteEditor` into `LibraryView` supporting `+ Note` creation button and note card tap selection.
  - Supported dual persistence using `SqliteLocalRepository` and `SyncEngine`.
- **Decision Record:**
  - Published [ADR-0023: Focused Note Editor and Local Autosave Recovery](docs/decisions/0023-focused-note-editor-and-autosave.md).

## Phase 16 — Typed note domain and persistence — 2026-10-15

- **Portable Typed Note Document AST (`packages/contracts`, `packages/domain`):**
  - Defined version 1 `NoteDocument` AST with typed blocks (`paragraph`, `heading` levels 1–3, `bullet_list`, `ordered_list`, `checklist_item`) and inline text nodes with optional marks (`bold`, `italic`, `hard_break`).
  - Implemented plain text projection (`extractPlainText`) and Unicode-aware character/word counting (`calculateWordCount`, `calculateCharCount`).
  - Added title derivation invariant (`resolveNoteTitle`) falling back to the first non-empty line of content text.
  - Enforced strict payload and node boundaries (`MAX_NOTE_DOCUMENT_BYTES = 512 * 1024`, `MAX_NOTE_NODES = 5000`).
  - Preserved complex Unicode and South Asian scripts (Bangla / বাংলা) across parsing, storage, and retrieval.
  - Implemented inert text sanitization (`sanitizeInertString`) stripping ASCII control codes (< 32, preserving `\t`, `\n`, `\r`), `<script>`/`<style>` blocks, and raw HTML markup tags.
- **PostgreSQL Persistence & RLS (`infra/supabase`):**
  - Applied migration `00014_typed_notes_and_persistence.sql` creating `app.notes` with composite primary key `(workspace_id, id)` and foreign key referencing `app.items(workspace_id, id) ON DELETE CASCADE`.
  - Added GIN full-text index `idx_notes_search` on combined title and plain text.
  - Configured tenant RLS policies (`p_notes_select`, `p_notes_insert`, `p_notes_update`, `p_notes_delete`) ensuring strict tenant isolation and write authorization checks.
- **Fastify API Routes & Services (`apps/api`):**
  - Added note endpoints at `/v1/workspaces/:workspaceId/notes`: `POST` (create), `GET /:id` (detail), `GET` (list with filters), `PATCH /:id` (update with optimistic revision checks), `POST /:id/trash` (soft-delete), and `POST /:id/restore` (restore).
  - Integrated with monotonic change feed (`app.changes`), outbox intent dispatch (`app.outbox_intents`), and durable `x-operation-id` idempotency caching.
  - Supported query boolean coercion via `QueryBooleanSchema` preventing `"false"` string evaluation bugs.
- **Sync Engine & Local Repositories (`packages/sync`, `apps/api`):**
  - Handled note commands (`createNote`, `updateNote`, `trashNote`, `restoreNote`) in client `SyncEngine` and server `SyncService`.
  - Joined `app.notes` in bootstrap query `listActiveItemsForBootstrap` to populate note titles and plain text in client bootstrap snapshots.
  - Preserved offline note drafts in `IndexedDbLocalRepository` and `SqliteLocalRepository` with conflict detection on reconnect.
- **API Client Library (`packages/api-client`):**
  - Added typed methods to `DaynoriApiClient`: `createNote`, `getNote`, `listNotes`, `updateNote`, `trashNote`, and `restoreNote`.
- **Decision Record:**
  - Published [ADR-0022: Typed Note Domain and Persistence](docs/decisions/0022-typed-note-domain-and-persistence.md).

## Phase 15 — Folder browsing and organization interfaces — 2026-10-15

- **Web Library Interface (`apps/web`):**
  - Implemented folder browsing with root/Inbox view (`parentId === null`) and drill-down into nested subfolders.
  - Added accessible `BreadcrumbNav` component with `<nav aria-label="Breadcrumb">`, `<ol>`/`<li>`, `aria-current="page"`, visible focus ring, and dedicated Up button navigation.
  - Displayed mixed folder contents containing child folders, notes, tasks, routines, and journals with semantic `ItemTypeBadge` components.
  - Added non-destructive module view filters (`All Items`, `Notes`, `Knowledge`, `Files`, `Tasks`) projecting content without altering folder hierarchy.
  - Implemented folder CRUD operations: Create folder dialog with depth enforcement (`MAX_FOLDER_DEPTH = 5`), color, icon, and parent selection; Rename dialog; Move dialog with cycle prevention (`detectCycle`); Delete dialog supporting both `preserve_to_parent` and `trash_subtree` policies; Archive/Unarchive toggle.
  - Supported accessible reordering via touch/pointer buttons (▲ / ▼) and keyboard shortcuts (`Alt+Up` / `Alt+Down`) with polite `aria-live` screen-reader announcements.
  - Added floating undo toast with 10-second countdown and optimistic revision check for reversible actions.
  - Decoupled local persistence indicator (`Saved on device` via `IndexedDbLocalRepository` when trusted-device consent is granted) from cloud sync status (`Synced`, `Syncing`, `Offline`, `Conflict`, `Error`).
  - Added bounded 10 items/page pagination for large folders and demo journeys seeder for Software and Government Jobs research fixtures.
  - Ensured full WCAG 1.4.10 mobile reflow compliance at 320px viewport width without horizontal scrollbars.
- **Mobile Library Interface (`apps/mobile`):**
  - Implemented mobile folder browsing with root and nested drilldown navigation.
  - Added `MobileBreadcrumb` with Up button navigation and 48dp touch targets.
  - Implemented module filter tabs (`all`, `notes`, `knowledge`, `files`) preserving backward-compatible testIDs (`library-filter-${key}`).
  - Displayed mixed items with semantic `MobileTypeBadge` cards.
  - Added bottom action sheets for folder creation, renaming, and deletion (with subtree option).
  - Implemented touch reordering buttons (▲ / ▼) with 48dp minimum touch targets.
  - Added floating undo notification banner for reversible operations.
  - Displayed local storage status and cloud synchronization badges.
  - Integrated sample journey loader for Software and Government Jobs journeys.
- **Shared UI Components (`packages/ui-web`, `packages/ui-mobile`):**
  - Added `BreadcrumbNav` and `ItemTypeBadge` to `@daynori/ui-web`.
  - Added `MobileBreadcrumb` and `MobileTypeBadge` to `@daynori/ui-mobile`.
- **Decision Record:**
  - Published [ADR-0021: Folder Browsing and Library Interfaces](docs/decisions/0021-folder-browsing-and-library-interfaces.md).

## Phase 14 — Collections, folders, and shared item metadata — 2026-10-15

- **Unified Workspace Folder Hierarchy (`infra/supabase`, `packages/contracts`, `apps/api`):**
  - Applied migration `00012_organization_folders_and_metadata.sql` introducing `app.folders`, `app.tags`, `app.item_tags`, `app.item_links`, and PL/pgSQL invariant validation function `app.validate_folder_parent`.
  - Folders share unified `app.items` core table with `kind = 'folder'`, security scope (`standard` / `vault`), archive and pin states, rank, and revision tracking.
  - Implemented strict depth bound (`MAX_FOLDER_DEPTH = 5`) and cycle prevention walking ancestor links, enforced transactionally at both domain and database trigger levels.
  - Subtree moves verify that `target_parent_depth + subtree_depth <= 5` preventing descendants from exceeding max depth.
  - Defined explicit folder deletion policies:
    - `preserve_to_parent`: Moves direct child folders and items to parent (or Inbox if deleted folder was root).
    - `trash_subtree`: Recursively tombstones the folder and all its descendant items and folders (`deleted_at = now()`).
  - Implemented safe restoration (`restoreFolder`), reparenting to root if former parent is deleted.
- **Inbox Semantics & Common Item Metadata:**
  - Defined `folder_id = NULL` as workspace Inbox; newly captured items default to Inbox and items can be moved freely between Inbox and folders.
  - Extended generic item creation routes and sync push dispatches to validate folder invariants (parent folder existence, deleted status, kind, security scope).
- **Sparse Ranking & Rebalancing (`packages/domain`, `apps/api`):**
  - Sibling items and folders ordered by sparse lexicographical rank strings with UUID tie-breakers.
  - Added sibling rebalancing endpoint (`/v1/workspaces/:workspaceId/folders/rebalance`) to redistribute sibling ranks with step 1000.
- **Workspace-Scoped Tags & Item Links:**
  - Case-insensitive unique tags per workspace (`app.tags` with unique index on `(workspace_id, lower(name))`).
  - Many-to-many join in `app.item_tags` attaching and detaching tags to items without copying or duplicating item feature bodies.
  - Directed item links in `app.item_links` with self-link prevention and same-workspace validation.
- **Sync & Outbox Integration:**
  - Folder operations emit ordered events in `app.changes` and outbox intents in `app.outbox_intents`.
  - Active folders included in `syncBootstrap` snapshot items.
- **Performance Benchmark:**
  - Validated recursive hierarchy query performance with `EXPLAIN (ANALYZE, BUFFERS)` on a 310-folder synthetic hierarchy, confirming execution time of ~1.5ms (budget < 100ms).
- **Decision Record:**
  - Published [ADR-0020: Workspace Folders, Collections, and Shared Item Metadata](docs/decisions/0020-workspace-folders-and-organization.md).

## Phase 13 — Shared Client Synchronization Engine — 2026-10-15

- **Shared Synchronization State Machine (`packages/sync`):**
  - Implemented `SyncEngine` with atomic local projection/draft saving (`saveItem`) and immutable mutation enqueuing.
  - Decoupled state indicators: separated local device persistence (`savedOnDevice`) from cloud synchronization status (`cloudSyncStatus`: `'synced'`, `'syncing'`, `'saved_locally'`, `'offline'`, `'conflict'`, `'error'`, `'needs_attention'`).
  - Added dependency-aware queue draining: automatically resolves and sorts pending mutations topologically by `dependencyOperationIds` before dispatching in batches of up to 50 operations.
  - Implemented transactional acknowledgment: retains pending mutations in local storage until durable receipts are committed locally.
  - Bounded exponential backoff with jitter and cancellation on network errors.
  - Paginated incremental pulls (up to 100 changes per batch) with out-of-order revision protection and tombstone preservation.
  - Implemented safe snapshot reset (`resetAndBootstrap`) when encountering HTTP 409 `SYNC_RESET_REQUIRED`, reconstructing local projection from a fresh snapshot while strictly preserving unsent local drafts, pending mutations, and conflicts.
  - Explicit conflict lifecycle: detected conflicts are exposed via `ConflictRecord`; user resolution (`keep_local`, `keep_server`, `custom`) mints fresh operation IDs with updated base revisions rather than silently overwriting or reusing rejected IDs.
  - Operational diagnostics: `getDiagnostics()` exposes metrics (queue length, in-flight count, failures, sync sequence, epoch) while strictly excluding user text, secrets, tokens, or encryption keys.
- **Multi-Tab Browser Coordination (`packages/sync`):**
  - Implemented `BroadcastChannelTabCoordinator` with heartbeat-based leader election (1000ms heartbeat, 3000ms lease) and resignation broadcast.
  - Follower tabs forward manual and automatic sync requests to the active leader; leader crashes trigger promotion of follower within 1000ms.
  - Provided `SingleProcessCoordinator` for single-instance native mobile applications.
- **Platform Adapters & Verification (`apps/web`, `apps/mobile`, `tests/integration`):**
  - Created web platform adapter in `apps/web/src/data/syncAdapter.ts` (`createWebSyncEngine`).
  - Created mobile platform adapter in `apps/mobile/src/data/syncAdapter.ts` (`createMobileSyncEngine`).
  - Added comprehensive integration test suite `tests/integration/phase13-client-sync-engine.test.ts` covering 7 core fault journeys against real PostgreSQL and Fastify API server.
  - Published [ADR-0019: Shared Client Synchronization Engine](docs/decisions/0019-shared-client-sync-engine.md).

## Hardening & Defect Repairs (Phases 11 & 12) — 2026-10-15

- **Phase 11 Storage & Verification Hardening (`apps/mobile` & `scripts`):**
  - Updated `SqliteLocalRepository` to enforce `requireSqlCipher: true` by default and perform genuine file-existence checks before creating keys, protecting existing encrypted data.
  - Added transaction concurrency mutex (`runWithLock`) to `SqliteLocalRepository` preventing interleaving of concurrent queries into active transactions.
  - Rewrote Chromium browser CDP verification script (`scripts/test-indexeddb-browser.mjs`) to load and verify the actual production `IndexedDbLocalRepository` across consent, atomicity, persistence, tenant isolation, rollback, and multi-tab coordination.
- **Phase 12 Protocol & Receipt Defect Repairs (`apps/api`, `packages/contracts`, `infra/supabase`):**
  - Implemented deterministic topological dependency ordering in `pushBatch` with 3-color DFS cycle detection and terminal failure persistence (`DEPENDENCY_CYCLE`, `DEPENDENCY_MISSING`, `DEPENDENCY_FAILED`).
  - Added receipt rechecking after acquiring workspace sync lock, ensuring identical concurrent creates return the same committed receipt.
  - Narrowed duplicate-key recovery strictly to the mutation receipts uniqueness constraint (`uq_mutation_receipts_actor_device_op`).
  - Enforced recursive key-sorted canonical hashing over command versions, dependencies, and payloads.
  - Updated `bootstrap` to return full projection representation (`revision`, `rank`, `isArchived`, `isPinned`, `securityScope`) under `REPEATABLE READ` snapshot isolation.
  - Fixed nullable updates: explicitly clearing `folderId` via `null` works.
  - Preserved tombstone semantics: updating a deleted item returns terminal rejection `ENTITY_TOMBSTONED`.
  - Integrated REST API item mutations (`POST` / `DELETE`) into the change feed sequence and outbox intents.
  - Applied migration `00011_repair_receipt_rls.sql` repairing receipt RLS to require active workspace viewer membership, and rotated access epochs on workspace membership mutations.

## Phase 12 — Server mutation receipts and change feed — 2026-10-15

- **PostgreSQL Commit-Safe Sequence & Ordered Change Feed (`infra/supabase` & `apps/api`):**
  - Applied migration `00010_server_mutation_receipts_and_change_feed.sql` introducing `app.workspace_sync_state`, `app.mutation_receipts`, `app.changes`, and `app.outbox_intents`.
  - Implemented row-lock protocol on `app.workspace_sync_state` held inside the PostgreSQL transaction until commit (`SELECT ... FOR UPDATE`), serializing mutations strictly within the target workspace and ensuring monotonic gapless sequences matching commit order.
  - Implemented ordered change feed `app.changes` indexed by `(workspace_id, seq ASC)` with tombstones (`is_tombstone = true`) retained across the 90-day offline horizon.
- **Durable Mutation Receipts & Canonical Idempotency (`apps/api`):**
  - Created `app.mutation_receipts` with uniqueness constraint on `(actor_user_id, device_id, operation_id)`.
  - Implemented deterministic key sorting and SHA-256 payload digest (`computeCanonicalPayloadHash`).
  - Safe replay handling: sequential or concurrent retries with identical payload return the existing durable receipt without allocating a new sequence or creating duplicate change records.
  - Reused operation IDs with altered payloads or target workspaces are rejected with `IDEMPOTENCY_KEY_REUSED`.
- **Sync Endpoints & Protocol (`packages/contracts`, `apps/api`, `packages/api-client`):**
  - Added batch push endpoint `POST /v1/sync/push` supporting up to 50 commands with independent per-command transaction isolation and partial batch failure reporting.
  - Added incremental pull endpoint `GET /v1/sync/pull` supporting bounded pagination and opaque checkpoint cursors.
  - Added snapshot bootstrap endpoint `GET /v1/sync/bootstrap` pairing active items with the high-watermark cursor `next_change_seq - 1`.
  - Implemented 90-day horizon and access epoch cursor expiration (`SYNC_RESET_REQUIRED`), directing clients to perform a safe snapshot reset while preserving local unsent drafts.
  - Implemented foundation sync commands: `createItem`, `updateItem`, `archiveItem`, `unarchiveItem`, `pinItem`, `unpinItem`, `trashItem`, and `restoreItem`.
  - Added client methods (`syncPush`, `syncPull`, `syncBootstrap`) in `DaynoriApiClient`.
- **Architecture Documentation & Verification:**
  - Published [ADR-0018: Commit-Safe Change Ordering and Durable Mutation Receipts](docs/decisions/0018-commit-safe-change-ordering-and-mutation-receipts.md).
  - Verified against real PostgreSQL with 18 integration tests in `tests/integration/phase12-sync-receipts-change-feed.test.ts`.
  - Synchronized OpenAPI 3.0.3 canonical specification without drift (`tests/contract/contract.test.ts`).

## Phase 11 — Local Data Repositories and Migrations — 2026-10-15

- **Shared Persistence Ports & Contracts (`packages/sync` & `packages/domain`):**
  - Defined `LocalRepositoryPort` interface for unified local data persistence across platforms.
  - Specified foundation data models and runtime validators with payload bounds: `ItemHeaderRecord`, `DraftRecord`, `PendingMutationRecord`, `SyncCursorRecord`, `PreferenceSnapshotRecord`, and `AccountNamespace`.
  - Established typed error hierarchy: `StorageQuotaError`, `StorageMigrationError`, `StorageUnavailableError`, `StorageKeyError`, and `TrustedDeviceConsentRequiredError`.
- **Android Encrypted SQLite Repository (`apps/mobile`):**
  - Pinned `expo-sqlite: ~15.1.4` with SQLCipher configuration plugin (`useSQLCipher: true`).
  - Compiled and verified native OpenSSL and SQLCipher C++ shared libraries (`libcrypto.so` and `libexpo-sqlite.so`) across all target ABIs (`arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`) into `app-debug.apk`.
  - Implemented `MobileKeyManager` wrapping Android KeyStore (`expo-secure-store`) generating and protecting 256-bit AES encryption keys per account and workspace (`daynori_sqlite_key_${userId}_${workspaceId}`).
  - Serialized concurrent first initialization, validated 64-char hex key format, and tracked known workspace keys in persistent KeyStore index for restart-safe key erasure.
  - Implemented `SqliteLocalRepository` with parameterized queries, schema migrations (`schema_migrations`), atomic multi-store writes via `withTransactionAsync`, and draft quarantine.
  - Enforced key safety invariant: existing databases missing keys reject initialization with `StorageKeyError` (`KEY_NOT_FOUND`) rather than overwriting with a new key.
  - Decryption verified by querying database schema pages (`SELECT count(*) FROM sqlite_master;`).
  - Enforced strict account and workspace boundaries on every operation (`CROSS_WORKSPACE_VIOLATION`, `CROSS_ACCOUNT_VIOLATION`).
  - Complete account data erasure clears item headers, drafts, mutations, cursors, and KeyStore keys.
- **Web IndexedDB Repository (`apps/web`):**
  - Implemented `IndexedDbLocalRepository` against genuine IndexedDB (`daynori_web_storage`, v1).
  - Enforced deliberate trusted-device consent (`daynori_trusted_device_consent`), defaulting to refusal (`TrustedDeviceConsentRequiredError`) if ungranted.
  - Enforced strict account and workspace boundaries on every operation (`CROSS_WORKSPACE_VIOLATION`, `CROSS_ACCOUNT_VIOLATION`).
  - Complete account erasure clears item headers along with user drafts, mutations, cursors, and preferences.
  - Handled multi-tab coordination (`BroadcastChannel` and `versionchange` event listeners), honest `onblocked` error reporting, and mapped browser quota errors to `StorageQuotaError`.
  - Verified genuine Chromium browser execution via CDP (`scripts/test-indexeddb-browser.mjs`).
- **Architecture & Quality:**
  - Published [ADR-0017: Local Storage and Encryption Key Lifecycle](docs/decisions/0017-local-storage-and-encryption-key-lifecycle.md).
  - Authored contract test suites with 28 passed tests across simulated platform stores and genuine Chromium browser execution via CDP.

- **Provider-Bound Flow Initiation & Anti-Replay Callbacks (Phase 09 Repair):**
  - Added `POST /api/auth/initiate` route in web application, creating encrypted/SameSite `daynori_pkce_verifier` cookie binding state, code challenge, and timestamp.
  - Rewrote web auth callback route (`/api/auth/callback`) to reject unsolicited raw tokens (`unsolicited_token_rejected`), require flow cookie (`no_initiated_flow`), verify state challenge, and consume cookie one-time.
  - Hardened Android `MobileProviderAuthAdapter` to persist pending flow parameters (`state`, `nonce`, `codeVerifier`) in OS-backed secure storage (`SEC_KEY_PENDING_FLOW`), enabling secure cold-start recovery across process death and rejecting replayed/unsolicited callbacks.
- **Atomic Optimistic Concurrency Control (Phase 10 Repair):**
  - Replaced TOCTOU read-then-update pattern in `workspaceRepository.updateProfilePreferences` with atomic SQL predicate: `WHERE id = $1 AND ($7::bigint IS NULL OR revision = $7::bigint)`.
  - Added concurrent race test verifying two simultaneous requests with identical `expectedRevision`: exactly one passes (200) and the second fails (409 Conflict) without overwriting.
- **Legacy Workspace Reconciliation Ledger & Preflight (Phase 10 Repair):**
  - Applied migration `00009_legacy_workspace_reconciliation_and_ownership.sql` establishing `app.legacy_workspace_reconciliation_inventory` to record all duplicate personal workspaces affected by Migration 00008 as `quarantined_pending_review`.
  - Created procedure `app.reconcile_legacy_workspace()` for reviewed disposition (`archive`, `confirm_room`, `restore_as_personal_backup`).
  - Created preflight verification script `scripts/preflight-database.mjs` verifying zero unreviewed duplicate workspaces before runtime boot.
- **Personal Workspace Owner-Only Invariant (Phase 10 Repair):**
  - Added PostgreSQL trigger `trg_enforce_personal_workspace_ownership` on `app.workspace_memberships` physically blocking adding any user other than the owner to a personal workspace.
  - Enforced owner-only constraint in API `POST /v1/workspaces/:workspaceId/members` (400 Validation Error).
  - Kept room creation and sharing inaccessible in user interfaces until planned Phase 51.
- **Architecture Documentation:**
  - Published [ADR-0016: Personal Workspace Ownership, Concurrency Control, and Legacy Reconciliation](docs/decisions/0016-personal-workspace-ownership-concurrency-and-legacy-reconciliation.md).

## Phase 10 — Personal workspace and preferences — 2026-10-15

- **Database-Enforced Personal Workspace Uniqueness & Idempotent Provisioning:**
  - Applied migration `00008_personal_workspace_and_preferences.sql` adding partial unique index `idx_workspaces_personal_owner` on `app.workspaces(owner_id) WHERE kind = 'personal'`.
  - Reconciled existing duplicate workspaces to `kind = 'room'` with suffix ` (Legacy Room)`.
  - Added atomic idempotent provisioning `POST /v1/workspaces/provision` returning 201 on initial creation and 200 on repeated calls, without overwriting custom display names or preferences (`ON CONFLICT (id) DO UPDATE SET updated_at = app.profiles.updated_at`).
  - Enforced single personal workspace constraint: attempting to create a second personal workspace via `POST /v1/workspaces` returns 409 `ConflictError`.
- **User Preferences & Optimistic Concurrency Control:**
  - Added domain invariants for IANA time zones (`Intl.DateTimeFormat`), BCP 47 locales (`Intl.Locale`), and week start days (`monday`, `sunday`, `saturday`).
  - Separated preferences schema version (`preferences_schema_version = 1`) from optimistic concurrency sequence (`revision`).
  - Added `GET /v1/users/me/preferences` and `PATCH /v1/users/me/preferences` endpoints with revision conflict detection returning 409 Conflict when concurrent updates occur.
  - Hardened Fastify error handling to return 400 for `ValidationError` and 409 for `ConflictError`.
- **Web Client Integration (`apps/web`):**
  - Added route handlers `POST /api/workspaces/provision` and `GET/PATCH /api/users/preferences` protected with double-submit CSRF validation and SameSite cookies.
  - Extended `AuthContext` with workspace provisioning, preferences loading/saving, and cache synchronization.
  - Updated `apps/web/src/app/settings/page.tsx` with Personal Workspace status card, IANA time zone selector, locale selector, week start radio group, compact mode toggle, loading spinners, and concurrency conflict warning banner.
- **Mobile Client Integration (`apps/mobile`):**
  - Extended `MobileProviderAuthAdapter` with `provisionPersonalWorkspace`, `getPreferences`, `updatePreferences`, and `getAccessToken`.
  - Persisted `workspaceId` in OS-backed KeyStore (`expo-secure-store` / `SEC_KEY_WORKSPACE_ID`) and restored on cold restart. Purged on sign-out.
  - Updated `apps/mobile/src/views/SettingsView.tsx` with Section 5b: Personal Workspace status card, week start radio buttons (48dp touch targets), and time zone display.
- **Client SDK & Contracts:**
  - Added workspace and preferences methods to `@daynori/api-client` (`provisionPersonalWorkspace`, `getPersonalWorkspace`, `getUserPreferences`, `updateUserPreferences`, `ApiConflictError`).
  - Added `ProfileSchema`, `ProvisionWorkspaceRequestSchema`, `ProvisionWorkspaceResponseSchema`, `UpdatePreferencesRequestSchema`, `ProfileResponseSchema`, `WeekStartSchema`, and `DisplayPreferencesSchema` to `@daynori/contracts`.

## Phase 09 Authentication Defect Repairs & Security Hardening — 2026-10-15

- **Removed Automatic Simulated Authentication from Runtime:**
  - Removed in-memory `mockUsers`, `localAccounts`, and `hash_<password>` from normal application runtime in `apps/web/src/auth/session.ts` and `apps/mobile/src/auth/providerAdapter.ts`.
  - Outages and rejected credentials fail safely with descriptive errors, without fabricating accounts or tokens.
  - Test doubles are strictly injected via constructors/options and are unavailable to standard runtime.
- **Genuine Callbacks & Flow Binding:**
  - Web callback route (`apps/web/src/app/api/auth/callback/route.ts`) performs genuine authorization code exchange (`exchangeCodeForSession`) and provider token verification, eliminating synthetic cookie manufacturing.
  - Mobile deep link handler (`apps/mobile/src/auth/providerAdapter.ts`) strictly requires matching initiated flow state/nonce (`initiateAuthFlow`), anti-replay validation, and genuine provider code/token verification.
- **Session Verification Before Trusting Identity:**
  - Replaced unverified base64 decoding with real provider verification (`GET /auth/v1/user`) and API `JwtVerifier`.
  - Restored mobile sessions verify access token with provider on cold start, attempting refresh if expired, before exposing private state.
- **Completed Native Secure Storage:**
  - Declared `expo-secure-store` in `apps/mobile/package.json` and linked native Android modules.
  - Rebuilt Android development APK (`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`) with `expo-secure-store` compiled in.
  - Hardened `SecureStorageAdapter` to propagate actionable `SecureStorageError` on storage/module failures and restricted in-memory storage strictly to test environments (`NODE_ENV === 'test'`).
  - Handled failed credential deletion on sign-out explicitly: flags session as revoked so cold start cannot silently restore a signed-out account.
- **Real Refresh, Recovery, and Logout:**
  - Both web and mobile sign-out routes call `POST /auth/v1/logout` to revoke sessions at the provider before clearing local state.
  - Verified refresh token rotation and password recovery email capture in Mailpit (`http://127.0.0.1:54324`).
- **Live Supabase Stack Verification:**
  - Verified real user registration, ES256 asymmetric signature verification via JWKS, and logout revocation through live GoTrue v2.197.0 container daemon.
  - Replaced fabricated workspace IDs with explicit `workspaceId: null` ("workspace not provisioned") state pending Phase 10 provisioning.
  - Sanitized evidence and logs by redacting all usable tokens and credentials.

## Phase 09 — Authentication across web and Android — 2026-10-14

- **Selected Authentication Provider & Journey:**
  - Implemented email/password authentication lifecycle: sign-up, verification, sign-in, recovery, refresh, and sign-out, documented in [ADR-0015](docs/decisions/0015-authentication-across-web-and-android.md).
- **Web Same-Origin Session Layer (`apps/web`):**
  - Built same-origin Route Handlers under `/api/auth/*` (`session`, `sign-in`, `sign-up`, `sign-out`, `refresh`, `recover`, `callback`).
  - Stored tokens exclusively in `HttpOnly`, `Secure`, `SameSite=Lax` cookies (`daynori_access_token`, `daynori_refresh_token`, `daynori_csrf_token`).
  - Enforced double-submit CSRF token validation and `Origin` header whitelisting for all state-changing writes.
  - Kept refresh tokens strictly out of `localStorage`, `sessionStorage`, and client DOM state.
  - Applied `Cache-Control: private, no-store, no-cache, must-revalidate` to prevent CDN or shared proxy caching of sensitive user identity.
  - Added multi-tab session synchronization via `BroadcastChannel` (`LOGIN`, `LOGOUT`, `SESSION_REPLACED`).
  - Added in-flight request cancellation via `AbortController` on session replacement and logout.
  - Implemented accessible tabbed `AuthModal` dialog component with ARIA attributes and keyboard navigation.
  - Enforced protected destination gating on `/journal` preserving target navigation.
- **Android OS-Backed Secure Storage & Provider Adapter (`apps/mobile`):**
  - Implemented `SecureStorageAdapter` backed by `expo-secure-store` (Android KeyStore) for session secret persistence.
  - Created `MobileProviderAuthAdapter` replacing synthetic dummy adapter in standard runtime.
  - Implemented anti-replay and anti-injection deep link callback verification requiring valid nonces and allowlisted schemes (`daynori://`).
  - Added cold start and process restart session restoration from OS secure storage.
  - Implemented `DraftQuarantineManager`: uncommitted drafts are quarantined by account ID on logout, strictly preventing cross-tenant leakage.
  - Preserved pending protected navigation upon authentication.
- **Shared Contracts (`packages/contracts`):**
  - Added Zod schemas for sign-in, sign-up, recovery, session, callbacks, quarantined drafts in `packages/contracts/src/auth.ts`.
  - Added open redirect defense helper `validateAuthRedirectUrl` and CSRF helpers (`generateCsrfToken`, `verifyCsrfToken`).
- **Phase Reports & Roadmaps:**
  - Created [Phase 09 Report](docs/phase-reports/phase-09.md) documenting delivered journeys, acceptance evidence, and exact remaining gates (real Supabase Auth container daemon on host and physical Android TalkBack hardware verification).
  - Updated `docs/roadmap/progress.json` reflecting provisional Phase 09 development under authorized waiver.

## Phase 08 & 07 Defect Repairs & Security Hardening — 2026-10-14

- **Phase 07 Storage Policies & Identity Context Repair:**
  - Implemented executable, versioned private-storage RLS policies for `storage.objects` and `storage.buckets` in `infra/supabase/policies/storage.sql` and migration `00007_storage_policies_and_context.sql`.
  - Updated identity resolution `app.current_user_id()` to resolve `COALESCE(app.current_user_id, request.jwt.claim.sub, auth.uid())` without requiring custom transaction variables.
  - Added `app.storage_extract_workspace_id(name)` rejecting path traversal (`..` and leading `/`) and malformed object names.
  - Verified 28 security tests in `tests/security/tenant-isolation.test.ts` (bucket privacy, cross-workspace path rejection, path traversal rejection, malformed name rejection).
- **Phase 08 Service Foundation & JWT Hardening:**
  - Tightened JWT verifier (`apps/api/src/auth/jwt.ts`): rejected ID tokens (`token_use !== 'access'`), rejected anonymous sessions (`is_anonymous: true`), enforced mandatory `role === 'authenticated'` without defaulting, rejected forbidden roles (`anon`, `service_role`, `supabase_admin`), enforced UUID `sub` format and `exp` claims.
  - Added support for HS256 symmetric secret verification with explicit allowlist matching.
  - Bounded and sanitized incoming `x-request-id` headers (max 64 characters, `^[a-zA-Z0-9_-]{1,64}$`), replacing unsuitable or oversized values with random UUIDs.
  - Hardened logging and error handlers: redacted unhandled error messages, stack traces, and database connection strings in `SafeLogger`.
  - Fixed boundary error contracts: malformed JSON returns consistent 400 `VALIDATION_FAILED`; response-schema failures treated as 500 server errors via `ResponseValidationError`.
  - Bound keyset pagination cursors to workspace and filter context (`kind`), with max length 256 characters.
  - Generated OpenAPI 3.0 specification dynamically from canonical shared Zod schemas (`packages/contracts/src/api/openapi.ts`) and added drift check tests.
  - Enforced 2s connection timeout probe in readiness route (`/v1/ready`) and made server startup fail fast when authentication is unconfigured in standard mode.
  - Expanded `apps/api/src/api.test.ts` to 38 passing tests (193 tests total across monorepo).

## Phase 08 — API contracts and service foundation — 2026-10-14

- Implemented versioned Fastify HTTP REST API service in `apps/api` following `/v1` conventions (`/v1/health`, `/v1/ready`, `/v1/openapi.json`, `/v1/workspaces`, `/v1/workspaces/:workspaceId/members`, `/v1/workspaces/:workspaceId/items`).
- Defined canonical shared contracts in `packages/contracts/src/api/` (`common.ts`, `health.ts`, `workspace.ts`, `membership.ts`, `item.ts`) with strict mutation validation rejecting unknown fields and standardized error envelopes.
- Built maintained-library JWT verification via `jose` in `apps/api/src/auth/jwt.ts`: RS256/EdDSA algorithm allowlists, claims validation (`iss`, `aud`, `exp`, `nbf`, `sub`), JWKS key rotation, and strict rejection of administrative/service/anonymous credentials as user sessions.
- Enforced multi-tenant authorization: derived actor identity strictly from verified token claims; enforced workspace membership checks; bound requests to transaction-local PostgreSQL tenant contexts (`withTenantContext` and `withUserContext`).
- Implemented consistent HTTP 404 responses for unauthorized workspaces and nonexistent objects, preventing private workspace ID enumeration.
- Built keyset pagination with stable ordering `(created_at, id)` and opaque base64url cursor encoding.
- Added process-local in-memory sliding-window rate limiter with `Retry-After` header and actor/IP budgeting.
- Implemented safe structured logging with recursive credential and token redaction.
- Built fully typed client in `packages/api-client` with Zod response parsing, `AbortSignal` cancellation support, typed error hierarchy, and keyset pagination async generator (`paginateItems`).
- Documented decisions in [ADR-0014: Authenticated API service, contracts, and tenant-scoped authorization](docs/decisions/0014-authenticated-api-service-and-contracts.md).
- Verified 26 tests in `apps/api/src/api.test.ts` and 8 tests in `packages/api-client/src/client.test.ts` (175 tests passing across monorepo).

## Phase 07 — PostgreSQL and tenant isolation foundation (Security Repairs & Foundation) — 2026-10-14

- Established PostgreSQL schema migrations (`infra/supabase/migrations/` 00001 through 00006) defining tenant tables: `profiles`, `workspaces`, `workspace_memberships`, `items`, `audit_events`, and `storage_objects`.
- Repaired membership privilege escalation in `memberships_insert` policy (migration 00003 & 00006): restricted initial owner bootstrap exclusively to legitimate workspace creators on unpopulated workspaces, strictly rejecting unauthorized self-enrollment into existing workspaces.
- Replaced broad schema grants: revoked administrative table access (including `app.schema_migrations`) from `daynori_runtime` role; granted explicit least-privilege permissions only to tenant application tables.
- Corrected composite folder deletion constraint: implemented `ON DELETE SET NULL (folder_id)` preserving non-null `workspace_id` tenant key.
- Hardened connection pooling in `apps/api/src/db/client.ts`: transaction rollbacks and cleanup failures actively discard/destroy the pooled client (`client.release(true)`) to prevent poisoned connection reuse.
- Added migration advisory locking (`pg_advisory_lock`) in `infra/supabase/migrator.ts` to serialize concurrent migration runs safely.
- Removed hardcoded credentials from codebase; integrated `.env` environment loading with `.env.example`; rotated local development runtime role secret.
- Documented declarative Supabase storage bucket policies in `infra/supabase/policies/storage.sql` and `infra/supabase/policies/README.md` (recording local binary storage service enforcement as an acceptance gap until Phase 10+).
- Verified 22 integration tests in `tests/security/tenant-isolation.test.ts` against real local PostgreSQL 17 instance (`daynori_test`), verifying empty dedicated database reproduction from zero, rollback recovery, and tenant isolation.
- Updated [ADR-0013: PostgreSQL tenant isolation, row-level security, and migration foundations](docs/decisions/0013-postgresql-tenant-isolation-and-rls.md).

## Phase 05 and Phase 06 navigation corrections — 2026-10-14

- **Phase 05 (Web Navigation Repairs):**
  - Added user-accessible Character Key Shortcut toggles (`shortcutsEnabled`) in `ShellContext.tsx` and Settings Section 5 (`/settings`) conforming to WCAG 2.1.4 (Character Key Shortcuts), allowing users to disable single-character shortcuts while preserving `Escape`.
  - Added automated browser CDP tests in `scripts/test-web-e2e.mjs` verifying single-character key suppression and re-enabling across 32 headless Edge checks.
  - Corrected handoff documentation in `docs/phase-reports/phase-05.md` clarifying product persistence belongs to Phase 10+ and Phase 07 delivers PostgreSQL tenant isolation foundation.
- **Phase 06 (Android Navigation Repairs):**
  - Rewrote `scripts/test-android-e2e.mjs` to separate preflight from on-device E2E; runner reports missing hardware/emulator as `BLOCKED_MISSING_PREREQUISITE` and exits non-zero (exit code 1) instead of substituting unit tests.
  - Created lightweight hook-supporting mounted component evaluator in `apps/mobile/src/test-render.ts` to execute interactive mounted component tests across `TodayView`, `PlanView`, `LibraryView`, `JournalView`, `SettingsView`, and `CreateSheet` without adding conflicting external dependencies.
  - Hardened deep link authentication in `apps/mobile/App.tsx`: eliminated synthetic login calls on external `auth` deep links; provider authentication remains deferred to Phase 09.
  - Enforced strict scheme whitelist (`daynori://`, `https://app.daynori.com`), bounded identifiers, strict positive integer timestamps, and error token redaction in `packages/contracts/src/routing.ts`.
  - Configured actual Expo scheme `daynori` and Android intent filters for custom scheme and app links in `apps/mobile/app.json` and `AndroidManifest.xml`.
  - Restricted synthetic login controls in `SettingsView.tsx` to an explicit development review mode (`devReviewMode`), defaulting runtime strictly to unauthenticated.
  - Resolved Windows MAX_PATH (>260 chars) Ninja build failure in `apps/mobile/android/build.gradle` for `expo-modules-core` and verified fresh debug APK compilation (128.4 MB).

- Implemented native bottom navigation bar in `@daynori/ui-mobile/MobileNavigationBar` with four labeled parent destinations: Today, Plan, Library, and Journal, maintaining >= 48dp touch targets.
- Built Plan segmented sub-views for Tasks, Routines, and Calendar (Calendar projection under Plan).
- Built Library view with canonical folder breadcrumb (`Workspace > Software`), module filter chips (All Items, Notes, Knowledge, Files), and folder action buttons.
- Integrated protected destination gating for Journal via `MobileAuthAdapter` (defaults strictly unauthenticated; unauthenticated access renders an authentication requirement screen and queues pending destination).
- Added consistent top `MobileHeader` with contextual titles, Search action, Create action, and Settings/Help action.
- Built accessible Search modal sheet and Create quick-capture sheet with input draft preservation across shell navigation.
- Added Settings destination with Light/Dark theme toggle, 100%–200% font scaling, OS reduced motion status indicator, Bangla (বাংলা) script readability preview with 1.6 line-height, and link to preserved Phase 04 Component Gallery.
- Implemented Android hardware Back button handling (`BackHandler`): dismisses open sheets, returns from child views to parent tab, returns to Today from other tabs, and exits cleanly from Today.
- Implemented `AppState` lifecycle handling to preserve navigation state and uncommitted drafts across background and resume transitions.
- Defined typed route contracts in `@daynori/contracts` (`NotificationPayloadSchema`, `FilePayloadSchema`, `AuthPayloadSchema`) with strict safe identifier validation rejecting path traversal and SQL injections.
- Implemented cold-start and warm-start deep-link handling with 5-second idempotent deduplication.
- Replaced `test:e2e:android` placeholder in `package.json` with real runner in `scripts/test-android-e2e.mjs`.
- Compiled fresh Android development APK (`app-debug.apk`, 128.4 MB) via Gradle `assembleDebug`.
- Retained Phase 06 status as `blocked` in `docs/roadmap/progress.json` pending physical Android TalkBack hardware verification.

## Phase 04 corrective revision — 2026-10-14 (Findings F03–F10 Remediation)

- Added semantic action danger tokens (`danger`, `dangerHover`, `dangerLabel`) in `packages/design-tokens` for light theme (`#B3261E`/`#FFFFFF`, 6.54:1) and dark theme (`#F2B8B5`/`#381615`, 9.51:1); wired `Button` and `MobileButton` to consume them, resolving F03.
- Updated `ListRow` and `MobileListRow` selected metadata color to `palette.text.secondary`, achieving 5.37:1 contrast on light subtle surface and 7.24:1 on dark subtle surface, resolving F04.
- Corrected web `ListRow` ARIA semantics from invalid `aria-selected` to `role="button"` with `aria-pressed={selected}`; verified keyboard Enter/Space activation and toggle state exposure, resolving F05.
- Hardened `TextField` description references in `packages/ui-web` to reference only rendered elements (`errorMessage ? errorId : helperText ? helperId : null`) while preserving caller-provided `aria-describedby` IDs; added unit tests for error recovery and description merging, resolving F06.
- Fixed narrow-screen text clipping and enabled font scaling up to 200%: enabled text wrapping (`overflowWrap: 'anywhere'`) on list rows, wrapped the contrast table in an accessible horizontally scrollable container (`role="region"`), and added `--daynori-text-scale` CSS variable for real font scaling; verified reflow at 320px viewport with zero document horizontal overflow, resolving F07.
- Enlarged `MobileModalSheet` close button touch target to 48dp minimum (`touchTargets.mobileMin: 48`); added `ScrollView` and `KeyboardAvoidingView` to support safe-area, enlarged content, and keyboard avoidance, resolving F08.
- Added dynamic OS reduced motion support to `MobileModalSheet` using React Native's `AccessibilityInfo.isReduceMotionEnabled()` and `reduceMotionChanged` listener, disabling slide animations when enabled, resolving F09.
- Hardened automated browser verification runner `tests/spikes/browser/run-primitives.mjs` using Chrome DevTools Protocol against headless Microsoft Edge, testing the actual mounted Next.js React application at `http://127.0.0.1:3000/review` across 11 assertions (contrast, aria-pressed, keyboard activation, description binding, dialog focus trap, 150% font scale, 320px reflow); clearly labeled `tests/spikes/browser/primitives-real.html` as a synthetic prototype harness, resolving F10.
- Reconciled Phase 04 verification status: retained `in_progress` in `docs/phase-reports/phase-04.md` and `docs/roadmap/progress.json` pending physical Android TalkBack hardware verification.

## Phase 01 corrective revision — 2026-10-14 (Finding F01 Remediation)

- Resolved Expo CLI / `tar@7.5.22` default export incompatibility by adding `patches/tar@7.5.22.patch` via `pnpm.patchedDependencies`, exporting `default = exports` on CommonJS output while preserving tar security patches.
- Hardened `apps/mobile/package.json` `prebuild` script to assert `android/build.gradle` generation and fail closed on generation errors.
- Verified native Android project generation from clean state and compiled development APK (`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`, 128.4 MB) via `.\gradlew.bat assembleDebug`.

## Phase 02 corrective revision — 2026-10-14 (Finding F02 Remediation)

- Investigated upstream releases on npm for `node-forge` (`1.4.0`) and `braces` (`3.0.3`); confirmed no newer/patched releases exist (`patchedVersions: "<0.0.0"`).
- Maintained strict fail-closed enforcement of `scripts/audit-dependencies.mjs` without inventing human approvals or self-authorizing exceptions.
- Documented exact dependency tree, blocker assessment, and human owner approval requirements in `docs/security/pending-exception-proposals.md` and `docs/phase-reports/phase-02.md`.

## Phase 03 corrective revision — 2026-10-14 (Finding F10 Part 1 Remediation)

- Corrected IndexedDB error capture in `tests/spikes/browser/indexeddb-real.html` to record `ConstraintError` on duplicate key addition.
- Hardened `tests/spikes/browser/run-edge.mjs` with self-contained server lifecycle, cross-browser discovery, and strict assertions on `window.__results` that fail closed on missing outcomes, timeouts, or experiment errors.
- Verified all three stages (`?run=write`, `?run=verify`, `?run=all`) against headless Microsoft Edge 155 with exit code 0.

## Phase 05 — 2026-10-14 (Provisional web shell implementation)

- Built the responsive web navigation shell in `apps/web` and `packages/ui-web` matching the information architecture in `docs/design/information-architecture.md`.
- Implemented desktop sidebar navigation (&ge; 1024px), tablet transitions (768px–1023px), and compact mobile bottom navigation (< 768px down to 320px width) with zero horizontal overflow/clipping.
- Built parent routes: Today (`/today` and `/`), Plan (`/plan`), Calendar under Plan (`/plan/calendar`), Library (`/library`), and Journal (`/journal`).
- Provided consistently reachable global controls: Search modal with shortcut `/`, Create item modal with shortcut `c`, Theme toggle (Light/Dark), Help & Shortcuts modal with shortcut `?`, and Workspace Profile modal.
- Added Settings page (`/settings`) supporting theme mode switching, text scaling (100% to 200%), Right-to-Left (RTL) reading direction, and Bengali (বাংলা) font rendering and readability preview with 1.6 line-height.
- Added Help page (`/help`) with accessible keyboard shortcuts reference and landmark structure guide.
- Added accessible 404 page in `apps/web/src/app/not-found.tsx`.
- Preserved Phase 04 component review gallery at `/review`.
- Implemented accessible primitives in `packages/ui-web`: `EmptyState`, `SkipLink`, and `RouteAnnouncer` (with `aria-live="polite"` route change announcements).
- Replaced the root `test:e2e:web` echo placeholder in `package.json` with a real automated browser test script (`scripts/test-web-e2e.mjs`) executing 30 interactive checks in Microsoft Edge via Chrome DevTools Protocol (CDP).
- Tracked Phase 05 status as `blocked` in `docs/roadmap/progress.json` and recorded the provisional implementation in `docs/phase-reports/phase-05.md` pending prerequisite Phase 04 physical Android TalkBack hardware verification.

## Phase 04 — 2026-10-14

- Encoded semantic design tokens in `packages/design-tokens` for light and dark themes (warm paper, dark ink, deep teal, soft amber), spacing, radii, touch targets, focus treatments, motion, and specialized Bangla line-height (`1.6`).
- Implemented WCAG 2.2 relative luminance and contrast ratio calculation utilities and verified all core color pairs meet Level AA requirements (including ink on paper 13.44:1, dark primary on dark surface 14.05:1, and essential UI borders >= 3.0:1).
- Implemented accessible browser UI primitives in `packages/ui-web`: `Button`, `TextField`, `Dialog`, `Feedback`, `ListRow`, `Card` with focus trapping, Escape key closing, and touch targets >= 44px.
- Implemented native mobile UI primitives in `packages/ui-mobile`: `MobileButton`, `MobileTextField`, `MobileModalSheet`, `MobileFeedback`, `MobileListRow`, `MobileCard`, and `theme` with 48dp minimum touch targets.
- Created interactive component review surface in `apps/web/src/app/page.tsx` supporting light/dark theme switching, RTL layout, font scaling, error toggling, dialog focus management, and Bangla script readability.
- Created mobile component gallery in `apps/mobile/App.tsx` displaying all primitives and states.
- Recorded physical Android device TalkBack testing as a remaining hardware gate in `docs/phase-reports/phase-04.md`.

## Phase 03 corrective revision, 2026-10-14

- Relabeled `tests/spikes/` suites as synthetic contract/model tests (`storage-model.synthetic.test.ts`, `native-capabilities-model.synthetic.test.ts`, `platform-policy-model.synthetic.test.ts`) that test contract shapes in-memory rather than actual native hardware or browser storage.
- Added real browser IndexedDB experiment (`tests/spikes/browser/`) and executed via automated Chrome DevTools Protocol against Microsoft Edge 155; observed and recorded transaction rollback on abort, duplicate key constraint failure, schema migration v1->v2 with index creation and data retention, upgrade error rollback, and storage estimate/eviction flags.
- Rechecked primary vendor sources (2026-10-14): removed unsupported 15-minute alarm delivery guarantee in favor of Android 12+ >=10 minute clipping and Doze best-effort delivery; clarified SecureStore adapter 2KB quota vs lack of universal JS limit in Expo; removed fixed CASA dollar figures for Google Drive restricted scopes; and clarified that Node crypto tests do not constitute cryptographic vault approval.
- Updated ADRs 0009 through 0012, `tests/spikes/README.md`, `docs/research/sources.md`, and `docs/phase-reports/phase-03.md`.

## Phase 01-02 corrective revision, 2026-10-14

- Moved the runtime baseline to Node 24.21.0 (Active LTS) and upgraded Next.js to 15.5.x and Vitest to 4.1.x; added overrides for `tar`, `@xmldom/xmldom`, `image-size` and `postcss`.
- Rewrote the dependency audit gate: it now rejects process failures, signals and malformed reports, and matches exceptions by advisory, installed version and dependency path. Removed 40 unapproved exceptions. Two advisories without a patched release remain, so `pnpm audit:deps` fails until the owner approves exceptions (`docs/security/pending-exception-proposals.md`).
- Tests now run the real audit implementation and CLI.

## Phase 03 — 2026-10-13

- Executed platform and integration feasibility spikes under `tests/spikes/`:
  - Validated SQLite vs IndexedDB storage adapters, atomic rollbacks, schema migrations, quota management, and auth session persistence (`sqlite-indexeddb-spike.test.ts`).
  - Evaluated native hardware capabilities: notification channel importance, in-app notification center fallback, SecureStore 2KB size constraints, biometric presence vs vault key separation, 5-minute AAC audio recording limits, and authenticated AES-256-GCM cryptography (`expo-capabilities-spike.test.ts`).
  - Validated platform constraints: Android exact alarm policies (rejecting restricted `USE_EXACT_ALARM`), Web Push requirements, Google Drive least-privilege `drive.file` scope, server-side Google Play Developer API and StoreKit receipt verification, and iOS platform parity (`platform-constraints-spike.test.ts`).
- Created Architecture Decision Records ADR-0009 through ADR-0012 in `docs/decisions/`.
- Updated `docs/roadmap/progress.json` setting Phase 03 to complete and identifying Phase 04 as next eligible phase.

## Phase 02 — 2026-10-13

- Added GitHub Actions continuous integration workflows (`.github/workflows/ci.yml`, `.github/workflows/security.yml`) with minimal token permissions (`contents: read`).
- Created repository secret scanner (`scripts/scan-secrets.mjs`) with output redaction and dependency vulnerability audit wrapper (`scripts/audit-dependencies.mjs`) with granular `.security-exceptions.json` registry enforcing specific advisory GHSAs, expiration, and accountability.
- Added comprehensive synthetic test suite (`tests/security/scanner-synthetic.test.ts`) covering secret detection/redaction, unapproved advisory rejection, unrelated advisories in excepted packages, expired exceptions, and registry service errors.
- Established pull request template (`.github/pull_request_template.md`) and issue templates (`bug_report.md`, `phase_proposal.md`, `config.yml`).
- Documented branch protection rules and protected deployment environment policies in `docs/engineering/contributor-automation.md`.
- Added root `audit`, `audit:deps`, and `audit:secrets` scripts.

## Phase 01 — 2026-10-13

- Configured pnpm monorepo workspace manifests, pinned dependencies, Node LTS configuration, and strict TypeScript rules.
- Replaced reserved directory placeholders with minimal runnable workspaces: `apps/api`, `apps/worker`, `apps/web`, `apps/mobile`, and shared packages (`packages/*`).
- Added Fastify health and smoke endpoints, Next.js web application shell, Expo mobile entrypoint with Metro monorepo resolver, and typed API client.
- Implemented root verification scripts: `build`, `typecheck`, `test`, `test:contract`, `test:integration`, `test:security`, `test:performance`, `lint`, and `format:check`.
- Established verified development startup (`pnpm dev:web`, `pnpm dev:api`, `pnpm dev:worker`, `pnpm dev:mobile`), pinned Node LTS `20.18.3`, and compiled native Expo Android development build APK (`app-debug.apk`) using `expo-dev-client`.

## Phase 00 — 2026-10-13

- Defined the personal organizer product, feature boundaries, provisional brand, and design direction.
- Specified web/mobile architecture, domain model, offline synchronization, integrations, and privacy boundaries.
- Established a granular roadmap, individual phase plans, quality gates, reports, contributor handoff, and repository layout.
- Added executable planning validation. Application implementation starts in Phase 01.
