# Phase 109 — Voice-assistant verification and operational review

Group: V2 advanced capability gates. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [95 — Voice capture transcription and reviewed creation](95-voice-capture-transcription-and-reviewed-creation.md)
- [108 — AI text-assistant release-gate and operational review](108-ai-text-assistant-release-gate-and-operational-review.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- packages/domain
- apps/api
- apps/web
- apps/mobile
- docs/decisions
- docs/roadmap
- docs/phase-reports
- artifacts/phase109
- tests/integration

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Verify microphone hardware permission handling across supported browsers and mobile platforms, confirming accessible text fallback when hardware access is denied or unsupported.
2. Verify explicit record/stop/cancel lifecycle, confirming that cancel discards audio locally in memory with zero network calls and zero database rows, while duration (0.5s-600s) and payload size (<=25 MiB) limits are strictly enforced.
3. Verify speech recognition across Bangla (native Unicode script preservation), English, and code-switched (Banglish) inputs, alongside silence detection and low-confidence (<0.70) uncertainty flagging.
4. Verify upload resilience, idempotent retries via clientOperationId preventing duplicate records or double billing, and in-flight cancellation via AbortSignal clearing memory buffers.
5. Enforce editable transcript review preceding proposal generation, anti-hallucination task deadline clarification, explicit Save/Confirm proposal execution with durable sync mutation receipts (AI_DEVICE_ID), canonical deep links, strict 0-day transient retention (Buffer.alloc(0), zero raw audio in database), decoupled consent, server kill switch, and fail-closed release gating under DEF-V2-008 and DEF-V2-011.

## Acceptance

- Microphone permission denial provides clear accessible text fallback without feature lockout.
- Cancelling a recording discards captured audio locally without network egress or database rows.
- Duration bounds (0.5s-600s) and byte size bounds (<=25 MiB) strictly enforced.
- Bangla speech preserves native Unicode script; English and Banglish code-switched speech accurately transcribed.
- Silence and low confidence (<0.70) detected and flagged with uncertainty warning alerts.
- Interrupted uploads retried with identical clientOperationId return cached results without duplicate records or double-charging.
- In-flight cancellation via AbortSignal returns 499 AI_CANCELLED and zeroes server memory buffers.
- Audio transcription produces text into editable review surface before action proposals can be generated; transcription alone writes zero domain records.
- Ambiguous dates in task deadlines trigger clarifying questions rather than unreviewed tasks.
- Explicit Confirm/Save produces durable sync mutation receipts in app.mutation_receipts and canonical deep links to created items.
- 0-day transient audio retention verified: server memory zeroed, retention_policy set to transient_deleted, and zero raw audio columns in database.
- Microphone permission decoupled from external AI transmission consent (403 AI_CONSENT_REQUIRED); server kill switch halts transcription (503 AI_KILL_SWITCH_ACTIVE); multi-tenant workspace isolation enforced.
- Voice assistant remains gated fail-closed under DEF-V2-008 and DEF-V2-011.

## Verification and evidence

- pnpm vitest run tests/integration/phase109-voice-assistant-verification.test.ts tests/integration/phase95-voice-transcription-reviewed-creation.test.ts tests/integration/phase108-ai-assistant-release-gate.test.ts
- pnpm --filter @daynori/domain typecheck
- pnpm --filter @daynori/web typecheck
- pnpm --filter @daynori/mobile typecheck
- pnpm --filter @daynori/api typecheck
- pnpm lint
- node scripts/validate-planning.mjs
- pnpm validate:function-register

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/roadmap/v2/README.md](../v2/README.md)
- [docs/decisions/0095-voice-capture-transcription-and-reviewed-creation.md](../../decisions/0095-voice-capture-transcription-and-reviewed-creation.md)
- [docs/decisions/0108-ai-text-assistant-release-gate-and-operational-review.md](../../decisions/0108-ai-text-assistant-release-gate-and-operational-review.md)
- [docs/decisions/0109-voice-assistant-verification-and-operational-review.md](../../decisions/0109-voice-assistant-verification-and-operational-review.md)
- [docs/phase-reports/phase-95.md](../../phase-reports/phase-95.md)
- [docs/phase-reports/phase-108.md](../../phase-reports/phase-108.md)
- [docs/engineering/release-gates.md](../../engineering/release-gates.md)

## Commit target

`test(voice): verify voice assistant capture uncertainty and reviewed creation pipeline`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
