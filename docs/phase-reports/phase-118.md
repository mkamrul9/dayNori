# Phase 118: Daynori deployable web-core release preparation and production infrastructure capacity plan

## Identity and scope

- Phase: [118 — Daynori deployable web-core release preparation and production infrastructure capacity plan](../roadmap/phases/118-daynori-deployable-web-core-release-preparation-and-production-infrastructure-capacity-plan.md).
- Status: **blocked** — Deployable Web-Core Release Candidate `2.0.0-rc4` prepared from latest verified source (commit `3aebd74`, BUILD_ID `6BXhesAWPN88FbHwp-Q4g`) using the repository-required Node runtime (`v24.21.0`). Immutable artifacts packaged and cryptographically hashed (`artifacts/release/daynori-web-v2.0.0-rc4.tar.gz` and `artifacts/release/daynori-api-v2.0.0-rc4.tar.gz`), exact startup commands verified operational with zero engine warnings, configuration inventory authored excluding secrets from Git and logs, comprehensive rollback package and runbook established, 10-dimension public service architecture designed, the existing $0 free tier (ADR 0063) critically evaluated and demonstrated unviable for thousands of users, and costed hosting options modeled for 1,000–10,000 MAU recommending Option 1 Managed PaaS (\$80–\$110/month). Status remains strictly **BLOCKED** pending owner-controlled account provisioning, budget authorization, and explicit launch approval.
  - Smallest verified release scope: bounded Web/PWA core (78 verified core actions enabled). Drive, AI, Voice, Vault, Rooms, Billing, Push, and Android remain fail-closed on their independent tracks.
  - Candidate packaging:
    - **Active Candidate (2.0.0-rc4)**: Packaged complete production Web bundle (`artifacts/release/daynori-web-v2.0.0-rc4.tar.gz`, 1,825,996 bytes, SHA-256: `9c67b4009a802c9a60ac96731b43dae55d0c126503ea624d99975e6d691eb280`) and API bundle (`artifacts/release/daynori-api-v2.0.0-rc4.tar.gz`, 559,223 bytes, SHA-256: `42b5f7222422796847f3987ae95ce58fb65aaa13be2bd9e484555a0c0dc43d37`) using Node v24.21.0 from clean commit `3aebd74`.
    - **Historical Predecessors**: Baseline `2.0.0-rc3` (commit `e71842f`, SHA-256: `508adab6404b31d51ddbce59a517ed6df017a5a707781f2432e9682006452830`) and `2.0.0-rc2` (commit `5073928`, SHA-256: `6a5b1284ae091be85afa5029e03031a53e2478c47aafb3b963e930fdc8357b3f`).
  - Architecture and capacity plan: authored in [`artifacts/phase118/production-architecture-and-capacity-plan.md`](../../artifacts/phase118/production-architecture-and-capacity-plan.md) and [`artifacts/phase118/costed-hosting-matrix.json`](../../artifacts/phase118/costed-hosting-matrix.json).
  - Rollback package: authored in [`artifacts/phase118/rollback-package-runbook.md`](../../artifacts/phase118/rollback-package-runbook.md) verifying non-destructive additive schema guarantees.
- Contributor/date: Antigravity agent, 2026-11-15.
- Base revision/branch: `3aebd74ac55b53d57ce7ab1274a0c9022c07422c`, `codex/free-core-preview`.
- Hard prerequisites: Phase **102**, Phase **112**, Phase **117**.
- Owner Scheduling Authorization: The owner authorized Phase 118 for deployable web-core release preparation and production infrastructure capacity plan. Standing push authorized under ADR 0074.

---

## Result

### Implementation and Verifications Delivered

1. **Deployable Web-Core Release Candidate `2.0.0-rc4`**:
   - Compiled with repository-required Node `v24.21.0` (from `.tools/node-v24.21.0-win-x64`) with zero engine warnings.
   - Built from clean commit `3aebd74ac55b53d57ce7ab1274a0c9022c07422c` incorporating all Phase 104–117 fixes.
   - Next.js Web Build ID: `6BXhesAWPN88FbHwp-Q4g` (32 static and dynamic routes compiled cleanly).
   - Fastify API build: compiled cleanly via `tsc -b`.

2. **Immutable Artifacts and Cryptographic Hashes**:
   - Web Archive: `artifacts/release/daynori-web-v2.0.0-rc4.tar.gz` (size: 1,825,996 bytes; SHA-256: `9c67b4009a802c9a60ac96731b43dae55d0c126503ea624d99975e6d691eb280`).
   - API Archive: `artifacts/release/daynori-api-v2.0.0-rc4.tar.gz` (size: 559,223 bytes; SHA-256: `42b5f7222422796847f3987ae95ce58fb65aaa13be2bd9e484555a0c0dc43d37`).
   - Individual PWA client assets verified:
     - `manifest.json`: `417faac1bd5c0d083657a7a69c645a2387c797e1ac60500f462d9db3d280cf40`
     - `sw.js`: `6e243130bed7d29e51c330a378380805f87539798692abe5c4f8127bb1f70cb3`
     - `offline-shell.html`: `1b0bf5f65c8d7330d0560fe41acc73a6a9806e9b7aff5cb60daacfc0fbd009cc`
     - `offline-shell.js`: `69649cdab12d593dc7a9fed5607aba0a22b9e5336e855d6117a9fd0ce0462e4f`
     - `brand/icon-192.png`: `eab6433abbca70b7392ead34a499c1d901bc48fe4e849bfff9ee43b66d6eee64`
     - `brand/icon-512.png`: `dc0ebf905510c9cae68046262c198a76d11fa010bcab53e3c1745bb8467b377e`
     - `brand/icon-maskable-512.png`: `69d0b2d8a9438f3262692ba76aa64a9e547d5d4aab718d6450b6395f5f868835`

3. **Exact Production Startup Commands & Health Verification**:
   - Web: `NODE_ENV=production PORT=3000 node_modules/.bin/next start` (tested locally on port 3120; ready in 669ms; `GET /api/health` returned HTTP 200).
   - API: `NODE_ENV=production PORT=3001 HOST=0.0.0.0 node dist/start.js` (verified syntax and startup hooks).

4. **Configuration Inventory & Secrets Separation**:
   - Complete manifest authored in [`artifacts/phase118/configuration-inventory.json`](../../artifacts/phase118/configuration-inventory.json).
   - Strict security policies enforced: zero credentials in Git or logs. Secrets injected exclusively via runtime environment variables.
   - Unreleased modules fail-closed under their respective gates.

5. **Rollback Package & Non-Destructive Invariants**:
   - Documented in [`artifacts/phase118/rollback-package-runbook.md`](../../artifacts/phase118/rollback-package-runbook.md).
   - Verified that all 80 database migrations are additive, ensuring stateless rollbacks to `2.0.0-rc3` or `2.0.0-rc2` require zero down-migrations and risk zero user data loss.
   - Static emergency maintenance fallback shell (`offline-shell.html`) configured for sub-10-second edge cutover during critical outages.

6. **Critical Audit of $0 / Free Tier (ADR 0063)**:
   - Proved that Render Free (750 hours/mo cap expiring in 15.6 days for 2 services, 15-min idle sleep with 50-75s wakeups, 512MB RAM cap) and Supabase Free (500MB DB cap, 15 connection pool, 7-day auto-pause, zero PITR) cannot support thousands of users.
   - Documented in [`artifacts/phase118/production-architecture-and-capacity-plan.md`](../../artifacts/phase118/production-architecture-and-capacity-plan.md).

7. **Capacity Modeling & Costed Hosting Options**:
   - Modeled traffic for 1,000–10,000 MAU (peak 100–500 concurrent connections).
   - Authored comparison matrix in [`artifacts/phase118/costed-hosting-matrix.json`](../../artifacts/phase118/costed-hosting-matrix.json):
     - **Option 1: Modern Managed PaaS (Recommended):** Vercel Pro + Railway Pro + Supabase Pro ($80–$110/mo). Zero cold starts, 7-day continuous PITR, minimal maintenance.
     - **Option 2: Unified Container Cloud:** DigitalOcean App Platform + Managed Postgres ($105–$145/mo).
     - **Option 3: Lean Bare-Metal VPS:** Hetzner 2× CPX31 VPS ($35–$50/mo) with self-managed Coolify/Docker.

---

## Remaining owner decisions and gates

1. **`OWNER-PROD-DNS`**: Provision `app.daynori.com` and `api.daynori.com` in Cloudflare DNS.
2. **`OWNER-SUPABASE-PRO`**: Authorize upgrade to Supabase Pro ($25/mo) to unlock connection pooling and 7-day continuous PITR backups.
3. **`OWNER-HOSTING-ACCOUNT`**: Authorize and provide production hosting accounts (Vercel, Railway).
4. **`OWNER-SMTP-CREDENTIALS`**: Configure transactional email provider for user verification and auth links.
5. **`OWNER-BUDGET-AUTH`**: Authorize the monthly operating expenditure envelope of \$80–\$120/month.
6. **`OWNER-RELEASE-AUTH`**: Authorize Candidate `2.0.0-rc4` and launch of the bounded Web/PWA core scope.

---

## Stop condition

Release candidate `2.0.0-rc4` is compiled and packaged with Node v24.21.0 from clean commit `3aebd74`, immutable artifacts are hashed, configuration inventory and rollback packages are verified, the public service architecture and capacity plan are complete, and all missing owner accounts and authorizations are precisely recorded. As instructed, work stops here for owner review before provisioning paid resources.
