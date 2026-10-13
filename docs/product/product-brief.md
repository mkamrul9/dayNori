# Daynori product brief

Version: 0.1. Planning date: 2026-10-13, Asia/Dhaka.

**Working name:** Daynori. The name is provisional and not legally cleared; see [naming](naming.md).

## Product promise

Daynori is a calm personal home for everyday life: capture a thought, plan work, repeat a routine, write a journal, organize files and find what matters from the same account on Android and the web. The user chooses which parts to see and how to organize them. iOS follows after the first release has been validated.

The product should replace scattered organization without making the user build a database before writing a note. Every module must have a useful default, a fast capture path and predictable organization. The long term ambition is broad; the first release must be small enough to trust.

## Primary users and jobs

- **Student or job applicant:** keep study notes, guides, application documents and deadlines together; organize folders such as Software and Government jobs; repeat daily preparation tasks.
- **Working professional:** capture typed notes, retrieve reference documents, prioritize upcoming work, follow routines and reflect privately.
- **Person managing home life:** keep household plans, recurring chores, meaningful memories and eventually expenses in one place; optionally share a room later.

These are hypotheses, not researched personas. Before UI implementation, interview at least five prospective users across these jobs, including Android users with intermittent connectivity. Record actual language, current workflows, first three features they need and reasons they would pay. Do not use interview counts as proof of market demand.

## Principles that decide tradeoffs

1. **Useful immediately:** typing a note and adding a task require no folder setup.
2. **Personal by choice:** modules can be hidden, reordered and pinned without deleting their data.
3. **One record, many views:** a task on Today, in a folder and on Calendar is the same task; a view must not create another copy. One canonical workspace folder can hold a note, a PDF and a task together; Notes and Files filter that same hierarchy by item type.
4. **Trust is visible:** saving, pending synchronization, permission denial and conflicts have clear states.
5. **Private by default:** content is personal until an explicit share flow is completed. A future shared room never inherits personal journal or vault content.
6. **Calm density:** show the next action and reveal advanced controls when needed. Do not fill Today with every module or upsell.
7. **Portable data:** usable export and deletion are launch requirements, not rewards for paying.

## First public release: personal organizer

The first release targets Android and responsive web with these capabilities:

- Account, sessions, privacy settings, data export and deletion.
- Today overview, quick capture and skippable onboarding.
- Typed notes and typed knowledge notes for cheatsheets/guides, with a small supported formatting set.
- Upcoming tasks with priorities, deadlines, subtasks and reminders.
- Daily routines with independent completion per scheduled day.
- Journaling with a distraction-free editor, folders, dates and gentle optional prompts.
- Private file library with user-created canonical workspace folders and nested folders, image/PDF previews and DOC/DOCX attachment storage/download. The same folder can contain notes, files and tasks.
- Calendar agenda and month views showing task due dates, routine occurrences and a journal-date indicator, plus optional standalone private events with title, start/end, all-day status and timezone. External calendar synchronization is later scope.
- Authorized cross-module search, tags and favorites.
- Permission-aware reminders and notification settings; delivery limitations must be stated honestly.
- Personalization of module visibility/order, Today cards, theme and a small accessible accent selection.
- A documented offline contract for core text capture, task updates and routine completion. File transfer and uncached content may require connectivity. This is a release gate, not a claim that sync is already solved.

This release includes safe customization of existing modules. User-created sections follow later and support both authorized views of existing records and bounded structured fields such as text, checklist, date, number, link and attachments. They use templates and versioned schemas that preserve saved values through migrations.

## Planned expansion, in gated increments

**Personal depth:** manual expense tracking, budgets, audio recording/attachments, improved knowledge templates and configurable sections. Note creation remains keyboard-only; recording is a separate audio/file workflow which can link an attachment into an existing item. It does not become voice transcription or change the typed note capture path.

**Sensitive vault:** a separate encrypted data boundary with PIN and available device biometrics, tested recovery and lock behavior. An app screen lock alone does not meet this requirement. Web unlock behavior must be designed independently; fingerprint availability cannot be promised across browsers.

**Connections:** optional Google Drive integration limited to an approved connected folder workflow, clear source badges, disconnect behavior and conflict handling. Direct app upload remains supported. Full-drive indexing and silently importing unrelated files are excluded.

**Shared rooms:** explicit invitations, membership roles, selected shared content, chat, moderation/reporting and retention rules. Personal folders never become shared merely because a room was opened.

**AI assistance:** opt-in questions over selected content, source links, understandable usage costs and review before any write action. Vault data stays outside the assistant by default; any future inclusion requires a separately reviewed security design and explicit per-use consent.

**Commercial release:** validate pricing and sustainable storage/support costs, then implement billing and entitlements. Never lock users out of export or hide existing data after a downgrade. iOS and broader localization follow their own device and store gates.

## Explicit exclusions until separately planned

- A medical, financial advice or emergency alarm product.
- Arbitrary scripts/plugins or user-authored executable section code.
- A complete Google Docs/Word editor, OCR, handwriting recognition or automatic file-content extraction.
- Guaranteed background execution, guaranteed notification timing or reliable browser alarms while the browser is closed.
- End-to-end encryption of the entire normal workspace. The encrypted vault is a separate planned feature with different search, sync and recovery constraints.
- Public social feeds, anonymous rooms and cross-account sharing by default.
- Bank-account connections, currency exchange automation and accounting/tax compliance.

## Proposed success measures

The following are test targets to refine with research, not production telemetry results:

- At least four of five usability participants can create a typed note, a deadline task and a folder without coaching.
- At least four of five can explain the difference between a recurring daily routine and an upcoming task after onboarding.
- A participant can find a previously saved PDF using its folder or search in under 30 seconds in a seeded 100-item workspace.
- The main capture journey can be completed with keyboard-only input on the web and TalkBack on Android.
- Onboarding can be skipped at every step; a first useful item can be saved without accepting notifications.
- No released view displays another account's item, private journal text in telemetry or vault content through ordinary search.

Collect consented events such as `note_created`, `task_completed` and `search_succeeded` without titles, bodies, file names, amounts or journal mood. Any analytics implementation requires a documented retention and consent decision.

## Decisions that remain open

Record answers before the relevant phase begins:

- Final brand clearance, domain and immutable store application identifiers.
- Hosting region, storage pricing, upload limits, free/paid limits and budget.
- Which browsers, minimum Android version and low-end reference device to support.
- Default week start and first supported UI languages; English first is a planning assumption. Unicode/Bangla user content must work from the beginning.
- Exact offline mutation scope and conflict UI agreed with architecture.
- Reminder behavior when several devices are active, and whether a distinct audible alarm mode merits its own native implementation.
- Journal search-preview privacy defaults and vault recovery experience validated with users.

Detailed behavior is in [requirements](requirements.md). Design work starts from [information architecture](../design/information-architecture.md), not from a feature-filled home screen.
