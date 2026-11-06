# ADR-0088: Rooms, chat, and staffed moderation readiness

- Status: accepted
- Date: 2026-11-06
- Owner/reviewer: Antigravity agent (owner-authorized Phase 88 with explicit scheduling exception).
- Related: [Phase 88](../roadmap/phases/88-rooms-chat-and-staffed-moderation-readiness.md), [ADR 0048](0048-shared-rooms-invitations-and-roles.md), [ADR 0050](0050-room-chat-and-local-realtime.md), [ADR 0051](0051-block-report-and-ugc-policy-gate.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [Phase 75](../phase-reports/phase-75.md), [Phase 81](../phase-reports/phase-81.md), [release-gates.md](../engineering/release-gates.md).
- Supersedes/superseded by: none. Preserves all outstanding prerequisite, security, hardware, and release gates.

## Context & Owner Scheduling Authorization

The project owner explicitly authorized Phase 88 implementation and independent verification before final acceptance of Phases 75 and 81:
> "OWNER SCHEDULING AUTHORIZATION: I authorize Phase 88 implementation and independent verification before final acceptance of Phases 75 and 81. Record this exception in an ADR and roadmap metadata. Preserve outstanding prerequisite, hardware, security, infrastructure, and moderation gates. Do not remove dependencies, mark blocked phases complete, or enable unverified collaboration in production."

Phase 88 conducts a thorough audit of the shared rooms, live chat messaging, UGC safety reporting, user blocking, and operator moderation triage subsystems. It establishes a bounded findings register (RM-001 through RM-008), delivers production-grade remediations, verifies two-participant journeys and safety invariants, prepares the Google Play UGC policy review and moderation operations package, and enforces fail-closed release gates under `DEF-V2-006`.

## Baseline Audit & Findings Register

An audit of the rooms and collaboration architecture against Google Play UGC requirements and Daynori privacy invariants established the findings register in `artifacts/phase88/findings-register.json`:

1. **RM-001 (High — Remediated)**: *Actioned report disposition content_removed must soft-delete message and emit deletion event.*
   - Previously, marking a message report `actioned` with disposition `content_removed` in `app.update_ugc_report_status` only updated the report row in `app.ugc_reports`. The offending message remained live and readable in `app.room_messages`.
   - *Remediation*: Added database migration `00077_moderation_takedown_enforcement.sql` defining `SECURITY DEFINER` function `app.moderation_takedown_room_message(p_room_id, p_message_id)`. Updated `apps/api/src/modules/safety/service.ts` so that when a message report is actioned with `content_removed`, the message is soft-deleted (`deleted_at = now()`, `body = ''`), `next_server_order` is incremented under lock, and a `room_message.deleted` event is published to `app.room_chat_events`. All connected participants immediately receive the deletion marker.

2. **RM-002 (High — Remediated)**: *Web operator moderation triage dashboard for review and enforcement.*
   - While moderation API endpoints existed, platform operators had no visual interface to view incoming reports, filter by status or category, inspect immutable frozen evidence snapshots, or execute enforcement actions.
   - *Remediation*: Created accessible developer dashboard at `apps/web/src/app/developer/moderation/page.tsx` protected by `<OperatorGate title="Moderation triage">`. Features filter bar (status, category, target type, text search), report list with severity badges, frozen evidence snapshot viewer, mandatory operator reason input, disposition selector, and one-click action buttons. Linked from `/developer`.

3. **RM-003 (Medium — Remediated)**: *Room member lifecycle management controls in web and mobile UI.*
   - Room owners lacked accessible controls to promote/demote members, remove members, or transfer ownership.
   - *Remediation*: Added member management controls to `apps/web/src/components/RoomsPanel.tsx` and `apps/mobile/src/views/RoomsSheet.tsx`:
     - Role promotion/demotion (`editor` <-> `viewer`) via `updateRoomMemberRole`.
     - Member removal via `removeRoomMember` with confirmation dialog.
     - Ownership transfer via `transferRoomOwnership` with confirmation dialog, maintaining the single-owner invariant.

4. **RM-004 (Medium — Remediated)**: *Explicit personal item to room copy controls with vault and journal exclusion.*
   - Users lacked clear UI affordances to copy personal items to rooms or verify UUID isolation.
   - *Remediation*: Added "Share personal item to room" section in both web and mobile rooms panels. Users provide a personal item UUID, preview the copy via `previewCopyPersonalItemToRoom` (displaying title, kind, destination, and ownership transfer explanation), and execute the copy via `copyPersonalItemToRoom`. Encrypted vault records and journal entries are strictly blocked by schema and contract validators.

5. **RM-005 (Medium — Remediated)**: *Access revocation epoch rotation and client room cache purge.*
   - When a member is removed from a room, the server immediately rotates the workspace access epoch via `rotateWorkspaceAccessEpoch(roomId)`.
   - On the client side, subsequent sync and chat requests receive `403 MEMBERSHIP_REVOKED` or `404 Not Found`. The client halts background polling, purges displayed room content and cached messages, rejects unsent queued mutations, and leaves personal workspace items completely untouched.

6. **RM-006 (Low — Remediated)**: *Strict functional boundaries between Mute, Block, and Leave/Remove.*
   - *Mute*: Suppresses unread badges and local notifications; message history remains visible and readable.
   - *Block*: Prevents mutual invitations and hides messages from the blocked user for the blocker only; shared-room membership is unchanged (does not kick the blocked user from shared rooms).
   - *Leave/Remove*: Terminates room membership, rotates access epoch, and purges local room copy.

7. **RM-007 (High — Gated Limitation)**: *Multi-instance realtime clustering limitation.*
   - In-process event bus and polling gap recovery are fully verified for single-node development runtimes. Distributed multi-server real-time message fan-out (Redis Pub/Sub or WebSocket cluster) is unapproved.
   - *Disposition*: Realtime clustering remains gated. Multi-instance production deployment fails closed.

8. **RM-008 (High — Release Gate Limitation)**: *Staffed 24/7 human moderation operations and legal dispatch limitation.*
   - In accordance with Google Play UGC policy and [release-gates.md](../engineering/release-gates.md), UGC apps require a named operational safety owner, 24/7 coverage with documented SLAs, and NCMEC CyberTipline reporting integration. Automated scripts or AI agents cannot fulfill this role.
   - *Disposition*: Published `docs/policy/google-play-ugc-review-2026-11-06.md` and `docs/engineering/moderation-operations-package.md`. Retained `DEF-V2-006` in `function-register.json`. Phase 88 is honestly recorded as `blocked` in roadmap metadata; production gate `isRoomsLocallyEnabled()` fails closed whenever `NODE_ENV === 'production'`.

## Verification Evidence

All 9 relevant integration and security test suites pass completely (72/72 tests passing):
- `tests/integration/phase88-rooms-chat-moderation-readiness.test.ts` (10 passed)
- `tests/integration/phase51-rooms-invitations.test.ts` (5 passed)
- `tests/integration/phase51-rooms-repair.test.ts` (14 passed)
- `tests/integration/phase52-room-content-sync.test.ts` (11 passed)
- `tests/integration/phase53-room-chat.test.ts` (10 passed)
- `tests/integration/phase53-room-chat-repair.test.ts` (9 passed)
- `tests/integration/phase54-collaboration-safety.test.ts` (7 passed)
- `tests/security/phase51-rooms-domain.test.ts` (3 passed)
- `tests/security/phase52-room-revocation-domain.test.ts` (3 passed)

## Decision & Release Gate Closure

1. **Owner Scheduling Authorization**: Formally recorded in `docs/roadmap/progress.json` and this ADR.
2. **Technical Readiness Complete**: Moderation takedown enforcement (RM-001), operator triage dashboard (RM-002), member lifecycle management (RM-003), and personal item copying (RM-004) are fully implemented and verified.
3. **Fail-Closed Collaboration Gate**: Production collaboration remains disabled (`isRoomsLocallyEnabled()` returns `false` in production). Defect `DEF-V2-006` is retained in `docs/roadmap/v2/function-register.json`.
4. **Honest Blocked Status**: Phase 88 is recorded as `blocked` in `docs/roadmap/progress.json` and `docs/phase-reports/phase-88.md` until designated human operations personnel and legal counsel sign the operations commitment.
