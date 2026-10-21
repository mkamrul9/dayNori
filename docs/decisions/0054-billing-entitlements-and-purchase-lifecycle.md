# ADR-0054: Billing entitlements and purchase lifecycle (provisional local)

- Status: accepted (provisional local).
- Date: 2026-10-20.
- Related: Phase 57; ADR 0012; [release-gates — billing](../engineering/release-gates.md); [operations-and-scaling](../architecture/operations-and-scaling.md).

## Primary sources reviewed (2026-10-20)

| Topic | Source | Notes |
|---|---|---|
| Backend integration | [Integrate Google Play with your server backend](https://developer.android.com/google/play/billing/backend) (updated 2026-09-01) | RTDN + Developer API; do not trust client claims alone; dedupe `messageId`. |
| Subscription lifecycle | [Subscription lifecycle](https://developer.android.com/google/play/billing/lifecycle/subscriptions) | Authoritative state via `purchases.subscriptionsv2.get`; acknowledge within 3 days; handle renew/grace/hold/expire/revoke. |
| Payments policy | [Google Play payments policy](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en) | Digital goods on Play require Play Billing where applicable; do not auto-steer Android users to web checkout without current policy authorization. |

Merchant jurisdiction, legal entity, approved commercial prices, and regional payment-program eligibility are **owner decisions** — not inferred from project timezone.

## Cost model (provisional)

| Cost driver | Classification | Notes |
|---|---|---|
| DB compute/storage + backups | estimate / unknown quote | Depends on provider plan; measure in staging. |
| Object storage + egress | estimate | Bound by plan `storageBytes`; egress unmeasured. |
| Scanning/rendering | estimate | Existing file pipeline; not re-priced here. |
| AI tokens | reuses Phase 55 budgets | Plan raises monthly ceiling; server still settles usage. |
| Play fees | unknown until merchant account | Not activated. |

Distinguish: **measured local**, **provider quote**, **estimate**, **unknown**.

## Decision

1. **Server authority:** Entitlements grant/revoke only after provider verification (fake local or gated Google Play). Clients cannot grant premium via local flags, product names, or checkout success callbacks.
2. **Catalog:** Labeled `synthetic-local-catalog` until commercial prices/countries/entity are approved. Synthetic price strings must remain visibly synthetic.
3. **Gates:** `isBillingLocallyEnabled` fail-closed in production; `DAYNORI_BILLING_PRODUCTION_ENABLED` required for live Play verification. Web provider path is explicitly **unsupported** in this phase.
4. **Binding:** Purchase tokens hashed server-side; bound to authenticated app account (`obfuscatedAccountId` / ownership row). Cross-account restore/reuse rejected.
5. **Lifecycle:** Durable `billing_events` with idempotent `messageId`, claim/lease, succeed/fail/dead_letter. Notifications are reconciliation triggers; re-fetch authoritative provider state.
6. **Quotas:** Plan updates personal workspace `max_storage_bytes` and AI monthly ceiling. Downgrade/expiry **preserves content**; new allocations may refuse when over quota; read/export/delete remain available.
7. **Independence:** Billing never overrides vault/rooms/Drive/AI release gates or consent.
8. **Native:** Expo Development Build required for real Play Billing (ADR 0012). Expo Go / fake adapter ≠ Play verification.

## Unresolved owner choices

- Legal entity, tax/merchant accounts, approved SKUs and prices, countries.
- Whether to pursue web purchases for web-only users under current policy.
- Production monthly quotas and paid-account provisioning.
- Staffed billing support / refund operator runbooks.

## Amendment (2026-10-21) — Phase 57 repair

1. **Protected authority (superseded by role amendment below):** Privileged helpers initially required a session token activation. That design was insufficient because GUCs are caller-settable.
2. **Explicit states:** `mapVerifiedSubscriptionToAccess` uses full Play `SUBSCRIPTION_STATE_*` values; pending never grants; canceled retains access until `validUntil`; grace/hold/expire/revoke per lifecycle docs (reviewed 2026-10-21).
3. **No RTDN override:** Reconciliation re-fetches provider state; notification labels do not rewrite verified state. Entitlement recompute aggregates purchases so one expired token cannot clobber another valid grant.
4. **Ownership:** Client account hints are not verified ownership. Provider `obfuscatedAccountId` is authoritative when present; first-claim without provider account id is an explicit server option only.
5. **Durable processing:** Synthetic harness is separate from gated provider OIDC ingest. Events stay pending for worker claim → provider I/O outside lock → fenced finalize. Periodic `billing_reconcile_events` / `billing_expire_entitlements` jobs are enqueued by the worker scheduler.
6. **Quotas:** Effective entitlement drives storage ceiling recompute and AI monthly reservation limit when billing local is enabled.

## Amendment (2026-10-21) — Billing role authority

1. Privileged billing helpers require `session_user = daynori_billing` (migration `00068`). Ordinary `daynori_runtime` has EXECUTE revoked; setting `app.billing_service_ok` or calling activate with the local synthetic token does **not** grant authority.
2. API/worker use a dedicated billing pool (`createBillingPool` / `BILLING_DB_*`). Local password default is not a release credential.
3. Token activation remains admin/billing-role only for secret rotation — never a public runtime credential.

## Consequences

- Status remains **blocked/provisional** until sandbox/production evidence and commercial decisions land.
- Stop before Phase 58 (owner-selected after repair commit).
