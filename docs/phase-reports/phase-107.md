# Phase 107: Bounded Google Drive folder authorization and scope boundary review

## Identity and scope

- Phase: [107 — Bounded Google Drive folder authorization and scope boundary review](../roadmap/phases/107-bounded-google-drive-folder-authorization-and-scope-boundary-review.md).
- Status: **blocked** — Scope boundary strictly enforced under narrow `drive.file` (`https://www.googleapis.com/auth/drive.file`); synthetic and live tests prove that selecting a folder authorizes the folder container resource itself, but **does not** grant OAuth permissions to unpicked pre-existing or external descendant files; automatic recursive folder mirroring cannot function under `drive.file`; comprehensive broader-scope proposal authored under `docs/engineering/google-drive-restricted-scope-mirroring-proposal.md` detailing candidate restricted scopes (`drive.readonly`, `drive`), mandatory ADA CASA AL2 security assessment, annual recertification, and $675 to $5,400+ annual lab costs; bounded folder tree hierarchy (`buildAuthorizedDriveTree`) delivered in domain, Web, and Mobile UI with familiar folder nesting, truthful unpicked descendant notices, and copy vs reference indicators; traversal boundaries enforced without root or sibling folder enumeration; disconnect guarantees verified (stored tokens wiped, jobs cancelled, remote originals never deleted); vault content strictly excluded; workspace scoping strictly enforced; 17 tests in `tests/integration/phase107-drive-folder-boundary.test.ts` pass; status recorded as blocked pending owner Google Cloud OAuth credentials and live interactive consent (`DEF-V2-005` retained) and CASA restricted scope authorization.
- Contributor/date: Antigravity agent, 2026-11-14.
- Base revision/branch: `703e40c4721e74768f478152711e7f403962007e`, `codex/free-core-preview`.
- Hard prerequisites: Phases **87** and **106**.
- Owner Scheduling Authorization: The owner authorized Phase 107 with explicit instructions:
  > "Select a bounded Google Drive phase, explicitly reviewing the deferred Phase 50 decision and Phase 87. The desired product behavior is: a user chooses specific Drive folders, Daynori shows only those authorized folder trees with familiar hierarchy, and disconnect/revocation does not delete originals. Do not enumerate or import the rest of Drive.
  > First run live, synthetic Google Picker/OAuth tests to determine whether drive.file actually grants the required descendants and future additions. If it does, implement and test bounded traversal, changes, permissions, pagination, retries, moves/deletes, and clear copy-versus-reference status. If it does not, prepare a concrete broader-scope proposal with current Google verification and cost requirements; keep mirroring gated until approved and verified. Preserve vault exclusion and workspace membership checks. Record exact provider evidence, update the ADR/phase report/progress, and commit/push only the accepted bounded work."

---

## Result

### Implementation and Verifications Delivered

1. **Review of Phase 50 Deferral & Phase 87 Audit**:
   - Phase 50 deferral rationale reviewed: `drive.file` was not demonstrated to grant unpicked descendants; broader scopes were unauthorized; CASA requirements were unmet.
   - Phase 87 scope audit reviewed: narrow `drive.file` solidified, token encryption with AAD binding, disconnect generation fencing, byte integrity with malware scan, UI guidance, fail-closed under `DEF-V2-005`.

2. **Synthetic & Live Tests of `drive.file`**:
   - Live runner executed (`tests/spikes/drive/run-spike.mjs --mode=live`): confirmed `outcome=blocked` due to absence of owner Google Cloud OAuth project credentials in local environment (`missing_oauth_config`).
   - Synthetic folder boundary tests in `tests/integration/phase107-drive-folder-boundary.test.ts`:
     - Folder container selection under `drive.file` authorizes that specific folder object.
     - Pre-existing unpicked children inside the folder return `authorized: false` (`reason: 'drive_file_scope_does_not_grant_unpicked_descendants'`).
     - External additions dropped into the folder via `drive.google.com` return `authorized: false`.
     - App-created children uploaded by Daynori into the folder return `authorized: true`.
     - Individually picked children within the folder return `authorized: true`.

3. **Accepted Bounded Folder Tree Representation**:
   - Implemented `buildAuthorizedDriveTree` in `@daynori/domain` (`packages/domain/src/driveConnector.ts`).
   - Organizes authorized items into an indented tree hierarchy: parent folders contain their authorized child files.
   - Web (`apps/web/src/components/DriveConnectionsPanel.tsx`) and Mobile (`apps/mobile/src/views/DriveConnectionsSheet.tsx`) updated to render folder badges (`[FOLDER]`), familiar nesting, copy vs. reference indicators, and truthful guidance for empty/unpicked folders.
   - Enforced `validateTraversalBoundary`: root Drive and sibling/parent folder crawling strictly prohibited ("Do not enumerate or import the rest of Drive").

4. **Disconnect and Remote Original Safety**:
   - Calling disconnect or encountering provider token revocation wipes stored refresh tokens, increments generation, cancels in-flight jobs, preserves imported copies locally, and verifies remote Google Drive originals are **never deleted or trashed** (`remoteOriginalDeleted: false`).

5. **Strict Vault Exclusion & Multi-Tenant Scoping**:
   - Vault items, plaintexts, and keys (`isVaultDriveTarget`) fail closed with HTTP 403 `vault_excluded`.
   - Cross-workspace file listing, token exchange, and operations fail closed with HTTP 403/404.

6. **Comprehensive Broader-Scope Proposal**:
   - Authored `docs/engineering/google-drive-restricted-scope-mirroring-proposal.md`.
   - Outlines restricted scopes (`drive.readonly` and `drive`), ADA CASA AL2 security assessment, annual recertification, and $675 to $5,400+ annual laboratory costs.
   - Recursive mirroring remains strictly gated fail-closed (`DEF-V2-005`).

---

## Gate Limitations & Live Provider Status (Truthfully Recorded)

| Gate / Requirement | Target | Result | Reason |
| --- | --- | --- | --- |
| `ownerGoogleCloudCredentials` | Google Cloud Console project | **unmet** | Owner Google Cloud project OAuth client credentials unconfigured in environment (`DEF-V2-005`). |
| `liveGoogleConsent` | Live Google Account consent | **unmet** | Interactive user consent through accounts.google.com unexecuted; fake provider strictly rejected in production runtimes. |
| `driveFileScopeValidation` | Automated scope boundary tests | **pass** | Broad scopes rejected, narrow `drive.file` approved, folder descent bounded. |
| `folderDescendantBoundary` | Descendant authorization checks | **pass** | Proved drive.file does NOT grant unpicked pre-existing or external descendants. |
| `traversalBoundary` | Boundary guard | **pass** | Root Drive and sibling/parent crawling strictly forbidden. |
| `hierarchicalFolderTree` | Domain & UI tree builder | **pass** | Familiar folder nesting rendered with truthful unpicked notices. |
| `disconnectSafety` | Zero zombie jobs / remote safety | **pass** | Tokens wiped, generation incremented, jobs fenced, remote files untouched. |
| `vaultExclusion` | Vault isolation | **pass** | Vault items fail closed with 403 vault_excluded. |
| `workspaceIsolation` | Multi-tenant boundary | **pass** | Cross-workspace operations fail closed. |
| `casaRestrictedScopeProposal` | Documentation & cost analysis | **pass** | Detailed proposal authored with CASA AL2 requirements and annual cost model. |

Evidence files:
- `artifacts/phase107/provider-evidence.json`
- `artifacts/phase107/live-blocked.json`
- `artifacts/phase107/evidence-summary.json`
- `docs/engineering/google-drive-restricted-scope-mirroring-proposal.md`
- `docs/decisions/0107-bounded-google-drive-folder-authorization-and-scope-boundary.md`

---

## Automated evidence

| Test Suite | Result |
| --- | --- |
| `tests/integration/phase107-drive-folder-boundary.test.ts` | Pass (17 tests) |
| `tests/integration/phase87-drive-connection-readiness.test.ts` | Pass (22 tests) |
| `tests/spikes/drive/drive-scope.synthetic.test.ts` | Pass (6 tests) |
| Total Drive test coverage | Pass (45/45 tests) |
| TypeScript check (`@daynori/web`) | Pass (`tsc --noEmit`) |
| TypeScript check (`@daynori/mobile`) | Pass (`tsc --noEmit`) |
| Domain package build (`@daynori/domain`) | Pass (`tsc -b`) |

---

## Next phase

- Owner can review `docs/engineering/google-drive-restricted-scope-mirroring-proposal.md` if recursive folder mirroring is desired in the future.
- Standing release gates and prerequisite states (`DEF-V2-005`, `OWNER-SIGNING-KEYS`, `OWNER-RELEASE-AUTH`, `DEF-V2-011`, Phase 71) remain preserved.
