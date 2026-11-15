# ADR 0126: Daynori Staging Database Backup & Restore Drill, Compatible Artifact Rollback, and Operations Staffing Audit

- **Status:** Accepted
- **Date:** 2026-11-15
- **Deciders:** Project Owner, Technical Operations Lead, Security & Privacy Officer
- **Consulted:** Core Platform Engineers, Infrastructure Contributors
- **Informed:** Product Stakeholders

---

## 1. Context and Problem Statement

Following the claims reclassification in Phase 123 and the multi-user staging journey verification in Phase 125, Daynori required empirical operational validation on its deployed infrastructure:
1. Prior staging verification runs had checked backup documentation (`docs/engineering/backup-and-recovery.md`), but had not executed an actual database backup and isolated restore against the live staging cluster.
2. Production readiness mandates proving that deployment rollbacks between compatible release candidates (e.g. `2.0.0-rc5` to `2.0.0-rc4`) are strictly non-destructive and preserve saved user data without schema exceptions.
3. Operational governance in `docs/operations/incident-response-and-support-roster.md` documented emergency roles and support emails (`support@daynori.com`, `security@daynori.com`), but had not verified whether active DNS MX routing, mailboxes, or human escalation rotations were actually staffed and configured.
4. AGENTS.md mandates strict truthfulness: all release documents must distinguish configured and tested mechanisms from proposed target runbooks, keeping public publication strictly blocked if any essential recovery or support path is unproven.

---

## 2. Technical Decisions & Invariants

### 2.1 Live Staging Database Backup & Restore Drill into Isolated Database
- **Execution Target:** Live hosted staging PostgreSQL cluster on Supabase (`aws-0-ap-southeast-1.pooler.supabase.com:5432`, `postgres.sexxceqqknqzvxuuqnkx`).
- **Disposable Seed Data:** Seeded disposable survivor and deletion-candidate user profiles, workspaces, notes, tasks (todos), routines, and journal reflections.
- **T0 Snapshot:** Captured logical backup of relational entities at $T_0$, computing payload SHA-256 and byte sizes.
- **T1 Account Deletion:** Executed deletion for candidate user, permanently purging records from `app.items`, `app.workspaces`, and `app.profiles`, and registering cryptographic deletion tombstones in `app.deletion_suppression_ledger`.
- **Independent Suppression Ledger Export:** Exported active suppression tombstones independently outside the backup archive (`artifacts/phase126/independent-suppression-ledger.json`).
- **Isolated Target Provisioning:** Dynamically provisioned an isolated staging database (`daynori_restore_drill`), configured extensions (`uuid-ossp`, `pg_trgm`), and created table schemas in schema `app`.
- **Pre-Access Suppression Barrier:** Replayed the independent suppression ledger into `daynori_restore_drill` and executed sanitization queries **before** opening access.
- **Empirical Measurement:**
  - Backup Duration ($T_0$): **719ms** (10,555 bytes, SHA-256: `ab527077b16b982aa28b6fecc5ecad279b88bc0637a56213f3ba8a440959e78f`).
  - Restore Duration: **1,427ms**.
  - Sanitization Duration: **287ms**.
  - Total Measured Recovery Time Objective (RTO): **1,714ms (1.71 seconds)**.
  - Survivor Data Preservation: **100% verified** (1 profile, 1 workspace, 1 note, 1 task, 1 routine, 1 journal reflection).
  - Canonical JSON Checksum Match: Exact match (`a7c2696f451b16b7615af2995f380a36362410a4f2122075dcc3e93959d6588e`).
  - Data Loss (RPO): **0 bytes lost, 0 rows lost, 0 seconds data loss** for transactions committed prior to $T_0$.
  - Resurrection Prevention: **0 resurrected accounts, 0 resurrected workspaces, 0 resurrected items (ZERO LEAKS)**.
- **Teardown:** Cleaned up primary staging seed data and dropped `daynori_restore_drill` with `DROP DATABASE daynori_restore_drill WITH (FORCE)`.

### 2.2 Compatible Artifact Rollback Demonstration
- **Candidate Compatibility:** Verified release candidates `2.0.0-rc5` (Web SHA: `628ce688...`, API SHA: `6688fdcd...`) and predecessor `2.0.0-rc4` (Web SHA: `9c67b400...`, API SHA: `42b5f722...`).
- **Additive Schema Invariant:** All 80 migrations in `infra/supabase/migrations/` (`00001` through `00076`) are strictly additive. Predecessor candidate `2.0.0-rc4` reads and operates on the staging database schema without schema conflicts, preserving user data written by `2.0.0-rc5` with **0 bytes data loss**.
- **Emergency Static Cutover:** Verified immutable offline shell [`apps/web/public/offline-shell.html`](../../apps/web/public/offline-shell.html) (6,400 bytes, SHA-256: `1b0bf5f6...`), which enforces `HTTP 503 Service Unavailable`, `Retry-After: 300`, and preserves local IndexedDB offline drafts during unrecoverable backend failures.

### 2.3 Monitoring Alerts, Mailbox & Operational Staffing Audit
- **DNS MX Resolution:** Executed DNS lookup for `daynori.com` MX records.
  - **Observed:** 0 MX records returned (`hasActiveMxRouting: false`).
  - **Impact:** Emails dispatched to `support@daynori.com` or `security@daynori.com` will bounce. Public support mailboxes are unconfigured on the domain.
- **Automated Pager Telemetry:** Render and Cloudflare dashboards provide metric graphs, but automated webhook dispatch to an active on-call pager rotation (PagerDuty / Opsgenie) remains a proposed target runbook, not wired to real pagers.
- **Operational Staffing:** Designated roles in `docs/operations/incident-response-and-support-roster.md` (Incident Commander, Technical Ops Lead, Security & Privacy Officer, Support Lead) are documented specifications, but active human staffing and 24/7 on-call rotations are **unassigned**.

---

## 3. Configured vs. Proposed Mechanism Classification

To maintain repository truthfulness, mechanisms are formally partitioned:

| Operational Dimension | Status | Evidence / Notes |
|---|---|---|
| **Staging DB Restore Drill** | **CONFIGURED & TESTED** | Executed against live staging; RTO = 1.71s, RPO = 0s, zero leaks. |
| **Suppression Ledger Barrier** | **CONFIGURED & TESTED** | Pre-access barrier prevents resurrection of deleted accounts/workspaces. |
| **Artifact Rollback (rc5 -> rc4)** | **CONFIGURED & TESTED** | Non-destructive, additive schema invariant, zero data loss. |
| **Emergency Static Cutover** | **CONFIGURED & TESTED** | `offline-shell.html` with HTTP 503 and Retry-After 300. |
| **In-App Feedback Intake** | **CONFIGURED & TESTED** | `app.feedback_reports` and triage tables (migrations 00075/00076). |
| **Production Cloud PITR** | **PROPOSED RUNBOOK** | Continuous WAL streaming requires paid Supabase Pro (`OWNER-SUPABASE-PRO`). |
| **Support / Security Mailboxes** | **UNCONFIGURED** | 0 MX records on `daynori.com`; mailboxes bounce. |
| **Automated Pager Alerting** | **PROPOSED RUNBOOK** | Dashboard telemetry active; pager webhook unconfigured. |
| **Operational Staffing** | **UNSTAFFED** | Roles defined in runbook; real human staff unassigned. |

---

## 4. Consequences and Publication Gate Status

- **Publication Status:** **STRICTLY BLOCKED**. Public launch cannot proceed until:
  1. The owner configures DNS MX records on `daynori.com` and provisions active mailboxes for `support@daynori.com` and `security@daynori.com` (`OWNER-MAILBOX-SETUP`).
  2. The owner assigns real human personnel to the operational incident response roster (`OWNER-SUPPORT-STAFFING`).
  3. Automated alerting webhooks are wired to active on-call pagers (`OWNER-PAGER-ALERTING`).
  4. Standing gates (`OWNER-RELEASE-AUTH`, `OWNER-PROD-DNS`, `OWNER-SUPABASE-PRO`, `OWNER-SIGNING-KEYS`, Phase 71) are formally resolved.
- **Machine-Readable Evidence:** Recorded in [`artifacts/phase126/operations-drill-results.json`](../../artifacts/phase126/operations-drill-results.json) and automated test suite [`tests/release/phase126-operations-recovery-and-staffing.test.ts`](../../tests/release/phase126-operations-recovery-and-staffing.test.ts).
