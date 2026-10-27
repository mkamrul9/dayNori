# Phase 72: Welcome startup onboarding and authentication polish

## Identity and scope

- Phase: [72 — Welcome startup onboarding and authentication polish](../roadmap/phases/72-welcome-startup-onboarding-and-authentication-polish.md).
- Status: **complete** (owner scheduling amendment [ADR 0072](../decisions/0072-phase-72-before-phase-71-acceptance.md); Phase 71 remains blocked/incomplete).
- Contributor/date: Cursor agent, 2026-10-26…2026-10-27, Asia/Dhaka.
- Base revision/branch: `058ae6a` + WIP `0fe7501`, `codex/free-core-preview`.
- Prerequisites: Phases 68 and 70 complete. Phase 71 referenced input only (ADR 0072).
- Completion commit subject: `feat(onboarding): polish welcome and account journeys`

## Result

### Scheduling

- [ADR 0072](../decisions/0072-phase-72-before-phase-71-acceptance.md) records the 2026-10-26 owner amendment.
- Plan Phase 72 `dependsOn`: `["68","70"]`.
- Phase 71 stays **blocked** (spoken TalkBack; remaining isolation attribution for Phase 71 acceptance).

### Authentication / provisioning

Native (`providerAdapter.ts`, `AccountSheet.tsx`, `App.tsx`):

- Typed `failureCode` / `WorkspaceProvisionResult`; outages ≠ invalid credentials.
- `sessionGeneration` + single-flight `provisionPersonalWorkspaceDetailed`.
- **Bugfix:** AccountSheet no longer treats the sign-in’s own generation bump as a concurrent replace (that silently aborted provision after every password sign-in).
- Sign-in success distinct from workspace readiness; retry without discarding session.
- `importantForAutofill="no"` on Account sheet fields to reduce cross-account Autofill clobber; paste still works.
- Web `AuthModal`: outage/rate-limit/verification copy; duplicate-submit guard.
- `FirstLoginOnboardingGate`: preference-fetch failure must not open onboarding as a fresh account.

### Journey runner

`scripts/phase71-android-journeys.mjs` (Phase 72 evidence path):

- KEYCODE_AT email typing; label-scoped dumps; onboarding-after-signin treated as success.
- Workspace verify dismisses onboarding and re-opens Settings → Workspace.

### Onboarding / startup

- Existing skip/resume/replay/sample idempotency retained.
- Warm notebook splash / PWA manifest colors and brand icons unchanged and correct.

## Acceptance evidence

### Unit (Node v24.21.0)

| Check | Command | Result |
| --- | --- | --- |
| AccountSheet races / generation | `node node_modules/vitest/vitest.mjs run apps/mobile/src/views/AccountSheet.test.ts` | **5/5 pass** |
| Mobile auth + web auth | `… run apps/mobile/src/auth.test.ts apps/mobile/src/views/AccountSheet.test.ts apps/web/src/auth.test.ts` | **52 pass** (prior combined run) |

### Native AVD (local GoTrue + API)

Environment: AVD `daynori_vault_api35` / `emulator-5554`; GoTrue `10.0.2.2:54321`; API `10.0.2.2:3001`; Metro short-path Dev Client; synth accounts B/C (A KEY_INVALIDATED preserved).

Command: `DAYNORI_ANDROID_SERIAL=emulator-5554 DAYNORI_PHASE71_ACCOUNT_LABEL=C node scripts/phase71-android-journeys.mjs`

**run18** (`artifacts/android-e2e/phase71/journeys/phase72-journey-run18.log`, `phase71-journeys.json`):

| Step | Result |
| --- | --- |
| auth-state C + workspace | **PASS** |
| account-isolation-second B, no leak from C | **PASS** (`signin-result-B.json`: signedIn, workspaceHint, openedOnboarding) |
| account-isolation-return-c | **PASS** (backToC; `note.saved` bridge; Today title scan flaky) |
| search-canonical after switch | **PASS** (exact C note title) |

Limits: create note/task/routine reopen UI flakiness (3 fails) unrelated to auth acceptance; browser password-manager spot-check not separately timed in this cycle (AuthModal autofill attrs present); usable cold-start timing samples not recorded beyond Dev Client load.

### Browser

- AuthModal: `autoComplete` email/password; outage ≠ invalid credentials; duplicate-submit guard. Full desktop keyboard/password-manager matrix not re-run this cycle beyond unit/web auth tests.

## Defects, limitations and recovery

1. Phase 71 remains blocked (TalkBack listen-through; Phase 71–owned isolation evidence attribution).
2. Account A KEY_INVALIDATED DB preserved — not a healthy peer.
3. Journey create reopen flakiness remains.
4. Native Account sheet disables Android Autofill framework on fields to stop cross-account clobber; paste/password-manager via non-Autofill paths still available; web keeps full autofill attrs.
5. No push, paid services, store submission, or production activation.

## Documentation and Git review

- ADR 0072; plan/progress; Phase 71 handoff supersession; this report; CHANGELOG.
- Intended commit: `feat(onboarding): polish welcome and account journeys`

## Handoff

Phase 72 **complete**. Do **not** auto-start Phase 73: it still lists Phase **71** as a hard dependency. Next eligible work: finish remaining Phase 71 acceptance (TalkBack + isolation attribution) or other phases whose dependencies are already complete. Release gates unchanged.
