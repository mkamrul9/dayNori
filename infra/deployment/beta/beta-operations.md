# Daynori Controlled Private Beta — Operations Runbook

This runbook establishes operational procedures for the Daynori controlled private beta (Phase 38). It defines migration safety, forward-fix/rollback rules, storage quota management, redacted telemetry/alerting, and feedback intake routing.

---

## 1. Environment & Network Boundaries

| Component                 | Target URL / Host                   | Network Scope            | Access Policy                                           |
| :------------------------ | :---------------------------------- | :----------------------- | :------------------------------------------------------ |
| **Web Application**       | `https://beta.daynori.internal`     | Public internet with WAF | Closed beta; requires verified session                  |
| **API Gateway (Fastify)** | `https://beta-api.daynori.internal` | Reverse proxy            | Closed beta; CORS restricted to beta web origin         |
| **PostgreSQL Database**   | `127.0.0.1:5432` / Private VPC      | Isolated VPC             | `daynori_runtime` (least privilege); no external access |
| **Object Storage (S3)**   | `https://s3.beta.daynori.internal`  | Private VPC / IAM        | Signed URL access only; private bucket                  |
| **Alert Webhook**         | `https://alerts.daynori.internal`   | Internal ops channel     | Authenticated webhook for P0/P1 incidents               |

---

## 2. Database Migration Compatibility & Rollback Procedures

### Strict Forward-Fix Policy

1. In production and private beta environments, schema updates must always be **additive and backward-compatible**:
   - New columns must be `NULL` or have a safe `DEFAULT`.
   - Never drop columns or tables containing user data during active beta testing.
   - All migrations must be recorded in `app.schema_migrations`.
2. **If a migration defect occurs**:
   - **Preferred: Forward-Fix**: Apply a corrective migration (e.g., `00039_forward_fix_...sql`) that resolves the defect while preserving user-entered offline drafts, notes, and task data.
   - **Rollback (Extreme Emergency Only)**:
     - Take an immediate pre-rollback dump: `pg_dump -U postgres -d daynori_beta -Fc -f /backups/pre-rollback-$(date +%s).dump`.
     - Revert only non-destructive application logic first (deploy previous container build).
     - If schema reversal is mandatory, run targeted reverse DDL that does not truncate `app.items`, `app.notes`, `app.journals`, or `app.deletion_suppression_ledger`.
     - Re-run `node scripts/validate-planning.mjs` and integration tests before resuming traffic.

---

## 3. Storage Quotas, Retention & Cleanup

1. **Workspace Quotas**:
   - Each beta participant workspace is capped at **100 MB** (`STORAGE_QUOTA_BYTES_PER_WORKSPACE=104857600`).
   - Individual file uploads are capped at **10 MB** (`STORAGE_MAX_FILE_BYTES=10485760`).
   - Upload reservations expire after **15 minutes** if uncommitted.
2. **Automated Worker Cleanup**:
   - `DaynoriWorker` polls for `blob_purge` jobs every 5 seconds.
   - Deletion of workspace items records outbox cleanup jobs. Storage objects are purged asynchronously with up to 3 bounded retries.
   - Objects returning 404/NoSuchKey are marked as completed idempotently.

---

## 4. Redacted Telemetry & Operational Alerting

1. **Zero Content Invariant**:
   - `REDACT_TELEMETRY=true` ensures `SafeLogger` redacts all note ASTs, journal reflections, task titles, passwords, tokens, and email addresses.
   - Log entries contain only structural metadata: `requestId`, `actorId`, `method`, `url`, `statusCode`, and `durationMs`.
2. **Incident Severity & Alert Routing**:
   - **P0 (Critical / Block-All)**:
     - Triggers: Database connectivity loss, RLS authorization bypass detection, storage provider outage.
     - Action: Immediate webhook alert to ops channel; pause incoming beta requests.
   - **P1 (High / Feature Degradation)**:
     - Triggers: Worker queue age > 60s, export/deletion job failures, auth provider 5xx rate > 2%.
     - Action: Webhook notification; investigate within 2 hours.
   - **P2 / P3 (Minor / UX)**:
     - Triggers: Intermittent client sync conflicts, individual file upload timeouts.
     - Action: Logged for weekly triage.

---

## 5. Support & Feedback Intake Routing

1. **In-App Feedback Surface**:
   - Accessible via Settings -> "Beta Feedback & Diagnostics".
   - Collects client diagnostics: app version, platform (Android/Web), screen dimensions, sync queue state, and optional user description.
   - Content invariant: user draft content is NEVER attached to feedback payloads automatically.
2. **Triage Cadence**:
   - Feedback submissions route to `FEEDBACK_INTAKE_ENDPOINT` and are emailed to `SUPPORT_EMAIL`.
   - Daily triage during active observation period; bug reports classified into P0-P3 per observation protocol.
