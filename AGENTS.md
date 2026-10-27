# Project instructions

These instructions apply throughout this repository to every contributor and coding agent, including Antigravity.

- Read README.md, docs/roadmap/README.md, the active phase, and its linked specifications before editing.
- Work on one selected phase at a time. Phase 00 is planning only; do not implement the app until Phase 01 is selected.
- Follow the owner's instructions when they override this file. Keep unrelated working-tree changes intact.
- Read docs/engineering/handoff.md and CONTRIBUTING.md for the completion and Git workflow.
- Respect module boundaries and platform adapters in docs/architecture; record material changes in an ADR.
- Share domain logic and contracts; let web and mobile interfaces fit their own platforms.
- Use strict TypeScript and validate all external input. Avoid broad any types and silent error catches.
- Explain invariants, tradeoffs, and public contracts in comments; avoid narrating obvious statements.
- Scope every request, object, job, and search result to the authorized workspace and current membership.
- Keep secrets, private files, recorded audio, journal content, and real user fixtures out of Git and logs.
- Do not claim screen locking encrypts data. Follow the separate vault threat model and release gates.
- Custom sections compose approved block types; never execute user-supplied scripts or SQL.
- Preserve offline drafts, mutation receipts, revisions, and explicit conflict handling.
- Implement accessible controls and keyboard/screen-reader alternatives to dragging.
- Run the active phase's relevant tests. Record exact commands, results, limits, and manual evidence.
- Update the phase report, CHANGELOG.md, and docs/roadmap/progress.json in the same phase commit.
- One completed phase produces one local commit using the documented conventional message, then push to the configured origin branch without force ([ADR 0074](docs/decisions/0074-standing-phase71-scheduling-and-push.md)). Do not stop solely because Phase 71 remains blocked when the selected phase’s own dependencies are complete.
- Review the diff and staged paths before committing. Never discard edits or rewrite history without authorization. Never force-push as automatic recovery.
- No credentials, paid infrastructure, store submission, or production deployment is implied by scaffolding work.
