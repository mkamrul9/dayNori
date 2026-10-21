# Phase 57: Entitlements, subscriptions, and purchase lifecycle

## Identity and scope

- **Phase ID/specification:** [Phase 57 — Entitlements subscriptions and purchase lifecycle](../roadmap/phases/57-entitlements-subscriptions-and-purchase-lifecycle.md).
- **Status:** `blocked` (provisional local entitlements + synthetic catalog; commercial decisions, Play/web sandbox, and production activation unmet).
- **Contributor and report date:** Cursor agent, 2026-10-20 (Asia/Dhaka).
- **Base revision:** Phase 56 repair `8da6668` (prior: Phase 56 `504adca`, Phase 55 repair `6f97ca7`).
- **Prerequisites:** Phases 38 and 03 — owner selected bounded provisional local work; external beta/store evidence remains pending and does not authorize release claims.
- **Owner selection:** Bounded provisional local development only — no real charges, production billing, merchant accounts, deploy, store submission, paid infra, or enabling AI/vault/rooms for real users.
- **Preserved:** Phase 50 deferred; Phase 49 live Google pending; vault disabled; rooms/chat unavailable to real users; AI live provider and production activation disabled; billing production activation and real charges disabled.
- **Stop before:** Phase 58.

### Distinguishing lanes

| Lane | Delivered? |
|---|---|
| Server-authoritative entitlements + synthetic catalog | **Yes** (local / fake) |
| Fake Play verify + durable events + restore binding | **Yes** (local / fake) |
| Google Play `subscriptionsv2` adapter + mock HTTP | **Yes** (shape only; live gated off) |
| Web + Android plan/usage surfaces | **Yes** (Settings; synthetic labels) |
| Worker `billing_reconcile_events` | **Yes** (local) |
| Play/web sandbox purchase evidence | **No** / **Unexecuted** |
| Approved commercial prices / merchant / legal entity | **No** (owner decisions) |
| Production billing activation | **No** (fail-closed) |

## Result

- Migrations `00065_billing_entitlements.sql` + `00066_billing_event_access_and_binding.sql`: products, purchases (token hash + account binding), entitlements, events (idempotent `message_id`, claim/lease), SECURITY DEFINER writers/loaders; ordinary runtime cannot INSERT entitlements or SELECT event rows.
- Domain gates `isBillingLocallyEnabled` / `isBillingProductionActivationEnabled`; contracts `packages/contracts/src/api/billing.ts`.
- API `/v1/billing/*` + workspace usage; api-client methods; fake_play + gated Google Play provider; worker reconciliation job.
- Web `BillingPanel`; Android `BillingSheet` (Expo Go ≠ Play Billing proof).
- ADR 0054; api-conventions + operations-and-scaling updates; `.env.example` flags.
- Paying does not unlock vault, rooms, Drive, or live AI.

### Primary sources reviewed (2026-10-20 / 2026-10-21)

| Topic | Source |
|---|---|
| Backend | [Integrate Google Play with your server backend](https://developer.android.com/google/play/billing/backend) (updated 2026-09-01) |
| Lifecycle | [Subscription lifecycle](https://developer.android.com/google/play/billing/lifecycle/subscriptions) |
| Payments policy | [Google Play payments policy](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en) |

Merchant jurisdiction / regional program eligibility: **not inferred** from project timezone.

### Cost model (provisional)

| Driver | Classification |
|---|---|
| DB/storage/backups/egress/scanning | estimate / unknown quote |
| AI monthly ceiling | reuses Phase 55 budgets; plan raises ceiling only |
| Play fees | unknown until merchant account |

Synthetic free defaults: 100 MiB storage / 50k AI tokens. Synthetic Plus: 5 GiB / 500k tokens. Prices labeled `SYNTHETIC` — not approved commercial offers.

## Acceptance evidence

| Condition | Method | Result |
|---|---|---|
| Clients cannot grant premium via local SQL/state | Integration ordinary INSERT deny | **Pass** (local) |
| Invalid token / wrong provider path | Integration | **Pass** (local / fake) |
| Cross-account token reuse / restore | Integration | **Pass** (local / fake) |
| Duplicate events idempotent | Integration | **Pass** (local) |
| Expiry → free plan; content path preserved | Integration note create after expiry | **Pass** (local) |
| Production gate with local flag | Domain unit test | **Pass** |
| Google adapter subscriptionsv2 shape | Mock HTTP unit path | **Pass** (not sandbox proof) |
| Play/web sandbox purchase/restore/refund | — | **Unexecuted** (blocker) |

### Commands run (repo root)

Environment: Windows 11, Node `v24.11.1`, pnpm `9.15.5`. Date 2026-10-21.

| Command | Exit | Notes |
|---|---|---|
| `pnpm --filter @daynori/domain\|contracts\|api-client build` | 0 | |
| `npx vitest run tests/integration/phase57-billing-entitlements.test.ts` | 0 | 7 passed; fake provider only |
| `npx vitest run tests/integration/phase56-ai-repair.test.ts tests/integration/phase56-ai-assistant-actions.test.ts packages/domain/src/domain.test.ts -t "Phase 57\|Phase 56"` | 0 | 19 passed / 83 skipped |
| `pnpm --filter @daynori/domain\|contracts\|api-client\|api\|worker\|web\|mobile typecheck` | 0 | After worker DatabaseClient fix |
| `pnpm validate:planning` | 0 | 64 phases |
| `pnpm audit:secrets` | 0 | 2137 files |
| `git diff --check` | 0 | No whitespace errors |

Physical store sandbox, merchant console, and full a11y device matrix: **unexecuted**.

## Defects, limitations and recovery

1. Status **blocked**: no merchant/legal entity, approved SKUs/prices/countries, Play/web sandbox credentials, or production activation authorization.
2. Fake verification is **not** provider proof; Expo Go / synthetic UI is **not** Play Billing Library verification.
3. Web purchase provider explicitly **unsupported**; Android users are not steered to web checkout.
4. Unresolved owner choices: commercial prices, tax/merchant accounts, whether web purchases are pursued under current policy, staffed billing support.
5. Rollback: disable billing local flag; reverse migration `00065` after draining events. Existing personal content remains; entitlements drop to free defaults when rows removed.

## Documentation and Git review

- This report; CHANGELOG; progress.json; ADR 0054; api-conventions; operations-and-scaling; `.env.example`.
- Intended commit subject: `feat(billing): add verified subscriptions and entitlement lifecycle`
- Secrets/private fixtures: none intended in staged paths (synthetic tokens only).

## Handoff

Provisional local server-authoritative entitlements and purchase lifecycle are implemented under fail-closed gates. **Do not charge users, activate production billing, or claim store sandbox evidence.** Next eligible phase when owner selects: **Phase 58** (read its specification and prerequisites first). Do not start automatically. Preserve blocked/provisional AI, vault off, rooms/chat off for real users, Phase 50 deferred, Phase 49 live Google pending, billing production off.
