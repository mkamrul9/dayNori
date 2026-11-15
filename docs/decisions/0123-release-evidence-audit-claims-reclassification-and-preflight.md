# ADR 0123: Daynori Release-Evidence Audit, Claims Reclassification, Candidate Inventory, and Preflight Reconciliation

- **Status:** Accepted
- **Date:** 2026-11-15
- **Deciders:** Project Owner, Operations Lead, Security & Privacy Officer, Lead Engineer
- **Consulted:** QA Automation Lead, Accessibility Lead
- **Informed:** Core Contributors

---

## 1. Context and Problem Statement

Following the assembly of the Phase 122 production launch package, an empirical audit of the test scripts and verification assertions across Phase 119 (HTTPS Staging Verification), Phase 120 (Security & Privacy Review), Phase 121 (Load Testing & Capacity Envelope), and Phase 122 (Launch Package Assembly) revealed that certain assertions had been overclaimed in report summaries, JSON artifacts, and release governance documentation:

1. **Phase 119 Browser Journey Overclaim:**
   - *Script reality:* `scripts/run-phase119-https-staging-verification.mjs` (lines 509–605) loaded 10 URLs (`/privacy`, `/settings`, `/library`, `/today`, `/plan`, `/journal`, `/account-deletion`, `/help`) via Chrome CDP and checked static DOM selectors (`header`, `nav`, `h1`, `document.body.innerText.includes('Library')`, `input[type="search"]`).
   - *Overclaim:* Described in documentation and artifacts as "10 core browser journeys exercised (signup, notes, tasks, routines, journals, sync conflicts, account deletion)".
   - *Fact:* No authenticated session was established; no user created or edited notes, tasks, routines, or reflections; no sync conflicts were triggered with live data; no account was deleted. These were **unauthenticated page-presence / DOM-inspection checks (page checks)**.

2. **Phase 119 Staging Backup Drill Overclaim:**
   - *Script reality:* Lines 388–403 in `scripts/run-phase119-https-staging-verification.mjs` executed `fs.existsSync('docs/engineering/backup-and-recovery.md')`.
   - *Overclaim:* Labeled `BKP-01-STAGING-RESTORE-DRILL` and described as "clean restoration of production schema to isolated staging target under RPO < 5m and RTO < 15m".
   - *Fact:* No database restore drill was ever executed against hosted staging. This was solely **documentation and runbook protocol existence verification**. The actual database recovery drill remains an unexecuted blocked gate (`evidence-backupRecoveryEvidence`).

3. **Phase 121 Load Testing Overclaim:**
   - *Script reality:* `scripts/run-phase121-load-testing.mjs` executed ~140 HTTP GET requests to health endpoints (`/health`, `/v1/health`, `/api/health`) and static assets (`/`, `/offline-shell.html`) with simulated Bangladesh network delays.
   - *Overclaim:* Described as "capacity envelope verification for 10,000 users" or "proof of 10,000-user capacity".
   - *Fact:* No authenticated transactional database reads or writes were load-tested at scale. This was **health-endpoint throughput profiling, proxy rate-limiter boundary verification, and mathematical capacity modeling**. Transactional load testing of 10,000 users remains unexecuted and requires paid infrastructure.

4. **Working Tree and Candidate Divergence:**
   - The repository working tree contains 109 tracked modified files and 2,003 untracked files.
   - Several modified source and migration files (notably `packages/ui-web/src/Dialog.tsx` and `infra/supabase/migrations/00077_moderation_takedown_enforcement.sql`) postdate or were excluded from candidate `2.0.0-rc5` tarballs.
   - Running the candidate preflight (`scripts/release-preflight.mjs --allow-partial-local`) confirms that 13 external release gates remain blocked, including `evidence-backupRecoveryEvidence` and `evidence-ownerApproval`.

---

## 2. Decision Drivers

- **Absolute Truth in Release Claims (`AGENTS.md`):** Never report checks as passed if they were not run; never claim a document existence check is a database restore drill; never call unauthenticated page checks "authenticated journeys"; never claim health probes prove 10,000-user capacity.
- **Clear Demarcation of Tested Scope:** Ensure that what candidate `2.0.0-rc5` actually contains vs. what exists in the dirty working tree is transparently inventoried.
- **Preflight Reconciliation:** Acknowledge all 13 blocked preflight gates without attempting to bypass or mark them passed prematurely.

---

## 3. Decision Outcome

We decided to execute **Phase 123** for **Release-Evidence Audit, Claims Reclassification, Candidate Inventory, and Preflight Reconciliation**.

### 3.1 Claims Reclassification Mapping

| Item | Previous Overclaimed Description | Script Reality | Honest Reclassified Description |
| :--- | :--- | :--- | :--- |
| **Phase 119 Staging Checks** | "10 real headless Chrome CDP browser journeys exercised (signup, notes, tasks, routines, journal, sync conflicts, account deletion)" | Navigated to 10 unauthenticated URLs and asserted presence of `header`, `h1`, or `innerText` match. | **10 unauthenticated page-presence / DOM-inspection checks** (route reachability, titles, and layout containers). Prohibited: "authenticated journeys", "browser journeys". |
| **Phase 119 Backup Check** | "Staging restore drill verified (`BKP-01-STAGING-RESTORE-DRILL`)" | Evaluated `fs.existsSync('docs/engineering/backup-and-recovery.md')`. | **Documentation and runbook protocol existence verification** (`BKP-01-RUNBOOK-DOCUMENTATION-VERIFICATION`). Live restore drill unexecuted (`evidence-backupRecoveryEvidence` blocked). |
| **Phase 121 Load Testing** | "Production-scale load testing and capacity envelope verification for 10,000 users" | Executed ~140 HTTP GET requests to health endpoints and static assets. | **Health-endpoint throughput profiling, proxy rate-limiter boundary verification, and mathematical capacity modeling**. Transactional 10k database load testing unexecuted. |
| **Phase 122 Launch Package** | Consolidated overclaimed labels into production launch package. | Aggregated Phase 119–121 summaries. | **Reconciled launch package with transparent blocked gates** and honest labels across all dimensions. |

### 3.2 Candidate vs. Working Tree Inventory

The working tree was inventoried into `artifacts/phase123/dirty-working-tree-inventory.json`:
- **Tracked Modified Files:** 109 files across `artifacts/` (69), `docs/` (29), `tests/` (5), `assets/` (2), `packages/` (1), `infra/` (1), `scripts/` (1), and `CHANGELOG.md` (1).
- **Untracked Files:** 2,003 files (primarily historical Android UI test XML hierarchies in `artifacts/android-e2e/phase71/` and `artifacts/phase77/`).
- **Notable Source/Migration Changes Absent from `rc5`:**
  - `packages/ui-web/src/Dialog.tsx`: Dialog styling, backdrop blur (3px), theme-aware backdrop color and shadow enhancements. Excluded from `rc5` tarball.
  - `infra/supabase/migrations/00077_moderation_takedown_enforcement.sql`: Uncommitted moderation migration. Excluded from staging deployment.
  - `assets/brand/nori/*`: Companion mascot geometry updates.
  - `tests/*`: 5 uncommitted test suites and baselines.

### 3.3 Preflight Reconciliation

Executed `node scripts/release-preflight.mjs --allow-partial-local`:
- **Summary:** 20 pass, 0 fail, 13 blocked, 1 unexecuted (`flag-prod-env`).
- **Release Eligibility:** `releaseEligible=false` (human OA + external blockers remain).
- **Key Blocked Invariants:**
  1. `evidence-backupRecoveryEvidence`: Preflight specifically flags backup/recovery drill as missing or placeholder.
  2. `evidence-ownerApproval`: Explicit owner publication authorization required.
  3. `manifest-provisional`: Provisional manifest cannot become release-eligible without owner OA.
  4. `db-roles`: Supabase production database roles not verified for this candidate.
  5. `evidence-deviceEvidence` & `DEF-V2-011`: Physical Android ARM64 TalkBack hardware evidence missing.
  6. `evidence-signedArtifactEvidence` & `OWNER-SIGNING-KEYS`: Signed release keystores unconfigured.
  7. `evidence-accessibilityEvidence`: Spoken TalkBack listen-through unperformed.
  8. `evidence-betaEvidence` & `evidence-opsEvidence`: Human beta cohort and ops monitoring sign-off pending.
  9. `node-engines`: Installed Node `v24.11.1` does not satisfy `engines.node ^24.21.0`.

---

## 4. Consequences

### Positive
- Strict alignment with `AGENTS.md` truthfulness requirements: no overclaimed testing capabilities.
- Clear separation between what was built and packaged (`rc5`) versus subsequent working tree modifications.
- Complete documentation of exact preflight invariants and blocked external gates.

### Negative / Tradeoffs
- Acknowledges that true transactional database load testing for 10k users and live database restore drills remain incomplete, requiring dedicated infrastructure and owner spending authorization.
