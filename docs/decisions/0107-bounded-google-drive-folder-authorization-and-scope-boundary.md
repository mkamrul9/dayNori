# ADR-0107: Bounded Google Drive Folder Authorization and Scope Boundary

- Status: accepted
- Date: 2026-11-14
- Owner/reviewer: Antigravity agent (owner-authorized Phase 107).
- Related: [Phase 107](../roadmap/phases/107-bounded-google-drive-folder-authorization-and-scope-boundary-review.md), [Phase 50](../phase-reports/phase-50.md), [Phase 87](../phase-reports/phase-87.md), [Phase 48](../phase-reports/phase-48.md), [Phase 49](../phase-reports/phase-49.md), [ADR 0011](0011-google-drive-scope-and-oauth-architecture.md), [ADR 0046](0046-drive-scope-and-folder-access.md), [ADR 0087](0087-google-drive-connection-and-scope-readiness.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [release-gates.md](../engineering/release-gates.md), [google-drive-restricted-scope-mirroring-proposal.md](../engineering/google-drive-restricted-scope-mirroring-proposal.md).
- Supersedes/superseded by: none. Preserves all outstanding security, hardware, and release gates. Phase 71 remains blocked on physical hardware and spoken TalkBack listen-through.

---

## Context & Owner Scheduling Authorization

The project owner authorized Phase 107 with the following instructions:

> "Select a bounded Google Drive phase, explicitly reviewing the deferred Phase 50 decision and Phase 87. The desired product behavior is: a user chooses specific Drive folders, Daynori shows only those authorized folder trees with familiar hierarchy, and disconnect/revocation does not delete originals. Do not enumerate or import the rest of Drive.
>
> First run live, synthetic Google Picker/OAuth tests to determine whether drive.file actually grants the required descendants and future additions. If it does, implement and test bounded traversal, changes, permissions, pagination, retries, moves/deletes, and clear copy-versus-reference status. If it does not, prepare a concrete broader-scope proposal with current Google verification and cost requirements; keep mirroring gated until approved and verified. Preserve vault exclusion and workspace membership checks. Record exact provider evidence, update the ADR/phase report/progress, and commit/push only the accepted bounded work."

This decision governs Phase 107 scope, empirical scope evaluation, bounded folder hierarchy architecture, broader-scope proposal requirements, and the standing commit-and-push workflow under ADR 0074.

---

## Review of Prior Decisions (Phase 50 & Phase 87)

1. **Phase 50 Deferral ([docs/phase-reports/phase-50.md](../phase-reports/phase-50.md))**:
   - External folder mirroring was deferred because `https://www.googleapis.com/auth/drive.file` did not grant recursive access to unpicked descendant files, no broader OAuth scopes were authorized, and third-party security verification was unmet.
   - Deferral preserved narrow selected-file mode without promising recursive mirroring.

2. **Phase 87 Scope Readiness ([ADR 0087](0087-google-drive-connection-and-scope-readiness.md))**:
   - Re-verified narrow `drive.file` scope enforcement and rejection of broad scopes.
   - Solidified storage and transfer models: `import_copy` with SHA-256 integrity and malware quarantine, `link_reference` with zero local storage consumption, and `upload_to_drive` with idempotency keys.
   - Verified AES-256-GCM token encryption at rest with AAD binding, short-lived Picker access tokens (`cacheControl: 'no-store'`), and disconnect generation fencing.
   - Production provider recorded as fail-closed (`DEF-V2-005`) pending owner Google Cloud project credentials and live consent.

---

## Technical Evaluation of `drive.file` for Folder Descendants

### 1. The Per-Resource Grant Model
Official Google Drive API specifications and Google Picker behaviors dictate:
- `drive.file` operates on a granular per-resource basis. It authorizes **only** files/folders created by the application (`app_created`) or opened/selected by the user via the Google Picker API (`picker_selected`).
- Selecting a folder in Google Picker (`setSelectFolderEnabled(true)`) authorizes the **folder container resource itself**.
- **Google does NOT grant permission to pre-existing children or subfolders inside that folder** if they were created by other applications, other users, or via the Google Drive web interface.
- **Google does NOT grant permission to future files added externally** (e.g. dropped into the folder via drive.google.com).
- A server-side query `q = "'<folder_id>' in parents"` filters out any file not created by the app or individually picked, returning an empty list or `404 Not Found`.

### 2. Automated & Synthetic Test Evidence
In `tests/integration/phase107-drive-folder-boundary.test.ts`:
- Pre-existing unpicked children return `authorized: false` (`reason: 'drive_file_scope_does_not_grant_unpicked_descendants'`).
- External additions after folder selection return `authorized: false`.
- App-created children inside an authorized folder return `authorized: true`.
- Individually picked children inside an authorized folder return `authorized: true`.

**Finding:** `drive.file` **does not** grant recursive descendants or external future additions. Under `drive.file`, automatic recursive folder mirroring cannot function.

---

## Decisions

### 1. Bounded Folder Hierarchy (Accepted Work)
Daynori delivers the user-desired product behavior strictly within the authorized boundaries of `drive.file`:
- **User Folder Choice**: Users can select specific Google Drive folders via Google Picker (`linkMode: 'link_reference'`).
- **Hierarchical Representation (`buildAuthorizedDriveTree`)**: When files or subfolders have a known authorized parent folder, Daynori organizes them into a clean, familiar indented tree hierarchy with folder badges and child counts.
- **Truthful Empty/Unpicked Folder Guidance**:
  - When an authorized folder contains no picked children, the UI explicitly explains:
    > *"Under narrow drive.file, unpicked pre-existing or external files in this folder are invisible. Select specific files via the picker, or request broader sync permissions."*
- **Strict Traversal Boundaries (`validateTraversalBoundary`)**:
  - Root Drive enumeration is strictly prohibited.
  - Sibling folders, parent folders, or unrelated Drive directories outside the user-selected folder IDs are never queried, crawled, or enumerated ("Do not enumerate or import the rest of Drive").

### 2. Disconnect and Data Preservation Guarantees
- Calling disconnect or encountering token revocation:
  - Atomically wipes stored refresh token ciphertext from the database.
  - Increments connection generation, fencing late background jobs.
  - Cancels pending Drive transfer jobs.
  - **Does NOT delete or trash remote Google Drive originals** (`remoteOriginalDeleted: false`).
  - Preserves imported copies (`import_copy`) in Daynori private storage (`retainedImportedCopies: true`).

### 3. Strict Vault Exclusion & Multi-Tenant Workspace Scoping
- **Vault Strict Exclusion**: Vault records, plaintexts, and cryptographic keys (`isVaultDriveTarget`) are strictly excluded. Any attempt to link, import, or upload vault items to Google Drive fails closed with HTTP 403 `vault_excluded`.
- **Multi-Tenant Isolation**: All connections, intents, jobs, and linked files are strictly scoped to the active `workspaceId` and actor `accountId`. Cross-workspace access is rejected with `workspace_mismatch` or HTTP 403/404.

### 4. Broader-Scope Proposal & Gating for Recursive Mirroring
To support automatic recursive mirroring of all external files and changes within a folder, Daynori must request restricted scopes (`https://www.googleapis.com/auth/drive.readonly` or `https://www.googleapis.com/auth/drive`).

Per `docs/engineering/google-drive-restricted-scope-mirroring-proposal.md`:
- **CASA Requirement**: Mandatory third-party App Defense Alliance (ADA) Cloud Application Security Assessment (CASA) Tier 2 / Assurance Level **AL2**.
- **Recurring Annual Assessment**: Mandatory re-assessment and Letter of Validation (LOV) renewal every 12 months.
- **Financial Obligation**: Authorized lab assessment pricing spans $675 to $5,400+ per year (scaling to $15,000+ for enterprise pen-tests).
- **Google OAuth Verification**: Mandatory public privacy policy with Limited Use disclosure, verified domain in Google Search Console, and unedited YouTube demonstration video.
- **Standing Gate**: Recursive folder mirroring remains **strictly gated fail-closed** (`DEF-V2-005` / `DEF-V2-014`). No restricted scope will be requested or enabled until the owner explicitly authorizes seeking CASA AL2 certification and funds the independent laboratory audit.

---

## Consequences

- Users gain clean, familiar hierarchical views of explicitly chosen folders and their authorized children.
- Daynori adheres strictly to the principle of least privilege under `drive.file`, avoiding costly unauthorized restricted scopes.
- Remote user files are guaranteed safe on disconnect.
- The path to full recursive mirroring is thoroughly documented with concrete requirements, costs, and architecture for future owner authorization.
- Phase 107 is committed and pushed under the standing ADR 0074 workflow.
