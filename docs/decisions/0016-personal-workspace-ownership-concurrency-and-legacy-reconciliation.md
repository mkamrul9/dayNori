# ADR-0016: Personal Workspace Ownership, Concurrency Control, and Legacy Reconciliation

- Status: accepted.
- Date: 2026-10-15.
- Owner/reviewer: Security & Core Engineering.
- Related phase and specifications: [Phase 09 Specification](../../docs/roadmap/phases/09-authentication-across-web-and-android.md), [Phase 10 Specification](../../docs/roadmap/phases/10-personal-workspace-and-preferences.md), [Architecture Data Model](../../docs/architecture/data-model.md).

## Context

During review of Phase 09 (Authentication) and Phase 10 (Personal workspace & preferences), critical security and architectural defects were identified:

1. **Authentication Callback Hardening (Phase 09 Repair)**:
   - Web authentication callback previously accepted tokens without strict provider-bound flow initiation, allowing potential unsolicited token injection.
   - Android deep-link handling lacked durable persistence of pending flow parameters (`state`, `nonce`, `codeVerifier`) across process restarts and cold starts.
2. **Optimistic Concurrency TOCTOU Defect (Phase 10 Repair)**:
   - `updateProfilePreferences` performed a separate read and comparison of `revision`, followed by an update constrained only by `WHERE id = $1`. Concurrent mutating requests with identical expected revisions could both succeed, causing silent data overwrite.
3. **Legacy Workspace Reconciliation (Phase 10 Repair)**:
   - Migration 00008 previously reclassified duplicate personal workspaces to rooms automatically. Preserving rows did not authorize altering their privacy and ownership semantics. Existing records required explicit inventorying, review status tracking, and safe preflight checks without rewriting applied migration history.
4. **Personal Workspace Ownership Invariant (Phase 10 Repair)**:
   - Personal workspaces are strictly owner-only in this release. Adding additional members (collaborators, viewers, editors) must be physically blocked at the database trigger layer and membership API routes, preventing unintended privilege escalation. Room creation and collaborative sharing remain inaccessible until Phase 51.

## Decision

1. **Provider-Bound Flow Initiation & Anti-Replay Exchange**:
   - **Web**: Added `/api/auth/initiate` route setting a short-lived (10-minute), `HttpOnly`, `SameSite=Lax`, `Secure` cookie (`daynori_pkce_verifier`) binding `state`, `codeVerifier`, and `initiatedAt`. The callback endpoint `/api/auth/callback` verifies cookie presence, strictly matches `state`, rejects unsolicited raw tokens (`access_token`/`refresh_token` in query/hash without initiated flow), and deletes the cookie immediately upon one-time code exchange.
   - **Android**: `MobileProviderAuthAdapter` persists pending flow parameters (`state`, `nonce`, `codeVerifier`, `initiatedAt`, `type`) into OS-backed secure storage (`expo-secure-store` under `SEC_KEY_PENDING_FLOW`). Upon cold start or process resurrection from deep links, the adapter restores flow parameters, validates nonces, executes one-time exchange, and immediately purges pending flow state.
2. **Atomic Concurrency Control**:
   - `updateProfilePreferences` enforces an atomic SQL revision predicate:
     ```sql
     UPDATE app.profiles
     SET display_name = COALESCE($2, display_name),
         time_zone = COALESCE($3, time_zone),
         preferred_locale = COALESCE($4, preferred_locale),
         week_start = COALESCE($5, week_start),
         preferences = COALESCE($6, preferences),
         revision = revision + 1,
         updated_at = now()
     WHERE id = $1 AND ($7::bigint IS NULL OR revision = $7::bigint)
     RETURNING *;
     ```
   - If 0 rows are updated when `expectedRevision` is supplied, the current profile revision is fetched and a 409 Conflict is returned without overwriting. Exactly one concurrent update succeeds.
3. **Legacy Workspace Reconciliation Ledger & Preflight**:
   - Applied migration `00009_legacy_workspace_reconciliation_and_ownership.sql` establishing `app.legacy_workspace_reconciliation_inventory` to record all historical workspaces affected by Migration 00008 with status `quarantined_pending_review`.
   - Created admin procedure `app.reconcile_legacy_workspace(p_workspace_id, p_action, p_reviewer_id, p_notes)` for reviewed disposition (`archive`, `confirm_room`, or `restore_as_personal_backup`).
   - Created `scripts/preflight-database.mjs` verifying migration readiness, checking inventoried records, and failing closed if unreviewed records are detected.
4. **Database-Enforced Personal Workspace Ownership**:
   - Enforced via PostgreSQL trigger `trg_enforce_personal_workspace_ownership` on `app.workspace_memberships`:
     ```sql
     IF ws_kind = 'personal' THEN
         IF NEW.user_id <> ws_owner OR NEW.role <> 'owner' THEN
             RAISE EXCEPTION 'Personal workspaces are owner-only in this release; adding additional members is forbidden.';
         END IF;
     END IF;
     ```
   - Membership API endpoint `POST /v1/workspaces/:workspaceId/members` rejects personal workspaces with 400 Bad Request.
   - Room creation and sharing remain inaccessible in user interfaces until planned Phase 51.

## Consequences

- Concurrency conflicts are handled deterministically with standard HTTP 409 and atomic predicates.
- Flow initiation prevents CSRF callback spoofing and unsolicited token replacement.
- Cold-start authentication on Android reliably resumes and exchanges authentication links.
- Personal workspaces cannot be converted to collaborative rooms or granted multiple members without explicit database schema migrations.
