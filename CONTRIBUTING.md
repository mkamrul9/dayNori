# Contributing

Start with [the handoff](docs/engineering/handoff.md), the selected [phase specification](docs/roadmap/README.md), and its prerequisite reports. The owner wants small, documented phases that another contributor can resume without conversation history.

## Work cycle

1. Inspect `git status`, the current branch, progress, and the active phase. Never overwrite unrelated changes.
2. Verify dependencies are complete. Read applicable decisions and the feature acceptance scenarios.
3. Write a short phase plan. Refine a phase if its scope no longer fits one reviewable commit; reserve new IDs without renumbering completed work.
4. Implement only that phase. Keep business rules in shared domain packages or backend modules, platform behavior behind adapters, and tests beside the behavior they verify.
5. Run the phase's checks. Add negative authorization, migration, retry, and accessibility cases where relevant. A successful build alone is insufficient evidence.
6. Write `docs/phase-reports/phase-NN.md` from [the report template](docs/templates/phase-report.md). Update affected docs, progress, and changelog. Include evidence for actual results; do not fabricate screenshots or commands.
7. Review `git diff --check`, the diff, and paths. Stage only the phase's files. Review `git diff --cached` and commit once.

If a check fails, the phase stays `in_progress` or `blocked`. A blocked individual phase is a project status, not an instruction to alter any assistant goal. Record the cause and next step. Do not mark complete to preserve a schedule.

## Commit format

Use a conventional subject: `<type>(<scope>): <concrete outcome>`. Use `docs`, `chore`, `feat`, `fix`, `refactor`, `test`, or `perf`. Keep the subject concise and explain meaningful behavior, rationale, and validation in the body when needed. Example:

```text
feat(tasks): add prioritized tasks with deadline validation

Persist tasks within the authorized workspace and reject invalid deadlines.
Document overdue behavior and preserve offline edits on retry.

Phase: 18
Validation: domain, API authorization, and web/mobile task journeys pass
```

The exact subject for each phase is a suggested template; use the final implemented behavior. Never report checks as passed if they were not run. Do not include an assistant signature or claim production readiness prematurely.

## GitHub later

Phase 00 can be committed locally. When the owner provides a URL, inspect existing remotes and the destination history, add or update the agreed remote, and push the existing commits without squashing phase history. Do not blindly force-push. CI/branch protection and PR checks are configured in Phase 02 after the destination is known. GitHub Actions workflows may be prepared before a remote exists, but hosted execution then remains unverified.

## Code and documentation

- Strict types, narrow modules, named errors, schema validation at trust boundaries, and explicit cancellation/retry paths.
- Timestamps in UTC for instants; IANA time zones and date-only fields for human calendar semantics. Never infer daily occurrence dates by truncating UTC.
- Public functions describe assumptions and failure behavior. Comments explain why unusual behavior is needed, with an issue or ADR when useful.
- Fixtures are synthetic. Logs contain operational metadata rather than note text, filenames, credentials, vault data, or prompts.
- Changes to persistence have migrations, rollout/rollback or forward-fix instructions, and upgrade fixtures.
- Documentation uses relative local links, states what is proposed versus delivered, and cites primary sources for external policy claims.

No root package scripts exist yet. Phase 01 makes the future check commands real. The planning checker is already executable: `node scripts/validate-planning.mjs`.
