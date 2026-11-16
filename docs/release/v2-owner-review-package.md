# Daynori Version 2 Owner Review Package

- **Review Date**: 2026-11-16
- **Scope**: Version 2 Release Candidate & Multi-Dimensional Staging Reconciliation (Phase 128)
- **Git HEAD**: `5286df9ef1de8e498cc2cd5b72de936c52f40368`
- **Candidate Label**: `2.0.0-rc6`
- **Status**: **Launch Package Complete — Release Approval BLOCKED**

---

## 1. Executive Summary

This package provides the project owner with all operational, legal, architectural, and financial information needed to evaluate Daynori Version 2. Under [ADR 0057](../decisions/0057-public-release-preflight-and-first-publication.md), [ADR 0101](../decisions/0101-version-2-release-candidate-and-operational-preparation.md), [ADR 0122](../decisions/0122-production-launch-package-and-owner-authorization-governance.md), and [ADR 0128](../decisions/0128-clean-candidate-rc6-rebuild-staging-verification-and-owner-package.md), engineering rehearsals and artifact builds do not constitute launch approval. Publication, store uploads, beta cohort invitations, live provider spending, and cloud deployments remain strictly blocked until the owner explicitly authorizes them.

---

## 2. Candidate Artifacts, Hashes, and Build Toolchain

### A. Distributable Release Artifacts (Candidate 2.0.0-rc6)
- **Build Toolchain**: Node `v24.21.0` (engines request `^24.21.0`), Next.js `15.5.27`, Fastify `5.2.1`, React `19.0.0`
- **Next.js BUILD_ID**: `whaN7HuVFERNvQiYRlevt` (32 routes compiled)
- **Distributable Archives**:
  - `artifacts/release/daynori-web-v2.0.0-rc6.tar.gz` (SHA-256: `8299fc016385ae5120a49e8ab745132bb422b549e320c06cf36490a76b1c299f`, size: 1,825,946 bytes)
  - `artifacts/release/daynori-api-v2.0.0-rc6.tar.gz` (SHA-256: `146f5deb7c1b82fb72950d648e25b405c84df25a9efa031cb427fdb1e45bccda`, size: 564,522 bytes)
  - Manifest: `artifacts/release/candidate-2.0.0-rc6-manifest.json`
- **Public Client Asset Digests**:
  - `apps/web/public/manifest.json`: `417faac1bd5c0d083657a7a69c645a2387c797e1ac60500f462d9db3d280cf40`
  - `apps/web/public/sw.js`: `6e243130bed7d29e51c330a378380805f87539798692abe5c4f8127bb1f70cb3`
  - `apps/web/public/offline-shell.html`: `1b0bf5f65c8d7330d0560fe41acc73a6a9806e9b7aff5cb60daacfc0fbd009cc`
  - `apps/web/public/offline-shell.js`: `69649cdab12d593dc7a9fed5607aba0a22b9e5336e855d6117a9fd0ce0462e4f`
  - `apps/web/public/brand/icon-192.png`: `eab6433abbca70b7392ead34a499c1d901bc48fe4e849bfff9ee43b66d6eee64`
  - `apps/web/public/brand/icon-512.png`: `dc0ebf905510c9cae68046262c198a76d11fa010bcab53e3c1745bb8467b377e`
  - `apps/web/public/brand/icon-maskable-512.png`: `69d0b2d8a9438f3262692ba76aa64a9e547d5d4aab718d6450b6395f5f868835`

### B. Android Candidate Verification
- **Application ID**: `com.daynori.app`
- **Target SDK / Compile SDK**: `36` / `36` (Target API 36 Android 16 requirement)
- **Version Code**: `1` | **Version Name**: `0.1.0`
- **Task-Graph Signing Guard**: Verified active (`apps/mobile/plugins/withReleaseSigningGuard.js`).
- **Fail-Closed Verification**: `node scripts/mobile-android-release-path.mjs exercise-gradle` confirmed:
  - Configuration task `:app:tasks` succeeds without release credentials.
  - Distributable packaging `:app:assembleRelease` throws `GradleException: Release signing refused for distributable release task`. Silent debug fallback is impossible.
- **Signing Status**: **`BLOCKED`** — No production release keystore exists in the workspace. Debug-signed test artifacts (`artifacts/release/app-debug-arm64.apk` SHA-256 `0379F71CB48C953C5020CB393BA49084507D1F37AFA06066622EB351C800A5B7`) are accurately labeled and excluded from release eligibility.

---

## 3. Official Policy & Compliance Review (Checked 2026-11-10)

All requirements checked against then-current official vendor guidelines on **2026-11-10**:

| Platform / Surface | Policy Area | Official Guideline & Link | Status in Daynori Candidate |
| :--- | :--- | :--- | :--- |
| **Google Play** | Target API | [Google Play Target API Requirements](https://support.google.com/googleplay/android-developer/answer/11926878) | **PASS**: Target SDK is 36 in `app.json` and generated Gradle. |
| **Google Play** | 16 KB Page Alignment | [Android 15+ 16 KB page-size support](https://developer.android.com/guide/practices/page-sizes) | **UNVERIFIED**: Requires `llvm-objdump` / APK Analyzer on signed AAB. |
| **Google Play** | Account Deletion | [Play Account Deletion Policy](https://support.google.com/googleplay/android-developer/answer/13327111) | **PASS**: In-app deletion + public web `/account-deletion` endpoint verified. |
| **Google Play** | Data Safety | [Play Data Safety Guidance](https://support.google.com/googleplay/android-developer/answer/10787469) | **PASS**: Disclosures match actual SDKs (Expo, SQLite, SecureStore). |
| **Google Play** | UGC & Moderation | [Play UGC Policy](https://support.google.com/googleplay/android-developer/answer/9876937) | **GATED**: Rooms disabled (`DEF-V2-006`); unstaffed moderation blocks launch. |
| **Google Play** | AI Generated Content | [Play AI-Generated Content Policy](https://support.google.com/googleplay/android-developer/answer/13985936) | **GATED**: Live AI streaming disabled (`DEF-V2-008`); fail-closed 403 verified. |
| **Google Play** | Closed Testing | [Personal Developer Account Testing](https://support.google.com/googleplay/android-developer/answer/14151465) | **UNVERIFIED**: Personal accounts require 20 opted-in testers for 14 days. |
| **Google Play** | Billing & Monetization | [Google Play Billing Policy](https://support.google.com/googleplay/android-developer/answer/10281818) | **GATED**: Billing purchases return 403; merchant account pending (`DEF-V2-007`). |
| **Apple App Store** | App Review Guidelines | [Apple App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) | **BLOCKED**: iOS native builds and TestFlight evidence remain unmet (Phase 61/62). |
| **Web Browsers** | PWA & Security | [W3C Web App Manifest](https://www.w3.org/TR/appmanifest/) & CSP Level 3 | **PASS**: Strict nonce-based CSP, no inline scripts, standalone manifest, icons verified. |

---

## 4. Operational & Disaster Recovery Rehearsals

All 5 candidate operations rehearsals in [`tests/e2e/phase101-v2-operations-rehearsal.test.ts`](../../tests/e2e/phase101-v2-operations-rehearsal.test.ts) executed and passed:

1. **`OP-REHEARSAL-01` (Migration Idempotency & Forward-Fix Invariant)**: Rehearsed schema evolution; baseline notes and tasks survived idempotent migration without data loss; confirmed forward-fix convention.
2. **`OP-REHEARSAL-02` (Mutation Outbox & Offline Replay)**: Queued drafts and edits survived simulated process interruption; replayed sequentially upon reconnect; stale `baseRevision` edits correctly rejected with 409 conflict.
3. **`OP-REHEARSAL-03` (Object Metadata Checksum & Deletion Suppression)**: Uploaded binary object validated against client SHA-256; item deletion resulted in hard removal from `app.items`, guaranteeing no accidental tombstone resurrection upon snapshot restore.
4. **`OP-REHEARSAL-04` (Emergency Kill Switches)**: Proved production fail-closed boundaries (Vault 403, Rooms 403, Billing 403, AI 403); feature personalization dynamically collapses shell tabs.
5. **`OP-REHEARSAL-05` (Synthetic Reviewer Isolation)**: Evaluated reviewer credentials (`reviewer@daynori.test`); verified report creation (201), cross-tenant isolation (404/403), and operator route fencing (403).

---

## 5. Rollout and Rollback Destinations

### Rollout Strategy
Under [ADR 0057](../decisions/0057-public-release-preflight-and-first-publication.md):
- **First Publication**: Google Play does NOT support percentage staged rollout for a brand-new application. First release must use **Internal Testing Track** or **Closed Beta Track** (for personal accounts meeting the 20-tester requirement).
- **Subsequent Updates**: Percentage rollout ($10\% \to 25\% \to 50\% \to 100\%$) applies only to version updates once the initial release is live.
- **Web / PWA**: Staged rollout via preview domain (`preview.daynori.com`) before DNS switch to production (`app.daynori.com`).

### Rollback & Forward-Fix Policy
- **Database & API**: Database schema changes are strictly additive. Destructive down-migrations are prohibited. Rollback uses **forward-fix deployments**.
- **Android Client**: Google Play does not permit rolling back to a lower version code. Any client-side fix requires publishing version code $N+1$.
- **Emergency Halt (Kill Switches)**:
  - If unexpected server error occurs, platform operator triggers feature release switches (`DAYNORI_AI_LIVE_ENABLED=false`, etc.).
  - Clients gracefully degrade without requiring immediate client-side binary reinstalls.

### Required Owner Decisions
1. **Target Account Type**: Confirm whether the Google Play Developer Account is Personal or Organization.
2. **Target Release Track**: Select between **Internal Testing Track** (up to 100 invited testers) or **Closed Testing Track** (20 testers for 14 days).
3. **Domain Ownership**: Clear and register `daynori.com` (and configure `app.daynori.com`).
4. **Release Signing**: Provide secure release signing keystore outside of Git.

---

## 6. Hosting, Database, and Worker Operating Cost Estimates

All costs are empirical projections reconciled against the measured Phase 127 capacity envelope and free-tier saturation limits. **No paid resources have been provisioned.**

| Component | Provider / Architecture | Low-Cost Closed Beta Tier ($\le 30$ CCU / 1k Users) | Recommended Managed PaaS Tier (150–300 CCU / 5k–10k Users) | Approval Status |
| :--- | :--- | :--- | :--- | :--- |
| **Web / PWA Hosting** | Render Static / Vercel Pro | \$0 / mo (Free/Hobby tier) | \$20 / mo (Pro tier) | **UNAPPROVED** |
| **API Compute** | Render Starter / Railway Team / Fly.io | \$7 / mo (Starter 0.5 vCPU / 512MB) | \$40 / mo (2 instances with autoscaling) | **UNAPPROVED** |
| **PostgreSQL Database** | Managed Supabase Pro | \$25 / mo (Pro tier, 60 direct pooler connections) | \$45 / mo (Pro tier + Compute Add-on + PgBouncer pooling) | **UNAPPROVED** |
| **Object Storage (Blob)** | Cloudflare R2 / Supabase Storage | \$0 (Within 10GB free tier) | \$5 – \$15 / mo (Egress free) | **UNAPPROVED** |
| **Email Transport** | Resend / Postmark (Transactional) | \$0 (Free tier < 3,000/mo) | \$20 / mo (Basic plan) | **UNAPPROVED** |
| **AI LLM Inference** | Gemini 1.5 Flash / Groq / OpenAI | \$0 (Live streaming disabled) | \$15 – \$50 / mo (Usage-based, post-beta) | **UNAPPROVED** |
| **Total Projected Cost** | — | **\$32 / month** | **\$105 – \$160 / month** | **UNAPPROVED** |

---

## 7. Operational Roles & Responsibilities

In accordance with [`docs/operations/incident-response-and-support-roster.md`](../operations/incident-response-and-support-roster.md), operational roles are proposed below. All roles are currently **pending explicit owner confirmation**:

| Role Title | Operational Responsibilities | Proposed Assignee | Current Status |
| :--- | :--- | :--- | :--- |
| **Incident Commander (IC)** | Directs incident mitigation, leads post-incident reviews, authorizes emergency rollback | Project Owner | `PENDING_OWNER_CONFIRMATION` |
| **Technical Operations Lead** | Infrastructure scaling, database connection pool tuning, CDN configuration | Platform Architecture Lead | `PENDING_OWNER_CONFIRMATION` |
| **Security & Privacy Officer** | Oversees vulnerability management, log redaction, token revocation, vault audit | Security Officer | `PENDING_OWNER_CONFIRMATION` |
| **Support & Communications Lead** | User bug reports, status page updates, communications | Support Lead | `PENDING_OWNER_CONFIRMATION` |
| **Moderation Officer** | Review UGC abuse reports, handle takedown notices, enforce terms | Moderation Lead | `PENDING_OWNER_CONFIRMATION` |

---

## 8. Synthetic Reviewer Access Guide

For App Store Review and Google Play Policy Reviewers:

- **Login Mode**: Synthetic Testing / Reviewer Access.
- **Reviewer Credentials**:
  - Email: `reviewer@daynori.test`
  - Password: `SyntheticReviewerPass2026!` (Local/Staging test harness)
- **Included Review Data**:
  - Sample Welcome Tour
  - 3 Personal Notes (Formatting, Guidelines, Hyperlinks)
  - 4 Everyday Tasks (with Priorities and Deadlines)
  - 2 Daily Routines (Morning Review, Evening Reflection)
  - Interactive Calendar Agenda
  - Contextual Help Search and Support Feedback Form
- **Excluded Features**: Fenced behind explicit disclaimers: Vault, Rooms, Live AI LLM, In-app billing.

---

## 9. Draft Release Notes (Candidate 2.0.0-rc1)

```markdown
### What's New in Daynori 2.0
- **Unified Daily Companion**: Your notes, tasks, routines, and calendar together in one fast, private personal workspace.
- **Reliable Offline-First Engine**: Capture thoughts, update tasks, and organize routines anywhere—changes save locally and sync seamlessly when you're back online.
- **Customizable Organization**: Personalize your home screen, group items in deep nested folders, and adapt your primary tabs to fit your workflow.
- **Action-Based Learning**: Get up to speed quickly with interactive, step-by-step guided tours through real controls.
- **Nori Mascot Companion**: A warm, original vector mascot guiding you through everyday planning.
- **Accessible & Responsive**: Full keyboard navigation, screen-reader semantics, high contrast, and dynamic text scaling.
```

---

## 10. Pre-Publication Checklist

Before authorized production publication can occur:
- [ ] Project Owner formally approves bounded beta / candidate scope.
- [ ] Release signing keystore (`DAYNORI_RELEASE_STORE_*`) provided in secure environment.
- [ ] Production domain (`daynori.com`) purchased, DNS configured, SSL active.
- [ ] Support email (`support@daynori.com`) and privacy mailbox active and monitored.
- [ ] Live consenting human participant evaluation completed ($\ge 5$ users, $\ge 4$ unassisted) to close `DEF-V2-013`.
- [ ] Physical Android ARM64 device testing with TalkBack completed to close `DEF-V2-011`.
- [ ] Production Supabase / OAuth IdP configured to close `DEF-V2-001`.
- [ ] Owner authorizes hosting and database budget line items.
