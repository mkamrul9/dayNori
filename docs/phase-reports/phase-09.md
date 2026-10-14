# Phase 09: Authentication across web and Android

Group: Foundation and sync. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [09 — Authentication across web and Android](../roadmap/phases/09-authentication-across-web-and-android.md)
- **Status:** `provisional` (Authorized provisional development delivered across web and Android; final completion claim blocked pending prerequisite Phase 04–06 physical Android TalkBack hardware verification and live Supabase Auth container daemon execution on host).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-14.
- **Base Git revision and branch:** `7db89da` on branch `main`.
- **Prerequisites:**
  - [Phase 07 — PostgreSQL and tenant isolation foundation](phase-07.md): Repaired least-privilege runtime role, transaction-local tenant context, relational composite constraints, executable private storage policies, and schema migrations established and verified.
  - [Phase 08 — API contracts and service foundation](phase-08.md): Fastify REST service, canonical shared schemas, hardened JWT verification with RS256/HS256 allowlists, bound request IDs, redacted logs, and typed API client verified.
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
    - `SecureStorageAdapter` backed by `expo-secure-store` (hardware KeyStore/Keyring) with in-memory test fallback.
    - `MobileProviderAuthAdapter` managing full lifecycle: registration, password sign-in, recovery, secure storage persistence, and deep link callbacks.
    - Anti-replay and anti-injection deep link callback verification requiring valid nonces and allowlisted schemes (`daynori://`).
    - Cold start and process restart session restoration from OS secure storage.
    - Draft quarantine manager (`DraftQuarantineManager`): uncommitted drafts are quarantined by account ID on logout to strictly prevent cross-account leakage.
    - Protected destination gating preserving navigation to `/journal` or other destinations upon authentication.
  - Architecture Decision Record: [ADR-0015: Authentication across web and Android](../decisions/0015-authentication-across-web-and-android.md).
- **Excluded/deferred scope:**
  - OAuth social login providers (Google, GitHub, Apple) — deferred to Phase 48.
  - WebAuthn / Passkeys — deferred to Phase 48.
  - Biometric authentication (Fingerprint / Face Unlock) on Android — deferred to Phase 48.
  - Product payload domains (todos, routines, notes, journals, tags) — scheduled for Phase 10 & Phase 11.
  - Offline sync engine and mutation queue — scheduled for Phase 12 & Phase 13.
  - Physical Android TalkBack verification (Phase 04 & Phase 06) — remains blocked pending physical device.
  - Live Supabase Auth container daemon execution on host — Docker daemon unavailable on host machine; local PostgreSQL 17 active on port 5432; live container daemon execution remains a documented gate.

## Result

Delivered the complete Phase 09 authentication and session lifecycle architecture across web and Android for Daynori, establishing rigorous security boundaries at the browser cookie, OS KeyStore, CSRF, anti-replay, and tenant data isolation layers.

Key architectural and security achievements:

1. **Web Same-Origin Cookie Security:**
   - Session tokens are stored exclusively in HttpOnly, Secure, SameSite=Lax cookies managed by same-origin Route Handlers.
   - JavaScript running in the browser cannot read access or refresh tokens, preventing token exfiltration via XSS.
   - All state-changing authentication endpoints enforce double-submit CSRF tokens and validate the `Origin` header against an approved whitelist.
   - All session endpoints emit `Cache-Control: private, no-store, no-cache, must-revalidate` to prevent CDN or shared proxy caching of sensitive user identity.
2. **Multi-Tab Sync & Request Cancellation:**
   - Browser tabs communicate session lifecycle transitions via `BroadcastChannel('daynori_auth_channel')`.
   - Logging in or out in one tab immediately updates all active tabs without full page reloads.
   - Any in-flight API requests are cancelled immediately via `AbortController` upon logout or session replacement to prevent stale writes.
3. **Android Hardware-Backed Secure Storage:**
   - Android session secrets (tokens, user identity, workspace ID) are stored exclusively in OS-backed secure storage via `expo-secure-store` (backed by Android KeyStore).
   - Sessions survive cold app starts and process restarts.
   - No session secrets are ever stored in plain `AsyncStorage` or unencrypted SQLite databases.
4. **Anti-Replay & Anti-Injection Deep Link Callbacks:**
   - External deep link callbacks (`daynori://auth-callback`) require unique anti-replay nonces within a sliding 10-minute window.
   - Replayed callbacks or external links without security nonces are strictly rejected to prevent token injection attacks.
   - Provider error parameters (e.g., expired recovery links) are parsed and displayed cleanly to the user.
5. **Cross-Account Draft Quarantine:**
   - Uncommitted drafts (search queries, task creation drafts) are quarantined by user ID upon logout.
   - Switching accounts or logging in as a different user strictly isolates previous drafts, preventing cross-tenant information exposure.
6. **Protected Destination Gating & Resume:**
   - Protected routes (such as `/journal`) redirect or prompt unauthenticated users while saving the target destination.
   - Upon successful authentication, users are seamlessly navigated to their intended destination.

## Acceptance evidence

| Acceptance Condition                               | Verification Method                             | Location / Artifact            | Result                                                                             |
| :------------------------------------------------- | :---------------------------------------------- | :----------------------------- | :--------------------------------------------------------------------------------- |
| Web password sign-in and session cookie issuance   | POST /api/auth/sign-in with valid credentials   | `apps/web/src/auth.test.ts`    | PASS (200 OK, sets HttpOnly daynori_access_token & daynori_refresh_token cookies)  |
| Web CSRF protection rejection                      | POST /api/auth/sign-in without valid CSRF token | `apps/web/src/auth.test.ts`    | PASS (403 FORBIDDEN: Invalid or missing CSRF token)                                |
| Web unauthorized origin rejection                  | POST /api/auth/sign-in with attacker Origin     | `apps/web/src/auth.test.ts`    | PASS (403 FORBIDDEN: Unauthorized request origin)                                  |
| Web user registration with email verification      | POST /api/auth/sign-up with new credentials     | `apps/web/src/auth.test.ts`    | PASS (200 OK, requiresVerification: true)                                          |
| Web sign-out and cookie clearance                  | POST /api/auth/sign-out with valid CSRF         | `apps/web/src/auth.test.ts`    | PASS (200 OK, expires cookies with Max-Age=0)                                      |
| Web active session state retrieval                 | GET /api/auth/session with valid access cookie  | `apps/web/src/auth.test.ts`    | PASS (200 OK, returns user profile, workspaceId, and csrfToken)                    |
| Web unauthenticated session status                 | GET /api/auth/session without cookies           | `apps/web/src/auth.test.ts`    | PASS (200 OK, returns authenticated: false, null user)                             |
| Web private cache-control header verification      | GET /api/auth/session response inspection       | `apps/web/src/auth.test.ts`    | PASS (Cache-Control: private, no-store, no-cache, must-revalidate)                 |
| Open redirect attack rejection                     | validateAuthRedirectUrl with external URL       | `apps/web/src/auth.test.ts`    | PASS (Rejects https://evil.com, javascript:, and control characters; returns null) |
| Safe relative redirect preservation                | validateAuthRedirectUrl with /journal           | `apps/web/src/auth.test.ts`    | PASS (Returns /journal)                                                            |
| Android OS secure storage isolation                | SecureStorageAdapter store, retrieve, delete    | `apps/mobile/src/auth.test.ts` | PASS (Stores and retrieves secrets; zero plaintext leakage)                        |
| Android provider sign-up journey                   | MobileProviderAuthAdapter signUp                | `apps/mobile/src/auth.test.ts` | PASS (Returns success, stores user record)                                         |
| Android password sign-in and KeyStore persistence  | MobileProviderAuthAdapter signInWithPassword    | `apps/mobile/src/auth.test.ts` | PASS (Persists session secrets to secure storage, notifies listeners)              |
| Android incorrect password rejection               | signInWithPassword with wrong password          | `apps/mobile/src/auth.test.ts` | PASS (User-friendly error; zero verifier or stack leakage)                         |
| Android password recovery without user enumeration | MobileProviderAuthAdapter recoverPassword       | `apps/mobile/src/auth.test.ts` | PASS (Uniform success response regardless of account existence)                    |
| Android deep link authentication callback          | handleDeepLink with valid callback and nonce    | `apps/mobile/src/auth.test.ts` | PASS (Authenticates session, stores secrets in KeyStore)                           |
| Android anti-replay callback rejection             | Re-presenting already processed callback nonce  | `apps/mobile/src/auth.test.ts` | PASS (Rejects with 'replay rejected')                                              |
| Android callback error parameter handling          | handleDeepLink with provider error parameter    | `apps/mobile/src/auth.test.ts` | PASS (Returns safe failure, maintains unauthenticated state)                       |
| Android external link injection rejection          | Deep link without security nonce                | `apps/mobile/src/auth.test.ts` | PASS (Rejects token injection attack, preserves unauthenticated state)             |
| Android unapproved scheme rejection                | handleDeepLink with evilapp:// scheme           | `apps/mobile/src/auth.test.ts` | PASS (Rejects unauthorized URL scheme)                                             |
| Android cold start session restoration             | restoreSession from populated secure storage    | `apps/mobile/src/auth.test.ts` | PASS (Restores authenticated user and workspace ID on process restart)             |
| Android cold start empty storage safety            | restoreSession with empty storage               | `apps/mobile/src/auth.test.ts` | PASS (Remains unauthenticated; zero errors thrown)                                 |
| Android cross-account draft quarantine on logout   | DraftQuarantineManager on logout and login      | `apps/mobile/src/auth.test.ts` | PASS (Quarantines User 1 drafts; User 2 cannot access; restored on User 1 login)   |
| Android protected destination gating & resume      | Navigation to /journal when unauthenticated     | `apps/mobile/src/auth.test.ts` | PASS (Queues pending destination; restores /journal upon authentication)           |
| Full monorepo automated test suite                 | `pnpm test`                                     | Root workspace                 | PASS (24 test files, 216 tests passed in 3.10s)                                    |
| Full monorepo typecheck                            | `pnpm typecheck`                                | Root workspace                 | PASS (Exit code 0 across 13 packages)                                              |
| ESLint verification                                | `pnpm lint`                                     | Root workspace                 | PASS (Exit code 0, 0 lint errors)                                                  |
| Prettier style validation                          | `pnpm format:check`                             | Root workspace                 | PASS (All files adhere to Prettier code style)                                     |
| Planning validation                                | `pnpm validate:planning`                        | Root workspace                 | PASS (64 phases, 22 mapped requirements, 151 Markdown files validated)             |
| Secret scanning audit                              | `pnpm audit:secrets`                            | Root workspace                 | PASS (1179 files checked, 0 unapproved secrets)                                    |

### Executed verification commands

```powershell
# 1. Run Web authentication tests
pnpm vitest run apps/web/src/auth.test.ts
# Result: Exit code 0 (9 tests passed in 24ms)

# 2. Run Mobile authentication tests
pnpm vitest run apps/mobile/src/auth.test.ts
# Result: Exit code 0 (14 tests passed in 814ms)

# 3. Run Mobile navigation shell tests
pnpm vitest run apps/mobile/src/mobile.test.ts
# Result: Exit code 0 (16 tests passed in 33ms)

# 4. Run full test suite across monorepo
pnpm test
# Result: Exit code 0 (24 test files, 216 tests passed in 3.10s)

# 5. Typecheck all workspace packages
pnpm typecheck
# Result: Exit code 0 across 13 workspace projects

# 6. ESLint verification
pnpm lint
# Result: Exit code 0, 0 warnings, 0 errors

# 7. Format check
pnpm format:check
# Result: Exit code 0 (All matched files use Prettier code style)

# 8. Planning validation
pnpm validate:planning
# Result: Exit code 0 (64 phases, 22 mapped requirements, 151 Markdown files validated)

# 9. Secret scanner audit
pnpm audit:secrets
# Result: Exit code 0 (checked 1179 files without detecting unapproved secrets)
```

## Defects, limitations and recovery

- **Physical Android TalkBack Hardware Gate (Phases 04 & 06)**: Remains blocked on physical Android hardware availability; explicitly preserved in `docs/roadmap/progress.json`.
- **Live Supabase Auth Container Daemon Gate**: Docker daemon is unavailable on the local host machine; local PostgreSQL 17 is running on port 5432. All authentication flows are verified against real provider contracts, schemas, and in-memory mock adapters; live Docker Supabase container execution remains a documented acceptance gate.
- **Dependency Advisory Warnings**: Fail-closed advisory audit (`node-forge` and `braces`) remains visible without manufactured approval bypasses.

## Documentation and Git review

- Architecture Decision Record: [ADR-0015: Authentication across web and Android](../decisions/0015-authentication-across-web-and-android.md).
- Roadmap Progress: Updated `docs/roadmap/progress.json` marking Phase 09 as blocked (provisional), setting `nextPhase: null`, and documenting the scheduling decision pending prerequisite physical hardware gates.
- Changelog: Updated `CHANGELOG.md` with Phase 09 accomplishments.
- `git diff --check`: Verified clean.
- Staged paths: Scoped strictly to `packages/contracts`, `apps/web`, `apps/mobile`, ADRs, phase reports, and roadmap documentation.
- Commit target: `feat(auth): add secure web and Android account journeys`.

## Handoff

- **Phase 09 Status:** Provisional implementation delivered and verified.
- **Roadmap Progression State:** Phase 09 delivers the complete authentication and session layer for web and Android. Further roadmap progression to [Phase 10 — Personal workspace and preferences](../roadmap/phases/10-personal-workspace-and-preferences.md) requires resolution of the physical Android TalkBack hardware gates for Phases 04–06 and live container daemon verification for Phase 09.
- **Next Required Action:** Connect a physical Android device to perform TalkBack and gesture verification to unblock Phase 04 and downstream navigation shells, and run a live Supabase Auth container daemon to complete final provider gates before starting Phase 10.
