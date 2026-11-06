# Phase 89: Billing entitlements and sustainable plan readiness

## Identity and scope

- Phase: [89 — Billing entitlements and sustainable plan readiness](../roadmap/phases/89-billing-entitlements-and-sustainable-plan-readiness.md).
- Status: **blocked** — Technical and architectural billing readiness complete: database role isolation (`daynori_billing`), server authority, and token hash privacy verified (BL-001); web (`BillingPanel.tsx`) and mobile (`BillingSheet.tsx`) UI transparency upgrades delivered with storage usage meters, AI quota ceiling visibility, downgrade data preservation guarantees, independent security gates notice, restore purchases affordance, and Google Play subscription deep links (BL-002); cross-account multi-device restore deduplication verified (BL-003); downgrade/expiry zero data loss invariant verified with only new uploads over quota blocked (BL-004); account mismatch protection and active-over-canceled entitlement precedence verified (BL-005); durable webhook event leasing, retry backoff, and dead-letter queue verified (BL-006); anti-steering policy compliance verified with zero web payment links on mobile (BL-007); independence of security gates (Vault, Rooms, Drive, AI) verified (BL-008); 10 sandbox purchase lifecycle scenarios (SB-01 to SB-10) verified; sustainable cost and pricing model authored; billing operations and reconciliation guide authored; Google Play Billing policy review authored; all 3 billing integration suites passing (24/24 tests); TypeScript checks passing for web and mobile; production billing remains fail-closed pending Google Payments merchant account registration, Play Console product catalog configuration, Cloud Pub/Sub RTDN setup, and physical Android test purchases (`DEF-V2-007` retained).
- Contributor/date: Antigravity agent, 2026-11-06.
- Base revision/branch: `80e6956d963ebed4f7c54a64ce4849c07b99a15f`, `codex/free-core-preview`.
- Hard prerequisites: Phase **57**.
- Owner Scheduling Authorization: The owner authorized Phase 89 implementation and independent verification before final acceptance of Phases 75 and 81 ([ADR 0089](../decisions/0089-billing-entitlements-and-sustainable-plan-readiness.md)). Phase 89 is recorded as `blocked` due to unmet commercial merchant infrastructure and physical device purchase verification gates (`DEF-V2-007` retained). Outstanding checks for Phases 71, 75, 80, 81, 84, 85, 86, 87, 88, and 99 remain preserved. Standing push authorized under ADR 0074. No unverified production capability or commercial pricing claimed.

---

## Result

### Implementation and Verifications Delivered

1. **Database Role Isolation & Token Privacy (BL-001 Verification)**:
   - All entitlement logic and purchase verifications are guarded by PostgreSQL `SECURITY DEFINER` functions assigned exclusively to the `daynori_billing` database role.
   - The ordinary application runtime pool (`daynori_runtime`) is strictly forbidden from directly updating purchase records or calling entitlement helper routines.
   - Raw Google Play purchase tokens are never logged or persisted in cleartext; they are stored as SHA-256 hashes (`token_hash`) with a 12-character prefix (`token_prefix`) for debugging and audit logs.

2. **Web & Mobile Subscription Management Upgrades (BL-002 Remediation)**:
   - Enhanced `apps/web/src/components/BillingPanel.tsx` and `apps/mobile/src/views/BillingSheet.tsx` with:
     - Real-time formatted storage usage meters (used bytes, total quota, percentage bar).
     - AI monthly compute ceiling readout.
     - Clear downgrade guarantee notice: on cancellation or expiration, existing notes, tasks, journals, and files remain 100% accessible; only new uploads over quota are blocked.
     - Clear independent security gates notice: subscription status has zero impact on Vault, Rooms, Drive, or AI release gates.
     - "Restore Purchases" button invoking `POST /v1/billing/restore`.
     - Direct "Manage in Google Play" subscription deep link (`https://play.google.com/store/account/subscriptions`) with cancellation guidance.

3. **Cross-Account Multi-Device Restore Deduplication (BL-003 Remediation)**:
   - Verified that restoring purchases on a secondary device logged in with a different user ID gracefully skips previously bound tokens, emitting an audit log without raising HTTP 409 errors or corrupting the user session.

4. **Downgrade & Expiration Zero Data Loss Invariant (BL-004 Verification)**:
   - When a subscription lapses, cancels, or expires, `max_storage_bytes` drops back to 100 MB.
   - No existing user files, attachments, notes, tasks, or journals are deleted or truncated. All existing content remains 100% readable, exportable, and deletable. Only *new* uploads that exceed current storage limits are rejected with `QuotaExceededError`.

5. **Account Mismatch Protection & Entitlement Precedence (BL-005 Verification)**:
   - Verified that `FakePlayBillingProvider` validates the obfuscated account ID against the verifying user ID, rejecting foreign tokens with 409 Conflict.
   - Verified that `recompute_entitlement` properly prioritizes active purchases over canceled purchases prior to expiration.

6. **Durable Webhook Event Leasing, Retries, and Dead-Letter Queue (BL-006 Verification)**:
   - Webhook event leasing operates on a 60-second lease window. Malformed payloads or unresolvable tokens transition to `dead_letter` after reaching maximum retry thresholds (`max_attempts = 5`), preventing queue lockups.

7. **Anti-Steering Policy Compliance (BL-007 Verification)**:
   - Confirmed that mobile builds never prompt for credit cards, link to web checkouts, or steer users away from Google Play. Web checkout is explicitly unsupported (`PAYMENTS_POLICY_RESTRICTION`).

8. **Independence of Security Gates (BL-008 Verification)**:
   - Confirmed that subscribing never unlocks unreviewed Vault (`DEF-V2-005`), Rooms (`DEF-V2-006`), Drive (`DEF-V2-004`), or AI capabilities.

9. **Comprehensive Documentation & Runbooks**:
   - Authored `docs/engineering/sustainable-cost-and-pricing-model.md` detailing unit economics, infrastructure costs, and proposed pricing tiers.
   - Authored `docs/engineering/billing-operations-and-reconciliation-guide.md` covering state machine transitions, maintenance jobs, out-of-order resolution, and customer support runbooks.
   - Authored `docs/policy/google-play-billing-policy-review-2026-11-06.md` assessing compliance with Google Play Developer Program policies.

---

### Gate Limitations & Operational Status (Truthfully Recorded)

| Gate / Requirement | Target | Result | Reason |
| --- | --- | --- | --- |
| `merchantAccountSetup` | Google Payments Merchant Profile | **unmet** | Requires corporate banking verification and tax profile setup by repository owner (`DEF-V2-007`). |
| `playConsoleCatalog` | Play Console Product SKUs | **unmet** | SKUs (`plus_monthly`, `pro_monthly`) pending owner pricing approval and Console creation. |
| `pubsubRtdnIntegration` | Google Cloud Pub/Sub RTDN | **unmet** | Production service account key with `androidpublisher` API permissions pending Google Cloud project setup. |
| `physicalDevicePurchases` | Physical Android Billing Library v7+ | **unmet** | End-to-end sandbox purchase verification on physical ARM64 hardware pending physical device test execution. |
| `productionProviderActivation` | Production Billing Activation | **fail-closed** | `isBillingProductionActivationEnabled()` strictly returns `false` in production. |
| `serverEntitlementAuthority` | Definitive Server Verification | **pass** | All entitlement decisions computed via isolated `daynori_billing` database role. |
| `tokenHashPrivacy` | SHA-256 Token Storage | **pass** | Tokens hashed before persistence; raw tokens never stored or logged in plain text. |
| `downgradeDataGuarantee` | Zero Data Loss on Expiry | **pass** | Over-quota accounts retain full read/export access; only new uploads rejected. |
| `inAppCancellationAffordance` | Deep link to Play Subscriptions | **pass** | Direct link to `https://play.google.com/store/account/subscriptions` provided in web and mobile UI. |

Production billing remains **fail-closed** (`isBillingProductionActivationEnabled()` returns `false` in production). `DEF-V2-007` is retained in `docs/roadmap/v2/function-register.json`.

Evidence files:
- `artifacts/phase89/findings-register.json`
- `artifacts/phase89/sandbox-test-matrix.json`
- `artifacts/phase89/evidence-summary.json`
- `artifacts/phase89/manual-ui-evidence.json`
- `artifacts/phase89/phase89-ui-evidence.json`
- `docs/engineering/sustainable-cost-and-pricing-model.md`
- `docs/engineering/billing-operations-and-reconciliation-guide.md`
- `docs/policy/google-play-billing-policy-review-2026-11-06.md`
- `docs/decisions/0089-billing-entitlements-and-sustainable-plan-readiness.md`

---

## Automated Evidence

| Test Suite | Result |
| --- | --- |
| `tests/integration/phase89-billing-sustainable-readiness.test.ts` | Pass (10 tests) |
| `tests/integration/phase57-billing-entitlements.test.ts` | Pass (7 tests) |
| `tests/integration/phase57-billing-repair.test.ts` | Pass (7 tests) |
| Total Billing Test Coverage | Pass (24/24 tests) |
| TypeScript check (`@daynori/web`) | Pass (`tsc --noEmit`) |
| TypeScript check (`@daynori/mobile`) | Pass (`tsc --noEmit`) |

---

## Next Steps

1. Await owner commercial decisions regarding retail subscription pricing, merchant profile registration, and Google Cloud Pub/Sub credentials.
2. Maintain `DEF-V2-007` in `docs/roadmap/v2/function-register.json` until commercial prerequisites and physical device sandbox purchases are completed.
3. Keep production billing gate disabled (`isBillingProductionActivationEnabled()` returning `false`).
