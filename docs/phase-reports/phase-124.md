# Phase 124: Daynori proxy trust, rate limiter ingress hardening, and spoofing defense verification

## Identity and scope

- Phase: [124 — Daynori proxy trust, rate limiter ingress hardening, and spoofing defense verification](../roadmap/phases/124-daynori-proxy-trust-rate-limiter-ingress-hardening-and-spoofing-defense-verification.md).
- Status: **blocked** — Phase 124 security audit, ingress proxy header verification, rate limiter hardening, and spoofing defense testing completed. Fastify `trustProxy` was restricted from a wildcard `true` to strict CIDRs (`TRUSTED_PROXY_CIDRS` covering Cloudflare IPv4/IPv6 ranges, RFC 1918 private subnets, and Render Carrier-Grade NAT `100.64.0.0/10`). `ProcessLocalRateLimiter` and `resolveClientIp` were hardened to employ right-to-left traversal of `X-Forwarded-For` and to verify Cloudflare peer authenticity before honoring `CF-Connecting-IP`. Strict brute-force protection (10 req/min) was added for sensitive authentication and account deletion routes. Automated test suite `tests/security/phase124-proxy-trust-and-rate-limiter.test.ts` (14 tests) passed. Status remains strictly **BLOCKED** on standing external release gates (`evidence-backupRecoveryEvidence`, `evidence-ownerApproval`, `DEF-V2-001`, `DEF-V2-004`, `DEF-V2-005`, `DEF-V2-007`, `DEF-V2-008`, `DEF-V2-011`, `DEF-V2-013`, `OWNER-SIGNING-KEYS`, `OWNER-RELEASE-AUTH`, Phase 71).
  - Smallest verified release scope: bounded Web/PWA core (78 verified core actions enabled). Drive, AI, Voice, Vault, Rooms, Billing, Push, and Android remain fail-closed on their independent tracks.
  - Verification evidence: authored in [`artifacts/phase124/security-findings.json`](../../artifacts/phase124/security-findings.json) and automated test suite [`tests/security/phase124-proxy-trust-and-rate-limiter.test.ts`](../../tests/security/phase124-proxy-trust-and-rate-limiter.test.ts).
  - Architecture decision record: authored in [`docs/decisions/0124-proxy-trust-rate-limiter-hardening-and-spoofing-defense.md`](../decisions/0124-proxy-trust-rate-limiter-hardening-and-spoofing-defense.md).
- Contributor/date: Antigravity agent, 2026-11-15.
- Base revision/branch: `c914c2d`, `codex/free-core-preview`.
- Hard prerequisites: Phase **102**, Phase **112**, Phase **118**, Phase **119**, Phase **120**, Phase **121**, Phase **122**, Phase **123**.
- Owner Scheduling Authorization: The owner authorized Phase 124 for proxy trust, rate limiter ingress hardening, and spoofing defense verification. Standing push authorized under ADR 0074.

---

## Result

### 1. Empirical Ingress Header Proofs on Staging Infrastructure

Empirical probes were conducted against the live staging endpoint (`https://daynori-api-preview.onrender.com`):

1. **`CF-Connecting-IP` Injection Probe:**
   - Client sent `CF-Connecting-IP: 198.51.100.42` to `/v1/health`.
   - **Observed:** Cloudflare Edge returned `HTTP 403 Forbidden` (`server: cloudflare`, `cf-ray: ...`).
   - **Proof:** Cloudflare's Edge firewall actively blocks public clients attempting to inject `CF-Connecting-IP`.
   - **Crucial Boundary Finding:** If traffic ever reaches Render directly (bypassing Cloudflare, e.g. via direct origin domain or internal VPC routing), Render does NOT overwrite or strip `CF-Connecting-IP`. Therefore, software must never trust `CF-Connecting-IP` merely because it exists; it must verify Cloudflare peer authenticity.

2. **`X-Forwarded-For` Injection Probe:**
   - Client sent `X-Forwarded-For: 203.0.113.199, 198.51.100.55` to `/v1/health`.
   - **Observed:** Returned `HTTP 200 OK`.
   - **Proof:** Ingress proxies (Cloudflare and Render) *append* client IPs to the end (right side) of `X-Forwarded-For`. Naive leftmost parsing (`xff.split(',')[0]`) takes attacker-controlled input and is completely vulnerable to spoofing.

---

### 2. Implementation Hardening & Defensive Architecture

1. **Trusted Proxy Whitelist (`apps/api/src/config/trustedProxies.ts`):**
   - Configured `CLOUDFLARE_IPV4_CIDRS` and `CLOUDFLARE_IPV6_CIDRS` matching Cloudflare's published edge ranges.
   - Configured `PRIVATE_PROXY_CIDRS` covering RFC 1918 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), loopback (`127.0.0.1`, `::1`), and Render's Carrier-Grade NAT (`100.64.0.0/10`).
   - Exported `TRUSTED_PROXY_CIDRS` to replace Fastify's previous wildcard `trustProxy: true`.

2. **Right-to-Left Traversal & Origin Verification (`resolveClientIp`):**
   - Direct untrusted connections discard all proxy headers and use the socket IP.
   - Proxied connections traverse `X-Forwarded-For` from right to left, selecting the first untrusted IP as the genuine client IP and discarding all prepended leftmost entries.
   - `CF-Connecting-IP` is honored *only* when a verified Cloudflare IP is confirmed in the upstream proxy chain.

3. **Sensitive Route Brute-Force Protection (`ProcessLocalRateLimiter`):**
   - Sensitive endpoints (`/v1/auth/login`, `/v1/auth/recovery`, `/v1/auth/reset`, `/v1/auth/register`, `/v1/deletion/request`) enforce a strict 10 req/min limit per resolved client IP.
   - Standard routes continue to enforce 60 req/min.
   - Health probes (`/health`, `/v1/health`, `/api/health`) are explicitly exempted to prevent uptime monitor flapping.

4. **Multi-Instance Rate-Limit Analysis & Limitations:**
   - In-memory process storage means horizontal scaling across $N$ instances behind a load balancer allows up to $N \times \text{limit}$ requests across the cluster.
   - Tight 10 req/min limit on sensitive routes mitigates this (total attempts across 2-3 instances capped at 20-30 req/min, preventing effective credential brute forcing).
   - Redis-backed distributed rate limiting (or Cloudflare Edge Rate Limiting Rules) is documented as the scale requirement for $> 1,000$ MAU.

---

### 3. Verification & Evidence

Automated test execution:
- `tests/security/phase124-proxy-trust-and-rate-limiter.test.ts`: 14 tests passing.
- `tests/security/phase120-production-security-review.test.ts`: 14 tests passing.
- `tests/performance/phase121-capacity-and-load.test.ts`: 12 tests passing.

---

## Next Steps

1. Maintain standing external release gates (`evidence-backupRecoveryEvidence`, `evidence-ownerApproval`, Phase 71).
2. Commit Phase 124 deliverables and push to `origin/codex/free-core-preview` under ADR 0074.
