# Phase 38: Controlled private beta (Local Preparation)

Group: Personal organizer and private beta. Status is tracked in [progress.json](../roadmap/progress.json).

## Identity and scope

- **Phase ID/specification:** [38 — Controlled private beta](../roadmap/phases/38-controlled-private-beta.md)
- **Status:** `blocked` (Local preparation artifacts created and validated under explicit owner authorization; execution, deployment, tester invitations, and release gate completion remain explicitly `blocked` pending owner-supplied staging/beta target, external signing credentials, push provider service accounts, and invited participant cohort).
- **Contributor and report date:** Antigravity (Google DeepMind), 2026-10-18.
- **Base Git revision and branch:** `main` (following prerequisite lifecycle repairs commit `fix(lifecycle)`).
- **Prerequisites:**
  - [Phase 37 — Core quality and usability release gate](phase-37.md): Evaluated; release gate decision remains `blocked` on physical Android hardware and production credentials.
  - [Phase 02 — Continuous checks and contributor automation](phase-02.md): Monorepo checks, secret scanning, dependency audits, and planning validation active.
- **Included scope (Local Beta Preparation Artifacts)**:
  - **Beta Environment Configuration (`infra/deployment/beta/beta.env.example`)**:
    - Complete environment configuration template enforcing private beta boundaries.
    - Specifies isolated database separation (`daynori_beta`), non-admin runtime role (`daynori_runtime`), private assets S3 bucket, 100MB workspace quota, 10MB file limit, and 300s reauth expiry.
  - **Executable Environment Validator (`infra/deployment/beta/validate-beta-env.mjs`)**:
    - Automated audit script verifying security invariants: `BETA_ACCESS_MODE=private_invitation_only`, `BETA_ALLOW_PUBLIC_SIGNUP=false`, 32+ character invitation secret, least-privilege DB role, private bucket, quota caps, and `REDACT_TELEMETRY=true`. Fails closed on missing or placeholder values.
  - **Organizer Scope Feature Flags (`infra/deployment/beta/feature-flags.json`)**:
    - Confines beta experience to verified personal organizer domain: core notes, tasks, routines, journals, files, search, and local portability.
    - Explicitly disables unverified features: multi-user collaborative rooms, public item sharing links, billing/subscriptions, AI assistants, and external calendar sync.
  - **Operations Runbook (`infra/deployment/beta/beta-operations.md`)**:
    - Documents strict forward-fix migration policy to preserve user data, emergency rollback procedures, worker blob purge mechanics, redacted telemetry invariants, P0-P3 incident alerting routing, and in-app feedback intake.
  - **Android Release Signing Runbook (`infra/deployment/beta/android-release-signing.md`)**:
    - Establishes reproducible build and external keystore signing procedure for Android internal beta (APK/AAB), version metadata (`0.1.0-beta.1`, versionCode 1), and `apksigner` checksum verification without committing signing keys to Git.
  - **Automated Smoke Check Runner (`infra/deployment/beta/beta-smoke-check.mjs`)**:
    - Executable smoke suite verifying health endpoint, unauthenticated mutation rejection, cross-participant multi-tenant isolation, and public deletion compliance against Fastify API and PostgreSQL (4/4 checks passed).
  - **Observation & Triage Protocol (`infra/deployment/beta/beta-observation-protocol.md`)**:
    - Defines tester cohort coverage matrix (Android 10–15, desktop and mobile browsers), core organizer participant scenarios, P0–P3 bug severity definitions, immediate beta stop criteria (confirmed data loss or cross-tenant exposure), and explicit widening exit gates.
- **Excluded / Blocked Scope**:
  - Live deployment to staging/beta cloud servers.
  - Invitation of real human beta testers.
  - Distribution of release builds or submission to Google Play Store / Apple App Store.
  - Committing private release signing keys or paid cloud infrastructure credentials.

## Acceptance evidence

### Local Preparation & Validation Matrix

| Deliverable / Artifact            | Path / Command                                                                            | Observed Result                                                                                      | Status                      |
| :-------------------------------- | :---------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------- | :-------------------------- |
| **Beta Configuration Template**   | `infra/deployment/beta/beta.env.example`                                                  | Template defines private access mode, least-privilege DB, S3 quotas, and telemetry redaction.        | **PASS** (Local Artifact)   |
| **Environment Validator**         | `node infra/deployment/beta/validate-beta-env.mjs infra/deployment/beta/beta.env.example` | Correctly identified placeholder secrets and failed closed with detailed guidance.                   | **PASS** (Executable Check) |
| **Feature Flags Configuration**   | `infra/deployment/beta/feature-flags.json`                                                | Restricts scope to verified personal organizer; collaborative and billing flags disabled.            | **PASS** (Local Artifact)   |
| **Beta Operations Runbook**       | `infra/deployment/beta/beta-operations.md`                                                | Forward-fix migration policy, storage quotas, P0-P3 alerting, and feedback routing documented.       | **PASS** (Local Runbook)    |
| **Android Release Signing Guide** | `infra/deployment/beta/android-release-signing.md`                                        | Reproducible release APK/AAB build instructions using external keystore without repo secret leakage. | **PASS** (Local Runbook)    |
| **Beta Smoke Check Runner**       | `node infra/deployment/beta/beta-smoke-check.mjs`                                         | 4/4 checks passed (health, unauthenticated rejection, tenant isolation, public deletion).            | **PASS** (Executable Check) |
| **Observation Protocol**          | `infra/deployment/beta/beta-observation-protocol.md`                                      | Cohort matrix (Android 10-15, Web), P0-P3 SLAs, immediate stop criteria, and widening gates defined. | **PASS** (Local Protocol)   |

## Defects, limitations and recovery

### Release Gate Status: BLOCKED

Phase 38 local preparation is complete and verified. However, per repository instructions (`AGENTS.md`) and the Phase 38 specification:

> "This authorizes prerequisite repairs and local beta preparation. It does not waive release gates or authorize deployment, tester invitations, paid infrastructure, store submission, or use of private signing credentials."

### Exact Owner Decisions and Inputs Required for Execution:

1. **Target Infrastructure & Cloud Host**:
   - Owner selection and provisioning of an isolated beta database (`daynori_beta`) and S3 private bucket.
2. **External Keystore & Credentials**:
   - Owner generation of the release keystore (`daynori-release.keystore`) outside Git, and export of signing environment variables.
3. **Push Provider Credentials**:
   - Provisioning of staging VAPID keys for Web Push and Firebase Cloud Messaging service account JSON for Android reminders.
4. **Beta Participant Cohort**:
   - Selection of authorized initial 15–30 beta participants and distribution of cryptographic invitation tokens.
5. **Physical Hardware Verification**:
   - Verification of TalkBack screen-reader navigation and cold start on a physical Android device prior to widening.

## Documentation and Git review

- **Updated documents:**
  - `infra/deployment/beta/*`: Created beta configuration, validator, flags, runbooks, protocol, and smoke tests.
  - `docs/phase-reports/phase-37.md`: Updated with lifecycle repair evidence, honest test classifications, and real DR drill results.
  - `docs/phase-reports/phase-38.md`: Created this preparation report.
  - `docs/roadmap/progress.json`: Phase 37 and Phase 38 recorded as `blocked`; `activePhase: null`, `nextPhase: null`.
  - `CHANGELOG.md`: Updated with lifecycle prerequisite repairs and Phase 38 preparation details.
- **Intended conventional commit subject:** `chore(beta): prepare and validate the private organizer release`.

## Handoff

Phase 38 preparation is complete locally and recorded as `blocked`. Do NOT deploy to cloud environments, invite testers, or submit to app stores. Stop before Phase 39.
