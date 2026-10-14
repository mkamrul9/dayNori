# ADR-0015: Authentication across web and Android

- Status: accepted.
- Date: 2026-10-14.
- Owner/reviewer: Security & Client Architecture.
- Related phase and specifications: [Phase 09 Specification](../../docs/roadmap/phases/09-authentication-across-web-and-android.md), [Security & Vault](../../docs/architecture/security-and-vault.md), [Journeys](../../docs/design/journeys.md).

## Context

Daynori requires genuine authentication across its responsive web application and Android mobile shell. The service uses Supabase Auth (GoTrue) as its identity provider. The system must establish robust sign-up, email verification, sign-in, password recovery, session refresh, and sign-out journeys while adhering strictly to Daynori's security requirements:

- Web: HttpOnly/Secure cookies via a same-origin session proxy; zero refresh tokens or secrets in `localStorage`; explicit CSRF double-submit protection; multi-tab session synchronization without secret leakage; `Cache-Control: private, no-store`.
- Mobile (Android): OS-backed secure storage (`expo-secure-store` / Android KeyStore); deep-link callback verification with allowlisted schemes and hosts; PKCE and anti-replay nonce validation; cold-start and warm-start session restoration.
- Session Lifecycle: Immediate cutoff of authenticated transport upon logout or revocation; draft quarantine policy guaranteeing that unsent drafts are never silently lost and never leaked across accounts.

## Options

1. **Client-side Supabase JS SDK with localStorage on Web (Rejected)**:
   - Storing access tokens and refresh tokens in browser `localStorage` or `sessionStorage`.
   - Rejected because tokens in browser storage are vulnerable to Cross-Site Scripting (XSS) extraction, and refresh tokens stored in the browser cannot be protected by `HttpOnly` flags.
2. **Pure Session Token Without Cookie Security (Rejected)**:
   - Passing Bearer tokens via browser JavaScript fetch calls held in global memory without same-origin proxying.
   - Rejected because page refreshes and multi-tab workflows force storage in browser-accessible mechanisms or frequent re-authentication prompts.
3. **Same-Origin Session Layer on Web & OS-Backed Secure Storage on Android with Draft Quarantine (Chosen)**:
   - **Web**: Same-origin Next.js Route Handlers (`/api/auth/*`) proxying to Supabase Auth. Session tokens are stored in `HttpOnly`, `Secure` (production), `SameSite=Lax` cookies. Mutating requests enforce origin validation and double-submit CSRF tokens (`x-csrf-token`). Multi-tab synchronization broadcasts non-credential event markers across `BroadcastChannel`. In-flight requests are aborted on session change.
   - **Android**: Tokens stored exclusively in OS-backed secure storage (`expo-secure-store` utilizing Android KeyStore). Deep link callbacks enforce strict scheme/host allowlists (`daynori://`, `https://app.daynori.com`), anti-replay nonces, and PKCE exchange. Pending protected navigation (e.g., Journal) is preserved and resumed only after verified authentication.
   - **Draft Quarantine**: On logout or account change, unsent drafts are quarantined under the previous user ID. They are hidden from subsequent users and recoverable only when the original user re-authenticates.

## Decision

1. **Initial Authentication Method**:
   - Primary method: Email and Password with email verification confirmation and password recovery links.
   - Fully compatible with local Supabase Auth service (GoTrue) and local Inbucket email catcher.
2. **Web Session Architecture**:
   - `daynori_access_token` and `daynori_refresh_token` are set as `HttpOnly`, `SameSite=Lax`, `Path=/` cookies.
   - Mutating routes (`POST /api/auth/*`) require matching `x-csrf-token` header and valid Origin/Referer headers.
   - Authenticated responses set `Cache-Control: private, no-cache, no-store, must-revalidate`.
   - Multi-tab synchronization uses `BroadcastChannel('daynori_auth_channel')` broadcasting message objects `{ type: 'AUTH_STATE_CHANGE', timestamp }` containing zero credentials or user data.
   - Client-side in-flight requests are bound to an `AbortController` and aborted upon session replacement or logout.
3. **Android Session Architecture**:
   - `SecureStorageAdapter` wraps `expo-secure-store` with encrypted storage.
   - `MobileProviderAuthAdapter` manages login, signup, recovery, and token refresh against Supabase Auth.
   - Deep link callback URLs are validated against `APPROVED_SCHEMES` (`daynori:`) and `APPROVED_HTTPS_HOSTS` (`app.daynori.com`, `daynori.app`).
   - Anti-replay nonces and PKCE state are verified and consumed idempotently.
   - Cold-start (`Linking.getInitialURL`) and warm-start (`Linking.addEventListener('url')`) restore session and resume pending protected destinations.
4. **Draft Quarantine Policy**:
   - When logout or account switching occurs:
     - Unsent drafts (e.g. `createDraft` in search/create sheet or journal editor) are moved to quarantined storage tagged with `{ userId, quarantinedAt, draft }`.
     - Active editing state is cleared.
     - The next account sees an empty draft, preventing cross-account exposure.
     - Upon re-login by the matching user, quarantined drafts are detected and offered for restore or dismissal.
5. **Session Revocation & Transport Cutoff**:
   - Calling `signOut()` immediately deletes local secure storage / cookies, aborts in-flight network requests, and resets application state to unauthenticated.

## Consequences

- Next.js web application proxies all authentication requests through same-origin `/api/auth/*` endpoints.
- Browser JavaScript never reads or stores refresh tokens in `localStorage`.
- Android app builds must link `expo-secure-store`.
- Unsent user drafts are protected against both accidental data loss and cross-user contamination.

## Verification and revisit

- **Verification evidence**:
  - `apps/web/src/auth.test.ts`: Automated tests validating CSRF double-submit rejection, Origin check enforcement, HttpOnly/Secure cookie setting, open redirect rejection, and multi-tab synchronization.
  - `apps/mobile/src/auth.test.ts`: Automated tests validating OS-backed secure storage token lifecycle, provider sign-up/sign-in/recovery, deep link callback validation with redirect allowlist and replay rejection, draft quarantine across account switches, and cold-start restoration.
- **Remaining acceptance gates**:
  - Host execution against live Supabase Auth container daemon (GoTrue) is recorded as a documented acceptance gate pending Docker Desktop daemon availability.
  - Physical Android TalkBack verification remains pending physical hardware.
- **Revisit triggers**: Introduction of WebAuthn / Passkeys (Phase 48), multi-factor authentication (MFA) enforcement (Phase 49), or OAuth third-party providers (Google, Apple).
