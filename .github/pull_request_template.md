## Summary

<!-- Briefly describe the change and state the active phase ID and title. -->

- **Phase ID**:
- **Type of Change**: [ ] Phase Implementation | [ ] Bug Fix | [ ] Documentation | [ ] Tooling / Chore

## Roadmap & Phase Alignment

- [ ] Work is strictly scoped to the active phase without implementing downstream phase features.
- [ ] Dependencies and prerequisites for this phase were verified prior to implementation.
- [ ] Phase status updated in `docs/roadmap/progress.json`.
- [ ] Phase report created or updated in `docs/phase-reports/phase-XX.md`.
- [ ] Conventional commit message matches documented standard (`type(scope): description`).

## Verification & Checks Executed

Mark checks that were executed locally and passed:

- [ ] `pnpm validate:planning` (Planning metadata and roadmap schema)
- [ ] `pnpm format:check` (Prettier code style)
- [ ] `pnpm lint` (ESLint static analysis)
- [ ] `pnpm typecheck` (Strict TypeScript across all workspaces)
- [ ] `pnpm test` / `pnpm test:unit` (Domain & unit tests)
- [ ] `pnpm test:contract` (API schema and contract tests)
- [ ] `pnpm test:integration` (Local database and service boundaries)
- [ ] `pnpm test:security` (Security and isolation test suite)
- [ ] `pnpm test:performance` (Performance budgets and benchmarks)
- [ ] `pnpm audit:secrets` (Repository secret scanning)
- [ ] `pnpm audit:deps` (Dependency vulnerability audit)
- [ ] `pnpm build` (Package and application bundle compilation)

## Accessibility & Interaction (if UI changed)

- [ ] WCAG 2.2 AA target considered for colors, contrast, and focus states.
- [ ] Keyboard navigation supported for all interactive controls (no mouse-only interactions).
- [ ] Screen-reader labels provided; no drag-and-drop operations without keyboard alternatives.

## Security & Data Privacy

- [ ] No real user secrets, credentials, or production connection strings committed.
- [ ] Offline-first mutations, drafts, and conflict handling preserved where applicable.
- [ ] Scoped to authorized workspace/tenant context.
