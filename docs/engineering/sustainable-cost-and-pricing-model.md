# Sustainable Cost and Pricing Model

- Document Version: 1.0.0
- Date: 2026-11-06
- Status: Proposed for Owner Decision (Non-Commercial Engineering Model)
- Governing ADRs: [ADR 0012](../decisions/0012-native-hardware-capabilities-and-billing-boundaries.md), [ADR 0054](../decisions/0054-billing-entitlements-and-purchase-lifecycle.md), [ADR 0089](../decisions/0089-billing-entitlements-and-sustainable-plan-readiness.md)
- Defect Marker: `DEF-V2-007` (Commercial decisions and merchant configuration pending)

---

## 1. Executive Summary & Cost Sustainability Objective

Daynori is designed as a local-first, privacy-respecting daily personal organizer. To ensure long-term viability without relying on advertising or selling user data, the infrastructure must operate on a sustainable, unit-economic foundation where paid subscription tiers cover direct costs, support, infrastructure overhead, and platform fees with safe operating margins.

> [!IMPORTANT]
> **Independent Release Gates Invariant**:
> Payment or subscription tier **never unlocks or bypasses unverified modules**.
> - **Vault (Phase 86)**: Subject to independent qualified security review and hardware gates. UI locking is not encryption.
> - **Shared Rooms & Chat (Phase 88)**: Subject to staffed 24/7 human moderation operations and legal review under `DEF-V2-006`.
> - **Google Drive Connector (Phase 87)**: Subject to Google Cloud project OAuth credentials and live interactive consent under `DEF-V2-005`.
> - **AI Assistant (Phase 55)**: Subject to explicit user opt-in, privacy policy disclosure, and provider evaluation.

---

## 2. Infrastructure & Operating Cost Drivers (Primary Sources)

All figures below are in USD ($) and reflect published pricing as of late 2026. Each cost driver is explicitly classified as **measured local**, **provider quote**, **industry benchmark estimate**, or **unknown**.

### 2.1 Storage & Data Transfer (Supabase / AWS S3)
*Primary Sources*: [Supabase Pricing](https://supabase.com/pricing) (reviewed 2026-10-13), [AWS S3 Pricing](https://aws.amazon.com/s3/pricing/) (reviewed 2026-10-13).

| Cost Driver | Rate | Classification | Plan Impact |
|---|---|---|---|
| Stored Blob Storage | $0.021 / GB / month | Provider quote | Free: 100 MB = $0.002/mo; Plus: 10 GB = $0.21/mo; Pro: 50 GB = $1.05/mo |
| Data Transfer Out (Egress) | $0.090 / GB | Provider quote | Average user sync: ~2–5 GB/mo = $0.18–$0.45/mo |
| S3 API Requests (PUT/POST) | $0.005 / 1,000 req | Provider quote | Estimated ~$0.02/user/mo |
| Backup Storage & Replication | ~20% of storage cost | Estimate | Estimated ~$0.04/user/mo on Plus |

### 2.2 Database & Background Compute (PostgreSQL & Workers)
*Primary Sources*: [Supabase Platform](https://supabase.com/docs/guides/platform/compute-add-ons), [Fly.io Compute Pricing](https://fly.io/docs/about/pricing/).

| Cost Driver | Rate | Classification | Unit Allocation |
|---|---|---|---|
| Supabase Pro Instance | $25.00 / month base | Provider quote | Shared across active pool (~$0.05–$0.10/MAU) |
| Dedicated Worker Compute | $5.00–$15.00 / node / month | Estimate | Background event reconciliation, reminder dispatch (~$0.03/user/mo) |
| Connection Pooling (Supavisor) | Included in Pro | Provider quote | $0.00 |

### 2.3 Optional AI Assistant Provider Tokens
*Primary Sources*: [Google Gemini API Pricing](https://ai.google.dev/pricing) (2026), [Anthropic Claude Pricing](https://www.anthropic.com/pricing) (2026).

| Model Tier | Input Rate (/1M tokens) | Output Rate (/1M tokens) | Monthly Ceiling Cost |
|---|---|---|---|
| Lightweight (Gemini 1.5 Flash) | $0.075 | $0.300 | 500k tokens (70% in, 30% out) = **~$0.07/mo** |
| Advanced (Claude 3.5 Haiku) | $0.800 | $4.000 | 500k tokens (70% in, 30% out) = **~$0.88/mo** |
| *Daynori Rule*: Plan raises the ceiling only; user must explicitly opt in and server enforces hard quota cutoff. |

### 2.4 Customer Support & Staffed Moderation
*Primary Sources*: [HelpScout / Zendesk Benchmark Data](https://www.helpscout.com/blog/customer-service-costs/), Phase 88 Moderation Operations Package (`docs/engineering/moderation-operations-package.md`).

| Driver | Rate / Metric | Classification | Unit Allocation |
|---|---|---|---|
| General Customer Support | 1.5% monthly ticket rate @ $12/ticket resolution | Industry benchmark | **~$0.18 / active user / month** |
| Moderation Triage (Rooms) | Contracted 24/7 rota ($15–$20/hr base) | Estimate | Fixed overhead; only allocated to collaboration users |
| Chargeback / Dispute Fees | $15.00 per dispute | Platform standard | Covered by fraud prevention and immediate auto-cancel |

### 2.5 Payment Platform & Processing Fees
*Primary Sources*: [Google Play Service Fees](https://support.google.com/googleplay/android-developer/answer/112622?hl=en) (reviewed 2026-10-13), [Stripe Pricing](https://stripe.com/pricing).

| Provider | Fee Rate | Application |
|---|---|---|
| **Google Play (Reduced Fee Tier)** | **15%** of subscription transaction | First $1M annual developer earnings under Google Play Reduced Service Fee Program |
| Google Play (Standard) | 30% of transaction | After exceeding $1M annual threshold |
| Web (Stripe) | 2.9% + $0.30 per transaction | Web purchases (currently unsupported per ADR 0054/0089) |

---

## 3. Unit Economics & Monthly Cost to Serve per User

| Expense Category | Free Tier (100 MB) | Daynori Plus (10 GB) | Daynori Pro (50 GB) |
|---|---|---|---|
| Storage (S3 / DB Blobs) | $0.002 | $0.210 | $1.050 |
| Egress & API Bandwidth | $0.050 | $0.270 | $0.720 |
| Database & Compute Allocation | $0.030 | $0.080 | $0.150 |
| AI Token Ceiling (if enabled) | $0.000 (local/opt-in) | $0.150 | $0.450 |
| Customer Support Allocation | $0.020 | $0.200 | $0.400 |
| Operational Headroom (30%) | $0.031 | $0.273 | $0.831 |
| **Total Net Cost to Serve (COGS)** | **~$0.13 / month** | **~$1.18 / month** | **~$3.60 / month** |

---

## 4. Proposed Commercial Tiers & Plan Boundaries

> [!NOTE]
> All retail pricing listed below is a **proposal for project owner decision**. No prices are published or configured live in app stores during Phase 89.

### Plan 1: Daynori Free (Core Organizer)
- **Target Audience**: Individual users seeking an offline-first, private personal organizer.
- **Included Features**:
  - Full offline-first notes, tasks, deadlines, routines, and daily reflection journal.
  - Personal local search, calendar views, agenda projections, and local reminders.
  - Manual full JSON/ZIP export and account deletion.
- **Quotas**:
  - Storage: **100 MB** (or 250 MB pending owner final decision).
  - AI Monthly Tokens: 50,000 (if local/preview AI is opted into).
  - Maximum single file size: 10 MB.
- **Price**: **$0.00** forever. Zero ads, zero tracking.

### Plan 2: Daynori Plus (Proposed Primary Paid Tier)
- **Target Audience**: Power users, students, professionals managing files, attachments, and audio reflections.
- **Included Features**:
  - Everything in Daynori Free.
  - Multi-device cloud sync and automated backup recovery.
  - Generous file attachments and audio reflection storage.
  - Extended revision history (90 days).
- **Quotas**:
  - Storage: **10 GB** (10,737,418,240 bytes).
  - AI Monthly Tokens: 500,000 tokens/month.
  - Maximum single file size: 100 MB.
- **Proposed Pricing**:
  - Monthly: **$3.99 / month** (or $4.99 / month).
  - Annual: **$35.99 / year** ($2.99/mo equivalent, ~25% savings).
- **Unit Margin Analysis**:
  - At $3.99/mo retail: Play fee (15%) = $0.60 -> Net revenue = $3.39.
  - Net COGS = $1.18.
  - **Contribution Margin = ~$2.21 / user / month (~65% gross margin)**.

### Plan 3: Daynori Pro (Proposed Future High-Volume Tier)
- **Target Audience**: Heavy media users, extensive audio journal archives, complex workflows.
- **Quotas**:
  - Storage: **50 GB**.
  - AI Monthly Tokens: 1,500,000 tokens/month.
- **Proposed Pricing**:
  - Monthly: **$9.99 / month**.
  - Annual: **$89.99 / year**.
- **Unit Margin Analysis**:
  - At $9.99/mo retail: Play fee (15%) = $1.50 -> Net revenue = $8.49.
  - Net COGS = $3.60.
  - **Contribution Margin = ~$4.89 / user / month (~58% gross margin)**.

---

## 5. Quota Enforcement & Downgrade Safety Policy

1. **Server-Authoritative Enforcement**:
   - `app.workspace_storage_usage.max_storage_bytes` is updated atomically upon verified purchase or downgrade.
   - `reserveQuota` enforces `stored + reserved + requested <= maxStorageBytes`.
2. **Over-Quota Behavior (Zero Data Loss Guarantee)**:
   - When a plan expires, is canceled, or is refunded, `max_storage_bytes` reverts to the free tier limit (100 MB).
   - **No files or records are deleted**.
   - Read, export, download, and delete operations remain **100% available**.
   - New upload reservations that would exceed the 100 MB limit fail gracefully with `400/403 QuotaExceededError`.
   - Deleting existing files frees storage capacity immediately.
3. **Restricted Operations Notice**:
   - Web `BillingPanel` and Mobile `BillingSheet` explicitly inform users of the data preservation guarantee and explain that only new file uploads exceeding the free limit are paused.

---

## 6. Required Owner Commercial & Merchant Decisions

Before production billing can be enabled, the project owner must resolve the following items:

1. **Merchant Entity & Tax Registration**:
   - Register a legal business entity or sole proprietorship with a valid D-U-N-S Number (required by Google Play Console for developer verification).
   - Complete Google Play Developer account identity verification.
   - Establish merchant payout bank account and tax residency profiles in Google Play Console.
2. **Pricing & Currency Approval**:
   - Approve baseline retail price points for Daynori Plus (e.g. $3.99/mo vs $4.99/mo; $35.99/yr vs $47.99/yr).
   - Authorize Google Play auto-converted localized pricing across target markets (US, EU, UK, CA, AU, etc.).
3. **Google Play Console SKU Setup**:
   - Create subscription product `daynori.plus.monthly` and `daynori.plus.annual` in Play Console.
   - Configure base plans, billing period (`P1M`, `P1Y`), and 7-day grace period.
   - Configure Google Cloud Pub/Sub topic and service account for Real-Time Developer Notifications (RTDN).
4. **Web Checkout Policy Decision**:
   - Confirm adherence to Google Play Payments policy: web checkout remains disabled for Android users.
   - Decide whether to offer Stripe/Paddle web checkout exclusively for desktop/browser-only users at a later phase.
5. **Staffed Operations & Support**:
   - Designate support representative for billing disputes and refund requests.

---

## 7. Status & Tracking

- Implementation Readiness: **Complete** (synthetic catalog, verified server entitlements, quota sync, downgrade preservation, lifecycle state machine).
- Acceptance Status: **Blocked** under `DEF-V2-007` pending owner commercial decisions and real store sandbox accounts.
- Environment: Fails closed in production (`isBillingProductionActivationEnabled() === false`).
