# V2 function and learning coverage

Status: Phase 65 completed a machine-readable inventory at [`function-register.json`](function-register.json) with narrative baseline [`readiness-baseline.md`](readiness-baseline.md). This document remains the **minimum coverage floor** and learning/repair map; per-action readiness and evidence live in the register. No action is `release_ready` from this inventory alone.

## Readiness record

Each function/action records: stable feature ID; user benefit; entry points; implementation paths; web/PWA/Android/native-iOS applicability; actual release capability; current readiness; dependencies; API/domain authorization; happy path; input validation; offline/retry/conflict/permission behavior; tour chapter/step; Help article; relevant test commands; observed evidence with environment/revision/date; owner; blocker; and next phase.

Allowed readiness labels distinguish unverified, verified local, verified staging/provider, verified physical device, release-ready, blocked, and owner-deferred. These belong to the feature register; phase statuses keep the existing roadmap schema. Do not infer readiness from a status field or a test filename. Record a real defect rather than claiming that this initial inspection tested the deployed function.

An action must map to at least one acceptance journey, article, and learning treatment. Phase 65 enumerates exact existing actions from contracts, routes, and user controls; the grouped list below is a coverage floor rather than an assertion that every lower-level action is already listed.

## Required feature families

- **Account and first use** — welcome; sign-up; verification where required; sign-in; recovery; session expiry/outage; sign-out; account/device switch; workspace selection; preferences. Implementation: 72, 77. Learning: 80; dangerous account deletion is explained safely in 81.
- **Home and navigation** — Today; Plan; Library; Journal; search; Create; All features; pins; hide/show/reorder; reset layout; theme; text size; language; privacy settings. Implementation: 66, 69–71. Learning: 80.
- **Tasks** — create/edit; title/details; priority; date-only/timed deadlines; subtasks; complete/undo; move/tags/favorite/archive/trash/restore as supported; upcoming/overdue/completed filters. Implementation: 73. Learning: 80.
- **Routines** — define daily/weekdays/timezone; edit effective date; complete/not-done/skip/undo occurrence; history; archive; tomorrow's independent occurrence. Implementation: 73. Learning: 80.
- **Calendar** — agenda/month; timezone/week start; tasks/routine projections; create/edit/delete private timed/all-day events; open canonical sources. Implementation: 73. Learning: 80.
- **Notes and knowledge** — write/format; autosave; undo; guides; safe links; pin/favorite; templates where implemented; move/tag/archive/trash/restore; long English/Bangla content. Implementation: 74. Learning: 80.
- **Journal** — multiple entries per date; backdate; write/edit/reopen; optional prompts; hidden previews; folder/tag; attachment; export; conflict recovery. Implementation: 74, 75, 77. Learning: 80–81.
- **Folders and library** — Inbox; nested hierarchy; mixed items; filtered views; create/rename/move/reorder/archive/trash/restore; no-cycle/depth validation; clear filters; canonical item links. Implementation: 74. Learning: 80.
- **Search** — authorized global and scoped search; type/folder/tag/date filters; clear filters; journal snippets; hidden-module option; deep-link result; offline coverage and unavailable search explanation. Implementation: 74, 77. Learning: 80–81.
- **Files** — upload supported types; validate size/quota; progress; cancel/retry; scan/processing; preview/fallback; download; move; delete; offline cache controls; expired-link refresh. Implementation: 75. Learning: 81.
- **Audio attachments** — permission; record/pause/resume/stop where supported; review/playback; attach; upload/retry; delete original bytes; quota. This is separate from assistant transcription. Implementation: 75. Learning: 81.
- **Expenses** — create/edit/delete; currency/category/date; budgets/reports; filters; export; privacy; no unsafe floating-point money changes. Implementation: 76. Learning: 81.
- **Custom sections** — create from approved blocks; reference items; fill typed fields; validate; reorder via accessible controls; edit/migrate; remove/recover without deleting referenced items. Implementation: 76. Learning: 81.
- **Offline and portability** — local save vs cloud sync; pending queue; restart/cold offline reopen; conflict/revision recovery; update/later; export/import including binaries and invalid import; Trash retention; account erasure and restore suppression. Implementation: 77, 97. Learning: 81 with safe demonstrations.
- **Reminders** — contextual opt-in; channel and privacy; create/reschedule/cancel; quiet hours/timezone; per-device status; denied/revoked permission; test notification; deep link; multi-device deduplication policy. Implementation: 84–85. Learning: 81.
- **Vault** — setup; unlock/lock; supported encrypted items/attachments; recovery; enrollment/revocation; export; lost-secret explanation. Implementation: 86 after independent review. Learning: 81 only when enabled; never send vault data to the assistant.
- **Drive** — connect/select approved scope; managed copy/reference distinction; import/upload/sync/status/conflict; expired/revoked authorization; disconnect; safe remote deletion rules. Implementation: 87. Learning: 81.
- **Rooms and chat** — invite/accept; role controls; select/share approved items; history/message/edit/delete; leave/remove; block/report; mute; membership revocation and attachment access. Implementation: 88. Learning: 81 using synthetic invited participants only.
- **Billing** — actual plan/limits; approved purchase route; restore; cancel; grace/expiry/refund; downgrade; preserve read/export/delete. Implementation: 89. Learning: 81 without real tutorial charges.
- **Assistant** — opt-in/disclosure; source scope; grounded ask; citations; abstention; history/delete; cancel/retry; usage limits; review/edit/confirm proposals; receipt and open-created item; voice input; correct transcript; Nori launcher/hide/reduced motion. Implementation: 90–96. Learning: 81 and feature-local chapter updates in each assistant phase.
- **Help and support** — searchable instructions; relevant article; start/resume/replay tour; troubleshoot; report bug; suggest improvement; contact developer; track submission; safe diagnostic review; withdraw/delete where supported. Implementation: 78–83. Learning: 80–81.
- **Developer and operations** — restricted component gallery, harnesses, safe diagnostics, feedback triage, delivery failures, audit trail, feature release switches. Implementation: 66, 83, 97. Ordinary-user tour excludes these; a separate restricted operator guide covers them.

## Coverage gates

Phase 65 inventories and identifies missing journeys; it is not asked to repair every domain in one commit. Phases 73–77 and 84–96 repair bounded feature families. Split an unexpectedly large repair into appended phases before continuing rather than silently expanding a phase.

Phase 80 covers everyday chapters. Phase 81 implements advanced chapter definitions and safe gating; later phases activate and verify their own feature-specific chapters after the feature gate passes. Phase 100 requires all in-scope features to have current functioning chapters, verified entry points, Help, and passing real-environment evidence. A dormant chapter definition is not a completed user tutorial.
