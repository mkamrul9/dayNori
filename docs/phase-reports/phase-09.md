# Phase 09: Authentication across web and Android

Group: Foundation and sync. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [09 — Authentication across web and Android](../roadmap/phases/09-authentication-across-web-and-android.md)
- **Status:** `blocked` (Provisional web and Android authentication implementation delivered, repaired, and verified against live local Supabase Auth container daemon. Completion blocked pending prerequisite Phase 04–06 physical Android TalkBack hardware verification).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-14 (Repaired 2026-10-15).
- **Base Git revision and branch:** `main`.
- **Prerequisites:**
  - [Phase 07 — PostgreSQL and tenant isolation foundation](phase-07.md): Repaired least-privilege runtime role, transaction-local tenant context, relational composite constraints, executable private storage policies, and schema migrations established and verified.
  - [Phase 08 — API contracts and service foundation](phase-08.md): Fastify REST service, canonical shared schemas, hardened JWT verification with RS256/ES256/EdDSA allowlists, bound request IDs, redacted logs, and typed API client verified.
  - [Phase 05 — Web design system and navigation shell](phase-05.md): Web shell, routing primitives, and accessible design system established.
  - [Phase 06 — Android design system and navigation shell](phase-06.md): Android shell, tab bar, back handling, and deep link parsing established.
  - [Phase 04 — Mobile design tokens and accessible primitives](phase-04.md): Prerequisite design tokens established (TalkBack hardware check remains blocked).
- **Included scope:**
  - Initial authentication method selected and documented: Email/password authentication with email verification and secure recovery ([ADR-0015](../decisions/0015-authentication-across-web-and-android.md)).
  - Shared authentication contracts in `packages/contracts/src/auth.ts`:
    - `SignInRequestSchema`, `SignUpRequestSchema`, `PasswordRecoveryRequestSchema`, `AuthSessionSchema`, `AuthUserSchema`, `QuarantinedDraftSchema`.
    - Open redirect defense helper `validateAuthRedirectUrl` enforcing relative paths or allowlisted origins without control characters or backslashes.
    - Double-submit CSRF token generator (`generateCsrfToken`) and constant-time verifier (`verifyCsrfToken`).
  - Web same-origin session architecture (`apps/web`):
    - Route handlers under `/api/auth/*` (`session`, `sign-in`, `sign-up`, `sign-out`, `refresh`, `recover`, `callback`).
    - HttpOnly, Secure, SameSite=Lax session cookies (`daynori_access_token`, `daynori_refresh_token`, `daynori_csrf_token`).
    - Double-submit CSRF token validation and Origin header verification on state-changing POST requests.
    - Zero token leakage: refresh tokens strictly kept out of `localStorage`, `sessionStorage`, and browser-readable DOM state.
    - Cache control: `Cache-Control: private, no-store, no-cache, must-revalidate` applied to all session handlers and authenticated routes.
    - Multi-tab synchronization via `BroadcastChannel` with `LOGIN`, `LOGOUT`, and `SESSION_REPLACED` event distribution.
    - In-flight request cancellation via `AbortController` on session replacement or logout.
    - Accessible tabbed `AuthModal` dialog component with ARIA attributes, keyboard escape handling, and focus retention.
    - Protected route gating on `/journal` preserving target destination across sign-in.
  - Android secure session architecture (`apps/mobile`):
    - `SecureStorageAdapter` backed by `expo-secure-store` (hardware KeyStore/Keyring) with test-only in-memory option.
    - `MobileProviderAuthAdapter` managing full lifecycle: registration, password sign-in, recovery, secure storage persistence, and deep link callbacks.
    - Anti-replay and anti-injection deep link callback verification requiring valid nonces and allowlisted schemes (`daynori://`).
    - Cold start and process restart session restoration from OS secure storage after verifying token with provider.
    - Draft quarantine manager (`DraftQuarantineManager`): uncommitted drafts are quarantined by account ID on logout to strictly prevent cross-account leakage.
    - Protected destination gating preserving navigation to `/journal` or other destinations upon authentication.
  - Live Supabase integration verified:
    - Live Supabase Auth container daemon (GoTrue v2.197.0 on port 54321), local PostgreSQL on 54322, and Mailpit email catcher on port 54324.
    - Real ES256 asymmetric signature verification via JWKS (`.well-known/jwks.json`).
    - Token rotation, password recovery emails, server-side session revocation (`POST /auth/v1/logout`).
- **Defects Repaired (Phase 09 Audit Corrections):**
  1. _Eliminated simulated runtime fallback_: Removed automatic fallback to in-memory `mockUsers`, `localAccounts`, and `hash_<password>` from normal application runtime in `apps/web/src/auth/session.ts` and `apps/mobile/src/auth/providerAdapter.ts`. Provider failures fail safely with explicit error states. Test doubles are restricted strictly to unit testing.
  2. _Genuine callbacks_: Replaced synthetic cookie/token manufacturing with provider-verified code exchange (`/auth/v1/token?grant_type=pkce`), bounded redirects, and anti-replay protection bound to an initiated authentication flow.
  3. _Session verification before trusting identity_: Replaced unverified token parsing with real provider verification (`GET /auth/v1/user`) and API `JwtVerifier`. Restored mobile sessions are validated against the provider before private state is exposed.
  4. _Native secure storage_: Declared `expo-secure-store` dependency in `apps/mobile/package.json`, generated native Android files via prebuild, and rebuilt the development APK (`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`). Storage errors are propagated as actionable `SecureStorageError` instances. Memory storage is restricted strictly to tests. Failed credential deletion during sign-out explicitly flags the session as revoked so restart cannot restore signed-out accounts.
  5. _Real refresh, recovery, and logout_: Sign-out triggers server-side provider session revocation via `POST /auth/v1/logout`. Token rotation is verified via GoTrue. Password recovery triggers genuine outbound email delivery to local Mailpit.
  6. _Workspace state_: Prior to Phase 10 provisioning, user workspace is represented explicitly as `workspaceId: null` ("workspace not provisioned") rather than fabricated mock identifiers.
  7. _Evidence sanitation_: All raw token and secret strings have been purged from reports, logs, and artifacts.
- **Excluded/deferred scope:**
  - OAuth social login providers (Google, GitHub, Apple) — deferred to Phase 48.
  - WebAuthn / Passkeys — deferred to Phase 48.
  - Biometric authentication (Fingerprint / Face Unlock) on Android — deferred to Phase 48.
  - Product payload domains (todos, routines, notes, journals, tags) — scheduled for Phase 10 & Phase 11.
  - Offline sync engine and mutation queue — scheduled for Phase 12 & Phase 13.
  - Physical Android TalkBack verification (Phase 04 & Phase 06) — remains blocked pending physical device.

## Result

Delivered and hardened the complete Phase 09 authentication and session lifecycle architecture across web and Android for Daynori, establishing rigorous security boundaries at the browser cookie, OS KeyStore, CSRF, anti-replay, and tenant data isolation layers.

## Acceptance evidence

| Acceptance Condition                               | Verification Method                             | Location / Artifact            | Result                                                                             |
| :------------------------------------------------- | :---------------------------------------------- | :----------------------------- | :--------------------------------------------------------------------------------- |
| Web password sign-in and session cookie issuance   | POST /api/auth/sign-in with valid credentials   | `apps/web/src/auth.test.ts`    | PASS (200 OK, sets HttpOnly daynori_access_token & daynori_refresh_token cookies)  |
| Web CSRF protection rejection                      | POST /api/auth/sign-in without valid CSRF token | `apps/web/src/auth.test.ts`    | PASS (403 FORBIDDEN: Invalid or missing CSRF token)                                |
| Web unauthorized origin rejection                  | POST /api/auth/sign-in with attacker Origin     | `apps/web/src/auth.test.ts`    | PASS (403 FORBIDDEN: Unauthorized request origin)                                  |
| Web provider outage safe failure                   | POST /api/auth/sign-in when provider is down    | `apps/web/src/auth.test.ts`    | PASS (401 UNAUTHORIZED: Authentication service unavailable; no mock fallback)      |
| Web user registration with email verification      | POST /api/auth/sign-up with new credentials     | `apps/web/src/auth.test.ts`    | PASS (201 Created, requiresVerification: true)                                     |
| Web sign-out and server-side revocation            | POST /api/auth/sign-out with valid CSRF         | `apps/web/src/auth.test.ts`    | PASS (200 OK, revokes session at provider, clears cookies)                         |
| Web active session state retrieval                 | GET /api/auth/session with valid access cookie  | `apps/web/src/auth.test.ts`    | PASS (200 OK, returns user profile, workspaceId: null, and csrfToken)              |
| Web unauthenticated session status                 | GET /api/auth/session without cookies           | `apps/web/src/auth.test.ts`    | PASS (200 OK, returns authenticated: false, null user)                             |
| Web forged / expired cookie rejection              | GET /api/auth/session with forged token         | `apps/web/src/auth.test.ts`    | PASS (200 OK, returns authenticated: false, null user; clears cookies)             |
| Web genuine callback code exchange                 | GET /api/auth/callback with valid code          | `apps/web/src/auth.test.ts`    | PASS (307 redirect, exchanges code with provider, sets session cookies)            |
| Web arbitrary callback rejection                   | GET /api/auth/callback with invalid code        | `apps/web/src/auth.test.ts`    | PASS (307 redirect with auth_error=code_exchange_failed)                           |
| Web private cache-control header verification      | GET /api/auth/session response inspection       | `apps/web/src/auth.test.ts`    | PASS (Cache-Control: private, no-store, no-cache, must-revalidate)                 |
| Open redirect attack rejection                     | validateAuthRedirectUrl with external URL       | `apps/web/src/auth.test.ts`    | PASS (Rejects https://evil.com, javascript:, and control characters; returns null) |
| Android OS secure storage isolation                | SecureStorageAdapter store, retrieve, delete    | `apps/mobile/src/auth.test.ts` | PASS (Stores and retrieves secrets via expo-secure-store; zero plaintext leakage)  |
| Android actionable storage error propagation       | SecureStorageAdapter failing backend            | `apps/mobile/src/auth.test.ts` | PASS (Throws SecureStorageError, never silently falls back to Map)                 |
| Android provider sign-up journey                   | MobileProviderAuthAdapter signUp                | `apps/mobile/src/auth.test.ts` | PASS (Returns success, requiresVerification: true)                                 |
| Android password sign-in and KeyStore persistence  | MobileProviderAuthAdapter signInWithPassword    | `apps/mobile/src/auth.test.ts` | PASS (Persists session secrets to secure storage, notifies listeners)              |
| Android provider outage safe failure               | signInWithPassword when provider is down        | `apps/mobile/src/auth.test.ts` | PASS (Returns success: false with 'unavailable', zero mock account fallback)       |
| Android deep link authentication callback          | handleDeepLink with initiated flow and code     | `apps/mobile/src/auth.test.ts` | PASS (Authenticates session, stores secrets in KeyStore)                           |
| Android unsolicited deep link rejection            | handleDeepLink without initiated flow           | `apps/mobile/src/auth.test.ts` | PASS (Rejects with 'No initiated authentication flow found')                       |
| Android anti-replay callback rejection             | Re-presenting already processed callback nonce  | `apps/mobile/src/auth.test.ts` | PASS (Rejects with 'replay rejected')                                              |
| Android failed credential deletion handling        | signOut when secure store deletion fails        | `apps/mobile/src/auth.test.ts` | PASS (Throws SecureStorageError, marks revoked, reboot does not restore account)   |
| Android cold start verified session restoration    | restoreSession from populated secure storage    | `apps/mobile/src/auth.test.ts` | PASS (Verifies token with provider, restores authenticated user)                   |
| Android cold start revoked token rejection         | restoreSession with revoked/expired token       | `apps/mobile/src/auth.test.ts` | PASS (Rejects restoration, wipes stale credentials, remains unauthenticated)       |
| Android cross-account draft quarantine on logout   | DraftQuarantineManager on logout and login      | `apps/mobile/src/auth.test.ts` | PASS (Quarantines User 1 drafts; User 2 cannot access; restored on User 1 login)   |
| Android protected destination gating & resume      | Navigation to /journal when unauthenticated     | `apps/mobile/src/auth.test.ts` | PASS (Queues pending destination; restores /journal upon authentication)           |
| Live Supabase Auth daemon health                   | GET http://127.0.0.1:54321/auth/v1/health       | Local GoTrue container         | PASS (200 OK, GoTrue v2.197.0 operational)                                         |
| Live local Mailpit email catcher                   | GET http://127.0.0.1:54324/api/v1/messages      | Local Mailpit container        | PASS (200 OK, password recovery email caught and inspected)                        |
| Live Supabase user registration & password sign-in | POST /auth/v1/signup & /auth/v1/token           | Local Supabase Auth stack      | PASS (200 OK, created user, ES256 JWT issued and verified via JWKS)                |
| Live Supabase session refresh & server revocation  | POST /auth/v1/token (refresh) & /auth/v1/logout | Local Supabase Auth stack      | PASS (200 OK, token rotated; session revoked at provider)                          |
| Native Android development APK rebuild             | `gradlew assembleDebug` in apps/mobile/android  | `apps/mobile/android`          | PASS (`app-debug.apk` built with expo-secure-store compiled in)                    |
| Full monorepo automated test suite                 | `pnpm test`                                     | Root workspace                 | PASS (24 test files, 221 tests passed)                                             |
| Full monorepo typecheck                            | `pnpm typecheck`                                | Root workspace                 | PASS (Exit code 0 across 13 packages)                                              |
| ESLint verification                                | `pnpm lint`                                     | Root workspace                 | PASS (Exit code 0, 0 lint errors)                                                  |
| Prettier style validation                          | `pnpm format:check`                             | Root workspace                 | PASS (All files adhere to Prettier code style)                                     |
| Planning validation                                | `pnpm validate:planning`                        | Root workspace                 | PASS (64 phases, 22 mapped requirements, 152 Markdown files validated)             |
| Secret scanning audit                              | `pnpm audit:secrets`                            | Root workspace                 | PASS (All files checked, 0 unapproved secrets)                                     |

## Defects, limitations and recovery

- **Physical Android TalkBack Hardware Gate (Phases 04 & 06)**: Remains blocked on physical Android hardware availability; explicitly preserved in `docs/roadmap/progress.json`.
- **Live Supabase Auth Container Daemon Gate (RESOLVED)**: Supabase local stack operational on port 54321 (Auth), 54322 (PostgreSQL), and 54324 (Mailpit). Real user registration, ES256 token verification via JWKS, refresh rotation, and logout revocation verified against live containers.
- **Dependency Advisory Warnings**: Fail-closed advisory audit (`node-forge` and `braces`) remains visible without manufactured approval bypasses.

## Documentation and Git review

- Architecture Decision Record: [ADR-0015: Authentication across web and Android](../decisions/0015-authentication-across-web-and-android.md).
- Roadmap Progress: Updated `docs/roadmap/progress.json` marking Phase 09 as blocked, documenting the scheduling decision pending prerequisite physical hardware gates.
- Changelog: Updated `CHANGELOG.md` with Phase 09 security defect repairs.
- `git diff --check`: Verified clean.

## Handoff

- **Phase 09 Status:** Software security defects repaired; verified against live Supabase Auth stack; blocked pending physical Android TalkBack hardware verification.
- **Roadmap Progression State:** Phase 09 provides the verified authentication foundation for Phase 10 personal workspace and preferences provisioning.
- **Next Required Action:** Commit Phase 09 repairs, then proceed to Phase 10 implementation under authorized provisional scope.
