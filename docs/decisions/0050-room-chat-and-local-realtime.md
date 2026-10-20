# ADR-0050: Durable room chat with local provisional realtime (persist-first)

Date: 2026-10-20. Status: accepted (provisional local).

## Context

Phase 53 adds invite-only room conversations after Phase 52 content sync/revocation. No production realtime provider is approved. Chat must not bypass membership authorization, must persist before acknowledgment, and must remain behind the same rooms local gate that fails closed in production.

## Decision

1. **Source of truth.** `app.room_messages` with monotonic `server_order` per room (`app.room_chat_state`). Soft deletes clear body and emit deletion events. Client `client_message_id` is unique per `(room, sender)` for idempotent send/retry; mismatched payload returns `IDEMPOTENCY_KEY_REUSED`.
2. **Permissions.** Viewers read history/events; owners/editors send. Authors edit/delete their messages; owners may moderate-delete. Role checks use `get_workspace_sync_access` on every operation.
3. **Commit-to-publication.** Message + `app.room_chat_events` + `outbox_intents` write in the same request transaction; local process bus publishes after commit; `published_at` marks delivery. `recoverUnpublishedChatEvents` republishes after crash. This is **not** exactly-once network delivery — clients dedupe by message id / server order.
4. **Realtime adapter (provisional).** Process-local `localRealtimeBus` plus authorized `GET .../chat/events?sinceOrder=` polling for reconnect/gap recovery. Distinct from any future production SSE/WebSocket provider (separate ADR). Guessed topics / stale connections cannot bypass membership recheck.
5. **Unread / mute.** Per-user shared read cursor (`room_message_read_state`) across devices. Mutes suppress synthetic notification planning; lock-screen previews stay generic (no message body). No real push/email/SMS from this phase.
6. **Attachments.** Optional `attachment_file_id` must reference a non-deleted room-owned `file`/`file_item` with non-vault scope. Cross-workspace and journal/vault references rejected.
7. **Enablement.** Same `isRoomsLocallyEnabled` gate as rooms. Production never enables chat via `DAYNORI_ROOMS_LOCAL_ENABLED`.

## Consequences

- Local multi-synthetic-client fan-out works in-process; multi-instance production fan-out remains out of scope.
- Phase 54 moderation/report/block and public chat remain blocked.
- Status stays incomplete until rooms release gates and prerequisite phases are accepted.
