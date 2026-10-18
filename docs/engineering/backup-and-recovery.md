# Backup and Recovery Runbook & Account Deletion Lifecycle

Document Version: 1.0.0
Last Policy Review Date: 2026-10-18 (Google Play Account Deletion & Data Safety Guidelines)
Status: Authoritative Engineering Runbook

---

## 1. Overview & Objectives

Daynori provides an offline-first, private personal organizer for notes, routines, tasks, journals, and files. To protect against infrastructure failure, data corruption, and catastrophic loss while honoring strict privacy guarantees and Google Play policies, Daynori implements a dual-layer backup and recovery architecture coupled with a durable deletion suppression ledger.

### Service Level Objectives

- **Recovery Point Objective (RPO):** <= 24 hours for standard daily snapshots; <= 5 minutes with write-ahead log (WAL) archiving.
- **Recovery Time Objective (RTO):** <= 4 hours to complete full infrastructure restoration into an isolated staging environment and verify data integrity.

---

## 2. Dual-Layer Storage & Backup Architecture

> [!IMPORTANT]
> **Supabase Database Backups Exclude Storage API Objects:**
> Automated PostgreSQL database backups capture structured relational data (items, routines, tasks, metadata) but **do not include binary storage objects** stored via the Storage API / S3 bucket. A complete recovery drill must recover both PostgreSQL tables and S3/Storage API private objects.

```
+--------------------------------------------------------------------------+
|                            Daynori Platform                              |
+------------------------------------+-------------------------------------+
                                     |
           +-------------------------+-------------------------+
           |                                                   |
           v                                                   v
+--------------------------+                       +-----------------------+
|  PostgreSQL Database     |                       |  Private S3 Storage   |
|  - Items, Notes, Tasks   |                       |  - Uploaded Files     |
|  - Routines, Journals    |                       |  - Export Archives    |
|  - Suppression Ledger    |                       |  - Quarantined Blobs  |
+------------+-------------+                       +-----------+-----------+
             |                                                 |
             v                                                 v
+--------------------------+                       +-----------------------+
|  Database Backups        |                       |  Storage Backups      |
|  - Daily pg_dump/PITR    |                       |  - Bucket Replication |
|  - WAL Archiving         |                       |  - Versioning Enabled |
|  - Retention: 30 days    |                       |  - Retention: 30 days |
+--------------------------+                       +-----------------------+
```

### 2.1 Database Backup Strategy

- **Daily Snapshots:** Automated point-in-time recovery (PITR) snapshots taken daily at 02:00 UTC.
- **WAL Archiving:** Continuous streaming of Write-Ahead Logs to private, encrypted cloud storage.
- **Snapshot Retention:** Transient snapshots rotate and expire automatically after 30 days. No live customer data remains in backup archives beyond 30 days.

### 2.2 Object Storage Backup Strategy

- **Bucket Configuration:** Private assets bucket (`PRIVATE_ASSETS_BUCKET`) with object versioning enabled.
- **Cross-Region Replication:** Asynchronous replication to a secondary disaster recovery bucket.
- **Lifecycle Expiration:** Deleted object markers and non-current object versions expire after 30 days.

---

## 3. Account & Workspace Deletion Lifecycle

Daynori strictly distinguishes between **full account deletion** and **single workspace deletion**, ensuring no ambiguity in scope or accidental data loss.

### 3.1 Reauthentication & Verification

Every deletion request mandates fresh reauthentication within a 10-minute validity window (`maxAgeSeconds: 600`):

- Password reauthentication via provider (`getActiveAuthenticator().verifyCredentials()`).
- Or server-issued signed reauthentication ticket bound specifically to the action purpose (`account_deletion` or `workspace_deletion`).
- Replay and expired tickets fail closed immediately.

### 3.2 Account Deletion Sequence

1. **Request Phase:** User submits password or reauth ticket via `/v1/auth/account-deletion/request`. A cryptographically secure confirmation token is generated and hashed in `app.account_deletions`.
2. **Confirmation Phase:** User explicitly confirms via `/v1/auth/account-deletion/confirm`.
3. **Token Revocation:** Active session tokens are immediately hashed (`SHA-256`) and inserted into `app.revoked_tokens`. Subsequent requests using these tokens return `401 Unauthorized` with error code `TOKEN_REVOKED`.
4. **Subscription Invalidation:** All device push tokens (`app.fcm_device_tokens`), Web Push subscriptions (`app.web_push_subscriptions`), and scheduled reminder instances (`app.reminder_instances`) are permanently removed or marked `invalidated`.
5. **Shared Content Reassignment:** In collaborative workspaces owned by others, items, folders, and tags created by the deleting user are reassigned to the workspace owner (`created_by = w.owner_id`) to prevent stranding or orphan records.
6. **Owned Data Purge:** All workspaces owned by the user, including notes, tasks, routines, journal entries, attachments, and change feeds, are purged in dependency order.
7. **Physical Storage Object Deletion:** Storage paths from files and exports are deleted from the private storage bucket. Any residual paths are queued for worker background purge (`blob_purge`).
8. **Profile Purge:** User profile is erased from `app.profiles`.
9. **Suppression Ledger Tombstone:** A content-free cryptographic hash is inserted into `app.deletion_suppression_ledger` (`entity_type: 'account'`, `expires_at: now() + 90 days`).

### 3.3 Workspace Deletion Sequence

1. Verifies caller is the workspace owner (`owner_id = userId`).
2. Re-authenticates caller identity.
3. Purges all items, folders, files, routine occurrences, routines, tags, links, calendar events, journal entries, and sync change records scoped to that specific workspace.
4. Leaves the user's account profile and other workspaces intact.
5. Records a workspace tombstone in `app.deletion_suppression_ledger`.

---

## 4. Deletion Suppression Ledger & Restoration Procedure

> [!CAUTION]
> **The Resurrection Threat:**
> When restoring a database snapshot taken at `T0`, any user who requested account deletion at `T1 > T0` would be unintentionally resurrected unless post-deletion tombstones are preserved and re-applied during restoration.

### 4.1 Ledger Specification

`app.deletion_suppression_ledger`:

- `entity_type`: `'account'` or `'workspace'`
- `entity_id`: UUID of deleted entity
- `content_free_hash`: SHA-256 hash of `(entity_type + entity_id + identifier)`
- `reason`: Machine-readable deletion reason
- `deleted_at`: Timestamp of deletion
- `expires_at`: 90 days from deletion (exceeding maximum 30-day snapshot retention)

### 4.2 Staging Restoration Drill Runbook

```bash
# Step 1: Restore database snapshot into isolated test database
psql -h $STAGING_DB_HOST -U postgres -d postgres -c "DROP DATABASE IF EXISTS daynori_restore_drill;"
psql -h $STAGING_DB_HOST -U postgres -d postgres -c "CREATE DATABASE daynori_restore_drill;"
pg_restore -h $STAGING_DB_HOST -U postgres -d daynori_restore_drill snapshot_20261018.dump

# Step 2: Extract latest suppression ledger from authoritative replica
psql -h $PRIMARY_DB_HOST -U daynori_runtime -d daynori_prod \
  -c "\COPY (SELECT * FROM app.deletion_suppression_ledger WHERE expires_at > now()) TO 'active_suppression_ledger.csv' CSV HEADER"

# Step 3: Re-apply suppression ledger into restored database
psql -h $STAGING_DB_HOST -U postgres -d daynori_restore_drill \
  -c "\COPY app.deletion_suppression_ledger FROM 'active_suppression_ledger.csv' CSV HEADER"

# Step 4: Execute ledger sanitization query
psql -h $STAGING_DB_HOST -U postgres -d daynori_restore_drill << 'EOF'
-- Purge accounts suppressed by ledger
DELETE FROM app.profiles
WHERE id IN (
  SELECT entity_id FROM app.deletion_suppression_ledger WHERE entity_type = 'account'
);

-- Purge workspaces suppressed by ledger
DELETE FROM app.workspaces
WHERE id IN (
  SELECT entity_id FROM app.deletion_suppression_ledger WHERE entity_type = 'workspace'
);
EOF

# Step 5: Verify zero suppressed entities exist in restored database
psql -h $STAGING_DB_HOST -U postgres -d daynori_restore_drill << 'EOF'
SELECT count(*) AS resurrected_accounts
FROM app.profiles p
JOIN app.deletion_suppression_ledger l ON l.entity_id = p.id AND l.entity_type = 'account';

SELECT count(*) AS resurrected_workspaces
FROM app.workspaces w
JOIN app.deletion_suppression_ledger l ON l.entity_id = w.id AND l.entity_type = 'workspace';
EOF
```

---

## 5. Google Play Account Deletion Policy Compliance

- **Policy Review Date:** 2026-10-18
- **In-App Account Deletion Path:** Accessible within settings (`Settings > Account Deletion & Data Erasure`) with password verification and two-step confirmation.
- **Public Web Deletion Request Resource:** Accessible at `/account-deletion` without requiring app login or active installation. Protected against user enumeration (returns standard acknowledgment regardless of email existence).
- **Disclosed Retained Data:**
  - Zero personal content is retained.
  - Content-free cryptographic hashes in `app.deletion_suppression_ledger` are retained for 90 days strictly for disaster recovery sanitization.
  - Automated database backup snapshots rotate out completely within 30 days.

---

## 6. Incident Response & Disaster Recovery Contacts

- **Primary Incident Coordinator:** Lead Engineering (`ops-lead@daynori.internal`)
- **Security & Privacy Office:** (`privacy@daynori.com`)
- **Escalation Window:** P1 outages / data corruption incidents escalate within 15 minutes.
