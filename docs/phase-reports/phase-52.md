# Phase 52: Shared content sync and revocation

## Identity and scope

- **Phase ID/specification:** [Phase 52 — Shared content sync and revocation](../roadmap/phases/52-shared-content-sync-and-revocation.md).
- **Status:** `blocked` (provisional local sync/revocation delivered; prerequisite Phases 51/34 and rooms release evidence unmet).
- **Contributor and report date:** Cursor agent, 2026-10-20 (Asia/Dhaka).
- **Base revision:** Phase 51 repair `ca607ce`.
- **Prerequisites:**
  - Phase 51 — Shared rooms invitations and roles: **blocked** (provisional + repair; Phases 38/10 unmet).
  - Phase 34 — Conflict recovery and offline hardening: **blocked** (provisional; hardware gates unmet).
- **Owner selection:** Bounded provisional local development only — not real-user sharing, outbound invitations, deployment, or release enablement.
- **Preserved:** Phase 50 deferred; Phase 49 live Google requirements unmet; vault activation disabled.
- **Scope correction:** Phase 52 is **shared content sync and revocation**, not chat. Chat is Phase 53.

### Distinguishing lanes

| Lane | Delivered? |
|---|---|
| Room-scoped note/task/file sync authorization + listing | **Yes** (provisional) |
| Membership revocation signal + client purge protocol | **Yes** (provisional) |
| Concurrent conflict preservation (Phase 34 reuse) | **Yes** (integration) |
| Web/Android room content journeys | **Yes** (local gate) |
| Chat / realtime messaging | **No** — Phase 53 |
| Real-user / production enablement | **No** |

## Result

- Domain: `roomContent`, `roomRevocation`; sync: `classifyRoomSyncFailure`, `applyRoomRevocationPurge`; engine `room_revoked` event.
- API: `assertRoomSyncAccess`, `MembershipRevokedError` / `ROOM_ARCHIVED`, `GET /v1/rooms/:id/content`, file download recheck, migration `00053_room_sync_access_helper.sql`.
- Clients: typed `listRoomContent`; web `RoomContentPanel`; mobile shared-content action on `RoomsSheet`.
- ADR 0049. Corrected architecture copy that wrongly implied Phase 52 includes chat.

## Acceptance evidence

| Condition | Method | Result |
|---|---|---|
| Removed member cannot get new changes / fresh read links | Integration: pull + content after remove → MEMBERSHIP_REVOKED | **PASS** (local) |
| Clients purge when revocation known; offline copies disclosed | Domain/sync unit + engine purge; UI copy | **PASS** (local); physical multi-device **unexecuted** |
| Concurrent edits preserve conflicts (no live OT claim) | Integration two-writer updateItem | **PASS** (local) |

### Commands run

Environment: Windows 11, Node `v24.11.1`, pnpm `9.15.5`. Date 2026-10-20.

| Command | Exit | Result |
|---|---|---|
| `pnpm vitest run tests/security/phase52-room-revocation-domain.test.ts tests/integration/phase52-room-content-sync.test.ts` | 0 | 41 passed |
| `pnpm --filter @daynori/api typecheck` | 0 | passed |
| `pnpm --filter @daynori/sync typecheck` | 0 | passed |
| `pnpm --filter @daynori/web typecheck` | 0 | passed |
| `pnpm --filter @daynori/mobile typecheck` | 0 | passed |
| `pnpm audit:secrets` | 0 | passed |
| `node scripts/validate-planning.mjs` | 0 | passed |
| `git diff --check` | 0 | clean (after whitespace fix) |
| Physical Android TalkBack / multi-device offline | — | **Unexecuted** |
| Live collaborative editor / CRDT | — | **Out of scope** |

## Defects, limitations and recovery

1. Phase remains **blocked** until Phase 51/34 prerequisite acceptance and rooms release gates (incl. Phase 38).
2. Already-issued signed download URLs expire by TTL; not instantly invalidated remotely.
3. Disconnected devices may retain previously downloaded room bytes until revocation is observed.
4. Chat is Phase 53 — not delivered here.

## Repair — revocation vs reset, durable purge, production gate (2026-10-20)

Owner-selected local repair before Phase 53:

| Defect | Fix |
|---|---|
| `SYNC_RESET_REQUIRED` treated as confirmed revocation | Removed from `CONFIRMED_REVOCATION_CODES`; engine rebases via `resetAndBootstrap` before any purge path |
| Broad “archived” message matching | Purge only on structured `MEMBERSHIP_REVOKED` / `ROOM_ARCHIVED` (or those tokens in messages) |
| Editor→viewer treated as membership loss | `ROOM_ROLE_INSUFFICIENT`; readable cache retained; unauthorized pending writes dropped |
| Partial / untyped purge | `applyRoomRevocationPurge` → typed `clearWorkspaceData` (cursors, conflicts, drafts, mutations, projections) |
| Production unlock via local flag | Shared `isRoomsLocallyEnabled` always false in production |
| Incomplete client revoke UX | Web/Android clear displayed content on structured revocation codes |

Regression coverage: domain classification, IndexedDB `clearWorkspaceData` scoped purge, remaining-member retention after leave, viewer write rejection, production flag present/absent.

### Repair commands

| Command | Exit | Result |
|---|---|---|
| `pnpm vitest run tests/security/phase52-room-revocation-domain.test.ts tests/integration/phase52-room-content-sync.test.ts tests/integration/phase51-rooms-repair.test.ts` | 0 | 28 passed |
| `pnpm --filter @daynori/domain build` + sync/api typecheck | 0 | passed |
| Physical Android / multi-device offline hardware | — | **Unexecuted** |

## Documentation and Git review

- This report; CHANGELOG; progress.json; ADR 0049 (repair amendments); sync/integrations architecture notes.
- Implementation commit: `feat(rooms): synchronize shared content and enforce membership changes`
- Repair commit subject: `fix(rooms): separate sync reset from revocation purge`

## Handoff

Provisional local room content sync and observed-revocation handling are delivered and repaired. Status remains **blocked** on release prerequisites.

Next eligible owner-selected action: Phase 53 — Room chat and realtime events (provisional local only).
