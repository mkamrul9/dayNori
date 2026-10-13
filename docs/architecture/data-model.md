# Domain and data model

This is the logical model. The phase that introduces an entity must supply its migration, validation, access policy, fixtures, indices and lifecycle tests. Names below are stable vocabulary, not final SQL.

## Ownership and scope

- `profile`: keyed by Auth user ID; display name, preferred locale, IANA time zone, week start and preferences. Locale and currency are independent settings.
- `workspace`: UUID, `kind=personal|room`, owner, status and timestamps. Signup creates exactly one personal workspace idempotently.
- `membership`: workspace/user unique key, role, state and revision. Personal workspaces have only their owner in the first release. Initial room roles are `owner|editor|viewer`; invite does not grant access until accepted. Later role additions need an explicit permission matrix and migration.
- Every tenant entity has `workspace_id`, UUID ID, server `revision`, creation/update actor and time, and `deleted_at`. An item's composite `(workspace_id, id)` foreign keys prevent cross-tenant parent and attachment references.
- Room membership never implies access to a personal workspace. Personal items may be shared only through an explicit copy or later audited grant flow. Vault items cannot be shared to rooms in the initial vault release.

All list, search, sync, aggregate, export, object-signing and job paths must authorize this ownership model. Query parameters, object key prefixes and UUID unpredictability do not enforce access by themselves.

## Organization

- `section`: workspace, built-in view kind or custom kind, name, icon token, semantic accent token, visibility, sortable rank, approved view filters and configuration schema version. Built-in identities survive renaming. Sections are navigation/views, not item ownership boundaries.
- `folder`: workspace, optional parent, name, rank, security scope and lifecycle. The canonical workspace hierarchy can contain mixed item kinds; `Software` may contain notes, PDFs, guides and todos. Prevent cycles and use a proposed maximum depth of five for the first release, validated in the feasibility/organization phases. A folder cannot cross workspaces/security scopes. Vault uses its own encrypted hierarchy within that scope.
- `item`: common identity and routing metadata: workspace, nullable primary folder, kind, archive/pin state, rank and security scope. A null primary folder means Inbox. It has one corresponding typed payload record and appears in any permitted section view whose filters match. Ordinary titles may live in their typed record; vault title and user-visible metadata live inside ciphertext.
- `tag`, `item_tag`, `item_link`: many-to-many organization within the same workspace. Links cannot circumvent permission or security boundaries.
- `view_preference`: user, workspace, section/view, filters, density and field visibility. Presentation changes do not mutate item content.

Use sparse fractional ranks for drag reorder; serialize changes to the affected sibling collection, periodically rebalance in one transaction, and conflict-check the collection revision. Ordering must have stable ID tie-breakers. New UUIDs are client-generated for offline creation; server time/revision are authoritative.

Deleting a non-empty folder requires an explicit command: move contents to its parent/root, or trash the entire subtree. Both commands have a preview/count and undo policy. Hide/remove a built-in section from navigation without silently destroying its content. Trash is distinct from archive.

## Typed content

- `note`: title, typed text/document schema, optional checklist blocks and word count. Initial editing is typed only; rich formatting, if introduced, is a constrained document schema rather than raw HTML.
- `journal_entry`: title/body, user-selected local entry date, recorded time zone, optional mood/tags/prompts and private attachment links. Multiple entries per day are allowed. A day view groups entries without overwriting them. No streak pressure or required mood score.
- `file_item`: user-visible filename, MIME classification, bytes, provider reference, SHA-256 when available, ingest status, scan status, preview state and original retention state. Its binary may have multiple immutable `file_version` records; do not overwrite an object in place.
- `audio_recording`: a file-backed item with duration, codec, capture status, transcript status and explicit processing consent. Recording is a separate intentional file action; the saved file may link to an existing typed note, journal or knowledge item through one canonical attachment record. Keyboard-only note creation remains separate and initial recording does not transcribe a note. Interrupted recording remains a recoverable draft; any later transcript is derived data with its own consent/deletion lifecycle.
- `guide`/`cheatsheet`: supported content templates using the same typed note/document representation and folder model. A template is not a new executable domain.

Attachments use `attachment_link` from a permitted source item to a file item in the same workspace and security scope. The client cannot attach another user's file by knowing its ID. File binary deletion waits until all permitted references and retention rules are resolved.

## Planning: todos and routines are different entities

- `todo`: title/body, status, priority `low|normal|high|urgent` with default `normal`, optional due date, optional due instant and zone, start date, completion time, project/folder and reminder rules. UI labels are Low, Normal, High and Urgent; transport uses the lowercase values. A date-only deadline is a local calendar date, not midnight UTC. Optional subtask dependencies are introduced only with cycle checks.
- `routine`: recurring daily/weekly rule, local scheduled time, IANA zone, effective local start/end dates, optional reminder and pause state. A routine is the template, not the completion record.
- `routine_occurrence`: routine ID, rule revision, occurrence local date, planned instant, status `pending|done|skipped`, completion instant and optional note. Unique `(routine_id, occurrence_key)` makes refresh/retry unable to duplicate a day. Date-based recurrence uses a stable local-date key; subdaily recurrence is out of scope initially.
- Changing a routine rule affects future occurrences from a chosen effective date; prior completion history is immutable except an explicit correction command. Unchecking today's occurrence cannot uncheck yesterday. Deleting a routine preserves archived history unless the user explicitly erases it.
- `calendar_event`: one private item with title, primary folder/Inbox, stable item ID, start, end, all-day flag and selected IANA zone. All-day events use a date-only start and exclusive end date strictly after start. Timed events use instants with end strictly after start while preserving the selected zone. The calendar read model combines events, upcoming todos and selected routine occurrences without storing a second todo copy. Initial events have no attendees/invitations or external provider sync.
- `reminder_rule`, `reminder_occurrence`, `notification_delivery`: schedule intent, materialized occurrence and transport attempts are distinct. Revision and occurrence keys allow cancellation/rescheduling without duplicate sends.

Offline Today derives the current local date with the saved zone, not by cutting a UTC timestamp. A travel/zone preference change prompts the user to keep a routine's existing zone or move future occurrences. History retains the original zone. Define DST gaps as move to the next valid instant and repeated times as the earlier instant, unless the user explicitly chooses otherwise; test both even when the first audience uses Asia/Dhaka.

## Expenses

- `expense`: initial kind `expense|income|refund`, nonnegative amount in currency minor units, ISO currency, local transaction date, optional occurred instant/zone, category, account/payment label, note and receipt link. Validate currency exponent; serialize large integers as decimal strings to avoid JavaScript precision loss. Transfers are later scope.
- `expense_category`, `expense_account`, `budget`: owner-configurable organization and planning; no bank linking or credential collection in the first release.
- Reports aggregate one currency at a time. Never silently add BDT and USD; optional later conversions store the original amount, explicit rate/source/time and rounding rule.
- Proposed refund contract for Phase 39 validation before migration: a refund references an original expense in the same workspace/currency, uses a nonnegative minor-unit amount, and reduces spending in the original category during the refund's transaction-date reporting period. It never becomes new income. Partial refunds are allowed; cumulative active refunds cannot exceed the original amount unless a separately planned audited override exists. Lock/check the original and aggregate inside the mutation transaction, including duplicate retry, concurrent refunds and original edits; do not let an amount/currency edit invalidate prior refunds. Preserve references in exports and explain cross-month negative category spending.
- Receipt files are normal private file attachments. Import/retry uses the common operation idempotency receipt; it must not double-book a financial entry.

## Safe custom sections

Custom sections compose approved existing-record view blocks and/or a template-backed structured collection. View blocks filter authorized canonical notes/tasks/routines/files/journals/expenses without copying content. Separately, `section_template`/schema defines the initial typed field set: text, checklist, date, number, link and attachment. A checklist holds bounded entries with stable IDs, typed text and completion state; it is not a single checkbox. Link values use allowlisted safe URL schemes or authorized item IDs. Attachments reference an authorized canonical file in the same security scope. Additional selection/boolean/formula field types need a later explicit contract rather than appearing by default.

`custom_record` stores a bounded, versioned JSON payload validated against that immutable schema revision; it still has the normal item identity and primary workspace folder. Collection schema identity is stable and independent of the navigation section's display name. Use relational columns for identity, ownership, lifecycle, relations, sorting and indexed queries. Do not turn every built-in domain into an untyped EAV or JSON bucket.

Maximum field count, record payload size and nesting are specified in contracts. Renaming a field keeps its stable field ID. Removing/changing a field type requires a preview and migration; preserve values in a reversible archived representation until the user accepts erasure. No user-authored formulas, scripts, URLs for automatic fetch, or custom HTML in the first extensibility release.

## System records

- `client_device`: owner, device ID, platform, last sync time, acknowledged cursor, notification capabilities and revocation state.
- `operation_receipt`: actor/device/op ID, canonical payload hash, result and retention. Distinct from an expense receipt image.
- `workspace_change`: commit-ordered sequence, entity ID/kind/revision, operation and safe projection/tombstone.
- `outbox_event`, `job`: durable intent, lease, attempts, next run and bounded error metadata.
- `upload_session`: workspace, reserved file ID/key, expected limits, expiry and finalization state.
- `provider_connection`: consented owner, provider, approved scopes, status and encrypted server token reference. Tokens never appear in sync projections.
- `vault_key_envelope`, `vault_record`: only encrypted payloads and the minimum routing/version metadata; see [vault design](security-and-vault.md).
- Future `room`, `invitation`, `message`, `ai_consent`, `ai_run`, and `subscription_entitlement` are deferred contracts, not first-release tables.

## Index and integrity plan

Start with `(workspace_id, deleted_at, updated_at, id)` for browsing, folder/rank and item-kind indices for section views, todo due/status indices, journal date indices, unique routine occurrence keys, unique operation IDs, unique change sequences, and due-job partial indices. Scope text search indices by workspace and exclude vault. Add indices based on actual query plans; each index has write/storage cost.

Every mutation updates the common item and typed payload atomically. Enforce the valid item kind/payload pairing through the application transaction and database constraints/triggers chosen in that phase. Validate tenant foreign keys, folder cycles, immutable actor/ownership fields, MIME/size, required currency, dates and revision preconditions on the server as well as the client.

## Migration rules

SQL migration files are append-only after shared use. Use expand/backfill/contract migrations while old clients remain supported. Never deploy a destructive schema change before the minimum supported client version, backups, data validation and rollback path are ready. JSON document and custom-field schemas carry explicit versions; decode old versions and migrate deliberately.
