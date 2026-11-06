# Google Play Billing and Payments Policy Review (2026-11-06)

**Primary sources:**
- [Google Play Payments Policy — Developer Policy Center](https://support.google.com/googleplay/android-developer/answer/9858738)
- [Subscription Policy and Requirements](https://support.google.com/googleplay/android-developer/answer/12154973)
- [Understanding Google Play Billing Service Fee Tiers](https://support.google.com/googleplay/android-developer/answer/112622)
- [Alternative Billing Systems and Anti-Steering Regulations](https://support.google.com/googleplay/android-developer/answer/13813644)
- [Restore Purchases and Account Management Guidelines](https://developer.android.com/google/play/billing)

**Review date:** 2026-11-06
**Phase:** Phase 89 — Billing entitlements and sustainable plan readiness
**Release Gate Status:** **FAIL-CLOSED / BLOCKED** (`DEF-V2-007`)

---

## 1. Executive Summary & Regulatory Stance

Daynori provides local-first personal productivity (notes, tasks, routines, journals) with optional cloud workspace synchronization, expanded storage capacity, and assistant quota ceilings. Under Google Play Developer Program Policies, subscriptions or in-app purchases that unlock cloud storage capacity, hosted sync, premium app features, or server-backed AI quotas within an Android application distributed through Google Play are classified as **Digital Goods and Services**.

This policy review audits Daynori's billing architecture, user affordances, data retention guarantees, and Play Console integration readiness as of **2026-11-06**. While all technical mechanisms required by Google Play (server purchase verification, receipt deduplication, Google Play subscription deep linking, restore purchases, grace period handling, and quota enforcement) are implemented and action-verified in the codebase, Daynori **must not** enable live commercial purchases or production billing until merchant registration, product catalog configuration, Cloud Pub/Sub RTDN credentials, and physical device test purchases are verified.

The production capability gate fails closed via `isBillingProductionActivationEnabled()` returning `false` whenever `NODE_ENV === 'production'`.

---

## 2. Applicability to Daynori Digital Goods and Features

1. **Digital Goods Classification:**
   - Daynori's proposed subscription tiers (Plus and Pro) provide expanded cloud workspace storage (10 GB / 50 GB) and managed AI server quota ceilings ($2.00 / $6.00 monthly compute allowances).
   - Under Google Play Payments Policy (Section 1.a), developers offering in-app digital items, enhanced features, cloud sync storage, or software services consumed inside an Android app distributed via Google Play **must use Google Play's billing system** as the method of payment.

2. **Strict Prohibition on Anti-Steering & External Checkout:**
   - Daynori mobile builds (`apps/mobile`) **do not** include web payment links, external checkout forms, credit card prompts, or messaging directing users to purchase subscriptions through web gateways.
   - Web checkout is explicitly marked unsupported (`PAYMENTS_POLICY_RESTRICTION`).
   - The Android client links users exclusively to the Google Play Store subscription management screen (`https://play.google.com/store/account/subscriptions`) for managing or canceling auto-renewing subscriptions.

3. **Multi-Platform Entitlement Continuity:**
   - In accordance with Google Play's multi-platform policy, purchases verified through Google Play Billing attach to the user's Daynori account.
   - When the user logs in across web, desktop, or mobile devices, their subscription entitlement (`plus` or `pro`) is recognized across all platforms without requiring secondary payment.

---

## 3. Google Play Subscription Policy Requirement Matrix

| Policy Requirement | Google Play Standard | Daynori Technical Implementation | Status |
|---|---|---|---|
| **1. In-App Subscription Management & Cancellation** | Apps must provide an easy, accessible way to cancel subscriptions within the app, linking directly to Google Play's subscription center. | `BillingSheet.tsx` (mobile) and `BillingPanel.tsx` (web) provide a direct "Manage in Google Play" link (`https://play.google.com/store/account/subscriptions?sku=...&package=com.daynori.app`) with clear cancellation instructions. | **Satisfied** |
| **2. Restore Purchases Affordance** | Apps must allow users to restore previously completed purchases across reinstalls and device migrations without re-charging. | "Restore Purchases" button in `BillingSheet.tsx` and `BillingPanel.tsx` invokes `POST /v1/billing/restore`, checking active token hashes and reconciling local state. | **Satisfied** |
| **3. Transparent Pricing & Billing Terms** | Subscription terms, billing interval, auto-renewal cadence, and cancellation terms must be clearly disclosed prior to purchase initiation. | Tier cards in both web and mobile display explicit recurring interval (`/mo`), storage bytes breakdown, AI monthly compute ceiling, and downgrade safety terms. | **Satisfied** |
| **4. Downgrade & Expiry Data Guarantee** | Apps must not destroy or hostage existing user data upon subscription cancellation or payment failure. | `assertStorageQuotaEnforced` blocks only *new uploads* when over quota. Zero existing notes, tasks, journals, or stored files are deleted. All user content remains readable, exportable, and deletable. | **Satisfied** |
| **5. Grace Periods & Account Hold** | Backend must respect Google Play grace periods (up to 14 days) and account hold states during payment retry. | Daynori billing lifecycle tracks `in_grace_period` and `on_hold`. Paid access is preserved during grace periods and suspended during account hold without data loss. | **Satisfied** |
| **6. Real-Time Developer Notifications (RTDN)** | Developer backend must consume Cloud Pub/Sub RTDN events to reconcile renewals, cancellations, refunds, and chargebacks out-of-order. | Durable webhook ingestion queue (`app.billing_events`) with leasing, deduplication, retry limits, and dead-letter queue implemented and verified. | **Satisfied** |
| **7. Independent Security Gates** | Billing status must never bypass unverified security modules or hardware gates. | ADR 0012, ADR 0054, and ADR 0089 explicitly enforce that subscription status has zero impact on Vault (`DEF-V2-005`), Rooms (`DEF-V2-006`), Drive (`DEF-V2-004`), or Assistant gates. | **Satisfied** |

---

## 4. Service Fee Tiers & Sustainable Unit Economics

1. **Google Play 15% Tier Enrollment:**
   - Daynori qualifies for Google Play's 15% service fee tier for developers earning under \$1M USD in annual developer revenue upon enrollment.
   - Auto-renewing subscriptions are billed at a 15% service fee after enrollment.
   - For a proposed \$3.99/mo Plus plan:
     - Google Play service fee (15%): \$0.60
     - Net publisher proceed: \$3.39
     - Direct infrastructure cost (storage, egress, compute): \$0.32
     - Monthly operating margin: \$3.07 (~77% gross margin)
   - For a proposed \$9.99/mo Pro plan:
     - Google Play service fee (15%): \$1.50
     - Net publisher proceed: \$8.49
     - Direct infrastructure cost (storage, compute, AI ceiling): \$1.91
     - Monthly operating margin: \$6.58 (~66% gross margin)
   - Detailed financial models are recorded in `docs/engineering/sustainable-cost-and-pricing-model.md`.

---

## 5. Summary of Phase 89 Audit Findings (BL-001 to BL-008)

- **BL-001 (Token Privacy & DB Role Isolation):** Raw Play purchase tokens are never logged or stored in plain text. Stored as SHA-256 hashes with 12-char debug prefix. `daynori_billing` database role strictly isolates DEFINER helpers from `daynori_runtime`.
- **BL-002 (Web & Mobile Transparency):** Upgraded `BillingPanel.tsx` and `BillingSheet.tsx` with storage usage meters, downgrade safety explanations, restore purchases affordance, and Google Play subscription management links.
- **BL-003 (Cross-Account Multi-Device Restore):** Verified that restoring a previously bound token on another user account skips gracefully without throwing 409 or disrupting active sessions.
- **BL-004 (Downgrade Data Preservation):** Verified that subscription expiry drops `max_storage_bytes` to 100 MB without deleting any existing files or records.
- **BL-005 (Account Mismatch Protection):** Play token account suffixes are validated against the verifying user ID, rejecting foreign tokens with 409 Conflict. Active purchases take priority over canceled purchases during entitlement recomputation.
- **BL-006 (Worker Ingestion Leasing):** Webhook event leasing operates on a 60-second lease window. Missing tokens or unresolvable payloads transition to `dead_letter` after maximum attempts.
- **BL-007 (No Web Checkout Steering):** Verified that web checkout is disabled and mobile users are not steered to external payment processors.
- **BL-008 (Independent Module Boundaries):** Verified that subscribing never unlocks unreviewed Vault, Rooms, Drive, or Assistant capabilities.

---

## 6. Explicit Release Blockers for Commercial Production Launch (`DEF-V2-007`)

The following prerequisites remain strictly open and must be satisfied before enabling commercial billing in production:

1. **Merchant Account Registration:**
   - Formal Google Payments merchant profile setup and corporate banking verification.
   - Tax jurisdiction configuration and sales tax nexus determination.

2. **Play Console Product Catalog:**
   - Creation of in-app subscription SKUs (`plus_monthly`, `pro_monthly`) in Google Play Console.
   - Formal sign-off on localized retail pricing tiers by repository owner.

3. **Google Cloud Pub/Sub RTDN Setup:**
   - Production Cloud Pub/Sub topic and subscription linking Play Console to Daynori billing webhook endpoint.
   - Secure service account key with `androidpublisher` API permissions.

4. **Physical Android Device End-to-End Verification:**
   - Physical device sandbox purchase, renewal, downgrade, and restore verification using Google Play Billing Library v7+.

---

## 7. Verification and Revisit Cadence

This review must be revisited and recertified whenever:
1. Google updates its Google Play Developer Program Policies or Payments Policy.
2. Google Play Billing Library major versions are upgraded (e.g., Billing Library v8+).
3. The repository owner prepares a commercial production release candidate for the Google Play Store.
