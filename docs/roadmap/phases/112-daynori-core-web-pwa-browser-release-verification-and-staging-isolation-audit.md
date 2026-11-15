# Phase 112 — Daynori core web/PWA browser release verification and staging isolation audit

Group: V2 quality and release. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [104 — Current Daynori web/PWA readiness audit and critical core fixes](104-current-daynori-web-pwa-readiness-audit-and-critical-core-fixes.md)
- [111 — Daynori web/PWA design verification and theme capture correction](111-daynori-web-pwa-design-verification-and-theme-capture-correction.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/api
- apps/web
- packages/api-client
- scripts
- tests
- docs/decisions
- docs/roadmap
- docs/phase-reports
- artifacts/phase112
- CHANGELOG.md

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Establish isolated local staging infrastructure comprising PostgreSQL daynori_test (80 applied migrations), Synthetic RS256 Auth Provider on port 54321, Fastify API on port 3114 with MemoryStorageProvider and PolicyMalwareScanner, production Next.js PWA server on port 3116, and Headless Chrome CDP on port 9232.
2. Remediate Fastify ZodError handling in apps/api/src/plugins/errorHandler.ts to catch cross-package Zod instances, preventing 500 internal crashes and returning structured HTTP 400 Bad Request responses.
3. Expose recoverPassword and provisionPersonalWorkspace on window.__daynoriAuth in apps/web/src/components/AuthContext.tsx to facilitate automated browser DOM auth verification.
4. Execute 10 end-to-end browser journeys via scripts/run-phase112-staging-release-verification.mjs covering auth lifecycle, two-account isolation, CRUD, search, attachments scope, PWA offline reopen, concurrency conflicts (409), deletion/export, Help/support triage, and failure/gating.
5. Assert isolation at UI, API (404), and Database SQL boundaries (zero cross-tenant note leakage, 80 schema migrations).
6. Capture full-page PNG screenshots for all 10 journeys in artifacts/phase112/screenshots/ with SHA-256 checksums.
7. Author ADR 0112, Phase 112 report, evidence-summary.json, staging-release-verification.json, and tests/e2e/phase112-browser-release-verification.test.ts.

## Acceptance

- All 10 production-style browser journeys pass cleanly against isolated staging topology.
- Database SQL isolation assertions confirm 0 cross-tenant records visible across Alice and Bob workspaces.
- PWA cold offline reopen via CDP network emulation verifies offline shell asset loading and offline indicator.
- Optimistic concurrency conflict detection enforces HTTP 409 REVISION_CONFLICT on stale revision updates.
- All 10 journey screenshots exist in artifacts/phase112/screenshots/ with valid SHA-256 hashes.
- Standing release gates (DEF-V2-001, DEF-V2-004, DEF-V2-005, DEF-V2-007, DEF-V2-008, DEF-V2-011, DEF-V2-013, OWNER-SIGNING-KEYS, OWNER-RELEASE-AUTH, Phase 71) remain strictly blocked.
- Automated tests in tests/e2e/phase112-browser-release-verification.test.ts pass cleanly.
- docs/roadmap/plan.json, progress.json, and blueprint.html updated and pass all planning validators.

## Verification and evidence

- node scripts/validate-planning.mjs
- node scripts/build-phase-plans.mjs --check
- node scripts/build-blueprint.mjs --check
- pnpm validate:function-register
- pnpm vitest run tests/e2e/phase112-browser-release-verification.test.ts
- pnpm --filter @daynori/api typecheck
- pnpm --filter @daynori/web typecheck
- pnpm lint

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/roadmap/v2/README.md](../v2/README.md)
- [docs/decisions/0074-standing-phase71-scheduling-and-push.md](../../decisions/0074-standing-phase71-scheduling-and-push.md)
- [docs/decisions/0104-current-web-pwa-readiness-audit-and-critical-core-fixes.md](../../decisions/0104-current-web-pwa-readiness-audit-and-critical-core-fixes.md)
- [docs/decisions/0111-web-pwa-design-verification-and-theme-capture-correction.md](../../decisions/0111-web-pwa-design-verification-and-theme-capture-correction.md)
- [docs/decisions/0112-core-web-pwa-browser-release-verification-and-staging-isolation.md](../../decisions/0112-core-web-pwa-browser-release-verification-and-staging-isolation.md)
- [docs/phase-reports/phase-104.md](../../phase-reports/phase-104.md)
- [docs/phase-reports/phase-111.md](../../phase-reports/phase-111.md)
- [docs/phase-reports/phase-112.md](../../phase-reports/phase-112.md)
- [docs/engineering/release-gates.md](../../engineering/release-gates.md)

## Commit target

`test(release): verify core web pwa release journeys against isolated staging`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
