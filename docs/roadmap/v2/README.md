# Daynori Version 2 roadmap

Planning baseline: 2026-10-25, Asia/Dhaka. Owner-selected planning only. Implementation starts only when the owner selects an individual phase. The follow-up instruction requires professional icons and no emoji in application-authored interfaces.

## The outcome

Daynori should be pleasant and dependable enough to use every day: easy to understand on a phone, quiet at first, complete when needed, and able to explain its own features. Users can work manually or ask an optional daily assistant to help them find and create content. A guided tour teaches by letting the user operate the actual app.

“Production quality” means passing usability, data recovery, authorization, device, performance, and operational gates. A polished screenshot, a passing build, or an existing feature file cannot establish that the complete app is ready.

This is a product version name, not a claim that a public Version 1 has shipped. The package remains at its current version until release preparation chooses and verifies a version scheme.

## What is known today

This baseline combines repository inspection, existing reports, owner feedback, and dated public research. It is not a fresh authenticated end-to-end audit or physical-phone test.

- [Progress](../progress.json) records Phase 60 as blocked; the [Phase 60 report](../../phase-reports/phase-60.md) records a free testing preview, incomplete physical-device and authenticated-account evidence, and open public-release gates.
- The preview excludes file uploads, audio attachments, reminder delivery, rooms/chat, live AI, and billing. Existing implementations and local tests for these features do not make them available in that preview.
- [ADR 0066](../../decisions/0066-offline-shell-and-safe-pwa-updates.md) documents that cold offline reopen serves a public offline page rather than reconstructing the private organizer. This is a V2 reliability requirement to resolve safely.
- The current tutorial uses three introductory steps and optional practice creation inside its tutorial surface. It does not provide action-verified coverage of every feature through the app's real controls. See `apps/web/src/components/OnboardingTutorial.tsx` and the [Phase 31 report](../../phase-reports/phase-31.md).
- Help currently contains short how-tos and shortcuts. Support explicitly says a monitored inbox is not configured. V2 needs actual feedback delivery, developer access to reports, and a verified human contact route.
- Web and native Settings contain developer-oriented surfaces such as component galleries or provisional integration controls. Their exact visibility must be inventoried, then separated from everyday preferences.
- Existing screenshots inspected for this plan are historical evidence, including `artifacts/web-e2e/today-light-mobile-320px.png` and `settings-bangla-desktop.png`. They help identify density and hierarchy questions; they do not prove the current deployed appearance. Phase 65 captures a fresh baseline.
- [AI phases 55 and 56](../../phase-reports/phase-56.md) are provisional and blocked on live-provider, privacy, and release evidence. Reuse their consent, retrieval, proposal, and mutation-receipt boundaries rather than creating an unrelated assistant backend.

The app is suitable for controlled preview evaluation of its enabled scope. This evidence does **not** support “all functions are ready.” Phase 65 produces the definitive per-function verification register.

## Decisions for the V2 experience

1. **Few things in front, everything easy to reach.** Today, Plan, Library, and Journal remain the starting navigation model. A searchable All features directory, contextual actions, and optional pins reveal depth. Phase 66 validates whether a hidden Journal tab should use an existing slot or leave three tabs; do not add a second competing navigation system.
2. **Personalization controls visibility.** Hide modules, remove Today widgets, and restore them easily. Hidden content remains intact. “Hidden by me,” “not released,” and “not authorized” are different states. Never confuse a preference with authorization.
3. **A complete visual redesign.** Use coherent typography, spacing, alignment, professional line icons, hierarchy, responsive composition, empty states, and restrained motion. Retain Daynori's paper/ink/teal identity as the starting direction; compare alternatives before freezing tokens. No emoji in app-authored navigation, controls, Help, tours, notifications, assistant interface, or marketing screens. Preserve emoji in user-created content.
4. **Mobile gets its own layouts.** Mobile web/PWA may use different composition, bottom sheets, full-screen editors, condensed metadata, and thumb-accessible actions. Native Android has its own platform components. Share contracts and behavior, not a forced desktop layout.
5. **First use is a journey.** Fast startup, a short welcome, polished sign-up/sign-in/recovery, optional interests, and a first useful action. Native launch screens and browser-controlled PWA launch behavior differ; do not insert a slow artificial splash on every route.
6. **Learning happens in the real interface.** A short starter tour leads into optional chapters for every released feature. Each action step waits for a verified user action and its result, with Skip, Pause, Resume, Back, Restart chapter, and replay from Help.
7. **Help is part of each feature.** Concise instructions beside unfamiliar actions; searchable task-based articles; contextual launch into the relevant tour. Keep engineering explanations in developer documentation.
8. **Feedback reaches a person.** Bug reports, suggestions, and contact requests have a real durable intake, safe diagnostics, delivery status, and a developer triage surface. A form that only displays a success toast is insufficient.
9. **AI is an optional way to work.** Text or voice can become a note, journal entry, task, routine, event, or approved section. Grounded answers cite authorized material. Generated changes are editable previews followed by explicit Save/Confirm, then a durable receipt and link to the item.
10. **A distinct daily companion.** Working name: **Nori**. Proposed original design: a small folded-paper companion with a teal body, simple ink features, and a restrained warm accent. Phase 96 validates name, originality, size, motion, and final design. It opens the same assistant; users can hide it or choose an ordinary labeled button. This is a Daynori feature, not a ChatGPT Pets integration.

## Delivery order and release boundaries

Forty appended phases, **64–103**, preserve all existing phase IDs and reports. Phase 64 is this planning milestone. Phases 65–103 are specifications, not implemented features. The [canonical plan](../plan.json), [progress register](../progress.json), and generated [phase specifications](../phases) own dependencies and status.

- **64–68: readiness and design foundations.** Inventory every function, settle navigation, design complete desktop/mobile journeys, then implement validated primitives.
- **69–77: everyday app redesign and reliability.** Separate desktop, PWA, and native shells; improve first use, planning, writing, files/audio, expenses/sections, and offline recovery.
- **78–83: instruction, tours, and support.** Build Help, the tour engine, complete chapters, report submission, and developer triage/contact.
- **84–89: delivery channels and advanced feature gates.** Prove mobile push, native reminders, vault, Drive, rooms, and billing separately. External prerequisites can block these phases; they do not need to block independent UI work.
- **90–96: the daily assistant.** Choose and verify provider privacy, improve retrieval, build text chat, confirmed creation, multi-step tools, voice, and Nori.
- **97–103: release evidence.** Security, speed, accessibility, beta, release preparation, explicitly authorized publication, and a bounded review.

The owner may select any ready phase whose dependencies and actual prerequisite evidence pass. Work on one phase at a time. Recommended order is numerical; independent work can continue if a gated phase is blocked. Do not issue implementation prompts or run subsequent phases until the owner asks.

The full requested V2 target includes every currently planned module. A smaller preview may ship during development, but must list its enabled scope and missing functions honestly. Hiding an unfinished module does not satisfy the owner's “all functions” target. If a vault audit, provider account, moderation owner, payment decision, or device is unavailable, leave the affected phase blocked. Any reduction of the full target requires a recorded owner decision and revised claims; never silently defer it.

Existing V1 gates remain binding. V2 planning does not depend on Phase 63's post-launch review because no completed public launch exists to review. [ADR 0067](../../decisions/0067-version-two-planning-and-release-boundaries.md) records this owner-directed scheduling amendment. It neither completes nor waives Phases 37–63. New phase evidence must link any legacy gate it resolves, with explicit reviewed supersession before changing old statuses.

## Phase catalog

<!-- V2-PHASES:START -->

- [64 — Version 2 product and delivery planning](../phases/64-version-2-product-and-delivery-planning.md)
- [65 — Version 2 function inventory and readiness baseline](../phases/65-version-2-function-inventory-and-readiness-baseline.md)
- [66 — Simple navigation personalization and developer boundaries](../phases/66-simple-navigation-personalization-and-developer-boundaries.md)
- [67 — Original visual direction and responsive journey prototypes](../phases/67-original-visual-direction-and-responsive-journey-prototypes.md)
- [68 — Design tokens components icons and motion](../phases/68-design-tokens-components-icons-and-motion.md)
- [69 — Desktop shell and focused Today experience](../phases/69-desktop-shell-and-focused-today-experience.md)
- [70 — Mobile web and PWA layout redesign](../phases/70-mobile-web-and-pwa-layout-redesign.md)
- [71 — Native Android interface and navigation parity](../phases/71-native-android-interface-and-navigation-parity.md)
- [72 — Welcome startup onboarding and authentication polish](../phases/72-welcome-startup-onboarding-and-authentication-polish.md)
- [73 — Tasks routines and calendar workflow completion](../phases/73-tasks-routines-and-calendar-workflow-completion.md)
- [74 — Library writing journal and search completion](../phases/74-library-writing-journal-and-search-completion.md)
- [75 — Files and audio attachment readiness](../phases/75-files-and-audio-attachment-readiness.md)
- [76 — Expenses and safe custom sections completion](../phases/76-expenses-and-safe-custom-sections-completion.md)
- [77 — Safe offline reopen sync and upgrade recovery](../phases/77-safe-offline-reopen-sync-and-upgrade-recovery.md)
- [78 — Complete contextual Help and user instructions](../phases/78-complete-contextual-help-and-user-instructions.md)
- [79 — Action-verified resumable tour engine](../phases/79-action-verified-resumable-tour-engine.md)
- [80 — Everyday guided practice chapters](../phases/80-everyday-guided-practice-chapters.md)
- [81 — Advanced recovery and optional-feature tour coverage](../phases/81-advanced-recovery-and-optional-feature-tour-coverage.md)
- [82 — Durable bug suggestion and contact submissions](../phases/82-durable-bug-suggestion-and-contact-submissions.md)
- [83 — Developer feedback triage and verified support contact](../phases/83-developer-feedback-triage-and-verified-support-contact.md)
- [84 — Mobile PWA push and reminder delivery proof](../phases/84-mobile-pwa-push-and-reminder-delivery-proof.md)
- [85 — Native Android reminder and notification readiness](../phases/85-native-android-reminder-and-notification-readiness.md)
- [86 — Vault review recovery and release gate closure](../phases/86-vault-review-recovery-and-release-gate-closure.md)
- [87 — Google Drive connection and scope readiness](../phases/87-google-drive-connection-and-scope-readiness.md)
- [88 — Rooms chat and staffed moderation readiness](../phases/88-rooms-chat-and-staffed-moderation-readiness.md)
- [89 — Billing entitlements and sustainable plan readiness](../phases/89-billing-entitlements-and-sustainable-plan-readiness.md)
- [90 — AI provider consent privacy and operating decisions](../phases/90-ai-provider-consent-privacy-and-operating-decisions.md)
- [91 — Scoped retrieval indexing and grounding quality](../phases/91-scoped-retrieval-indexing-and-grounding-quality.md)
- [92 — Text assistant chat and contextual guidance](../phases/92-text-assistant-chat-and-contextual-guidance.md)
- [93 — Reviewed note task and journal creation](../phases/93-reviewed-note-task-and-journal-creation.md)
- [94 — Structured organizer tools and multi-action creation](../phases/94-structured-organizer-tools-and-multi-action-creation.md)
- [95 — Voice capture transcription and reviewed creation](../phases/95-voice-capture-transcription-and-reviewed-creation.md)
- [96 — Nori original companion and assistant launcher](../phases/96-nori-original-companion-and-assistant-launcher.md)
- [97 — Version 2 security privacy and recovery audit](../phases/97-version-2-security-privacy-and-recovery-audit.md)
- [98 — Measured performance and resource optimization](../phases/98-measured-performance-and-resource-optimization.md)
- [99 — Accessibility responsive and fresh-user acceptance](../phases/99-accessibility-responsive-and-fresh-user-acceptance.md)
- [100 — Full Version 2 beta and readiness reconciliation](../phases/100-full-version-2-beta-and-readiness-reconciliation.md)
- [101 — Version 2 release candidate and operational preparation](../phases/101-version-2-release-candidate-and-operational-preparation.md)
- [102 — Authorized Version 2 publication and live verification](../phases/102-authorized-version-2-publication-and-live-verification.md)
- [103 — First Version 2 review and bounded follow-up plan](../phases/103-first-version-2-review-and-bounded-follow-up-plan.md)

<!-- V2-PHASES:END -->

## Supporting specifications

- [Design references, visual direction, navigation, and mobile layouts](design-and-mobile.md).
- [Readiness inventory and complete feature/tour coverage](feature-coverage.md).
- [Action-based guided tour contract](guided-tours.md).
- [Help, feedback, and developer contact](help-and-feedback.md).
- [RAG, creation tools, voice, and Nori](assistant.md).
- [PWA notification capabilities and evidence](notifications.md).
- [Performance, security, migration, and release acceptance](quality-and-release.md).
- [Antigravity phase handoff rules](antigravity-handoff.md).

## Definition of the finished V2

- Every in-scope feature in the readiness register passes its actual web/PWA and Android journeys, permissions, failure/retry behavior, and applicable provider gate. Native iOS availability remains separately gated; iPhone PWA support is tested as web support.
- A new user can sign up, skip or finish onboarding, create and reopen content, find every enabled feature, get contextual help, submit feedback, and contact a named support channel.
- Complete tours operate the actual controls on desktop, narrow mobile web, and native Android, without forcing users to finish one enormous tutorial.
- Personalization removes unwanted sections without losing data; developer tools do not clutter ordinary Settings and cannot be accessed by unauthorized users through direct URLs or API requests.
- The assistant supports the agreed creation tool catalog through text and voice, explains citations and uncertainty, preserves manual workflows, and never saves unreviewed generated content.
- Measured performance, accessibility, authorization, backup/restore, migration, and real-device requirements pass. Support and operations have accountable owners. No “blazing fast,” “fully secure,” or “all ready” claim substitutes for this evidence.

No completion dates are promised before the inventory and design prototypes establish scope. Missing external decisions are recorded when their phase is selected, with a concrete deliverable ready for owner review where applicable.
