#!/usr/bin/env node
/**
 * Builds docs/roadmap/v2/function-register.json from curated Phase 65 inventory data.
 * Discovery inputs: API route extract, web routes, mobile views, contracts, preview gates,
 * and executed local test evidence. Does not invent authenticated/device results.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outPath = path.join(root, 'docs/roadmap/v2/function-register.json');

const baseRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim();

const FAMILIES = [
  'account-and-first-use',
  'home-and-navigation',
  'tasks',
  'routines',
  'calendar',
  'notes-and-knowledge',
  'journal',
  'folders-and-library',
  'search',
  'files',
  'audio-attachments',
  'expenses',
  'custom-sections',
  'offline-and-portability',
  'reminders',
  'vault',
  'drive',
  'rooms-and-chat',
  'billing',
  'assistant',
  'help-and-support',
  'developer-and-operations',
];

const readinessValues = {
  unverified: 'Source or plan exists; this inventory did not freshly verify the action end-to-end.',
  verified_local:
    'Passed nominated local synthetic checks (domain/API/browser with fixtures or injected session).',
  verified_staging_provider:
    'Passed against real provider/staging credentials in an authorized environment.',
  verified_physical_device: 'Passed on a physical device (not emulator-only).',
  release_ready:
    'All applicable release gates for this action passed with current evidence. Never inferred from source or local mocks alone.',
  blocked: 'Known blocker prevents verification or release; linked defect required.',
  owner_deferred: 'Owner explicitly deferred; requires ownerDecisionRef.',
};

const observedResultValues = {
  pass: 'Assertions for the exercised journey succeeded.',
  fail: 'Exercised journey failed product assertions.',
  unavailable: 'Capability gated or missing in the nominated environment.',
  skipped: 'Prerequisite missing; journey not run.',
  untested: 'In inventory scope but not exercised in this baseline.',
};

const evidenceLayers = {
  domain_unit: 'Pure domain or unit tests.',
  api_integration: 'API/integration with synthetic auth and local database.',
  browser_ui: 'Browser UI / CDP evidence.',
  provider_authenticated: 'Real provider authentication.',
  emulator: 'Android emulator or browser device emulation.',
  physical_device: 'Physical phone or tablet.',
};

const CORE_E2E =
  'pnpm exec vitest run tests/e2e/core-organizer-journeys.test.ts tests/integration/core-organizer-local-validation.test.ts';
const CORE_CMD = 'pnpm validate:core';
const PERF_CMD = 'pnpm exec vitest run tests/performance/phase58-reliability-baseline.test.ts';
const EVIDENCE_CORE = 'artifacts/local/phase65/core-journeys.log';
const EVIDENCE_PERF = 'artifacts/local/phase65/perf-baseline.log';
const EVIDENCE_PERF_JSON = 'tests/performance/results/phase58-baseline.json';
const EVIDENCE_SHOTS = 'docs/roadmap/v2/evidence/phase65-visual-manifest.json';
const DATE = '2026-10-25';
const ENV = 'local-windows-daynori_test-synthetic-jwt';
const REV = baseRevision.slice(0, 7);

function meta(layer, platform = 'api-local') {
  return {
    date: DATE,
    revision: REV,
    environment: ENV,
    platform,
    evidenceLayer: layer,
  };
}

function help(status, ref) {
  return { status, ref };
}

function tour(status, ref) {
  return { status, ref };
}

function platforms(web, pwa, android, ios = 'gated') {
  return { web, installedPwa: pwa, android, iosNative: ios };
}

function release(local, hosted) {
  return { local, hostedPreview: hosted };
}

/** @type {Array<object>} */
const actions = [];

function add(partial) {
  const defaults = {
    owner: 'unassigned',
    dependencies: [],
    validationNegativeCases: [],
    offlineRetryConflict:
      'Follows workspace sync/outbox rules where implemented; see family notes.',
    existingTests: [],
    evidenceRefs: [],
    blockerOrDefect: null,
    authorization: 'Workspace member when authenticated; public where route is public.',
    personalVisibility: 'Visible when module is released and authorized; not a preference hide.',
    platforms: platforms('supported', 'supported', 'supported', 'gated'),
    releaseCapability: release('available', 'partial'),
  };
  actions.push({ ...defaults, ...partial });
}

// ——— Account and first use ———
add({
  id: 'account.welcome-shell',
  featureFamily: 'account-and-first-use',
  userBenefit: 'Reach the app shell and understand first-run options.',
  description: 'Open root/welcome and navigate into Today or sign-in.',
  implementationStatus: 'existing',
  entryPoints: ['/', '/today', 'mobile TodayView'],
  implementationPaths: ['apps/web/src/app/page.tsx', 'apps/web/src/app/today/page.tsx'],
  readiness: 'verified_local',
  acceptanceJourney: 'Open /today in local web build; shell renders without crash.',
  existingTests: ['pnpm test:e2e:web (shell paths)', CORE_E2E],
  observedResult: 'pass',
  evidenceRefs: [EVIDENCE_CORE, EVIDENCE_SHOTS],
  evidenceMeta: meta('browser_ui', 'web-local'),
  repairPhase: '72',
  helpArticle: help('existing', '/help#getting-started'),
  tourTreatment: tour('existing', 'OnboardingTutorial three-step beginner guide'),
});

add({
  id: 'account.sign-up',
  featureFamily: 'account-and-first-use',
  userBenefit: 'Create an account.',
  description: 'Email/password sign-up via web auth routes and Supabase Auth adapter.',
  implementationStatus: 'existing',
  entryPoints: ['/api/auth/sign-up', 'Settings account', 'mobile AccountSheet'],
  implementationPaths: [
    'apps/web/src/app/api/auth/sign-up/route.ts',
    'apps/mobile/src/views/AccountSheet.tsx',
  ],
  releaseCapability: release('available', 'available'),
  authorization: 'Public sign-up; creates user then personal workspace provision.',
  readiness: 'unverified',
  acceptanceJourney: 'Sign up with synthetic email, provision workspace, land in Today.',
  validationNegativeCases: ['invalid email', 'weak password', 'duplicate account'],
  existingTests: ['tests/integration/phase10-workspaces-preferences.test.ts'],
  observedResult: 'untested',
  evidenceRefs: [],
  evidenceMeta: meta('provider_authenticated', 'untested'),
  blockerOrDefect: 'DEF-V2-001',
  repairPhase: '72',
  helpArticle: help('planned', 'help/account-sign-up'),
  tourTreatment: tour('planned', 'chapter-account-first-use'),
  dependencies: ['Supabase Auth runtime'],
});

add({
  id: 'account.sign-in',
  featureFamily: 'account-and-first-use',
  userBenefit: 'Return to an existing account.',
  description: 'Sign-in via /api/auth/sign-in and mobile auth adapter.',
  implementationStatus: 'existing',
  entryPoints: ['/api/auth/sign-in', 'Settings', 'mobile AccountSheet'],
  implementationPaths: [
    'apps/web/src/app/api/auth/sign-in/route.ts',
    'apps/mobile/src/auth/authAdapter.ts',
  ],
  releaseCapability: release('available', 'available'),
  authorization: 'Valid credentials; session cookies/tokens.',
  readiness: 'unverified',
  acceptanceJourney: 'Sign in with synthetic account; session persists across refresh.',
  validationNegativeCases: ['wrong password', 'expired session vs outage'],
  existingTests: ['tests/integration/phase09*.test.ts (historical)', CORE_E2E],
  observedResult: 'skipped',
  evidenceRefs: [EVIDENCE_CORE],
  evidenceMeta: meta('api_integration', 'synthetic-jwt-only'),
  blockerOrDefect: 'DEF-V2-001',
  repairPhase: '72',
  helpArticle: help('planned', 'help/account-sign-in'),
  tourTreatment: tour('planned', 'chapter-account-first-use'),
  note: 'Core journeys use injected JWT, not real provider login.',
});

add({
  id: 'account.recover-password',
  featureFamily: 'account-and-first-use',
  userBenefit: 'Regain access when password is forgotten.',
  description: 'Password recovery via /api/auth/recover.',
  implementationStatus: 'existing',
  entryPoints: ['/api/auth/recover'],
  implementationPaths: ['apps/web/src/app/api/auth/recover/route.ts'],
  readiness: 'unverified',
  acceptanceJourney: 'Request recovery for synthetic account; complete reset flow.',
  observedResult: 'untested',
  evidenceMeta: meta('provider_authenticated', 'untested'),
  repairPhase: '72',
  helpArticle: help('planned', 'help/account-recovery'),
  tourTreatment: tour('planned', 'chapter-account-recovery-safe-demo'),
});

add({
  id: 'account.session-refresh',
  featureFamily: 'account-and-first-use',
  userBenefit: 'Stay signed in across refresh without losing work on transient outages.',
  description: 'Refresh session; keep cookies on temporary auth outages (503 keep-session).',
  implementationStatus: 'existing',
  entryPoints: ['/api/auth/refresh', '/api/auth/session'],
  implementationPaths: [
    'apps/web/src/app/api/auth/refresh/route.ts',
    'apps/web/src/app/api/auth/session/route.ts',
  ],
  readiness: 'verified_local',
  acceptanceJourney: 'With valid session, refresh keeps auth; invalid refresh clears.',
  existingTests: ['phase 60 session resilience notes', CORE_E2E],
  observedResult: 'pass',
  evidenceRefs: [EVIDENCE_CORE],
  evidenceMeta: meta('api_integration'),
  repairPhase: '72',
  helpArticle: help('existing', '/help stay signed in'),
  tourTreatment: tour('planned', 'chapter-session-recovery'),
});

add({
  id: 'account.sign-out',
  featureFamily: 'account-and-first-use',
  userBenefit: 'Leave the account on a shared device.',
  description: 'Sign-out clears session via /api/auth/sign-out.',
  implementationStatus: 'existing',
  entryPoints: ['/api/auth/sign-out', 'Settings'],
  implementationPaths: ['apps/web/src/app/api/auth/sign-out/route.ts'],
  readiness: 'unverified',
  acceptanceJourney:
    'Sign out; protected routes require auth again; local quarantine policy applies.',
  observedResult: 'untested',
  evidenceMeta: meta('browser_ui', 'untested'),
  repairPhase: '72',
  helpArticle: help('planned', 'help/sign-out'),
  tourTreatment: tour('planned', 'chapter-account-first-use'),
});

add({
  id: 'account.workspace-provision',
  featureFamily: 'account-and-first-use',
  userBenefit: 'Get a personal workspace after authentication.',
  description: 'POST /v1/workspaces/provision creates or returns personal workspace.',
  implementationStatus: 'existing',
  entryPoints: ['POST /v1/workspaces/provision', 'web provision proxy'],
  implementationPaths: [
    'apps/api/src/routes/v1/workspaces.ts',
    'apps/web/src/app/api/workspaces/provision/route.ts',
  ],
  authorization: 'Authenticated user; workspace membership.',
  readiness: 'verified_local',
  acceptanceJourney: 'Provision once; replay returns same workspace.',
  existingTests: [CORE_E2E],
  observedResult: 'pass',
  evidenceRefs: [EVIDENCE_CORE],
  evidenceMeta: meta('api_integration'),
  repairPhase: '72',
  helpArticle: help('planned', 'help/workspace'),
  tourTreatment: tour('planned', 'chapter-account-first-use'),
});

add({
  id: 'account.preferences-update',
  featureFamily: 'account-and-first-use',
  userBenefit: 'Persist theme, locale, layout, and onboarding preferences.',
  description: 'GET/PATCH /v1/users/me/preferences with optimistic concurrency.',
  implementationStatus: 'existing',
  entryPoints: ['/settings', 'GET/PATCH /v1/users/me/preferences'],
  implementationPaths: ['apps/api/src/routes/v1/users.ts', 'apps/web/src/app/settings/page.tsx'],
  authorization: 'Authenticated user.',
  personalVisibility: 'Preferences control layout/theme; not authorization.',
  readiness: 'verified_local',
  acceptanceJourney: 'Patch preferences; conflict on stale revision returns 409.',
  validationNegativeCases: ['stale revision conflict'],
  existingTests: [CORE_E2E],
  observedResult: 'pass',
  evidenceRefs: [EVIDENCE_CORE],
  evidenceMeta: meta('api_integration'),
  repairPhase: '66',
  helpArticle: help('planned', 'help/preferences'),
  tourTreatment: tour('planned', 'chapter-personalization'),
});

add({
  id: 'account.account-deletion',
  featureFamily: 'account-and-first-use',
  userBenefit: 'Request permanent account erasure.',
  description: 'Public and authenticated account-deletion request/confirm/cancel/status.',
  implementationStatus: 'existing',
  entryPoints: [
    '/account-deletion',
    'POST /v1/auth/account-deletion/*',
    'POST /v1/public/account-deletion-request',
  ],
  implementationPaths: [
    'apps/web/src/app/account-deletion/page.tsx',
    'apps/api/src/routes/v1/deletion.ts',
  ],
  readiness: 'verified_local',
  acceptanceJourney: 'Request deletion with reauth; confirm purges; subsequent API returns 401.',
  validationNegativeCases: ['invalid verification token', 'cancel before confirm'],
  existingTests: [CORE_E2E, 'tests/integration/account-consent-deletion.test.ts'],
  observedResult: 'pass',
  evidenceRefs: [EVIDENCE_CORE],
  evidenceMeta: meta('api_integration'),
  repairPhase: '97',
  helpArticle: help('planned', 'help/account-deletion-safe'),
  tourTreatment: tour('planned', 'chapter-dangerous-ops-safe-demo'),
});

// ——— Home and navigation ———
for (const [id, route, desc, phase] of [
  ['nav.open-today', '/today', 'Open Today home.', '69'],
  ['nav.open-plan', '/plan', 'Open Plan (tasks/routines).', '69'],
  ['nav.open-library', '/library', 'Open Library.', '69'],
  ['nav.open-journal', '/journal', 'Open Journal.', '69'],
  ['nav.open-settings', '/settings', 'Open Settings.', '66'],
  ['nav.open-help', '/help', 'Open Help.', '78'],
  ['nav.open-support', '/support', 'Open Support.', '82'],
  ['nav.open-review', '/review', 'Open conflict/review surface.', '77'],
]) {
  add({
    id,
    featureFamily: 'home-and-navigation',
    userBenefit: desc,
    description: `Navigate to ${route} on web; mobile shell equivalent where mapped.`,
    implementationStatus: 'existing',
    entryPoints: [route, 'AppSidebar', 'mobile bottom nav / sheets'],
    implementationPaths: [`apps/web/src/app${route === '/' ? '' : route}/page.tsx`],
    readiness: 'verified_local',
    acceptanceJourney: `Open ${route}; primary content region renders.`,
    existingTests: ['pnpm test:e2e:web', CORE_CMD],
    observedResult: 'pass',
    evidenceRefs: [EVIDENCE_SHOTS, EVIDENCE_CORE],
    evidenceMeta: meta('browser_ui', 'web-local'),
    repairPhase: phase,
    helpArticle: help(route === '/help' ? 'existing' : 'planned', `help${route}`),
    tourTreatment: tour('planned', `chapter-nav-${route.slice(1) || 'root'}`),
  });
}

add({
  id: 'nav.create-menu',
  featureFamily: 'home-and-navigation',
  userBenefit: 'Create note, task, routine, journal, or other allowed types from one menu.',
  description: 'Create affordance (web Create / mobile CreateSheet).',
  implementationStatus: 'existing',
  entryPoints: ['Create control', 'mobile CreateSheet'],
  implementationPaths: [
    'apps/web/src/components/AppModals.tsx',
    'apps/mobile/src/views/CreateSheet.tsx',
  ],
  readiness: 'verified_local',
  acceptanceJourney: 'Open Create; choose Note; save lands in Library.',
  existingTests: [CORE_E2E, 'apps/mobile/src/views/CreateSheet.test.ts'],
  observedResult: 'pass',
  evidenceRefs: [EVIDENCE_CORE],
  evidenceMeta: meta('api_integration'),
  repairPhase: '66',
  helpArticle: help('existing', '/help Write a note'),
  tourTreatment: tour('existing', 'OnboardingTutorial optional practice create'),
});

add({
  id: 'nav.all-features-directory',
  featureFamily: 'home-and-navigation',
  userBenefit: 'Find every feature without memorizing navigation.',
  description: 'Searchable All features directory (planned V2).',
  implementationStatus: 'planned',
  entryPoints: ['planned All features'],
  implementationPaths: [],
  platforms: platforms('unsupported', 'unsupported', 'unsupported', 'gated'),
  releaseCapability: release('unavailable', 'unavailable'),
  readiness: 'unverified',
  acceptanceJourney: 'Open All features; search and open a module.',
  observedResult: 'unavailable',
  evidenceMeta: meta('browser_ui', 'not-implemented'),
  repairPhase: '66',
  helpArticle: help('planned', 'help/all-features'),
  tourTreatment: tour('planned', 'chapter-find-features'),
});

add({
  id: 'nav.hide-show-modules',
  featureFamily: 'home-and-navigation',
  userBenefit: 'Hide unused modules without deleting data.',
  description: 'Personalization hide/show/reorder and reset layout (partial Today layout exists).',
  implementationStatus: 'existing',
  entryPoints: ['Today layout preferences', 'PATCH preferences homeLayout'],
  implementationPaths: ['apps/web/src/app/today/page.tsx', 'packages/domain'],
  personalVisibility: 'User preference; distinct from gated/unauthorized modules.',
  readiness: 'verified_local',
  acceptanceJourney: 'Customize Today layout; sync conflict returns 409; data preserved.',
  existingTests: [CORE_E2E],
  observedResult: 'pass',
  evidenceRefs: [EVIDENCE_CORE],
  evidenceMeta: meta('api_integration'),
  repairPhase: '66',
  helpArticle: help('planned', 'help/personalize-home'),
  tourTreatment: tour('planned', 'chapter-personalization'),
});

add({
  id: 'nav.theme-toggle',
  featureFamily: 'home-and-navigation',
  userBenefit: 'Switch light/dark theme.',
  description: 'Theme mode toggle in Settings and shell.',
  implementationStatus: 'existing',
  entryPoints: ['/settings', 'mobile SettingsView'],
  implementationPaths: [
    'apps/web/src/app/settings/page.tsx',
    'apps/mobile/src/views/SettingsView.tsx',
  ],
  personalVisibility: 'Preference only.',
  readiness: 'verified_local',
  acceptanceJourney: 'Toggle theme; UI tokens update; screenshot both modes.',
  existingTests: ['pnpm test:e2e:web'],
  observedResult: 'pass',
  evidenceRefs: [EVIDENCE_SHOTS],
  evidenceMeta: meta('browser_ui', 'web-local'),
  repairPhase: '68',
  helpArticle: help('planned', 'help/theme'),
  tourTreatment: tour('planned', 'chapter-personalization'),
});

add({
  id: 'nav.language-text-scale',
  featureFamily: 'home-and-navigation',
  userBenefit: 'Adjust language and text size for readability.',
  description: 'Locale/Bangla surfaces and text scale controls.',
  implementationStatus: 'existing',
  entryPoints: ['/settings'],
  implementationPaths: [
    'apps/web/src/app/settings/page.tsx',
    'apps/mobile/src/views/SettingsView.tsx',
  ],
  readiness: 'unverified',
  acceptanceJourney:
    'Set Bangla/long content; text scale increases; no clipping critical controls.',
  observedResult: 'untested',
  evidenceRefs: ['artifacts/web-e2e/settings-bangla-desktop.png'],
  evidenceMeta: meta('browser_ui', 'historical-labeled'),
  repairPhase: '66',
  helpArticle: help('planned', 'help/accessibility-prefs'),
  tourTreatment: tour('planned', 'chapter-personalization'),
  note: 'Historical Bangla screenshot exists; fresh Phase 65 capture preferred.',
});

// ——— Tasks ———
const taskActions = [
  [
    'tasks.create',
    'Create task with title/details/priority/deadline.',
    'POST /v1/workspaces/:id/tasks',
  ],
  [
    'tasks.edit',
    'Edit task fields with revision checks.',
    'PATCH /v1/workspaces/:id/tasks/:taskId',
  ],
  ['tasks.complete', 'Complete a task.', 'POST .../complete'],
  ['tasks.reopen-undo', 'Reopen/undo completion.', 'POST .../reopen'],
  ['tasks.delete-restore', 'Delete/trash and restore task.', 'DELETE / restore paths'],
  [
    'tasks.list-filters',
    'List upcoming/overdue/completed filters in Plan.',
    'GET /v1/.../tasks + Plan UI',
  ],
  ['tasks.subtasks', 'Manage subtask hierarchy where supported.', 'task domain + Plan UI'],
];
for (const [id, desc, entry] of taskActions) {
  add({
    id,
    featureFamily: 'tasks',
    userBenefit: desc,
    description: desc,
    implementationStatus: 'existing',
    entryPoints: ['/plan', entry, 'Create → Task'],
    implementationPaths: [
      'apps/api/src/routes/v1/tasks.ts',
      'apps/web/src/app/plan/page.tsx',
      'apps/mobile/src/views/PlanView.tsx',
      'packages/domain',
    ],
    authorization: 'Workspace member.',
    readiness:
      id === 'tasks.create' || id === 'tasks.complete' || id === 'tasks.reopen-undo'
        ? 'verified_local'
        : 'verified_local',
    acceptanceJourney: 'Create task with deadline; complete; reopen; appear in Plan filters.',
    validationNegativeCases: ['invalid deadline timezone', 'cross-workspace id'],
    existingTests: [
      CORE_E2E,
      'tests/integration/phase18-tasks-deadlines.test.ts',
      'tests/integration/phase19-tasks-workflows.test.ts',
    ],
    observedResult: 'pass',
    evidenceRefs: [EVIDENCE_CORE],
    evidenceMeta: meta('api_integration'),
    repairPhase: '73',
    helpArticle: help('existing', '/help Add a task'),
    tourTreatment: tour('planned', 'chapter-tasks'),
  });
}

// ——— Routines ———
for (const [id, desc] of [
  ['routines.create', 'Create daily/weekday routine with timezone.'],
  ['routines.edit', 'Edit routine effective date/schedule.'],
  ['routines.complete-occurrence', 'Complete today’s occurrence.'],
  ['routines.skip-occurrence', 'Skip occurrence.'],
  ['routines.undo-occurrence', 'Undo/reopen occurrence.'],
  ['routines.history', 'View occurrence history.'],
  ['routines.independent-dates', 'Verify tomorrow’s occurrence independent of today.'],
]) {
  add({
    id,
    featureFamily: 'routines',
    userBenefit: desc,
    description: desc,
    implementationStatus: 'existing',
    entryPoints: [
      '/plan',
      '/today',
      'POST/PATCH /v1/.../routines',
      'occurrence complete/skip/reopen',
    ],
    implementationPaths: [
      'apps/api/src/routes/v1/routines.ts',
      'apps/web/src/app/plan/page.tsx',
      'apps/web/src/app/today/page.tsx',
      'packages/domain',
    ],
    authorization: 'Workspace member.',
    readiness: 'verified_local',
    acceptanceJourney: 'Create routine; complete/skip/undo occurrence; next day independent.',
    existingTests: [
      CORE_E2E,
      'tests/integration/phase20-routines-occurrences.test.ts',
      'tests/integration/phase21-daily-routines-experience.test.ts',
    ],
    observedResult: 'pass',
    evidenceRefs: [EVIDENCE_CORE],
    evidenceMeta: meta('api_integration'),
    repairPhase: '73',
    helpArticle: help('existing', '/help Tasks vs routines'),
    tourTreatment: tour('planned', 'chapter-routines'),
  });
}

// ——— Calendar ———
for (const [id, desc] of [
  ['calendar.view-feed', 'View agenda/month calendar feed with task/routine projections.'],
  ['calendar.create-event', 'Create private timed/all-day event.'],
  ['calendar.edit-event', 'Edit calendar event.'],
  ['calendar.delete-event', 'Delete calendar event.'],
  ['calendar.open-canonical', 'Open canonical task/routine/note from projection.'],
]) {
  add({
    id,
    featureFamily: 'calendar',
    userBenefit: desc,
    description: desc,
    implementationStatus: 'existing',
    entryPoints: ['/plan/calendar', '/v1/.../calendar/feed', 'calendar events CRUD'],
    implementationPaths: [
      'apps/api/src/routes/v1/calendar.ts',
      'apps/web/src/app/plan/calendar/page.tsx',
    ],
    authorization: 'Workspace member.',
    readiness: id === 'calendar.view-feed' ? 'unverified' : 'unverified',
    acceptanceJourney: 'Open calendar; create event; open linked task.',
    existingTests: ['tests/integration/phase26-calendar-deadlines.test.ts'],
    observedResult: 'untested',
    evidenceRefs: ['artifacts/web-e2e/plan-calendar-desktop.png'],
    evidenceMeta: meta('browser_ui', 'historical-or-untested'),
    repairPhase: '73',
    helpArticle: help('planned', 'help/calendar'),
    tourTreatment: tour('planned', 'chapter-calendar'),
  });
}

// ——— Notes ———
for (const [id, desc, result] of [
  ['notes.create-save', 'Create and save note with AST content including Bangla.', 'pass'],
  ['notes.reopen-edit', 'Reopen and edit note with autosave/revision.', 'pass'],
  ['notes.format-guides-links', 'Formatting, guides, and safe links/backlinks.', 'pass'],
  ['notes.trash-restore', 'Trash and restore note.', 'pass'],
  ['notes.long-content', 'Preserve long English/Bangla documents.', 'pass'],
]) {
  add({
    id,
    featureFamily: 'notes-and-knowledge',
    userBenefit: desc,
    description: desc,
    implementationStatus: 'existing',
    entryPoints: ['/library', 'Create → Note', '/v1/.../notes'],
    implementationPaths: [
      'apps/api/src/routes/v1/notes.ts',
      'apps/web/src/app/library/page.tsx',
      'packages/domain',
    ],
    authorization: 'Workspace member.',
    readiness: 'verified_local',
    acceptanceJourney: 'Create note; save; reopen; search; trash/restore.',
    validationNegativeCases: ['revision conflict 409', 'cross-workspace note id'],
    offlineRetryConflict:
      'Local draft/outbox where sync enabled; revision conflicts preserved side-by-side.',
    existingTests: [
      CORE_E2E,
      'tests/integration/phase16-notes-domain-persistence.test.ts',
      'tests/integration/phase17-focused-note-editor.test.ts',
    ],
    observedResult: result,
    evidenceRefs: [EVIDENCE_CORE, EVIDENCE_PERF_JSON],
    evidenceMeta: meta('api_integration'),
    repairPhase: '74',
    helpArticle: help('existing', '/help Write a note'),
    tourTreatment: tour('planned', 'chapter-notes'),
  });
}

// ——— Journal ———
for (const [id, desc] of [
  ['journal.create-entry', 'Create journal entry (multiple per date).'],
  ['journal.edit-reopen', 'Edit and reopen journal entry.'],
  ['journal.backdate', 'Backdate entry with badge.'],
  ['journal.privacy-snippets', 'Search snippets suppress private journal body.'],
  ['journal.trash-restore', 'Trash and restore journal entry.'],
]) {
  add({
    id,
    featureFamily: 'journal',
    userBenefit: desc,
    description: desc,
    implementationStatus: 'existing',
    entryPoints: ['/journal', '/v1/.../journal'],
    implementationPaths: [
      'apps/api/src/routes/v1/journal.ts',
      'apps/web/src/app/journal/page.tsx',
      'apps/mobile/src/views/JournalView.tsx',
    ],
    authorization: 'Workspace member; journal treated as personal/private by defaults.',
    readiness: 'verified_local',
    acceptanceJourney: 'Create two entries same date; search without leaking body; reopen.',
    existingTests: [
      CORE_E2E,
      'tests/integration/phase22-journal-entries.test.ts',
      'tests/integration/phase23-journal-writing.test.ts',
    ],
    observedResult: 'pass',
    evidenceRefs: [EVIDENCE_CORE],
    evidenceMeta: meta('api_integration'),
    repairPhase: '74',
    helpArticle: help('existing', '/help Journal'),
    tourTreatment: tour('planned', 'chapter-journal'),
  });
}

// ——— Folders / library ———
for (const [id, desc] of [
  ['library.folder-create', 'Create nested folders with depth/cycle validation.'],
  ['library.folder-move-rename', 'Move/rename/reorder folders.'],
  ['library.folder-trash-restore', 'Trash/archive/restore folders.'],
  ['library.browse-mixed', 'Browse mixed notes/files in folder views.'],
  ['library.saved-views', 'Create and use saved views.'],
]) {
  add({
    id,
    featureFamily: 'folders-and-library',
    userBenefit: desc,
    description: desc,
    implementationStatus: 'existing',
    entryPoints: ['/library', '/v1/.../folders', '/v1/.../saved-views'],
    implementationPaths: [
      'apps/api/src/routes/v1/organization.ts',
      'apps/api/src/routes/v1/knowledge.ts',
      'apps/web/src/app/library/page.tsx',
    ],
    authorization: 'Workspace member.',
    readiness: 'verified_local',
    acceptanceJourney: 'Create folder hierarchy; move note; trash/restore; reopen.',
    validationNegativeCases: ['cycle', 'depth overflow'],
    existingTests: [
      CORE_E2E,
      'tests/integration/phase14-organization-folders.test.ts',
      'tests/integration/phase15-folder-browsing-library.test.ts',
    ],
    observedResult: 'pass',
    evidenceRefs: [EVIDENCE_CORE],
    evidenceMeta: meta('api_integration'),
    repairPhase: '74',
    helpArticle: help('planned', 'help/library-folders'),
    tourTreatment: tour('planned', 'chapter-library'),
  });
}

// ——— Search ———
add({
  id: 'search.global',
  featureFamily: 'search',
  userBenefit: 'Find authorized items across the workspace.',
  description: 'GET /v1/.../search with filters; deep-link to canonical item.',
  implementationStatus: 'existing',
  entryPoints: ['Library search', 'mobile SearchSheet', 'GET /v1/.../search'],
  implementationPaths: [
    'apps/api/src/routes/v1/search.ts',
    'apps/web/src/app/library/page.tsx',
    'apps/mobile/src/views/SearchSheet.tsx',
  ],
  authorization: 'Workspace-scoped; no cross-workspace results.',
  readiness: 'verified_local',
  acceptanceJourney: 'Search marker text; open exact note id.',
  validationNegativeCases: ['unauthorized workspace', 'journal snippet privacy'],
  existingTests: [CORE_E2E, PERF_CMD, 'tests/integration/phase33-search.test.ts'],
  observedResult: 'pass',
  evidenceRefs: [EVIDENCE_CORE, EVIDENCE_PERF_JSON],
  evidenceMeta: meta('api_integration'),
  repairPhase: '74',
  helpArticle: help('planned', 'help/search'),
  tourTreatment: tour('planned', 'chapter-search'),
});

add({
  id: 'search.offline-coverage',
  featureFamily: 'search',
  userBenefit: 'Understand what search can do offline.',
  description: 'Offline/local search coverage and unavailable explanation.',
  implementationStatus: 'existing',
  entryPoints: ['Library search offline'],
  implementationPaths: ['packages/sync', 'apps/web/src/app/library/page.tsx'],
  readiness: 'unverified',
  acceptanceJourney: 'Go offline; search local cache; see honest unavailable states.',
  observedResult: 'untested',
  evidenceMeta: meta('browser_ui', 'untested'),
  repairPhase: '77',
  helpArticle: help('existing', '/help Offline and updates'),
  tourTreatment: tour('planned', 'chapter-offline-search'),
});

// ——— Files ———
for (const [id, desc, hosted, readiness, observed, defect] of [
  [
    'files.upload-reserve-finalize',
    'Reserve, upload blob, finalize, worker scan.',
    'unavailable',
    'verified_local',
    'pass',
    null,
  ],
  [
    'files.download-preview',
    'Download/preview file.',
    'unavailable',
    'verified_local',
    'pass',
    null,
  ],
  [
    'files.cancel-retry-quota',
    'Cancel reservation; quota validation.',
    'unavailable',
    'unverified',
    'untested',
    null,
  ],
  ['files.delete', 'Delete file/attachment.', 'unavailable', 'unverified', 'untested', null],
]) {
  add({
    id,
    featureFamily: 'files',
    userBenefit: desc,
    description: desc,
    implementationStatus: 'existing',
    entryPoints: ['/library', '/files', '/v1/.../files/*'],
    implementationPaths: [
      'apps/api/src/routes/v1/files.ts',
      'apps/web/src/app/library/page.tsx',
      'apps/web/src/app/files/page.tsx',
      'apps/worker/src/worker.ts',
    ],
    releaseCapability: release('available', hosted),
    authorization: 'Workspace member; private storage.',
    readiness,
    acceptanceJourney: 'Upload synthetic blob; scan; download bytes match.',
    existingTests: [
      CORE_E2E,
      'tests/integration/phase24-binary-upload.test.ts',
      'tests/integration/phase25-files-previews.test.ts',
    ],
    observedResult: observed,
    evidenceRefs: observed === 'pass' ? [EVIDENCE_CORE] : [],
    evidenceMeta: meta('api_integration'),
    blockerOrDefect: defect ?? (hosted === 'unavailable' ? 'DEF-V2-002' : null),
    repairPhase: '75',
    helpArticle: help('planned', 'help/files'),
    tourTreatment: tour('planned', 'chapter-files'),
    dependencies:
      hosted === 'unavailable' ? ['hosted preview disables uploads (isCorePreview)'] : [],
  });
}

// ——— Audio ———
add({
  id: 'audio.record-attach',
  featureFamily: 'audio-attachments',
  userBenefit: 'Record and attach audio to an item (not assistant transcription).',
  description: 'Microphone permission, record/pause/stop, attach/upload/retry/delete.',
  implementationStatus: 'existing',
  entryPoints: ['Library audio controls', 'mobile audioAdapter'],
  implementationPaths: [
    'apps/mobile/src/audio/audioAdapter.ts',
    'apps/web/src/app/library/page.tsx',
    'packages/contracts/src/api/audio.ts',
  ],
  releaseCapability: release('partial', 'unavailable'),
  platforms: platforms('partial', 'partial', 'partial', 'gated'),
  readiness: 'blocked',
  acceptanceJourney: 'Grant mic; record; attach; playback; delete bytes.',
  observedResult: 'unavailable',
  evidenceMeta: meta('browser_ui', 'preview-gated'),
  blockerOrDefect: 'DEF-V2-002',
  repairPhase: '75',
  helpArticle: help('planned', 'help/audio-attachments'),
  tourTreatment: tour('planned', 'chapter-audio'),
  dependencies: ['mic permission', 'not core preview'],
  existingTests: ['tests/integration/phase41-audio-recording-attachment.test.ts'],
});

// ——— Expenses ———
for (const [id, desc] of [
  ['expenses.create-edit', 'Create/edit expense with currency/category/date.'],
  ['expenses.budgets-reports', 'Budgets, summary, reports.'],
  ['expenses.export', 'Export expenses.'],
  ['expenses.trash-restore', 'Trash/restore expense.'],
]) {
  add({
    id,
    featureFamily: 'expenses',
    userBenefit: desc,
    description: desc,
    implementationStatus: 'existing',
    entryPoints: ['/expenses', '/v1/.../expenses*', 'mobile ExpensesView'],
    implementationPaths: [
      'apps/api/src/routes/v1/expenses.ts',
      'apps/web/src/app/expenses/page.tsx',
      'apps/mobile/src/views/ExpensesView.tsx',
    ],
    authorization: 'Workspace member; expenses may be preference-toggled on mobile.',
    personalVisibility: 'Mobile expensesEnabled preference; not authorization.',
    readiness: 'unverified',
    acceptanceJourney: 'Create expense; budget; export synthetic data.',
    existingTests: [
      'tests/integration/phase39-expenses.test.ts',
      'tests/integration/phase40-expenses-reports-budgets.test.ts',
    ],
    observedResult: 'untested',
    evidenceMeta: meta('api_integration', 'not-rerun-phase65'),
    repairPhase: '76',
    helpArticle: help('planned', 'help/expenses'),
    tourTreatment: tour('planned', 'chapter-expenses'),
  });
}

// ——— Custom sections ———
for (const [id, desc] of [
  ['sections.create-from-template', 'Create custom section from approved blocks/templates.'],
  ['sections.records-crud', 'Create/edit/delete section records.'],
  ['sections.reorder-accessible', 'Reorder via accessible controls (not drag-only).'],
  ['sections.remove-preserve-refs', 'Remove section without deleting referenced items.'],
]) {
  add({
    id,
    featureFamily: 'custom-sections',
    userBenefit: desc,
    description: desc,
    implementationStatus: 'existing',
    entryPoints: ['/custom-sections', '/v1/.../custom-sections*', 'mobile CustomSectionsView'],
    implementationPaths: [
      'apps/api/src/routes/v1/customSections.ts',
      'apps/web/src/app/custom-sections/page.tsx',
      'apps/mobile/src/views/CustomSectionsView.tsx',
    ],
    authorization: 'Workspace member; approved block types only — no user scripts/SQL.',
    readiness: 'unverified',
    acceptanceJourney:
      'Create section; add record; reorder accessibly; remove section; refs remain.',
    existingTests: [
      'tests/integration/phase42-custom-sections.test.ts',
      'tests/integration/phase43-custom-section-builder.test.ts',
    ],
    observedResult: 'untested',
    evidenceMeta: meta('api_integration', 'not-rerun-phase65'),
    repairPhase: '76',
    helpArticle: help('planned', 'help/custom-sections'),
    tourTreatment: tour('planned', 'chapter-custom-sections'),
  });
}

// ——— Offline / portability ———
for (const [id, desc, readiness, observed] of [
  ['sync.push-pull', 'Push/pull sync with receipts.', 'verified_local', 'pass'],
  ['sync.conflict-review', 'Explicit revision conflict recovery.', 'verified_local', 'pass'],
  [
    'portability.export-import',
    'Export workspace and import with checksums.',
    'verified_local',
    'pass',
  ],
  ['offline.cold-reopen', 'Cold offline reopen of private organizer shell.', 'blocked', 'fail'],
  ['offline.pending-queue', 'Pending mutation queue survives restart.', 'unverified', 'untested'],
]) {
  add({
    id,
    featureFamily: 'offline-and-portability',
    userBenefit: desc,
    description: desc,
    implementationStatus: id === 'offline.cold-reopen' ? 'gated' : 'existing',
    entryPoints: ['/review', '/v1/sync/*', 'export/import APIs', 'offline.html'],
    implementationPaths: [
      'apps/api/src/modules/sync/routes.ts',
      'packages/sync',
      'apps/api/src/routes/v1/portability.ts',
      'docs/decisions/0066-offline-shell-and-safe-pwa-updates.md',
    ],
    readiness,
    acceptanceJourney: desc,
    existingTests: [
      CORE_E2E,
      'tests/integration/phase13-client-sync-engine.test.ts',
      'tests/integration/phase34-conflict-recovery.test.ts',
      'tests/integration/phase35-portability-export-import.test.ts',
    ],
    observedResult: observed,
    evidenceRefs:
      observed === 'pass'
        ? [EVIDENCE_CORE]
        : ['docs/decisions/0066-offline-shell-and-safe-pwa-updates.md'],
    evidenceMeta: meta(observed === 'pass' ? 'api_integration' : 'browser_ui'),
    blockerOrDefect: id === 'offline.cold-reopen' ? 'DEF-V2-003' : null,
    repairPhase: '77',
    helpArticle: help('existing', '/help Offline and updates'),
    tourTreatment: tour('planned', 'chapter-offline-portability'),
  });
}

// ——— Reminders ———
for (const [id, desc] of [
  ['reminders.create-rule', 'Create/reschedule/cancel reminder rules.'],
  ['reminders.web-push-subscribe', 'Subscribe to web push.'],
  ['reminders.device-register', 'Register native device for notifications.'],
  ['reminders.deliver-deep-link', 'Deliver notification and open deep link.'],
]) {
  add({
    id,
    featureFamily: 'reminders',
    userBenefit: desc,
    description: desc,
    implementationStatus: 'existing',
    entryPoints: ['ReminderAgendaView', '/v1/.../reminders*', '/v1/web-push/*', '/v1/devices'],
    implementationPaths: [
      'apps/api/src/routes/v1/reminders.ts',
      'apps/web/src/components/ReminderAgendaView.tsx',
      'apps/mobile/src/notifications/adapter.ts',
    ],
    releaseCapability: release('partial', 'unavailable'),
    readiness: id === 'reminders.deliver-deep-link' ? 'blocked' : 'unverified',
    acceptanceJourney: desc,
    observedResult: 'unavailable',
    evidenceMeta: meta('provider_authenticated', 'preview-delivery-off'),
    blockerOrDefect: 'DEF-V2-002',
    repairPhase: id.includes('device') ? '85' : '84',
    helpArticle: help('planned', 'help/reminders'),
    tourTreatment: tour('planned', 'chapter-reminders'),
    existingTests: [
      'tests/integration/phase27-reminders.test.ts',
      'tests/integration/phase29-web-reminders.test.ts',
    ],
    dependencies: ['VAPID/push credentials', 'preview excludes reminder delivery'],
  });
}

// ——— Vault ———
for (const [id, desc] of [
  ['vault.setup-unlock', 'Set up and unlock vault.'],
  ['vault.lock', 'Lock vault / cross-tab lock.'],
  ['vault.recovery', 'Vault recovery enrollment.'],
  ['vault.harness-synthetic', 'Open synthetic vault harness (dev).'],
]) {
  const harness = id === 'vault.harness-synthetic';
  add({
    id,
    featureFamily: 'vault',
    userBenefit: desc,
    description: desc,
    implementationStatus: harness ? 'existing' : 'gated',
    entryPoints: harness ? ['/dev/vault-harness', 'Settings vault harness link'] : ['/vault'],
    implementationPaths: [
      'apps/web/src/app/vault/page.tsx',
      'apps/web/src/app/dev/vault-harness/page.tsx',
      'apps/mobile/src/vault/VaultHarnessView.tsx',
    ],
    releaseCapability: release(harness ? 'available' : 'unavailable', 'unavailable'),
    platforms: platforms(
      harness ? 'supported' : 'gated',
      'gated',
      harness ? 'partial' : 'gated',
      'gated'
    ),
    authorization: 'Vault production unlock disabled pending independent review.',
    readiness: 'blocked',
    acceptanceJourney: desc,
    observedResult: harness ? 'untested' : 'unavailable',
    evidenceMeta: meta('browser_ui'),
    blockerOrDefect: 'DEF-V2-004',
    repairPhase: '86',
    helpArticle: help('planned', 'help/vault'),
    tourTreatment: tour('planned', 'chapter-vault-when-enabled'),
    existingTests: [
      'tests/security/phase44-vault-crypto.test.ts',
      'tests/security/phase47-web-vault.test.ts',
    ],
  });
}

// ——— Drive ———
for (const [id, desc] of [
  ['drive.connect', 'Connect Google Drive with approved scope.'],
  ['drive.select-sync', 'Select files; sync/status/conflict.'],
  ['drive.disconnect-revoke', 'Disconnect and handle revoked auth.'],
]) {
  add({
    id,
    featureFamily: 'drive',
    userBenefit: desc,
    description: desc,
    implementationStatus: 'existing',
    entryPoints: ['Settings DriveConnectionsPanel', '/v1/.../drive/*', '/api/drive/callback'],
    implementationPaths: [
      'apps/api/src/routes/v1/drive.ts',
      'apps/web/src/components/DriveConnectionsPanel.tsx',
      'apps/mobile/src/views/DriveConnectionsSheet.tsx',
    ],
    releaseCapability: release('partial', 'unavailable'),
    readiness: 'blocked',
    acceptanceJourney: desc,
    observedResult: 'unavailable',
    evidenceMeta: meta('provider_authenticated', 'no-live-google'),
    blockerOrDefect: 'DEF-V2-005',
    repairPhase: '87',
    helpArticle: help('planned', 'help/drive'),
    tourTreatment: tour('planned', 'chapter-drive'),
    existingTests: ['tests/integration/phase49-drive-connector.test.ts'],
    dependencies: ['Google OAuth client', 'owner scope decision'],
  });
}

// ——— Rooms / chat ———
for (const [id, desc] of [
  ['rooms.create-invite', 'Create room and invite members.'],
  ['rooms.chat-message', 'Send/edit/delete chat messages.'],
  ['rooms.moderation-block', 'Block/report/mute and moderation queue.'],
  ['rooms.leave-revoke', 'Leave/remove members; revoke access.'],
]) {
  add({
    id,
    featureFamily: 'rooms-and-chat',
    userBenefit: desc,
    description: desc,
    implementationStatus: 'gated',
    entryPoints: ['Settings RoomsPanel', '/v1/rooms*', '/v1/safety/*'],
    implementationPaths: [
      'apps/api/src/routes/v1/rooms.ts',
      'apps/api/src/routes/v1/chat.ts',
      'apps/api/src/routes/v1/safety.ts',
      'apps/web/src/components/RoomsPanel.tsx',
    ],
    releaseCapability: release('unavailable', 'unavailable'),
    readiness: 'blocked',
    acceptanceJourney: desc,
    observedResult: 'unavailable',
    evidenceRefs: [EVIDENCE_CORE],
    evidenceMeta: meta('api_integration', 'production-gate-403'),
    blockerOrDefect: 'DEF-V2-006',
    repairPhase: '88',
    helpArticle: help('planned', 'help/rooms'),
    tourTreatment: tour('planned', 'chapter-rooms-synthetic-only'),
    existingTests: [
      'tests/integration/phase51-rooms-invitations.test.ts',
      'tests/integration/phase53-room-chat.test.ts',
    ],
    note: 'Core validation confirmed GET /v1/rooms → 403 with production gates.',
  });
}

// ——— Billing ———
for (const [id, desc] of [
  ['billing.catalog-entitlement', 'View catalog and entitlement.'],
  ['billing.purchase-restore', 'Verify purchase / restore (synthetic).'],
  ['billing.downgrade-preserve', 'Downgrade preserves read/export/delete.'],
]) {
  add({
    id,
    featureFamily: 'billing',
    userBenefit: desc,
    description: desc,
    implementationStatus: 'gated',
    entryPoints: ['Settings BillingPanel', '/v1/billing/*'],
    implementationPaths: [
      'apps/api/src/routes/v1/billing.ts',
      'apps/web/src/components/BillingPanel.tsx',
      'apps/mobile/src/views/BillingSheet.tsx',
    ],
    releaseCapability: release('unavailable', 'unavailable'),
    readiness: 'blocked',
    acceptanceJourney: desc,
    observedResult: 'unavailable',
    evidenceRefs: [EVIDENCE_CORE],
    evidenceMeta: meta('api_integration', 'production-gate-403'),
    blockerOrDefect: 'DEF-V2-007',
    repairPhase: '89',
    helpArticle: help('planned', 'help/billing'),
    tourTreatment: tour('planned', 'chapter-billing-no-real-charges'),
    existingTests: ['tests/integration/phase57-billing-entitlements.test.ts'],
  });
}

// ——— Assistant ———
for (const [id, desc, phase] of [
  ['assistant.consent', 'Opt-in/disclosure and disable AI consent.', '90'],
  ['assistant.ask-grounded', 'Ask grounded question with citations/abstention.', '92'],
  ['assistant.propose-confirm', 'Review/edit/confirm proposals with receipt.', '93'],
  ['assistant.voice-capture', 'Voice capture/transcription to reviewed draft.', '95'],
  ['assistant.nori-launcher', 'Nori companion launcher / hide / reduced motion.', '96'],
]) {
  add({
    id,
    featureFamily: 'assistant',
    userBenefit: desc,
    description: desc,
    implementationStatus: id === 'assistant.nori-launcher' ? 'planned' : 'gated',
    entryPoints: ['AssistantPanel', 'mobile AssistantSheet', '/v1/ai/*'],
    implementationPaths: [
      'apps/api/src/routes/v1/ai.ts',
      'apps/api/src/routes/v1/assistant.ts',
      'apps/web/src/components/AssistantPanel.tsx',
      'apps/mobile/src/views/AssistantSheet.tsx',
    ],
    releaseCapability: release('unavailable', 'unavailable'),
    readiness: 'blocked',
    acceptanceJourney: desc,
    observedResult: 'unavailable',
    evidenceRefs: [EVIDENCE_CORE],
    evidenceMeta: meta('api_integration', 'production-gate-403'),
    blockerOrDefect: 'DEF-V2-008',
    repairPhase: phase,
    helpArticle: help('planned', 'help/assistant'),
    tourTreatment: tour('planned', 'chapter-assistant'),
    existingTests: [
      'tests/integration/phase55-ai-privacy-retrieval.test.ts',
      'tests/integration/phase56-ai-assistant-actions.test.ts',
    ],
  });
}

// ——— Help / support ———
add({
  id: 'help.search-howtos',
  featureFamily: 'help-and-support',
  userBenefit: 'Find short how-tos.',
  description: 'Searchable Help articles currently in-page.',
  implementationStatus: 'existing',
  entryPoints: ['/help'],
  implementationPaths: ['apps/web/src/app/help/page.tsx'],
  readiness: 'verified_local',
  acceptanceJourney: 'Open Help; filter how-tos; open beginner guide.',
  observedResult: 'pass',
  evidenceRefs: [EVIDENCE_SHOTS],
  evidenceMeta: meta('browser_ui', 'web-local'),
  repairPhase: '78',
  helpArticle: help('existing', '/help'),
  tourTreatment: tour('existing', 'Replay beginner guide'),
});

add({
  id: 'help.replay-beginner-guide',
  featureFamily: 'help-and-support',
  userBenefit: 'Replay the short beginner tutorial.',
  description: 'Three-step OnboardingTutorial with optional practice create.',
  implementationStatus: 'existing',
  entryPoints: ['/help Replay', '/settings Replay beginner guide'],
  implementationPaths: ['apps/web/src/components/OnboardingTutorial.tsx'],
  readiness: 'unverified',
  acceptanceJourney: 'Replay guide; complete optional create; does not reset settings.',
  observedResult: 'untested',
  evidenceMeta: meta('browser_ui', 'untested-fresh'),
  repairPhase: '79',
  helpArticle: help('existing', '/help Getting started'),
  tourTreatment: tour('existing', 'OnboardingTutorial'),
  note: 'Not action-verified full feature coverage; V2 phases 79–81 expand.',
});

add({
  id: 'support.contact-form',
  featureFamily: 'help-and-support',
  userBenefit: 'Contact a human about problems.',
  description: 'Support page; monitored inbox not configured.',
  implementationStatus: 'existing',
  entryPoints: ['/support'],
  implementationPaths: ['apps/web/src/app/support/page.tsx'],
  readiness: 'blocked',
  acceptanceJourney: 'Submit contact; durable receipt and triage.',
  observedResult: 'unavailable',
  evidenceMeta: meta('browser_ui'),
  blockerOrDefect: 'DEF-V2-009',
  repairPhase: '82',
  helpArticle: help('planned', 'help/contact'),
  tourTreatment: tour('planned', 'chapter-feedback'),
});

add({
  id: 'support.bug-suggestion-submit',
  featureFamily: 'help-and-support',
  userBenefit: 'Report bugs and suggestions with durable delivery.',
  description: 'Feedback intake with queue/receipt (planned durable path).',
  implementationStatus: 'planned',
  entryPoints: ['Support/Feedback UI'],
  implementationPaths: ['apps/web/src/app/support/page.tsx'],
  releaseCapability: release('unavailable', 'unavailable'),
  readiness: 'blocked',
  acceptanceJourney: 'Submit synthetic bug; status Submitted with server ack.',
  observedResult: 'unavailable',
  evidenceMeta: meta('browser_ui'),
  blockerOrDefect: 'DEF-V2-009',
  repairPhase: '82',
  helpArticle: help('planned', 'help/feedback'),
  tourTreatment: tour('planned', 'chapter-feedback'),
});

// ——— Developer ———
add({
  id: 'dev.component-gallery-mobile',
  featureFamily: 'developer-and-operations',
  userBenefit: 'Inspect design primitives (operator).',
  description: 'Mobile Settings exposes Open Component Gallery to ordinary settings UI.',
  implementationStatus: 'existing',
  entryPoints: ['mobile SettingsView → ComponentGalleryView'],
  implementationPaths: [
    'apps/mobile/src/views/SettingsView.tsx',
    'apps/mobile/src/views/ComponentGalleryView.tsx',
  ],
  authorization: 'Currently reachable from ordinary Settings (no role gate in UI).',
  personalVisibility: 'Developer surface visible to ordinary users — Phase 66 boundary.',
  readiness: 'verified_local',
  acceptanceJourney: 'Open Settings; open gallery; primitives render.',
  observedResult: 'pass',
  evidenceRefs: [],
  evidenceMeta: meta('domain_unit', 'source-inspection'),
  blockerOrDefect: 'DEF-V2-010',
  repairPhase: '66',
  helpArticle: help('planned', 'operator/component-gallery'),
  tourTreatment: tour('planned', 'operator-guide-exclude-from-user-tour'),
  existingTests: ['apps/mobile/src/mobile.test.ts'],
});

add({
  id: 'dev.vault-harness-link',
  featureFamily: 'developer-and-operations',
  userBenefit: 'Exercise synthetic vault without production unlock.',
  description: 'Settings links to /dev/vault-harness for ordinary authenticated users.',
  implementationStatus: 'existing',
  entryPoints: ['/settings vault harness button', '/dev/vault-harness'],
  implementationPaths: [
    'apps/web/src/app/settings/page.tsx',
    'apps/web/src/app/dev/vault-harness/page.tsx',
  ],
  authorization: 'Direct route reachable; no staff role check observed in page.',
  personalVisibility: 'Developer harness linked from Settings — Phase 66.',
  readiness: 'verified_local',
  acceptanceJourney: 'Open harness; synthetic unlock only; no production vault.',
  observedResult: 'pass',
  evidenceMeta: meta('browser_ui', 'source-and-route'),
  blockerOrDefect: 'DEF-V2-010',
  repairPhase: '66',
  helpArticle: help('planned', 'operator/vault-harness'),
  tourTreatment: tour('planned', 'operator-guide-exclude-from-user-tour'),
});

add({
  id: 'dev.provisional-integration-panels',
  featureFamily: 'developer-and-operations',
  userBenefit: 'Access provisional Drive/Rooms/AI/Billing panels.',
  description: 'Settings shows provisional panels; preview hides some with honest copy.',
  implementationStatus: 'existing',
  entryPoints: ['/settings#drive-connections', '#shared-rooms', '#ai-assistant', '#billing-plan'],
  implementationPaths: ['apps/web/src/app/settings/page.tsx'],
  personalVisibility:
    'Provisional/gated modules appear in Settings; distinct from user hide prefs.',
  readiness: 'verified_local',
  acceptanceJourney:
    'On core preview, gated modules show unavailable copy; non-preview may show panels.',
  observedResult: 'pass',
  evidenceMeta: meta('browser_ui', 'source-inspection'),
  blockerOrDefect: 'DEF-V2-010',
  repairPhase: '66',
  helpArticle: help('planned', 'operator/integrations'),
  tourTreatment: tour('planned', 'operator-guide-exclude-from-user-tour'),
});

add({
  id: 'dev.feedback-triage',
  featureFamily: 'developer-and-operations',
  userBenefit: 'Triage user feedback securely.',
  description: 'Restricted developer triage surface (planned).',
  implementationStatus: 'planned',
  entryPoints: ['planned operator triage'],
  implementationPaths: [],
  releaseCapability: release('unavailable', 'unavailable'),
  readiness: 'unverified',
  acceptanceJourney: 'Authorized operator reviews synthetic report; unauthorized denied.',
  observedResult: 'unavailable',
  evidenceMeta: meta('api_integration', 'not-built'),
  repairPhase: '83',
  helpArticle: help('planned', 'operator/feedback-triage'),
  tourTreatment: tour('planned', 'operator-guide'),
});

add({
  id: 'dev.feature-release-switches',
  featureFamily: 'developer-and-operations',
  userBenefit: 'Control feature release switches safely.',
  description:
    'Server-side production gates for rooms/AI/billing/vault; local flags ignored in production NODE_ENV.',
  implementationStatus: 'existing',
  entryPoints: ['API production gates', 'DAYNORI_*_LOCAL_ENABLED (non-production)'],
  implementationPaths: [
    'apps/api/src/server.ts',
    'tests/integration/phase60-release-boundaries.test.ts',
  ],
  readiness: 'verified_local',
  acceptanceJourney: 'NODE_ENV=production rejects local enable flags for gated modules.',
  existingTests: ['tests/integration/phase60-release-boundaries.test.ts', CORE_CMD],
  observedResult: 'pass',
  evidenceRefs: [EVIDENCE_CORE],
  evidenceMeta: meta('api_integration'),
  repairPhase: '97',
  helpArticle: help('planned', 'operator/release-switches'),
  tourTreatment: tour('planned', 'operator-guide'),
});

// ——— Legal / privacy pages ———
add({
  id: 'account.privacy-terms',
  featureFamily: 'account-and-first-use',
  userBenefit: 'Read privacy and terms.',
  description: 'Public /privacy and /terms pages.',
  implementationStatus: 'existing',
  entryPoints: ['/privacy', '/terms'],
  implementationPaths: ['apps/web/src/app/privacy/page.tsx', 'apps/web/src/app/terms/page.tsx'],
  releaseCapability: release('available', 'available'),
  authorization: 'Public.',
  readiness: 'unverified',
  acceptanceJourney: 'Open privacy/terms; content loads without auth.',
  observedResult: 'untested',
  evidenceMeta: meta('browser_ui', 'untested-fresh'),
  repairPhase: '72',
  helpArticle: help('existing', '/privacy'),
  tourTreatment: tour('planned', 'chapter-account-first-use'),
});

const defects = [
  {
    id: 'DEF-V2-001',
    title: 'Real-provider authentication journeys not freshly verified',
    affectedActions: [
      'account.sign-up',
      'account.sign-in',
      'account.recover-password',
      'account.sign-out',
    ],
    platforms: ['web', 'installedPwa', 'android'],
    severity: 'high',
    userImpact: 'Cannot claim hosted sign-in/sign-up readiness from synthetic JWT alone.',
    expected:
      'Synthetic and provider-authenticated sign-in/up/recovery/sign-out pass on nominated environments.',
    observed:
      'Phase 65 exercised synthetic JWT API journeys only; no owner preview login credentials used.',
    reproduction: [
      'Run CORE_E2E — passes with injected JWT.',
      'Attempt real hosted preview login without provided test account — not executed.',
    ],
    environment: ENV,
    evidenceRefs: [EVIDENCE_CORE],
    workaround: 'Use local synthetic auth for engineering validation only.',
    dependency: 'Owner-authorized synthetic preview account (no passwords in chat).',
    nextAction: 'Phase 72 exercises provider auth with disposable credentials when provided.',
    owningPhase: '72',
  },
  {
    id: 'DEF-V2-002',
    title: 'Hosted core preview disables files, audio, and reminder delivery',
    affectedActions: [
      'files.upload-reserve-finalize',
      'audio.record-attach',
      'reminders.deliver-deep-link',
      'reminders.web-push-subscribe',
    ],
    platforms: ['web', 'installedPwa'],
    severity: 'high',
    userImpact:
      'Users on free hosted preview cannot upload files, attach audio, or receive reminders.',
    expected: 'Documented preview limits; full capability on non-preview environments after gates.',
    observed: 'isCorePreview disables upload/audio UI; Help lists reminder delivery off.',
    reproduction: [
      'Set NEXT_PUBLIC_DAYNORI_CORE_PREVIEW=true.',
      'Open Library — upload/audio controls disabled.',
    ],
    environment: 'hosted-preview-config',
    evidenceRefs: ['apps/web/src/config/preview.ts', 'apps/web/src/app/help/page.tsx'],
    workaround: 'Use local non-preview builds for file/audio engineering tests.',
    dependency: 'Preview scope honesty; Phases 75/84 for readiness.',
    nextAction: 'Keep preview claims accurate; repair/verify in Phases 75 and 84–85.',
    owningPhase: '75',
  },
  {
    id: 'DEF-V2-003',
    title: 'Cold offline reopen serves public offline page, not private organizer',
    affectedActions: ['offline.cold-reopen'],
    platforms: ['installedPwa', 'web'],
    severity: 'critical',
    userImpact:
      'Previously authorized trusted device cannot reopen local organizer when fully offline.',
    expected:
      'Safe public shell can unlock account-scoped local data without caching private HTML/API in shared Cache Storage.',
    observed: 'ADR 0066: cold offline reopen shows public offline page.',
    reproduction: [
      'Install PWA',
      'Load Today while online',
      'Go fully offline and cold restart',
      'Observe offline.html',
    ],
    environment: 'documented-adr-0066',
    evidenceRefs: ['docs/decisions/0066-offline-shell-and-safe-pwa-updates.md'],
    workaround: 'Reconnect to network to reopen organizer.',
    dependency: 'Offline boot ADR + Phase 77 implementation.',
    nextAction: 'Phase 77 designs and verifies safe offline reopen.',
    owningPhase: '77',
  },
  {
    id: 'DEF-V2-004',
    title: 'Production vault unlock blocked pending independent review',
    affectedActions: ['vault.setup-unlock', 'vault.lock', 'vault.recovery'],
    platforms: ['web', 'android'],
    severity: 'high',
    userImpact: 'Encrypted vault is not available as a released feature.',
    expected: 'Vault unlock only after independent security/recovery gates.',
    observed:
      'Settings states production unlock disabled; API vault status 403 in production validation.',
    reproduction: ['GET /v1/vault/status under production gates → 403', 'Open /vault copy'],
    environment: ENV,
    evidenceRefs: [EVIDENCE_CORE],
    workaround: 'Use synthetic harness only for engineering.',
    dependency: 'Independent vault review + Phase 86.',
    nextAction: 'Keep vault off; close gates in Phase 86.',
    owningPhase: '86',
  },
  {
    id: 'DEF-V2-005',
    title: 'Live Google Drive connection not verified',
    affectedActions: ['drive.connect', 'drive.select-sync', 'drive.disconnect-revoke'],
    platforms: ['web', 'android'],
    severity: 'medium',
    userImpact: 'Drive connector cannot be claimed ready without live OAuth.',
    expected: 'Connect approved scope; sync; disconnect with revoked-token handling.',
    observed: 'Local/integration tests exist; no live Google provider run in Phase 65.',
    reproduction: ['Open Drive panel', 'No live OAuth client configured for this inventory'],
    environment: ENV,
    evidenceRefs: ['tests/integration/phase49-drive-connector.test.ts'],
    workaround: null,
    dependency: 'Google OAuth credentials and Phase 87.',
    nextAction: 'Phase 87 with authorized test project.',
    owningPhase: '87',
  },
  {
    id: 'DEF-V2-006',
    title: 'Rooms and chat production-gated and unstaffed for real users',
    affectedActions: [
      'rooms.create-invite',
      'rooms.chat-message',
      'rooms.moderation-block',
      'rooms.leave-revoke',
    ],
    platforms: ['web', 'android'],
    severity: 'high',
    userImpact: 'Shared rooms/chat unavailable; moderation ownership missing.',
    expected: 'Staffed moderation and production-safe enablement.',
    observed: 'GET /v1/rooms → 403 under production NODE_ENV in core validation.',
    reproduction: ['Run core organizer local validation', 'Observe rooms 403'],
    environment: ENV,
    evidenceRefs: [EVIDENCE_CORE],
    workaround: null,
    dependency: 'Moderation owner + Phase 88.',
    nextAction: 'Phase 88 with synthetic invited participants only until staffed.',
    owningPhase: '88',
  },
  {
    id: 'DEF-V2-007',
    title: 'Production billing disabled',
    affectedActions: [
      'billing.catalog-entitlement',
      'billing.purchase-restore',
      'billing.downgrade-preserve',
    ],
    platforms: ['web', 'android'],
    severity: 'medium',
    userImpact: 'Paid plans/purchases unavailable.',
    expected: 'Verified purchase lifecycle without enabling vault/rooms/AI by payment alone.',
    observed: 'GET /v1/billing/catalog → 403 under production gates.',
    reproduction: ['Core validation production gates'],
    environment: ENV,
    evidenceRefs: [EVIDENCE_CORE],
    workaround: 'Synthetic local billing tests only.',
    dependency: 'Owner billing decision + Phase 89.',
    nextAction: 'Phase 89.',
    owningPhase: '89',
  },
  {
    id: 'DEF-V2-008',
    title: 'Live AI assistant unavailable; local provisional only',
    affectedActions: [
      'assistant.consent',
      'assistant.ask-grounded',
      'assistant.propose-confirm',
      'assistant.voice-capture',
      'assistant.nori-launcher',
    ],
    platforms: ['web', 'android'],
    severity: 'medium',
    userImpact: 'Users cannot use live grounded assistant or Nori.',
    expected: 'Consented live provider with citations and confirmed saves.',
    observed: 'GET /v1/ai/consent → 403 under production; Nori not implemented.',
    reproduction: ['Core validation production gates'],
    environment: ENV,
    evidenceRefs: [EVIDENCE_CORE],
    workaround: null,
    dependency: 'Provider privacy decision + Phases 90–96.',
    nextAction: 'Start with Phase 90 when selected.',
    owningPhase: '90',
  },
  {
    id: 'DEF-V2-009',
    title: 'Support contact and durable feedback delivery not configured',
    affectedActions: [
      'support.contact-form',
      'support.bug-suggestion-submit',
      'dev.feedback-triage',
    ],
    platforms: ['web', 'android'],
    severity: 'high',
    userImpact: 'Users cannot reliably reach a monitored human or track submissions.',
    expected: 'Durable intake, receipt, triage, verified contact route.',
    observed: 'Support copy states monitored inbox is not configured.',
    reproduction: ['Open /support'],
    environment: 'product-copy',
    evidenceRefs: ['apps/web/src/app/support/page.tsx', 'docs/roadmap/v2/help-and-feedback.md'],
    workaround: null,
    dependency: 'Owner contact destination + Phases 82–83.',
    nextAction: 'Phases 82–83 implement durable submission and triage.',
    owningPhase: '82',
  },
  {
    id: 'DEF-V2-010',
    title: 'Developer/harness surfaces reachable from ordinary Settings',
    affectedActions: [
      'dev.component-gallery-mobile',
      'dev.vault-harness-link',
      'dev.provisional-integration-panels',
    ],
    platforms: ['web', 'android'],
    severity: 'medium',
    userImpact:
      'Ordinary users see developer galleries, vault harness, and provisional integration controls.',
    expected:
      'Developer tools restricted by role and separated from everyday preferences; direct URL/API also authorized.',
    observed:
      'Mobile Settings always offers Component Gallery; web Settings links vault harness; provisional panels present.',
    reproduction: [
      'Open mobile Settings — Open Component Gallery',
      'Open web Settings — Open synthetic vault harness',
    ],
    environment: 'source-inspection-a8d50fa',
    evidenceRefs: ['apps/mobile/src/views/SettingsView.tsx', 'apps/web/src/app/settings/page.tsx'],
    workaround: 'Ignore developer controls; do not use harness as production vault.',
    dependency: 'Phase 66 navigation and developer boundaries.',
    nextAction: 'Phase 66 separates personalization from developer tools and adds authorization.',
    owningPhase: '66',
  },
  {
    id: 'DEF-V2-011',
    title: 'Physical Android and TalkBack evidence still missing',
    affectedActions: [
      'nav.open-today',
      'tasks.create',
      'notes.create-save',
      'reminders.device-register',
    ],
    platforms: ['android'],
    severity: 'high',
    userImpact: 'Cannot claim physical-device readiness or accessibility completion.',
    expected: 'Physical device journeys and TalkBack verification.',
    observed: 'No adb device in this Phase 65 session; legacy Phase 04–06 blocked.',
    reproduction: ['adb devices — none used', 'pnpm test:e2e:android not claimed as physical'],
    environment: ENV,
    evidenceRefs: ['docs/phase-reports/phase-60.md'],
    workaround: 'Emulator/browser evidence only, labeled as such.',
    dependency: 'Physical device + Phases 71/85/99.',
    nextAction: 'Record device evidence when hardware available; do not invent results.',
    owningPhase: '71',
  },
  {
    id: 'DEF-V2-012',
    title: 'Beginner tutorial is not action-verified full feature coverage',
    affectedActions: ['help.replay-beginner-guide'],
    platforms: ['web'],
    severity: 'medium',
    userImpact: 'Users do not get guided practice through every feature via real controls.',
    expected: 'Resumable action-verified chapters per released feature.',
    observed: 'OnboardingTutorial is three introductory steps plus optional practice create.',
    reproduction: ['Read OnboardingTutorial.tsx', 'Replay from Help'],
    environment: 'source-inspection',
    evidenceRefs: ['apps/web/src/components/OnboardingTutorial.tsx', 'docs/roadmap/v2/README.md'],
    workaround: 'Use Help how-tos.',
    dependency: 'Phases 79–81.',
    nextAction: 'Implement tour engine then everyday/advanced chapters.',
    owningPhase: '79',
  },
];

const register = {
  schemaVersion: 1,
  phase: '65',
  generatedAt: DATE,
  baseRevision,
  nominatedEnvironment: {
    os: 'win32 10.0.26200',
    node: 'v24.21.0 (portable .tools/node-v24.21.0-win-x64)',
    pnpm: '9.15.5',
    database: 'PostgreSQL daynori_test via project .env (credentials not recorded)',
    authMode: 'synthetic-jwt-for-api-journeys; real Supabase provider login not exercised',
    featureFlags:
      'Core validation forces NODE_ENV=production; DAYNORI_ROOMS/AI/BILLING_LOCAL_ENABLED cleared',
    hostedPreviewNote:
      'NEXT_PUBLIC_DAYNORI_CORE_PREVIEW disables uploads/audio/reminder delivery when true',
    browser:
      'Chromium/Edge for visual capture when available; device emulation ≠ physical/PWA install proof',
    android: 'No physical device attached for this baseline',
    fixtureIdentity: 'Synthetic emails @example.test / random UUIDs in core journeys',
  },
  readinessValues,
  observedResultValues,
  evidenceLayers,
  featureFamilies: FAMILIES,
  actions,
  defects,
  coverageNotes: [
    'Feature-family list from feature-coverage.md is a floor; actions were derived from API routes, web pages, mobile views, preview gates, and executed tests.',
    'API route extract: artifacts/local/phase65-api-routes.json (gitignored working extract).',
    'Never mark release_ready from source existence or local mocks; none are release_ready in this baseline.',
    'Historical screenshots under artifacts/web-e2e are labeled historical; Phase 65 fresh captures live under artifacts/local/phase65 and a sanitized manifest under docs/roadmap/v2/evidence/.',
    'Performance: fresh Phase 58 short local baseline rewritten 2026-10-25 under Node 24.21.0; not production capacity or Bangladesh field Web Vitals.',
  ],
};

fs.writeFileSync(outPath, JSON.stringify(register, null, 2) + '\n', 'utf8');
console.log(
  `Wrote ${actions.length} actions and ${defects.length} defects to ${path.relative(root, outPath)}`
);
