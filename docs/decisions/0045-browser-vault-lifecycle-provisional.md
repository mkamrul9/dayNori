# ADR 0045 — Browser vault lifecycle (provisional harness)

## Status

Accepted for provisional local development. Production web vault enablement remains blocked.

## Context

Phase 47 requires browser unlock/lifecycle surfaces while Phases 44–45 and independent review remain incomplete. Owner selected Phase 47 for bounded local development only.

## Decision

1. Reuse framework-neutral `@daynori/domain` vault session controller and provider contracts. Do not import `apps/mobile` into `apps/web`.
2. Production providers report `unavailable` until prerequisites pass; never auto-substitute synthetic providers.
3. Expose an explicitly labeled development harness at `/dev/vault-harness` (`NODE_ENV === 'development'` only). Production `/vault` remains a disabled status page.
4. Coordinate lock/session-invalidation across tabs via `BroadcastChannel` messages that never include keys, passphrases, recovery secrets, or plaintext. Unlocking one tab must not unlock another.
5. Keep unlocked keys/plaintext out of persistent browser storage, service-worker caches, outbox payloads, URLs, and diagnostics.
6. Apply CSP via `apps/web/src/middleware.ts` with per-request nonces and `strict-dynamic` (Next.js 15 App Router guidance). Production `script-src` omits `unsafe-inline`/`unsafe-eval`. Development may add `unsafe-eval` for HMR. Residual `style-src 'unsafe-inline'` remains for React inline styles. Permissions-Policy allows `microphone=(self)` for ordinary audio recording and denies microphone on vault routes.

## Consequences

- Local browser journeys can be exercised against synthetic fixtures.
- Canonical Phase 47 acceptance (cross-platform enrollment, independent review, no unresolved high/critical findings) remains incomplete.
- Browser memory cleanup is best-effort; compromised-client limits must stay disclosed.

## Related

- ADR 0043 (cryptography and recovery proof)
- ADR 0044 (Android unlock lifecycle provisional)
- `docs/architecture/security-and-vault.md`
- `docs/engineering/release-gates.md`
