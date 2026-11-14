# Google Drive Restricted Scope Mirroring Proposal & Verification Analysis

- **Document Version:** 1.0.0
- **Date:** 2026-11-14
- **Related Documents:** [ADR 0046](../decisions/0046-drive-scope-and-folder-access.md), [Phase 50](../phase-reports/phase-50.md), [ADR 0087](../decisions/0087-google-drive-connection-and-scope-readiness.md), [ADR 0107](../decisions/0107-bounded-google-drive-folder-authorization-and-scope-boundary.md)
- **Status:** Proposed / Gated Fail-Closed pending owner commercial authorization and CASA AL2 certification.

---

## 1. Executive Summary & Review of Prior Decisions

In Daynori's development history, Google Drive integration has progressed across three prior milestones:
1. **Phase 48 (ADR 0046)**: Investigated Google Drive scopes; selected narrow `https://www.googleapis.com/auth/drive.file` as the least-privilege, non-sensitive boundary. Postponed recursive folder access pending empirical verification.
2. **Phase 50 (docs/phase-reports/phase-50.md)**: Formally **deferred** external folder mirroring because `drive.file` was not demonstrated to grant unpicked descendants, no broader OAuth scopes were authorized by the product owner, and third-party security verification was unmet.
3. **Phase 87 (ADR 0087)**: Audited and solidified the narrow `drive.file` connector, token encryption at rest with AES-256-GCM and AAD binding, disconnect generation fencing, byte integrity with malware scanning, user-facing copy vs. reference guidance, and fail-closed production gates under `DEF-V2-005`.

During Phase 107, we evaluated the desired product behavior:
> *"A user chooses specific Drive folders, Daynori shows only those authorized folder trees with familiar hierarchy, and disconnect/revocation does not delete originals. Do not enumerate or import the rest of Drive."*

This document reviews the live and synthetic test evidence of `drive.file`, proves why automatic recursive folder mirroring cannot function under `drive.file`, specifies the bounded folder hierarchy delivered in Phase 107, and sets out a concrete broader-scope proposal with current Google verification and cost requirements for owner consideration.

---

## 2. Technical Findings: `drive.file` Scope & Google Picker Behavior

### 2.1 The Per-Resource Grant Model of `drive.file`
Under Google's OAuth 2.0 architecture:
- `https://www.googleapis.com/auth/drive.file` grants per-file or per-resource authorization.
- The grant covers **only**:
  1. Files and folders created by the specific application (`app-created`).
  2. Files and folders explicitly selected or opened by the user through the Google Picker API (`picker_selected`).

### 2.2 The Folder Selection Behavior
When a user selects a folder in the Google Picker (`setSelectFolderEnabled(true)`):
- Google grants the application OAuth permission to access **that specific folder container** (metadata, name, MIME type `application/vnd.google-apps.folder`).
- **Google DOES NOT grant permission to pre-existing files or subfolders inside that folder** that were created by other applications, other users, or via the Google Drive web interface.
- **Google DOES NOT grant permission to future files added externally** (e.g. dropped into the folder via `drive.google.com` or Google Drive desktop sync).
- If Daynori calls `files.list` with query `q = "'<folder_id>' in parents"`:
  - Google Drive API filters results on the server according to OAuth authorization.
  - Any child item not created by Daynori or individually selected in Google Picker returns `404 Not Found` or is omitted from `files: []`.

### 2.3 Proof from Synthetic Tests
Our test suite `tests/integration/phase107-drive-folder-boundary.test.ts` validates this invariant:
```typescript
evaluateDescendantAuthorization({
  parentFolderId: 'folder-001',
  childFileId: 'child-unpicked-002',
  provenance: 'pre_existing_unpicked',
  grantedScope: 'https://www.googleapis.com/auth/drive.file',
});
// => { authorized: false, reason: 'drive_file_scope_does_not_grant_unpicked_descendants' }
```

**Conclusion:** Automatic, recursive folder mirroring of externally added or pre-existing unpicked files **cannot be achieved under `drive.file`**. Pretending that selecting a folder authorizes its unpicked contents would cause silent data truncation, missing files, or runtime 403/404 errors.

---

## 3. Bounded Folder Tree Implementation (Accepted Work)

Rather than abandoning folder selection or making unsupported claims, Daynori implements a transparent, bounded folder hierarchy under `drive.file`:

1. **User Folder Choice**:
   - The user selects specific folders via Google Picker (`linkMode: 'link_reference'`).
   - The folder container is registered in `app.drive_linked_files`.
2. **Authorized Hierarchy (`buildAuthorizedDriveTree`)**:
   - When files are linked or imported, Daynori checks whether their parent folder is also authorized.
   - If an authorized folder contains app-created files or individually picked children, Daynori renders them in a familiar indented tree hierarchy.
3. **Transparent Empty/Unpicked Folder Guidance**:
   - If an authorized folder has no picked children, the UI truthfully informs the user:
     > *"Under narrow drive.file, pre-existing or externally added files inside this folder require individual picker selection. Full automatic folder mirroring is gated pending restricted scope CASA authorization."*
4. **Strict Traversal Boundaries**:
   - Daynori never traverses or queries parents, sibling folders, or root Drive (`validateTraversalBoundary`).
   - Prevents enumerating or importing unauthorized parts of the user's Drive.
5. **Preserved Invariants**:
   - **Disconnect & Revocation**: Local disconnect wipes tokens and cancels in-flight jobs, but **never deletes or trashes remote Google Drive originals** (`remoteOriginalDeleted: false`).
   - **Imported Copies**: Durable copies downloaded to Daynori (`import_copy`) have SHA-256 byte verification, pass malware quarantine, and are preserved locally upon disconnect.
   - **Vault Exclusion**: Vault plaintexts, vault items, and cryptographic keys are strictly excluded (`isVaultDriveTarget`).
   - **Multi-Tenant Isolation**: Scoped strictly to the active `workspaceId` and actor `accountId`.

---

## 4. Broader Scope Proposal (Recursive Folder Mirroring)

If the product owner decides that automatic discovery and continuous synchronization of all files inside a chosen folder (including external additions and pre-existing files) is required, Daynori must transition from `drive.file` to a **Restricted Google Drive Scope**.

### 4.1 Candidate Scopes
| Scope URI | Sensitivity Tier | Access Level | Use Case in Daynori |
|---|---|---|---|
| `https://www.googleapis.com/auth/drive.readonly` | **Restricted** | Read-only access to all files and folders in user's Drive | Recursive folder tree discovery, change polling (`changes.list`), one-way mirroring to Daynori. |
| `https://www.googleapis.com/auth/drive` | **Restricted** | Full read/write access to all files and folders | Two-way file synchronization, moving, updating, and trashing remote files. |

### 4.2 Mandatory Google Security & Verification Requirements (2025/2026)

Because these scopes grant access to user files across their entire Drive, Google categorizes them as **Restricted Scopes** under the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy).

To use restricted scopes in production, Daynori must satisfy:

#### 1. App Defense Alliance (ADA) Cloud Application Security Assessment (CASA)
- **Applicable Framework:** CASA Tier 2 / Assurance Level **AL2**.
- **Requirement:** A qualified independent authorized cybersecurity laboratory must perform an application security assessment against the OWASP Application Security Verification Standard (ASVS).
- **Scope of Assessment:**
  - Dynamic Application Security Testing (DAST) of Daynori API servers.
  - Static Application Security Testing (SAST) of all source code handling Drive tokens and data.
  - Cloud infrastructure configuration assessment (Supabase / AWS / GCP hosting).
  - Verification of token storage encryption (AES-256-GCM with AAD), TLS 1.3 transport, and key management.
- **Authorized Laboratories:** TAC Security, Bishop Fox, DEKRA, NetSentries, Leviathan Security Group.
- **Recurring Annual Requirement:** A CASA assessment is **not a one-time check**. The application must undergo annual recertification and obtain a fresh Letter of Validation (LOV) every 12 months.

#### 2. Cost Analysis & Financial Obligations
Based on published lab pricing and ADA authorized vendor rate sheets for 2025/2026:
- **Baseline Automated & Validated Assessment (AL1/AL2):** $675 to $2,500 per assessment.
- **Standard Cloud API + Web Application Assessment (AL2):** $2,500 to $5,400+ per assessment.
- **Comprehensive Pen-Testing / Enterprise Scope:** $10,000 to $15,000+ per assessment.
- **Annual Recurring Commitment:** $2,500 to $6,000+ USD per year.

#### 3. Google OAuth App Verification Process
In addition to CASA, Google requires:
- **Domain Verification:** The Daynori domain (`daynori.com`) must be verified in Google Search Console.
- **Privacy Policy Audit:** Privacy Policy must contain a prominent, accessible disclosure complying with the Google API Services User Data Policy, specifically stating:
  > *"Daynori's use and transfer to any other app of information received from Google APIs will adhere to Google API Services User Data Policy, including the Limited Use requirements."*
- **YouTube Video Submission:** A full, unedited video demonstrating the user initiating the OAuth flow, the Google consent screen displaying the exact client ID and requested scope, the user granting consent, and the exact features using the scope.
- **Review SLA:** Typically 4 to 8 weeks from submission to final approval.

---

## 5. Architectural & Data Minimization Safeguards for Broader Scope

If broader scope is authorized in a future phase, Daynori must adhere to the following strict architectural constraints to minimize risk and pass CASA:

1. **Application-Level Enforced Boundary (Bounded Ingestion)**:
   - Even though `drive.readonly` grants access to all user files, Daynori's backend must query ONLY within the user-chosen folder ID:
     ```http
     GET /drive/v3/files?q='<chosen_folder_id>'+in+parents+and+trashed=false
     ```
   - Sibling folders, root drive, and unrelated directories must never be indexed, crawled, or cached in Daynori databases.
2. **Change Cursor Tracking**:
   - Utilize `changes.getStartPageToken` and `changes.list` scoped strictly to `spaces=drive` with client-side parent validation to detect additions, modifications, and deletions within the chosen folder.
3. **No Secondary Data Sharing**:
   - Raw Google Drive files and metadata must never be transmitted to third parties, AI providers, or external telemetry systems without explicit, unbundled user consent.
4. **Immediate Disconnect & Wipe**:
   - Disconnect must immediately revoke the token via Google's revocation endpoint (`https://oauth2.googleapis.com/revoke`), zero out stored ciphertexts, and delete provider references.

---

## 6. Recommendations & Next Steps

1. **Retain Bounded `drive.file` Scope in Current Candidates**:
   - Ship the bounded folder tree representation delivered in Phase 107.
   - It provides high utility for users picking specific folders and files without incurring thousands of dollars in annual third-party CASA audit fees.
2. **Keep Recursive Mirroring Gated Fail-Closed**:
   - Retain `DEF-V2-005` in `docs/roadmap/v2/function-register.json`.
   - Do not broaden OAuth permissions in `packages/domain/src/driveScopes.ts` or `apps/api` until the owner authorizes the CASA evaluation and funds the independent lab assessment.
3. **Re-Evaluation Trigger**:
   - Reopen this proposal if user feedback during the Version 2 beta explicitly demands automated directory background sync over manual picker selection.
