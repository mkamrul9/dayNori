# Security, privacy and vault

Status: threat model and release requirements. Vault cryptographic details require a reviewed implementation ADR before the vault phase ships.

## Data classes and trust boundaries

Ordinary personal content is private through server authorization, transport protection and managed storage controls. It is readable by the authorized backend for search, export, scanning and user-consented AI. Do not market it as end-to-end encrypted.

Vault content is a separate client-encrypted security scope. The backend stores opaque ciphertext and minimum routing/version metadata. Titles, folder labels, file names, bodies and attachment previews remain encrypted. Server-visible leakage includes account association, object sizes, revision counts and access timing; do not claim zero knowledge of all activity.

This boundary protects stored content from a backend/database reader. It does not make a compromised client distribution harmless: malicious served web code or an app update could capture keys after the user unlocks. Protect deployment/signing, dependency integrity and web execution accordingly. Authenticated encryption detects changed ciphertext, but server withholding/rollback detection needs a trusted client checkpoint/version design; cover fresh-device recovery and rollback in the vault review rather than claim complete protection by encryption alone.

Clients, API, job worker, database, object storage, Auth, push transports, optional Drive and optional AI providers are distinct trust boundaries. Authenticate and authorize at each boundary; a signed URL is a bearer capability, and a push token is an address rather than proof of identity.

## Server isolation

1. Verify the Supabase access token's signature, issuer, audience, expiry and intended use with a maintained library/JWKS configuration. Reject anonymous/service/administrative tokens as user sessions. Support signing-key cache invalidation during incidents.
2. Derive actor identity from the verified token. Never trust `userId`, role or membership in request bodies. Check active account/device and membership for every operation.
3. Domain tables live in a non-exposed application schema. Runtime API connections use a dedicated non-owner, non-`BYPASSRLS` role with only required grants. Migration and administrative credentials are separate.
4. Set verified identity context transaction-locally, apply RLS to tenant tables and `FORCE ROW LEVEL SECURITY` where appropriate, and use tenant-scoped repository predicates plus composite tenant foreign keys. Reset context through transaction scoping; test connection-pool reuse across users. Identity context is set only by the trusted API, never forwarded from arbitrary client claims.
5. RLS membership helpers must avoid recursive policies. If a minimal security-definer helper is necessary, pin its `search_path`, limit its returned information, check its subject/scope, revoke broad execution, and test it under runtime/anon roles. Do not expose owner-executed views/functions that bypass policies.
6. Worker jobs use narrowly granted module roles where possible. Exceptional administrative actions run in isolated handlers and must name tenant scope and audit reason; the request path must not use an unrestricted service credential for convenience.

Supabase documents that secret/service roles can bypass RLS and table owners may bypass policies; merely enabling RLS does not prove the API uses it. [RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security), [restricted custom roles](https://supabase.com/docs/guides/troubleshooting/custom-role-inherits-privileges-that-were-not-explicitly-granted-ddaa1c). Facts reviewed 2026-10-13; validate actual grants and policy behavior in the foundation phase.

For urgent logout/deletion, the API checks disabled accounts and revoked device/session state; a locally verified JWT may otherwise remain valid until expiry. Document this interval and prove revocation on API, sync and new signing requests. Credentials, server database URLs, provider refresh tokens and secret keys never enter browser/mobile bundles or exports.

## Web and mobile protection

- Web uses Secure/HttpOnly session cookies through a same-origin session layer, explicit CSRF protection on writes, origin checks, a restrictive CSP, safe text rendering, and bounded redirects. Do not persist refresh tokens in localStorage. Cross-site OAuth callbacks use validated state and PKCE where the platform flow requires it.
- Mobile stores session secrets in OS-backed secure storage, not AsyncStorage or logs. The ordinary mobile cache uses encrypted SQLite after physical-device/restart/upgrade validation. Encryption does not protect a compromised unlocked app process.
- Browser offline cache is ordinary private data on that device and is not guaranteed confidential against same-origin injected script or an unlocked browser profile. Offer a trusted-device choice, bounded attachment cache and clear local data action. Vault plaintext is memory-only on web.
- Lock vault on background/idle according to a documented user setting; initially default to immediate background lock and a short foreground idle period. Clear decrypted caches, clipboard where controllable, search buffers, recording buffers and rendered previews on lock. Prevent sensitive screen thumbnails/screenshots where the platform permits, without claiming protection against a second camera.
- Explicit permission prompts appear when microphone, biometrics, notifications or a provider connection is used. Avoid requesting every permission at onboarding.

Expo SecureStore stores small secrets using platform protection; it is not a bulk content store. Its documentation warns that uninstall behavior differs by platform and biometric enrollment changes can invalidate authenticated secrets. Recovery must not depend on those secrets surviving. [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/). Expo also supports SQLCipher through native builds; prove the exact pinned configuration before accepting private offline data. [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/). Reviewed 2026-10-13.

## Vault encryption and unlock contract

The PIN/biometric screen is an access gate. It is not evidence of encryption. The release must have both encrypted storage and a tested key lifecycle. See [ADR-0043: Vault Cryptography, Key Management, and Recovery Proof](../decisions/0043-vault-cryptography-and-recovery-proof.md), the [security review packet](../engineering/vault-security-review-packet.md), and [attachment encryption evaluation](vault-attachment-encryption-evaluation.md).

- Generate a random 256-bit vault root key (VRK) on the client. Use AES-256-GCM (NIST SP 800-38D) with an explicit envelope profile: exactly 32-byte keys, unique 96-bit (12-byte) nonces, 128-bit (16-byte) tags, strict encodings, and positive integer versions. Random per-record/file DEKs are envelope-wrapped under the VRK with explicit wrap purposes. Envelopes bind AAD containing `workspaceId`, `itemId`, `itemType`, `schemaVersion`, and `keyVersion` to prevent cross-item relocation; AAD alone does **not** prevent replay of an older valid version of the same item — freshness/checkpoint design is required.
- Portable vault recovery uses a separate strong vault passphrase and a high-entropy recovery key (68-character hex string with embedded 4-character SHA-256 checksum) to wrap the root key. The checksum detects transcription errors only; it does not authenticate a recovery package. Use memory-hard Argon2id (RFC 9106) with bounded parameters (candidate production: 64 MB memory, 3 passes, exact 32-byte output; enforced bounds: 16 MB–256 MB memory, 2–10 passes, salt 16–64 bytes). Do not silently downgrade KDF strength. Low-cost RFC reference-vector parameters stay isolated from application policy.
- A short app PIN (4–6 digits) must never be the sole encryption key for a server-synced envelope. Mobile quick unlock requires an OS-authentication-bound key envelope (Android Keystore `MasterKey` requiring biometric authentication for key release). Any biometric enrollment change or hardware lockout forces fallback to the strong vault passphrase; a cosmetic boolean gate is strictly prohibited.
- Web uses passphrase unlock, holds decrypted keys only in memory, and stores ciphertext offline in IndexedDB. Plaintext is never written to local storage. Client-side web cryptography cannot defend against compromised delivered code or same-origin XSS; memory zeroization is not guaranteed in JavaScript engines.
- Auth password reset restores account access only; it cannot recover or reset the vault. If both passphrase and recovery key are lost, vault content is permanently unrecoverable.
- Rewrapping the same VRK under a new recovery secret does **not** invalidate an attacker’s saved old envelope and old secret. Invalidation requires VRK rotation and re-encryption of dependent content. Device revocation does not erase previously obtained keys or plaintext. Key upgrades must be versioned and resumable.
- Large attachments must use a maintained, reviewed streaming/chunked format (see attachment evaluation). Homegrown “chunk index + final flag” designs are not authorized.
- Node WebCrypto ↔ Node `createCipheriv` tests are wire-format evidence only. Browser Edge-headless and Android-class JVM candidate harnesses have been executed locally; **physical Android device** evidence and independent qualified review remain required. AES-GCM known-answer fixtures used in tests are McGrew/Viega GCM Appendix B Cases 13–14 (not SP 800-38D appendix cases). Argon2id candidate parameters raise offline guessing cost relative to weak hashes but are **not** claimed to prevent cost-effective GPU/ASIC attacks without qualified review. Production vault implementation remains **BLOCKED**. Phase 45 preparation may document designs and synthetic fixtures only while blocked — see [vault-records-and-transfer-preparation.md](vault-records-and-transfer-preparation.md).

Expo LocalAuthentication exposes platform biometric prompts, including Android strength choices. Test strong biometric unlock on real supported hardware and handle cancel/unavailable/lockout separately. [LocalAuthentication](https://docs.expo.dev/versions/latest/sdk/local-authentication/). Reviewed 2026-10-13.

Phase 46 provisional Android unlock lifecycle (local synthetic harness) is documented in [ADR 0044](../decisions/0044-android-vault-unlock-lifecycle-provisional.md). It does **not** enable production vault for real users while Phase 44/45 gates remain unmet.

The initial vault provides create/read/edit/trash for supported encrypted records and encrypted folder create/rename/move/order, plus file attachment capture. An unlocked client validates and encrypts content/labels before persistence or sync; locked views display only generic routing state. Ordinary folder and attachment links cannot cross into vault scope. Creating an encrypted copy uses new vault identities and file keys rather than changing a normal file row's security flag.

Move-to-vault is a deliberate resumable client workflow: show source/reference consequences, encrypt new vault records and attachment copies, verify decryption and acknowledged sync, then purge the ordinary payload, normal search/AI indexes, previews, local plaintext cache and ordinary object versions through their lifecycle jobs. Do not delete a binary still referenced by another ordinary item; resolve those references first or require explicit acknowledgment that an ordinary copy remains. Recovery/retry must preserve at least one verified copy until encrypted acceptance is proven, and cannot report a finished move while ordinary cleanup remains pending.

Disclose that ordinary historical backups may retain the earlier form until expiry. Prior shared-room/user exports, external downloads and content already sent to AI providers cannot be retroactively made secret by this move; purge app-controlled derived copies where possible but never claim recall of those prior exposures. Move-out requires an unlocked user, destination confirmation and an audited decrypt/re-upload action.

Vault data is excluded from server search, analytics content, notification text, AI retrieval/transcription, room sharing, Drive mirroring and server document rendering. A later explicit encrypted export is possible; unlocked plaintext export requires a clear separate confirmation and local generation.

## Object access and file ingestion

All user binary buckets remain private. The API authorizes a file row, then issues a provider-expiring capability for a server-generated immutable key; the actual upload expiry is returned explicitly. Object paths do not encode names or email addresses. Storage rules deny public enumeration and cross-workspace access; test direct storage endpoints as well as API routes. Read links use the short lifetime below; upload capabilities follow the separate [provider-specific workflow](api-conventions.md).

Downloads use authenticated access or short signed URLs (initial maximum five minutes; reduce for sensitive contexts). Signed URLs can outlive session/key revocation until expiration, so do not promise immediate recall of a link. Log/redact URL query tokens, avoid referrer leakage, and keep them out of analytics/history where possible. [Private bucket controls](https://supabase.com/docs/guides/storage/buckets/fundamentals), [signed URL lifetime](https://supabase.com/docs/guides/storage/serving/downloads). Reviewed 2026-10-13.

Ordinary uploads reserve quota before issuance, limit bytes/MIME at provider and application layers, use a quarantined state, verify actual signatures, and scan before normal viewing or sharing. Initial allowed classes: images, PDF, supported office documents and supported audio. Treat SVG/HTML/macros/embedded scripts as active content; reject or serve safely without execution. Preview in an isolated renderer with resource/time limits. Remote fetch by URL is excluded initially to avoid SSRF. Vault ciphertext cannot be server-scanned; UI and export flows must explain that constraint and avoid unsafe plaintext execution after unlock.

## Threats and release evidence

- Another tenant guessing IDs: two-user negative tests for API, SQL/RLS, search, cursor, upload/finalize/download, export and future room channels.
- Lost/stolen device: local encryption/key-gated vault tests, lock transitions, biometric enrollment change, restart and logout. Rooted/jailbroken devices and a compromised unlocked process remain outside confidentiality guarantees.
- XSS or malicious rich content: constrained schemas, sanitizer/renderer tests, CSP, isolated document previews and no runtime user code.
- Compromised provider/backend: no vault plaintext/keys on server; provider tokens encrypted under separately controlled server secrets; restricted roles and key rotation drills. Ordinary data remains within backend trust.
- Low-entropy PIN guessing: rate limit local and server-assisted unlock where applicable, do not create cloud PIN-verifiable key wraps, require portable recovery, test lockout without destroying irreplaceable keys.
- Malicious files or abusive rooms: upload quota/scanning and later block/report/moderation workflows before public rooms launch.
- Prompt injection: AI must not treat notes/files/chat as instructions authorizing data exposure or tool actions; no cross-user retrieval and no vault input.

## Privacy lifecycle

Collect minimal metadata; logs contain operation IDs, tenant-safe correlation, timings and bounded error codes, never bodies, access tokens, financial values, audio or decrypted vault data. Analytics are optional and content-free; define retention before release. Explicitly record consent for AI, transcript generation and Drive scopes, with a revoke action.

Export includes ordinary content, hierarchy, relations, file manifest and original binaries in documented portable formats; vault exports remain encrypted unless the unlocked client intentionally produces plaintext. Account deletion cancels jobs, reminders, provider connections, AI artifacts and push registrations, then purges active content and objects. Backups age out on the published schedule; document this rather than promising instant erasure from all historical copies. Complete a delete/restore drill before public signup.
