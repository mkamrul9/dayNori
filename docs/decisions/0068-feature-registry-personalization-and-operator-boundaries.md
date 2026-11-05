# ADR-0068: Feature registry, personalization, and operator boundaries

- Status: accepted for Phase 66 implementation.
- Date: 2026-10-25, Asia/Dhaka.
- Related: [Phase 66](../roadmap/phases/66-simple-navigation-personalization-and-developer-boundaries.md), [information architecture](../design/information-architecture.md), ADR 0036 (Today layout), ADR 0067 (V2 planning).

## Context

Phase 65 inventoried developer galleries, synthetic vault harnesses, and provisional integration panels appearing in ordinary Settings (DEF-V2-010). Users also need a simple way to find every enabled feature within two navigation actions, pin/hide modules without losing content, and keep Settings/Help/account/Search/All features reachable. Release capability, actor authorization, and personal visibility must stay separate axes.

## Decision

1. **Shared feature registry** — Trusted, typed definitions and pure eligibility live in `@daynori/domain`. Platforms map destinations only. Inputs stay separate: (A) release/capability for environment and platform, (B) actor auth/membership/operator, (C) personal hide/pin/order. Hiding never grants or revokes authorization or release.

2. **Preference ownership** — `featurePersonalization` is a **user-profile** preference (`DisplayPreferences`), migrated deterministically from absent values and legacy `homeLayout.moduleShortcuts`. Unknown/stale IDs are dropped; protected utilities cannot be personalized away. `expectedRevision` conflict behavior is preserved. Preferences never encode operator authority.

3. **Journal hide behavior** — Hiding Journal leaves **three** primary shell tabs (Today, Plan, Library). No competing fifth tab or alternate navigation system is introduced. Journal remains reachable via All features (and authorized search contracts unchanged).

4. **All features** — Directly reachable from the shell (header/sidebar). Path `shell → All features → destination` counts as two navigation actions. Directory search includes personally hidden modules for restore. Developer tools are excluded for ordinary users.

5. **Operator authorization** — Deny-by-default allowlist `DAYNORI_OPERATOR_USER_IDS` (comma-separated UUIDs). Workspace ownership is not operator authority. Client flags, query params, and editable profile metadata cannot grant developer access. Web surfaces `/developer`, `/review`, `/dev/vault-harness` require `GET /v1/operator/session` success plus OperatorGate UI (loading state shows no privileged content). Native developer modals/deep links are gated the same way. Operator access does **not** open production vault/rooms/AI/billing gates.

6. **Legitimate recovery** — Sync diagnostics, recovery export, portability, and account deletion remain available to ordinary authenticated users with existing safeguards; they are not moved behind the operator gate.

## Alternatives considered

- Treat workspace owner as developer: rejected — owners are not platform operators.
- UI-only hiding of developer links / NODE_ENV checks alone: rejected — insufficient authorization.
- Self-service “make me developer” toggle or preference flag: rejected — fail-closed allowlist only.
- Replace Journal with a fifth permanent module tab when hidden: rejected — keeps competing navigation.

## Consequences

Ordinary Settings no longer expose galleries, vault harnesses, or provisional integration harness panels. Pins/hides persist through user preferences. Future Help/tour phases reuse eligibility decisions without shipping the Phase 65 function register as runtime navigation data. Physical Android/TalkBack and production operator grants remain separate evidence.

## Validation and revisit

Domain unit tests cover eligibility combinations, migration, and allowlist denial. API operator session returns 403 for non-operators. Revisit when a trusted operator identity provider replaces env allowlist, when Journal primary-tab policy changes, or when gated modules flip `moduleReleased` under real release gates.
