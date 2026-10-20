# Phase 50: Optional external Drive folder mirroring

## Identity and scope

- **Phase ID/specification:** [Phase 50 — Optional external Drive folder mirroring](../roadmap/phases/50-optional-external-drive-folder-mirroring.md).
- **Status:** `deferred` (owner-authorized; **not** implemented completion).
- **Contributor and report date:** Cursor agent, 2026-10-20 (Asia/Dhaka).
- **Base revision:** Phase 49 repair `81e8de1`.
- **Prerequisites assessed:**
  - Phase 48: blocked — ADR 0046 accepts **narrow** `drive.file` selected/app-created mode; broader folder access explicitly deferred; live Google matrix **unexecuted**.
  - Phase 49: blocked — repaired local selected-file connector; live Google / production enablement **unmet**.

### Distinguishing lanes

| Lane | Delivered? |
|---|---|
| Readiness gate evaluation against Phase 50 step 1 | **Yes** |
| Folder mirroring implementation | **No** — deferred |
| Mock / substitute mirror for roadmap advancement | **No** — not built |
| Broader OAuth scopes | **No** — not requested |

## Result

### Gate decision (implementation step 1)

Phase 50’s first implementation step requires proceeding **only if** Phase 48’s broader-access decision and required verification are satisfied; otherwise record this optional feature as deferred.

| Required evidence | Present? |
|---|---|
| Approved broader-scope product decision (beyond ADR 0046 narrow mode) | **No** — ADR 0046 / Phase 48 retain selected-file mode |
| Owner-approved access breadth for recursive external folders | **No** |
| Live external-folder behavior against a real Google account | **No** — Phase 48 live matrix unexecuted |
| Applicable Google verification / restricted-scope assessment prerequisites | **No** |
| Acceptable service cost and operational limits review | **No** |
| Accepted Phase 48–49 live prerequisites (clean `drive.file` proof + production connector) | **No** — both phases remain blocked on live proof |

**Decision:** Defer Phase 50 under explicit owner authorization in the Phase 50 selection request. Deferral is documentation only — folder mirroring remains unavailable in active UI and product claims. The narrow selected-file connector (Phase 49) is preserved unchanged in scope.

### What was not done

- No recursive folder boundary, change cursors, pagination sync, or mirror worker.
- No OAuth permission broadening.
- No substitute mock mirror presented as completion.
- No claim that application filtering narrows the OAuth grant.

## Acceptance evidence

| Condition | Method | Result |
|---|---|---|
| When enabled, new files in configured folder appear within sync interval | N/A | **Deferred — not implemented** |
| Reconciliation / missed cursors / no unselected-folder enumeration | N/A | **Deferred — not implemented** |
| If deferred, UI/store claims omit automatic folder mirroring; unresolved prerequisite visible in progress | Review Settings Drive copy + progress.json | **PASS** — selected-files wording; status `deferred` |
| Gate: broader-access decision + verification | Read Phase 48–49 reports, ADR 0046, integrations architecture | **FAIL prerequisites → defer** |

### Commands run

Environment: Windows 11, Node `v24.11.1`, pnpm `9.15.5`. Report date 2026-10-20.

| Command | Exit | Result |
|---|---|---|
| Read Phase 48–50 specs/reports, ADR 0046/0047, integrations architecture, release gates | — | Gate unmet |
| `node scripts/validate-planning.mjs` | 0 | passed (post-doc update) |
| `git diff --check` | 0 | clean |
| Folder-mirroring implementation tests | — | **Not run** (no implementation) |

## Defects, limitations and recovery

### Reasons for deferral (exact)

1. Phase 48 product decision remains **narrow selected/app-created-file mode** under `drive.file` (ADR 0046); it does **not** authorize recursive external folder access.
2. No separate owner approval for broader OAuth breadth or restricted-scope verification/assessment.
3. Live Google external-folder experiments and Phase 48 live matrix remain unexecuted.
4. Phase 49 live Google verification and production enablement remain unmet.
5. Service cost / operational limit acceptance for broader Drive sync is absent.

### Reopening requirements

Reopen Phase 50 only when **all** of the following exist and are recorded:

1. Written product decision approving external folder mirroring and the **actual** OAuth scope breadth (not “filter in app” pretending to narrow the grant).
2. Owner-approved access breadth and acceptance of Google verification / security-assessment / cost obligations applicable to that scope.
3. Live evidence of external-folder create/move/delete, nested children, inaccessible children, permission loss, and change-cursor behavior against a real test account.
4. Phase 48 live scope matrix and Phase 49 production-flagged selected-file connector verified under the same account family as needed.
5. Explicit owner re-selection of Phase 50 for implementation (not roadmap auto-advance).

Until then: keep vault disabled; keep selected-file connector only; do not expand Drive permissions “to make Phase 50 green.”

## Documentation and Git review

- This deferral report; CHANGELOG; progress.json (`50` deferred).
- Integrations architecture already states folder mirroring is not promised under ADR 0046.
- Intended commit subject: `docs(drive): defer external folder mirroring pending access approval`

## Handoff

Phase 50 is **deferred**, not complete. Narrow Drive selected-file connector remains the active product path. Deferral alone does not start later phases.

**Phase 51 identity correction:** Phase 51 is [Shared rooms, invitations, and roles](../roadmap/phases/51-shared-rooms-invitations-and-roles.md), **not** vault/encrypted storage. Its prerequisites are Phase 38 (controlled private beta) and Phase 10 (personal workspace and preferences). Drive and vault phases are **not** prerequisites for Phase 51. Vault activation remains disabled independently.

Owner later selected Phase 51 for **bounded provisional local development** only (see [phase-51.md](phase-51.md)). That selection changes development order; it does not authorize public sharing, real-user invitations, deployment, or release enablement. Keep Phase 51 incomplete while Phase 38/10 and rooms release evidence remain unmet. No deployment, paid provisioning, broader Drive authorization, or real-user Drive activation from this deferral.
