# iOS store release package (Phase 62 — local preparation)

**Status:** preparation only. Not TestFlight distribution, App Store submission, or live availability.  
**Date:** 2026-10-21.  
**Prerequisite honesty:** Phase 61 records **no** Simulator or physical iOS verification. That status is preserved until Mac/device evidence exists ([phase-61.md](../../phase-reports/phase-61.md)).

## Contents

| Document | Purpose |
|---|---|
| [rc-identity-and-build.md](rc-identity-and-build.md) | Release-candidate identity + Mac build procedure |
| [signing-and-provisioning.md](signing-and-provisioning.md) | Apple signing requirements (credentials outside Git) |
| [testflight-device-checklist.md](testflight-device-checklist.md) | TestFlight + device coverage checklist |
| [privacy-and-dependencies.md](privacy-and-dependencies.md) | Privacy declarations draft + dependency inventory |
| [support-privacy-deletion.md](support-privacy-deletion.md) | Support / privacy / account-deletion resource pointers |
| [reviewer-access.md](reviewer-access.md) | App Review access procedure (draft) |
| [screenshots.md](screenshots.md) | Screenshot requirements; unverified drafts only |
| [monitoring-rollout-recovery.md](monitoring-rollout-recovery.md) | Monitoring, rollout, recovery (draft) |
| [owner-actions.md](owner-actions.md) | Exact remaining owner/Mac actions |
| [enabled-scope.md](enabled-scope.md) | Store claims limited to enabled modules |

Apple primary sources checked 2026-10-21:

- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [App privacy details / Nutrition Labels](https://developer.apple.com/app-store/app-privacy-details/)
- [Submitting](https://developer.apple.com/app-store/submitting/)
- [TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)
- Prior Daynori review: [apple-privacy-notifications-purchases-review-2026-10-21.md](../../policy/apple-privacy-notifications-purchases-review-2026-10-21.md)

## Explicit non-claims

- No App Store upload, TestFlight invite, paid Apple services, or production activation from this package.
- Vault, rooms/chat, live AI, Drive, and production billing remain **disabled** and must not appear in store marketing.
- Windows hosts cannot produce signed iOS archives; Mac + Xcode required.
