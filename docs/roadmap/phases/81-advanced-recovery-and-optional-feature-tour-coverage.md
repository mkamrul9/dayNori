# Phase 81 — Advanced recovery and optional-feature tour coverage

Group: V2 learning and support. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [80 — Everyday guided practice chapters](80-everyday-guided-practice-chapters.md)
- [75 — Files and audio attachment readiness](75-files-and-audio-attachment-readiness.md)
- [76 — Expenses and safe custom sections completion](76-expenses-and-safe-custom-sections-completion.md)
- [78 — Complete contextual Help and user instructions](78-complete-contextual-help-and-user-instructions.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web
- apps/mobile
- packages/domain
- tests/e2e
- docs/roadmap/v2

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Add action-based file/audio/expense/section and safe offline/conflict/Trash recovery chapters with scoped synthetic practice.
2. Define capability-gated chapters for reminders, vault, Drive, rooms, billing and assistant that their owning phases activate and verify.
3. Provide safe explanatory treatments for account deletion, real purchases, sharing and recovery secrets; never require irreversible actions to finish learning.

## Acceptance

- Every inventory action has a real chapter/step or explicit safe explanatory treatment.
- Unavailable capabilities cannot launch fake live practice; dormant definitions remain unverified until their feature phase passes.
- Practice cleanup preserves actual user content and cannot charge, delete an account or send invitations automatically.

## Verification and evidence

- Validate complete action/article/chapter coverage and each capability/permission combination.
- Exercise available advanced chapters and destructive-action safeguards; record gated chapters for later final acceptance.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/roadmap/v2/README.md](../v2/README.md)
- [docs/roadmap/v2/feature-coverage.md](../v2/feature-coverage.md)
- [docs/engineering/handoff.md](../../engineering/handoff.md)
- [docs/roadmap/v2/guided-tours.md](../v2/guided-tours.md)

## Commit target

`feat(tours): cover advanced features and safe recovery practice`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
