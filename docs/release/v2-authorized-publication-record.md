# Daynori Version 2 Authorized Publication Record & Smallest Viable Release Proposal

- **Record Date**: 2026-11-10
- **Candidate Revision**: `5b5c4f8cbb8002a77f87b114174bd5db81867af7`
- **Candidate Label**: `2.0.0-rc1`
- **Owning Phase**: [Phase 102 — Authorized Version 2 publication and live verification](../roadmap/phases/102-authorized-version-2-publication-and-live-verification.md)
- **Governing Decisions**: [ADR 0057](../decisions/0057-public-release-preflight-and-first-publication.md), [ADR 0074](../decisions/0074-standing-phase71-scheduling-and-push.md), [ADR 0101](../decisions/0101-version-2-release-candidate-and-operational-preparation.md), [ADR 0102](../decisions/0102-authorized-version-2-publication-and-live-verification.md)
- **Operational Status**: **ENGINEERING LAUNCH PREPARATION ONLY — PUBLICATION BLOCKED**

---

## 1. Executive Proposal: Bounded Web/PWA Beta as Smallest Viable Release

To enable rapid, safe, and controlled real-world validation without risking sensitive features or stalling behind native hardware dependencies, the project evaluates a **Bounded Web/PWA Beta** separately from any Android release and from full Version 2. This web-only beta is submitted as a concrete **proposal for owner determination**.

### Decoupled Scope Architecture

```
+---------------------------------------------------------------------------------------------------------+
|                                    DAYNORI CODEBASE (Candidate 2.0.0-rc1)                                |
+---------------------------------------------------+-----------------------------------------------------+
|                      TRACK A                      |                       TRACK B                       |
|        Smallest Viable Release: Web/PWA Beta      |                 Android Release Track               |
|      (Immediate Owner Approval Candidate)         |               (Independent Hardware Track)          |
+---------------------------------------------------+-----------------------------------------------------+
| Scope: 78 Verified Core Actions                   | Scope: Android Native Application                   |
| Gated: 31 Actions (Vault, Rooms, AI, Billing)     | Gated: Keystore (OWNER-SIGNING-KEYS), TalkBack     |
| Target: preview.daynori.com -> app.daynori.com    | Target: Google Play Internal Testing Track          |
| Applicable Gates: OWNER-RELEASE-AUTH, DEF-V2-001, | Applicable Gates: OWNER-SIGNING-KEYS, DEF-V2-011   |
|                   DEF-V2-013                      |                                                     |
+---------------------------------------------------+-----------------------------------------------------+
                                                    |
                                                    v
+---------------------------------------------------------------------------------------------------------+
|                                          FULL VERSION 2 TARGET                                          |
|                                       (Future Public Launch Scope)                                      |
+---------------------------------------------------------------------------------------------------------+
| Scope: 109 Total Actions (Includes Cryptographic Vault, Multi-User Rooms, Live AI Streaming, Billing)   |
| Gated on: DEF-V2-004 (Vault), DEF-V2-006 (Rooms), DEF-V2-008 (AI), DEF-V2-007 (Billing), etc.           |
+---------------------------------------------------------------------------------------------------------+
```

### Detailed Scope Boundary Matrix

| Scope Envelope | Included Feature Modules | Gated Modules & Explicit Fail-Closed Defect Gates | Intended Audience | Applicable Release Gates |
| :--- | :--- | :--- | :--- | :--- |
| **Proposed Smallest Viable Release: Bounded Web/PWA Beta** *(Immediate Proposal)* | **78 Verified Core Actions**: Personal Notes (rich text AST, revisions), Everyday Tasks (priorities, deadlines, keyboard reorder), Daily Routines (timezone-aware scheduling, occurrences), Agenda Calendar, Interactive Guided Tours (19 chapters), Offline-First Storage Outbox Sync, Local Attachments, In-App Support Feedback. | **Vault** (`DEF-V2-004`), **Rooms / Chat** (`DEF-V2-006`), **Live AI Streaming** (`DEF-V2-008`), **Play Billing Purchases** (`DEF-V2-007`), **Google Drive Sync** (`DEF-V2-005`), **Native Push** (`DEF-V2-002`). | 20 to 50 invited closed-cohort testers or usability participants. | **`OWNER-RELEASE-AUTH`**, **`DEF-V2-001`**, **`DEF-V2-013`** |
| **Android Release Track** *(Independent Track)* | Native Android client container wrapping core mobile experience. | **Android Release Keystore** (`OWNER-SIGNING-KEYS`), **Physical ARM64 TalkBack Profiling** (`DEF-V2-011`). | Up to 100 invited Google Play Internal Testing testers. | **`OWNER-SIGNING-KEYS`**, **`DEF-V2-011`** |
| **Full Version 2** *(Future Complete Target)* | **109 Total Actions**: All bounded beta features PLUS Cryptographic Vault, Multi-User Collaborative Rooms, Live AI Assistant Streaming, In-App Subscriptions, Google Drive OAuth, Native FCM/APNs Notifications. | Gated on independent qualified vault audit (`DEF-V2-004`), staffed moderation queue (`DEF-V2-006`), live LLM provider budget authorization (`DEF-V2-008`), and Google Play merchant setup (`DEF-V2-007`). | General public web users and Google Play Store production track. | All 11 release gates (`OWNER-*` and `DEF-V2-*`). |

---

## 2. Candidate Revision and Verified Artifact Hashes

- **Git HEAD SHA**: `5b5c4f8cbb8002a77f87b114174bd5db81867af7`
- **Branch**: `codex/free-core-preview`
- **Candidate Label**: `2.0.0-rc1`

### A. Distributable Web Release Artifact (Deployable Archive)

Built reproducibly with Node `v24.11.1`, Next.js `15.5.27`, React `19.0.0` (`BUILD_ID`: `82QG95zkVDUHchcNCcupu`). This archive contains the complete production-built web application required for static/edge deployment:

| Distributable Release Artifact | File Size | SHA-256 Digest | Packaging Specification |
| :--- | :--- | :--- | :--- |
| `artifacts/release/daynori-web-v2.0.0-rc1.tar.gz` | `1,823,845 bytes` | `663cc566011eecf6c78e1bfc99ca7e1ed6defb3c92ea59b6663c46d031801f5c` | Contains `apps/web/.next` (excluding `.next/cache`), `apps/web/public`, `apps/web/package.json`, and `apps/web/next.config.mjs`. |

### B. Individual Web / PWA Production Asset Hashes

These individual file digests verify the integrity of critical client-side assets served by the web application:

| Asset Path | SHA-256 Digest | Role & Verification Method |
| :--- | :--- | :--- |
| `apps/web/public/manifest.json` | `417faac1bd5c0d083657a7a69c645a2387c797e1ac60500f462d9db3d280cf40` | Web App Manifest: standalone display, theme colors, launcher definitions |
| `apps/web/public/sw.js` | `6e243130bed7d29e51c330a378380805f87539798692abe5c4f8127bb1f70cb3` | Service Worker: offline caching, precache manifest, runtime cache strategies |
| `apps/web/public/offline-shell.html` | `1b0bf5f65c8d7330d0560fe41acc73a6a9806e9b7aff5cb60daacfc0fbd009cc` | Standalone offline fallback shell for zero-connectivity app boot |
| `apps/web/public/offline-shell.js` | `69649cdab12d593dc7a9fed5607aba0a22b9e5336e855d6117a9fd0ce0462e4f` | Client-side hydration script for offline shell fallback |
| `apps/web/public/brand/icon-192.png` | `eab6433abbca70b7392ead34a499c1d901bc48fe4e849bfff9ee43b66d6eee64` | Standard PWA launcher icon (192x192 PNG) |
| `apps/web/public/brand/icon-512.png` | `dc0ebf905510c9cae68046262c198a76d11fa010bcab53e3c1745bb8467b377e` | High-resolution PWA splash icon (512x512 PNG) |
| `apps/web/public/brand/icon-maskable-512.png` | `69d0b2d8a9438f3262692ba76aa64a9e547d5d4aab718d6450b6395f5f868835` | Android adaptive/maskable safe-zone icon (512x512 PNG) |

### C. Android Track Artifacts and Signing Guard

- **Application ID**: `com.daynori.app`
- **Target SDK**: `36` (Android 16 Google Play requirement) | **Compile SDK**: `36` | **Min SDK**: `24` (Android 7.0+)
- **Version Code**: `1` | **Version Name**: `0.1.0`
- **Task-Graph Signing Guard**: Verified active in `apps/mobile/plugins/withReleaseSigningGuard.js`.
- **Fail-Closed Behavior**: Distributable packaging `:app:assembleRelease` fails closed with `Release signing refused for distributable release task` when release credentials are absent.
- **Signing Keystore Status**: **`BLOCKED`** (`OWNER-SIGNING-KEYS`). No release keystore or credentials exist in the checkout.
- **Local Test Artifact**: Debug test APK `artifacts/release/app-debug-arm64.apk` (`0379f71cb48c953c5020cb393ba49084507d1f37afa06066622eb351c800a5b7`) is strictly labeled as a local test build and barred from distribution.

---

## 3. Surface Readiness Evaluated Independently

| Platform / Surface | Technical Build State | Smoke & Rehearsal Evidence | Policy & Compliance Review | Production Blockers | Readiness Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Web / PWA** | Next.js 15.5.27 production build passes cleanly (32 routes). Distributable archive packaged (`daynori-web-v2.0.0-rc1.tar.gz`). | `phase60-web-production-smoke.mjs` passed (18 checks); `phase102-v2-publication-rehearsal.test.ts` passed (7 scenarios). | Nonce-based CSP Level 3, standalone PWA manifest, public legal routes (`/privacy`, `/terms`, `/support`, `/account-deletion`) pass. | Production hosting target unapproved; DNS unconfigured; live Supabase project unlinked. | **READY FOR PROVISIONED HOSTING** |
| **Android Client** | Gradle prebuild and configuration tasks pass; `:app:assembleRelease` fails closed via guard. | 15 local rehearsal integration checks pass; debug APKs functional in emulator. | Target API 36 configured; Data safety matches SDK inventory; UGC/AI/Billing fail closed. | Release keystore missing (`OWNER-SIGNING-KEYS`); physical ARM64 TalkBack unverified (`DEF-V2-011`). | **NOT READY FOR RELEASE PACKAGING** |

---

## 4. Destinations, Rollout Limits, and Rollback Procedures

All fields below marked with `[UNDECIDED]` require formal owner determination:

### A. Web Deployment Destination & Parameters
- **Staging / Preview Target**: `preview.daynori.com` `[UNDECIDED / PENDING OWNER APPROVAL]`
- **Production Target**: `app.daynori.com` `[UNDECIDED / PENDING OWNER APPROVAL]`
- **Proposed Cloud Host**: Cloudflare Pages / Vercel Pro `[UNDECIDED / PENDING OWNER APPROVAL]`
- **Auth Provider Target**: Production Supabase project configured with site URL `https://app.daynori.com` and redirect URLs `[UNDECIDED / PENDING OWNER APPROVAL]`
- **Cohort Size**: 20 to 50 invited consenting beta testers
- **Monthly Operating Budget**: \$5–\$40/month low-tier envelope (stateless edge compute + database) `[UNDECIDED / PENDING OWNER APPROVAL]`
- **Permitted Synthetic Checks**:
  - Scoped HTTP health endpoint checks (`GET /health`, `GET /v1/status`).
  - Unauthenticated CSP header verification (`Content-Security-Policy` nonce format).
  - Single synthetic probe account creating a synthetic test note, verifying outbox replay, and executing soft deletion.
  - Real user data, private journals, and production user fixtures remain strictly prohibited.
- **Rollout Mechanism**: Atomic DNS/CNAME switch following successful smoke verification on preview domain.
- **Rollback Target & Procedures**:
  - Instant DNS cutover back to preview domain or static maintenance shell (`offline-shell.html`).
  - Database schema evolution is strictly additive; stateless API containers roll back instantly without down-migrations.
- **Rollback Triggers**:
  1. Sustained p95 mutation latency $>500$ms for 5 consecutive minutes.
  2. 5xx server error rate $>1\%$ over any 5-minute rolling window.
  3. Any unhandled exception causing data loss or storage corruption.
  4. Any detected breach of multi-tenant isolation or unauthorized data access.

### B. Android Store Track & Distribution Limits (Independent Track)
- **Application ID**: `com.daynori.app`
- **Target Google Play Track**: `[UNDECIDED / PENDING OWNER APPROVAL]`
  - *Option 1 (Recommended)*: **Internal Testing Track** (up to 100 invited testers; immediate availability without Google Play policy review wait).
  - *Option 2*: **Closed Testing Track** (required for personal developer accounts: 20 testers opted in for $\ge 14$ consecutive days before production track request).
- **Staged Rollout Limits**: **0% staged rollout** on first publication (Google Play policy does not support percentage staged rollouts for a new application; percentage rollout applies only to updates).
- **Rollback Target**: Google Play does not permit downgrading version codes. If an unrecoverable defect occurs, rollback is executed via **Forward-Fix Release (Version Code $N+1$)** or immediate activation of server-side kill switches (`DAYNORI_CORE_PREVIEW=true` or module deactivation).

---

## 5. Operational Roles & Incident Ownership

In accordance with repository release gates, all operational roles are documented below. All roles are currently **unassigned** awaiting owner staffing:

| Role Title | Operational Responsibilities | Designated Lead | Status |
| :--- | :--- | :--- | :--- |
| **Release Engineer** | Manage release builds, sign AAB artifacts, monitor Play Console tracks and web deployments | `[UNDECIDED / UNASSIGNED]` | **UNASSIGNED** |
| **Security & Vault Lead** | Safeguard signing keys, monitor vulnerability alerts, oversee vault cryptographic review | `[UNDECIDED / UNASSIGNED]` | **UNASSIGNED** |
| **Moderation Officer** | Review UGC abuse reports, handle takedown notices, enforce terms of service | `[UNDECIDED / UNASSIGNED]` | **UNASSIGNED** |
| **Support Triage Operator** | Monitor `support@daynori.com`, triage incoming bug reports, manage user inquiries | `[UNDECIDED / UNASSIGNED]` | **UNASSIGNED** |
| **AI Operations Lead** | Monitor LLM token budgets, prompt injection safeguards, model availability | `[UNDECIDED / UNASSIGNED]` | **UNASSIGNED** |

---

## 6. Comprehensive Gate-by-Gate Barrier Register (Grouped by Track)

### Track A: Bounded Web/PWA Beta Release Scope (Smallest Viable Release)

Only these 3 gates apply to the proposed Bounded Web/PWA Beta:

| Gate ID | Area | Status | Missing Evidence | Accountable Role | Next Concrete Action |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`OWNER-RELEASE-AUTH`** | Release | **BLOCKED** | Owner launch approval of candidate revision and web target domain | Project Owner | Review this publication record and grant explicit authorization. |
| **`DEF-V2-001`** | Auth | **OPEN** | Production Supabase / Google OAuth identity provider configuration for web domain | Operations Lead | Provision production Supabase project and set allowed redirect URLs. |
| **`DEF-V2-013`** | Usability | **BLOCKED** | Live sessions with $\ge 5$ consenting human users ($\ge 4$ unassisted) | UX Researcher / Owner | Conduct 5 live participant sessions with the invited web beta cohort. |

### Track B: Dedicated Android Release Track (Independent Hardware Track)

These gates apply exclusively to the native Android distribution and do NOT block the web beta:

| Gate ID | Area | Status | Missing Evidence | Accountable Role | Next Concrete Action |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`OWNER-SIGNING-KEYS`** | Release | **BLOCKED** | Authorized Android release keystore & credentials | Release Engineer / Owner | Securely provision `DAYNORI_RELEASE_STORE_*` outside Git. |
| **`DEF-V2-011`** | Hardware | **BLOCKED** | Physical ARM64 device startup & TalkBack latency profiling | QA / Accessibility Lead | Execute manual test checklist on physical Android phone. |

### Track C: Full Version 2 Gated Features (Future Public Scope)

These gates remain open for their respective features and are strictly fail-closed (403 / UI disabled) in the candidate build:

| Gate ID | Area | Status | Missing Evidence | Accountable Role | Next Concrete Action |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`DEF-V2-004`** | Security | **BLOCKED** | Independent qualified security review of vault cryptography | Security & Vault Lead | Commission external cryptographic audit before enabling Vault. |
| **`DEF-V2-008`** | AI / Biometrics | **BLOCKED** | Live LLM provider authorization & biometric Keystore | AI Operations Lead | Authorize synthetic provider testing and token budget before AI streaming. |
| **`DEF-V2-002`** | Push | **OPEN** | Native FCM / APNs push notification provider credentials | Mobile Lead | Configure Firebase Cloud Messaging in Google Cloud. |
| **`DEF-V2-005`** | Integration | **OPEN** | Google Cloud OAuth production verification for Drive | Product Lead | Submit OAuth verification and consent screen to Google. |
| **`DEF-V2-006`** | Moderation | **OPEN** | Staffed moderation officer assignment for rooms/chat | Moderation Officer | Staff moderation queue before rooms launch. |
| **`DEF-V2-007`** | Billing | **OPEN** | Play Console merchant setup & commercial pricing | Financial Officer | Complete Google Play merchant registration before in-app purchases. |

---

## 7. Proposed Phase 103 Post-Release Review Window Handoff

In accordance with [Phase 103 specification](../roadmap/phases/103-first-version-2-review-and-bounded-follow-up-plan.md), launch preparation attaches a formal proposal for a **finite post-release review window**.

### Review Window Parameters

- **Review Duration**: **14 calendar days** from live launch ($T+0$ to $T+14$).
- **Proposed Review Lead**: Project Owner / Assigned Review Lead `[UNDECIDED / UNASSIGNED]`.
- **Proposed Review End Date**: Launch Day $+14$ calendar days.
- **Phase 103 Operational Status**: Stays **`planned`** in `docs/roadmap/progress.json`. No autonomous recurring monitoring or follow-up code changes are to be implemented until the approved release runs and the review window concludes.

### Privacy-Preserving Evaluation Dimensions

All review observations strictly adhere to repository privacy rules (zero inspection of personal notes, journal entries, task titles, or user documents):

| Evaluation Dimension | Measurement Method & Privacy Safeguard | Acceptance Benchmark |
| :--- | :--- | :--- |
| **Reliability & Availability** | Aggregate HTTP status code distributions (2xx/4xx/5xx ratios) and edge uptime metrics. No URL query parameter or request body inspection. | Uptime $\ge 99.9\%$; 5xx server error rate $<0.1\%$. |
| **Support & Feedback Triage** | Ingested support receipts via `/v1/operator/feedback/reports`. Aggregate categorization (`bug`, `feedback`, `feature_request`). No personal user data copied to reports. | 100% of bug reports reviewed and assigned triage status within 48 hours. |
| **Crash & Exception Telemetry** | Client-side unhandled exception counts with anonymized stack signatures and synthetic crash hashes. Zero personal device identifiers or local storage contents included. | Zero unhandled crashes causing local state corruption or lost mutations. |
| **Mutation Latency** | Server-side request timing metrics (p50, p95, p99) on core organizer mutation endpoints (`/v1/workspaces/:id/notes`, `tasks`, `routines`). | p95 mutation latency $<300$ms under normal load. |
| **Tour & Learning Friction** | Completion rates for the 10 everyday guided tour chapters (`chapter_id` completion counts only; no personal tracking or session replay). | $\ge 70\%$ completion on started Everyday Tours; zero blocking errors reported in tour steps. |
| **Operating Cost Tracking** | Cumulative compute, storage, and egress billing statements from edge host and database providers. | Cumulative monthly run-rate within the \$5–\$40/month budget envelope. |

> [!NOTE]
> Actual review observations remain strictly **pending** until the owner approves and executes the release. Phase 103 will synthesize actual post-release data when the window concludes.

---

## 8. Exact Decision Package for Project Owner Approval

Before granting execution authorization, the project owner is requested to review and decide upon the following concrete items:

- [ ] **1. Exact Candidate Artifact**: Release candidate `2.0.0-rc1` at commit `5b5c4f8cbb8002a77f87b114174bd5db81867af7`.
- [ ] **2. Distributable Web Archive**: Distributable package `artifacts/release/daynori-web-v2.0.0-rc1.tar.gz` (SHA-256 `663cc566011eecf6c78e1bfc99ca7e1ed6defb3c92ea59b6663c46d031801f5c`).
- [ ] **3. Release Scope**: Bounded Web/PWA Beta (78 core actions enabled; 31 gated actions fail-closed for Vault, Rooms, AI, Billing).
- [ ] **4. Web Target Destinations**: Authorize staging (`preview.daynori.com`), production domain (`app.daynori.com`), and edge hosting provider (Cloudflare Pages / Vercel Pro).
- [ ] **5. Identity Provider Provisioning**: Authorize production Supabase project linking with redirect URLs.
- [ ] **6. Testing Cohort**: Authorize invitation of 20 to 50 consenting beta testers for usability research (`DEF-V2-013`).
- [ ] **7. Operating Budget**: Authorize monthly operating expenditure envelope of \$5–\$40/month.
- [ ] **8. Rollback Triggers & Destination**: Authorize rollback triggers (latency $>500$ms, 5xx $>1\%$, data corruption) and cutover to static offline fallback shell.
- [ ] **9. Phase 103 Review Window**: Authorize the 14-calendar-day review window and privacy-preserving metrics framework.
