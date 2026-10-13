# Delivery roadmap

This roadmap contains **64 bounded phases, numbered 00–63**. Phase 00 is planning; Phase 01 establishes runnable foundations. Each phase has its own implementation instructions, acceptance, verification, references and suggested commit. There are no calendar promises or estimated completion dates. Size phases by reviewable outcomes; split a phase when implementation exposes more work.

## Current state

Read [progress](progress.json) and the actual [phase reports](../phase-reports/README.md). Future phase files are specifications, not completion evidence. Start the next selected phase only after its prerequisites are complete. Phase 00 stops after planning and a local commit; it does not start application implementation automatically.

## Milestones and release boundaries

- 00: planning baseline and contributor handoff.
- 01–15: toolchain, design, isolated accounts, offline synchronization and folders.
- 16–37: personal notes, upcoming tasks, daily routines, journaling, files, calendar, reminders, onboarding, guides, search, portability and core quality.
- 38: controlled private beta; this is the first full personal organizer milestone.
- 39–43: optional expenses, audio and user-created structured sections.
- 44–47: independently reviewed encrypted vault; do not enable before its release gate.
- 48–50: Drive scope decision, selected-file connection and optional full folder mirroring.
- 51–54: explicit shared rooms, authorized shared data, chat and moderation.
- 55–56: opt-in AI retrieval and reviewable actions.
- 57–60: subscriptions, capacity/operations proof, current Play policy gate and public Android/web release.
- 61–62: iOS adaptation and release, with native/store gates.
- 63: a bounded post-launch review and append-only next roadmap.

Optional modules are released behind their own gates. Public launch does not depend on every advanced module: it depends on the tested enabled scope. The vault, chat, AI and Drive cannot be marketed before their specific gates pass. Phase 50 may be deferred with evidence if Google access/verification prerequisites are unavailable; a deferred feature is excluded from claims and is never treated as implemented.

## Execute one phase

1. Read [the handoff](../engineering/handoff.md), inspect Git, and select a ready phase from progress.
2. Check prerequisite reports and all Read before implementation links.
3. Implement the bounded steps, then run meaningful checks and inspect the result on affected platforms.
4. Write the phase report, update documentation/CHANGELOG/progress, and review the staged diff.
5. Create one professional local phase commit. Leave a concise next-phase handoff.

Status meanings: planned = unstarted; in_progress = being worked; complete = evidence and checks satisfy the phase; blocked = required prerequisite prevents completion with a stated reason; deferred = owner-approved optional scope excluded from the current release with a stated reason. Do not infer success from the existence of a specification.

## Phase specifications

### Planning — 00

- [00 — Product and architecture baseline](phases/00-product-and-architecture-baseline.md)

### Foundation and sync — 01–15

- [01 — Toolchain and executable workspace](phases/01-toolchain-and-executable-workspace.md)
- [02 — Continuous checks and contributor automation](phases/02-continuous-checks-and-contributor-automation.md)
- [03 — Platform and integration feasibility spikes](phases/03-platform-and-integration-feasibility-spikes.md)
- [04 — Design tokens and accessible primitives](phases/04-design-tokens-and-accessible-primitives.md)
- [05 — Responsive web navigation shell](phases/05-responsive-web-navigation-shell.md)
- [06 — Android navigation shell](phases/06-android-navigation-shell.md)
- [07 — PostgreSQL and tenant isolation foundation](phases/07-postgresql-and-tenant-isolation-foundation.md)
- [08 — API contracts and service foundation](phases/08-api-contracts-and-service-foundation.md)
- [09 — Authentication across web and Android](phases/09-authentication-across-web-and-android.md)
- [10 — Personal workspace and preferences](phases/10-personal-workspace-and-preferences.md)
- [11 — Local data repositories and migrations](phases/11-local-data-repositories-and-migrations.md)
- [12 — Server mutation receipts and change feed](phases/12-server-mutation-receipts-and-change-feed.md)
- [13 — Shared client synchronization engine](phases/13-shared-client-synchronization-engine.md)
- [14 — Collections folders and shared item metadata](phases/14-collections-folders-and-shared-item-metadata.md)
- [15 — Folder browsing and organization interfaces](phases/15-folder-browsing-and-organization-interfaces.md)

### Personal organizer and private beta — 16–38

- [16 — Typed note domain and persistence](phases/16-typed-note-domain-and-persistence.md)
- [17 — Focused note editor on both platforms](phases/17-focused-note-editor-on-both-platforms.md)
- [18 — Upcoming task domain and deadlines](phases/18-upcoming-task-domain-and-deadlines.md)
- [19 — Upcoming task lists and detail views](phases/19-upcoming-task-lists-and-detail-views.md)
- [20 — Daily routine schedules and occurrences](phases/20-daily-routine-schedules-and-occurrences.md)
- [21 — Daily routine experience and history](phases/21-daily-routine-experience-and-history.md)
- [22 — Journal entries and privacy defaults](phases/22-journal-entries-and-privacy-defaults.md)
- [23 — Journal writing and reflection interfaces](phases/23-journal-writing-and-reflection-interfaces.md)
- [24 — Private binary upload lifecycle](phases/24-private-binary-upload-lifecycle.md)
- [25 — Files folders and safe previews](phases/25-files-folders-and-safe-previews.md)
- [26 — Calendar and deadline views](phases/26-calendar-and-deadline-views.md)
- [27 — Reminder scheduling and durable delivery jobs](phases/27-reminder-scheduling-and-durable-delivery-jobs.md)
- [28 — Android notifications and local reminders](phases/28-android-notifications-and-local-reminders.md)
- [29 — Web reminder delivery and PWA support](phases/29-web-reminder-delivery-and-pwa-support.md)
- [30 — Today home and personal customization](phases/30-today-home-and-personal-customization.md)
- [31 — First-use tutorial and progressive discovery](phases/31-first-use-tutorial-and-progressive-discovery.md)
- [32 — Knowledge guides and cheatsheet organization](phases/32-knowledge-guides-and-cheatsheet-organization.md)
- [33 — Global authorized search and filters](phases/33-global-authorized-search-and-filters.md)
- [34 — Conflict recovery and offline hardening](phases/34-conflict-recovery-and-offline-hardening.md)
- [35 — Portable export and controlled import](phases/35-portable-export-and-controlled-import.md)
- [36 — Account deletion backup and recovery lifecycle](phases/36-account-deletion-backup-and-recovery-lifecycle.md)
- [37 — Core quality and usability release gate](phases/37-core-quality-and-usability-release-gate.md)
- [38 — Controlled private beta](phases/38-controlled-private-beta.md)

### Personal extensions — 39–43

- [39 — Expense tracking domain](phases/39-expense-tracking-domain.md)
- [40 — Expense capture reports and budgets](phases/40-expense-capture-reports-and-budgets.md)
- [41 — Audio recording and attachment lifecycle](phases/41-audio-recording-and-attachment-lifecycle.md)
- [42 — Safe custom section schema and renderer contracts](phases/42-safe-custom-section-schema-and-renderer-contracts.md)
- [43 — Custom section builder and personal templates](phases/43-custom-section-builder-and-personal-templates.md)

### Vault and Drive — 44–50

- [44 — Vault cryptography and recovery proof](phases/44-vault-cryptography-and-recovery-proof.md)
- [45 — Encrypted vault records and sync protocol](phases/45-encrypted-vault-records-and-sync-protocol.md)
- [46 — Android vault unlock and secure lifecycle](phases/46-android-vault-unlock-and-secure-lifecycle.md)
- [47 — Web vault and security release gate](phases/47-web-vault-and-security-release-gate.md)
- [48 — Drive scope and external folder feasibility](phases/48-drive-scope-and-external-folder-feasibility.md)
- [49 — Drive selected-file connector](phases/49-drive-selected-file-connector.md)
- [50 — Optional external Drive folder mirroring](phases/50-optional-external-drive-folder-mirroring.md)

### Rooms and chat — 51–54

- [51 — Shared rooms invitations and roles](phases/51-shared-rooms-invitations-and-roles.md)
- [52 — Shared content sync and revocation](phases/52-shared-content-sync-and-revocation.md)
- [53 — Room chat and realtime events](phases/53-room-chat-and-realtime-events.md)
- [54 — Collaboration safety and policy gate](phases/54-collaboration-safety-and-policy-gate.md)

### AI assistant — 55–56

- [55 — AI provider privacy and retrieval foundation](phases/55-ai-provider-privacy-and-retrieval-foundation.md)
- [56 — AI assistant and confirmed organizer actions](phases/56-ai-assistant-and-confirmed-organizer-actions.md)

### Business and public launch — 57–60

- [57 — Entitlements subscriptions and purchase lifecycle](phases/57-entitlements-subscriptions-and-purchase-lifecycle.md)
- [58 — Reliability scale and operating cost gate](phases/58-reliability-scale-and-operating-cost-gate.md)
- [59 — Google Play and web launch preparation](phases/59-google-play-and-web-launch-preparation.md)
- [60 — Public Android and web release](phases/60-public-android-and-web-release.md)

### iOS — 61–62

- [61 — iOS platform parity and native adaptation](phases/61-ios-platform-parity-and-native-adaptation.md)
- [62 — iOS store release gate](phases/62-ios-store-release-gate.md)

### Post-launch review — 63

- [63 — First post-launch review and next roadmap](phases/63-first-post-launch-review-and-next-roadmap.md)

## Feature traceability

The stable product requirement IDs and full feature coverage are encoded in [plan.json](plan.json). The planning checker requires every R-* requirement in [requirements](../product/requirements.md) to map to existing phases.

- **Responsive web and Android apps**: R-QUALITY; phases 01, 05, 06, 38, 60.
- **Typed notes**: R-NOTE, R-CAPTURE; phases 16, 17.
- **Prioritized upcoming todos and deadlines**: R-TASK; phases 18, 19, 26.
- **Independent daily repeating tasks**: R-ROUTINE; phases 20, 21.
- **Private journaling and reflection**: R-JOURNAL; phases 22, 23.
- **User-created nested folders across item types**: R-ORG; phases 14, 15.
- **Images PDFs and document upload/storage**: R-FILE; phases 24, 25.
- **Guides cheatsheets and internal links**: R-KNOWLEDGE; phases 32.
- **Section reorder hide/show and personalization**: R-PERSONALIZE; phases 30, 31.
- **User-created new structured sections**: R-SECTION; phases 42, 43.
- **Calendar with upcoming tasks**: R-CALENDAR; phases 26.
- **Reminders notifications and alarm feasibility**: R-REMINDER; phases 03, 27, 28, 29.
- **Expense tracker**: R-EXPENSE; phases 39, 40.
- **Audio recording**: R-AUDIO; phases 03, 41.
- **PIN and biometric encrypted sensitive vault**: R-VAULT; phases 44, 45, 46, 47.
- **Drive connection uploads and optional folder mirroring**: R-DRIVE; phases 48, 49, 50.
- **Shared rooms memberships and chat**: R-ROOM; phases 51, 52, 53, 54.
- **Optional AI assistant**: R-AI; phases 55, 56.
- **Onboarding tutorial and non-overwhelming UX**: R-CAPTURE, R-PERSONALIZE, R-QUALITY; phases 04, 30, 31, 37.
- **Paid product and Google Play release**: R-COMMERCIAL; phases 57, 58, 59, 60.
- **Offline sync export recovery and account deletion**: R-ACCOUNT, R-QUALITY; phases 11, 12, 13, 34, 35, 36.
- **Code quality phase reports tests and professional Git history**: R-QUALITY; phases 00, 01, 02, 37, 63.
- **Future iOS support**: R-QUALITY; phases 61, 62.

- **Global authorized search and offline coverage**: R-SEARCH; phases 33, 34.

## Updating the plan

The canonical source is plan.json. Individual phase specifications are generated; phase reports contain actual evidence. To refine an unstarted phase, edit the canonical source, record the rationale/ADR if material, then run:

```powershell
node scripts/build-phase-plans.mjs
node scripts/build-blueprint.mjs
node scripts/validate-planning.mjs
```

Run commands from the repository root. Preserve completed phase IDs and reports; append new phases rather than renumbering history. Keep dependency edges explicit. Risky features can proceed in parallel after their independent prerequisites are met, but each contributor still owns one selected phase and avoids shared-file edits.
