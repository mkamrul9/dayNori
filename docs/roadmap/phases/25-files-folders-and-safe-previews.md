# Phase 25 — Files folders and safe previews

Group: Personal organizer and private beta. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [24 — Private binary upload lifecycle](24-private-binary-upload-lifecycle.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web files
- apps/mobile files
- packages/ui-web
- packages/ui-mobile

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Add device/browser upload, progress/retry/cancel, file detail, folder placement, and authorized download.
2. Provide safe image/PDF previews; show metadata/download for unsupported office documents without claiming full editing.
3. Make availability, storage usage, and cloud/offline status visible; let users choose downloads for offline access.

## Acceptance

- Users can upload PDF/image/document files into their own Software and Government Jobs folders.
- Cancelled, rejected, or offline uploads have actionable states.
- Preview and cached downloads respect account boundaries and cleanup policy.

## Verification and evidence

- Test representative image/PDF/office files, large/empty files, cancel/retry, and expired read links.
- Review preview sandboxing, accessibility, and physical-device file picker behavior.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/product/requirements.md](../../product/requirements.md)
- [docs/architecture/security-and-vault.md](../../architecture/security-and-vault.md)

## Commit target

`feat(files): add organized uploads and safe document previews`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
