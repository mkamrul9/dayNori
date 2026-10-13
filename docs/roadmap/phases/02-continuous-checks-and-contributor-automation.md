# Phase 02 — Continuous checks and contributor automation

Group: Foundation and sync. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [01 — Toolchain and executable workspace](01-toolchain-and-executable-workspace.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- .github/workflows
- .github templates
- scripts
- packages/config

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Add pull-request checks for clean install, lint, types, planning validation, tests, and relevant builds.
2. Add dependency/secret scanning with an explicit exception process and protected deployment environments.
3. Create issue and PR templates; document branch protection setup when GitHub is connected.

## Acceptance

- The workflow invokes actual scripts and grants minimal token permissions.
- A failing contract or type check blocks a hosted PR once the remote is configured.
- No deployment or billable provider account is required for contributor validation.

## Verification and evidence

- Run the workflow commands locally; inspect permissions and cache inputs.
- If a remote exists, record hosted CI run URLs; otherwise state hosted CI is pending.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [CONTRIBUTING.md](../../../CONTRIBUTING.md)
- [docs/engineering/quality.md](../../engineering/quality.md)

## Commit target

`chore(ci): enforce workspace quality and contribution checks`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
