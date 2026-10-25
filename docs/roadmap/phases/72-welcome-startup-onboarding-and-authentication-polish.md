# Phase 72 — Welcome startup onboarding and authentication polish

Group: V2 everyday experience. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [68 — Design tokens components icons and motion](68-design-tokens-components-icons-and-motion.md)
- [70 — Mobile web and PWA layout redesign](70-mobile-web-and-pwa-layout-redesign.md)
- [71 — Native Android interface and navigation parity](71-native-android-interface-and-navigation-parity.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web/src/auth
- apps/web/src/components/AuthModal.tsx
- apps/web/src/app
- apps/mobile/src/auth
- apps/mobile/src/views

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Deliver fast welcome/sign-in/sign-up/recovery experiences with clear validation, password-manager support and honest verification/session states.
2. Implement native startup artwork and browser-compatible PWA launch assets, with restrained skippable/reduced motion and no artificial loading delay.
3. Connect optional interests/visible modules and first useful action to the existing onboarding state, preserving existing-account preferences and the later tour engine migration.

## Acceptance

- New and returning users can authenticate/recover or receive actionable failures without leaking account details or losing drafts.
- Permissions and AI consent are contextual, not required at sign-up; onboarding is skippable.
- Cold server/network failures do not impersonate invalid credentials or erase a valid session.

## Verification and evidence

- Test valid/invalid/expired auth, verification/recovery return paths, rate limits, account switch and outage classification.
- Run actual browser/password-manager/keyboard and Android startup/auth flows; measure usable startup rather than splash display.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/roadmap/v2/README.md](../v2/README.md)
- [docs/roadmap/v2/feature-coverage.md](../v2/feature-coverage.md)
- [docs/engineering/handoff.md](../../engineering/handoff.md)
- [docs/roadmap/v2/design-and-mobile.md](../v2/design-and-mobile.md)
- [docs/decisions/0015-authentication-across-web-and-android.md](../../decisions/0015-authentication-across-web-and-android.md)

## Commit target

`feat(onboarding): polish welcome and account journeys`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
