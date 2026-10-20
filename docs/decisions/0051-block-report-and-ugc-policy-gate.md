# ADR-0051: Block vs mute, reporting, and UGC policy gate (provisional local)

- Status: accepted (provisional local).
- Date: 2026-10-20.
- Related: Phase 54; ADR 0048 rooms; ADR 0050 chat; [release-gates](../engineering/release-gates.md); [Play UGC](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en) (reviewed 2026-10-20).

## Context

Invite-only room chat is user-generated content visible to a subset of users. Play UGC requires terms acceptance before contribution, in-app report (for closed/verified-style sets), and block for 1:1 interaction paths. Room ownership must not imply unrestricted platform moderation. Blocking must not falsely claim that another member loses authorized shared-room access.

## Decision

1. **Mute** — Existing per-room notification mute only. Does not hide history or stop invitations.
2. **Block** — Bidirectional invitation restriction (`app.are_users_blocked`). For the blocker only, hide the blocked user's messages in history reads. Does **not** remove membership, revoke the other user's room access, or delete shared content for other members.
3. **Hide** — Derived client/API filter for the blocker (see block). Not a separate durable entity.
4. **Membership removal / leave / archive** — Existing room-owner controls; confirmed destructive UX. Distinct from block.
5. **Moderation deletion** — Author or room-owner message soft-delete (chat); platform report status changes require explicit platform moderator allow-list (`DAYNORI_PLATFORM_MODERATOR_IDS`). Room owners cannot read the report queue or reporter identity.
6. **Reports** — Viewers may report; categories validated; optional explanation ≤1000; idempotent `client_report_id`; rate-limited. Evidence snapshot frozen at submit time (survives edit/delete).
7. **Terms** — Versioned `CURRENT_UGC_POLICY_VERSION`; server rejects chat sends without current acceptance (`UGC_TERMS_REQUIRED`). UI alone is insufficient.
8. **Invitations** — Per-actor create rate limit; block checks on targeted create and on accept vs invitation creator. Existing TTL/pending caps retained.

## Consequences

- Local controls exist; **staffed** moderation ownership, coverage, and external review remain release blockers (do not invent operators).
- Rooms/chat stay fail-closed for production and real users.
- No public discovery, anonymous rooms, or DM product in this phase.
