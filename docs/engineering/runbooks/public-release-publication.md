# Public Android and web publication runbook (Phase 60)

**Scope:** Concrete operator steps for a matching web/API/worker + signed Android candidate.  
**Not authorized by this document alone.** Submission, approval, publication, and verified live operation are separate states requiring explicit owner authorization after release gates pass.

## Candidate identity

Record before any external action:

| Field | Source |
|---|---|
| Git revision (exact) | `git rev-parse HEAD` |
| Manifest | `docs/release/manifest-0.1.0-provisional.json` (replace provisional when RC freezes) |
| Preflight report | `artifacts/release/preflight-last.json` |
| Web/API/worker versions | package versions + image/digest if deployed |
| Android `versionName` / `versionCode` | Generated Gradle + Play Console |
| Artifact hashes | AAB/APK SHA-256 + signer cert SHA-256 |
| Enabled feature inventory | Manifest `enabledInProposedRelease` with candidate-scoped evidence |

Engineering preflight (`pnpm release:preflight`) **never** grants human launch authorization.

## Deployment order (local rehearsal → production when authorized)

1. Freeze candidate revision; run `pnpm release:preflight` (expect fail-closed until evidence/OA complete).
2. Disposable rehearsal: `DAYNORI_REHEARSAL_TARGET=disposable-local pnpm release:rehearsal` against isolated DB/object storage only.
3. Apply migrations with matching versions; verify required DB roles (`daynori_runtime`, `daynori_billing`, …).
4. Deploy API → worker → web (same revision family); confirm health and kill switches.
5. Build Android from **fresh Expo prebuild** (`pnpm release:android-path prebuild-disposable` then owner-signed `bundleRelease`). Reject debug-signed / `DAYNORI_ALLOW_DEBUG_RELEASE_SIGNING` artifacts.
6. Verify effective `compileSdk`/`targetSdk` **36** and signing from **generated config + artifacts**, not `app.json` alone.
7. Inspect native libraries (including SQLCipher `.so`) for **16 KB page-size** compatibility on the built AAB — configuration changes are not proof.
8. Store/web materials: privacy, terms, support, account-deletion URLs must be real owned destinations (not provisional drafts).

## First Google Play publication vs percentage staged rollout

Official Play Console **percentage staged rollouts** apply to **app updates**, not the first publication of a new app listing.

| State | Supported workflow |
|---|---|
| First publication | Use the account’s first-release path (internal/closed/open testing as eligible, then production release). Do **not** claim a %-staged production rollout for a brand-new app. |
| Subsequent updates | May use percentage staged rollout after a production version exists. |
| Roadmap wording | Phase 60 plan text mentioning “staged rollout” means controlled exposure via testing tracks / post-first-update %-rollouts — clarified in ADR 0057. |

Refresh account-specific requirements on the check date: target API, 16 KB, signing, Data safety, permissions, reviewer access, deletion resources, personal-account testing eligibility.

## Verification commands (engineering)

```bash
pnpm release:preflight
DAYNORI_REHEARSAL_TARGET=disposable-local pnpm release:rehearsal
pnpm release:android-path prebuild-disposable
# When JDK/SDK available against a verified android tree:
pnpm release:android-path exercise-gradle --android-dir <path>
pnpm --filter @daynori/web build
node scripts/phase60-web-production-smoke.mjs
# With local API:
# DAYNORI_API_URL=http://127.0.0.1:3001 node scripts/phase60-web-production-smoke.mjs
npx vitest run tests/integration/phase60-release-boundaries.test.ts
```

## Rollback / forward-fix

- Prefer **forward-fix** compatible with already-installed clients.
- Do **not** assume destructive database rollback or Android versionCode downgrade is safe.
- Preserve user data, offline drafts, mutation receipts, and deletion tombstones after restore.
- Kill switches for optional modules must deny (403), not silently succeed.

## Monitoring and support

- Name on-call / support ownership before publication (currently **unassigned** — blocker).
- Watch crash/ANR, API 5xx, migration failures, worker lag, auth error spikes, deletion request failures.
- Unresolved support inbox or placeholder legal copy → **do not** label launch-ready.

## Approval checkpoints

| Checkpoint | Owner |
|---|---|
| Engineering preflight clear for candidate | Engineering |
| Device / beta / accessibility / backup evidence | Engineering + prerequisites |
| Legal entity, brand, domains, monitored support | Owner |
| Play Console account + testing eligibility | Owner |
| Store upload / submission | Owner (explicit) |
| Production publish | Owner (explicit) |
| Verified live smoke | Owner + engineering |

## External blockers (evidence or decision needed)

1. Phase 37 hardware / TalkBack / KeyStore / live push evidence.
2. Phase 38 private beta cohort + staging evidence.
3. Owner brand/domain/legal entity + monitored support inbox.
4. Release signing credentials (no debug fallback).
5. Built AAB: API 36 + 16 KB native evidence + signer identity.
6. Play Console account-specific testing with real testers.
7. Operator launch approval for the exact candidate revision/hashes.
8. Phase 49 live Google / Phase 50 Drive remain deferred — keep disabled.

## States (do not collapse)

`prepared` → `submitted` → `approved` → `published` → `verified-live`

Local rehearsal reaches **prepared** evidence only.
