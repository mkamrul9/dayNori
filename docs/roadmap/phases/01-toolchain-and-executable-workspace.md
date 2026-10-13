# Phase 01 — Toolchain and executable workspace

Group: Foundation and sync. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [00 — Product and architecture baseline](00-product-and-architecture-baseline.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- package.json
- pnpm-workspace.yaml
- apps
- packages
- scripts

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Pin a supported Node LTS and pnpm version; select an Expo SDK and compatible React/React Native versions, then validate Next.js package boundaries.
2. Replace reserved application READMEs with minimal runnable mobile, web, API, and worker workspaces and real package manifests.
3. Add strict shared TypeScript configuration, formatting, linting, and documented development commands without adding product features.

## Acceptance

- A clean clone installs using the committed lockfile and documented commands.
- Web and API smoke routes run; the mobile shell builds in an Expo development build.
- Root lint, typecheck, test, and build commands exist and fail on intentional errors.

## Verification and evidence

- Run clean install, lint, typecheck, available smoke tests, and each workspace build.
- Record Windows development behavior and any Android SDK/device prerequisites.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/engineering/repository-layout.md](../../engineering/repository-layout.md)
- [docs/engineering/quality.md](../../engineering/quality.md)
- [docs/decisions/README.md](../../decisions/README.md)

## Commit target

`chore(workspace): establish typed application and package toolchains`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
