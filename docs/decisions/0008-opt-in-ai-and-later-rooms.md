# ADR-0008: Consent-bound AI and later rooms

Date: 2026-10-13. Status: accepted scope ordering.

## Context

AI assistance and shared chat can add value but extend who processes data, require current authorization and create moderation/cost responsibilities. Their boundaries depend on a reliable private core.

## Decision

Defer provider AI and shared rooms until private authorization/sync/export/deletion are proven. AI starts with explicit selected-content consent, visible source/version references, bounded cost and proposal-only edits through normal commands. Exclude vault. Rooms use a distinct workspace/membership scope with accepted invitations and durable authorized chat; personal items do not become shared automatically. Add block/report/moderation before public room release.

## Alternatives

Workspace-wide AI by default is easier to query but ignores sensitive-context expectations. Reusing private workspace access for collaborators risks accidental exposure. Building live collaborative editors immediately makes sync substantially more complex without validating the basic organizer.

## Consequences and validation

Early releases have a clear private product scope. Later retrieval/index/jobs must recheck access and erase derived artifacts on source deletion. Test prompt injection as untrusted data, removed-member denial, invitation replay, chat duplicate retry and attachment scope. Provider terms, paid limits, room policy and real-time editing need their own implementation decisions.

See [integration constraints](../architecture/integrations-and-reminders.md).
