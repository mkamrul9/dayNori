# ADR-0048: Shared rooms, invitations, and roles (provisional local)

Date: 2026-10-20. Status: accepted (provisional local).

## Context

Phase 51 implements invite-only shared room workspaces while Phase 38 (controlled private beta) and Phase 10 (personal workspace release gates) remain blocked. Owner authorized **bounded provisional local development** only — not public sharing, real-user invitations, deployment, or release enablement. Vault activation remains independently disabled. Drive folder mirroring (Phase 50) stays deferred and is not a Phase 51 prerequisite.

Related: ADR 0008 (later rooms), ADR 0013 (RLS), ADR 0016 (legacy workspace reconciliation), release-gates Rooms/chat section.

## Decision

1. **Separate room workspaces.** Rooms are `workspace.kind = 'room'` with canonical `owner_id` and `workspace_memberships` roles `owner|editor|viewer`. Personal workspaces remain owner-only and are never converted into shared rooms.
2. **Legacy quarantine.** Shareability is decided by `legacy_workspace_reconciliation_inventory` status, **not** the mutable ` (Legacy Room)` display-name suffix. Any inventoried workspace is shareable only when status is `reconciled_confirmed_room`. Renaming an unconfirmed legacy room must not make it inviteable. Ordinary rooms created via `/v1/rooms` have no inventory row and are shareable when active.
3. **Invitation-only join.** Membership joins go through `room_invitations` with SHA-256 token hashes at rest, bounded TTL (1–168h, default 72h), pending-cap per room, owner-authorized invite role (`editor|viewer` only), and atomic single-use acceptance via `SECURITY DEFINER` `accept_room_invitation` / `preview_room_invitation`. Acceptance binds to `app.current_user_id()` (mismatched `p_acceptor_id` rejected). Raw tokens never enter audit details, logs, or durable client storage (prefix only). Local UI is a **manual-token harness** (clipboard copy + paste accept); deep-link `/rooms/invitations/accept` is not a routed page in Phase 51.
4. **Delivery policy.** `recipient_user_id` null ⇒ bearer link (any authenticated acceptor); non-null ⇒ targeted recipient must match the accepting actor’s verified identity. Client-supplied role or actor ID is ignored on accept.
5. **Ownership invariant.** `workspaces.owner_id` is canonical and must retain an owner membership. Last-owner leave/demotion/removal are rejected at the DB trigger after locking the workspace row (`FOR UPDATE`). Transfer updates `owner_id` before demoting the prior owner. Concurrent ownership mutations serialize on that lock.
6. **Generic endpoint bypass.** `POST /v1/workspaces` with `kind=room` and generic member-add against room workspaces are rejected; room lifecycle uses `/v1/rooms*` only.
7. **Explicit personal→room copy.** Phase 51 allows copying `note` / `task` / `todo` only after preview; journal and vault (including forged kind/security-scope) are blocked. Destination gets a new identity; personal original is preserved. Broader collaboration content is Phase 52+.
8. **Local enablement gate.** API room routes require `NODE_ENV` in `test|development` or `DAYNORI_ROOMS_LOCAL_ENABLED=true`. Production/real-user enablement stays behind Gate B / rooms release gates and Phase 38 evidence.
9. **Status.** Phase 51 remains **incomplete / blocked** on prerequisite acceptance (Phases 38 and 10) and rooms release-gate evidence. No outbound invitation messages.

## Consequences

- Local multi-account PostgreSQL/API tests prove architecture; they do not authorize private-beta invitations.
- Disconnected devices may retain previously downloaded room bytes; remote erasure is not promised.
- Chat, public discovery, anonymous rooms, and broad content collaboration remain out of scope.
- Revisit when Phase 38 staging/beta cohort and moderation/report/block controls are ready for invite-only release.
