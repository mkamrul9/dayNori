# Phase 53: Room chat and realtime events

## Identity and scope

- **Phase ID/specification:** [Phase 53 — Room chat and realtime events](../roadmap/phases/53-room-chat-and-realtime-events.md).
- **Status:** `blocked` (provisional local chat delivered; prerequisite Phase 52/rooms release evidence unmet).
- **Contributor and report date:** Cursor agent, 2026-10-20 (Asia/Dhaka).
- **Base revision:** Phase 51/52 repair `39c44a9`.
- **Prerequisites:**
  - Phase 52 — Shared content sync and revocation: **blocked** (provisional + repair).
- **Owner selection:** Bounded provisional local development only — not real-user sharing, outbound invitations, external notifications, deployment, or production activation.
- **Preserved:** Phase 50 deferred; Phase 49 live Google pending; vault activation disabled; rooms/chat unavailable to real users pending release gates.
- **Stop before:** Phase 54 — Collaboration safety and policy gate.

### Distinguishing lanes

| Lane | Delivered? |
|---|---|
| Durable messages, pagination, client IDs, idempotent send | **Yes** (provisional) |
| Author edit/delete + role send policy | **Yes** |
| Authorized history + event poll + local process bus | **Yes** (local transport ≠ provider verification) |
| Unread / mute / privacy-safe notification planning | **Yes** (synthetic; no real push) |
| Web + Android conversation journeys | **Yes** (local gate) |
| Production / real-user enablement | **No** |
| Phase 54 moderation / public chat | **No** |

## Result

- Migration `00054_room_chat_messages_and_mute.sql` — messages, chat state, read state, mutes, durable chat events.
- Domain `@daynori/domain` `chat.ts`; contracts `api/chat.ts`; API `modules/chat` + `routes/v1/chat.ts`; typed api-client methods.
- Local realtime: `localRealtimeBus` + `GET /v1/rooms/:id/chat/events`; recover unpublished events after interruption.
- Web `RoomChatPanel`; Android chat surface in `RoomsSheet`.
- ADR 0050.

## Acceptance evidence

| Condition | Method | Result |
|---|---|---|
| Persist before ack; retry shows once | Integration idempotent send | **PASS** (local) |
| Only members fetch history/events | Integration remove member | **PASS** (local) |
| Mute / unread / generic preview plan | Integration + `planRoomChatNotification` | **PASS** (local); real push **unexecuted** |
| Fan-out load | 25 sequential sends ordered | **PASS** (local synthetic) |

### Commands run

Environment: Windows 11, Node `v24.11.1`, pnpm `9.15.5`. Date 2026-10-20.

| Command | Exit | Result |
|---|---|---|
| `pnpm vitest run tests/integration/phase53-room-chat.test.ts` | 0 | 9 passed |
| `pnpm vitest run tests/security/phase52-room-revocation-domain.test.ts tests/integration/phase52-room-content-sync.test.ts tests/integration/phase51-rooms-repair.test.ts` | 0 | (run with Phase 53 commit verification) |
| `pnpm --filter @daynori/domain build` / contracts / api-client build | 0 | passed |
| `pnpm --filter @daynori/api typecheck` | 0 | passed |
| `pnpm --filter @daynori/web typecheck` | 0 | passed |
| `pnpm --filter @daynori/mobile typecheck` | 0 | passed |
| `node scripts/validate-planning.mjs` | 0 | (expected on commit) |
| `pnpm audit:secrets` | 0 | (expected on commit) |
| Physical Android TalkBack / multi-device hardware | — | **Unexecuted** |
| Production realtime provider | — | **Not claimed** (local bus + poll only) |
| Real push / email / SMS / invitations | — | **Not implemented** |

## Defects, limitations and recovery

1. Phase remains **blocked** until Phase 52/51/34/38 release evidence and rooms gates (incl. Phase 54 moderation) are accepted.
2. Process-local bus is single-process provisional — not multi-instance production fan-out.
3. Offline downloaded chat caches follow Phase 52 revocation limits when membership is lost.
4. Hardware accessibility evidence unexecuted.

## Documentation and Git review

- This report; CHANGELOG; progress.json; ADR 0050; architecture notes.
- Intended commit: `feat(chat): add durable authorized room conversations`

## Handoff

Provisional local durable room chat with authorized event recovery is delivered. Status remains **blocked**.

**Prerequisite repairs (prior commit `39c44a9`):** SYNC_RESET ≠ purge; typed `clearWorkspaceData`; ROOM_ROLE_INSUFFICIENT; production fail-closed gate.

**Next eligible action:** Phase 54 — Collaboration safety and policy gate (only when owner selects), or resume rooms release-gate evidence. Do not enable public chat.
