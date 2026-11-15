# ADR-0118: Daynori Deployable Web-Core Release Preparation and Production Infrastructure Capacity Plan

- **Status:** accepted
- **Date:** 2026-11-15
- **Owner/Reviewer:** Antigravity agent (owner-authorized Phase 118).
- **Related:** [Phase 118](../roadmap/phases/118-daynori-deployable-web-core-release-preparation-and-production-infrastructure-capacity-plan.md), [Phase 102](../phase-reports/phase-102.md), [Phase 112](../phase-reports/phase-112.md), [Phase 117](../phase-reports/phase-117.md), [ADR 0063](0063-free-core-testing-preview.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [release-gates.md](../engineering/release-gates.md).
- **Supersedes/superseded by:** Supersedes release candidate `2.0.0-rc3` from Phase 102 (which predated Phase 104–117 fixes and was packaged using host Node v24.11.1). Establishes release candidate `2.0.0-rc4` compiled from clean commit `3aebd74` using the repository-required Node runtime (`v24.21.0`). Audits and formally revisits the $0/free-tier preview decision in ADR 0063, establishing that free-tier constraints are unviable for thousands of users. Recommends a managed PaaS production capacity plan ($80–$110/mo) for 1,000 to 10,000 MAU. Preserves all fail-closed release gates (`DEF-V2-001`, `DEF-V2-004`, `DEF-V2-005`, `DEF-V2-007`, `DEF-V2-008`, `DEF-V2-011`, `OWNER-SIGNING-KEYS`, `OWNER-RELEASE-AUTH`). Phase 71 remains blocked on physical hardware and spoken TalkBack.

---

## Context & Owner Scheduling Authorization

The project owner authorized Phase 118 with the following instructions:

> "Prepare a deployable Daynori web-core release from the latest corrected source, using the repository-required Node version. Do not reuse an older archive whose source predates later fixes. Produce an immutable artifact, build SHA, exact startup commands, configuration inventory, and rollback package.
> 
> Design the actual web, API, database, auth, storage, background-job, DNS/TLS, backup, monitoring, and support setup for a public service. Check the existing $0/free-tier decision against the goal of serving thousands. Give me costed hosting options and a recommended capacity plan before provisioning paid resources. Keep credentials out of Git. Follow AGENTS.md, preserve existing changes, and record any missing owner-controlled accounts or decisions precisely."

---

## 1. Candidate Packaging & Toolchain Decision

### 1.1 Corrected Source & Repository-Required Node Version
- **Historical Candidate Limitation (`2.0.0-rc3`):** Packaged during Phase 102 from commit `e71842f`. Its source predated critical remediations delivered in Phases 104 through 117 (evidence-integrity reconciliation, theme capture correction, staging isolation, Google Drive provider audit, Ask Nori proposal confirmation gates, voice audio memory zeroing, native Android candidate identity, and Phase 117 web visual polish). Furthermore, it was built using host Node `v24.11.1` rather than the repository-required Node engine (`v24.21.0`).
- **The Decision:**
  - Compile and package release candidate `2.0.0-rc4` from the latest verified source (commit `3aebd74ac55b53d57ce7ab1274a0c9022c07422c`).
  - Prepend the repository-provided Node engine (`.tools/node-v24.21.0-win-x64`) to `PATH` during compilation, ensuring zero engine warnings and strict compliance with `.node-version`, `.nvmrc`, and root `package.json` (`"node": "^24.21.0"`).
  - Web Build ID: `6BXhesAWPN88FbHwp-Q4g` (compiled with Next.js 15.5.27 across 32 routes with 0 errors).

### 1.2 Distributable Release Artifacts
Two clean, immutable tarball bundles were created in `artifacts/release/`:
1. **Web Frontend (`artifacts/release/daynori-web-v2.0.0-rc4.tar.gz`):**
   - Size: `1,825,996 bytes`.
   - SHA-256: `9c67b4009a802c9a60ac96731b43dae55d0c126503ea624d99975e6d691eb280`.
   - Contents: `.next` (server, static, manifests; build cache excluded), `public`, `package.json`, `next.config.mjs`.
2. **API Backend (`artifacts/release/daynori-api-v2.0.0-rc4.tar.gz`):**
   - Size: `559,223 bytes`.
   - SHA-256: `42b5f7222422796847f3987ae95ce58fb65aaa13be2bd9e484555a0c0dc43d37`.
   - Contents: `dist` (compiled ES modules, type declarations), `package.json`.

---

## 2. Startup Commands & Configuration Inventory

### 2.1 Exact Startup Commands
- **Web Frontend:**
  ```bash
  tar -xzf daynori-web-v2.0.0-rc4.tar.gz
  pnpm install --prod
  NODE_ENV=production PORT=3000 node_modules/.bin/next start
  ```
  - Health Probe: `GET http://localhost:3000/api/health` -> HTTP 200 `{"status":"ok","version":"0.1.0","environment":"production"}`.
- **API Backend:**
  ```bash
  tar -xzf daynori-api-v2.0.0-rc4.tar.gz
  pnpm install --prod
  NODE_ENV=production PORT=3001 HOST=0.0.0.0 node dist/start.js
  ```
  - Health Probe: `GET http://localhost:3001/health` -> HTTP 200 `{"status":"ok"}`.

### 2.2 Configuration & Secrets Inventory
- All environment variables are documented in [`artifacts/phase118/configuration-inventory.json`](../../artifacts/phase118/configuration-inventory.json).
- **Security Rule:** Secret values (`DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DAYNORI_REAUTHENTICATION_SECRET`) are strictly prohibited from Git, pull requests, and logs. Secrets must be injected exclusively at runtime via secure KMS or platform secret managers.
- **Fail-Closed Flags:** High-risk unreleased modules remain explicitly disabled (`NEXT_PUBLIC_FEATURE_VAULT=false`, `NEXT_PUBLIC_FEATURE_ROOMS=false`, `NEXT_PUBLIC_FEATURE_AI=false`, `NEXT_PUBLIC_FEATURE_VOICE=false`, `NEXT_PUBLIC_FEATURE_BILLING=false`, `NEXT_PUBLIC_FEATURE_DRIVE=false`).

---

## 3. Rollback Runbook & Additive Schema Guarantees

- **Additive Migrations Invariant:** All 80 database migrations (`infra/supabase/migrations/00001` through `00080`) are strictly additive. No tables or columns are destroyed without multi-version deprecation.
- **Stateless Instant Rollbacks:** Because database structures are additive, application code can be rolled back to predecessor candidate `2.0.0-rc3` or `2.0.0-rc2` within $< 60$ seconds without database down-migrations.
- **Automated Rollback Triggers:** Sustained P95 latency $> 500\text{ms}$ for 5 min, HTTP 5xx error rate $> 1.0\%$, data corruption exceptions, or multi-tenant isolation failure.
- **Emergency Static Fallback:** In catastrophic upstream failure, edge proxies instantly serve [`apps/web/public/offline-shell.html`](../../apps/web/public/offline-shell.html) (SHA-256: `1b0bf5f65c8d7330d0560fe41acc73a6a9806e9b7aff5cb60daacfc0fbd009cc`) with HTTP 503 and `Retry-After: 300`, protecting offline indexedDB user data.

---

## 4. Re-evaluating the $0 / Free-Tier Decision (ADR 0063)

In ADR 0063, a $0 budget was accepted using Render Free Web Services and Supabase Free Singapore. This evaluation demonstrates why that setup cannot serve thousands of users:
1. **Render Free Sleep Cycle:** 15-minute idle sleep causes 50–75 second cold-start wakeup delays, causing request timeouts.
2. **Render 750h/month Instance Quota:** Running 2 services (Web + API) consumes 1,488 hours/month. Free quota expires in 15.6 days, guaranteeing a **complete service outage for half of every month**.
3. **512MB RAM Limit:** Next.js SSR and Fastify V8 heaps crash with OOM under concurrent user load.
4. **Supabase 500MB DB Limit:** With 1,000 active users, daily notes and sync receipts consume ~5–10MB/day, exhausting the 500MB storage in 50–100 days.
5. **Connection Pool Cap:** 15 connections cause immediate connection exhaustion errors (`53300: too many connections`) under 50+ concurrent sync calls.
6. **7-Day Inactivity Pause & Lack of PITR:** Free projects pause automatically after 7 days without dashboard login; zero Point-in-Time Recovery backups exist.

**Conclusion:** The $0 free tier is suitable only for zero-cost developer rehearsal and isolated previews. A dependable public service requires paid infrastructure.

---

## 5. Capacity Plan & Costed Hosting Options

We evaluated three production options for serving 1,000 to 10,000 MAU (peak 100–500 concurrent connections):
- **Option 1: Modern Managed PaaS (Recommended):** Vercel Pro ($20/mo) + Railway Pro ($35/mo) + Supabase Pro ($35/mo) + Cloudflare R2/Free ($5/mo) + Sentry ($15/mo) = **$80 – $110 / month**.
  - *Benefits:* Zero cold starts, automatic edge distribution, 7-day continuous PITR backups, $< 1\text{ hr/mo}$ sysadmin maintenance.
- **Option 2: Unified Container Cloud:** DigitalOcean App Platform ($42/mo) + Managed Postgres ($30/mo) + Auth/Spaces ($30/mo) = **$105 – $145 / month**.
- **Option 3: Lean Bare-Metal / Dedicated VPS:** 2× Hetzner CPX31 VPS ($30/mo) + Coolify/Docker + Backblaze B2 ($5/mo) = **$35 – $50 / month** (requires significant manual Linux sysadmin maintenance).

**Recommendation:** Proceed with **Option 1 (Managed PaaS)** upon owner budget authorization ($80–$110/mo).

---

## 6. Standing Release Gates Register

| Gate | Status | Requirement to Clear |
|---|---|---|
| `OWNER-RELEASE-AUTH` | **BLOCKED** | Explicit owner approval of Candidate `2.0.0-rc4` and published core scope. |
| `OWNER-PROD-DNS` | **BLOCKED** | Provisioning of `app.daynori.com` and `api.daynori.com` in Cloudflare DNS. |
| `OWNER-SUPABASE-PRO` | **BLOCKED** | Upgrade of database to Supabase Pro tier ($25/mo) with connection pooling. |
| `OWNER-HOSTING-ACCOUNT` | **BLOCKED** | Production hosting accounts (Vercel, Railway) provisioned by owner. |
| `OWNER-SMTP-CREDENTIALS` | **BLOCKED** | Production transactional email provider configured. |
| `OWNER-BUDGET-AUTH` | **BLOCKED** | Owner authorization of $80–$120/mo operating envelope before provisioning. |
| `OWNER-SIGNING-KEYS` | **BLOCKED** | Release keystore configured for native Android track. |
| `DEF-V2-001` | **BLOCKED** | Production Supabase IdP configuration and OAuth redirect whitelist. |
| `DEF-V2-004` | **BLOCKED** | Vault independent cryptographic audit. |
| `DEF-V2-005` | **BLOCKED** | Google Drive restricted scope verification. |
| `DEF-V2-006` | **BLOCKED** | Rooms moderation team assignment. |
| `DEF-V2-007` | **BLOCKED** | Play Billing merchant account. |
| `DEF-V2-008` | **BLOCKED** | Ask Nori live API provider terms and budget ceiling. |
| `DEF-V2-011` | **BLOCKED** | Native Android physical device verification. |
| `DEF-V2-013` | **SATISFIED** | 5/5 live consenting human usability sessions verified in Phase 102. |
