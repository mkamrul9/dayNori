# Google Play UGC policy review (2026-11-06)

**Primary sources:**
- [User Generated Content — Play Console Help](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en)
- [Understanding moderation requirements for UGC apps](https://support.google.com/googleplay/android-developer/answer/12923286)
- [Child Sexual Abuse Material (CSAM) and CSAS Policy](https://support.google.com/googleplay/android-developer/answer/9888379)
- [Hate Speech, Harassment, and Violent Extremism Policies](https://support.google.com/googleplay/android-developer/answer/9876937)

**Review date:** 2026-11-06  
**Phase:** Phase 88 — Rooms, chat, and staffed moderation readiness  
**Release Gate Status:** **FAIL-CLOSED / BLOCKED** (`DEF-V2-006`)

---

## 1. Executive Summary & Regulatory Stance

Daynori provides invite-only shared rooms with live text messaging, shared task/note collaboration, and optional file attachments. Under Google Play developer policies, any app featuring user-to-user interaction and user-contributed content (regardless of whether labeled "private", "invite-only", or "ephemeral") is classified as a **User Generated Content (UGC) application**.

This dated review verifies the technical and policy compliance of Daynori's collaboration infrastructure as of **2026-11-06**. While all technical mechanisms required by Google Play (terms acceptance, reporting, blocking, content removal, audit logging, and operator triage) are implemented and action-verified in the codebase, Daynori **must not** enable shared rooms or chat for production store users until a designated human staffed moderation operation with 24/7 SLA coverage and formal CSAM law enforcement dispatch is legally and operationally established.

The production capability gate fails closed via `isRoomsLocallyEnabled()` returning `false` whenever `NODE_ENV === 'production'`.

---

## 2. Applicability to Daynori Collaboration Architecture

1. **Invite-Only Closed Rooms:**
   - Daynori rooms are invite-only and accessed via single-use cryptographic tokens. There is no global public directory, room discovery, or broadcast channels.
   - **Policy Ruling:** Google Play UGC policy strictly applies to invite-only multi-user groups and 1:1 interaction paths. Closed rooms are not exempt from UGC moderation, reporting, and blocking obligations.

2. **Personal Workspace Isolation (Zero Inadvertent Leakage):**
   - Personal notes, tasks, journals, and encrypted vault entries are physically and logically segregated from rooms.
   - Copying an item to a room (`/v1/rooms/copy`) is an explicit user action that generates a brand new entity UUID in the room workspace, preserving the personal original.
   - Encrypted vault items and personal journal entries are strictly blocked from being shared or copied into rooms by contract validators and schema enforcement.

3. **UGC Feature Surface:**
   - Room Chat: Real-time text messaging with client-side deduplication (`clientMessageId`), edit history revision tracking, and server order sequences.
   - Room Content: Shared notes and tasks editable by room `owner` and `editor` members.
   - Attachments: Non-vault files uploaded to room storage, verified for virus/quarantine safety.

---

## 3. Google Play UGC Policy Requirement Matrix

| Google Play UGC Policy Requirement | Daynori Technical Implementation | Status | Remaining Production Blocker |
|---|---|---|---|
| **1. Robust, effective, and ongoing moderation** | - Operator Moderation Triage Dashboard (`/developer/moderation`) protected by `OperatorGate`<br>- API routes `GET /v1/safety/moderation/reports` and `PATCH /v1/safety/moderation/reports/:reportId`<br>- Actioned dispositions: `content_removed`, `user_warned`, `user_restricted`, `no_violation`, `escalated`<br>- Automatic soft-deletion and event emission (RM-001 repair) | **Technical Complete** | **Staffing Unmet:** Requires designated, contracted human moderators with 24/7 response capability. Agent/AI self-review is disallowed. |
| **2. In-app user reporting system** | - In-app report controls in web (`RoomChatPanel.tsx`, `RoomContentPanel.tsx`) and mobile (`RoomsSheet.tsx`)<br>- Categorized reports: `harassment`, `hate`, `sexual_content`, `spam`, `scam`, `violence`, `illegal`, `other`<br>- Immutable frozen evidence snapshot captured at report creation (`evidenceSnapshot`)<br>- Correlated client report idempotency (`clientReportId`) | **Technical Complete** | External intake email/web form for non-authenticated parties must be published alongside store candidate. |
| **3. In-app user blocking mechanism** | - 1:1 user blocking (`POST /v1/safety/blocks`, `DELETE /v1/safety/blocks/:blockedUserId`)<br>- Blocks all future room invitation acceptance between blocker and blocked party<br>- Hides blocked party messages from blocker's chat history and event stream<br>- Preserves room integrity without leaking block state to the blocked party | **Technical Complete** | None for local runtime. |
| **4. Terms of Service / EULA acceptance** | - Server rejects any chat message or room mutation with `403 UGC_TERMS_REQUIRED` until actor accepts current version (`CURRENT_UGC_POLICY_VERSION = 1`)<br>- UI modal prompts user to accept Acceptable Use & Community Rules before participating | **Technical Complete** | Formal production terms URL must be hosted on public web domain prior to store submission. |
| **5. Content removal and enforcement** | - RM-001 remediation: Setting disposition `content_removed` soft-deletes message (`body = ''`, `deleted_at = now()`) and publishes `room_message.deleted` event to all room participants immediately | **Technical Complete** | None for local runtime. |
| **6. Child Sexual Abuse Material (CSAM) & Extreme Harm** | - Immediate escalation disposition (`escalated`)<br>- Frozen evidence retention for legal evidence preservation<br>- Mandatory reporting protocol to NCMEC (National Center for Missing & Exploited Children) documented in operations package | **Technical Complete** | Operational execution requires designated corporate legal liaison. |
| **7. Monetization and Incentives** | - Shared rooms and UGC features carry no monetization, tipping, bounties, or ads.<br>- Zero incentive for viral or exploitative UGC generation. | **Fully Satisfied** | None. |

---

## 4. Key Findings & Remediations in Phase 88

1. **RM-001 (Enforcement Action):** Previously, updating a report to `actioned` with disposition `content_removed` only updated `app.ugc_reports`. The offending message remained live in `app.room_messages`. Fixed in Phase 88: `updateReportStatus` soft-deletes the message and emits a `room_message.deleted` event in the chat event sequence.
2. **RM-002 (Web Operator Triage Surface):** Added accessible, responsive developer surface at `/developer/moderation` with category/status filters, report drawer, frozen snapshot inspection, and disposition controls.
3. **RM-003 (Member Lifecycle Controls):** Added accessible role promotion/demotion (`editor` <-> `viewer`), member removal (`removeRoomMember`), and ownership transfer (`transferRoomOwnership`) in both web `RoomsPanel.tsx` and mobile `RoomsSheet.tsx`.
4. **RM-004 (Personal Item Sharing Controls):** Provided explicit personal item copy UI with preview, UUID isolation confirmation, and strict rejection of vault and journal items.
5. **RM-005 (Access Revocation & Purge):** Removing a member immediately increments `access_epoch`. On next sync or chat call, the removed client receives `403 MEMBERSHIP_REVOKED`, halts polling, purges local room caches, and invalidates unsent mutations.

---

## 5. Explicit Release Blockers for Production Store Submission

The following gates are strictly maintained as **closed** until satisfied:

1. **Gate C / Hardware & Physical Device Validation:** Physical Android device validation with TalkBack screen reader and touch navigation evidence.
2. **Staffed Moderation Operations (DEF-V2-006):**
   - Designated operational leads with signed acceptance of on-call rotation.
   - Contracted SLA targets (CSAM / severe harm: < 1 hour; standard harassment/spam: < 24 hours).
   - NCMEC Electronic Service Provider (ESP) reporting integration and verified legal contact point.
3. **Multi-Instance Production Realtime Cluster:**
   - In-process event bus and polling recovery are bounded to single-node preview runtimes. Real-time multi-server clustering (Redis/PostgreSQL LISTEN/NOTIFY or WebSocket mesh) requires Phase 89+ approval.

---

## 6. Verification and Revisit Cadence

This review must be revisited and recertified prior to any commercial Google Play release candidate. When revisiting:
1. Validate against latest Google Play Developer Program Policies at [play.google.com/about/developer-content-policy](https://play.google.com/about/developer-content-policy).
2. Verify that `DEF-V2-006` remains active in `function-register.json` until human staffing documentation is submitted and signed off.
3. Execute synthetic report triage and content takedown verification tests.
