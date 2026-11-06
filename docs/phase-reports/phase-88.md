# Phase 88: Rooms, chat, and staffed moderation readiness

## Identity and scope

- Phase: [88 — Rooms, chat, and staffed moderation readiness](../roadmap/phases/88-rooms-chat-and-staffed-moderation-readiness.md).
- Status: **blocked** — Technical and architectural collaboration readiness complete: actioned report disposition `content_removed` now soft-deletes offending messages and emits `room_message.deleted` events under migration `00077_moderation_takedown_enforcement.sql` (RM-001); Web Operator Moderation Triage Dashboard (`/developer/moderation`) implemented under `<OperatorGate>` (RM-002); Member lifecycle management controls (promote/demote roles, remove member, transfer ownership) added to web `RoomsPanel.tsx` and mobile `RoomsSheet.tsx` (RM-003); Explicit personal item copying with UUID isolation and vault/journal strict exclusion added to web and mobile (RM-004); Access revocation epoch rotation and client cache purge verified on `MEMBERSHIP_REVOKED` (RM-005); Mute vs. Block vs. Leave boundaries codified and verified (RM-006); Monotonic server order sequences and event replay verified (RM-007); Google Play UGC policy review dated 2026-11-06 authored; Concrete Moderation Operations Package authored; 9 test suites with 72 tests passing; production collaboration fails closed pending contracted 24/7 human moderation operations, legal counsel, and physical Android TalkBack device evidence (`DEF-V2-006` retained).
- Contributor/date: Antigravity agent, 2026-11-06.
- Base revision/branch: `3ac8fc1dc1dfbbca005eb43f78b20b51f1673cd4`, `codex/free-core-preview`.
- Hard prerequisites: Phases **51**, **52**, **53**, **54**, **82**, and **83**.
- Owner Scheduling Authorization: The owner authorized Phase 88 implementation and independent verification before final acceptance of Phases 75 and 81 ([ADR 0088](../decisions/0088-rooms-chat-and-moderation-readiness.md)). Phase 88 is recorded as `blocked` due to unmet human staffed moderation and physical hardware gates (`DEF-V2-006` retained). Outstanding checks for Phases 71, 75, 80, 81, 84, 85, 86, 87, and 99 remain preserved. Standing push authorized under ADR 0074. No unverified production capability or artificial human staffing claimed.

## Result

### Implementation and Verifications Delivered

1. **Content Removal Enforcement (RM-001 Remediation)**:
   - Added database migration `infra/supabase/migrations/00077_moderation_takedown_enforcement.sql` defining `SECURITY DEFINER` function `app.moderation_takedown_room_message(p_room_id, p_message_id)`.
   - Updated `apps/api/src/modules/safety/service.ts`: when a message report is marked `actioned` with disposition `content_removed`, the offending message is automatically soft-deleted (`deleted_at = now()`, `body = ''`) and a `room_message.deleted` event is emitted under `app.room_chat_state` next server order lock.
   - Connected clients remove the message from local caches and UI immediately upon next event poll.

2. **Web Operator Moderation Triage Dashboard (RM-002 Remediation)**:
   - Created accessible developer surface at `apps/web/src/app/developer/moderation/page.tsx` protected by `<OperatorGate title="Moderation triage">`.
   - Features filter controls (status, category, target type, free-text search), report list with status indicators, detail drawer with immutable frozen evidence snapshots (`evidenceSnapshot`), operator reason input, disposition select, and one-click action buttons.
   - Linked directly from `/developer`.

3. **Room Member Lifecycle Management (RM-003 Remediation)**:
   - Enhanced `apps/web/src/components/RoomsPanel.tsx` and `apps/mobile/src/views/RoomsSheet.tsx` with member management controls for room owners:
     - Role promotion/demotion (`editor` <-> `viewer`) via `updateRoomMemberRole`.
     - Member removal via `removeRoomMember` with confirmation.
     - Ownership transfer via `transferRoomOwnership` with confirmation, maintaining single-owner invariants.

4. **Explicit Personal-to-Room Copy Affordances (RM-004 Remediation)**:
   - Added "Share personal item to room" section in both web and mobile rooms panels.
   - User inputs personal item UUID and clicks "Preview": preview card confirms source title, kind, destination room name, and ownership transfer explanation.
   - On confirmation: `copyPersonalItemToRoom` creates a new entity UUID in the room; personal original is untouched.
   - Vault items and journal entries are strictly blocked by schema validators with clear user feedback.

5. **Access Revocation & Client Cache Purge (RM-005 Verification)**:
   - Removing a member immediately rotates the workspace access epoch via `rotateWorkspaceAccessEpoch`.
   - The removed client receives `403 MEMBERSHIP_REVOKED` on next sync or chat call, halts polling, purges room cache, and rejects queued writes while leaving personal workspace items untouched.

6. **Mute vs. Block vs. Leave Boundaries (RM-006 Verification)**:
   - *Mute*: Suppresses notifications and unread badges only; message history remains visible and readable.
   - *Block*: Prevents mutual invitations and hides messages from the blocked user for the blocker only; shared-room membership is unchanged.
   - *Leave/Remove*: Terminates room access, rotates access epoch, and purges local room copy.

7. **Google Play UGC Policy Review & Operations Package**:
   - Authored `docs/policy/google-play-ugc-review-2026-11-06.md` assessing compliance against Google Play Developer Program policies.
   - Authored `docs/engineering/moderation-operations-package.md` detailing intake, frozen evidence, triage state machine, severity SLAs, Level 3 CSAM emergency escalations, NCMEC CyberTipline reporting, user appeals, and data retention.

### Gate Limitations & Operational Status (Truthfully Recorded)

| Gate / Requirement | Target | Result | Reason |
| --- | --- | --- | --- |
| `staffedModerationOperations` | Contracted human 24/7 team | **unmet** | Requires designated, contracted human moderators with 24/7 response SLAs (< 1hr CSAM, < 24hr harassment). Agent/AI self-review is disallowed (`DEF-V2-006`). |
| `physicalDeviceAccessibility` | Physical ARM64 Android device | **unmet** | Gate C physical TalkBack and touch verification pending physical hardware execution. |
| `multiInstanceRealtimeCluster` | Multi-server message broker | **unmet** | Realtime in-process event bus bounded to preview runtimes; production multi-server cluster remains unapproved. |
| `ugcTermsAcceptance` | Mandatory EULA gate | **pass** | Server rejects chat/content writes with 403 `UGC_TERMS_REQUIRED` until current version is accepted. |
| `inAppReportingAndBlocking` | User safety controls | **pass** | Report with frozen evidence snapshot and user blocking verified in web and mobile. |
| `contentRemovalEnforcement` | RM-001 Takedown automation | **pass** | Soft-deletes message and emits `room_message.deleted` event in monotonic event sequence. |

Production rooms and chat remain **fail-closed** (`isRoomsLocallyEnabled()` returns `false` in production). `DEF-V2-006` is retained in `docs/roadmap/v2/function-register.json`.

Evidence files:
- `artifacts/phase88/findings-register.json`
- `artifacts/phase88/evidence-summary.json`
- `artifacts/phase88/manual-ui-evidence.json`
- `artifacts/phase88/phase88-ui-evidence.json`
- `docs/policy/google-play-ugc-review-2026-11-06.md`
- `docs/engineering/moderation-operations-package.md`
- `docs/decisions/0088-rooms-chat-and-moderation-readiness.md`

## Automated evidence

| Test Suite | Result |
| --- | --- |
| `tests/integration/phase88-rooms-chat-moderation-readiness.test.ts` | Pass (10 tests) |
| `tests/integration/phase51-rooms-invitations.test.ts` | Pass (5 tests) |
| `tests/integration/phase51-rooms-repair.test.ts` | Pass (14 tests) |
| `tests/integration/phase52-room-content-sync.test.ts` | Pass (11 tests) |
| `tests/integration/phase53-room-chat.test.ts` | Pass (10 tests) |
| `tests/integration/phase53-room-chat-repair.test.ts` | Pass (9 tests) |
| `tests/integration/phase54-collaboration-safety.test.ts` | Pass (7 tests) |
| `tests/security/phase51-rooms-domain.test.ts` | Pass (3 tests) |
| `tests/security/phase52-room-revocation-domain.test.ts` | Pass (3 tests) |
| Total Collaboration Test Coverage | Pass (72/72 tests) |
| TypeScript check (`@daynori/web`) | Pass (`tsc --noEmit`) |
| TypeScript check (`@daynori/mobile`) | Pass (`tsc --noEmit`) |
| Contracts Build (`@daynori/contracts`) | Pass (`tsc -b`) |
