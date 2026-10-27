# Version 2 readiness baseline (Phase 65)

Date: 2026-10-25 (Asia/Dhaka). Base revision: `a8d50fa` on `codex/free-core-preview`. Machine register: [`function-register.json`](function-register.json). Schema: [`function-register.schema.md`](function-register.schema.md). Validate: `node scripts/validate-function-register.mjs`.

This baseline inventories and measures the current application. It does not redesign navigation, repair unrelated modules, or enable gated vault/Drive/rooms/AI/billing/notification delivery.

## Nominated environment

| Item                    | Value                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| OS                      | Windows 10.0.26200                                                                                             |
| Node                    | v24.21.0 portable (`.tools/node-v24.21.0-win-x64`); PATH Node was also v24.11.1                                |
| Package manager         | pnpm 9.15.5                                                                                                    |
| Database                | PostgreSQL `daynori_test` via project `.env` (secrets not recorded)                                            |
| Auth for API journeys   | Synthetic JWT (`@example.test` fixtures)                                                                       |
| Hosted preview login    | Not exercised (no passwords requested)                                                                         |
| Feature flags           | Core validation uses `NODE_ENV=production`; local rooms/AI/billing flags cleared                               |
| Web visual capture      | Headless Chromium/Edge against local `next start` with `NEXT_PUBLIC_DAYNORI_CORE_PREVIEW=true`                 |
| Android physical device | None attached                                                                                                  |
| Evidence retention      | PNG/logs/profiles under gitignored `artifacts/local/phase65/`; sanitized manifests in [`evidence/`](evidence/) |

## Coverage summary

| Metric                          | Count                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| Feature families                | 22 (all required families covered)                                                       |
| Actions inventoried             | 109                                                                                      |
| Defects linked                  | 12                                                                                       |
| `release_ready` actions         | 0                                                                                        |
| `owner_deferred` actions        | 0                                                                                        |
| Fresh visual captures           | 60 (emulation)                                                                           |
| Core organizer tests this run   | 15 passed                                                                                |
| Performance short soak this run | 2 passed; see [`evidence/phase65-perf-summary.json`](evidence/phase65-perf-summary.json) |

Observed outcomes remain distinguishable: `pass`, `fail`, `unavailable`, `skipped`, `untested`. Readiness is separate from release capability, authorization, and personal visibility.

## What verified locally (synthetic)

Exercised via `tests/e2e/core-organizer-journeys.test.ts` and `tests/integration/core-organizer-local-validation.test.ts` (log: `artifacts/local/phase65/core-journeys.log`):

- Workspace provision + preference updates (including 409 conflict)
- Note create/reopen (Bangla/English AST), trash/restore
- Folder hierarchy move/organize
- Task create/complete/reopen with deadline behavior
- Routine create + occurrence complete/skip/undo across dates
- Journal multi-entry + snippet privacy
- Search to canonical item
- File reserve/upload/finalize/download (local memory storage + worker)
- Sync push/pull
- Export/import checksum round-trip
- Account/workspace deletion purge
- Production gates: rooms/AI/billing/vault status return 403

Performance (same day, Node 24.21.0): 10k-item / 5-level folder / 40-actor short soak; read p95 ~201ms and write p95 ~159ms on this host — **engineering synthetic baseline only**, not production capacity, Bangladesh field Web Vitals, or assistant latency.

## Visual and accessibility baseline

Fresh captures indexed in [`evidence/phase65-visual-manifest.json`](evidence/phase65-visual-manifest.json). Routes: Today, Plan, calendar, Library, Journal, Settings, Help, Support. Viewports: 1280, 768, 412, 390, 360, 320. Themes: light/dark on Today and Settings.

Manual inspection of representative PNGs:

- Preview banner and bottom nav present on narrow web.
- PWA install prompt can overlay lower content (owning phase 70).
- Anonymous Library shows Signed out / Not connected.
- No horizontal `overflowX` on sampled documents; “clipped” metrics are skip-link false positives.
- Automated overflow only — **no screen-reader run**; keyboard/focus not fully exercised.
- Emulation ≠ installed PWA ≠ physical Android.

Historical `artifacts/web-e2e/*.png` remain historical.

## Most important gaps (by severity)

1. **DEF-V2-003 (critical, resolved_local)** — Cold offline reopen: Phase 77 public shell + IndexedDB boot (ADR 0077). Native self-contained installed cold launch still unmet without device attestation. Not `release_ready`.
2. **DEF-V2-001 / DEF-V2-011 (high)** — Real-provider auth and physical Android/TalkBack evidence missing → Phases 72, 71, 99.
3. **DEF-V2-002 (high)** — Hosted core preview disables files, audio, reminder delivery → Phases 75, 84–85.
4. **DEF-V2-006 / 007 / 008 / 004 (high–medium)** — Rooms, billing, AI, vault production-gated → Phases 86–90+.
5. **DEF-V2-009 (high)** — Support contact / durable feedback not configured → Phases 82–83.
6. **DEF-V2-010 (medium)** — Developer gallery, vault harness, provisional panels in ordinary Settings → **Phase 66** local web/API/domain boundaries verified (operator allowlist + Settings cleanup). Physical Android operator grant and production staff IdP remain unmet; not `release_ready`.
7. **DEF-V2-012 (medium)** — Beginner tutorial is not action-verified full coverage → Phases 79–81.

## Help and learning mapping

Every action records `helpArticle` and `tourTreatment` with `existing` or `planned` status. Existing Help is short in-page how-tos plus a three-step beginner guide. Complete per-feature articles and action-verified chapters are planned (78–81). Developer actions map to planned operator guidance, not user tours. Dangerous operations (deletion, vault) map to safe-explanation treatments. Gated capabilities record eligibility conditions via defects and releaseCapability.

## How to reproduce evidence

```powershell
$env:PATH = "$(Resolve-Path '.tools\node-v24.21.0-win-x64');$env:PATH"
node --env-file=.env ./node_modules/vitest/vitest.mjs run tests/e2e/core-organizer-journeys.test.ts tests/integration/core-organizer-local-validation.test.ts
node --env-file=.env ./node_modules/vitest/vitest.mjs run tests/performance/phase58-reliability-baseline.test.ts
node scripts/capture-phase65-baseline-shots.mjs
node scripts/build-function-register.mjs
node scripts/validate-function-register.mjs
```

Do not aim these runners at live production data. Do not clear browser stores or delete user drafts to obtain passes.
