# ADR-0049: Room content sync and observed membership revocation (provisional local)

Date: 2026-10-20. Status: accepted (provisional local).

## Context

Phase 52 enables shared note/task/file synchronization inside invite-only rooms after Phase 51 membership foundations. Phase 53 owns chat — this phase does not implement messaging. Prerequisites Phase 51 and Phase 34 remain blocked on release evidence; owner authorized provisional local development only.

## Decision

1. **Approved kinds.** Room sync admits `note`, `task`/`todo`, and `file_item` only. Journal and vault (including forged security scopes) remain excluded on push and listing.
2. **Revalidate every boundary.** Pull, push, bootstrap, mutation-receipt reads, and room file download issuance call `assertRoomSyncAccess` / `app.get_workspace_sync_access` so RLS cannot hide a removed member as a silent success. Stale JWT roles and cursors are not authorization.
3. **Revocation protocol.** Confirmed loss of readable access uses structured codes `MEMBERSHIP_REVOKED` and `ROOM_ARCHIVED` only (403). Clients classify via `classifyRoomSyncFailure`, stop room sync, purge via typed `LocalRepositoryPort.clearWorkspaceData` (`applyRoomRevocationPurge`), and emit `room_revoked` (including purge failure). Do not move revoked room drafts into personal workspaces. Rejoin requires a fresh invite and new sync context — do not replay prior membership-generation writes. Push-result rejection codes are classified the same way as top-level transport failures.
4. **Access epoch / cursor reset ≠ purge.** `SYNC_RESET_REQUIRED` and access-epoch rotation for an authorized member trigger bootstrap rebase (`resetAndBootstrap`) while preserving drafts, pending mutations, and conflicts. Broad message substrings such as bare “archived” must not trigger purge.
5. **Role downgrade ≠ membership loss.** `ROOM_ROLE_INSUFFICIENT` rejects unauthorized writes (viewer) without purging readable room cache or pretending membership was removed.
6. **Conflicts.** Reuse Phase 34 optimistic revision rules; concurrent shared edits may produce conflict results without live OT/CRDT.
7. **Signed URLs.** Fresh download capabilities require current room membership. Already-issued URLs expire under the existing short download TTL (~300s); remote instant recall of issued URLs is not promised. Offline downloaded bytes may remain until revocation is observed.
8. **Enablement.** Shared `isRoomsLocallyEnabled` fails closed when `NODE_ENV=production` even if `DAYNORI_ROOMS_LOCAL_ENABLED=true`. Local/test provisional rooms remain gated. Vault stays disabled.

## Consequences

- Removed members receive an explicit revocation signal for rooms (not only opaque 404), enabling client purge.
- Chat, public discovery, and broad collaboration remain out of scope until Phase 53+.
- Phase status remains incomplete until Phases 51/34/38 release evidence and rooms gates are accepted.
