# Phase 64: Version 2 product and delivery planning

## Identity and scope

- Phase: [64 — Version 2 product and delivery planning](../roadmap/phases/64-version-2-product-and-delivery-planning.md).
- Status: `complete` (documentation-only planning; no app readiness or release claim).
- Contributor/date: Codex, 2026-10-25, Asia/Dhaka.
- Base revision/branch: `3df5913`, `codex/free-core-preview`; initial working tree clean.
- Prerequisites: none; owner explicitly selected a new documentation-only V2 plan. [ADR 0067](../decisions/0067-version-two-planning-and-release-boundaries.md) explains independence from unfulfilled Phase 63 without claiming prior launch completion.
- Scope: V2 overview, eight supporting product/design/learning/assistant/support/notification/quality/handoff specifications, canonical appended phases and coverage, generated phase specs/blueprint, documentation entry points, progress and changelog. The blueprint generator now uses the actual phase count, starts with the V2 group, and links actual progress rather than making obsolete no-app/Phase-00-only claims.
- Outside this phase: application implementation, fresh authenticated/physical-device audit, live provider calls with user data, paid provisioning, sending feedback/contact messages, push activation, deployment, stores and implementation prompts for later phases.

## Result

The plan defines the full requested V2 experience and appends Phases 64–103. It covers every requested concern including the follow-up professional-icon/no-emoji instruction. Phase 65 inventories actual per-function readiness before dependent redesign work. Detailed specs separate web/PWA/native layout, complete resumable action-based learning, Help, real feedback delivery/developer triage, scoped RAG, confirmed creation, voice and the proposed original Nori launcher.

Sources and limits are linked in the V2 specs. Official product references and notification/accessibility/performance documentation were researched. Historical local Today/Settings screenshots were inspected and labeled historical; accessible official Things/Day One images were opened. Linear's article was read but its full-size image fetch failed. No authenticated competitor or Daynori session was tested. No existing app function is newly certified by this planning phase.

All original phase definitions/status entries remain unchanged. V1 release gates remain open. Phase 64 is planning only; Phase 65 is next eligible but implementation requires owner selection. No schema/runtime/API behavior changed.

## Acceptance evidence

- Request coverage: V2 overview and feature coverage map visual/mobile/onboarding/tours/help/support/feedback/notification/AI/voice/companion/readiness/security/performance concerns to individual phases and supporting contracts.
- Bounded handoff: each generated V2 phase has explicit prerequisites, scope, steps, acceptance, checks, references and conventional commit target. Future phase prompts are requested individually.
- Honest release state: PWA capability is distinguished from current preview delivery, fake/local AI from live provider quality, existing code from readiness, and full V2 from a smaller preview.
- Preservation: a Node assertion against `git show HEAD:...` verified deep equality of all 64 original phase definitions and status entries, the ten original groups and 24 original feature mappings. Phase 64 is the only new complete phase; all 39 later phases are planned.
- Generated artifacts: all 104 phase specifications and the local blueprint pass regeneration checks; local Markdown links and dependency/status validation pass.

## Validation

Working directory for all commands: `D:\SWE\UNIQUE WORK\dailyLIfe`. Windows PowerShell; pnpm `9.15.5`. Initial PATH Node was `v24.11.1`; pnpm emitted the repository's Node `^24.21.0` engine warning during the initial successful secret scan. Final checks use the existing portable Node `v24.21.0` by prepending `.tools\node-v24.21.0-win-x64` to this command process's PATH. No machine-wide installation or configuration changed.

Commands and observed results:

- `node scripts/build-phase-plans.mjs` — exit 0; generated 104 specs.
- `node scripts/build-blueprint.mjs` — exit 0; regenerated the local planning explorer.
- `node scripts/build-phase-plans.mjs --check` — exit 0; verified 104 specs.
- `node scripts/build-blueprint.mjs --check` — exit 0; blueprint current.
- `node --check scripts/build-blueprint.mjs` — exit 0.
- `node scripts/validate-planning.mjs` — exit 0; 104 phases, 22 mapped requirements, 351 Markdown files, local links and dependency/status checks.
- `pnpm exec prettier --check README.md CHANGELOG.md docs/README.md docs/roadmap/README.md docs/roadmap/plan.json docs/roadmap/progress.json docs/roadmap/v2 docs/decisions/README.md docs/decisions/0067-version-two-planning-and-release-boundaries.md docs/phase-reports/phase-64.md scripts/build-blueprint.mjs` — exit 0; matched files formatted.
- `pnpm audit:secrets` — exit 0; initial scan checked 6523 files, no unapproved secrets.
- `git diff --check` — exit 0.
- `git diff --cached --check`, `git diff --cached --stat`, `git diff --cached --name-only`, and `git diff --name-only` — exit 0; reviewed 60 staged planning files, including 40 new generated specs and nine V2 overview/support files. No application changes or unstaged edits. Generated content was reviewed against its canonical definitions and checked by regeneration. The final secret scan under Node `v24.21.0` also passed for 6523 files.

The preservation check was run with this PowerShell here-string, piped to Node:

```powershell
@'
import fs from 'node:fs';
import cp from 'node:child_process';
import assert from 'node:assert/strict';
const original = file => JSON.parse(cp.execFileSync('git', ['show', 'HEAD:' + file], {encoding:'utf8'}));
const plan = JSON.parse(fs.readFileSync('docs/roadmap/plan.json','utf8'));
const progress = JSON.parse(fs.readFileSync('docs/roadmap/progress.json','utf8'));
assert.deepEqual(plan.phases.slice(0,64), original('docs/roadmap/plan.json').phases);
assert.deepEqual(plan.groups.slice(0,10), original('docs/roadmap/plan.json').groups);
assert.deepEqual(plan.featureCoverage.slice(0,24), original('docs/roadmap/plan.json').featureCoverage);
assert.deepEqual(progress.phases.slice(0,64), original('docs/roadmap/progress.json').phases);
assert.equal(progress.activePhase,null);
assert.equal(progress.nextPhase,'65');
assert.equal(progress.phases.filter(p=>p.id==='64'&&p.status==='complete').length,1);
assert.equal(progress.phases.filter(p=>Number(p.id)>64&&p.status!=='planned').length,0);
console.log('PASS: original phase/group/coverage objects and all 64 original statuses preserved; V2 planning complete and 39 implementation/review phases unstarted.');
'@ | node --input-type=module
```

Result: exit 0. Source inspection and historical image review support the planning baseline only. No new application tests, performance measurements, physical device results, authenticated-save checks, live AI quality, push delivery or usability participants are claimed. This phase changes documentation and its existing generator, so application regression suites are outside the meaningful check scope.

## Limits and handoff

Name/design Nori is a proposed original direction requiring Phase 96 validation. Provider choice, retention/region, support destination/owner, moderation, vault audit, real push/storage/billing environments and physical devices remain future phase prerequisites. No credentials or private content were collected.

Intended commit: `docs(planning): define the Version 2 experience and delivery roadmap`.

Next eligible: Phase 65, function inventory and readiness baseline, only when selected. Stop after the planning commit.
