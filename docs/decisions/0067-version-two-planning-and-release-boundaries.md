# ADR-0067: Version 2 planning before public launch closure

- Status: accepted for planning and scheduling; proposed runtime decisions require their own phase evidence.
- Date: 2026-10-25, Asia/Dhaka.
- Related: [V2 roadmap](../roadmap/v2/README.md), [current progress](../roadmap/progress.json), [release gates](../engineering/release-gates.md), ADRs 0065–0066.

## Context

The owner requested a detailed Version 2 roadmap covering a complete redesign, simple progressive navigation, per-feature action-based tours, Help/contact/feedback, mobile-specific layouts, notifications, performance/security, and an optional RAG/voice creation assistant with an original companion. The owner explicitly requested planning now and individual Antigravity implementation prompts later, then clarified no emoji and professional icons.

Phase 60 is blocked, Phases 61–62 retain native/store blockers, and Phase 63 is an unstarted post-launch review. Treating a new owner-directed plan as completion of Phase 63 would fabricate launch/operating evidence. Renumbering earlier phases would damage handoff history.

## Decision

Append V2 Phases 64–103 to the canonical plan. Select Phase 64 as documentation-only planning, independent of the unfulfilled Phase 63 post-launch review. Preserve every existing phase definition, status, and report. After planning completion, clear the active pointer and identify Phase 65 as next eligible, requiring separate owner selection before implementation.

Reuse shared domain, API, sync, consent/proposal, icon, and token boundaries. Plan platform-specific web/PWA and native Android interfaces rather than a universal UI rewrite. The feature register must distinguish authorization, release capability, and personal visibility.

Keep existing security/privacy/release gates intact. No live AI, notification delivery, vault/rooms/billing activation, external messages, credentials, purchase, deployment, submission, or release tag follows from this decision. Full V2 scope remains blocked if required external gates are not met; smaller previews need accurate claims and any scope reduction needs a recorded owner decision.

The tour engine is planned as a versioned evolution of existing onboarding, with actual-action predicates and persisted progress. The assistant retains explicit reviewed confirmation before generated changes execute. Nori is a proposed original Daynori companion, not an integration with ChatGPT Pets. New runtime ADRs must settle offline boot, feature registry, tour contracts, feedback roles, provider/retention, and any new mutation tools before those phases implement material changes.

## Alternatives considered

- Reuse Phase 63: rejected because its required public-launch and operating-period evidence does not exist.
- Replace the original roadmap: rejected because it would blur incomplete gates and rewrite phase history.
- Implement immediately under Phase 60: rejected because the owner asked for a roadmap and future phase-by-phase prompts, not an application rewrite now.

## Consequences

The canonical plan, generated specs, progress, overview, blueprint, changelog, and Phase 64 report stay in one planning commit. The current preview remains unchanged. New work is selectable through explicit dependencies, including independent progress while advanced-provider phases are blocked.

## Validation and revisit

Run phase/blueprint generation checks, planning dependency/link validation, changed-document formatting, secret scanning, diff review, and history-preservation checks. Phase 65 must replace this limited baseline with observed per-function readiness. Revisit when scope changes, a legacy gate is resolved, prototypes change the navigation, or provider/device/operating evidence changes a release assumption.
