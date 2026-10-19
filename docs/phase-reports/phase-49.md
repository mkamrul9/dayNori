# Phase 49: Drive selected-file connector

## Identity and scope

- **Phase ID/specification:** [Phase 49 — Drive selected-file connector](../roadmap/phases/49-drive-selected-file-connector.md).
- **Status:** `blocked` (provisional local implementation delivered; live Google verification and production enablement unmet).
- **Contributor and report date:** Cursor agent, 2026-10-19 (Asia/Dhaka).
- **Base revision:** Phase 48 repair `777f31f`.
- **Prerequisites:**
  - Phase 48: blocked (spike + repairs; live Google matrix still unexecuted).
  - Phase 25: blocked (files/previews provisional; reused as safety boundary).

### Distinguishing lanes

| Lane | Delivered? |
|---|---|
| Local contracts, persistence, OAuth intents, encrypted tokens, jobs, web/Android UI | **Yes** (provisional) |
| Fake-provider integration / unit tests | **Yes** |
| Live Google account connection with clean `drive.file` grant | **No** |
| Production enablement / real-user activation | **No** |
| Vault activation | **No** — remains disabled |

## Result

- Migration `00048_drive_selected_file_connector.sql`: connections, auth intents, linked files, drive jobs + RLS/grants.
- API module `apps/api/src/modules/drive` + routes: connect start/complete, disconnect, picker token, select/link/import/upload jobs, unlink.
- AES-256-GCM token crypto with external key + tenant binding; fail-closed without key.
- Production Google provider fail-closed unless OAuth env + `DAYNORI_DRIVE_PRODUCTION_ENABLED=true`.
- Fake provider for tests/labeled harness only.
- Worker `drive_*` jobs with disconnect generation fencing.
- Web Settings panel + `/api/drive/callback`; Android Settings → `DriveConnectionsSheet` (system browser / Custom Tabs).
- ADR 0047 records provisional architecture.

### Connector behavior delivered

- Narrow `drive.file` only; exact scope validation shared with Phase 48.
- Selected/app-created mode: link reference, import copy, upload to Drive, offline download jobs.
- Shortcuts / unsupported shared-drive objects rejected.
- Disconnect removes tokens, cancels jobs, explains retained copies; does not trash remote.
- Cross-workspace access denied via membership + connection ownership.

## Acceptance evidence

| Condition | Method | Result |
|---|---|---|
| Domain/crypto/fake provider unit tests | `pnpm vitest run tests/security/phase49-drive-connector.test.ts` | See commands |
| Fake-provider integration | `pnpm vitest run tests/integration/phase49-drive-connector.test.ts` | See commands |
| Live Google verification | Owner OAuth + production flag | **UNEXECUTED** |
| Phase 48 live matrix | Owner `config.local.env` | **UNEXECUTED** |

### Commands run

Environment: Windows 11, Node `v24.11.1`, pnpm `9.15.5`.

| Command | Exit | Result |
|---|---|---|
| `pnpm --filter @daynori/domain build` | 0 | OK |
| `pnpm --filter @daynori/contracts build` | 0 | OK |
| `pnpm --filter @daynori/api-client build` | 0 | OK |
| `pnpm --filter @daynori/api build` | 0 | OK |
| `pnpm --filter @daynori/worker build` | 0 | OK |
| `pnpm vitest run tests/security/phase49-drive-connector.test.ts` | 0 | 6 passed |
| `pnpm vitest run tests/integration/phase49-drive-connector.test.ts` | 0 | 5 passed |
| `pnpm --filter @daynori/web typecheck` | 0 | OK |
| `pnpm --filter @daynori/mobile typecheck` | 0 | OK |
| `node scripts/validate-planning.mjs` | 0 | passed |
| `git diff --check` | 0 | clean |
| Live Google OAuth / Picker / Drive API against a real account | — | **UNEXECUTED** |

### Fake versus live

- **Fake:** labeled `isDevelopmentFixture`; emails like `drive-fixture@daynori.test`; never claimed as Google proof.
- **Live:** requires owner Google Cloud OAuth clients (web + Android redirect), Drive + Picker APIs, encryption key, `DAYNORI_DRIVE_PRODUCTION_ENABLED=true`, and clean narrow consent — not done.

## Defects, limitations and recovery

- Full import byte path into Phase 24 quarantine reserve is metadata/job-fenced provisionally; production must finish byte ingest through existing file safety APIs.
- Live scope proof still open from Phase 48.
- Phase 38 / store / verification prerequisites unmet.
- Vault remains disabled.

## Documentation and Git review

- ADR 0047; phase report; CHANGELOG; progress.json (`49` blocked).
- Commit subject target: `feat(drive): add provisional selected-file connector`

## Handoff

Provisional local Drive connector delivered. **Next action:** owner supplies test OAuth + encryption keys and runs Phase 48 live spike + Phase 49 production-flagged connect against a test account; or continue only when selecting later phases. **Stop before Phase 50.** No deployment, paid provisioning, real-user Drive activation, or broader scopes.
