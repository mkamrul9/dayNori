# Phase 53: Room chat and realtime events

## Identity and scope

- **Phase ID/specification:** [Phase 53 — Room chat and realtime events](../roadmap/phases/53-room-chat-and-realtime-events.md).
- **Status:** `blocked` (provisional local chat delivered + durability repair; prerequisite Phase 52/rooms release evidence unmet).
- **Contributor and report date:** Cursor agent, 2026-10-20 (Asia/Dhaka).
- **Base revision:** Phase 51/52 repair `39c44a9`; initial Phase 53 `677c0a9`; this report includes the Phase 53 repair commit on that base.
- **Prerequisites:**
  - Phase 52 — Shared content sync and revocation: **blocked** (provisional + repair).
- **Owner selection:** Bounded provisional local development only — not real-user sharing, outbound invitations, external notifications, deployment, or production activation.
- **Preserved:** Phase 50 deferred; Phase 49 live Google pending; vault activation disabled; rooms/chat unavailable to real users pending release gates.
- **Stop before:** Phase 54 — Collaboration safety and policy gate (implemented only when owner selects after this repair).

### Distinguishing lanes

| Lane | Delivered? |
|---|---|
| Durable messages, pagination, client IDs, idempotent send | **Yes** (provisional; repair: immutable hash + lock-first) |
| Author edit/delete + role send policy | **Yes** (+ usable web/Android controls) |
| Authorized history + event poll + local process bus | **Yes** (local transport ≠ provider verification) |
| Publication recovery wired to process lifecycle | **Yes** (provisional; `published_at` ≠ user delivery) |
| Unread / mute / privacy-safe notification planning | **Yes** (synthetic; read clamp; no real push) |
| Web + Android durable drafts/pending + revoke purge | **Yes** (local gate) |
| Production / real-user enablement | **No** |
| Phase 54 moderation / public chat | **No** |

## Result

- Migration `00054_room_chat_messages_and_mute.sql` — messages, chat state, read state, mutes, durable chat events.
- Repair migration `00055_repair_room_chat_idempotency_and_rls.sql` — `original_payload_hash`, tighter RLS, outbox-linked events, claim/mark SECURITY DEFINER helpers.
- Domain `@daynori/domain` `chat.ts`; contracts `api/chat.ts`; API `modules/chat` + `routes/v1/chat.ts`; typed api-client methods.
- Local realtime: `localRealtimeBus` + `GET /v1/rooms/:id/chat/events`; `startChatPublicationRecovery` on API process when rooms local.
- Web `RoomChatPanel` + `roomChatLocalStore`; Android chat surface in `RoomsSheet` + mobile local store.
- ADR 0050 (amended).

## Acceptance evidence

| Condition | Method | Result |
|---|---|---|
| Persist before ack; retry shows once | Integration idempotent send + concurrent identical retries | **PASS** (local) |
| Immutable hash survives edit/delete retry | `phase53-room-chat-repair.test.ts` | **PASS** (local) |
| Concurrent rate-limit under lock | Repair test (fill 30 + race 4) | **PASS** (local) |
| Read order clamp (no +1000 suppression) | Repair test | **PASS** (local) |
| Event pagination recovers interleaved sends | Repair test | **PASS** (local) |
| Publication recovery drains unpublished + outbox | Repair test + process hook | **PASS** (local); not user delivery |
| Unsafe attachments rejected | Repair test (missing/unverified) | **PASS** (local) |
| Viewer cannot send | Repair + original tests | **PASS** (local) |
| Only members fetch history/events | Original Phase 53 integration | **PASS** (local) |
| Mute / unread / generic preview plan | Integration + `planRoomChatNotification` | **PASS** (local); real push **unexecuted** |
| Ordering smoke (sequential sends + history) | Original “fan-out” test kept as ordering only | **PASS** (local); **not** fan-out delivery proof |
| Multi-recipient event delivery counts/latency | Repair synthetic 12 msgs × 3 clients | **PASS** (local in-process) |

### Commands run

Environment: Windows 11, Node `v24.11.1`, pnpm `9.15.5`. Date 2026-10-20.

| Command | Exit | Result |
|---|---|---|
| `pnpm vitest run tests/integration/phase53-room-chat-repair.test.ts` | 0 | 9 passed (incl. concurrent rate limit) |
| `pnpm vitest run tests/integration/phase53-room-chat.test.ts tests/security/phase52-room-revocation-domain.test.ts` | 0 | 23 passed |
| `pnpm --filter @daynori/domain build` | 0 | passed |
| `pnpm --filter @daynori/api typecheck` | 0 | passed |
| `pnpm --filter @daynori/web typecheck` | 0 | passed |
| `pnpm --filter @daynori/mobile typecheck` | 0 | passed |
| `node scripts/validate-planning.mjs` | 0 | Planning validation passed (64 phases) |
| `pnpm audit:secrets` | 0 | Secret scanning passed (2081 files) |
| Physical Android TalkBack / multi-device hardware | — | **Unexecuted** |
| Production realtime provider | — | **Not claimed** (local bus + poll only) |
| Real push / email / SMS / invitations | — | **Not implemented** |

## Defects, limitations and recovery

1. Phase remains **blocked** until Phase 52/51/34/38 release evidence and rooms gates (incl. Phase 54 moderation) are accepted.
2. Process-local bus is single-process provisional — not multi-instance production fan-out; in-process subscribe helper is not member-authorized transport proof.
3. Offline downloaded chat caches follow Phase 52 revocation limits when membership is lost.
4. Hardware accessibility evidence unexecuted.
5. Message retention constant alone is not an enforced lifecycle (Phase 54 / ops).

## Documentation and Git review

- This report; CHANGELOG; progress.json; ADR 0050 (amended); architecture notes.
- Intended repair commit subject: `fix(chat): harden idempotency, cursors, and publication recovery`

## Handoff

Provisional local durable room chat with concurrency-safe idempotency, clamped unread, durable client state, and process-wired publication recovery is delivered. Status remains **blocked**.

**Prerequisite repairs (prior commit `39c44a9`):** SYNC_RESET ≠ purge; typed `clearWorkspaceData`; ROOM_ROLE_INSUFFICIENT; production fail-closed gate.

**Next eligible action:** Phase 54 — Collaboration safety and policy gate (only when owner selects), or resume rooms release-gate evidence. Do not enable public chat.
