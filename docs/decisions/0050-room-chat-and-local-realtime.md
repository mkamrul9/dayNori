# ADR-0050: Durable room chat with local provisional realtime (persist-first)

Date: 2026-10-20. Status: accepted (provisional local). Amended 2026-10-20 (Phase 53 repair).

## Context

Phase 53 adds invite-only room conversations after Phase 52 content sync/revocation. No production realtime provider is approved. Chat must not bypass membership authorization, must persist before acknowledgment, and must remain behind the same rooms local gate that fails closed in production.

## Decision

1. **Source of truth.** `app.room_messages` with monotonic `server_order` per room (`app.room_chat_state`). Soft deletes clear body and emit deletion events. Client `client_message_id` is unique per `(room, sender)` for idempotent send/retry; mismatched payload returns `IDEMPOTENCY_KEY_REUSED`.
2. **Immutable send receipt.** Idempotency compares against durable `original_payload_hash` captured at first successful insert — not the mutable current body. Edit/delete must not change retry identity; identical retries after edit/delete return the prior receipt (`isReplay`) without new create/delete publication.
3. **Concurrency.** Chat-state row lock is acquired before idempotency lookup and rate-limit counting so concurrent identical retries and concurrent rate checks serialize across connections. Unique-constraint races still resolve to a hash-checked replay.
4. **Permissions.** Viewers read history/events; owners/editors send. Authors edit/delete their messages; owners may moderate-delete. Role checks use `get_workspace_sync_access` on every operation, including replays. RLS: viewers SELECT; insert requires editor+ and `sender_id = current_user`; updates limited to author or owner.
5. **Commit-to-publication.** Message + `app.room_chat_events` + `outbox_intents` write in the same request transaction; local process bus publishes after commit when `!isReplay`; `published_at` marks offer to the local publication path — **not** end-user delivery. Process lifecycle `startChatPublicationRecovery` drains unpublished events via SECURITY DEFINER claim/mark helpers and resolves linked `outbox_intents`. The unauthenticated in-process bus is not proof of member-authorized subscriptions.
6. **Realtime adapter (provisional).** Process-local `localRealtimeBus` plus authorized `GET .../chat/events?sinceOrder=` polling for reconnect/gap recovery. Clients must advance the **event cursor** only from consumed events / verified watermarks — never from a send acknowledgment’s message order. Distinct from any future production SSE/WebSocket provider (separate ADR).
7. **Unread / mute.** Per-user shared read cursor (`room_message_read_state`) across devices; advancement is clamped to the room’s high-water (max message/event order). Mutes suppress synthetic notification planning; lock-screen previews stay generic (no message body). No real push/email/SMS from this phase.
8. **Attachments.** Optional `attachment_file_id` must reference a non-deleted room-owned `file`/`file_item` with non-vault scope **and** `quarantine_status = verified`. Cross-workspace and journal/vault references rejected.
9. **Client durability.** Account-and-room-scoped local chat store holds drafts, pending sends with stable `clientMessageId`, and event cursors. Confirmed revocation clears displayed and app-controlled persisted chat data for that room.
10. **Enablement.** Same `isRoomsLocallyEnabled` gate as rooms. Production never enables chat via `DAYNORI_ROOMS_LOCAL_ENABLED`.

## Consequences

- Local multi-synthetic-client fan-out works in-process; multi-instance production fan-out remains out of scope. Sequential send+history-read is an ordering smoke test only — not fan-out delivery proof.
- Phase 54 moderation/report/block and public chat remain blocked until selected and staffed.
- Status stays incomplete until rooms release gates and prerequisite phases are accepted.
