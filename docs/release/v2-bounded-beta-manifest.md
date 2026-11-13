# Daynori Version 2: Bounded Personal Beta Candidate Manifest

This manifest documents the proposed scope, enabled feature boundaries, candidate rehearsal evidence, testing cohort plan, operational responsibilities, and release gate reconciliation for the **Daynori Version 2 Bounded Personal Beta Candidate**.

> [!IMPORTANT]
> **Owner Authorization Prerequisite**: This document constitutes a formal submission package for project owner review. It does **not** authorize public deployment, participant recruitment, commercial billing, or live external AI/cloud provider calls. All live deployments and external spending remain gated until explicit owner approval is granted.

---

## 1. Candidate Build and Environment Identification

- **Candidate Revision**: `43dd5858fb8a3a5a65ced01ead9d390d0abb74ab` (Phase 99 verified baseline)
- **Pinned Build Version**: `2.0.0-candidate` (`2.0.0-beta.1`)
- **Evaluation Date**: 2026-11-10
- **Test Environment**: Node `v24.11.1` (engine wanted `^24.21.0`), Fastify 5.x API, PostgreSQL 16 with Supabase migrations `00001`–`00077`, RS256 JWT auth with local JWKS verifier.

---

## 2. Proposed Scope & Enabled-Feature Manifest

The proposed beta delivers a calm, offline-first personal workspace focusing on core organization, dependable capture, responsive mobile/desktop shells, and rich local guided learning. Higher-risk or third-party dependent modules are strictly fenced.

### 2.1 Enabled Core Features

| Feature Family | Included Capabilities | Rationale & Evidence |
| :--- | :--- | :--- |
| **Account & First Use** | Personal workspace provisioning, display preferences (theme, bangla line-height, compact mode), timezone management. | Verified local in Phase 72/77; zero cross-tenant leakage. |
| **Home & Navigation** | Today view, Plan view, Library view, custom module visibility (Journal hide adapts shell to 3 primary tabs: `today`, `plan`, `library`). | Verified local in Phase 66/70/99; responsive across 320px–1440px. |
| **Tasks** | Create, edit, deadlines, priority, complete/undo, filter by status, non-drag keyboard reordering. | Verified local in Phase 73/99; durable across client restarts. |
| **Routines** | Daily routines, independent occurrences, timezone-aware scheduling, occurrence undo. | Verified local in Phase 73/99; distinct from one-off tasks. |
| **Calendar** | Agenda and month projection views, routine projections, private event markers. | Verified local in Phase 73/77; offline projections supported. |
| **Notes & Knowledge** | Multi-paragraph rich text AST notes, plainText capture, revision tracking, pinned notes. | Verified local in Phase 74/98/99; tested up to 250 paragraphs. |
| **Folders & Library** | Hierarchical folder tree, nested collections, mixed entity filtering, clear filters. | Keyset pagination verified under 10k items in Phase 98. |
| **Search** | Scoped search across active workspace title and content fields. | Strict tenant boundary enforced; zero cross-tenant search leaks. |
| **Offline & Portability**| Local mutation outbox, reconnect replay, portable JSON export, trash retention. | Conflict-free replay and restore ledger barriers verified in Phase 97/100. |
| **Help & Support** | 10 everyday tour chapters, 5 advanced tour chapters, 4 safe explanatory chapters, in-app bug reporting. | 19 chapters runnable; bug reporting persists to operator queue. |
| **Nori Companion** | Pure vector SVG avatar launcher, motion controls, 0ms reduced motion adherence. | Verified in Phase 96/98/99; zero background CPU overhead when idle. |

### 2.2 Fenced & Gated Features (Disabled in Candidate Beta)

| Feature | Release Gate | Blocker Reason & Status |
| :--- | :--- | :--- |
| **Client-Side Encrypted Vault** | `DEF-V2-004` | Blocked pending accredited external cryptographic review ([vault package](../engineering/vault-independent-review-package.md)). |
| **Live Google Drive Sync** | `DEF-V2-005` | Blocked pending Google OAuth verification and real provider testing ([Drive guide](../engineering/google-drive-oauth-configuration-guide.md)). |
| **Shared Rooms & Chat** | `DEF-V2-006` | Blocked pending live real-time infrastructure and staffed human moderation ([moderation package](../engineering/moderation-operations-package.md)). |
| **Commercial Google Play Billing** | `DEF-V2-007` | Blocked pending merchant account setup and Play Billing authorization ([pricing model](../engineering/sustainable-cost-and-pricing-model.md)). |
| **Live Assistant Model Streaming**| `DEF-V2-008` | Blocked pending explicit owner LLM provider authorization and spending approval ([operating decisions](../engineering/ai-provider-comparison-and-operating-decisions.md)). |
| **Push Notification Delivery** | `DEF-V2-002` | Mobile PWA push and native Android background notification channels pending real infrastructure. |
| **Physical TalkBack Verification** | `DEF-V2-011` | Blocked on physical Android ARM64 hardware testing (`adb devices` returned 0 devices). |

---

## 3. Candidate Rehearsal Evidence

All 8 candidate rehearsals executed against the candidate build in [phase100-v2-candidate-rehearsals.test.ts](../../tests/e2e/phase100-v2-candidate-rehearsals.test.ts) passed cleanly:

1. **REHEARSAL-01 (V1 Account Upgrade)**: Provisioned legacy account; evolved display preferences; hid Journal module; confirmed historical notes, tasks, and routines retained byte-exact fidelity; verified shell adapted to 3 primary tabs (`today`, `plan`, `library`).
2. **REHEARSAL-02 (Durable Save & Reopen)**: Composed multi-paragraph rich notes and priority tasks; simulated client crash / in-memory cache purge; reopened via fresh client instance; confirmed 0 data loss.
3. **REHEARSAL-03 (Offline Queueing & Reconnect Replay)**: Queued 3 optimistic mutations in client outbox while simulated offline; replayed to API server with optimistic concurrency (`baseRevision`); verified server 200/201 responses and 0 lost updates.
4. **REHEARSAL-04 (Provider Failure & Graceful Degradation)**: Simulated unapproved live AI model calls (failed closed with `AI_PROVIDER_UNAUTHORIZED`); simulated unapproved Drive sync (returned `provider_gated`); simulated 502 gateway timeout (returned user-safe diagnostic feedback with local caching).
5. **REHEARSAL-05 (Two-Account Isolation & IDOR Fencing)**: Alice and Bob created private workspace data; Bob attempted cross-tenant read, update, and quota probe; server rejected all attempts with 403/404 via `withTenantContext` RLS; Alice's data remained untouched.
6. **REHEARSAL-06 (Reporter-to-Operator Support Triage)**: Consumer user submitted bug report (`POST /v1/workspaces/:workspaceId/feedback/reports`); verified database persistence; unauthenticated request rejected with 401; non-operator rejected with 403; platform operator retrieved feedback triage queue with 200.
7. **REHEARSAL-07 (Tour & Help Runnability)**: Verified definitions and runnability for 10 everyday, 5 advanced, and 4 safe explanatory chapters; verified all 6 capability-gated chapters reject safely with `ok: false, code: 'feature_gated'`.
8. **REHEARSAL-08 (Function Register Reconciliation)**: Reconciled all 109 function register actions across 22 families (78 verified local, 10 unverified, 21 blocked, 0 release ready); verified defect barrier `DEF-V2-001` through `DEF-V2-012`.

---

## 4. Participant & Platform Plan

### 4.1 Cohort & Personas

- **Cohort Size**: 20 to 50 consenting testers.
- **Representative Personas**:
  1. Everyday student / personal organizer (touch-first, mobile portrait).
  2. Working professional (keyboard power user, desktop landscape).
  3. Bilingual multi-script user (Bangla conjuncts and English).
  4. Accessibility user (screen reader, keyboard-only, high contrast).
  5. Low-vision user (200% font zoom, relaxed line-height).

### 4.2 Deferred Phase 67 Human Usability Gate (`DEF-V2-013`)

- While Phase 99 verified programmatic execution across 5 synthetic personas, **live human research remains open** and must be substantiated during beta:
  - At least 5 representative consenting people must participate.
  - At least 4 participants must each capture and reopen an item and locate Help without intervention.
  - Anonymized session records must be filed before `DEF-V2-013` can close.

### 4.3 Platform Distribution

- **Web (PWA)**: Evergreen Chromium, Firefox, and Safari on desktop and mobile.
- **Android**: Google Play Console Internal Testing track only; stale or unverified `android/` debug builds are strictly rejected per ADR 0057.
- **iOS**: Owner-deferred per Phase 61–62 support matrix pending Mac hardware and TestFlight provisioning.

---

## 5. Synthetic Data Instructions & Privacy Rules

To protect tester privacy and comply with repository security rules:
- **Strict Prohibition**: Participants must **never** enter real personal passwords, real journal entries, sensitive financial details, or confidential workplace secrets.
- **Mock Fixtures**: Testers are provided with synthetic task and note templates (e.g. "Grocery list: apples and tea", "Draft outline for project zebra", "Daily 15-minute morning stretch").
- **Isolated Tenant Storage**: Each tester operates in an isolated workspace with private storage keys and zero cross-visibility.

---

## 6. Consent, Support, and Feedback Triage Process

1. **Digital Consent**: Prior to first workspace creation, testers are shown an in-app consent disclosure detailing the offline-first architecture, synthetic data requirements, and voluntary testing nature.
2. **In-App Feedback**: Testers can report bugs, suggest enhancements, or submit general feedback directly via `/help` or Settings (`POST /v1/workspaces/:workspaceId/feedback/reports`).
3. **Operator Triage**: Feedback is reviewed exclusively by authorized operators (`/v1/operator/feedback/reports`). Unauthenticated or unauthorized access is challenged with 401/403.
4. **Self-Service Erasure**: Testers can export their complete workspace data as JSON or permanently erase their account at any time.

---

## 7. Stop Criteria & Safety Thresholds

The beta test must be paused immediately if any of the following conditions occur:
1. **Security Vulnerability**: Any cross-tenant data leak or IDOR vulnerability.
2. **Data Loss**: Any incident resulting in corrupted or lost user notes, tasks, or routines.
3. **Operator Auth Bypass**: Any leakage or authorization bypass on `/v1/operator/*` routes.
4. **Crash Stability Threshold**: Unhandled client or server exceptions exceeding 1.0% of active sessions.

---

## 8. Operational & Staffing Responsibilities

All operational roles are documented below. Per repository standards, unstaffed roles are explicitly marked as **unassigned**:

| Role | Key Responsibility | Assignment Status |
| :--- | :--- | :--- |
| **Operations Lead** | Oversees infrastructure health, server budgets, and uptime. | `unassigned` |
| **Security & Vault Lead** | Manages cryptographic reviews, secret rotation, and audit coordination. | `unassigned` |
| **Moderation Officer** | Reviews user feedback, harassment reports, and UGC compliance. | `unassigned` |
| **Support Triage Operator**| Reviews in-app feedback submissions and categorizes defects. | `unassigned` |
| **Release Engineer** | Manages candidate builds, Play Console tracks, and signing credentials. | `unassigned` |

---

## 9. Legacy Release Gates Reconciliation

| Gate | Status | Reconciliation Notes |
| :--- | :--- | :--- |
| **Gate A (Local foundation)** | **Met** | Strict toolchain, migrations, reproducible installs, local JWT verifier, and package boundaries verified. |
| **Gate B (Private personal beta)**| **Provisional / Candidate Ready** | Manifest prepared, 8 candidate rehearsals passed, human participant sessions pending `DEF-V2-013`. |
| **Gate C (Public web & Play)** | **Blocked** | Blocked on physical Android ARM64 TalkBack testing (`DEF-V2-011`), signed target API 36 AAB, and operator approval. |
| **Gate D (Paid product)** | **Gated** | Commercial billing disabled (`DEF-V2-007`); free core organizer scope preserved. |
