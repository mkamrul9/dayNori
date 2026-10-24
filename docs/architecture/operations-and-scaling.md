# Operations, recovery and scaling

Status: release requirements to implement progressively; no infrastructure is provisioned in Phase 00.

## Deployment and environments

Use separate local, test/staging and production databases, storage, Auth clients, push credentials and integration secrets. Production data does not populate developer fixtures. Keep versioned migrations, reproducible builds, a rollback plan and secret rotation ownership. Next.js web/session tier, Fastify API and worker deploy independently while sharing versioned contracts.

Keep API/worker/database in the same validated region initially. Use managed TLS, a secret manager, health/readiness checks and limited database pools sized to the provider's actual limits. Do not put connection strings or secrets in public Next.js variables, Expo config, source control or static artifacts. Development `.env.example` files contain placeholders only.

## Durable work

Domain transactions emit outbox events; worker dispatch creates/jobs processes them idempotently. Jobs include tenant scope, command/event identity, next run, attempt count, lease owner/expiry and safe error code. Use bounded `FOR UPDATE SKIP LOCKED` claiming, short claim transactions, renewable leases and exponential backoff with jitter. Never keep a database transaction open while calling FCM, Drive, AI or scanning a file.

External effects are at-least-once. Persist provider correlation/receipt when available, use provider idempotency mechanisms where supported, and make local state transitions resumable. A crash after the provider accepts but before receipt persistence can produce a duplicate; do not describe this as exactly-once delivery. Failed permanent jobs go to an inspectable dead-letter state with a safe retry/recovery command.

Before a job acts, recheck account/workspace/connection/target state and expected revision. Deletion or access revocation cancels future effects. Quota reservations, uploads, previews, exports, reminders, Drive pages, account erasure and orphan garbage collection all have explicit job state machines. Large jobs batch/checkpoint rather than lock an entire workspace for minutes.

## Recovery objectives and backups

Proposed public-release objectives: PostgreSQL RPO <=15 minutes when a suitable PITR plan is purchased and proven, object RPO <=24 hours, and full-service RTO <=4 hours from a tested runbook. These are engineering targets, not current guarantees. A lower-cost alpha may use daily backups only if its <=24-hour loss window is disclosed and accepted. No paid plan is selected by this document.

Supabase database backups cover database content/metadata but do not include uploaded object bytes. Independent object backup/versioning and manifests are mandatory; a database restore alone is incomplete. [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups). Reviewed 2026-10-13; verify purchased plan retention/PITR and object capabilities at release.

Create encrypted object backups in a separately controlled location with key, bytes, checksum, version and backup timestamp manifests. Coordinate database recovery watermark with object manifests; detect and reconcile missing/orphan versions after restore. Do not promise point-in-time object recovery from a daily copy. Credentials, Auth/provider configuration, custom-role credentials and deployment configuration have separate recoverable handling; encrypted vault backups never contain user recovery secrets.

Initial operational retention proposal: ordinary trash 30 days; sync history/tombstones at least 90 days; receipts at least 180 days; backup retention 30 days where the purchased plan/backup implementation supports it; content-free operational logs 30 days with stricter secret redaction. Product/legal review must approve published retention before public signup. Keep an account-erasure suppression ledger outside restore snapshots so restoring an old backup cannot silently reactivate erased accounts; define its minimal purpose/expiry explicitly.

Perform isolated restore drills before public release and quarterly afterward. Verify counts/checksums, tenant policies, object downloads, migrations, reminder/job duplication suppression, vault ciphertext compatibility and deletion suppression. Record measured RPO/RTO and deficiencies in the phase/release report. Backups are successful only when restoration is proven.

## Observability without private content

Track request ID, safe tenant correlation, route, status, latency, query duration, queue age, lease failures, retry/dead-letter counts, upload bytes, storage usage, reminder acceptance/open counts, sync lag/reset/conflicts and provider latency. Do not log content, signed URL tokens, raw credentials, finance amounts or vault plaintext. Exception capture scrubs breadcrumbs and payloads before sending to a vendor.

Alert on authentication failure spikes, cross-tenant denial anomalies, exhausted pools, sustained API errors, delayed reminder jobs, failed backups, unbounded orphan bytes, increasing conflict/reset rates and quota/AI-cost anomalies. A content-free audit stream records grant/revoke, export/delete, vault setup/recovery changes and privileged actions. Users can inspect relevant security activity later without exposing another workspace's events.

## Proposed performance gates

The engineering/testing docs own executable profiles. Starting targets to validate are local edit acknowledgment p95 <=100 ms, metadata API reads p95 <=300 ms and writes <=500 ms at a documented 100 active-user synthetic baseline, mobile cold usable Home <=3 seconds on a nominated midrange Android device, and web LCP <=2.5 seconds/INP <=200 ms/CLS <=0.1 in its documented profile. Upload duration, provider latency and first large offline bootstrap have separate budgets. These are proposed measurements, not service guarantees.

Test 10,000 ordinary items and a deep valid folder tree per heavy test workspace; verify list virtualization, bounded projections, pagination and sync incremental cost. Avoid downloading every PDF/audio binary during bootstrap. Benchmark encrypted-cache open/migrations and app resume before trusting memory usage on a low-memory device.

## Scaling sequence

1. Correct tenant-aware indices, query plans, keyset pagination, connection pooling, batching and N+1 removal.
2. Bound payloads, attachment cache, search result count, worker concurrency, provider requests and quota reservations. Cache ordinary immutable projections only with a tenant-aware key and invalidation policy.
3. Run additional API/worker replicas only after verifying shared limits, lease behavior and pool budget. Use idempotent outbox/jobs and no process-memory source of truth.
4. Add a shared rate-limit/cache store when measured public traffic needs globally coordinated limits. Add read replicas or partition/change-retention improvements only for a documented bottleneck.
5. Split a service only when independent scaling, ownership, failure isolation or deployment cadence outweighs distributed transaction/operational costs. Shared rooms may require an ordered log/real-time subsystem; that does not justify premature microservices for private notes.

Keep financial spend visible: database compute/storage, object storage/egress, backups, scanning/rendering, push/observability and later Drive/AI operations. Usage/plan entitlements are server-enforced, with reserve/finalize/release accounting for binary uploads and AI. Do not attach unlimited storage or unlimited AI promises to the product before measuring them.

Phase 57 (provisional local; ADR 0054): entitlements grant only after provider verification (`fake_play` locally; Google Play `subscriptionsv2` when production activation + credentials are set). Durable `billing_events` use claim/lease/dead-letter; RTDN is a reconciliation trigger, not trusted state. Downgrade/expiry preserves personal content and required read/export/delete; new allocations may refuse when over quota. Billing never overrides vault/rooms/Drive/AI release gates. Commercial prices, merchant accounts, and sandbox/store evidence remain owner decisions.

Phase 58 (provisional local; ADR 0055): engineering synthetic reliability baseline and operating-cost evidence live under `tests/performance/phase58-*.test.ts` and `docs/engineering/operating-cost-model.md`. Not beta-derived production capacity. Kill-switch and fault runbooks: `docs/engineering/runbooks/phase58-incidents.md`. Isolated DR drill remains `scripts/disaster-recovery-drill.mjs`.

## Incident and rollout runbooks

Each risky phase adds steps for detect, contain, recover, verify and communicate. At minimum cover compromised account/key, signing-key rotation, data isolation incident, failed migration, database/object restore, duplicate reminders, runaway jobs/AI cost, revoked Drive grant and app version rollback. Runbooks state who can perform privileged actions and how audit evidence is retained.

Use small staged releases and flags around new domains/integrations. Backward-compatible migrations precede clients; observe before enabling broad use. Flags cannot replace authorization and cannot make an unsafe vault encryption implementation acceptable. Store listing, Data Safety/privacy statements and permission declarations must match implemented behavior at the release gate.
