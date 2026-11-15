# Phase 124 — Daynori proxy trust, rate limiter ingress hardening, and spoofing defense verification

Group: V2 quality and release. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [102 — Authorized Version 2 publication and live verification](102-authorized-version-2-publication-and-live-verification.md)
- [112 — Daynori core web/PWA browser release verification and staging isolation audit](112-daynori-core-web-pwa-browser-release-verification-and-staging-isolation-audit.md)
- [118 — Daynori deployable web-core release preparation and production infrastructure capacity plan](118-daynori-deployable-web-core-release-preparation-and-production-infrastructure-capacity-plan.md)
- [119 — Daynori authorized HTTPS staging deployment verification and browser journey audit](119-daynori-authorized-https-staging-deployment-verification-and-browser-journey-audit.md)
- [120 — Daynori production-focused security and privacy review and vulnerability remediation of the enabled web core](120-daynori-production-focused-security-and-privacy-review-and-vulnerability-remediation-of-the-enabled-web-core.md)
- [121 — Daynori production-scale load testing, performance profiling, and capacity envelope verification for 1,000 to 10,000 users](121-daynori-production-scale-load-testing-performance-profiling-and-capacity-envelope-verification-for-1-000-to-10-000-users.md)
- [122 — Daynori production release-candidate launch package, owner authorization reconciliation, and staged rollout governance](122-daynori-production-release-candidate-launch-package-owner-authorization-reconciliation-and-staged-rollout-governance.md)
- [123 — Daynori release-evidence audit, claims reclassification, candidate inventory, and preflight reconciliation](123-daynori-release-evidence-audit-claims-reclassification-candidate-inventory-and-preflight-reconciliation.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/api/src/config
- apps/api/src/plugins
- apps/api/src/server.ts
- artifacts/phase124
- docs/decisions
- docs/phase-reports
- tests/security
- CHANGELOG.md

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Audit Fastify trustProxy configuration and ProcessLocalRateLimiter against Render/Cloudflare ingress architecture.
2. Perform empirical ingress header probes on staging demonstrating Cloudflare edge 403 on client-forged CF-Connecting-IP, proxy append behavior on X-Forwarded-For, and direct origin bypass risks.
3. Implement trusted proxy CIDR whitelist in apps/api/src/config/trustedProxies.ts covering Cloudflare IPv4/IPv6, RFC 1918 private subnets, and Render Carrier-Grade NAT (100.64.0.0/10).
4. Harden resolveClientIp to enforce right-to-left traversal of X-Forwarded-For and verify Cloudflare peer authenticity before honoring CF-Connecting-IP.
5. Add sensitive route brute-force protection (10 req/min) in ProcessLocalRateLimiter for authentication, password recovery, and account deletion endpoints while exempting health checks.
6. Author comprehensive security test suite in tests/security/phase124-proxy-trust-and-rate-limiter.test.ts verifying spoofing resistance, multi-instance simulation, and brute-force defenses.
7. Author ADR 0124, phase report docs/phase-reports/phase-124.md, findings artifact artifacts/phase124/security-findings.json, and reconcile release documentation.

## Acceptance

- Untrusted clients cannot bypass unauthenticated rate limiting by rotating forged CF-Connecting-IP or leftmost X-Forwarded-For headers.
- Empirical ingress probes prove proxy header overwrite and append behavior on live staging infrastructure.
- Fastify trustProxy is restricted to strict trusted proxy CIDRs instead of wildcard true.
- Sensitive routes enforce 10 req/min rate limit with standards-compliant Retry-After headers on HTTP 429.
- Multi-instance cluster rate-limit behavior and limitations are simulated and documented.
- All automated tests in tests/security/phase124-proxy-trust-and-rate-limiter.test.ts pass cleanly.
- docs/roadmap/plan.json, progress.json, and blueprint.html pass all planning validators.

## Verification and evidence

- pnpm vitest run tests/security/phase124-proxy-trust-and-rate-limiter.test.ts
- pnpm --filter @daynori/api typecheck
- pnpm --filter @daynori/api build
- node scripts/validate-planning.mjs
- pnpm validate:function-register

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/roadmap/v2/README.md](../v2/README.md)
- [docs/roadmap/v2/feature-coverage.md](../v2/feature-coverage.md)
- [docs/engineering/handoff.md](../../engineering/handoff.md)
- [docs/decisions/0074-standing-phase71-scheduling-and-push.md](../../decisions/0074-standing-phase71-scheduling-and-push.md)
- [docs/decisions/0120-production-security-privacy-review-and-remediation.md](../../decisions/0120-production-security-privacy-review-and-remediation.md)
- [docs/decisions/0121-production-scale-load-testing-and-capacity-envelope.md](../../decisions/0121-production-scale-load-testing-and-capacity-envelope.md)
- [docs/decisions/0123-release-evidence-audit-claims-reclassification-and-preflight.md](../../decisions/0123-release-evidence-audit-claims-reclassification-and-preflight.md)
- [docs/decisions/0124-proxy-trust-rate-limiter-hardening-and-spoofing-defense.md](../../decisions/0124-proxy-trust-rate-limiter-hardening-and-spoofing-defense.md)
- [docs/phase-reports/phase-120.md](../../phase-reports/phase-120.md)
- [docs/phase-reports/phase-121.md](../../phase-reports/phase-121.md)
- [docs/phase-reports/phase-123.md](../../phase-reports/phase-123.md)
- [docs/phase-reports/phase-124.md](../../phase-reports/phase-124.md)

## Commit target

`fix(security): harden proxy trust and rate limiter against header spoofing`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
