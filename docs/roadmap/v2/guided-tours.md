# V2 guided tour contract

Status: Phase 79 engine + proof chapter `tour.task-create-save` shipped (ADR 0079). Everyday/advanced chapter collections remain Phases 80–81. Help catalog states in Phase 78. Reuse and migrate the Phase 31 onboarding state rather than layering a second independent “finished tutorial” flag over it.

## Learning experience

The first-use path takes the user through one useful action, saving/reopening it, navigation, and Help. A Learn the app catalog then offers short resumable chapters covering every released feature. A user can choose the complete sequence, but need not finish a long compulsory tour to use the app.

An action step highlights the real control and gives one plain instruction. The user clicks or taps it, enters data, and saves through normal application code. The next step begins when the expected action and resulting state are verified. Next alone cannot mark an action complete. Informational steps may have Next; Skip explicitly records a skipped step, not success.

Example task chapter: open Create > choose Task > enter a title > choose a due date > Save > observe the task in Plan > complete it > Undo. Verify the canonical task and durable local save receipt; display “saved on this device” until cloud sync is confirmed. Do not claim cloud persistence merely because a button was clicked.

Example journal chapter: open Journal > Write > enter a synthetic practice sentence or the user's own writing > save > reopen the same entry. Never transmit the body as tour telemetry. Example assistant chapter: open assistant > choose an allowed scope > ask for a draft > edit the preview > Confirm save > open the created record.

## State and component contract

- Stable chapter IDs, versioned step IDs, supported platform, prerequisite feature capabilities, route, semantic target ID, expected user event, completion predicate, recovery text, and next-step policy. Do not persist DOM selectors or depend on page coordinates.
- Progress is scoped to account and workspace; device-specific permission demonstrations stay device-specific. Persist paused position and artifact IDs before advancing. Use the existing revision/conflict conventions for synced preferences.
- Match actions to the current chapter's correlation/operation ID. Old events, another tab/device, duplicate callbacks, failed requests, or unrelated pre-existing items cannot complete a step. Recover from a persisted receipt on resume after a crash.
- A step may complete after a local durable mutation while offline if the instruction explicitly teaches local saving. Steps requiring a server/provider result wait for that result. Authentication and irreversible permissions never get simulated as success.
- Separate presentation adapters: anchored coachmark/spotlight on web, native overlays/sheets where feasible. The overlay must allow interaction with the intended control and its associated picker/menu/editor. Avoid trapping the user in an inaccessible modal layered over another modal.
- Route transitions wait for the actual target to mount, scroll it into view, and restore meaningful focus. If the target is unavailable, the feature is disabled, or a permission is denied, show a recovery choice or a truthful unavailable state; never highlight an invisible element.
- Pause, Resume, Back, Skip step, Skip chapter, Restart chapter, and Exit are always reachable. Leaving a chapter preserves progress and unsaved content. Escape/hardware Back follow platform expectations.
- Replay is non-destructive and does not duplicate practice content. Stable practice IDs and idempotent receipts attach only to explicitly opted-in practice records. Never infer that an existing edited record is disposable.

## Safe practice

Users choose “use my own item” or explicitly create labeled practice content. Do not prefill real personal details, credentials, or medical/financial narratives. Provide a reviewable cleanup list with selective deletion; preserve edited or linked items unless the user explicitly chooses them.

Use isolated practice for trash/restore and conflict demos. Explain export and account deletion without actually deleting an account. A billing chapter uses a non-charging preview or approved sandbox; paid confirmation and purchase are never tutorial completion requirements. Vault, Drive authorization, shared-room invitations, notification permission, and microphone permission remain optional real consent decisions.

Unavailable features have an explanation in the learning catalog, but no misleading live practice chapter. The full V2 coverage gate remains open until each in-scope feature is actually released and teachable. Developers never satisfy tour coverage with harness-only screens.

## Accessibility, localization, and trust

Announce chapter title, step position, concise instruction, and completion without reading every keystroke. Maintain visible focus, usable touch targets, contrast, screen-reader order, and keyboard access to the same action. Reduced motion avoids animated spotlight movement. Mobile sheets cannot hide the target behind the keyboard or bottom tabs.

Keep instruction strings separate from predicates; support English and Bangla readiness without concatenating positional UI phrases. Tour analytics contain chapter/step IDs, duration, and bounded failure codes only, with consent where applicable. No field values, recording bytes, journal text, prompts, or screenshots are captured automatically.

## Completion evidence

- Every released feature/action in the [coverage register](feature-coverage.md) has a chapter/step or a documented safe explanatory treatment for destructive/provider actions.
- Automated journeys operate real controls and assert resulting records/receipts; engine tests also cover incorrect events, remounting, retries, logout, account switch, duplicate completion, and migrated V1 progress.
- Manual desktop keyboard/screen-reader and physical Android/PWA runs cover overlays, nested pickers, keyboard, denied permission, offline, interrupt/resume, and replay. Native Android gets its own evidence.
- Report completed/skipped/unavailable steps separately. A 100% tour metric cannot conceal missing features or skipped action validation.
