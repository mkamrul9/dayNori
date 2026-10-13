# Phase 44 — Vault cryptography and recovery proof

Group: Vault and Drive. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [38 — Controlled private beta](38-controlled-private-beta.md)
- [03 — Platform and integration feasibility spikes](03-platform-and-integration-feasibility-spikes.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- tests/security vault prototypes
- docs/decisions
- docs/architecture/security-and-vault.md

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Select maintained audited crypto primitives and validate mobile/browser interoperability, KDF cost, authenticated encryption, and random generation.
2. Specify key hierarchy, device wrapping, strong recovery secret, PIN retry limits, biometric release, and unavoidable metadata leakage.
3. Review recovery, forgotten-secret loss, multi-device enrollment, key rotation, browser XSS limitations, and exclusions with an independent security reviewer.

## Acceptance

- Ciphertext from one supported platform decrypts correctly on the other using a verified enrollment path.
- A weak PIN is never the sole remotely brute-forceable encryption secret.
- A recorded security decision permits implementation or explicitly blocks vault release.

## Verification and evidence

- Run tamper/wrong-key/interoperability/KDF memory tests on actual supported devices.
- Review threat model and recovery usability; obtain independent review evidence before production vault claims.

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

`docs(vault): validate cryptography key management and recovery`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
