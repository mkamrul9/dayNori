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
5. **Moderation deletion** — Author or room-owner message soft-delete (chat). Platform report queue/status changes require membership in protected `app.platform_moderators` enforced **inside** SECURITY DEFINER helpers (not API-only). Audit actor is bound to `app.current_user_id()`; forged actor ids are rejected. Room owners cannot read the report queue or reporter identity. Self-service block/unblock uses `record_self_safety_audit` (caller-bound).
6. **Reports** — Viewers may report; categories validated; optional explanation ≤1000; immutable `original_request_hash` for idempotent `client_report_id`; incompatible reuse → 409; concurrent identical retries return one receipt; advisory locks for rate limits. User reports require a shared-room relationship. Evidence snapshot frozen at submit time. `actioned` requires disposition + auditable reason.
7. **Terms** — Versioned `CURRENT_UGC_POLICY_VERSION`; server rejects shared UGC contribution without current acceptance (`UGC_TERMS_REQUIRED`) on chat send/edit, personal→room copy, and room sync writes. Private personal work, reporting, blocking, leave, and deletion remain ungated. UI shows version before accept.
8. **Invitations** — Per-actor create rate limit (advisory-locked); block checks on targeted create and on accept vs invitation creator. Existing TTL/pending caps retained.
9. **Hide consistency** — Blocker-only message hide applies to history and event payloads (`message: null` while cursor advances). Notification planning suppresses blocked pairs. Blocking does not revoke shared-room membership.

## Consequences

- Local controls exist; **staffed** moderation ownership, coverage, and external review remain release blockers (do not invent operators).
- Rooms/chat stay fail-closed for production and real users.
- No public discovery, anonymous rooms, or DM product in this phase.
