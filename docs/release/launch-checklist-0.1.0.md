# Launch checklist — 0.1.0 provisional (Phase 59 / Phase 60 prep)

Legend: **LV** locally verified · **EV** externally verified · **OD** owner decision · **MC** missing credentials/hardware · **BP** blocked prerequisite · **OA** operator approval · **UNEXEC** not executed

| Item | Status | Notes |
|---|---|---|
| Release manifest links versions/features/migrations | LV | `docs/release/manifest-0.1.0-provisional.json` — valid JSON ≠ release-eligible |
| Executable release preflight fail-closed | LV | `node scripts/release-preflight.mjs` — engineering only; never grants OA |
| Disabled modules unreachable (API + production NODE_ENV) | LV | See phase59/phase60 gate tests |
| Privacy/terms/support/deletion draft pages | LV | Unresolved fields marked; not launch-ready legal copy |
| Account deletion public resource (local web+API) | LV | Deployed public URL EV missing |
| Target API 36 in **generated** Gradle / artifact | UNEXEC/MC | app.json config LV; built AAB evidence required |
| 16 KB page-size / SQLCipher `.so` align | MC | Needs built AAB / ELF analysis — config changes ≠ proof |
| Release signing guard (no silent debug fallback) | LV | Plugin + inspect script; **credentials MC**; signed RC UNEXEC |
| Explicit local-test debug signing rejected by eligibility | LV | Preflight rejects `DAYNORI_ALLOW_DEBUG_RELEASE_SIGNING` |
| Signed release candidate install/upgrade | MC | No production identity |
| Play Data safety form submitted | OD/EV | Draft only |
| Account-specific testing with real testers | OD/EV | Emulators insufficient for personal accounts |
| First Play publication vs % staged rollout | LV (docs) | % rollouts are for **updates**; first pub uses supported first-release workflow |
| Brand/domain/legal entity clearance | OD | Daynori provisional |
| Monitored support inbox | OD | Unassigned — do not label launch-ready |
| Phase 37 hardware / TalkBack / KeyStore | BP | |
| Phase 38 private beta evidence | BP | |
| Commercial billing offers | BP/OD | Production billing off |
| Store upload / submission | OA | **Not authorized** |
| Operator launch approval | OA | **Not granted** |

Local preparation and rehearsal ≠ launch authorization.
