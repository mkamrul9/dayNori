# Accessibility and design validation

Status: acceptance plan. The web target is **WCAG 2.2 Level AA**, subject to complete testing of released processes; this document is not a conformance statement. Native Android additionally needs platform-specific TalkBack, text scaling and input testing.

The official standard covers text contrast, keyboard access, reflow, focus, input assistance and status messages. Refer to the relevant criteria during implementation rather than equating an automated audit with conformance. [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

## Required interaction behavior

- Keyboard users can create/edit/move/search/delete/restore items, use Calendar, customize layout and finish onboarding. Focus order is logical; focus returns to the initiating control after a dialog closes.
- Every interactive element has a meaningful accessible name, role and state. A task checkbox announces its task title and completion state; a routine also identifies its scheduled date.
- Dragging is optional: Move up, Move down and Move to folder supply direct alternatives. Confirm successful reordering in a brief status message. [W3C dragging guidance](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html).
- Aim for at least 44 CSS pixels for primary web touch controls and 48 dp on Android. These are product targets above the WCAG 2.2 minimum, not a unit-equivalence claim. WCAG's minimum target criterion uses 24 CSS pixels with defined spacing/exceptions. [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- Show a visible keyboard focus indicator with deliberate contrast. Sticky bars, dialogs and the virtual keyboard cannot fully obscure the focused control. Moving focus must not trigger an unexpected navigation or permission request.
- Text/errors/priority cannot depend only on color, shape, position or sound. Associate validation messages with the field and retain valid input after failure.
- Do not disable paste, password managers or accessible authentication alternatives. Avoid cognitive puzzles as the sole login path.
- Announce upload progress and key save failures without flooding the screen reader. Silent background autosave is appropriate until status changes meaningfully.

## Reading and visual behavior

- Audit ordinary text at 4.5:1 or greater and large text at 3:1 or greater; test essential non-text controls against adjacent colors. These checks follow WCAG thresholds, with documented applicable exceptions rather than blanket exclusions. [Contrast criterion](https://www.w3.org/TR/WCAG22/#contrast-minimum).
- Verify web reflow at 320 CSS-pixel width and 200% text resize; test 400% zoom on a desktop viewport. A calendar grid may need horizontal navigation, but it must provide an accessible agenda alternative.
- Test Android enlarged text, display scaling, landscape and the editor with the keyboard open. Essential text is not clipped, hidden behind fixed heights or available only through ellipsis.
- Respect reduced motion and avoid flashes. Timers/recording indicators later include readable text, and audio feedback has a visual alternative.
- File previews may contain user-supplied inaccessible documents; the app controls around them must remain accessible and offer filename/type/download information. Do not claim the app makes every uploaded PDF accessible.

## Phase-specific validation

**Prototype gate:** test the core journeys with at least five prospective users. Include a user who depends on enlarged text or assistive technology where possible. Record the task, observation, severity, proposed fix and retest outcome. Prioritize blocked completion over cosmetic preference.

**Component gate:** inspect every default, focus, hover, selected, invalid, disabled, loading, offline and dark-theme state. Automated contrast/DOM scans support manual checks. Record reviewed token pairs and screenshots.

**Feature gate:** use keyboard-only navigation plus a web screen reader on the supported browser combination and TalkBack on the reference Android device. Verify the actual create/edit/delete/recover flows, not only a static gallery.

**Release gate:** no unresolved accessibility defect preventing a core journey. Document remaining lower-severity issues, supported device/browser matrix, dates and evidence. A production claim requires shipped behavior and review evidence.

## Usability test scripts

1. Skip the tour and capture a thought; recover it after leaving the app.
2. Add a one-off High-priority task with a deadline and a weekday routine. Explain what happens tomorrow for each.
3. Make Software > PDFs, upload a PDF, move it, and find it again with search.
4. Write a journal entry, dismiss the prompt, backdate it and find it from the timeline.
5. Hide a module, change its order with buttons, and restore the default layout.
6. Deny notification permission, retain a reminder and locate its unavailable status.
7. Complete a task while offline, reconnect and recognize whether synchronization finished.

The moderator should not coach participants toward controls. Ask for their expectation before revealing the result. Log where app vocabulary differs from their vocabulary.

## Evidence template

For each finding, record:

- Finding ID, related requirement ID and phase.
- Build/prototype revision, platform, device/browser and accessibility settings.
- Steps and expected/actual behavior.
- User impact and severity: blocked journey, significant friction or minor issue.
- Screenshot/recording only with consent and no real sensitive content.
- Fix, retest date and result, or a named accepted limitation.

Use synthetic notes, files and journal entries for regression fixtures. Real user journal bodies, filenames and financial amounts must not appear in screenshots, test logs or analytics by default.
