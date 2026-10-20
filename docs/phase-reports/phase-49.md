# Phase 49: Drive selected-file connector

## Identity and scope

- **Phase ID/specification:** [Phase 49 — Drive selected-file connector](../roadmap/phases/49-drive-selected-file-connector.md).
- **Status:** `blocked` (local connector + repair delivered; live Google verification and production enablement unmet).
- **Contributor and report date:** Cursor agent, 2026-10-20 (Asia/Dhaka).
- **Base revision:** Phase 49 provisional `233f886`; this report covers the post-delivery repair.
- **Prerequisites:**
  - Phase 48: blocked (spike + repairs; live Google matrix still unexecuted).
  - Phase 25: blocked (files/previews provisional; reused as safety boundary).

### Distinguishing lanes

| Lane | Delivered? |
|---|---|
| Local contracts, persistence, OAuth intents, encrypted tokens, jobs, web/Android UI | **Yes** (repaired) |
| Worker dispatch → shared executor with real provider I/O + byte lifecycle | **Yes** (repair) |
| Fake-provider integration / unit / transport-mocked Google adapter tests | **Yes** |
| Live Google account connection with clean `drive.file` grant | **No** |
| Production enablement / real-user activation | **No** |
| Vault activation | **No** — remains disabled |

## Result

### Repair (post-`233f886`)

| Defect | Fix |
|---|---|
| Worker updated job status without provider I/O | Shared `jobExecutor.ts`; worker `driveJobs.ts` loads it and requires real completion |
| Downloads discarded / uploads used placeholder bytes | Import via reserve→put→finalize; upload loads verified local bytes; offline stays `pending_offline` until client ack |
| Tautological selection check | Binding validation: workspace/account/connection/generation/linked-file/provider-file/idempotency |
| OAuth codes copied into settings URLs; fabricated picker IDs | Session-bound `/api/drive/callback` + `complete-by-state`; harness uses labeled `fake-harness-*` only |
| Fake provider selectable in production; factory lost auth state | Reject fake in production; process-global development singleton + test injection |
| Disconnect waited on revoke before fencing | Fence/wipe locally first; bounded revoke; `provider_revoke_status` separate |
| Google upload ignored idempotency | `appProperties` reconcile + `drive_upload_operations` table |
| Every HTTP 403 treated as quota | `classifyGoogleHttpError` distinguishes permission/rate/quota/forbidden |

### Connector behavior delivered

- Narrow `drive.file` only; exact scope validation shared with Phase 48.
- Selected/app-created mode: link reference, import copy, upload to Drive, offline download jobs.
- Shortcuts / unsupported objects rejected using authoritative provider metadata.
- Disconnect removes tokens, cancels jobs, explains retained copies; does not trash remote.
- Cross-workspace access denied via membership + connection ownership.
- Atomic drive-job claim with lease token; lease loss fails closed.

## Acceptance evidence

| Condition | Method | Result |
|---|---|---|
| Domain/crypto/fake/Google-adapter unit tests | `pnpm vitest run tests/security/phase49-drive-connector.test.ts` | 10 passed |
| Fake-provider + worker-path integration | `pnpm vitest run tests/integration/phase49-drive-connector.test.ts` | 8 passed |
| Live Google verification | Owner OAuth + production flag | **UNEXECUTED** |
| Phase 48 live matrix | Owner `config.local.env` | **UNEXECUTED** |

### Commands run

Environment: Windows 11, Node `v24.11.1`, pnpm `9.15.5`. Report date 2026-10-20.

| Command | Exit | Result |
|---|---|---|
| `pnpm --filter @daynori/contracts build` | 0 | OK |
| `pnpm --filter @daynori/api-client build` | 0 | OK |
| `pnpm --filter @daynori/api build` | 0 | OK |
| `pnpm --filter @daynori/worker build` | 0 | OK |
| `pnpm vitest run tests/security/phase49-drive-connector.test.ts` | 0 | 10 passed |
| `pnpm vitest run tests/integration/phase49-drive-connector.test.ts` | 0 | 8 passed |
| `pnpm --filter @daynori/web typecheck` | 0 | OK |
| `pnpm --filter @daynori/mobile typecheck` | 0 | OK |
| `node scripts/validate-planning.mjs` | 0 | passed |
| `git diff --check` | 0 | clean |
| Live Google OAuth / Picker / Drive API against a real account | — | **UNEXECUTED** |

### Fake versus live

- **Fake:** labeled `isDevelopmentFixture`; emails like `drive-fixture@daynori.test`; never claimed as Google proof.
- **Transport-mocked Google adapter:** exercises `GoogleDriveProvider` with mocked `fetch` (idempotent upload reconcile, 403 classification) — not a live account.
- **Live:** requires owner Google Cloud OAuth clients, Drive + Picker APIs, encryption key, `DAYNORI_DRIVE_PRODUCTION_ENABLED=true`, and clean narrow consent — not done.

## Defects, limitations and recovery

- Live scope proof still open from Phase 48.
- Phase 38 / store / verification prerequisites unmet.
- Vault remains disabled.
- Production Google identity uses Drive About (compatible with `drive.file`); live proof of About-under-narrow-scope remains owner-gated.
- Folder mirroring (Phase 50) is **not** authorized by this connector.

## Documentation and Git review

- ADR 0047; phase report; CHANGELOG; progress.json (`49` blocked).
- Repair commit subject target: `fix(drive): repair worker bytes, selection, and OAuth resume`

## Handoff

Repaired local Drive connector delivered. **Next action under owner selection:** Phase 50 readiness decision (expect deferral without broader-access approval). Live Google + Phase 48 matrix remain unmet. **Vault activation stays disabled.** No deployment, paid provisioning, real-user Drive activation, or broader scopes.
