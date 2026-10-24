# Phase 58 incident runbooks (provisional local)

Owner roles: **unassigned** unless the product owner names them. These steps are engineering procedures for local/staging drills.

## Kill switches

| Switch | Effect | In-flight work |
|---|---|---|
| `DAYNORI_ROOMS_LOCAL_ENABLED` unset / production | Rooms/chat/safety routes 403 | Queued room jobs should fail closed; do not mark completed |
| `DAYNORI_AI_LOCAL_ENABLED` / live flags | AI routes 403 | Index/purge jobs fence or fail; never silent success |
| `DAYNORI_BILLING_LOCAL_ENABLED` / production gate | Billing routes 403 | Reconcile jobs no-op when gate off |
| Vault always blocked | Vault routes 403 | N/A |

Core organizer (notes/tasks/routines/journal metadata) must remain usable when optional modules are killed.

## Worker crash mid-job

1. Detect: elevated `failed`/`dead_letter` counts; lease expiry.
2. Contain: stop bad deploy; leave kill switches as-is for optional modules.
3. Recover: worker reclaim via `FOR UPDATE SKIP LOCKED` after `leased_until`; inspect `last_error`.
4. Verify: job attempt count increased; domain effect not duplicated (idempotent handlers).
5. Escalate: unassigned on-call.

## Database disconnect / pool exhaustion

1. Detect: API 5xx, pool wait timeouts.
2. Contain: reduce worker concurrency; shed optional traffic.
3. Recover: restore connectivity; scale pool within provider limits.
4. Verify: health endpoint; sample mutations; no cross-tenant rows.
5. Escalate: unassigned.

## Provider outage (Drive/AI/Play)

1. Detect: adapter timeouts / unavailable codes.
2. Contain: keep feature gated; core organizer continues.
3. Recover: retry with backoff; dead-letter permanent failures.
4. Verify: no entitlement grant without verification; no AI success without provider.
5. Escalate: unassigned.

## Backup / restore (isolated)

Use `node scripts/disaster-recovery-drill.mjs` against disposable `daynori_dr_*` databases only. Apply deletion suppression before reopening workers. Local logical restore ≠ purchased cloud PITR RPO/RTO.

## Migration / rollback

Prefer forward-fix migrations. Do not rewrite Git history. Old/new app compatibility: contracts versioned; clients tolerate unknown fields.
