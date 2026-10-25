# Phase 92 — Text assistant chat and contextual guidance

Group: V2 daily assistant. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [91 — Scoped retrieval indexing and grounding quality](91-scoped-retrieval-indexing-and-grounding-quality.md)
- [70 — Mobile web and PWA layout redesign](70-mobile-web-and-pwa-layout-redesign.md)
- [71 — Native Android interface and navigation parity](71-native-android-interface-and-navigation-parity.md)
- [78 — Complete contextual Help and user instructions](78-complete-contextual-help-and-user-instructions.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web/src/components/AssistantPanel.tsx
- apps/mobile/src/views/AssistantSheet.tsx
- apps/api
- packages/contracts

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Deliver a desktop side panel/mobile screen with streamed text, selected sources, relevant starter suggestions, citations and Help/tour deep links.
2. Add cancel/retry/history/delete, consent/usage/unavailable states and preserved drafts without blocking manual work.
3. Validate response rendering, bounded conversation context, privacy and source-access rechecks; activate the read-only assistant tour.

## Acceptance

- Users get grounded responses or honest abstention and can open cited canonical items.
- Provider errors/cancel/offline/out-of-budget states preserve drafts; manual creation remains accessible.
- No chat text or retrieved content can authorize a tool, reveal secrets or bypass source restrictions.

## Verification and evidence

- Run stream/cancel/history/deletion/consent/access and unsafe-output rendering tests.
- Exercise actual authorized live synthetic ask/citation/Help flows on desktop, PWA and native Android.

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
- [docs/roadmap/v2/assistant.md](../v2/assistant.md)
- [docs/roadmap/v2/guided-tours.md](../v2/guided-tours.md)

## Commit target

`feat(assistant): deliver grounded text chat and contextual help`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
