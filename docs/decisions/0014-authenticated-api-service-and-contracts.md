# ADR-0014: Authenticated API service, contracts, and tenant-scoped authorization

- Status: accepted.
- Date: 2026-10-14.
- Owner/reviewer: Security & API Architecture.
- Related phase and specifications: [Phase 08 Specification](../../docs/roadmap/phases/08-api-contracts-and-service-foundation.md), [API Conventions](../../docs/architecture/api-conventions.md), [Security & Vault](../../docs/architecture/security-and-vault.md).

## Context

Daynori requires a versioned HTTP API (`/v1`) serving web and mobile client applications. The service must establish cryptographically verified authentication, strict multi-tenant authorization, runtime boundary validation, safe structured logging, and typed client contracts before product payload domains (todos, routines, notes, journals) are introduced in later phases.

## Options

1. **Ad-hoc route handlers with permissive decoding (Rejected)**: Decoding JWT tokens without cryptographic signature verification or accepting untrusted algorithm headers (`none`, symmetric `HS256`). Rejected due to catastrophic identity spoofing vulnerabilities.
2. **Global distributed cache and paid infrastructure upfront (Rejected)**: Introducing distributed Redis clusters or cloud rate limiters in early foundational phases. Rejected because it violates the project constraint against unneeded paid infrastructure and external operational dependencies before scaling requirements demand them.
3. **Standard maintained JWT verification (`jose`), canonical shared Zod contracts, transaction-scoped tenant isolation, process-local rate limiting, and typed API client (Chosen)**: Using standards-compliant Web Crypto JWT verification, algorithm allowlists, strict schema validation rejecting unknown mutation fields, consistent 404 responses preventing resource existence leakage, safe structured logging with recursive credential redaction, and a fully typed API client with keyset pagination and cancellation.

## Decision

1. **Maintained-Library JWT Verification**:
   - Signature verification implemented via standard `jose` library.
   - Algorithm allowlist matches configured Supabase signing keys: `['RS256', 'EdDSA']` for asymmetric keys; `['HS256']` for explicit symmetric keys. Unsigned tokens (`none`) are explicitly rejected.
   - Comprehensive claims validation: issuer (`iss`), audience (`aud`), expiration (`exp`), not-before (`nbf`), subject (`sub` validated as UUID), and mandatory `token_use === 'access'`. ID tokens (`token_use === 'id'`) are strictly rejected.
   - Mandatory `role === 'authenticated'`. Rejection of unauthenticated, anonymous (`is_anonymous: true`), service (`service_role`), and administrative credentials (`supabase_admin`) as valid user sessions without defaulting.
   - Safe authentication error returns: verifier internal details and stack traces are not leaked to clients.
   - Trusted JWKS source configuration with bounded caching (10m) and network timeouts (5s); attacker-supplied key URLs (`jku`, `x5u`) in token headers are never fetched.
2. **Actor Identity & Tenant-Scoped Database Isolation**:
   - Actor identity is derived exclusively from verified JWT claims (`sub` -> `userId`). Request body fields cannot override actor identity.
   - Workspace-scoped routes require verified membership ('viewer', 'editor', or 'owner').
   - Database operations execute exclusively inside `withTenantContext` or `withUserContext` transactional blocks with transaction-local PostgreSQL settings (`set_config(..., is_local = true)`).
3. **Consistent Non-Leakage Error Responses**:
   - Requests targeting unauthorized workspaces or nonexistent objects return identical HTTP 404 `NOT_FOUND` responses, preventing callers from enumerating private resource existence.
   - Malformed JSON request bodies consistently return HTTP 400 `VALIDATION_FAILED`.
   - Response-schema validation failures are treated as HTTP 500 server errors (`ResponseValidationError`), not blamed on clients.
4. **Strict Boundary Validation, Request ID Sanitization & Keyset Cursors**:
   - Canonical Zod contracts in `packages/contracts` validate all path parameters, queries, and request bodies.
   - Canonical OpenAPI 3.0 specification generated dynamically from shared schemas and validated via drift tests.
   - Mutation schemas enforce `.strict()` to reject unknown or unapproved input fields.
   - Fastify enforces a 1 MiB JSON request body limit (`413 PAYLOAD_TOO_LARGE`).
   - Incoming request IDs (`x-request-id`) are bounded to 64 characters and sanitized against `^[a-zA-Z0-9_-]{1,64}$`; invalid or oversized IDs are replaced with fresh UUIDs.
   - Keyset cursors are bound to their workspace ID and filter context (`kind`), limited to 256 characters, and validated strictly.
5. **Bounded Operational Readiness & Startup Checks**:
   - `GET /v1/ready` enforces an actual 2-second timeout on database connection probes.
   - Server startup and readiness explicitly check for configured authentication; unconfigured authentication fails startup in standard mode.
6. **Process-Local Rate Limiting**:
   - In-memory sliding-window rate limiter keyed by verified actor ID (or client IP for unauthenticated routes).
   - Returns HTTP 429 with `Retry-After` header when thresholds are exceeded.
   - Honestly documented as process-local (not distributed across multiple server replicas).
7. **Redacted Structured Logging**:
   - Safe logger redacts authorization headers, cookies, query parameters matching sensitive keys, database passwords, JWT tokens, and unhandled error stacks/messages.
   - Asserted via integration tests using synthetic secret markers.
8. **Typed API Client**:
   - `@daynori/api-client` provides typed methods for all `/v1` endpoints with Zod response parsing, `AbortSignal` cancellation support, typed error hierarchy, and an async generator for keyset pagination.
   - Verified to contain zero server connection credentials or database pooling dependencies.

## Consequences

- All future feature API routes must declare canonical schemas in `packages/contracts` and register under Fastify modules.
- Client applications must pass verified Bearer tokens for all workspace operations.
- Operational readiness probes (`/v1/ready`) report bounded health without exposing database topology or secrets.

## Verification and revisit

- **Verification evidence**:
  - 38 tests in `apps/api/src/api.test.ts` validating tightened JWT verification, ID token rejection, role enforcement, HS256 allowlist, request ID sanitization, cursor binding, error redaction, dynamic OpenAPI drift check, readiness timeouts, and rate limiting.
  - 8 tests in `packages/api-client/src/client.test.ts` validating response parsing, typed errors, cancellation, and keyset pagination generator.
  - Zero unapproved secrets across 1162 files in `pnpm audit:secrets`.
- **Revisit triggers**: Expansion to horizontal multi-replica API deployments requiring distributed rate limiting (Phase 58), or introduction of external OAuth providers (Phase 09).
