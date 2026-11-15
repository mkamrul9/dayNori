# Daynori Web-Core Rollback Package & Operational Runbook

- **Release Candidate:** `2.0.0-rc4`
- **Build SHA:** `6BXhesAWPN88FbHwp-Q4g`
- **Git Revision:** `3aebd74ac55b53d57ce7ab1274a0c9022c07422c`
- **Last Updated:** 2026-11-15T12:00:00.000Z

---

## 1. Objectives & Non-Destructive Invariants

This runbook establishes deterministic, fast, and safe rollback procedures for the Daynori web-core production deployment. All Daynori database schema migrations (`00001` through `00080`) are **strictly additive**. Columns, tables, and triggers are forward-compatible and never drop existing schema definitions without multi-phase deprecation cycles.

Because database changes are additive:
1. **Stateless Fast Rollbacks:** The application layer (Web frontend and API backend) can be rolled back to predecessor candidate `2.0.0-rc3` (or `2.0.0-rc2`) instantly without requiring database rollbacks or destructive down-migrations.
2. **Zero Data Loss:** In-flight user notes, tasks, routines, and journal mutations written during the active release remain safely preserved in the database.
3. **Deterministic State Reversion:** Client PWA service workers automatically evict previous runtime caches upon detecting new `BUILD_ID` or fallback headers.

---

## 2. Automated & Manual Rollback Triggers

Any of the following conditions triggers an immediate rollback review and automated/manual execution:

| Trigger ID | Metric / Condition | Threshold | Evaluation Window |
|---|---|---|---|
| **TRG-01** | API P95 Latency | $> 500\text{ms}$ | 5 consecutive minutes |
| **TRG-02** | HTTP 5xx Server Error Rate | $> 1.0\%$ of requests | 3 consecutive minutes |
| **TRG-03** | Multi-Tenant Data Leakage | $> 0$ unauthorized cross-workspace records observed | Immediate / Instant |
| **TRG-04** | Client PWA Boot Failure | $> 2.0\%$ unhandled boot exceptions in telemetry | 10 minutes |
| **TRG-05** | Database Connection Exhaustion | Pool active connections $> 95\%$ of capacity | 3 minutes |
| **TRG-06** | Critical Security Vulnerability | Zero-day remote code execution or auth bypass | Immediate / Instant |

---

## 3. Rollback Execution Protocols

### Protocol A: Instant Web Frontend Reversion (PaaS / Edge CDN)
*Estimated Time to Restore (RTO): $< 60$ seconds.*

When using a managed edge platform (e.g., Vercel / Cloudflare Pages / Railway):
1. **Identify Previous Stable Deployment:**
   - Predecessor candidate: `2.0.0-rc3` (artifact: `artifacts/release/daynori-web-v2.0.0-rc3.tar.gz`, commit `e71842f`).
   - Secondary baseline: `2.0.0-rc2` (artifact: `artifacts/release/daynori-web-v2.0.0-rc2.tar.gz`, commit `5073928`).
2. **Execute Deployment Re-point:**
   - **Vercel CLI / UI:** 
     ```bash
     vercel rollback [PREVIOUS_DEPLOYMENT_URL] --token $VERCEL_TOKEN
     ```
   - **Container / Docker Compose:**
     ```bash
     docker service update --image daynori-web:2.0.0-rc3 daynori_web
     ```
3. **Purge Edge Cache:**
   - Issue Cloudflare cache purge for `https://app.daynori.com/*` (preserving static chunks hashed by content).
4. **Verify Health:**
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://app.daynori.com/api/health
   # Expected: 200
   ```

---

### Protocol B: Emergency Maintenance Cutover (Edge Static Fallback)
*Estimated Time to Restore (RTO): $< 10$ seconds.*

If both primary and secondary application versions experience unrecoverable upstream failures (e.g., cloud region outage or database failure):
1. **Activate Cloudflare Maintenance Page Worker:**
   - Route traffic to the standalone immutable offline shell [`apps/web/public/offline-shell.html`](file:///d:/SWE/UNIQUE%20WORK/dailyLIfe/apps/web/public/offline-shell.html) (SHA-256: `1b0bf5f65c8d7330d0560fe41acc73a6a9806e9b7aff5cb60daacfc0fbd009cc`).
   - The offline shell informs users that Daynori is temporarily performing scheduled maintenance, keeps local indexedDB offline drafts safe, and instructs the browser not to purge local storage.
2. **HTTP Headers Enforced:**
   - `HTTP/2 503 Service Unavailable`
   - `Retry-After: 300` (5 minutes)
   - `Cache-Control: no-cache, no-store, must-revalidate`

---

### Protocol C: API Service Rollback
*Estimated Time to Restore (RTO): $< 2$ minutes.*

1. **Revert API Container / Process:**
   ```bash
   # On Railway / Container Host:
   railway up --service api --tag v2.0.0-rc3
   # Or manual systemd process restart with previous bundle:
   cd /app/api
   tar -xzf /deployments/daynori-api-v2.0.0-rc3.tar.gz
   pnpm install --prod
   systemctl restart daynori-api
   ```
2. **Verify API Versioned Health:**
   ```bash
   curl -f http://localhost:3001/v1/health
   # Expected: {"status":"ok"}
   ```

---

## 4. Post-Rollback Verification Checklist

Immediately following rollback execution, the on-call engineer must execute these verification checks:
- [ ] **Public Health:** `GET https://app.daynori.com/api/health` returns `HTTP 200`.
- [ ] **API Health:** `GET https://api.daynori.com/health` returns `HTTP 200`.
- [ ] **CSP Level 3 Header:** Verify response includes `Content-Security-Policy` with fresh cryptographic nonce.
- [ ] **Synthetic Note Creation:** Log in with synthetic test account (`test-probe@daynori.internal`) and verify creating, saving, and soft-deleting a note succeeds.
- [ ] **Multi-Tenant Scoping:** Verify database queries remain strictly scoped to authenticated workspace.
- [ ] **Fail-Closed Verification:** Verify unreleased modules (Vault, Rooms, AI, Voice, Billing, Drive) return HTTP 403 or remain disabled in UI.

---

## 5. Incident Communication & Owner Notification

1. Update status page at `https://status.daynori.com` to `Degraded Performance` or `Maintenance`.
2. Post notification in incident channel with:
   - Root cause hypothesis
   - Executed rollback protocol (A, B, or C)
   - Current user impact
   - Build SHAs reverted from and to (`rc4 -> rc3`)
3. Convene post-mortem within 24 hours to document root cause and test prevention.
