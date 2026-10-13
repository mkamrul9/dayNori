# Information architecture

Status: proposed for usability validation. Refer to [requirements](../product/requirements.md) for stable behavior IDs.

## Navigation model

Use three concepts consistently: **Today** for immediate action, **Plan** for tasks/routines/calendar, and **Library** for saved material. **Journal** remains directly available because reflection deserves a clear, quiet entry point.

On compact mobile screens, the initial bottom navigation has four labeled destinations: Today, Plan, Library and Journal. Search and Create are consistent toolbar actions. A modules directory under Library or the account menu reveals all enabled modules and customization. Do not create ten equal-weight bottom tabs as new capabilities arrive.

On desktop web, a persistent left sidebar has Today, Plan, Library and Journal, then user-pinned module/folder shortcuts. Search and Create remain above the content. Expanded module children show Tasks, Routines, Calendar, Notes, Knowledge and Files. A narrow sidebar or drawer replaces it at smaller widths.

The four parent destinations are stable. Personalization can reorder, hide and pin module shortcuts within the agreed shell; moving a feature must not make it unreachable. Users who hide Journal still find it in the modules directory and authorized search. Never hide Settings, Search, Help or account controls behind layout customization.

## Today

Default order:

1. Date and a restrained greeting; local timezone available in date settings.
2. Upcoming task list: due today, then a collapsed overdue group.
3. Today's routines with independent completion controls.
4. A short next-seven-days summary linking to Plan.
5. Optional Journal prompt with no entry-body preview.

Show only three to five visible cards initially. Notes/Files favorites can replace optional cards. Expenses, rooms and AI do not appear before they are enabled and released. Completed work collapses into a count; a gentle empty state provides Create task or Add routine without filling the screen with sample content.

Today never resets a one-off task at midnight. Routine occurrences follow R-ROUTINE. Completion feedback is reversible and restrained; no unsolicited streak loss, red failure score or compulsory gamification.

## Plan

Plan has clear views rather than mixing record types:

- **Tasks:** Today, Upcoming, Overdue, Completed, folder views. Filters for priority, tag and deadline.
- **Routines:** Today's scheduled occurrences, routine definitions, history and archived routines.
- **Calendar:** agenda/month projections of underlying tasks/routines and optional standalone private event records. Editing a projected task opens its canonical task; creating an event adds an event item with title/start/end/all-day/timezone. External calendar sync is excluded from the initial event workflow.

A task editor starts with title and optional due date. Priority, reminder, folder and subtasks sit in an expandable Details region. Advanced recurrence never appears on a one-off task until separately implemented. The routine editor explicitly says Repeat on and clarifies that each scheduled day has its own completion.

## Library

Library opens with workspace folders, Inbox, optional favorites and module filters such as Notes, Knowledge and Files. Each module has All items, Inbox, Folders, Favorites and Archive as applicable, filtering the same canonical hierarchy. Trash is reachable from account/library settings.

One workspace folder hierarchy is the source of truth. Software can contain notes, PDFs, tasks and guides together. Opening Software in All shows mixed records with type labels; opening it through Notes shows only its notes, and Files shows only its files. Each breadcrumb refers to the same folder ID, and a visible type filter explains why some items are hidden. Changing or clearing the filter never moves content. Private and shared workspace scopes remain separate authorization boundaries.

Common folder actions: Create folder, Rename, Move, Reorder, Archive and Delete. Common item actions: Move, Add tags, Favorite, Archive, Trash and Export where supported. Actions that are unavailable for a given record type must not appear as misleading inactive buttons.

Examples to use in research fixtures:

```text
Workspace
  Inbox
  Software
    Guides
      TypeScript reference [knowledge note]
      TypeScript handbook.pdf [file]
      Read generics chapter [task]
    Projects
      New app idea [note]
  Government jobs
    Applications
      Application form.pdf [file]
      Submit application [task]
      Interview preparation [note]
  Personal
    Morning study [routine]
    Today I learned [journal entry]
  Learning
    Exam preparation [knowledge note]
```

These are optional examples, not mandatory starter folders or uploaded demo files. A new workspace begins empty unless the user chooses a removable sample workspace.

## Journal

Journal opens into a date-grouped timeline and a prominent Write action. A selected folder filters the timeline. Calendar-date navigation is a secondary control, not a demand to write every day. Support several entries per day and a clean empty state: Write about today or Choose another date.

The editor gives the page room: date, optional title and a wide body; prompts/formatting controls are secondary. Folder/tag/attachment actions sit outside the writing area. Body snippets can be suppressed across the journal timeline and search. Journal prompts do not imply a diagnosis or score a person's emotions.

## Future destinations and progressive disclosure

- **Expenses:** module directory entry, optional Today summary and independent category/date views after release.
- **Custom sections:** user names and composes approved item views plus bounded typed text/checklist/date/number/link/attachment blocks. The section editor starts from a simple template, supports schema migration that preserves field values and shows only supported blocks. Removing a section preserves referenced items and offers recovery of its own field values.
- **Vault:** a clearly locked destination with explicit unlock; it is absent from ordinary capture, search and sharing targets.
- **Rooms:** a separate shared area with room/member context visible on every screen. Shared items carry a persistent Shared badge.
- **Assistant:** a secondary action over explicitly selected material; it never occupies the main capture path or automatically sends private content.

## Universal detail layout

Every detail page has a meaningful title, type/context label, breadcrumb or parent link, primary action and overflow menu. Wide screens may place optional metadata in a side panel. Mobile uses a full-screen editor or accessible sheet; it must remain usable with the keyboard open.

Do not rely on a hover-only menu or swipe-only deletion. Offer a visible overflow action and undo/recovery. A file preview always exposes Download/Open original and a fallback error state. Search results show type, title and folder path; private preview settings apply before rendering a snippet.

## Decisions to validate before implementation

- Do users understand Plan versus Library without explanation?
- Does Journal deserve a permanent tab for the primary audience, or a pin chosen during onboarding?
- Can users distinguish folders from tags and custom sections from modules?
- Do all actions remain discoverable at 320 CSS-pixel width and with enlarged native text?
- Does a desktop sidebar plus compact mobile shell preserve the same mental model without forcing identical layouts?

Record observations, changes and unresolved issues in the design phase document before freezing navigation.
