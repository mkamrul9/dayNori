# TestFlight and device coverage checklist

**Status:** checklist only — **no** TestFlight upload or testers invited.

Sources: [TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/) (checked 2026-10-21).

## Before upload

- [ ] Phase 61 physical/Simulator evidence attached to phase-61 report
- [ ] Signed RC built on Mac; build number recorded
- [ ] Encryption questionnaire answered consistently with `ITSAppUsesNonExemptEncryption`
- [ ] Beta test information drafted (what to test, feedback email)
- [ ] Enabled-scope marketing matches [enabled-scope.md](enabled-scope.md)

## Device matrix (minimum — fill after evidence)

| Class | Model / OS | Install | VoiceOver | Offline | Notifications | Notes |
|---|---|---|---|---|---|---|
| Simulator | _UNEXECUTED_ | | | | | Not a physical gate |
| Phone (current) | _UNEXECUTED_ | | | | | Required |
| Phone (prior OS ≥ 15.1) | _UNEXECUTED_ | | | | | Recommended |
| iPad (if tablet claimed) | _UNEXECUTED_ | | | | | `supportsTablet: true` |

## Journeys on the exact TestFlight binary

- [ ] Auth + account switch + draft quarantine
- [ ] Notes / tasks / routines / journal / files
- [ ] Offline edit → reconnect / conflict UI
- [ ] Reminder permission deny → Settings recovery
- [ ] Background / resume
- [ ] Account deletion entry points (in-app + public URL when live)
- [ ] Upgrade from prior build (when a prior build exists)

## Explicit non-execution

TestFlight distribution, internal/external tester invites, and crash-feedback review are **not performed** by Phase 62 preparation on this host.
