# Moderation Operations Package (Phase 88)

**Document:** Moderation Operations Package & Standard Operating Procedures (SOP)  
**Date:** 2026-11-06  
**Phase:** Phase 88 — Rooms, chat, and staffed moderation readiness  
**Release Gate Status:** **FAIL-CLOSED / BLOCKED** (`DEF-V2-006`)  
**Applicability:** Shared rooms, chat messaging, shared room content, file attachments, and user blocking/reporting.

---

## 1. Operational Overview & Scope

This operations package defines the end-to-end standard operating procedures (SOP), role responsibilities, escalation paths, and technical runbooks for managing User Generated Content (UGC) and safety reports across Daynori.

### Scope:
- **Invite-Only Shared Rooms:** Multi-user workspaces accessed via cryptographic tokens.
- **Room Chat:** Live text communication with revisions and event stream replay.
- **Shared Room Content:** Collaborative notes and tasks within closed room boundaries.
- **Attachments:** Files uploaded to room workspaces.
- **Safety Controls:** In-app reporting, user blocking, member role management, and access revocation.

> [!IMPORTANT]
> **Production Gate Condition:** This document establishes the operational procedures and technical runbooks required for commercial UGC readiness. However, until human moderation personnel, 24/7 on-call coverage, and legal representation are formally contracted and staffed, the collaboration feature remains **fail-closed** in production builds under defect `DEF-V2-006`.

---

## 2. Report Intake & Frozen Evidence Protocol

### 2.1 Intake Mechanics
1. **User Initiation:** A user flags a message or another user via in-app UI (`RoomChatPanel.tsx`, `RoomsSheet.tsx`) or API (`POST /v1/safety/reports`).
2. **Client Deduplication:** The client generates a unique `clientReportId` (UUID v4). Re-submitting the same client ID returns the existing receipt without duplicating database records.
3. **Evidence Freeze:** At the exact instant of submission, the server captures an immutable `evidenceSnapshot` containing:
   - Message text body at time of report (pre-edit snapshot if applicable).
   - Sender ID, message timestamp, and edit revision counter (`bodyRevision`).
   - Room context: `roomId`, room name, and active membership list.
   - Client diagnostic metadata (client version, platform, timestamp).
4. **Reporter Confidentiality:** The identity of the reporting user (`reporterId`) is strictly confidential. It is visible only to authorized platform moderators in the developer dashboard and is **never** disclosed to the reported user or room members.

---

## 3. Triage Workflow & Operator Dashboard

### 3.1 Operator Surface
Platform operators access report triage via the dedicated dashboard at `/developer/moderation`.
- **Security Gate:** Protected by `<OperatorGate title="Moderation triage">` requiring active operator authentication and membership in `DAYNORI_PLATFORM_MODERATOR_IDS`.
- **Filter Capabilities:** By status (`received`, `triaged`, `actioned`, `dismissed`, `duplicate`), category (`harassment`, `hate`, `sexual_content`, `spam`, `scam`, `violence`, `illegal`, `other`), target type (`message`, `user`), and free-text search.

### 3.2 Triage State Machine

```
              ┌─────────────┐
              │  Received   │
              └──────┬──────┘
                     │ (Operator picks up report)
                     ▼
              ┌─────────────┐
        ┌─────┤   Triaged   ├─────┐
        │     └──────┬──────┘     │
        │            │            │
        ▼            ▼            ▼
 ┌────────────┐┌────────────┐┌────────────┐
 │  Actioned  ││ Dismissed  ││ Duplicate  │
 └────────────┘└────────────┘└────────────┘
```

1. **`received`**: Initial status upon intake. Queue ordered by submission timestamp and severity classification.
2. **`triaged`**: Moderator has opened the report, reviewed the frozen evidence snapshot, and initiated assessment.
3. **`actioned`**: Violation confirmed and enforcement action executed (see Section 4).
4. **`dismissed`**: Investigated and deemed `no_violation` (e.g. benign banter or bad-faith report).
5. **`duplicate`**: Redundant report for an already processed incident.

### 3.3 Audit Trail Requirements
Every status mutation writes a persistent audit record into `app.moderation_audit`:
- `actor_id`: UUID of the operator.
- `report_id`: Target report UUID.
- `action`: State transition or disposition applied.
- `reason`: Mandatory text justification entered by the operator (max 500 characters).
- `created_at`: Wall-clock UTC timestamp.

---

## 4. Enforcement Actions & Technical Execution

When an operator marks a report `actioned`, they must select a concrete disposition:

| Disposition | Operational Meaning | Technical System Execution |
|---|---|---|
| **`content_removed`** | Offending message violates acceptable use policy. | **RM-001 Automated Enforcement:**<br>1. Soft-deletes message in `app.room_messages` (`deleted_at = now()`, `body = ''`).<br>2. Obtains next `server_order` lock on `app.room_chat_state`.<br>3. Inserts `room_message.deleted` event into `app.room_chat_events`.<br>4. Connected clients immediately remove the message from local cache and UI upon next poll/event stream. |
| **`user_warned`** | Minor or initial violation warranting guidance. | Records warning event against reported user. Warning delivered via verified developer notification or system notification. |
| **`user_restricted`** | Repeated or severe abuse warranting suspension. | Flags account in `app.users` (`status = 'suspended'`). Revokes active refresh tokens and rotates workspace access epochs. |
| **`no_violation`** | Content complies with policy rules. | Report dismissed with logged operator rationale. No user-facing mutation occurs. |
| **`escalated`** | Extreme safety threat, illegal conduct, or legal liability. | Freezes all related records and triggers Level 3 Critical Escalation (Section 6). |
| **`other`** | Specialized edge case. | Detailed explanation recorded in audit log. |

---

## 5. Severity Classification & Target SLAs

| Severity Level | Examples | Target Intake-to-Triage SLA | Target Resolution SLA |
|---|---|---|---|
| **P0 — Critical Emergency** | Child Sexual Exploitation and Abuse (CSAM/CSAE), credible imminent self-harm, credible imminent violence or terrorism, severe extortion. | **< 15 minutes** | **< 1 hour** (Immediate content takedown + law enforcement dispatch) |
| **P1 — High Harm** | Severe targeted harassment, doxxing / unauthorized release of sensitive personal data, active scams / financial fraud, hate speech promoting violence. | **< 2 hours** | **< 12 hours** |
| **P2 — Medium Harm** | Unsolicited commercial spam, repetitive invitation flooding, hostile language, disruptive trolling. | **< 12 hours** | **< 24 hours** |
| **P3 — Low Harm** | Disputed room content, edge-case naming violations, duplicate reports. | **< 24 hours** | **< 48 hours** |

---

## 6. Critical Safety & CSAM Escalation Procedure (Level 3)

Daynori maintains a zero-tolerance policy regarding Child Sexual Abuse Material (CSAM), Child Sexual Exploitation and Abuse (CSAE), and imminent threats to human life.

### 6.1 Step-by-Step CSAM Emergency Protocol:
1. **Immediate Content Takedown:**
   - Execute `content_removed` action immediately via the moderation dashboard.
   - Do **NOT** download, duplicate, screenshot, or export CSAM media locally (doing so violates federal law).
2. **Evidence Preservation:**
   - The frozen database snapshot and message metadata are retained in an encrypted quarantine state.
   - Record account identifiers, registration IP, and session audit trails.
3. **Account Suspension:**
   - Immediately suspend the offending account (`user_restricted` / banned).
   - Invalidate all active tokens and rotate room access epochs.
4. **Mandatory Reporting to NCMEC:**
   - The designated Corporate Legal & Safety Liaison submits an official CyberTipline report to the **National Center for Missing & Exploited Children (NCMEC)** pursuant to 18 U.S.C. § 2258A.
   - Include report ID, timestamp, user identifiers, and IP addresses.
5. **Law Enforcement Cooperation:**
   - Await lawful subpoena or court order before disclosing preserved records to external law enforcement agencies.

---

## 7. Appeals & User Dispute Workflow

To satisfy fairness and due process expectations under platform developer policies:

1. **Appeal Submission:**
   - A user whose content was removed or whose account was restricted may submit a formal appeal within 14 days via the verified support portal (`/support`) or email (`safety-appeals@daynori.internal`).
2. **Secondary Independent Review:**
   - The appeal must be assigned to an operator who was **not** the author of the original enforcement action.
   - The reviewer inspects the original report, the frozen evidence snapshot, and the user's explanation.
3. **Outcomes:**
   - **Upheld:** Operator confirms violation; reason communicated to appellant; report status remains `actioned`.
   - **Overturned:** Operator determines mistake or context exoneration; restriction is lifted; record annotated with reversal justification.
   - Note: Soft-deleted text messages are not automatically restored into chat streams to prevent user confusion, but room access or posting privileges are restored.

---

## 8. Data Retention, Privacy & GDPR/CCPA Takeout

1. **Snapshot Retention:**
   - Frozen evidence snapshots are retained for **90 days** post-resolution to allow for appeals and legal defense, after which non-actioned snapshots are purged.
   - CSAM and severe legal threat evidence is preserved in restricted legal hold for statutory limitation periods.
2. **Exclusion from GDPR Takeout / Personal Export:**
   - Moderation audit records (`app.moderation_audit`) and other users' reports are internal compliance records containing confidential third-party data.
   - They are strictly excluded from personal user data archives (`/v1/users/export`) to protect reporter privacy.
3. **Account Deletion Reconciliation:**
   - When a user deletes their Daynori account, their active messages are permanently erased. However, existing safety report receipts for past violations retain their cryptographic identifiers for safety auditing.

---

## 9. Staffing Requirements & Release Gate DEF-V2-006

### Staffing Prerequisites for Production Commercial Enablement:
To transition Phase 88 from `blocked` to `release_ready`, the operating organization must provide:
1. **Named Safety Lead:** Designated individual responsible for moderation queue oversight.
2. **Contracted 24/7 On-Call Coverage:** Documented shift schedule ensuring P0 response < 15 minutes.
3. **NCMEC ESP Registration:** Registered Electronic Service Provider account with active CyberTipline API credentials.
4. **Legal Counsel of Record:** Retained legal firm authorized to receive law enforcement process and warrant requests.

> **Verification Invariant:** Automated tests and AI agents cannot serve as the designated human safety operations team. Until the above four staffing criteria are fulfilled and verified by the project owner, rooms and UGC features must remain blocked in production builds.
