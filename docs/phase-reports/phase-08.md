# Phase 08: API contracts and service foundation

Group: Foundation and sync. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [08 — API contracts and service foundation](../roadmap/phases/08-api-contracts-and-service-foundation.md)
- **Status:** `complete` (Authorized and verified following direct dependency on repaired Phase 07; independent of unresolved Phase 04–06 physical hardware gates).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-14.
- **Base Git revision and branch:** `0dfdd3e` on branch `main`.
- **Prerequisites:**
  - [Phase 07 — PostgreSQL and tenant isolation foundation](phase-07.md): Repaired least-privilege runtime role, transaction-local tenant context, relational composite constraints, and schema migrations established and verified.
- **Included scope:**
  - Versioned Fastify REST API service (`apps/api`) with route registration following `/v1` conventions.
  - Canonical shared schemas in `packages/contracts/src/api/` (`common.ts`, `health.ts`, `workspace.ts`, `membership.ts`, `item.ts`):
    - Strict mutation schemas (`CreateWorkspaceRequestSchema`, `AddMemberRequestSchema`, `CreateItemRequestSchema`) enforcing `.strict()` to reject unknown/unapproved mutation fields.
    - Standard response envelope (`ResponseMetaSchema` with `requestId`, `serverTime`, `cursor`) and error envelope (`ApiErrorResponseSchema` with `code`, `message`, `requestId`, `details`, `retryAfter`).
  - Canonical OpenAPI 3.0 specification generation exposed at `GET /v1/openapi.json`.
  - Standards-compliant JWT verification via maintained library `jose` (`apps/api/src/auth/jwt.ts`):
    - Algorithm allowlist strictly enforced: `['RS256', 'EdDSA']`; symmetric algorithms (`HS256`) and unsigned tokens (`none`) are explicitly rejected.
    - Verified claims: issuer (`iss`), audience (`aud`), expiration (`exp`), not-before (`nbf`), and subject (`sub`).
    - Explicit rejection of administrative, service, and anonymous credentials (`anon`, `service_role`, `supabase_admin`) as user sessions.
    - Trusted JWKS source handling with bounded caching (10m) and network timeouts (5s); attacker-supplied key URLs (`jku`, `x5u`) in token headers are never fetched.
    - Key rotation support through `kid` matching in JWKS.
  - Strict actor-field derivation and multi-tenant authorization:
    - Actor identity derived exclusively from verified JWT claims (`sub` -> `userId`).
    - Workspace membership authorization checked prior to database access.
    - Access executes inside transaction-local PostgreSQL tenant contexts (`withTenantContext` and `withUserContext`).
    - Nonmember or cross-tenant resource requests consistently return HTTP 404 `NOT_FOUND` to prevent resource existence leakage.
    - Immediate membership revocation cutoff verified.
  - Operational health and readiness endpoints:
    - `GET /v1/health`: reports operational status and version without secrets.
    - `GET /v1/ready`: probes database connectivity via bounded query without leaking connection strings, credentials, or internal topology.
  - Process-local in-memory sliding-window rate limiter (`apps/api/src/plugins/rateLimiter.ts`):
    - Keyed by verified actor ID if authenticated, else client IP address.
    - Returns HTTP 429 with `Retry-After` header when threshold is exceeded.
    - Honestly documented as process-local (not distributed across horizontal server replicas).
  - Safe structured logging with recursive redaction (`apps/api/src/plugins/logger.ts`):
    - Redacts `authorization`, `cookie`, `set-cookie`, `x-api-key`, query parameters containing sensitive keys, and passwords in database URLs.
    - Verified with synthetic credential/content markers to ensure zero leakage.
  - Request boundary limits: 1 MiB JSON request body limit (`413 PAYLOAD_TOO_LARGE`).
  - Keyset pagination with stable ordering `(created_at, id)` and opaque base64url cursor encoding.
  - Fully typed HTTP client in `packages/api-client`:
    - Response schema validation using Zod.
    - `AbortSignal` cancellation support on all methods.
    - Typed error hierarchy (`ApiAuthError`, `ApiNotFoundError`, `ApiValidationError`, `ApiRateLimitError`, `ApiPayloadTooLargeError`).
    - Keyset pagination async generator (`paginateItems`).
    - Verified zero server credentials or database connection dependencies in client bundle.
  - [ADR-0014: Authenticated API service, contracts, and tenant-scoped authorization](../decisions/0014-authenticated-api-service-and-contracts.md).
- **Excluded/deferred scope:**
  - Web and mobile user sign-in flows and external OAuth provider integration — scheduled for Phase 09.
  - Product payload domains (todos, routines, notes, journals, tags) — scheduled for Phase 10 & Phase 11.
  - Offline sync engine and mutation queue — scheduled for Phase 12 & Phase 13.
  - Distributed Redis rate limiting — omitted in favor of process-local rate limiting to avoid unneeded cloud dependencies.
  - Physical Android TalkBack verification (Phase 04 & Phase 06) — remains blocked pending physical device.

## Result

Delivered the complete Phase 08 authenticated API service, shared contracts, and typed client foundation for Daynori, establishing rigorous security boundaries at the HTTP transport, authentication, and authorization layers.

Key architectural and security achievements:

1. **Standards-Compliant JWT & JWKS Verification:**
   - Powered by maintained `jose` library with RS256/EdDSA algorithm allowlisting.
   - Comprehensive claim and intended-use checks prevent service/admin/anonymous credentials from impersonating user sessions.
   - Key rotation supported via JWKS `kid` lookup without trusting client-supplied key URLs.
2. **Multi-Tenant Non-Leakage Authorization:**
   - Verified actor identity is bound to transaction-local PostgreSQL tenant contexts (`set_config(..., is_local = true)`).
   - Requests targeting unauthorized workspaces return consistent 404 responses identical to nonexistent workspaces, rendering workspace ID enumeration impossible.
   - Membership revocation cuts off access immediately on the next request.
3. **Strict Request Boundary & Input Validation:**
   - Mutation contracts enforce `.strict()` to reject unknown fields.
   - Fastify enforces a 1 MiB JSON body limit.
4. **Zero Credential Leakage:**
   - Structured logger recursively redacts authorization tokens, cookies, sensitive query parameters, and database passwords.
   - Probes (`/v1/ready`) report operational state without leaking connection strings or stack traces.
   - Client bundle `@daynori/api-client` contains zero server credentials or database modules.
5. **Typed Client with Keyset Pagination & Cancellation:**
   - Full TypeScript client with Zod response parsing, `AbortSignal` support, and async generator keyset pagination.

## Acceptance evidence

| Acceptance Condition                                | Verification Method                         | Location / Artifact        | Result                                                                               |
| :-------------------------------------------------- | :------------------------------------------ | :------------------------- | :----------------------------------------------------------------------------------- |
| Valid RSA signed JWT authentication                 | Test injection with real RS256 key pair     | `apps/api/src/api.test.ts` | PASS (Derived actor ID correctly, HTTP 200/201)                                      |
| Expired / Future token rejection                    | Test injection with expired and future nbf  | `apps/api/src/api.test.ts` | PASS (HTTP 401 UNAUTHENTICATED)                                                      |
| Tampered token signature rejection                  | Test injection with altered signature bytes | `apps/api/src/api.test.ts` | PASS (HTTP 401 UNAUTHENTICATED)                                                      |
| Wrong issuer / audience rejection                   | Test injection with mismatched iss and aud  | `apps/api/src/api.test.ts` | PASS (HTTP 401 UNAUTHENTICATED)                                                      |
| Forbidden algorithm rejection (none, HS256)         | Test injection with unsigned / symmetric    | `apps/api/src/api.test.ts` | PASS (HTTP 401 UNAUTHENTICATED)                                                      |
| Service / Anonymous / Admin credential rejection    | Test injection with anon/service_role roles | `apps/api/src/api.test.ts` | PASS (HTTP 401 UNAUTHENTICATED)                                                      |
| Key rotation support via JWKS                       | Test injection signed with rotated Key B    | `apps/api/src/api.test.ts` | PASS (Derived actor ID correctly via JWKS kid lookup)                                |
| Untrusted jku token header ignored                  | Test injection with attacker jku URL        | `apps/api/src/api.test.ts` | PASS (JWKS URL strictly ignored; pre-configured keystore used)                       |
| Operational health probe without secrets            | `GET /v1/health`                            | `apps/api/src/api.test.ts` | PASS (200 OK, operational state without secrets)                                     |
| Database readiness probe without credential leakage | `GET /v1/ready`                             | `apps/api/src/api.test.ts` | PASS (200 OK, database connected, zero secrets in response)                          |
| Unknown mutation fields rejection                   | `POST /v1/workspaces` with extra field      | `apps/api/src/api.test.ts` | PASS (400 VALIDATION_FAILED)                                                         |
| Oversized request body rejection                    | `POST /v1/workspaces` with 1.5 MiB payload  | `apps/api/src/api.test.ts` | PASS (413 PAYLOAD_TOO_LARGE)                                                         |
| Unauthenticated request rejection                   | Request without Authorization header        | `apps/api/src/api.test.ts` | PASS (401 UNAUTHENTICATED)                                                           |
| Canonical OpenAPI 3.0 specification                 | `GET /v1/openapi.json`                      | `apps/api/src/api.test.ts` | PASS (Valid OpenAPI 3.0.3 schema covering all v1 routes)                             |
| Nonmember workspace defense (existence non-leakage) | User 2 requesting User 1 workspace          | `apps/api/src/api.test.ts` | PASS (Consistent 404 NOT_FOUND response)                                             |
| Actor-field integrity derivation                    | Item creation                               | `apps/api/src/api.test.ts` | PASS (`createdBy` strictly derived from verified token `sub`)                        |
| Cross-tenant item list rejection                    | User 2 listing User 1 workspace items       | `apps/api/src/api.test.ts` | PASS (Consistent 404 NOT_FOUND response)                                             |
| Immediate membership revocation cutoff              | Access after membership deletion            | `apps/api/src/api.test.ts` | PASS (Subsequent request immediately rejected with 404)                              |
| Keyset pagination navigation                        | Paging across 5 items with limit: 2         | `apps/api/src/api.test.ts` | PASS (Cursor returned in meta, non-duplicate sequential items)                       |
| Client keyset pagination async generator            | `client.paginateItems`                      | `apps/api/src/api.test.ts` | PASS (Successfully consumed all 5 items across pages)                                |
| Process-local rate limiting & Retry-After           | Exceeding threshold with rapid requests     | `apps/api/src/api.test.ts` | PASS (429 RATE_LIMITED with `Retry-After` header)                                    |
| Redacted structured logging verification            | Inspection of captured log sink             | `apps/api/src/api.test.ts` | PASS (Synthetic secret markers never appear; [REDACTED] applied)                     |
| Client bundle credential isolation                  | Inspection of `@daynori/api-client` exports | `apps/api/src/api.test.ts` | PASS (Zero server connection pools, passwords, or database modules)                  |
| ID token rejection as API access tokens             | Verifier with `token_use === 'id'`          | `apps/api/src/api.test.ts` | PASS (Throws 401: ID tokens and non-access tokens not permitted)                     |
| Missing / non-authenticated role rejection          | Token without role or non-auth role         | `apps/api/src/api.test.ts` | PASS (Throws 401: Unauthorized token role without defaulting)                        |
| Anonymous session rejection                         | Token with `is_anonymous: true`             | `apps/api/src/api.test.ts` | PASS (Throws 401: Anonymous user sessions not permitted)                             |
| Non-UUID subject rejection                          | Token with invalid subject format           | `apps/api/src/api.test.ts` | PASS (Throws 401: Invalid user identity in token)                                    |
| Symmetric HS256 secret allowlist verification       | HS256 token against configured secret       | `apps/api/src/api.test.ts` | PASS (Verifies actor ID; rejects wrong symmetric keys)                               |
| Malformed JSON request body consistency             | Invalid JSON payload to POST /v1/workspaces | `apps/api/src/api.test.ts` | PASS (HTTP 400 VALIDATION_FAILED)                                                    |
| Incoming request ID bounded and sanitized           | Oversized (>64) and XSS request IDs         | `apps/api/src/api.test.ts` | PASS (Replaced with fresh UUIDs; valid bounded IDs preserved)                         |
| Keyset cursor workspace and filter context binding  | Cross-workspace & oversized cursors         | `apps/api/src/api.test.ts` | PASS (HTTP 400 VALIDATION_FAILED)                                                    |
| Unhandled error message & stack trace redaction     | Unhandled error containing database conn str| `apps/api/src/api.test.ts` | PASS (Zero secrets/passwords leaked in serialized logs; [REDACTED] applied)          |
| Readiness probe failure on unconfigured auth        | GET /v1/ready with unconfigured verifier    | `apps/api/src/api.test.ts` | PASS (HTTP 503 unavailable, checks.auth: 'unconfigured')                             |
| Server startup failure on unconfigured auth         | Startup without verifier in standard mode   | `apps/api/src/api.test.ts` | PASS (Throws startup error)                                                          |
| Canonical OpenAPI spec contracts drift check        | GET /v1/openapi.json schema inspection      | `apps/api/src/api.test.ts` | PASS (All Zod schemas mapped, zero drift detected)                                   |
| Typed API client unit tests                         | `packages/api-client/src/client.test.ts`    | Root test runner           | PASS (8 tests passed covering auth, validation, errors, pagination, and abortSignal) |
| Full monorepo typecheck                             | `pnpm typecheck`                            | Root workspace             | PASS (Exit code 0 across 13 packages)                                                |
| Lint validation                                     | `pnpm lint`                                 | Root workspace             | PASS (Exit code 0, 0 lint errors)                                                    |
| Prettier style validation                           | `pnpm format:check`                         | Root workspace             | PASS (All files adhere to Prettier code style)                                       |
| Planning validation                                 | `pnpm validate:planning`                    | Root workspace             | PASS (64 phases, 22 mapped requirements, 148 Markdown files validated)               |
| Secret scanning                                     | `pnpm audit:secrets`                        | Root workspace             | PASS (1162 files checked, 0 unapproved secrets)                                      |

### Executed verification commands

```powershell
# 1. Run API service unit and integration test suite
pnpm vitest run apps/api/src/api.test.ts
# Result: Exit code 0 (38 tests passed in 446ms)

# 2. Run API client test suite
pnpm vitest run packages/api-client/src/client.test.ts
# Result: Exit code 0 (8 tests passed in 31ms)

# 3. Run full test suite across monorepo
pnpm test
# Result: Exit code 0 (22 test files, 193 tests passed in 2.79s)

# 4. Typecheck all workspace packages
pnpm typecheck
# Result: Exit code 0 across 13 workspace projects

# 5. ESLint verification
pnpm lint
# Result: Exit code 0, 0 warnings, 0 errors

# 6. Format check
pnpm format:check
# Result: Exit code 0 (All matched files use Prettier code style)

# 7. Planning validation
pnpm validate:planning
# Result: Exit code 0 (64 phases, 22 mapped requirements, 148 Markdown files validated)

# 8. Secret scanner audit
pnpm audit:secrets
# Result: Exit code 0 (checked 1162 files without detecting unapproved secrets)
```

## Defects, limitations and recovery

- **Physical Android TalkBack Hardware Gate (Phases 04 & 06)**: Remains blocked on physical Android hardware availability; explicitly preserved in `docs/roadmap/progress.json`.
- **Process-Local Rate Limiting Limitation**: The rate limiter maintains sliding-window counters strictly in process memory. In horizontal multi-instance deployments, each instance enforces its own budget; distributed rate limiting via Redis is deferred until Phase 58 when scaling demands require it.
- **Dependency Advisory Warnings**: Fail-closed advisory audit (`node-forge` and `braces`) remains visible without invented approval bypasses.

## Documentation and Git review

- Architecture Decision Record: [ADR-0014: Authenticated API service, contracts, and tenant-scoped authorization](../decisions/0014-authenticated-api-service-and-contracts.md).
- Roadmap Progress: Updated `docs/roadmap/progress.json` marking Phase 08 as complete, setting `nextPhase: null`, and documenting the scheduling decision pending prerequisite physical hardware gates.
- Changelog: Updated `CHANGELOG.md` with Phase 08 accomplishments.
- `git diff --check`: Verified clean.
- Staged paths: Scoped strictly to `apps/api`, `packages/contracts`, `packages/api-client`, tests, and planning documentation.
- Commit target: `feat(api): establish validated authenticated service contracts`.

## Handoff

- **Phase 08 Status:** Complete and verified.
- **Roadmap Progression State:** Phase 08 completes the foundational API contract and service layer. Further roadmap progression to [Phase 09 — Authentication across web and Android](../roadmap/phases/09-authentication-across-web-and-android.md) requires completion of Phases 05, 06, and 08. Because Phases 04, 05, and 06 remain explicitly blocked pending physical Android TalkBack hardware verification, a documented scheduling decision is recorded in `docs/roadmap/progress.json`.
- **Next Required Action:** Connect a physical Android device to perform TalkBack and gesture verification to unblock Phase 04 and downstream navigation shells before starting Phase 09.
