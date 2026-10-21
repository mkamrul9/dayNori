# ADR-0056: Play and web launch preparation (provisional local)

- Status: accepted (provisional local preparation only).
- Date: 2026-10-21.
- Related: Phase 59; ADR 0054; ADR 0055; [release-gates](../engineering/release-gates.md); [naming](../product/naming.md).

## Context

Public launch requires truthful store/web materials, current Play policy alignment, signing without silent debug fallback, and an explicit enabled-feature scope. Prerequisites remain blocked on hardware, beta, commercial, and owner identity decisions.

## Decision

1. Publish a versioned **provisional release manifest** that lists enabled/disabled features, migrations, blockers, and excluded claims. Incomplete modules stay inaccessible via API/nav/flags — not merely hidden menus.
2. Ship **draft** privacy/terms/support/account-deletion resources with unresolved legal-entity/domain/support fields marked. Do not invent monitored inboxes or owned domains.
3. Configure Android **target/compile SDK 36** via `expo-build-properties` and refuse silent debug signing on the release path (`withReleaseSigningGuard`). Debug-signed artifacts require an explicit local-test env flag and must never be labeled approved release candidates.
4. Record a dated Play policy review (API 36, Data safety draft, 16 KB page-size, account-specific testing). Built-artifact evidence remains pending.
5. Phase 59 status stays **blocked/provisional** until genuine acceptance requirements and operator approval exist. Local preparation does not authorize upload or launch.

## Consequences

- Stop before Phase 60.
- Preserve vault off, rooms/chat off for real users, live AI off, production billing off, Phase 50 deferred, Phase 49 live Google pending.
