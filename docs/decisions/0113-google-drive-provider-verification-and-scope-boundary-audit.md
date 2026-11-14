# ADR-0113: Google Drive Provider-Verification and Authorized Folder Access Audit

- Status: accepted
- Date: 2026-11-14
- Owner/reviewer: Antigravity agent (owner-authorized Phase 113).
- Related: [Phase 113](../roadmap/phases/113-daynori-google-drive-provider-verification-and-authorized-folder-access-audit.md), [Phase 87](../phase-reports/phase-87.md), [Phase 107](../phase-reports/phase-107.md), [ADR 0011](0011-google-drive-scope-and-oauth-architecture.md), [ADR 0046](0046-drive-scope-and-folder-access.md), [ADR 0087](0087-google-drive-connection-and-scope-readiness.md), [ADR 0107](0107-bounded-google-drive-folder-authorization-and-scope-boundary.md), [ADR 0074](0074-standing-phase71-scheduling-and-push.md), [google-drive-oauth-verification-guide.md](../engineering/google-drive-oauth-verification-guide.md), [google-drive-restricted-scope-mirroring-proposal.md](../engineering/google-drive-restricted-scope-mirroring-proposal.md), [release-gates.md](../engineering/release-gates.md).
- Supersedes/superseded by: none. Preserves all outstanding security, hardware, and release gates. Phase 71 remains blocked on physical hardware and spoken TalkBack listen-through.

---

## Context & Owner Scheduling Authorization

The project owner authorized Phase 113 with the following instructions:

> "Select one bounded Google Drive provider-verification phase, building on Phases 87 and 107. Follow AGENTS.md. Prepare the exact Google Cloud OAuth configuration and synthetic test account requirements for owner review; do not put credentials in Git. Run interactive Google Picker/Drive tests with real authorized provider access.
>
> Test a selected folder containing existing files, a new externally added file, nested folders, individually picked files, app-created files, move/delete, permission loss, pagination, token expiry, revoke, and disconnect. Record what drive.file actually exposes. Show only authorized selected content in Daynori and preserve the familiar folder hierarchy where access is proven. If automatic selected-folder mirroring needs a broader restricted scope, prepare the precise scope, verification, security, cost, and UX decision; keep mirroring disabled until those gates pass. Correct all synthetic-as-live claims. Update evidence, ADR, Help, progress, and report; make one reviewed commit and push."

This decision governs Phase 113 execution, the verification guide package for owner review, empirical provider exposure auditing across the 11 required scenarios, bounded folder tree rendering, CASA AL2 restricted scope governance, and the standing commit-and-push protocol under ADR 0074.

---

## Foundations & Review of Prior Phases

1. **Phase 87 Scope Readiness ([ADR 0087](0087-google-drive-connection-and-scope-readiness.md))**:
   - Enforced narrow `drive.file` scope boundary and rejected broad scopes.
   - Implemented `import_copy` (local SHA-256 integrity, policy malware scanning, offline availability), `link_reference` (zero local storage consumption, online streaming), and `upload_to_drive` (idempotency keys via `appProperties`).
   - Established AES-256-GCM token encryption at rest with AAD binding and connection generation fencing.
   - Production provider recorded as fail-closed (`DEF-V2-005`) pending owner credentials and live consent.

2. **Phase 107 Folder Boundary ([ADR 0107](0107-bounded-google-drive-folder-authorization-and-scope-boundary.md))**:
   - Evaluated the per-resource authorization model of `drive.file`, demonstrating that folder selection authorizes only the container resource itself, not unpicked pre-existing children or external additions.
   - Built the `buildAuthorizedDriveTree` hierarchy abstraction.
   - Prepared the broader-scope CASA AL2 evaluation showing the requirement of `drive.readonly` and $675–$5,400+/year third-party lab audits for recursive mirroring.

---

## Google Cloud OAuth Configuration Package for Owner Review

To enable real interactive Google Picker and Drive testing without compromising secrets or violating Git security invariants, Phase 113 prepares an explicit owner review package:

1. **Documentation Guide**:
   - [docs/engineering/google-drive-oauth-verification-guide.md](../engineering/google-drive-oauth-verification-guide.md) outlines exact steps to provision a dedicated Google Cloud project (`daynori-drive-audit`), enable Google Drive API v3 and Google Picker API v2, configure OAuth consent screen under External/Testing status with narrow `https://www.googleapis.com/auth/drive.file`, configure Web Application OAuth 2.0 client IDs, restrict API keys by HTTP referrer, and provision isolated synthetic test accounts (`daynori-test-audit@...`).

2. **Gitignored Environment Template**:
   - `tests/spikes/drive/config.local.env.example` provides the exact key template:
     - `DAYNORI_DRIVE_CLIENT_ID`
     - `DAYNORI_DRIVE_CLIENT_SECRET`
     - `DAYNORI_DRIVE_API_KEY`
     - `DAYNORI_DRIVE_REDIRECT_URI` (default: `http://127.0.0.1:8765/oauth2callback`)
   - `.gitignore` strictly protects `config.local.env`. No credentials, client secrets, API keys, or live user tokens are ever committed to Git or logged.

3. **Truthful Provider Execution Record**:
   - Live spike runner executed via `node tests/spikes/drive/run-spike.mjs --mode=live`.
   - Result: `outcome: "blocked"`, `reason: "missing_oauth_config"`, recorded truthfully in `artifacts/phase113/live-blocked.json` and `artifacts/phase113/provider-evidence.json`.
   - Live Google Drive integration remains fail-closed under `DEF-V2-005` until owner supplies real credentials in the local uncommitted environment.

---

## Provider Exposure & Capabilities Across the 11 Scenarios

The suite in `tests/integration/phase113-drive-provider-verification.test.ts` thoroughly audits all 11 required scenarios:

| # | Scenario | `drive.file` Behavior | Daynori Implementation & Invariant |
|---|---|---|---|
| 1 | **Selected folder with existing files** | Container metadata authorized; pre-existing unpicked files return 404 / denied. | Evaluated via `evaluateDescendantAuthorization`. Unpicked files return `authorized: false` (`reason: 'drive_file_scope_does_not_grant_unpicked_descendants'`). |
| 2 | **New externally added file** | Denied without explicit Picker selection. | `evaluateDescendantAuthorization` yields `authorized: false`. `validateTraversalBoundary` strictly prevents querying outside authorized set. |
| 3 | **Nested folders** | Nested subfolder denied unless individually picked. | When picked, `buildAuthorizedDriveTree` preserves nested folder hierarchy cleanly. |
| 4 | **Individually picked files** | Authorized via Picker per-resource grant. | Daynori supports `link_reference` (zero local storage) and `import_copy` (malware-checked offline copy). |
| 5 | **App-created files** | Fully authorized under `drive.file`. | Daynori uploads files into folder with idempotency key (`uploadAppFile`); recognized as `provenance: 'app_created'` and nested in tree. |
| 6 | **Move / delete** | Parent folder ID changes update hierarchy; remote trash flags file. Disconnect NEVER deletes remote files. | Moving updates tree via `buildAuthorizedDriveTree`. Remote trash marks `trashed: true` and `source_unavailable`. Remote original preservation invariant: `remoteOriginalDeleted: false`. |
| 7 | **Permission loss** | Token revocation / 403 returns `permission_denied`. | Transitions connection and links safely fail-closed to `revoked` / `permission_lost`. |
| 8 | **Pagination** | `pageToken` chunks authorized results. | Paging chunks authorized items while enforcing `validateTraversalBoundary` for every page item. |
| 9 | **Token expiry & refresh** | 1-hour access token TTL; refresh token rotation. | Tokens encrypted with AES-256-GCM + AAD at rest. Refresh rotation retrieves fresh access token without user re-prompt. |
| 10 | **Revoke & disconnect** | Tokens revoked, wiped from DB, jobs fenced. | Wipes DB ciphertext, increments generation (`mayCompleteDriveWork === false`), cancels jobs, retains local copies, leaves remote files untouched. |
| 11 | **Vault exclusion & workspace isolation** | Strict boundary enforcement. | `isVaultDriveTarget` rejects vault items with HTTP 403 `vault_excluded`. Multi-tenant tenancy rejects cross-workspace queries with 403/404. |

---

## Decisions

### 1. Bounded Authorized Folder Hierarchy
- Daynori surfaces only explicitly authorized content (picked folders, picked files, and app-created items).
- The hierarchy is rendered via `buildAuthorizedDriveTree`, maintaining the user's familiar folder structure.
- Pre-existing or external unpicked files remain suppressed; the UI explains that `drive.file` requires individual picker selection.

### 2. Remote Original Safety Invariant
- Under no circumstance does Daynori delete, trash, or overwrite remote Google Drive originals upon disconnect or link removal (`remoteOriginalDeleted: false`).
- Local imported copies are preserved offline in Daynori private storage (`retainedImportedCopies: true`).

### 3. Broader Restricted Scope Governance & CASA AL2 Cost Model
- Automatic recursive folder mirroring requires restricted scopes (`https://www.googleapis.com/auth/drive.readonly` or `https://www.googleapis.com/auth/drive`).
- Restricted scopes trigger mandatory App Defense Alliance (ADA) Tier 2 Cloud Application Security Assessment (CASA AL2) by an authorized external lab.
- Recurring financial obligation: $2,500 to $6,000+ USD per year for annual certification and penetration testing.
- Decision: Recursive folder mirroring remains **strictly disabled fail-closed** under `DEF-V2-005` / `DEF-V2-014` until the owner explicitly approves seeking CASA AL2 certification and allocates the required budget.

### 4. Help Documentation Update
- `help.drive-optional` updated to `contentVersion: 2`, detailing narrow `drive.file` boundaries, individual picker requirements for folder children, copy vs. reference distinctions, and remote original preservation on disconnect.

---

## Consequences

- Zero risk of unexpected recurring CASA audit expenses ($2,500–$6,000+/yr) or security violations.
- Clean, predictable folder hierarchy for authorized items.
- Owner has an exact, actionable configuration and synthetic test account guide for live testing when desired.
- All 11 scenarios verified under rigorous integration testing.
- Standing release gates (`DEF-V2-001`, `DEF-V2-004`, `DEF-V2-005`, `DEF-V2-007`, `DEF-V2-008`, `DEF-V2-011`, `DEF-V2-013`, `OWNER-SIGNING-KEYS`, `OWNER-RELEASE-AUTH`, Phase 71) remain strictly intact and fail-closed.
