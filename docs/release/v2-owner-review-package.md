# Daynori Version 2 Owner Review Package

- **Review Date**: 2026-11-10
- **Scope**: Version 2 Release Candidate & Operational Preparation (Phase 101)
- **Git HEAD**: `bf7a201f89508f267eda07d36c2eb32a62ac36cf`
- **Candidate Label**: `2.0.0-rc1`
- **Status**: **Engineering Preparation Only — Release Approval BLOCKED**

---

## 1. Executive Summary

This package provides the project owner with all operational, legal, architectural, and financial information needed to evaluate Daynori Version 2. Under [ADR 0057](../decisions/0057-public-release-preflight-and-first-publication.md) and [ADR 0101](../decisions/0101-version-2-release-candidate-and-operational-preparation.md), engineering rehearsals and artifact builds do not constitute launch approval. Publication, store uploads, beta cohort invitations, live provider spending, and cloud deployments remain strictly blocked until the owner explicitly authorizes them.

---

## 2. Candidate Artifacts, Hashes, and Build Toolchain

### A. Web / PWA Production Build
- **Build Command**: `pnpm --filter @daynori/web build`
- **Toolchain**: Node `v24.11.1` (engines request `^24.21.0`), Next.js `15.5.27`, React `19.0.0`
- **Artifact Hashes**:
  - `apps/web/public/manifest.json`: `417FAAC1BD5C0D083657A7A69C645A2387C797E1AC60500F462D9DB3D280CF40`
  - `apps/web/public/sw.js`: `6E243130BED7D29E51C330A378380805F87539798692ABE5C4F8127BB1F70CB3`
  - `apps/web/public/offline-shell.html`: `1B0BF5F65C8D7330D0560FE41ACC73A6A9806E9B7AFF5CB60DAACFC0FBD009CC`
  - `apps/web/public/offline-shell.js`: `69649CDAB12D593DC7A9FED5607ABA0A22B9E5336E855D6117A9FD0CE0462E4F`
  - `apps/web/public/brand/icon-192.png`: `EAB6433ABBCA70B7392EAD34A499C1D901BC48FE4E849BFFF9EE43B66D6EEE64`
  - `apps/web/public/brand/icon-512.png`: `DC0EBF905510C9CAE68046262C198A76D11FA010BCAB53E3C1745BB8467B377E`
  - `apps/web/public/brand/icon-maskable-512.png`: `69D0B2D8A9438F3262692BA76AA64A9E547D5D4AAB718D6450B6395F5F868835`

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

All costs are projections for budgeting purposes only. **No paid resources have been provisioned.**

| Component | Provider / Architecture | Low Usage Tier (20–100 Users) | Medium Usage Tier (500–1,000 Users) | Approval Status |
| :--- | :--- | :--- | :--- | :--- |
| **Web / PWA Hosting** | Cloudflare Pages / Vercel Pro | \$0 / mo (Free tier) | \$20 / mo (Pro tier) | **UNAPPROVED** |
| **API Compute** | Fly.io / Railway / Cloud Run | \$5 – \$15 / mo (2 instances) | \$30 – \$60 / mo (autoscaled) | **UNAPPROVED** |
| **PostgreSQL Database** | Managed Supabase / Neon | \$0 – \$25 / mo (Pro tier) | \$25 – \$50 / mo (Compute Add-on) | **UNAPPROVED** |
| **Object Storage (Blob)** | Cloudflare R2 / Supabase Storage | \$0 (Within 10GB free tier) | \$5 – \$15 / mo (Egress free) | **UNAPPROVED** |
| **Email Transport** | Resend / Postmark (Transactional) | \$0 (Free tier < 3,000/mo) | \$20 / mo (Basic plan) | **UNAPPROVED** |
| **AI LLM Inference** | Gemini 1.5 Flash / Groq / OpenAI | \$0 (Live streaming disabled) | \$15 – \$50 / mo (Usage-based) | **UNAPPROVED** |
| **Total Projected Cost** | — | **\$5 – \$40 / month** | **\$90 – \$215 / month** | **UNAPPROVED** |

---

## 7. Operational Roles & Responsibilities

In accordance with repository release gates, all operational roles are documented below. All roles are currently **unassigned** awaiting owner staffing:

| Role | Responsibilities | Current Assignee |
| :--- | :--- | :--- |
| **Release Engineer** | Manage release builds, sign AAB artifacts, monitor Play Console tracks | `unassigned` |
| **Security & Vault Lead** | Oversee cryptographic key safety, commission external vault audit | `unassigned` |
| **Moderation Officer** | Review UGC abuse reports, handle takedown notices, enforce terms | `unassigned` |
| **Support Triage Operator** | Monitor `support@daynori.com`, triage incoming bug reports & suggestions | `unassigned` |
| **AI Operations Lead** | Monitor LLM token budgets, prompt injection safeguards, model availability | `unassigned` |

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
