# Phase NN: Title

Copy this file to `docs/phase-reports/phase-NN.md`. Replace every placeholder and remove instructions. Do not copy sample results as evidence.

## Identity and scope

- Phase ID/specification: NN and relative link.
- Status: planned / in_progress / blocked / complete, using the roadmap's actual schema.
- Contributor and report date: name/agent and YYYY-MM-DD.
- Base Git revision and branch: actual values before work.
- Prerequisites: IDs, report links and verified evidence.
- Included scope: concrete behavior and paths.
- Excluded/deferred scope: deliberate boundaries and linked follow-up phase.

## Result

Describe the delivered behavior and why it matters. State what remains proposed. List changed public contracts, migration/data implications and design/ADR decisions. Include screenshots only when captured from the actual result with synthetic data and platform/version identified.

## Acceptance evidence

For each acceptance condition, name the condition, check method, artifact/log location and result. Include negative/retry/authorization/accessibility checks relevant to the phase. A passing build does not satisfy unrelated conditions.

For each command actually run, record:

- Exact command and working directory.
- Tool/runtime version and environment/service fixtures.
- Execution date, exit code and concise observed result.
- Evidence file or output location, excluding secrets/private content.

For manual checks, record platform/device/browser/build version, synthetic scenario, steps, expected outcome, observed outcome and evidence. For performance checks, record dataset, workload/concurrency, hardware/network, sample count and percentiles. Label skipped/blocked checks and their impact explicitly.

## Defects, limitations and recovery

Link defects and unresolved risks. Describe migration rollback or forward-fix steps, feature-flag behavior, and handling of pending local data. Do not call incomplete required evidence a harmless limitation. State exactly what would unblock remaining work.

## Documentation and Git review

- Updated product/architecture/design/setup documentation: links.
- ADRs: links, or none with rationale.
- CHANGELOG.md and progress.json: updated consistently.
- `git diff --check`: actual result.
- Complete and staged diff review: actual paths reviewed, secret/fixture check result.
- Intended conventional commit subject: final behavior-focused subject.

The phase commit itself contains this report. Do not fabricate its future hash or create a second commit merely to insert it; use Git history to identify the completed phase commit.

## Handoff

If complete, state the next eligible phase and its prerequisites, then stop. If incomplete, give the exact next action, remaining checks and dependency; keep progress incomplete. Include setup facts another contributor needs without conversation history.
