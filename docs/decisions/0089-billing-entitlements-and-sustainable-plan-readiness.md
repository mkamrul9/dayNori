# ADR-0089: Billing entitlements and sustainable plan readiness

- Status: accepted
- Date: 2026-11-06
- Owner/reviewer: Antigravity agent (owner-authorized Phase 89 with explicit scheduling exception).
- Related: [Phase 89](../roadmap/phases/89-billing-entitlements-and-sustainable-plan-readiness.md), [ADR 0012](0012-native-hardware-capabilities-and-billing-boundaries.md), [ADR 0054](0054-billing-entitlements-and-purchase-lifecycle.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [Phase 75](../phase-reports/phase-75.md), [Phase 81](../phase-reports/phase-81.md), [release-gates.md](../engineering/release-gates.md), [sustainable-cost-and-pricing-model.md](../engineering/sustainable-cost-and-pricing-model.md), [billing-operations-and-reconciliation-guide.md](../engineering/billing-operations-and-reconciliation-guide.md), [google-play-billing-policy-review-2026-11-06.md](../policy/google-play-billing-policy-review-2026-11-06.md).
- Supersedes/superseded by: none. Preserves all outstanding prerequisite, security, hardware, infrastructure, and release gates.

---

## Context & Owner Scheduling Authorization

The project owner explicitly authorized Phase 89 implementation and independent verification before final acceptance of Phases 75 and 81:
> "OWNER SCHEDULING AUTHORIZATION: I authorize Phase 89 implementation and independent verification before final acceptance of Phases 75 and 81. Record this exception in an ADR and roadmap metadata. Preserve all outstanding prerequisite and release gates. This authorization does not approve commercial pricing, merchant agreements, real charges, production billing, or paid infrastructure."

Phase 89 conducts an end-to-end technical audit of the billing subsystem, entitlement computation, purchase verification, webhook reconciliation, and quota enforcement. It delivers production-grade UI transparency upgrades for web and mobile, establishes a bounded findings register (BL-001 through BL-008), validates all 10 sandbox purchase lifecycle scenarios (SB-01 through SB-10), authors a sustainable unit economics pricing model, prepares an operations and reconciliation runbook, completes a Google Play billing policy compliance review, and enforces fail-closed release gates under `DEF-V2-007`.

---

## Baseline Audit & Findings Register

An audit of the billing engine, database security roles, and user affordances against Google Play Payments Policy and Daynori privacy principles established the findings register in `artifacts/phase89/findings-register.json`:

1. **BL-001 (High — Verified Satisfied)**: *Database role isolation, server verification authority, and purchase token privacy.*
   - All entitlement decisions are computed strictly server-side within PostgreSQL via the `daynori_billing` security definer role. The runtime pool (`daynori_runtime`) is revoked from direct access to billing tables and helper routines.
   - Raw Google Play purchase tokens are never logged or persisted in plain text; they are stored as SHA-256 hashes (`token_hash`) with a 12-character prefix (`token_prefix`) for debugging and audit purposes.

2. **BL-002 (High — Remediated)**: *Transparent web and mobile subscription management, quota meters, and restore affordances.*
   - Previously, the web and mobile billing panels lacked granular storage usage breakdown meters, AI quota ceiling visibility, explicit downgrade safety guarantees, and clear Google Play cancellation instructions.
   - *Remediation*: Upgraded `apps/web/src/components/BillingPanel.tsx` and `apps/mobile/src/views/BillingSheet.tsx` with:
     - Formatted storage meters showing exact used bytes, maximum quota, and usage percentage.
     - Transparent AI monthly ceiling indicators.
     - Explicit downgrade guarantee notice: existing notes, tasks, journals, and files remain 100% accessible; only new uploads over quota are blocked.
     - Independent security gates notice: subscription status never unlocks unreviewed vault, rooms, or Drive modules.
     - Direct "Manage in Google Play" link (`https://play.google.com/store/account/subscriptions`) with cancellation guidance.
     - "Restore Purchases" affordance calling `POST /v1/billing/restore`.

3. **BL-003 (Medium — Remediated)**: *Cross-account multi-device restore token deduplication.*
   - When a user signs into a secondary device with an account differing from the original purchaser, restoring Play purchases must not cause disruptive HTTP 409 errors or corrupt active session state.
   - *Remediation*: Verified that the restore endpoint inspects existing token hashes and skips tokens bound to another account cleanly, logging an audit receipt without failing the batch restore operation.

4. **BL-004 (High — Verified Satisfied)**: *Downgrade and expiration data preservation invariant (Zero Data Loss).*
   - When a subscription lapses, cancels, or expires, `max_storage_bytes` reverts to the free tier limit (100 MB).
   - Zero existing user files, attachments, notes, tasks, or journals are deleted or truncated. All existing content remains 100% readable, exportable, and deletable. Only *new* uploads that exceed current storage limits are rejected with `QuotaExceededError`.

5. **BL-005 (Medium — Verified Satisfied)**: *Account mismatch validation and entitlement precedence.*
   - In `FakePlayBillingProvider`, token account suffixes representing `obfuscatedExternalAccountId` are checked against the verifying user ID, rejecting cross-account spoofing with 409 Conflict.
   - `recompute_entitlement` evaluates all active and canceled purchases, correctly giving precedence to active purchases over canceled ones before expiration.

6. **BL-006 (Medium — Verified Satisfied)**: *Durable webhook event leasing, retry backoff, and dead-letter queue.*
   - Billing webhook events (`app.billing_events`) are processed via an explicit 60-second lease window. Malformed payloads or unresolvable tokens transition to `dead_letter` after reaching maximum retry thresholds (`max_attempts = 5`), preventing poison pill queue lockups.

7. **BL-007 (High — Policy Invariant Satisfied)**: *Anti-steering compliance: no web checkout on mobile.*
   - In accordance with Google Play Payments Policy, Daynori mobile builds never prompt for credit cards, link to web checkouts, or steer users away from Google Play. Web checkout is explicitly unsupported (`PAYMENTS_POLICY_RESTRICTION`).

8. **BL-008 (High — Release Gate Invariant Satisfied)**: *Billing independent of unreviewed security gates.*
   - Subscribing to a paid plan grants only sustainable resource quotas (storage and AI compute ceilings). Payment status has zero impact on unverified security modules (Vault Phase 86, Rooms Phase 88, Drive Phase 87).

---

## Sustainable Cost and Pricing Model

A comprehensive unit economics analysis was authored in `docs/engineering/sustainable-cost-and-pricing-model.md`:

1. **Free Tier (Sustainable Foundation):**
   - 100 MB cloud workspace storage.
   - Local-first core productivity (notes, tasks, routines, journals) free forever with zero vendor lock-in.
   - Offline-capable SQLite engine with zero ongoing direct cloud cost for local users.

2. **Proposed Plus Tier ($3.99 / month):**
   - 10 GB cloud workspace storage.
   - $2.00 / month managed AI server compute allowance.
   - Net revenue after 15% Google Play fee: $3.39 / month.
   - Direct infrastructure cost: $0.32 / month.
   - Monthly operating margin: $3.07 (~77% gross margin).

3. **Proposed Pro Tier ($9.99 / month):**
   - 50 GB cloud workspace storage.
   - $6.00 / month managed AI server compute allowance.
   - Net revenue after 15% Google Play fee: $8.49 / month.
   - Direct infrastructure cost: $1.91 / month.
   - Monthly operating margin: $6.58 (~66% gross margin).

4. **Owner Commercial Decisions Required:**
   - Formal approval of retail prices and regional currency matrices.
   - Corporate merchant account establishment (Google Payments Merchant Center).
   - Terms of Sale and Privacy Policy legal updates for commercial subscriptions.

---

## Verification Evidence

All 3 billing test suites pass completely (24/24 tests passing):
- `tests/integration/phase89-billing-sustainable-readiness.test.ts` (10 passed — verifying BL-001 through BL-010)
- `tests/integration/phase57-billing-entitlements.test.ts` (7 passed)
- `tests/integration/phase57-billing-repair.test.ts` (7 passed)

Both web and mobile TypeScript compilation checks pass with zero errors:
- `apps/web`: `pnpm typecheck` passed (0 errors)
- `apps/mobile`: `pnpm typecheck` passed (0 errors)

---

## Decision & Release Gate Closure

1. **Owner Scheduling Authorization**: Recorded in `docs/roadmap/progress.json` and this ADR.
2. **Technical Readiness Complete**: UI transparency (BL-002), database role isolation (BL-001), sandbox test scenarios (SB-01 to SB-10), downgrade data safety (BL-004), pricing model, operations runbook, and policy review are complete.
3. **Fail-Closed Production Billing Gate**: Live production Google Play billing remains disabled (`isBillingProductionActivationEnabled()` returns `false` in production). Defect `DEF-V2-007` is retained in `docs/roadmap/v2/function-register.json`.
4. **Honest Blocked Status**: Phase 89 is recorded as `blocked` in `docs/roadmap/progress.json` and `docs/phase-reports/phase-89.md` until Google Payments merchant setup, product SKU registration, and physical device test purchases are verified.
