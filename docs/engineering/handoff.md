# Contributor handoff

This repository must be understandable without the original chat. Phase 01 established the runnable monorepo toolchain, applications, and packages. This recipe applies to Antigravity, another coding agent, and a human contributor.

## Begin a session

1. Read [README](../../README.md), [AGENTS](../../AGENTS.md), [Contributing](../../CONTRIBUTING.md), the [documentation index](../README.md), and the [roadmap](../roadmap/README.md).
2. Inspect `git status --short`, `git branch --show-current`, and recent commits. Preserve unrelated edits; identify an existing phase in progress before choosing another.
3. Read [progress.json](../roadmap/progress.json) and [plan.json](../roadmap/plan.json). Select exactly one phase and read its full specification and linked documents. Phase 00 is planning only. Phase 01 starts implementation when selected by the owner.
4. Read every prerequisite phase report under `docs/phase-reports/`. A status flag without passing evidence is insufficient. Check that relevant migrations, contracts, credentials, platform capabilities, and test tools actually exist.
5. Read the relevant [architecture](../architecture/system-overview.md), [product rules](../product/requirements.md), [design system](../design/design-system.md), and [decision records](../decisions/README.md). Establish whether a decision is accepted, provisional, or awaiting a spike.
6. Write a short plan naming scope, files/packages, negative cases, checks, and expected commit. Record unknown prerequisites before dependent implementation. A missing account or physical device cannot be counted as a successful check.

## Work within a phase

Use the phase's acceptance scenarios as the work boundary. A phase may deliver a deliberately small vertical slice. Keep mobile and web feature semantics aligned while giving each platform its own interface. Do not complete a later module as incidental scope.

If new evidence changes a significant assumption, create an [ADR](../templates/adr.md), update affected specifications, and document the effect on future phases. Split work that no longer fits one reviewable phase before expanding it; preserve completed IDs and follow the roadmap's amendment policy. Fix a prerequisite defect in its own clearly documented scope before continuing dependent work.

Contracts are owned by shared packages; APIs validate external input, authorize current workspace membership, and reject cross-workspace references. Persisted offline drafts and pending mutations must survive errors, app restarts, and account transitions. Never substitute a UI-only guard for authorization or encryption.

No cloud provisioning, paid services, secrets, production deployment, or store submission follows automatically from selecting a scaffolding phase. Use local synthetic fixtures until the phase requires an authorized external environment. The owner will provide the GitHub destination later.

## Completion checklist

Before a phase is marked complete:

- Its deliverables and every acceptance condition are satisfied within the selected scope.
- Relevant checks from [quality](quality.md) and the phase specification ran against the final changes; failures were fixed or the phase remains incomplete.
- A report exists at `docs/phase-reports/phase-NN.md` using the [phase report template](../templates/phase-report.md). It records exact commands, exit results, environment, meaningful manual evidence, limitations, and remaining defects.
- Changed behavior, interfaces, decisions, setup steps, and migration/recovery instructions are documented. Changelog and `docs/roadmap/progress.json` agree with the report.
- No credentials, real journals, private documents, recordings, prompts, or exports enter Git or logs. Generated evidence uses synthetic data.
- `git diff --check`, the complete diff, and staged paths were reviewed. Stage only files belonging to the phase and make one local conventional commit as described in [Contributing](../../CONTRIBUTING.md).

The report and progress cannot self-reference the new commit hash before it exists. Record the current base revision and intended subject; the committed Git history is the source for the resulting commit. Future metadata updates must not create an extra completion commit solely to insert that hash.

Stop after the selected phase. Summarize delivered behavior, verified evidence, material limits, commit, and the next eligible phase. Do not start it automatically or claim that an installed tool, mock, successful build, or planned control proves release readiness.

## Verification and recovery

Phase 01 and 02 established the executable commands: `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm format:check`, `pnpm audit:secrets`, `pnpm audit:deps`, and `node scripts/validate-planning.mjs`. Read the actual root/package scripts rather than guessing commands.

If a check fails or a dependency is absent, keep the phase `in_progress` or `blocked` according to the roadmap schema. Include a reproducible defect, impact, safe next step, and what evidence would unblock it. Never discard changes, erase pending data, reset history, or force-push as an automatic recovery action. If work is interrupted, leave a partial report listing completed files, failing commands, remaining acceptance conditions, and the exact next action.

## Ready-to-use resumption prompt

> Read README.md, AGENTS.md, CONTRIBUTING.md, docs/engineering/handoff.md, docs/roadmap/README.md, and docs/roadmap/progress.json. Inspect Git status without overwriting unrelated changes. Select only the phase named by the owner, verify its dependencies from their reports, and read all linked specifications. Implement its bounded scope, run its meaningful checks, record exact evidence and limits, update its report/changelog/progress, review the staged diff, and make one local conventional commit only if the acceptance gate passes. Stop after that phase and report the next eligible work.
