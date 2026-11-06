# Phase 87: Google Drive connection and scope readiness

## Identity and scope

- Phase: [87 — Google Drive connection and scope readiness](../roadmap/phases/87-google-drive-connection-and-scope-readiness.md).
- Status: **blocked** — Scope boundary strictly enforced to narrow `drive.file` (`https://www.googleapis.com/auth/drive.file`); folder selection does not authorize pre-existing or external unpicked descendants; vault content strictly excluded; storage and transfer models solidified (`import_copy` with SHA-256 integrity and malware quarantine, `link_reference`, and `upload_to_drive` with idempotency tracking); token encryption at rest with AES-256-GCM and AAD binding verified; ephemeral Picker tokens protected from leakage (`cacheControl: 'no-store'`); disconnect guarantees verified (stored tokens wiped, pending jobs cancelled, remote originals untouched, imported copies retained in app); generation fencing prevents stale job resurrection; Web and Mobile UI updated with copy vs. reference explanatory guidance and vault exclusion notices; configuration guide prepared under `docs/engineering/google-drive-oauth-configuration-guide.md`; 4 test suites with 46 tests passing; production Google provider fails closed pending owner Google Cloud OAuth project credentials and live interactive consent (`DEF-V2-005` retained).
- Contributor/date: Antigravity agent, 2026-11-06.
- Base revision/branch: `8383e393414623872fa3693001e723754f15cdf7`, `codex/free-core-preview`.
- Hard prerequisites: Phases **48**, **49**, and **50** (Drive spike, connector, and deferral).
- Owner Scheduling Authorization: The owner authorized Phase 87 implementation and supported-scope verification before final acceptance of Phases 75 and 81 ([ADR 0087](../decisions/0087-google-drive-connection-and-scope-readiness.md)). Phase 87 recorded as `blocked` due to unmet owner Google Cloud OAuth credentials and live interactive consent. Outstanding checks for Phases 71, 75, 80, 81, 84, 85, 86, and 99 remain preserved. Standing push authorized under ADR 0074. No unverified production capability or fake live consent claimed.

## Result

### Implementation and Verifications Delivered

1. **Narrow Scope Boundary & Rejection of Broad Permissions**:
   - Strictly enforced `https://www.googleapis.com/auth/drive.file` as the only approved requested Drive scope.
   - Broad scopes (`drive`, `drive.readonly`, `drive.metadata`, `drive.appdata`, `drive.photos.readonly`) and lookalike URIs are rejected during request and grant validation.
   - Folder selection boundary: confirmed that selecting a folder does NOT grant access to unpicked pre-existing or external descendant files. Full folder mirroring remains deferred per Phase 50.
   - Encrypted vault items and keys are strictly excluded (`isVaultDriveTarget`).

2. **Storage and Transfer Models Solidified**:
   - **Imported Copy (`import_copy`)**: Verified byte transfer integrity with SHA-256 checksums, integrated `PolicyMalwareScanner` (quarantines malicious payloads, e.g. EICAR), and durable offline caching upon client acknowledgment. Retained in Daynori on remote deletion or disconnect.
   - **Provider Reference (`link_reference`)**: Verified zero Daynori storage consumption, requiring online access and transitioning to `source_unavailable` or `permission_lost` on remote changes.
   - **App-Created Upload (`upload_to_drive`)**: Verified idempotency tracking preventing duplicate remote files on retry.
   - **Remote Original Protection**: Confirmed disconnect and unlinking never delete or trash remote Google Drive files.

3. **Cryptographic Token Storage & Generation Fencing**:
   - Sealed refresh tokens at rest using AES-256-GCM authenticated encryption with AAD bound to `workspaceId`, `connectionId`, `accountId`, and key version. Mismatched AAD fails closed.
   - Google Picker access tokens are short-lived, returned with `cacheControl: 'no-store'`, and never leak refresh tokens or encryption keys.
   - Disconnect atomically wipes stored tokens, increments generation, and cancels pending jobs.
   - Late background jobs or token refreshes operating under older generations are fenced (`status = 'fenced'`).

4. **Web and Mobile UI Enhancements**:
   - `apps/web/src/components/DriveConnectionsPanel.tsx`: Added copy vs. reference explanatory card, vault exclusion notice, status badges, reconnect button for revoked state, and unlinking controls.
   - `apps/mobile/src/views/DriveConnectionsSheet.tsx`: Added supported modes box, vault disclaimer, Custom Tabs browser guidance, file inventory, and unlinking controls.

5. **Google Cloud Configuration Guide**:
   - Authored `docs/engineering/google-drive-oauth-configuration-guide.md` with step-by-step setup for Google Cloud project, OAuth consent screen, Web and Android OAuth client credentials, environment variable specifications, and error troubleshooting.

### Gate Limitations & Live Provider Status (Truthfully Recorded)

| Gate / Requirement | Target | Result | Reason |
| --- | --- | --- | --- |
| `ownerGoogleCloudCredentials` | Google Cloud Console project | **unmet** | Owner Google Cloud project OAuth client credentials (`DAYNORI_DRIVE_OAUTH_CLIENT_ID`/`SECRET`) unconfigured in environment. |
| `liveGoogleConsent` | Live Google Account consent | **unmet** | Interactive user consent through accounts.google.com unexecuted; fake provider strictly rejected in production runtimes. |
| `driveFileScopeValidation` | Automated scope boundary tests | **pass** | Broad scopes rejected, narrow `drive.file` approved, folder descent bounded. |
| `tokenCryptoAtRest` | AES-256-GCM AAD binding | **pass** | Ciphertext sealed, AAD verified, tampering detected, fail-closed on key absence. |
| `disconnectFencing` | Zero zombie jobs | **pass** | Tokens wiped, generation incremented, late jobs fenced, remote files untouched. |

Production Google Drive provider remains **disabled fail-closed**. `DEF-V2-005` is retained in `docs/roadmap/v2/function-register.json`.

Evidence files:
- `artifacts/phase87/evidence-summary.json`
- `artifacts/phase87/manual-ui-evidence.json`
- `artifacts/phase87/phase87-ui-evidence.json`
- `docs/engineering/google-drive-oauth-configuration-guide.md`
- `docs/decisions/0087-google-drive-connection-and-scope-readiness.md`

## Automated evidence

| Test Suite | Result |
| --- | --- |
| `tests/integration/phase87-drive-connection-readiness.test.ts` | Pass (22 tests) |
| `tests/integration/phase49-drive-connector.test.ts` | Pass (8 tests) |
| `tests/security/phase49-drive-connector.test.ts` | Pass (10 tests) |
| `tests/spikes/drive/drive-scope.synthetic.test.ts` | Pass (6 tests) |
| Total Drive test coverage | Pass (46/46 tests) |
| TypeScript check (`@daynori/web`) | Pass (`tsc --noEmit`) |
| TypeScript check (`@daynori/mobile`) | Pass (`tsc --noEmit`) |
| Contracts package build (`@daynori/contracts`) | Pass (`tsc -b`) |

## Next phase

- Owner can follow `docs/engineering/google-drive-oauth-configuration-guide.md` to configure Google Cloud OAuth credentials and execute live consent.
- With Phase 87 audit and supported-scope verification complete, the next phase in sequence is Phase 88 (Rooms sync & offline queue proof).
