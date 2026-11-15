# ADR 0124: Daynori Proxy Trust, Rate Limiter Ingress Hardening, and Spoofing Defense Verification

- **Status:** Accepted
- **Date:** 2026-11-15
- **Deciders:** Project Owner, Security & Privacy Officer, Infrastructure & Platform Lead
- **Consulted:** QA Automation Lead, Core Contributors
- **Informed:** Platform Engineering Team

---

## 1. Context and Problem Statement

Following the security review in Phase 120 and load profiling in Phase 121, an in-depth audit of ingress proxy trust and rate limiting was mandated under AGENTS.md. Specifically, the audit examined:
1. Fastify's `trustProxy` configuration in `apps/api/src/server.ts`.
2. IP extraction logic in `ProcessLocalRateLimiter` (`apps/api/src/plugins/rateLimiter.ts`).
3. Actual header mutation behavior of production/staging ingress infrastructure (Cloudflare Edge and Render internal reverse proxies).

### Vulnerabilities Identified in Prior Configuration
1. **Wildcard Proxy Trust (`trustProxy: true`):**
   Fastify was configured with `trustProxy: true`, which blindly trusts any upstream proxy and honors client-supplied forwarding headers regardless of socket peer origin.
2. **Leftmost IP Trust in `X-Forwarded-For`:**
   `ProcessLocalRateLimiter` previously split `X-Forwarded-For` by comma and selected the first element (`xff.split(',')[0]`). Because reverse proxies *append* client IPs to the end of the chain, any untrusted external client could prepend arbitrary fake IPs to `X-Forwarded-For` and completely bypass rate limiting by rotating fake leftmost IPs.
3. **Unvalidated `CF-Connecting-IP` Trust:**
   `ProcessLocalRateLimiter` previously prioritized `req.headers['cf-connecting-ip']` whenever present. If an attacker connects to an origin server directly (bypassing Cloudflare, e.g. via direct Render origin domain or internal network), Render does not strip `CF-Connecting-IP`, allowing attackers to spoof their identity and bypass throttling.
4. **Uniform Rate Limit Across Routes:**
   A single 60 requests/minute limit was applied across all routes. For sensitive endpoints (authentication, login, password recovery, and account deletion), 60 req/min was overly permissive and vulnerable to brute-force attacks, especially in multi-instance horizontal deployments.

---

## 2. Empirical Ingress Header Proofs (Staging Verification)

To prove header mutation behavior on real infrastructure rather than relying on assumptions, empirical HTTP probes were dispatched to the authorized staging API (`https://daynori-api-preview.onrender.com`):

### Probe 1: External `CF-Connecting-IP` Injection
- **Command:** `fetch('https://daynori-api-preview.onrender.com/v1/health', { headers: { 'CF-Connecting-IP': '198.51.100.42' } })`
- **Result:** `HTTP 403 Forbidden` (`server: cloudflare`, `cf-ray: ...`).
- **Proof:** Cloudflare's Edge firewall actively blocks public clients attempting to forge `CF-Connecting-IP`.
- **Limitation:** This protection exists *only* when traffic flows through Cloudflare. If an attacker bypasses Cloudflare and calls Render directly, Render does not drop or overwrite `CF-Connecting-IP`.

### Probe 2: External `X-Forwarded-For` Injection
- **Command:** `fetch('https://daynori-api-preview.onrender.com/v1/health', { headers: { 'X-Forwarded-For': '203.0.113.199, 198.51.100.55' } })`
- **Result:** `HTTP 200 OK`.
- **Proof:** Reverse proxies (Cloudflare and Render) append the connecting IP to `X-Forwarded-For` rather than replacing the header. Client-supplied headers appear on the left.

---

## 3. Decision & Technical Architecture

### 3.1 Strict CIDR-Based Trusted Proxy Configuration
We created `apps/api/src/config/trustedProxies.ts` defining:
- `CLOUDFLARE_IPV4_CIDRS` and `CLOUDFLARE_IPV6_CIDRS`: The complete official Cloudflare edge IP subnets (e.g. `173.245.48.0/20`, `103.21.244.0/22`, `104.16.0.0/13`, `172.64.0.0/13`, `2606:4700::/32`, etc.).
- `PRIVATE_PROXY_CIDRS`: RFC 1918 private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), RFC 6598 Carrier-Grade NAT (`100.64.0.0/10` used by Render internal load balancers), and loopback (`127.0.0.1`, `::1`).
- `TRUSTED_PROXY_CIDRS`: The combined whitelist passed to Fastify's `trustProxy`.

### 3.2 Right-to-Left Traversal Invariant for Client IP Resolution
Implemented `resolveClientIp(request: FastifyRequest)` with the following strict invariants:
1. **Direct Untrusted Peer Rule:**
   If the direct socket peer (`request.raw.socket.remoteAddress`) is NOT in `TRUSTED_PROXY_CIDRS`, it is a public client connecting directly. All forwarding headers (`CF-Connecting-IP`, `X-Forwarded-For`) are completely ignored, and the socket IP is returned.
2. **Right-to-Left `X-Forwarded-For` Walk:**
   When traversing `X-Forwarded-For`, the array of hops is inspected from right to left (from most trusted proxy to caller). The first IP encountered that is NOT a trusted proxy is identified as the genuine client IP (`xffResolvedIp`). All IPs to the left of this entry are untrusted client input and discarded.
3. **Cloudflare Verification for `CF-Connecting-IP`:**
   `CF-Connecting-IP` is honored ONLY if a verified Cloudflare edge IP (`isCloudflareIp`) is confirmed in the upstream chain (either as the socket peer or in the verified proxy hops). If no Cloudflare hop is present, `CF-Connecting-IP` is discarded as potentially forged.

### 3.3 Sensitive Route Brute-Force Hardening
In `apps/api/src/plugins/rateLimiter.ts`:
- Added `sensitiveMaxRequests` (default 10 requests per minute).
- Sensitive routes matching `/^\/v1\/auth\/(login|recovery|reset|register|signup)/i`, `/^\/v1\/deletion\/request/i`, and `/^\/v1\/operator\/auth/i` enforce 10 req/min per resolved client IP.
- Responses return `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`. Throttled requests return HTTP 429 with `Retry-After`.
- Health check routes (`/health`, `/v1/health`, `/api/health`) are explicitly exempted to prevent uptime monitor flapping.

### 3.4 Multi-Instance Behavior and Architectural Boundaries
- `ProcessLocalRateLimiter` uses in-memory Node.js process heap memory (`Map<string, WindowBucket>`).
- **Cluster Multiplier:** In a deployment with $N$ horizontal instances behind a round-robin load balancer, a client can execute up to $N \times \text{limit}$ requests per window.
- **Security Assessment:** With `sensitiveMaxRequests = 10`, an attacker distributing requests across 2-3 instances is capped at 20-30 attempts per minute, successfully neutralizing high-velocity credential stuffing or password reset flooding.
- **Scale Roadmap:** For clusters $> 3$ instances or traffic $> 1,000$ MAU, distributed rate limiting via Redis (token bucket Lua script) or Cloudflare Edge Rate Limiting rules must be deployed.

---

## 4. Verification & Evidence

Automated test suites verify all invariants:
1. `tests/security/phase124-proxy-trust-and-rate-limiter.test.ts`:
   - CIDR matching for Cloudflare IPv4/IPv6 and Render CGNAT.
   - Forged `CF-Connecting-IP` and `X-Forwarded-For` rejected on direct connection.
   - Forged `CF-Connecting-IP` rejected through Render without Cloudflare hop.
   - Leftmost fake IPs in `X-Forwarded-For` ignored via right-to-left traversal.
   - Throttling cannot be bypassed by rotating forged headers.
   - Sensitive routes strictly enforced at 10 req/min.
   - Health probes exempted.
   - Multi-instance independent bucket behavior simulated and proven.
2. `tests/security/phase120-production-security-review.test.ts`: All 14 security and privacy tests passing.
3. `tests/performance/phase121-capacity-and-load.test.ts`: All 12 load and capacity tests passing.

---

## 5. Artifacts and References

- Findings Artifact: `artifacts/phase124/security-findings.json`
- Phase Report: `docs/phase-reports/phase-124.md`
- Source Implementation: `apps/api/src/config/trustedProxies.ts`, `apps/api/src/plugins/rateLimiter.ts`, `apps/api/src/server.ts`
- Automated Test: `tests/security/phase124-proxy-trust-and-rate-limiter.test.ts`
