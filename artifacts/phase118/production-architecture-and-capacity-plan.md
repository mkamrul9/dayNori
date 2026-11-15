# Daynori Public Service Production Architecture & Capacity Plan

- **Release Candidate:** `2.0.0-rc4`
- **Target Audience:** 1,000 to 10,000 Monthly Active Users (MAU)
- **Peak Concurrency:** 100 to 500 concurrent connections
- **Date:** 2026-11-15T12:00:00.000Z
- **Author:** Daynori Core Engineering

---

## 1. Executive Summary & Scope Definition

This document defines the comprehensive production architecture, operational infrastructure, and capacity plan for the Daynori Web-Core public release. Daynori is an everyday organizer application combining personal notes, prioritized tasks, daily routines, agenda calendars, and reflective journals into an offline-first, private personal workspace.

### Release Scope: Bounded Web/PWA Core
The deployable candidate artifact `2.0.0-rc4` is compiled from the latest verified source (commit `3aebd74` with BUILD_ID `6BXhesAWPN88FbHwp-Q4g`) using the repository-required Node runtime (`v24.21.0`).

- **Verified Enabled Core Actions (78 Actions):**
  - Personal Notes (Markdown/AST, revisions, pins, trash)
  - Everyday Tasks (priorities, deadlines, subtasks, keyboard reordering)
  - Daily Routines (timezone-aware occurrence generation, independent dates)
  - Agenda Calendar (integrated schedule feeds, canonical deep links)
  - Reflective Journals (entry logging, privacy snippets, backdating)
  - Library & Knowledge Organization (hierarchical folders, saved views)
  - Global Search (workspace-scoped full-text search)
  - Offline-first Synchronization (outbox queue, mutation receipts, explicit conflict handling)
  - Guided Tours & In-app Help (19 guided chapters, keyboard help)
  - Support & Feedback (privacy-preserving user report submission)
- **Fail-Closed Unreleased Modules (31 Gated Actions):**
  - Vault (`DEF-V2-004`): Returns HTTP 403; encrypted hardware/passphrase boundaries pending external security audit.
  - Rooms / Collaboration (`DEF-V2-006`): Returns HTTP 403; real-time chat disabled pending staffed moderation team assignment.
  - Ask Nori AI Assistant (`DEF-V2-008`): Returns HTTP 403; LLM provider spending ceiling and live consent gates pending.
  - Voice Assistant (`DEF-V2-008` / `DEF-V2-011`): Gated; speech transcription and physical hardware capture pending.
  - In-App Billing (`DEF-V2-007`): Returns HTTP 403; Google Play merchant registration pending.
  - Google Drive Sync (`DEF-V2-005`): Gated; OAuth consent screen verification pending.
  - Native Android (`DEF-V2-011` / `OWNER-SIGNING-KEYS`): Tracked on independent hardware track.

---

## 2. Public Service Architecture (10 Core Dimensions)

```mermaid
flowchart TD
    User["End User (Browser / PWA)"] -->|HTTPS / TLS 1.3| CF["Cloudflare Edge (DNS / WAF / CDN / DDoS)"]
    CF -->|Static Assets & PWA Shell| Vercel["Next.js Web Frontend (Vercel Edge/SSR)"]
    CF -->|API Requests (/v1/*)| API["Fastify API Cluster (Railway / Containers)"]
    API -->|Connection Pooler (Port 6543)| Supavisor["Supavisor Pooler (Transaction Mode)"]
    Supavisor -->|Direct SQL| PG["PostgreSQL 16 (Supabase Pro)"]
    API -->|Auth Verification| GoTrue["Supabase Auth (GoTrue)"]
    API -->|Signed Put/Get URLs| R2["Cloudflare R2 Object Storage"]
    Worker["Dedicated Background Worker"] -->|Queue Polling| PG
    Worker -->|Purge Expired Data| R2
    PG -.->|Continuous WAL Archiving| Backup["7-Day Point-in-Time Recovery (PITR)"]
    API -.->|Telemetry & Errors| Sentry["Sentry & Axiom Observability"]
```

### 2.1 Web Frontend Service
- **Framework:** Next.js 15.5.27 (App Router, React 18.3.1).
- **Hosting Target:** Vercel Pro or managed Node container.
- **Edge Distribution:** Static client bundles (`/_next/static/*`) cached at Cloudflare/Vercel edge with immutable headers (`Cache-Control: public, max-age=31536000, immutable`).
- **Security Headers:** Strict Content Security Policy (CSP Level 3) with dynamic per-request cryptographic nonces, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.
- **Offline PWA Shell:** Service worker precaches `offline-shell.html` and `offline-shell.js` ensuring instant app availability during transient network dropouts.

### 2.2 Backend API Service
- **Framework:** Fastify 5.2.1 on Node.js v24.21.0.
- **Hosting Target:** Containerized service (Railway Pro, Fly.io, or AWS ECS Fargate) running $\ge 2$ instances behind a round-robin load balancer.
- **Performance Characteristics:** Asynchronous event-loop architecture delivering $< 45\text{ms}$ P95 API response times.
- **Resilience:** Graceful shutdown on `SIGTERM`/`SIGINT` allowing up to 10 seconds for in-flight requests to complete before terminating the database pool.
- **Rate Limiting:** IP-based token bucket rate limiting (120 req/min general, 15 req/min on authentication routes).

### 2.3 Database & Data Persistence
- **Engine:** PostgreSQL 16+ hosted on Supabase Pro with high-performance NVMe storage.
- **Connection Management:** Supavisor connection pooler running in Transaction Pooling mode (port 6543) supporting $\ge 200$ client connections with low memory footprint.
- **Security & Multi-Tenancy:** Row Level Security (RLS) enabled across 100% of tenant tables. Every query is scoped to `workspace_id = auth.current_workspace_id()`.
- **Schema Evolution:** Strictly additive SQL migrations (`00001` through `00080`). No destructive down-migrations; forward-compatible schema guarantees zero-downtime rollbacks.

### 2.4 Authentication & Identity Provider
- **Provider:** Supabase Auth (GoTrue engine).
- **Protocols:** OAuth2 / OpenID Connect (Google, GitHub) + Passwordless Email Magic Link / OTP.
- **Token Architecture:** Asymmetric JWTs signed via RS256/ES256. The API verifies signatures locally using Supabase's JWKS endpoint (`/.well-known/jwks.json`), eliminating database auth lookups on every request.
- **Session Security:** Short-lived access tokens (1 hour) paired with refresh token rotation. Tokens stored in secure `HttpOnly`, `SameSite=Lax` cookies.

### 2.5 Object & Attachment Storage
- **Provider:** Cloudflare R2 (S3-compatible API).
- **Access Model:** Direct browser-to-storage uploads via short-lived (15-minute) pre-signed PUT URLs generated by the API.
- **Security Quarantine:** Newly uploaded files enter a quarantine bucket. Metadata is validated (size, MIME type, magic bytes) before promotion to the workspace assets bucket.
- **Cost Efficiency:** Zero egress bandwidth fees on Cloudflare R2, drastically reducing media serving costs.

### 2.6 Background Job Processing
- **Service:** Dedicated `@daynori/worker` process.
- **Queueing Engine:** PostgreSQL-backed queue (`pg-boss` or native transactional outbox tables).
- **Core Jobs:**
  - Scheduled routine occurrence generation (daily at midnight local time).
  - Physical data deletion sweeps (permanently destroying workspaces marked for deletion after 30-day grace period).
  - Outbox receipt compaction and sync audit log rotation.
- **Guarantees:** At-least-once execution with idempotent transaction receipts.

### 2.7 DNS, TLS & Edge Security
- **DNS Provider:** Cloudflare Authoritative DNS with DNSSEC enabled.
- **TLS Configuration:** Modern TLS 1.3 only; automated renewal of SSL/TLS certificates.
- **HSTS:** `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
- **WAF Rules:** Managed rule sets mitigating SQL injection, cross-site scripting (XSS), and automated credential stuffing.

### 2.8 Backup & Disaster Recovery
- **Continuous Archiving:** Continuous Write-Ahead Log (WAL) archiving enabling 7-day Point-in-Time Recovery (PITR).
- **Logical Backups:** Daily encrypted `pg_dump` snapshots stored in a geographically distinct cold bucket (AWS S3 Glacier or Backblaze B2).
- **Recovery Targets:**
  - **Recovery Point Objective (RPO):** $< 5\text{ minutes}$.
  - **Recovery Time Objective (RTO):** $< 15\text{ minutes}$.
- **Verification:** Quarterly automated recovery drills restoring to a test environment and running sanity assertions.

### 2.9 Monitoring, Observability & Telemetry
- **Error Tracking:** Sentry for unhandled client-side React exceptions and server-side Fastify errors.
- **Structured Logging:** JSON logs with correlation IDs (`x-request-id`, `workspace_id`, `user_id`) shipped to Axiom or Grafana Loki.
- **Uptime Monitoring:** External synthetic pingers (Better Stack / Pingdom) probing `https://app.daynori.com/api/health` and `https://api.daynori.com/health` every 60 seconds from multiple geographic regions.
- **Alerting Thresholds:** PagerDuty/Slack escalation upon sustained error rates $> 1\%$ or P95 latency $> 500\text{ms}$.

### 2.10 Customer Support & Operational Delivery
- **In-App Feedback:** Built-in `feedback` family enables users to submit reports, usability feedback, and bug reports without tracking cookies.
- **Operational Triage:** Developer triage board (`/developer/triage`) with workspace scoping.
- **Status Communication:** Independent public status dashboard at `https://status.daynori.com`.
- **Target Availability:** $99.9\%$ monthly uptime SLA ($\le 43.8\text{ minutes}$ downtime/month).

---

## 3. Critical Audit: The $0 / Free-Tier Decision vs Serving Thousands

In **ADR 0063** (`Free core testing preview`), a $0 budget was approved utilizing Render Free Web Services and a Singapore Supabase Free project. While sufficient for isolated single-user rehearsals and development spikes, this architecture is **fundamentally incapable of supporting a public service for thousands of users**.

### Concrete Failure Modes of Free-Tier Hosting:
1. **Render Free Sleep Cycle:**
   - Free instances spin down after 15 minutes of inactivity. Waking up requires **50 to 75 seconds**.
   - *Public Impact:* First-time visitors experience an apparent app hang or browser timeout. Mobile PWA sync fails.
2. **Monthly Instance Hours Ceiling:**
   - Render free accounts receive **750 hours/month total** across the entire workspace.
   - Running two continuous services (Web + API) consumes:
     $$\text{Total Hours} = 2 \times 24 \times 31 = 1,488\text{ hours/month}$$
   - *Result:* Free quota is exhausted in exactly **15.6 days**, causing an unrecoverable **complete blackout for the remainder of every month**.
3. **Severe Memory & OOM Crashes:**
   - Render free limits containers to **512MB RAM**.
   - Next.js 15 SSR bundle execution + Fastify V8 heap regularly reach 350–450MB under moderate usage. Under concurrent multi-user load, the process suffers kernel OOM kills.
4. **Supabase Free Database Storage Cap:**
   - Capped at **500MB**.
   - With 1,000 active users writing daily notes, task histories, routines, and sync receipts, storage grows at ~5–10MB/day. The database fills completely within 50 to 100 days, rejecting all write mutations.
5. **Connection Pool Exhaustion:**
   - Supabase free provides only **15 pooler connections** and 60 direct connections.
   - Concurrent sync traffic from 100 users triggers immediate `53300: too many connections` database rejections.
6. **Inactivity Pausing:**
   - Free Supabase projects pause after 7 days without dashboard activity, requiring manual human intervention.
7. **Disaster Recovery Void:**
   - Zero PITR backups. If data corruption occurs, manual restore from manual exports is the only option.

**Conclusion:** A dependable public service serving thousands requires upgrading to paid managed infrastructure.

---

## 4. Costed Hosting Options & Capacity Modeling

### Workload Model (1,000 to 10,000 MAU)
- **Daily Active Users (DAU):** 200 to 2,500 DAU.
- **Peak Concurrent Users:** 50 to 500 simultaneous users.
- **Requests per Second (RPS):** Peak 30–80 RPS.
- **Database Operations:** Peak 150–400 queries/sec.
- **Storage Growth:** ~15–30GB/year.

### Hosting Options Comparison

| Dimension | Option 1: Managed PaaS (Recommended) | Option 2: Unified Cloud (DigitalOcean) | Option 3: Lean Bare-Metal (Hetzner VPS) |
|---|---|---|---|
| **Web Frontend** | Vercel Pro ($20/mo) | DO App Platform ($12/mo) | Included on VPS 1 ($15/mo) |
| **API Backend** | Railway Pro ($25/mo) | DO App Platform ($25/mo) | Included on VPS 1 |
| **Worker Daemon** | Railway Pro ($10/mo) | DO App Platform ($5/mo) | Included on VPS 1 |
| **Database** | Supabase Pro ($35/mo) | DO Managed Postgres ($30/mo) | Self-hosted on VPS 2 ($15/mo) |
| **Auth** | Supabase Auth (Included) | Supabase Auth ($25/mo) | Self-hosted GoTrue ($0) |
| **Storage** | Cloudflare R2 (~$5/mo) | DO Spaces ($5/mo) | Backblaze B2 (~$5/mo) |
| **DNS / CDN / WAF** | Cloudflare Free ($0) | Cloudflare Free ($0) | Cloudflare Free ($0) |
| **Monitoring** | Sentry + Axiom ($15/mo) | Sentry ($15/mo) | Self-hosted VictoriaMetrics ($0) |
| **Total Monthly Cost** | **$80 – $110 / month** | **$105 – $145 / month** | **$35 – $50 / month** |
| **Cold Starts** | Zero (Always-on) | Zero (Always-on) | Zero (Always-on) |
| **Backups** | 7-Day Continuous PITR | Automated Daily | Custom pgBackRest to B2 |
| **DevOps Maintenance** | Minimal ($\approx 1\text{ hr/mo}$) | Moderate ($\approx 4\text{ hrs/mo}$) | High ($\approx 15\text{ hrs/mo}$) |
| **Max Capacity** | Up to 25,000 MAU | Up to 20,000 MAU | Up to 50,000 MAU |

### Recommended Capacity Plan: Option 1 (Managed PaaS)
We strongly recommend **Option 1 (Vercel + Railway + Supabase Pro)** for initial public rollout:
1. **Predictable Low Budget:** \$80–\$110/month fits standard early-stage operational envelopes while delivering enterprise-grade SLAs.
2. **Zero Infrastructure Maintenance:** Automatic OS security patching, managed zero-downtime database upgrades, and automated multi-region edge distribution.
3. **Data Safety:** Supabase Pro's 7-day Point-in-Time Recovery guarantees RPO $< 5\text{ minutes}$.

---

## 5. Owner-Controlled Accounts & Decision Gates

Before live provisioning or public launch, the project owner must provide the following accounts and approvals:

1. **`OWNER-PROD-DNS`:** Provision and point `app.daynori.com` (Web) and `api.daynori.com` (API) in Cloudflare DNS.
2. **`OWNER-SUPABASE-PRO`:** Authorize upgrade of Daynori database project to Supabase Pro tier (\$25/mo) to unlock connection pooling and PITR.
3. **`OWNER-HOSTING-ACCOUNT`:** Provide team access or deploy token for Vercel and Railway production workspaces.
4. **`OWNER-SMTP-CREDENTIALS`:** Configure production transactional email provider (Resend, Postmark, or SendGrid) for user invitations, verification, and password resets.
5. **`OWNER-BUDGET-AUTH`:** Formally authorize the monthly hosting expenditure envelope (\$80–\$120/month).
6. **`OWNER-RELEASE-AUTH`:** Formal sign-off on Candidate `2.0.0-rc4` and published core scope.
