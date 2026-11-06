# ADR-0087: Google Drive connection and scope readiness

- Status: accepted
- Date: 2026-11-06
- Owner/reviewer: Antigravity agent (owner-authorized Phase 87 with explicit scheduling exception).
- Related: [Phase 87](../roadmap/phases/87-google-drive-connection-and-scope-readiness.md), [ADR 0011](0011-google-drive-scope-and-oauth-architecture.md), [ADR 0046](0046-drive-scope-and-folder-access.md), [ADR 0047](0047-drive-selected-file-connector-provisional.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [Phase 48](../phase-reports/phase-48.md), [Phase 49](../phase-reports/phase-49.md), [Phase 50](../phase-reports/phase-50.md), [Phase 75](../phase-reports/phase-75.md), [Phase 77](../phase-reports/phase-77.md), [Phase 81](../phase-reports/phase-81.md), [release-gates.md](../engineering/release-gates.md).
- Supersedes/superseded by: none. Preserves all outstanding prerequisite, security, hardware, and release gates.

## Context & Owner Scheduling Authorization

The project owner explicitly authorized Phase 87 implementation and supported-scope verification before final acceptance of Phases 75 and 81:
> "OWNER SCHEDULING AUTHORIZATION: I authorize Phase 87 implementation and supported-scope verification before final acceptance of Phases 75 and 81. Record this scheduling exception in an ADR and roadmap metadata. Preserve all outstanding prerequisite and release gates. Do not mark blocked phases complete, broaden Google permissions, or enable unverified production capabilities to bypass missing evidence."

Phase 87 conducts an architectural and security audit of the Google Drive integration, validates narrow `drive.file` scope enforcement, solidifies storage and transfer models (`import_copy`, `link_reference`, `upload_to_drive`), implements token encryption at rest with AAD binding, guarantees disconnect cleanly wipes tokens and fences late jobs, integrates byte integrity and malware scanning, delivers user-facing copy vs. reference guidance, documents full Google Cloud configuration, and enforces fail-closed production gates.

## Scope Boundary & Rejection of Broad Permissions

In accordance with [ADR 0046](0046-drive-scope-and-folder-access.md) and [ADR 0047](0047-drive-selected-file-connector-provisional.md), Daynori's Google Drive integration operates under strict architectural boundaries:

1. **Narrow Scope Only**:
   - The single approved requested scope is `https://www.googleapis.com/auth/drive.file`.
   - Standard openid identity claims (`openid email`) are permitted on granted scopes.
   - Any broad scopes (`https://www.googleapis.com/auth/drive`, `https://www.googleapis.com/auth/drive.readonly`, `https://www.googleapis.com/auth/drive.metadata`, `https://www.googleapis.com/auth/drive.photos.readonly`, `https://www.googleapis.com/auth/drive.appdata`) and arbitrary URIs are strictly rejected during authorization initiation and token exchange.

2. **Selected-File Boundary**:
   - Selecting a folder in Google Drive does **not** authorize all pre-existing or future external children.
   - Only explicitly selected files via Google Picker or app-created files in Drive are accessible by the application.
   - Full folder mirroring and broad synchronization scopes remain deferred (preserving Phase 50 deferral).

3. **Vault Strict Exclusion**:
   - Encrypted vault items (`vault`, `vault_item`, `encrypted_vault`) and cryptographic keys are strictly excluded from all Drive operations. Drive connector will never read, link, sync, or upload vault records.

## Storage and Transfer Model

Daynori supports four distinct and transparent file operations:

1. **Provider Reference (`link_reference`)**:
   - Stores only Google Drive provider metadata (provider file ID, name, MIME type, version, checksum) in `app.drive_linked_files`.
   - Consumes zero Daynori storage quota.
   - Access requires an active internet connection.
   - If the remote file is deleted or permissions are revoked in Google Drive, the linked record transitions to `source_unavailable` or `permission_lost`.

2. **Imported Copy (`import_copy`)**:
   - Downloads file bytes from Google Drive directly into Daynori private storage (`app.file_items`).
   - Verifies SHA-256 byte checksum against provider metadata.
   - Executes malware scanning (`PolicyMalwareScanner`); flagged content is quarantined and never marked imported.
   - Client explicitly acknowledges durable local storage via `acknowledge-offline`.
   - Retained in Daynori even if the remote Google Drive original is subsequently deleted or if the user disconnects Google Drive.

3. **App-Created Upload (`upload_to_drive`)**:
   - Uploads an existing local Daynori file to Google Drive.
   - Tracks idempotency keys to ensure retry safety and prevent duplicate remote files on network uncertainty.

4. **Remote File Protection on Disconnect / Unlink**:
   - Disconnecting Google Drive or unlinking a file in Daynori removes local database associations and wipes tokens.
   - Remote originals in Google Drive are **never** trashed or deleted by Daynori disconnect or unlink actions.

## Cryptographic Token Storage & Generation Fencing

1. **AES-256-GCM Token Encryption at Rest**:
   - Refresh tokens are stored exclusively in sealed form in `app.drive_connections.refresh_token_ciphertext`.
   - The encryption key is supplied via `DAYNORI_DRIVE_TOKEN_ENCRYPTION_KEY` (32 bytes base64-encoded) with version tracking (`DAYNORI_DRIVE_TOKEN_KEY_VERSION`).
   - Authenticated Additional Data (AAD) binds the ciphertext to `${workspaceId}|${connectionId}|${accountId}|${keyVersion}`. Any attempt to swap ciphertexts across workspaces, connections, or accounts fails closed at authentication tag verification.

2. **Ephemeral Picker Access Tokens**:
   - Client applications acquire short-lived Google Picker access tokens from `/v1/workspaces/:workspaceId/drive/picker-token`.
   - Picker tokens are returned with `cacheControl: 'no-store'`.
   - Refresh tokens and encryption keys are never leaked to the client.
   - Requests fail closed if the connection is disconnected or unconfigured.

3. **Disconnect Guarantees & Generation Fencing**:
   - Calling `POST /v1/workspaces/:workspaceId/drive/disconnect` atomically sets connection status to `disconnected`, clears `refresh_token_ciphertext` to `NULL`, cancels pending background jobs, and increments `generation`.
   - Late background jobs or token refresh attempts operating under a previous generation detect the generation mismatch via `mayCompleteDriveWork` and are immediately fenced (`status = 'fenced'`), preventing zombie execution or resurrection of disconnected state.

## Fail-Closed Release Gate & Deferred Live Verification

1. **Automated Verification**:
   - 4 test suites with 46 tests pass completely:
     - `tests/integration/phase87-drive-connection-readiness.test.ts` (22 tests)
     - `tests/integration/phase49-drive-connector.test.ts` (8 tests)
     - `tests/security/phase49-drive-connector.test.ts` (10 tests)
     - `tests/spikes/drive/drive-scope.synthetic.test.ts` (6 tests)

2. **Fail-Closed Provider Gate**:
   - `GoogleDriveProvider` fails closed when unconfigured (throws `DriveProviderUnavailableError`).
   - `FakeGoogleDriveProvider` is strictly forbidden in production runtimes (`NODE_ENV === 'production'`).
   - `DAYNORI_DRIVE_PRODUCTION_ENABLED` must be explicitly `'true'` alongside valid client ID and secret to enable the live provider.

3. **Release Gate Closure**:
   - Owner Google Cloud OAuth credentials and live interactive consent are unconfigured in the development workspace.
   - Live Google verification cannot be fabricated. In accordance with project instructions and `release-gates.md`, Phase 87 is recorded as `blocked` under defect `DEF-V2-005` in `docs/roadmap/v2/function-register.json`.
   - Configuration instructions are provided in `docs/engineering/google-drive-oauth-configuration-guide.md` for owner completion.
