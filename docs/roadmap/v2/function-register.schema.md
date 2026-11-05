# Function register schema

Machine-readable inventory for Phase 65+. Source of truth: [`function-register.json`](function-register.json). Validate with `node scripts/validate-function-register.mjs`.

## Top-level object

| Field                  | Type     | Meaning                                                                                |
| ---------------------- | -------- | -------------------------------------------------------------------------------------- |
| `schemaVersion`        | number   | Current: `1`.                                                                          |
| `phase`                | string   | Authoring phase id (`"65"`).                                                           |
| `generatedAt`          | string   | ISO date (`YYYY-MM-DD`) of this inventory revision.                                    |
| `baseRevision`         | string   | Git revision inspected when the register was authored.                                 |
| `nominatedEnvironment` | object   | Local measurement environment (services, auth mode, flags, browser/build). No secrets. |
| `readinessValues`      | object   | Map of allowed readiness enum → human meaning.                                         |
| `observedResultValues` | object   | Allowed observed outcomes (pass / fail / unavailable / skipped / untested).            |
| `evidenceLayers`       | object   | Allowed evidence-layer labels.                                                         |
| `featureFamilies`      | string[] | Required coverage families (must match entries used by actions).                       |
| `actions`              | Action[] | Lower-level user/operator actions.                                                     |
| `defects`              | Defect[] | Linked gap records.                                                                    |
| `coverageNotes`        | string[] | Inventory limits and methodology notes.                                                |

## Action record

Keep these axes separate: release capability, authorization, personal visibility, verification readiness, observed test outcome.

| Field                     | Type           | Meaning                                                                                                            |
| ------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------ |
| `id`                      | string         | Stable unique id (`family.action`, kebab segments).                                                                |
| `featureFamily`           | string         | One of `featureFamilies`.                                                                                          |
| `userBenefit`             | string         | Why a user cares.                                                                                                  |
| `description`             | string         | What the action does.                                                                                              |
| `implementationStatus`    | enum           | `existing` \| `planned` \| `gated` \| `missing`.                                                                   |
| `entryPoints`             | string[]       | Routes, screens, menus, deep links, APIs.                                                                          |
| `implementationPaths`     | string[]       | Source paths (apps/packages).                                                                                      |
| `platforms`               | object         | `web`, `installedPwa`, `android`, `iosNative` → `supported` \| `partial` \| `unsupported` \| `gated` \| `unknown`. |
| `releaseCapability`       | object         | `local` and `hostedPreview` → `available` \| `unavailable` \| `partial` \| `unknown`.                              |
| `authorization`           | string         | Workspace/membership/session requirements.                                                                         |
| `personalVisibility`      | string         | Preference hide/show vs release vs auth (do not conflate).                                                         |
| `readiness`               | enum           | See readiness values below.                                                                                        |
| `dependencies`            | string[]       | Runtime, provider, or phase dependencies.                                                                          |
| `owner`                   | string         | Product/engineering owner label (may be `unassigned`).                                                             |
| `acceptanceJourney`       | string         | Happy-path acceptance journey.                                                                                     |
| `validationNegativeCases` | string[]       | Invalid input, authz, offline, conflict cases.                                                                     |
| `offlineRetryConflict`    | string         | Offline, retry, permission, revision, conflict behavior.                                                           |
| `existingTests`           | string[]       | Exact relevant commands or test file paths.                                                                        |
| `observedResult`          | enum           | `pass` \| `fail` \| `unavailable` \| `skipped` \| `untested`.                                                      |
| `evidenceRefs`            | string[]       | Paths to logs, manifests, screenshots, reports.                                                                    |
| `evidenceMeta`            | object         | `date`, `revision`, `environment`, `platform`, `evidenceLayer`.                                                    |
| `blockerOrDefect`         | string \| null | Defect id or null.                                                                                                 |
| `repairPhase`             | string         | Owning repair/verification phase id.                                                                               |
| `helpArticle`             | object         | `{ status: existing\|planned\|missing, ref: string }`.                                                             |
| `tourTreatment`           | object         | `{ status: existing\|planned\|missing, ref: string }`.                                                             |

## Readiness values

| Value                       | Meaning                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `unverified`                | Source or plan exists; this inventory did not freshly verify the action.                                                              |
| `verified_local`            | Passed nominated local synthetic checks (domain/API/browser with fixtures or injected session).                                       |
| `verified_staging_provider` | Passed against real provider/staging credentials in an authorized environment.                                                        |
| `verified_physical_device`  | Passed on a physical device (not emulator-only).                                                                                      |
| `release_ready`             | All applicable release gates for this action passed with current evidence. Never inferred from source existence or local mocks alone. |
| `blocked`                   | Known blocker prevents verification or release; linked defect required.                                                               |
| `owner_deferred`            | Owner explicitly deferred; do not invent this label.                                                                                  |

## Observed results

| Value         | Meaning                                                   |
| ------------- | --------------------------------------------------------- |
| `pass`        | Assertions for the exercised journey succeeded.           |
| `fail`        | Exercised journey failed product assertions.              |
| `unavailable` | Capability gated or missing in the nominated environment. |
| `skipped`     | Prerequisite missing; journey not run.                    |
| `untested`    | In inventory scope but not exercised in this baseline.    |

## Evidence layers

`domain_unit` · `api_integration` · `browser_ui` · `provider_authenticated` · `emulator` · `physical_device`

A mocked or injected session is local evidence. It does not establish real-provider authentication, deployed persistence, or physical-device behavior.

## Defect record

| Field             | Type           | Meaning                                    |
| ----------------- | -------------- | ------------------------------------------ |
| `id`              | string         | Stable id (`DEF-V2-NNN`).                  |
| `title`           | string         | Short title.                               |
| `affectedActions` | string[]       | Action ids.                                |
| `platforms`       | string[]       | Affected platforms.                        |
| `severity`        | enum           | `critical` \| `high` \| `medium` \| `low`. |
| `userImpact`      | string         | Impact statement.                          |
| `expected`        | string         | Expected behavior.                         |
| `observed`        | string         | Observed behavior.                         |
| `reproduction`    | string[]       | Steps.                                     |
| `environment`     | string         | Where observed.                            |
| `evidenceRefs`    | string[]       | Evidence paths.                            |
| `workaround`      | string \| null | Workaround if any.                         |
| `dependency`      | string         | Blocking dependency.                       |
| `nextAction`      | string         | Concrete next step.                        |
| `owningPhase`     | string         | Repair phase id.                           |

## Validation rules

The validator enforces unique action/defect ids, required fields, enum membership, feature-family coverage, repair-phase existence in `docs/roadmap/plan.json`, evidence path existence when claimed as existing files, and that `release_ready` / `owner_deferred` are never used without meeting documented criteria (`owner_deferred` requires an `ownerDecisionRef`).
