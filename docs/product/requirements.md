# Requirements and acceptance criteria

Status: proposed, implementation pending. IDs below identify behavior, not completed work. All first-release criteria must pass on Android and responsive web unless a platform limitation is explicitly documented. Later criteria become binding at their own feature gate.

## Shared terminology and organization

A **module** is an app-owned capability such as Notes or Journal. A **folder** is part of one canonical workspace hierarchy inside an authorized personal or shared scope; it can contain mixed item types. An **item** is a persisted record such as a note, task, entry, event or file. A **tag** is a cross-cutting label. A **view** displays matching existing items, such as Notes filtering note records inside the same folders used by Files. A **section** is a later user-created composition of supported views and bounded structured fields. A **room** is an explicit collaboration boundary. A **routine** is a recurring definition; an **occurrence** is its scheduled completion record for one day.

## Delivery phase mapping

Use these references alongside the [roadmap source](../roadmap/plan.json). A reference identifies planned work, not completion; each phase still needs its acceptance evidence.

- R-ORG: Phases 14-15; R-CAPTURE: Phases 17, 19, 23, 25 and 30.
- R-NOTE: Phases 16-17; R-TASK: Phases 18-19; R-ROUTINE: Phases 20-21.
- R-JOURNAL: Phases 22-23; R-FILE: Phases 24-25; R-CALENDAR: Phase 26.
- R-REMINDER: Phases 03 and 27-29; R-PERSONALIZE: Phase 30; R-KNOWLEDGE: Phase 32; R-SEARCH: Phase 33.
- R-ACCOUNT: Phases 09 and 35-36; R-QUALITY: Phases 01-04, 34 and 37, plus each feature gate.
- R-EXPENSE: Phases 39-40; R-AUDIO: Phase 41; R-SECTION: Phases 42-43.
- R-VAULT: Phases 44-47; R-DRIVE: Phases 48-50; R-ROOM: Phases 51-54.
- R-AI: Phases 55-56; R-COMMERCIAL: Phases 57-60.

### R-ORG — Organization, first release

- Create, rename, reorder, move and archive canonical workspace folders. A folder may contain notes, tasks, routines, journal entries, knowledge items, events and files; module views filter those records without creating separate folder copies.
- Folder nesting has a documented finite depth, initially proposed at five levels. Prevent cycles and moving a folder into itself or a descendant.
- Every item has one primary folder or the workspace Inbox. Tags, favorites and module filters create views, not copies. Related links may refer to an existing item without changing its ownership.
- Empty folder names are rejected; trimmed Unicode names are accepted. Duplicate sibling names produce an actionable warning. The final duplicate-name rule must be consistent across clients and API.
- Moving an item preserves its stable ID, dates, reminders and links. Folder deletion never silently cascades through content: show a count and offer move contents or send contents to Trash.
- Acceptance: create Software > Guides and Government jobs > Applications; place a PDF, note and task together in Software > Guides; open the folder's All, Notes, Tasks and Files views; confirm each filtered view uses the same folder identity and records. Move the folder, reopen on the other client and confirm identities and references remain unchanged.

### R-CAPTURE — Fast capture, first release

- Global Create opens a short menu: Note, Task, Routine, Journal entry, Upload file. Advanced modules appear only when enabled and released.
- A blank workspace supports capture into Inbox. Folder selection is optional.
- Save states distinguish locally saved, synchronizing, synchronized and failed. Reopening a locally saved draft must recover its content after app interruption.
- Acceptance: sign in, skip onboarding, type a note, interrupt the app, reopen it and recover the draft or saved item with an honest status.

### R-NOTE — Typed notes, first release

- Create, edit, pin, archive, move, search and trash typed notes. Minimum editor: plain paragraphs, headings, bold, lists and checklists. Formatting uses a versioned safe document format; pasted HTML is not executable.
- Title is optional at capture; use a visible Untitled fallback. Empty drafts must not create clutter without an intentional save.
- Autosave preserves Unicode, multiline content and supported formatting. Undo/redo is available during the session.
- Conflicting changes from two devices retain both edits or a recoverable version with an explicit conflict flow; do not silently discard one body.
- Acceptance: edit a long multiline Bangla/English note offline, reconnect, verify round-trip formatting and recover competing changes from another client.

### R-TASK — Upcoming work, first release

- Task fields: title, optional description, folder, tags, priority, status, optional due date, optional due time, optional reminder, subtasks. Priority labels: Urgent, High, Normal, Low; Normal is the default.
- Upcoming tasks are one-off records. Completing one never creates tomorrow's copy.
- Views: Today, Upcoming, Overdue, Completed and by folder. Default Upcoming grouping uses due date, then priority and stable creation order; users can choose another sort.
- Date-only deadlines remain local calendar dates; timed deadlines preserve a timezone-aware instant and the selected timezone. UI shows the timezone when ambiguity matters.
- A task without a deadline is allowed. Overdue indicates an incomplete task whose deadline has passed. Clearing its deadline removes it from Overdue without completing it.
- Acceptance: add one date-only deadline and one timed deadline in Asia/Dhaka, view on a device in another timezone, change the deadline, complete the task and confirm Calendar and reminders use the updated record.

### R-ROUTINE — Daily routines, first release

- A routine definition contains title, folder, scheduled weekdays or daily frequency, optional local reminder time and explicit recurrence timezone. More complex recurrence is later scope.
- Scheduled occurrences are identified by routine and scheduled local date. Two devices completing the same day produce one completion record.
- At the next scheduled day, the checklist shows a fresh occurrence while past completion remains visible. Missed routines do not become one-off overdue tasks.
- Support Done, Not done and Skip for each scheduled date. Undo affects only that occurrence. Archiving stops future occurrences without erasing history.
- Editing title applies to the definition; schedule changes apply from the chosen effective date forward. Historical completion dates are not rewritten.
- Acceptance: complete Monday, skip Tuesday and leave Wednesday undone; reopen Thursday; confirm independent records, no duplicated completion after retry and no overdue task generated.

### R-JOURNAL — Reflection, first release

- Create typed entries with entry date, optional title, body, folder and tags. Several entries on one date are allowed. Created/updated timestamps are separate from the user-selected entry date.
- Offer Blank and a small optional prompt/template set. Prompts can be dismissed; no mandatory mood rating or streak pressure.
- Timeline and calendar-date navigation lead to the same entry. Backdating and revisiting are supported without losing original creation time.
- Editor autosaves drafts and protects against accidental navigation. Provide export, Trash recovery and search controls.
- Journal previews are hidden on Today and notifications by default. Search must offer a clear Journal scope and an option to suppress body snippets; the account setting governs all clients.
- Acceptance: start an entry, interrupt before synchronization, recover it, change the entry date, add a second entry that day, move it to a folder and confirm timeline/calendar agree.

### R-KNOWLEDGE — Guides and cheatsheets, first release

- Knowledge uses typed note content and the same folder/tag/link model, with a purpose flag or dedicated module view. A guide is not a second copy of a note.
- Support folders such as Software > TypeScript and Government jobs > Study guides, pinned reference items, searchable titles/bodies and links to files.
- Structured code blocks, table blocks, reusable templates and imported guides are later editor increments with accessibility checks.
- Acceptance: save a guide, link a PDF already in Files, change the guide title and confirm both references still open the canonical records.

### R-FILE — Private file library, first release

- Upload image, PDF, DOC and DOCX through the app into an authorized folder. Validate actual allowed type, size, quota and authorization on the server; client file extension checks alone are insufficient.
- Display upload progress, retry, cancel, pending scan/processing, failed and ready states. A failed transfer must not appear as a readable ready file. Retries must not create duplicate file records.
- Preview images and PDF with accessible download/open fallback. DOC/DOCX can be stored and downloaded; editable document conversion is excluded from this release.
- Private file access is authenticated. Expired preview links can be refreshed after authorization. Cached content follows logout and device-storage rules.
- Before launch, publish supported MIME types, per-file limit, account quota, unsupported-type messages and storage cost controls. Values are intentionally undecided in Phase 00.
- Acceptance: authorized upload to Software > PDFs; cancel/retry; exceed size/quota; deny another account's access; download and compare bytes with the original. Confirm an unsupported file is rejected without exposing content.

### R-CALENDAR — Calendar projections and private events, first release

- Provide month and agenda views with the user's week start, locale and timezone settings.
- Project task due dates and routine scheduled dates. Show optional journal-date indicators without revealing entry bodies.
- Allow optional standalone private events with title, start, end, all-day flag, timezone, folder and stable item ID. End cannot precede start. Date-only all-day ranges use an exclusive end date; timed events preserve timezone-aware instants and the selected timezone. External provider synchronization, attendees and invitations are excluded from Phase 26.
- Selecting a projected item opens the original record. Editing or completing it immediately updates other views after the same mutation is applied.
- Differentiate all-day deadlines from timed tasks; grouped counts expand rather than hiding content beyond an arbitrary row limit.
- Acceptance: change a task deadline; confirm it moves on Calendar without a duplicate. Create/edit/delete a private timed event and a multi-day all-day event; reject an invalid end; confirm source-record identity. Switch month, timezone and week start; verify date labels and agenda match the underlying date semantics.

### R-REMINDER — Notifications, first release

- Reminders are opt-in per item and per category. Request system permission after a user sets the first reminder, with an explanation and a useful in-app fallback after denial.
- Settings expose permission status, channel/category controls, timezone behavior, quiet hours and notification-content privacy.
- Reminder payloads contain stable IDs and minimal content. Tapping opens the authorized item; a deleted item produces a safe explanation.
- A completed, deleted, rescheduled or archived source cancels or replaces its outstanding reminders. Retries use the same occurrence identity to prevent duplicate scheduling.
- Choose and document multi-device delivery policy before implementation. Distinguish request accepted by a provider from actually displayed; background delivery depends on device/browser state and permissions.
- Acceptance: allow, deny and later revoke permission; set/reschedule/cancel a reminder; retry the worker; reboot the reference Android device; switch timezone; verify scheduling state and safe notification content.
- An exact audible alarm is a separate later feasibility gate. Android exact alarm use has platform and Play policy restrictions; do not label ordinary push delivery as a guaranteed alarm. See [Android scheduling guidance](https://developer.android.com/develop/background-work/services/alarms) and [Play exact-alarm policy](https://support.google.com/googleplay/android-developer/answer/16558241).

### R-SEARCH — Find without leaking, first release

- Search authorized titles and supported text bodies, folder names, tags and file metadata. File-content OCR and Drive-wide search are excluded.
- Filters include module, folder, tags, date and archived state. Results identify type and path; selecting opens the canonical item.
- Trash, other accounts and vault content are excluded by default. Journal snippet behavior follows R-JOURNAL.
- Acceptance: seed two accounts with matching titles; search each account; confirm isolation. Search Bangla and English content, change a title, trash an item and confirm results update.

### R-PERSONALIZE — Safe customization, first release

- Hide/show and reorder module shortcuts and Today cards; choose system/light/dark theme and supported accessible accents. Reset restores layout with no content deletion.
- Drag has button/keyboard alternatives. Hidden modules remain reachable through a modules directory and search.
- Preferences synchronize; viewport-specific layout adapts instead of forcing desktop coordinates onto a phone.
- Acceptance: hide Journal, reorder Files above Notes, change theme, reopen on another device, reset and confirm all content persists.

### R-ACCOUNT — Account, portability and retention, first release

- Support authentication, recovery, sign out, session management and reauthentication for sensitive account actions. Allow password managers and paste.
- Export normal workspace content in documented portable formats with stable IDs, hierarchy, relationships, dates and original file attachments. Export is a protected, expiring download.
- Trash retention is proposed at 30 days; the final policy must match the UI, jobs and privacy documentation. Restoration preserves record identity when feasible. Permanent deletion requires a clear confirmation.
- Account deletion cancels reminders, revokes sessions/connectors, deletes active records/files and describes any backup-retention period honestly.
- Acceptance: export a seeded workspace and inspect notes, tasks, routine history, journal dates and original bytes; sign out and confirm another session cannot read cached private content; execute deletion in a test account and verify completion evidence.

### R-QUALITY — Cross-cutting release behavior

- Test the promised offline scope, conflict recovery, app interruption, retry idempotency, poor connectivity and timezone transitions.
- Lists and search use bounded loading. A large file library must not download all original files to open a folder.
- Design and test empty/loading/error/offline/permission-denied/deleted states for every screen. Do not show a success state before durable acceptance.
- Establish measured performance budgets on a specified Android reference device and web test profile before feature work. Phase 00 numbers are proposals until baseline evidence exists.
- Follow [accessibility acceptance](../design/accessibility.md). No claim of accessibility or production readiness follows merely from writing these requirements.

## Later feature gates

### R-EXPENSE — Manual expenses

- Add/edit expense amount in exact decimal/minor units, original currency, date, category, payment label, note and optional receipt.
- Folder-like user categories, date-filtered summaries, monthly budget and portable export are supported. Multi-currency totals are separated unless a documented exchange-rate method exists.
- Acceptance: decimal rounding boundaries, refunds, category rename, date changes, monthly rollovers, export and scoped privacy. No banking credentials or automated advice.

### R-AUDIO — Recording and attachments

- Note creation remains keyboard-only. Audio recording is a deliberate separate recording/file action; linking its result into an existing item does not create a voice-transcribed note or replace the typed capture path.
- Explicit record action with contextual microphone permission, timer, stop, discard and playback. Denial retains access to typed capture.
- Audio can attach to a note/journal/knowledge item and live in Files; the item links to one attachment record. Mobile and browser support differences are visible.
- Before release: choose recording limits, formats, background/interruption behavior and accessibility alternatives. Acceptance covers incoming call/interruption, denied permission, quota, retry and deletion of original bytes.

### R-SECTION — User-created sections

- Create a named section using both approved views of existing records, such as filtered notes/tasks/routines/files/journal/expenses, and bounded typed-field blocks: text, checklist, date, number, link and attachments.
- Typed blocks store validated values with stable field/block identities and schema versions. Define bounds and supported options; a field migration must preserve values or produce a recoverable migration error. Removing a populated field/section offers confirmation and recovery/export of its values under the agreed Trash policy.
- Store versioned validated configuration, not arbitrary scripts, raw SQL, executable HTML or permissions. View blocks reuse authorized records, attachment fields link authorized file records and neither block type can turn personal data into room data.
- Templates start small; users can reorder blocks and remove a section without deleting its referenced source records. Unsupported block versions fail safely with a recovery option.
- Acceptance: create Study with a Software file view, Upcoming task list and text/date/checklist fields; fill the fields, reorder via touch and keyboard and migrate a supported schema version without losing values. Remove Study; confirm referenced sources persist, entered field values are recoverable during retention and forbidden scopes remain inaccessible.

### R-VAULT — Sensitive encrypted boundary

- Encrypt content before synchronization with a reviewed key lifecycle; PIN/biometrics unlock protected key access instead of merely hiding a screen.
- Decide encryption metadata exposure, PIN hardening, auto-lock, session suspension, device enrollment, recovery and lost-secret consequences before UI promises.
- Default exclusions: ordinary search, notifications with content, previews, AI, chat and shared rooms. Export is separately encrypted and intentionally unlocked.
- Acceptance requires independent security review plus PIN failure, biometric unavailable/changed, background lock, lost device, recovery, logout, metadata leakage and ciphertext-only server tests. A short PIN alone is not an adequate cross-device encryption secret.

### R-DRIVE — Optional connected folder

- A user chooses and authorizes a supported Drive folder workflow and can disconnect it. Show app-managed versus Drive-managed source and last sync/error status.
- Finalize provider scope feasibility before promising access to every arbitrary pre-existing folder. App uploads may target native app storage or the connected folder through an explicit choice.
- Define deletion, moved files, revoked tokens, offline cached content and conflicts. Disconnect stops access/jobs and does not delete remote Drive content without an explicit separate operation.
- Acceptance: folder selection, permitted upload, rename/move outside the allowed scope, revoked access, provider quota, conflict and disconnect; confirm unrelated Drive files are never indexed.

### R-ROOM — Rooms and chat

- Invite/accept, owner/editor/viewer roles, leave/remove, selected shared items and scoped chat. Permission is checked on every operation and download.
- Private notes, journal entries, vault and expenses remain personal unless a supported explicit share action is implemented. Vault sharing is excluded.
- Notifications respect membership and mute settings. Removed members immediately lose new authorized access. Reporting/blocking, invite abuse controls and retention/deletion behavior precede public availability.
- Acceptance: role matrix, guessed room/file IDs, invitation expiry, membership revocation while a connection is open, duplicated message retries and personal/shared search isolation.

### R-AI — Assistance with user control

- Opt-in provider disclosure, selected scope, source citations, usage limits and clear unavailable/failure states. User data is not training material by assumed consent.
- Read answers identify their supporting items. Proposed mutations show a preview and require explicit confirmation; unauthorized content is never retrieved into context.
- Vault exclusion, prompt-injection handling, deletion/retention, cost ceilings and evaluation datasets are gate requirements.
- Acceptance: known-answer citation tests, unknown answer abstention, malicious document instructions, another-account content, room revocation, unavailable provider and declined write proposal.

### R-COMMERCIAL — Payments and sustainable operation

- Entitlements are server-authoritative with clear restore/cancel/downgrade behavior. Store policy and billing rules are rechecked at implementation and release.
- Existing data stays readable/exportable after downgrade; new quota usage can be restricted transparently. No irreversible personal-content removal follows a payment failure.
- Acceptance: purchase/restore, duplicate webhooks, refunded/expired entitlement, offline status, grace period and downgraded export. Prices and tiers require cost modeling and user research first.
