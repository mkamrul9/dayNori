# ADR-0004: Offline commands and commit-ordered sync

Date: 2026-10-13. Status: accepted protocol baseline; implementation proof required.

## Context

Users may edit on multiple devices with unreliable connectivity. A lost response must not duplicate an expense or routine completion, and silent last-writer text replacement could lose journals.

## Decision

Write local projection and queued command atomically; retry the same command ID/payload. Server commands commit domain state, revision, change, receipt and outbox in one transaction. Conflict-check revisions, retain local drafts and require explicit text conflict resolution. Allocate per-workspace sync sequence under a lock held from transaction start through commit. Retain deletion markers and reset expired cursors through a consistent snapshot plus draft rebase.

## Alternatives

Last-write-wins based on client timestamps can lose text and trusts unreliable clocks. Timestamp/global sequence cursors can skip late commits. A CRDT stack could improve simultaneous text collaboration but introduces unnecessary complexity before rooms/live editing exist.

## Consequences and validation

Writes serialize within a workspace initially, while unrelated workspaces remain concurrent. Conflicts are visible and supported offline age is bounded. Prove response loss, duplicate concurrent push, late commits, restart-safe checkpoints, cursor expiry with drafts and delete/edit races. Revisit the ordered log or text merge strategy only with measured contention or user conflict burden.

See [sync specification](../architecture/sync-and-offline.md).
