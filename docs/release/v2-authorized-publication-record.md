# Daynori Version 2 Authorized Publication Record

- **Record Date**: 2026-11-10
- **Candidate Revision**: `5b5c4f8cbb8002a77f87b114174bd5db81867af7`
- **Candidate Label**: `2.0.0-rc1`
- **Owning Phase**: [Phase 102 — Authorized Version 2 publication and live verification](../roadmap/phases/102-authorized-version-2-publication-and-live-verification.md)
- **Governing Decisions**: [ADR 0057](../decisions/0057-public-release-preflight-and-first-publication.md), [ADR 0074](../decisions/0074-standing-phase71-scheduling-and-push.md), [ADR 0101](../decisions/0101-version-2-release-candidate-and-operational-preparation.md), [ADR 0102](../decisions/0102-authorized-version-2-publication-and-live-verification.md)
- **Operational Status**: **ENGINEERING LAUNCH PREPARATION ONLY — PUBLICATION BLOCKED**

---

## 1. Proposed Release Scope: Bounded Personal Beta vs Full V2

The candidate repository supports two distinct scope envelopes. Under [ADR 0100](../decisions/0100-full-version-2-beta-and-readiness-reconciliation.md) and [v2-release-candidate-manifest.md](v2-release-candidate-manifest.md), only the **Bounded Personal Beta** is eligible for immediate evaluation; **Full Version 2** remains gated.

| Scope Boundary | Included Feature Modules | Gated Modules & Explicit Blockers | Intended Audience |
| :--- | :--- | :--- | :--- |
| **Proposed Bounded Personal Beta** *(Recommended for Initial Launch)* | **78 Verified Actions**: Personal Notes, Everyday Tasks, Daily Routines, Agenda Calendar, Interactive Guided Tours, Offline-First SQLite/Web Storage Outbox Sync, Local File Attachments, In-App Support Feedback. | **Vault** (`DEF-V2-004`), **Rooms / Chat** (`DEF-V2-006`), **Live AI Streaming** (`DEF-V2-008`), **Play Billing Purchases** (`DEF-V2-007`), **Google Drive Sync** (`DEF-V2-005`), **Native Push** (`DEF-V2-002`). | Up to 100 invited closed-cohort testers or policy reviewers. |
| **Full Version 2** *(Future Complete Target)* | **109 Total Actions**: All bounded beta features PLUS Cryptographic Vault, Multi-User Collaborative Rooms, Live AI Assistant Streaming, In-App Subscriptions, Google Drive OAuth, Native FCM/APNs Notifications. | Gated on independent qualified vault audit (`DEF-V2-004`), staffed moderation queue (`DEF-V2-006`), live LLM provider budget authorization (`DEF-V2-008`), and Google Play merchant setup (`DEF-V2-007`). | General public web users and Google Play Store production track. |

---

## 2. Candidate Revision and Verified Artifact Hashes

- **Git HEAD SHA**: `5b5c4f8cbb8002a77f87b114174bd5db81867af7`
- **Branch**: `codex/free-core-preview`
- **Candidate Label**: `2.0.0-rc1`

### A. Web / PWA Production Artifact Hashes
Built reproducibly with Node `v24.11.1`, Next.js `15.5.27`, React `19.0.0`:

| Artifact Path | SHA-256 Digest | Verification Method |
| :--- | :--- | :--- |
| `apps/web/public/manifest.json` | `417faac1d52033c4a2dddb9c2cf1d5ba596da3515438c82361cfd31ef0e854fa` | Verified JSON structure, standalone display, icons, start_url |
| `apps/web/public/sw.js` | `6e2431306ebf19f29bf5b273b4329241b712c6a26cfb1ef957ec521a0a525da4` | Service worker offline caching, asset precache manifest |
| `apps/web/public/offline-shell.html` | `1b0bf5f68b6a9354fb889e40632a6da7089faea8f51a700ee054d55f41284d72` | Verified standalone fallback page for zero-connectivity boots |
| `apps/web/public/offline-shell.js` | `69649cda2524d77579c354fe385759efca823c921312384a6b22ebc2a2dc34df` | Local offline shell hydration logic |
| `apps/web/public/brand/icon-192.png` | `eab6433abbca70b7392ead34a499c1d901bc48fe4e849bfff9ee43b66d6eee64` | Standard PWA launcher icon |
| `apps/web/public/brand/icon-512.png` | `dc0ebf905510c9cae68046262c198a76d11fa010bcab53e3c1745bb8467b377e` | High-resolution splash icon |
| `apps/web/public/brand/icon-maskable-512.png` | `69d0b2d8a9438f3262692ba76aa64a9e547d5d4aab718d6450b6395f5f868835` | Android adaptive/maskable safe-zone icon |

### B. Android Test Artifacts and Distributable Packaging Guard
- **Application ID**: `com.daynori.app`
- **Target SDK**: `36` (Android 16 Google Play requirement)
- **Compile SDK**: `36` | **Min SDK**: `24` (Android 7.0+)
- **Version Code**: `1` | **Version Name**: `0.1.0`
- **Task-Graph Signing Guard**: Verified active in `apps/mobile/plugins/withReleaseSigningGuard.js`.
- **Fail-Closed Behavior**: Distributable packaging `:app:assembleRelease` fails closed with `Release signing refused for distributable release task` when release credentials are absent.
- **Signing Keystore Status**: **`BLOCKED`** (`OWNER-SIGNING-KEYS`). No release keystore or credentials exist in the checkout.
- **Local Test Artifact**: Debug test APK `artifacts/release/app-debug-arm64.apk` (`0379f71cb48c953c5020cb393ba49084507d1f37afa06066622eb351c800a5b7`) is strictly labeled as a local test build and barred from distribution.

---

## 3. Surface Readiness Evaluated Independently

| Platform / Surface | Technical Build State | Smoke & Rehearsal Evidence | Policy & Compliance Review | Production Blockers | Readiness Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Web / PWA** | Next.js 15.5.27 production build passes cleanly (32 routes). | `phase60-web-production-smoke.mjs` passed (18 checks); `phase102-v2-publication-rehearsal.test.ts` passed (6 scenarios). | Nonce-based CSP Level 3, standalone PWA manifest, public legal routes (`/privacy`, `/terms`, `/support`, `/account-deletion`) pass. | Production hosting target unapproved; DNS unconfigured. | **READY FOR PROVISIONED HOSTING** |
| **Android Client** | Gradle prebuild and configuration tasks pass; `:app:assembleRelease` fails closed via guard. | 15 local rehearsal integration checks pass; debug APKs functional in emulator. | Target API 36 configured; Data safety matches SDK inventory; UGC/AI/Billing fail closed. | Release keystore missing (`OWNER-SIGNING-KEYS`); physical ARM64 TalkBack unverified (`DEF-V2-011`). | **NOT READY FOR RELEASE PACKAGING** |

---

## 4. Destinations, Rollout Limits, and Rollback Procedures

All fields below marked with `[UNDECIDED]` require formal owner determination:

### A. Web Deployment Destination
- **Staging / Preview Target**: `preview.daynori.com` `[UNDECIDED / PENDING OWNER APPROVAL]`
- **Production Target**: `app.daynori.com` `[UNDECIDED / PENDING OWNER APPROVAL]`
- **Proposed Cloud Host**: Cloudflare Pages / Vercel Pro `[UNDECIDED / PENDING OWNER APPROVAL]`
- **Rollout Mechanism**: Atomic DNS/CNAME switch following successful smoke verification on preview domain.
- **Rollback Target**: Instant DNS cutover back to preview domain or static maintenance shell (`offline-shell.html`).

### B. Android Store Track & Distribution Limits
- **Application ID**: `com.daynori.app`
- **Target Google Play Track**: `[UNDECIDED / PENDING OWNER APPROVAL]`
  - *Option 1 (Recommended)*: **Internal Testing Track** (up to 100 invited testers; immediate availability without Google Play policy review wait).
  - *Option 2*: **Closed Testing Track** (required for personal developer accounts: 20 testers opted in for $\ge 14$ consecutive days before production track request).
- **Staged Rollout Limits**: **0% staged rollout** on first publication (Google Play policy does not support percentage staged rollouts for a new application; percentage rollout applies only to updates).
- **Rollback Target**: Google Play does not permit downgrading version codes. If an unrecoverable defect occurs, rollback is executed via **Forward-Fix Release (Version Code $N+1$)** or immediate activation of server-side kill switches (`DAYNORI_CORE_PREVIEW=true` or module deactivation).

### C. Database & API Rollback Target
- **Database Schema Invariant**: Database migrations are strictly additive (5-digit prefix). Destructive down-migrations are prohibited.
- **Rollback Method**: Forward-fix migration or instant deployment rollback of stateless API containers.

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

## 6. Comprehensive Gate-by-Gate Barrier Register

| Gate ID | Area | Status | Missing Evidence | Accountable Role | Next Concrete Action |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`OWNER-SIGNING-KEYS`** | Release | **BLOCKED** | Authorized Android release keystore & credentials | Release Engineer / Owner | Securely provision `DAYNORI_RELEASE_STORE_*` outside Git. |
| **`OWNER-RELEASE-AUTH`** | Release | **BLOCKED** | Owner launch approval of candidate and destinations | Project Owner | Review this publication record and grant explicit authorization. |
| **`DEF-V2-013`** | Usability | **BLOCKED** | Live sessions with $\ge 5$ consenting human users ($\ge 4$ unassisted) | UX Researcher / Owner | Conduct 5 live participant sessions using authorized protocol. |
| **`DEF-V2-011`** | Hardware | **BLOCKED** | Physical ARM64 device startup & TalkBack latency profiling | QA / Accessibility Lead | Execute manual test checklist on physical Android phone. |
| **`DEF-V2-004`** | Security | **BLOCKED** | Independent qualified security review of vault cryptography | Security & Vault Lead | Commission external cryptographic audit. |
| **`DEF-V2-008`** | AI / Biometrics | **BLOCKED** | Live LLM provider authorization & biometric Keystore | AI Operations Lead | Authorize synthetic provider testing and token budget. |
| **`DEF-V2-001`** | Auth | **OPEN** | Production Supabase / Google OAuth identity provider | Operations Lead | Provision production Supabase project and credentials. |
| **`DEF-V2-002`** | Push | **OPEN** | Native FCM / APNs push notification provider credentials | Mobile Lead | Configure Firebase Cloud Messaging in Google Cloud. |
| **`DEF-V2-005`** | Integration | **OPEN** | Google Cloud OAuth production verification for Drive | Product Lead | Submit OAuth verification and consent screen to Google. |
| **`DEF-V2-006`** | Moderation | **OPEN** | Staffed moderation officer assignment for rooms/chat | Moderation Officer | Staff moderation queue before rooms launch. |
| **`DEF-V2-007`** | Billing | **OPEN** | Play Console merchant setup & commercial pricing | Financial Officer | Complete Google Play merchant registration. |

---

## 7. What the Owner Would Be Approving

Before granting execution authorization in a future instruction, the owner must formally approve the following specific items:

- [ ] **Exact Candidate Artifact**: Release candidate `2.0.0-rc1` at commit `5b5c4f8cbb8002a77f87b114174bd5db81867af7`.
- [ ] **Release Scope**: Bounded Personal Beta (Personal organizer tools enabled; Vault, Rooms, AI, Billing gated).
- [ ] **Web Deployment Destination**: Production domain (`app.daynori.com`) and cloud host tier.
- [ ] **Android Distribution Track**: Google Play Console Internal Testing Track (up to 100 invited testers).
- [ ] **Monthly Operating Budget**: Hosting, compute, and database line items (\$5–\$40/month low tier).
- [ ] **Release Signing Keystore**: Keystore file and credentials supplied securely outside Git.
- [ ] **Permitted Live Smoke Verification**: Scoped synthetic accounts exercising organizer save/sync.
