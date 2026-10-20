# Integrations, reminders and shared features

Status: later feature design constraints; private core precedes external integrations.

## Reminder intent and schedule

Store reminder rules separately from tasks/routines/journals/events. A rule defines the target, before-due offset or local schedule, IANA time zone, recurrence, quiet-hour behavior, channels and privacy level. Materialize occurrences within a rolling horizon with a unique `(rule_id, rule_revision, occurrence_key)` key. Save the rule and scheduling outbox intent in one transaction.

Worker jobs check that the rule/target is still active and at the expected revision immediately before dispatch. Completing a todo, pausing a routine, changing a deadline or deleting a target invalidates pending occurrences. Clients reconcile local schedules on every applicable edit, sync, startup, timezone change and permission change. Cancellation has a race with a notification already presented; it cannot erase a user's prior observation.

Specify local date/zone behavior and DST rules from [the data model](data-model.md). Do not build routines by adding 24 hours repeatedly to UTC time. Notification time defaults to the chosen schedule zone; travel behavior is user-visible. Priority affects organization and optional notification styling, not an automatic interruption of quiet hours.

## Local, push and duplicate behavior

- Local notification: the device schedules known upcoming occurrences and can alert while offline, subject to OS permission and scheduling limits.
- Server push: durable job sends Android FCM or browser Web Push, later APNs. Use generic privacy-preserving text by default. Do not put journal/expense/vault content in a payload. A deep link rechecks identity/access after opening.
- In-app reminder center: persists authorized reminder status and overdue items. It remains useful when push is denied or late.

Choose one delivery mode per occurrence/device: mobile local when scheduling is acknowledged, otherwise push; browser uses push when subscribed. Track schedule revision, local acknowledgment and capability heartbeat. Retries reuse the occurrence/delivery identity. Clients deduplicate in-app processing using that identity, but OS-rendered local/push alerts cannot be guaranteed exactly once after stale-device, offline-edit or crash races. Test the fallback policy and disclose delivery as best effort. Do not send unconditional local and push alerts for the same occurrence.

FCM accepting a message does not mean a device displayed it; offline state, Doze, TTL and collapse behavior affect delivery. Set a bounded TTL based on the reminder's useful lifetime, and remove invalid registration tokens. Keep `accepted`, `opened` and any observed client receipt distinct from `delivered`. [FCM message lifetime](https://firebase.google.com/docs/cloud-messaging/customize-messages/setting-message-lifespan). Reviewed 2026-10-13.

Ask for notification permission after the user creates a reminder or opts in during the tutorial. A denial leaves ordinary app features usable and shows capability status with a route to settings. Test foreground/background/killed app, reboot, denied/revoked permissions, battery saving, duplicate/retry, timezone/DST and stale schedule cancellation on physical Android hardware. Browser tests include unsupported permission/service-worker environments.

## Alarm mode is a separate gate

Ordinary reminders are not guaranteed exact alarms. Android exact scheduling requires the appropriate permission and runtime checks. Current official guidance says `SCHEDULE_EXACT_ALARM` is not pre-granted for many fresh installs and can be revoked; Play restricts `USE_EXACT_ALARM` to qualifying core alarm/timer/calendar uses. The presence of a calendar tab alone must not be assumed to qualify this broader organizer. [Android alarm guidance](https://developer.android.com/develop/background-work/services/alarms), [Play policy](https://support.google.com/googleplay/android-developer/answer/16558241). Reviewed 2026-10-13; recheck during store submission.

Begin with best-effort reminders and do not declare restricted exact/full-screen permissions. A later opt-in alarm mode needs a native feasibility build, current Play policy assessment, precise denial/revocation fallback, reboot tests and an honest capability label. Expo's notification APIs support local/push notifications; exact behavior depends on the pinned SDK/platform version. [Expo notifications](https://docs.expo.dev/versions/latest/sdk/notifications/). Do not promise medical or safety-critical alarm reliability.

## Calendar

The app calendar reads internal tasks/events/routine occurrences. It does not initially sync a device calendar or Google Calendar. Keep date-only tasks separate from timed events and let users filter sources. Calendar imports/exports later use documented ICS semantics and explicit timezone conversion. External calendar editing is another consented integration, not a hidden side effect of creating an internal todo.

## Google Drive: authorization before folder mirroring

Primary storage supports in-app upload without Drive. Drive is optional linked storage, not a required account or an implicit backup.

Start with the recommended narrow `drive.file` scope and a supported Google Picker/identity flow. It grants access to files the app creates or the user explicitly grants to it. Google's guidance recommends per-file access. This is not a documented recursive grant to every existing or future external file inside a picked folder; treat that distinction as a scope constraint, and prove behavior with a permission spike. [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth). Reviewed 2026-10-13; rechecked 2026-10-19.

**Phase 48 decision (ADR 0046):** product promises use **selected/app-created-file mode** under `https://www.googleapis.com/auth/drive.file` only. Do not promise recursive folder mirroring. Live Google-account matrix remains owner-gated (`tests/spikes/drive`); missing OAuth config must not invent broader-scope success. Broader/restricted scopes stay deferred pending live evidence, current verification requirements, and a quote-required assessment/cost review when restricted-scope server storage applies. **Phase 50 (2026-10-20):** external folder mirroring recorded as **deferred** (not implemented); see `docs/phase-reports/phase-50.md`.

**Phase 49 provisional connector (ADR 0047):** local persistence, PKCE intents, AES-256-GCM refresh-token storage, disconnect fencing, and web/Android connection UI are implemented. Production Google selection fails closed without OAuth configuration and `DAYNORI_DRIVE_PRODUCTION_ENABLED=true`. Fake provider results are not live verification. Vault activation remains disabled.

Deliver in two modes only after approval of the integration phase:

1. Narrow linked-files/app-created-folder mode (**chosen default**): app-created uploads and explicitly picked files are visible. Show which files are authorized, refresh failures and whether bytes live in Drive or app storage. A folder's externally added files may require explicit selection — do not assume parent selection authorizes children.
2. Arbitrary selected-folder mirror: discover pre-existing/new externally added files only after confirming the required broader read/write scopes, user consent, verification/security-assessment obligations and acceptable ongoing cost. Scope that OAuth consent to its true breadth; application filtering to one folder does not narrow Google's token permissions. If those obligations are not satisfied, keep this capability deferred and describe the narrow mode accurately.

The scope table classifies broader Drive read/full access as restricted; qualification and assessment requirements must be rechecked at implementation. Do not request full Drive access during basic signup merely to avoid doing the narrow-mode work. Vault material remains excluded from ordinary Drive connectors.

## Drive connector mechanics

- Use official supported OAuth authorization flows and appropriate client types, external browser/system UI, state/PKCE and allowlisted redirects as applicable. Do not assume a generic custom-scheme OAuth redirect is supported on Android. Keep server-owned refresh tokens encrypted and separate from app sync; never embed client secrets in a native app. Validate the exact supported Android authorization/server-grant path in the spike. [Native OAuth guidance](https://developers.google.com/identity/protocols/oauth2/native-app), [OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies). Reviewed 2026-10-13.
- Persist provider file ID, connection ID, parent references, metadata revision/checksum and last successful sync. Local folders and Drive folders are linked references, not one database hierarchy that can be blindly traversed.
- Use Drive change tokens, durable page checkpointing, backoff and incremental reconciliation. Watch callbacks are change hints, not content; verify channel/token, then read the change feed. Renew expiring channels and poll as fallback. [Drive changes](https://developers.google.com/workspace/drive/api/guides/manage-changes).
- A connector filters authorized changes to the chosen folder scope, handles moved files/shortcuts/shared drives according to an explicit supported policy, and stops when connection/scope access is revoked. Do not silently expand into all Drive folders or follow shortcuts outside the configured boundary.
- Upload through the app can target app storage or an authorized Drive destination; show destination and ownership before sending. Drive quota failure remains retryable; do not silently switch providers and charge a different quota.
- Download original blob bytes or explicitly export supported Google Workspace documents to a displayed format. Respect download capabilities and export limits rather than pretend Google Docs is an uploaded `.docx` binary. [Drive download/export](https://developers.google.com/workspace/drive/api/guides/manage-downloads).
- Deleting a linked app reference detaches it by default. Trashing/deleting the original Drive file requires a separate named command and current provider capability. Access loss marks unavailable and clears cached access on reconnection; previously downloaded external bytes remain beyond recall.
- Disconnect revokes/stops provider access and watches, cancels jobs, deletes stored token material and explains cached/reference handling. Account deletion also cleans connections. Keep retries idempotent with provider IDs and app operation IDs.
- Vault cannot use Drive mirroring initially. A user choosing ordinary Drive storage must see that external permissions/collaborators may differ from app privacy.

## AI assistance

AI begins as optional selected-content assistance after the private core and export/delete lifecycle are stable. Users opt in by provider/data category and can inspect the selected context. Default-deny vault, audio transcription, rooms, financial details and broad workspace retrieval; adding any category requires explicit informed consent.

Phase 55 (provisional local) implements versioned AI consent, personal-workspace indexing/retrieval, per-user budgets, FakeAiProvider plus a gated OpenAI-compatible adapter, and disable/purge lifecycle — see [ADR-0052](../decisions/0052-ai-provider-privacy-and-retrieval.md). Live provider calls and production activation remain disabled unless separately authorized. UGC terms acceptance and ordinary search permission are not AI consent. Journal AI requires a distinct explicit scope flag. Deleting app-controlled indexes does not recall content already transmitted to an external provider.

The backend retrieves only currently authorized content, rechecks permissions per query and scopes any embedding/index row by workspace/item. Treat retrieved notes/PDFs/chat as untrusted data, never instructions that change system permissions or authorize tools. Phase 55 does not execute organizer mutations or grant model-controlled tools. Phase 56 may propose task/note edits as a preview; user confirmation triggers normal idempotent commands. No automatic external messages, purchases, Drive deletions, expense writes or reminder changes.

Meter requests/tokens/cost per user, cap context and timeout, cancel stale runs, redact logs, and delete embeddings/outputs when their source is erased. Identify source item/version links in answers and show uncertainty. Recording/transcription consent is independent of enabling chat assistance. Provider choice refinements (ZDR, residency, paid plan) remain owner decisions recorded in ADR 0052.

## Rooms and chat

Rooms follow proven workspace isolation. Phase 51 (provisional local; ADR 0048) delivers invite-only room workspaces with owner/editor/viewer roles, hashed expiring single-use invitations (bearer link or targeted recipient), last-owner protection, and explicit personal→room copy for permitted note/todo kinds only. Journal and vault stay excluded. Private-workspace content is never exposed by switching room context. Real-user invitations and production enablement remain release-gated (`DAYNORI_ROOMS_LOCAL_ENABLED` is local harness only).

Phase 52 covers shared note/task/file synchronization and membership revocation (not chat). Phase 53 (provisional local; ADR 0050, amended) delivers durable messages with immutable send-receipt hashes, lock-serialized idempotency/rate limits, verified-file attachments, unread cursors clamped to server high-water, mute preferences, membership-checked event poll, and a process-local realtime bus with lifecycle publication recovery (`published_at` is local offer, not user delivery). Clients advance event cursors from consumed events only. Production provider realtime and public chat remain out of scope.

Phase 54 (provisional local; ADR 0051) adds report/block/terms/moderation-audit controls and invitation create rate limits; staffed moderation ownership remains a release blocker. Before any public/shared-room release, confirm owner transfer/deletion policy, retention lifecycle enforcement, removal semantics, privacy expectations and attachment controls with operational evidence. Do not claim rooms are end-to-end encrypted when the server can search/moderate them. Real-time simultaneous document editing remains a separate CRDT/collaboration decision. Previously downloaded copies cannot be remotely recalled.
