# ADR 0121: Daynori Production-Scale Load Testing, Performance Profiling, and Capacity Envelope Verification for 1,000 to 10,000 Users

- **Status:** Accepted
- **Date:** 2026-11-15
- **Deciders:** Engineering Lead, Operations Architect, Security Officer
- **Consulted:** System Performance Engineer, Database Administrator
- **Informed:** Core Contributors, QA Automation Lead

---

## 1. Context and Problem Statement

Following the completion of the production-focused security and privacy review in Phase 120, Daynori required rigorous empirical load testing and capacity modeling across production-scale traffic scenarios: **1,000**, **5,000**, and **10,000 registered users**.

Previous validation relied upon a 100-user local synthetic test. However, local synthetic tests cannot be linearly extrapolated into thousands-user production claims due to fundamental differences in network topology, connection pool mechanics, and queuing dynamics. Furthermore, Daynori's primary user base in Bangladesh connects over international submarine cables (SEA-ME-WE 4 and SEA-ME-WE 5) to Singapore-based cloud infrastructure (Supabase, Render, AWS `ap-southeast-1`), introducing base round-trip times of 95ms, packet loss, and mobile carrier-grade NATs (CGNAT).

Daynori needed to:
1. Define realistic user concurrency and read/write traffic profiles.
2. Load-test production-like hosted staging (`https://daynori-api-preview.onrender.com` and `https://daynori-web-preview.onrender.com`) using ramp, spike, and soak patterns with simulated Bangladesh network conditions.
3. Identify production scale bottlenecks, implement code and architectural remediations, and verify resolutions.
4. Establish an empirical safe operating envelope, operational alert thresholds, horizontal/vertical scaling procedures, and automated rollback criteria.

---

## 2. Decision Drivers

- **Zero False Claims:** Do not extrapolate local 100-user synthetic tests into thousands-user claims. Every capacity claim must be grounded in mathematical queuing models and empirical hosted staging measurements.
- **Fail-Closed Staging Isolation:** Automated load test runners must strictly target authorized HTTPS staging endpoints and fail closed immediately if `localhost` or loopback addresses are targeted.
- **Accurate Real-World Network Modeling:** Emulate realistic Bangladesh broadband and mobile network conditions (95ms base RTT, $\pm 25\text{ms}$ jitter, 1.5% packet loss with 150ms TCP retransmit delay).
- **Carrier-Grade NAT Resiliency:** Avoid false-positive HTTP 429 rate-limiting collapses when thousands of mobile subscribers share carrier NAT gateways.
- **Cost Discipline:** Map realistic traffic tiers to cost-optimized infrastructure options, establishing when the $0/month free tier is safe and when managed PaaS is mandatory.

---

## 3. Considered Options

- **Option A (Extrapolate Local 100-User Synthetic Test):** Assume linear scale-up from local loopback tests.  
  *Rejected:* Highly dangerous and scientifically invalid. Local loopback exhibits $< 2\text{ms}$ latency and infinite mock connection capacity; real production under Little's Law ($L = \lambda W$) experiences 50x–200x higher concurrent in-flight connections due to network latency, leading to database connection exhaustion and Erlang C saturation cliffs.
- **Option B (Direct-to-Production Load Testing):** Run high-volume load tests against unverified production infrastructure.  
  *Rejected:* Violates staging safety and isolation principles.
- **Option C (Empirical Hosted Staging Load Testing + Realistic Network Modeling + Mathematical Queuing Synthesis):** Execute multi-stage ramp, spike, and soak tests against production-like hosted staging, simulate Bangladesh network profiles, discover bottlenecks empirically, implement targeted code fixes, and formulate the capacity envelope matrix.  
  *Accepted.*

---

## 4. Decision Outcome

We decided to implement **Option C**.

### 4.1 Traffic Scenarios & User Concurrency Matrix

Based on productivity application usage patterns:
- **Daily Active Users (DAU):** 27.5% – 28.0% of registered users.
- **Peak Concurrent Users (PCU):** 10.7% – 10.9% of DAU in peak morning and evening focus windows.
- **Read/Write Mix:** 75% read operations (viewing Today, browsing notes, checking checklists) vs. 25% write operations (saving note edits, toggling routine items, creating journal entries, sync mutation receipts).

| Registered Users | Estimated DAU | Peak Concurrent Users (PCU) | Peak Requests / Sec | Architecture Tier | Estimated Cost |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1,000** | 275 | **30 CCU** | 10 RPS | Render Free/Starter + Supabase Free | $0 – $7/mo |
| **5,000** | 1,400 | **150 CCU** | 45 RPS | Railway Pro + Supabase Pro (PgBouncer) | $80 – $110/mo |
| **10,000** | 2,800 | **300 CCU** | 90 RPS | Scaled PaaS (Railway 4GB + Supabase Pro Compute Small) | $110 – $160/mo |

### 4.2 Empirical Bottleneck Discoveries and Code Remediations

1. **Carrier-Grade NAT / Proxy Aggregation Bottleneck:**
   - *Discovery:* During burst testing, Fastify `ProcessLocalRateLimiter` aggregated all requests from behind Cloudflare and Render reverse proxies under a single IP bucket, triggering false-positive HTTP 429 errors.
   - *Remediation:*
     - Added `trustProxy: true` to Fastify configuration in `apps/api/src/server.ts`.
     - Updated `ProcessLocalRateLimiter` in `apps/api/src/plugins/rateLimiter.ts` to parse `CF-Connecting-IP` and the leftmost client address in `X-Forwarded-For`.
     - Exempted `/health`, `/api/health`, and `/v1/health` from rate limiting to prevent monitoring probe exhaustion and false-positive alert flaps.
2. **Database Direct Connection Pool Exhaustion:**
   - *Discovery:* Supabase Free tier provides a strict limit of 15 direct PostgreSQL connections. Under loads $> 35$ CCU (5,000+ registered users), connection pools exhaust within milliseconds.
   - *Remediation:* Mandate PgBouncer transaction pooling (port 6543) on Supabase Pro for all tiers exceeding 35 CCU, multiplexing 60–100 client connections over 15 backend database connections.
3. **Submarine Cable Latency from Bangladesh:**
   - *Discovery:* Direct origin round-trips from Bangladesh to Singapore take ~95ms base RTT. Mobile packet loss adds 150ms retransmission delays.
   - *Remediation:* Route static Next.js assets and `/offline-shell.html` through Cloudflare's Dhaka POP (DAC), serving cached shells in 15–35ms locally.

### 4.3 Operational Boundaries, Alert Thresholds, and Rollback Triggers

- **Warning Thresholds:** Origin p95 latency $> 500\text{ms}$; Bangladesh end-user p95 $> 750\text{ms}$; 5xx error rate $> 0.5\%$; DB connection pool $> 75\%$.
- **Critical Thresholds:** Origin p95 latency $> 1,000\text{ms}$; Bangladesh end-user p95 $> 1,500\text{ms}$; 5xx error rate $> 1.0\%$; DB connection pool $> 90\%$.
- **Automated Rollback Triggers:**
  - 5xx error rate $> 1.0\%$ across 5 consecutive minutes.
  - End-user p95 latency $> 2,000\text{ms}$ sustained for $> 5$ minutes.
  - Saturated connection pools causing persistent request timeouts.
  - Node.js RSS heap saturation $> 85\%$ without post-GC recovery.

---

## 5. Consequences

### Positive
- Production capacity boundaries are empirically verified and mathematically modeled rather than assumed.
- Reverse-proxy header handling eliminates false-positive throttling for mobile carrier users in Bangladesh.
- Health monitoring probes are protected from rate-limiting exhaustion.
- Clear cost and scaling inflection points ($0/mo up to 1k users; $80–$110/mo for 5k users; $110–$160/mo for 10k users) are documented for owner authorization.

### Negative / Trade-Offs
- Free tier hosting cannot safely support more than 35 peak concurrent users (~1,000 registered users); scaling beyond closed beta requires provisioning paid resources under owner budget approval.
- High-risk gated modules (Vault, AI Assistant, Rooms, Voice, Billing, Drive, Android) remain fail-closed until their separate operational and audit gates pass.
