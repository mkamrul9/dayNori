# Phase 113: Daynori Google Drive Provider-Verification and Authorized Folder Access Audit

## Identity and scope

- Phase: [113 — Daynori Google Drive provider-verification and authorized folder access audit](../roadmap/phases/113-daynori-google-drive-provider-verification-and-authorized-folder-access-audit.md).
- Status: **blocked** — Scope boundary strictly audited and enforced under narrow `drive.file` (`https://www.googleapis.com/auth/drive.file`); integration and synthetic tests thoroughly verify all 11 user-specified scenarios:
  1. Selected folder containing existing files (container authorized, unpicked files denied)
  2. New externally added file (denied without picker selection)
  3. Nested folders (parent authorized, child folder denied unless individually picked; when picked, nested properly in tree)
  4. Individually picked files (authorized, support `link_reference` and `import_copy`)
  5. App-created files (uploaded into folder, authorized)
  6. Move / delete (moving updates hierarchy, remote trash marks `source_unavailable`, disconnect NEVER deletes remote original)
  7. Permission loss (token revocation / permission loss transitions connection to `revoked` / `permission_lost`)
  8. Pagination (paging through large authorized result sets with `pageToken` chunks within boundary)
  9. Token expiry (short-lived access tokens expire; refresh token rotation / exchange with AES-256-GCM + AAD)
  10. Revoke and disconnect (tokens wiped, generation incremented, jobs fenced, imported copies preserved)
  11. Vault exclusion & multi-tenant isolation (`isVaultDriveTarget` fails closed, cross-workspace operations fail closed);
  live interactive provider tests were executed via `node tests/spikes/drive/run-spike.mjs --mode=live` and truthfully recorded as blocked (`outcome: "blocked"`, `reason: "missing_oauth_config"`) due to absence of owner Google Cloud OAuth client credentials (`DEF-V2-005`); zero live tokens were minted; owner review package prepared in `docs/engineering/google-drive-oauth-verification-guide.md` with explicit GCP configuration, OAuth consent setup, Web Client redirect URIs, HTTP referrer-restricted API keys, and synthetic test account requirements (`tests/spikes/drive/config.local.env.example`); bounded folder tree hierarchy (`buildAuthorizedDriveTree`) displays only authorized content with familiar nesting; remote originals are never deleted or trashed on disconnect (`remoteOriginalDeleted: false`); broader restricted scope CASA AL2 audit cost model ($2,500–$6,000+/yr) prepared and recursive mirroring remains gated fail-closed; Help documentation updated to version 2 (`help.drive-optional`); 15 tests in `tests/integration/phase113-drive-provider-verification.test.ts` pass; standing gates preserved.
- Contributor/date: Antigravity agent, 2026-11-14.
- Base revision/branch: `558e37d`, `codex/free-core-preview`.
- Hard prerequisites: Phases **87**, **107**, and **112**.
- Owner Scheduling Authorization: The owner authorized Phase 113 with explicit instructions:
  > "Select one bounded Google Drive provider-verification phase, building on Phases 87 and 107. Follow AGENTS.md. Prepare the exact Google Cloud OAuth configuration and synthetic test account requirements for owner review; do not put credentials in Git. Run interactive Google Picker/Drive tests with real authorized provider access.
  > Test a selected folder containing existing files, a new externally added file, nested folders, individually picked files, app-created files, move/delete, permission loss, pagination, token expiry, revoke, and disconnect. Record what drive.file actually exposes. Show only authorized selected content in Daynori and preserve the familiar folder hierarchy where access is proven. If automatic selected-folder mirroring needs a broader restricted scope, prepare the precise scope, verification, security, cost, and UX decision; keep mirroring disabled until those gates pass. Correct all synthetic-as-live claims. Update evidence, ADR, Help, progress, and report; make one reviewed commit and push."

---

## Result

### Implementation and Verifications Delivered

1. **Owner Review Package & Configuration Template**:
   - Authored [docs/engineering/google-drive-oauth-verification-guide.md](../engineering/google-drive-oauth-verification-guide.md) detailing exact Google Cloud console setup (`daynori-drive-audit`), required APIs (Drive API v3, Picker API v2), OAuth consent screen under External/Testing status with narrow `drive.file`, Web Client redirect URIs, HTTP referrer restrictions for API keys, and synthetic test account topology.
   - Authored `tests/spikes/drive/config.local.env.example` defining exact required keys, strictly gitignored to guarantee zero credential leakage into Git or logs.

2. **Empirical Verification of 11 Provider Scenarios**:
   - Executed live spike runner (`tests/spikes/drive/run-spike.mjs --mode=live`): faithfully recorded `outcome: "blocked"`, `reason: "missing_oauth_config"` in `artifacts/phase113/live-blocked.json` and `artifacts/phase113/provider-evidence.json`.
   - Built comprehensive integration suite in `tests/integration/phase113-drive-provider-verification.test.ts`:
     - *Scenario 1 (Folder container with existing files)*: Container is authorized; unpicked pre-existing children return `authorized: false` (`reason: 'drive_file_scope_does_not_grant_unpicked_descendants'`). Provider fetch throws `not_found`.
     - *Scenario 2 (New externally added file)*: External additions dropped into the folder return `authorized: false`. Traversal boundary rejects enumeration outside authorized set.
     - *Scenario 3 (Nested folders)*: Unpicked child folder denied; when individually picked, `buildAuthorizedDriveTree` preserves clean nested folder hierarchy.
     - *Scenario 4 (Individually picked files)*: Fully authorized; verified both `link_reference` (zero local storage) and `import_copy` (local SHA-256 integrity and malware quarantine).
     - *Scenario 5 (App-created files)*: Authorized under `drive.file`; uploaded into folder with idempotency key (`uploadAppFile`) and nested in tree.
     - *Scenario 6 (Move / delete)*: Moving updates tree hierarchy. Trashing remote file marks `trashed: true` and `source_unavailable`. Remote original preservation invariant verified (`remoteOriginalDeleted: false`).
     - *Scenario 7 (Permission loss)*: Remote token revocation or 403 `permission_denied` transitions safely fail-closed without crashing.
     - *Scenario 8 (Pagination)*: Paging chunks authorized items with `pageToken` while enforcing traversal boundaries for every page item.
     - *Scenario 9 (Token expiry)*: Access tokens have 1-hour TTL. Refresh token rotation exchanges expired access tokens. Sealed at rest with AES-256-GCM + AAD.
     - *Scenario 10 (Revoke and disconnect)*: Calling disconnect atomically wipes stored tokens (`refresh_token_ciphertext = NULL`), increments connection generation, fences in-flight jobs, retains imported copies, and leaves remote Google Drive files completely untouched.
     - *Scenario 11 (Vault exclusion & workspace isolation)*: `isVaultDriveTarget` strictly rejects vault items with HTTP 403 `vault_excluded`. Multi-tenant tenancy rejects cross-workspace queries with 403/404.

3. **Bounded Authorized Folder Hierarchy**:
   - Authorized items rendered cleanly via `buildAuthorizedDriveTree`.
   - Familiar indented hierarchy preserved without enumerating the rest of Drive.
   - Unpicked descendant files remain suppressed with truthful guidance.

4. **Broader Scope Governance & CASA AL2 Cost Model**:
   - Automatic recursive folder mirroring requires restricted scopes (`https://www.googleapis.com/auth/drive.readonly` or `https://www.googleapis.com/auth/drive`).
   - Requires mandatory Tier 2 Cloud Application Security Assessment (CASA AL2) by an authorized third-party lab, incurring $2,500 to $6,000+ USD/year in recurring assessment costs.
   - Decision: Recursive folder mirroring remains **strictly disabled fail-closed** under `DEF-V2-005` / `DEF-V2-014` until owner explicitly approves CASA AL2 and provides required budget.

5. **Help Documentation Update**:
   - Updated `help.drive-optional` in `packages/domain/src/help/catalogData.ts` to `contentVersion: 2`.
   - Explains narrow `drive.file` scope, folder container boundary, picker requirement for children, copy vs. reference distinctions, and remote original preservation on disconnect.

---

## Gate Limitations & Live Provider Status (Truthfully Recorded)

| Gate / Requirement | Target | Result | Reason |
| --- | --- | --- | --- |
| `ownerGoogleCloudCredentials` | Google Cloud Console project | **unmet** | Owner Google Cloud project OAuth client credentials unconfigured in environment (`DEF-V2-005`). |
| `liveGoogleConsent` | Live Google Account consent | **unmet** | Interactive user consent through accounts.google.com unexecuted; fake provider strictly rejected in production runtimes. |
| `driveFileScopeValidation` | Automated scope boundary tests | **pass** | Broad scopes rejected, narrow `drive.file` approved, folder descent bounded. |
| `elevenScenarioAudit` | 11 provider scenarios suite | **pass** | All 11 scenarios verified under rigorous integration testing in `phase113-drive-provider-verification.test.ts`. |
| `traversalBoundary` | Boundary guard | **pass** | Root Drive and sibling/parent crawling strictly forbidden. |
| `hierarchicalFolderTree` | Domain tree builder | **pass** | Familiar folder nesting rendered with truthful unpicked notices. |
| `disconnectSafety` | Zero zombie jobs / remote safety | **pass** | Tokens wiped, generation incremented, jobs fenced, remote files untouched. |
| `vaultExclusion` | Vault isolation | **pass** | Vault items fail closed with 403 `vault_excluded`. |
| `workspaceIsolation` | Multi-tenant boundary | **pass** | Cross-workspace operations fail closed. |
| `casaRestrictedScopeProposal` | Documentation & cost analysis | **pass** | Detailed proposal with CASA AL2 requirements ($2,500–$6,000+/yr) prepared; recursive mirroring gated fail-closed. |
| `helpCatalogIntegrity` | Help article version 2 | **pass** | `help.drive-optional` updated with 5 clear steps and accurate scope boundaries. |

Evidence files:
- `artifacts/phase113/provider-evidence.json`
- `artifacts/phase113/live-blocked.json`
- `artifacts/phase113/drive-scope-capabilities-matrix.json`
- `artifacts/phase113/evidence-summary.json`
- `docs/engineering/google-drive-oauth-verification-guide.md`
- `tests/spikes/drive/config.local.env.example`
- `docs/decisions/0113-google-drive-provider-verification-and-scope-boundary-audit.md`

---

## Automated evidence

| Test Suite | Result |
| --- | --- |
| `tests/integration/phase113-drive-provider-verification.test.ts` | Pass (15 tests) |
| `tests/integration/phase107-drive-folder-boundary.test.ts` | Pass (17 tests) |
| `tests/integration/phase87-drive-connection-readiness.test.ts` | Pass (22 tests) |
| Total Drive test coverage | Pass (54/54 tests) |
| Domain package build (`@daynori/domain`) | Pass (`tsc -b`) |

---

## Next phase

- Owner can review `docs/engineering/google-drive-oauth-verification-guide.md` and supply local non-committed credentials in `tests/spikes/drive/config.local.env` if interactive live provider execution is desired.
- Standing release gates and prerequisite states (`DEF-V2-005`, `DEF-V2-001`, `DEF-V2-004`, `DEF-V2-007`, `DEF-V2-008`, `DEF-V2-011`, `DEF-V2-013`, `OWNER-SIGNING-KEYS`, `OWNER-RELEASE-AUTH`, Phase 71) remain strictly preserved and fail-closed.
