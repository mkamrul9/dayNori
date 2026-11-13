# ADR-0104: Current Web/PWA Readiness Audit and Critical Core Fixes

- Status: accepted
- Date: 2026-11-13
- Owner/reviewer: Antigravity agent (owner-authorized Phase 104).
- Related: [Phase 104](../roadmap/phases/104-current-daynori-web-pwa-readiness-audit-and-critical-core-fixes.md), [Phase 102](../roadmap/phases/102-authorized-version-2-publication-and-live-verification.md), [Phase 101](../roadmap/phases/101-version-2-release-candidate-and-operational-preparation.md), [Phase 100](../roadmap/phases/100-full-version-2-beta-and-readiness-reconciliation.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [ADR 0090](0090-ai-provider-consent-privacy-and-operating-decisions.md), [ADR 0096](0096-nori-companion-launcher-and-artwork.md), [ADR 0102](0102-authorized-version-2-publication-and-live-verification.md), [release-gates.md](../engineering/release-gates.md), [v2-authorized-publication-record.md](../release/v2-authorized-publication-record.md).
- Supersedes/superseded by: none. Preserves all outstanding prerequisite, security, hardware, and release gates.

---

## Context & Owner Authorization

Following the delivery of Phase 102 publication review records and operational rehearsals, the project owner instructed:
> "Select one new bounded phase for a current Daynori web/PWA readiness audit and critical core fixes. Read AGENTS.md, README.md, CONTRIBUTING.md, docs/engineering/handoff.md, the roadmap/progress, relevant phase reports, and linked specifications first. Preserve all existing working-tree changes.
> Test real user journeys for sign-up/sign-in, workspace isolation, note/task/routine/journal create-save-reopen, search, offline reopen and sync conflict recovery, Help, and support. Compare the current commit and dirty tree with the Phase 102 packaged candidate. Fix reproducible defects within this phase; record other defects with owners and gates. Verify that gated features, especially Ask Nori, are presented truthfully instead of looking available and then failing. Use synthetic accounts and record exact commands, browser evidence, failures, and limitations. Do not claim deployment or release readiness from local tests. Update the phase report, CHANGELOG, progress, and function register; review the diff; make one phase commit and push it under the standing repository workflow."

---

## Decisions

1. **Phase 104 Scope Definition**:
   - Establish bounded Phase 104: *Current Daynori web/PWA readiness audit and critical core fixes*.
   - Dependency edge: `dependsOn: ["102"]` under group `v2-release`.
   - Maintain standing repository workflow ([ADR 0074](0074-standing-phase71-scheduling-and-push.md)) without force-pushing.

2. **Truthful Presentation of Gated Features (`DEF-V2-008`)**:
   - In `AssistantPanel.tsx`, detect when live AI assistant and transcription capabilities are gated under `DEF-V2-008`.
   - Present a clear, polite status banner explaining that Ask Nori is currently gated pending enterprise provider authorization and privacy compliance.
   - Disable the textarea, starter suggestion pills, "Ask" submission button, and voice recorder buttons when gated, preventing user submissions from producing unhandled runtime errors (`FORBIDDEN: This module is unavailable in beta until release gate requirements are verified.`).
   - Provide direct links to AI Privacy & FAQ (`/help?article=assistant-optional`) and Privacy Settings (`/settings?group=privacy`).
   - In `AppHeader.tsx`, label the Ask Nori action with its gated status tooltip (`title="Ask Nori (Gated under DEF-V2-008)"`).

3. **Packaged Candidate Comparison**:
   - Explicitly compare the current commit (`3d65d14`) and dirty working-tree state with the Phase 102 packaged candidate (`5b5c4f8` / `539df6a`, archive `artifacts/release/daynori-web-v2.0.0-rc1.tar.gz`).
   - Document all route parameter enhancements, build fixes, strict typing, and truthful UI gating.

4. **Synthetic User Journey Audit Suite**:
   - Author a dedicated end-to-end integration and user journey suite in `tests/e2e/phase104-v2-web-pwa-audit-journeys.test.ts`.
   - Verify 8 operational journeys with synthetic accounts:
     1. Sign-up, token verification, and session authentication.
     2. Cross-workspace and multi-tenant isolation.
     3. Note, task, routine, and journal create-save-reopen.
     4. Global authorized search across items.
     5. Offline queue outbox sync and optimistic concurrency conflict recovery.
     6. Help and knowledge guide exploration.
     7. Support feedback submission and operator triage.
     8. Truthful presentation and fail-closed enforcement of gated features.

5. **Release Gate Discipline**:
   - In accordance with owner instructions and `AGENTS.md`, do not claim deployment or release readiness from local tests.
   - Keep Phase 104 status recorded as `blocked` in `docs/roadmap/progress.json` pending open external gates (`OWNER-RELEASE-AUTH`, `DEF-V2-001`, `DEF-V2-013`, `DEF-V2-008`).

---

## Consequences

- Users are presented with an honest, transparent interface where gated features are truthfully explained instead of appearing operational and failing on submission.
- Real user journeys are continuously proven through automated E2E tests using synthetic personas and real database contexts.
- Release candidate comparisons and defect registers remain rigorous, auditable, and traceable.
