# Phase 47 — Web vault and security release gate

Group: Vault and Drive. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [45 — Encrypted vault records and sync protocol](45-encrypted-vault-records-and-sync-protocol.md)
- [46 — Android vault unlock and secure lifecycle](46-android-vault-unlock-and-secure-lifecycle.md)
- [05 — Responsive web navigation shell](05-responsive-web-navigation-shell.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- apps/web vault
- tests/security
- docs/phase-reports

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Implement browser key unlock/recovery and optional supported passkey/device interaction without claiming a universal fingerprint API.
2. Enforce strong CSP, trusted script boundaries, no decrypted server rendering, auto-lock, and careful local storage policy.
3. Re-run independent vault review, key loss/recovery tests, encrypted export drills, and platform disclosure; enable only after findings are resolved.
4. Provide the same authorized vault content and folder operations on web, keeping decrypted titles/bodies out of server-rendered HTML and client diagnostics.

## Acceptance

- Web and mobile exchange encrypted records through the approved enrollment scheme.
- Unsupported biometric environments use an honest supported fallback.
- No unresolved high/critical vault finding remains and limits of browser/device compromise are clearly disclosed.

## Verification and evidence

- Run browser XSS/CSP review, session/tab/lock lifecycle, tamper, interoperability, and recovery drills.
- Record independent review and re-test of remediations.

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/architecture/security-and-vault.md](../../architecture/security-and-vault.md)
- [docs/engineering/release-gates.md](../../engineering/release-gates.md)

## Commit target

`feat(vault): add reviewed web access and cross-platform security gate`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
