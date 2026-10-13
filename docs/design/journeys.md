# Journeys, onboarding and state behavior

Status: interaction specification for prototypes. Test with [accessibility criteria](accessibility.md) and [requirements](../product/requirements.md).

## First sign-up and tutorial

1. Show a short promise and clear sign-in/create-account actions. Explain cloud synchronization and ordinary-workspace privacy accurately.
2. After account creation, offer a skippable three-step tour: Capture anything; Plan tasks and routines; Organize your folders. Each step has Skip, Back and Continue.
3. Offer interests such as Notes, Planning, Journal and Files with useful defaults. This configures visible shortcuts, not security permissions or a irreversible content schema.
4. Offer to create one real note or task. A sample is opt-in and removable. Saving the first item ends the tour; the user can replay it from Help.
5. Ask notification permission only when the user creates a reminder. Ask file/microphone/biometric permissions at the corresponding user action in later phases.

Do not demand contacts, Drive connection, payment details or microphone permission during sign-up. The Android notification permission is a contextual runtime request on supported versions; the denial path must remain useful. [Android notification guidance](https://developer.android.com/develop/ui/compose/notifications/notification-permission).

Acceptance: a participant can skip every tutorial step, save a first item and use the app with notifications denied. Screen-reader focus follows each step and announces its position; replaying the tutorial does not create duplicate items.

## Capture a thought, then organize it

Today > Create > Note opens a blank editor with focus in the body. Type a thought. Save locally into Inbox, display its current status and return to the previous view. Later open the note > Move > Software > Projects. Confirm the new breadcrumb without replacing the note ID. Opening Software through Notes filters the same folder to notes; clearing the type filter reveals its related PDFs and tasks.

Failure behavior: if offline, show Saved on this device, waiting to sync. If local saving fails, keep the text onscreen and offer copy/retry. If another device edits the same content, show both versions and a recovery flow; avoid a dismiss-only warning that loses data.

## Separate daily routines from upcoming deadlines

For repeatable preparation: Plan > Routines > Add routine > Study for 30 minutes > weekdays > optional time > save. Today's occurrence appears only on a scheduled date. Done applies to today's occurrence; tomorrow's planned occurrence is untouched.

For an application deadline: Plan > Tasks > Add task > Submit application > select deadline > High priority > optional reminder > save. It appears in Upcoming and Calendar. Completing it finishes the one task. A prompt may suggest a routine when a user asks for daily repetition, but must not silently convert the item type.

Failure behavior: selecting a past deadline is allowed after a clear label. Invalid local times during daylight-saving transitions need an explained adjustment/choice. Permission denial shows Reminder saved, notifications unavailable with an in-app reminder list and settings guidance.

## Organize application documents

Library > Folders > New folder > Government jobs > New subfolder > Applications. Upload a PDF through the app picker. Show filename, destination, size and progress. When ready, open its preview and optional related task link. Add the related application task to the same folder; the folder's All view shows both, while Files and Tasks filters show their respective types without separate folder copies.

Failure behavior: wrong format, quota reached, canceled upload and network interruption each have distinct messages. Retry preserves the upload identity. Show a pending-processing badge until validation completes. Do not display a thumbnail from a failed or unauthorized file. Downloads recheck authorization.

## Write a journal worth returning to

Journal > Write chooses today's date and a blank page. Optional prompts include What stood out today?, What did I learn? and What would help tomorrow? The user can dismiss the prompt and write freely. Title, folder and tags are optional. Closing the editor retains a recoverable draft.

The timeline supports quiet chronological reading, choose-a-date navigation and private preview settings. Allow backdating and several entries on a day. Add a meaningful entry title or date rather than meaningless activity scores. Milestones/streaks remain opt-in if introduced later.

Failure behavior: save failure is explicit and the body remains available. Search respects the user's preview choice. Trash is reversible during retention. An export preview explains that ordinary exported journal text is readable outside the app; vault export follows a different encrypted flow.

Acceptance: participants can write without answering a prompt, recover an interrupted draft, find an older entry by date and delete/restore it. No journal title/body appears on the lock-screen notification unless the user has intentionally enabled a reviewed content setting.

## Make the app feel personal

Settings > Customize shows module visibility, shortcut order, Today card order and theme. Reorder through drag or Move up/Move down actions. Preview changes immediately and persist them. Reset layout explains that only appearance/navigation changes.

Failure behavior: a hidden module remains accessible through All modules and search. If a block/module is unsupported by a client version, show a safe explanation and update guidance; do not erase the configuration. A sync conflict preserves an understandable latest revision with a reset path.

## Add an optional calendar event

Plan > Calendar > Create event accepts title, start/end, all-day setting and timezone, with an optional workspace folder. Selecting All day switches to date-only boundaries. Timed events show timezone context. Save creates one private event record; later editing it updates the Calendar and folder views. A task opened from Calendar stays a task rather than being converted to an event.

Failure behavior: an end before start is rejected with input retained; an ambiguous local time offers an explicit choice. Deletion follows the normal item/Trash rules. There are no attendees, room invitations or external calendar synchronization in this initial workflow.

## Create a structured section, later

Customize > New section > Study template offers a Software folder view and Upcoming task view. Add bounded fields such as Goal (text), Review date (date) and Preparation steps (checklist). Record values, reorder blocks and rename the section. Views refer to canonical workspace records; fields hold the section's own validated typed values.

Failure behavior: a schema upgrade preserves existing field values or offers a recoverable error/export path. Removing a populated field or section explains its own data recovery while preserving referenced notes, files and tasks. Unsupported blocks cannot execute scripts or request broader access.

## Record an audio attachment, later

Library > Record audio is an intentional file workflow with permission, timer, stop, discard and playback. Saving creates one audio file; Attach to item can link it into an authorized note or journal entry. Create note remains a keyboard-only typed editor, and no audio becomes transcribed note content in this scope.

Failure behavior: denied microphone permission, interruption, quota and transfer failure preserve a useful fallback and avoid pretending that a recording was saved successfully. Typed capture remains available independently.

## Unlock a sensitive vault, later

Vault > Unlock offers device biometric authentication where available and an accessible PIN fallback under the approved key design. Before first setup, explain recovery and lost-secret consequences with a verified acknowledgement. Account sign-in alone never silently unlocks vault keys.

Auto-lock on agreed timeout/background/session rules and remove content from recent-app previews where platform support allows. Web may use a passphrase/WebAuthn-assisted flow after feasibility review; do not promise a fingerprint button on every browser.

Failure behavior: biometric failure allows a safe fallback; rate-limited PIN failure explains retry timing without exposing secret details. Recovery is tested before launch. Sharing/AI/search do not offer vault content as a default selectable target.

## Connect a Drive folder, later

Files > Connections > Google Drive explains the supported folder scope, who stores the bytes and what disconnect means. Authorize the approved provider flow, choose a supported folder and show its source badge. Upload destination makes App storage versus Connected Drive explicit.

Failure behavior: expired authorization, missing/moved folder, provider quota and sync conflict are distinct. Disconnect stops connector jobs and clears authorized local cache according to policy. It does not delete remote files as a side effect. Provider feasibility must be proven before finalizing this flow.

## Invite a room member, later

Rooms > Create room > choose name > invite by explicit address/link action > recipient accepts. The room opens with member role and shared scope visible. Adding a personal item requires a preview of what becomes visible and to whom. Personal journal and vault never appear as general room content candidates.

Failure behavior: expired invite, removed member, denied role, duplicate chat submission and offline state have recoverable messages. Remove a member revokes access and disconnects active authorized subscriptions. Reporting/blocking is reachable without requiring the user to leave first.

## Ask the assistant, later

Select notes/files or a supported folder > Ask assistant > see selected scope > submit a question. Answers link to the items they used. A proposed task creation shows a editable preview and an explicit Confirm action. Dismissing it creates nothing.

Failure behavior: unavailable provider, empty context, usage limit and unsupported question are stated plainly. Suspicious instructions inside uploaded material are treated as content, not permission to change app behavior. Rooms, account and vault scope are checked before retrieval.

## State checklist for every screen

Each phase's design handoff must include:

- Empty: one useful primary action and concise guidance.
- Loading: stable layout and accessible progress where useful.
- Success: actual persisted/accepted state with reversible completion when supported.
- Offline: what is available, what was saved locally and what is waiting.
- Error: specific cause when known, preserved input and a safe recovery action.
- Permission denied: useful fallback and contextual settings guidance.
- Deleted or unauthorized: a safe message that avoids disclosing another user's item.
- Long content: wrap text, support scrolling/zoom and avoid truncated essential labels.
- Large data: bounded lists, visible filters and partial-load/error behavior.

Messages should describe an action: File is too large. Choose a file under the limit. Avoid meaningless codes or claiming Sync complete when only a request has been queued.
