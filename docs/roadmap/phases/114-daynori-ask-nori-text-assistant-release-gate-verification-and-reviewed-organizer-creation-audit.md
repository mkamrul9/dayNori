# Phase 114 — Daynori Ask Nori text-assistant release-gate verification and reviewed organizer creation audit

Group: V2 quality and release. Status is tracked in [progress](../progress.json), not inferred from this specification.

> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.

## Prerequisites

- [94 — Structured organizer tools and multi-action creation](94-structured-organizer-tools-and-multi-action-creation.md)
- [108 — AI text-assistant release-gate and operational review](108-ai-text-assistant-release-gate-and-operational-review.md)
- [113 — Daynori Google Drive provider-verification and authorized folder access audit](113-daynori-google-drive-provider-verification-and-authorized-folder-access-audit.md)

Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.

## Affected paths

- packages/domain
- apps/api
- apps/web
- apps/mobile
- docs/engineering
- docs/decisions
- docs/roadmap
- docs/phase-reports
- artifacts/phase114
- tests/integration
- tests/unit
- CHANGELOG.md

Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.

## Implementation steps

1. Author comprehensive commercial provider and operating decisions package in docs/engineering/ai-text-assistant-provider-and-operating-decisions.md covering Google Cloud Vertex AI (Gemini 1.5 Flash recommended primary), OpenAI (GPT-4o-mini wire protocol), zero training terms, DPA/SCC compliance, 30-day transient abuse logging, PII minimization, prompt token limits, unconditional vault exclusion, default-off journal opt-in, ephemeral storage, region pinning (us-central1 / europe-west1), .00/day and .00/month cost ceilings with concurrency-safe budget reservations, 3-tier kill-switch architecture, and strict synthetic-only testing protocol.
2. Implement and export isVaultAiTarget in packages/domain/src/aiConsent.ts to unconditionally reject vault entities and proposals attempting to set securityScope=vault with HTTP 403 vault_excluded.
3. Record truthful live provider execution status as blocked (DEF-V2-008 fail-closed) in artifacts/phase114/live-blocked.json due to missing live credentials and spending authorization; strictly prevent real user data transmission.
4. Author and execute 16 integration tests in tests/integration/phase114-ask-nori-assistant-release-gate.test.ts verifying consent fencing, server kill-switch (DAYNORI_AI_KILL_SWITCH=true returning 503), workspace isolation, default-off journal refusal and opt-in enablement, vault exclusion, grounded citations and abstention, cancellation via AbortController, error mapping (429/503), concurrency-safe budget reservation and 429 exhaustion, Note proposal flow, Journal proposal flow with date clarification, Deadline proposal flow with deadline clarification, idempotent retry, and zero-write cancellation.
5. Author and execute UI interface tests in tests/unit/phase114-ask-nori-ui-interface.test.ts verifying web AssistantPanel gating presentation under DEF-V2-008, disabled form inputs, proposal card review lifecycle, editable preview, explicit confirm/cancel actions, desktop sidebar/header navigation buttons, and canonical organizer deep links.
6. Author and execute mobile view tests in apps/mobile/src/phase114-assistant-mobile-views.test.ts verifying React Native AssistantSheet renders truthful gating banner under DEF-V2-008, disables ask action, updates input text, and handles close events.
7. Update function register docs/roadmap/v2/function-register.json with Phase 114 integration, UI, and mobile test coverage for assistant.consent, assistant.ask-grounded, and assistant.propose-confirm.
8. Author ADR 0114, Phase 114 report, evidence-summary.json, ai-capabilities-matrix.json, provider-evidence.json, update progress.json, CHANGELOG.md, and rebuild blueprint.

## Acceptance

- Comprehensive provider and operating decisions package prepared for owner review in docs/engineering/ai-text-assistant-provider-and-operating-decisions.md with zero model training, DPA/SCC compliance, and 30-day transient cap.
- Zero real user content transmitted to any AI provider; all testing executed strictly using synthetic prompts and fixtures.
- Live commercial AI provider integration recorded truthfully as blocked under DEF-V2-008 in artifacts/phase114/live-blocked.json.
- Vault items and proposals with securityScope=vault fail closed under isVaultAiTarget with HTTP 403 vault_excluded.
- Server kill-switch (DAYNORI_AI_KILL_SWITCH=true) immediately returns HTTP 503 AI_KILL_SWITCH_ACTIVE.
- Reviewed organizer creation lifecycle verified across Note, Journal, and Deadline flows: date ambiguity prompts clarification, editable preview allows modification, explicit confirmation writes durable mutation receipts (AI_DEVICE_ID), canonical deep links open created items, and cancelling produces zero writes.
- All 26 automated tests (16 integration, 8 UI unit, 2 mobile view) pass cleanly.
- Standing release gates (DEF-V2-001, DEF-V2-004, DEF-V2-005, DEF-V2-007, DEF-V2-008, DEF-V2-011, DEF-V2-013, OWNER-SIGNING-KEYS, OWNER-RELEASE-AUTH, Phase 71) remain strictly blocked.
- docs/roadmap/plan.json, progress.json, and blueprint.html updated and pass all planning validators.

## Verification and evidence

- node scripts/validate-planning.mjs
- node scripts/build-phase-plans.mjs --check
- node scripts/build-blueprint.mjs --check
- pnpm validate:function-register
- pnpm vitest run tests/integration/phase114-ask-nori-assistant-release-gate.test.ts tests/unit/phase114-ask-nori-ui-interface.test.ts apps/mobile/src/phase114-assistant-mobile-views.test.ts
- pnpm --filter @daynori/domain typecheck
- pnpm --filter @daynori/api typecheck
- pnpm --filter @daynori/web typecheck
- pnpm lint

Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.

## Documentation and handoff

- Write or update the phase report using [the report template](../../templates/phase-report.md).
- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.
- Record new design/security decisions as ADRs and link any deferred defects.
- State the next ready phase and stop after this phase unless the owner selected further work.

## Read before implementation

- [docs/roadmap/v2/README.md](../v2/README.md)
- [docs/decisions/0074-standing-phase71-scheduling-and-push.md](../../decisions/0074-standing-phase71-scheduling-and-push.md)
- [docs/decisions/0090-ai-provider-consent-privacy-and-operating-decisions.md](../../decisions/0090-ai-provider-consent-privacy-and-operating-decisions.md)
- [docs/decisions/0091-scoped-retrieval-indexing-and-grounding-quality.md](../../decisions/0091-scoped-retrieval-indexing-and-grounding-quality.md)
- [docs/decisions/0093-reviewed-note-task-and-journal-creation.md](../../decisions/0093-reviewed-note-task-and-journal-creation.md)
- [docs/decisions/0108-ai-text-assistant-release-gate-and-operational-review.md](../../decisions/0108-ai-text-assistant-release-gate-and-operational-review.md)
- [docs/decisions/0114-ask-nori-text-assistant-release-gate-and-reviewed-creation-audit.md](../../decisions/0114-ask-nori-text-assistant-release-gate-and-reviewed-creation-audit.md)
- [docs/phase-reports/phase-90.md](../../phase-reports/phase-90.md)
- [docs/phase-reports/phase-94.md](../../phase-reports/phase-94.md)
- [docs/phase-reports/phase-108.md](../../phase-reports/phase-108.md)
- [docs/phase-reports/phase-113.md](../../phase-reports/phase-113.md)
- [docs/phase-reports/phase-114.md](../../phase-reports/phase-114.md)
- [docs/engineering/ai-text-assistant-provider-and-operating-decisions.md](../../engineering/ai-text-assistant-provider-and-operating-decisions.md)
- [docs/engineering/release-gates.md](../../engineering/release-gates.md)

## Commit target

`test(ai): verify ask nori text assistant release gates and reviewed creation`

Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.
