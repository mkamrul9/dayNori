import type { TourChapterDefinition } from './types.js';

const L = (key: string, defaultText: string) => ({ key, defaultText });

const PLATFORMS = ['web', 'installedPwa', 'android'] as const;

export const TOUR_CHAPTER_NAVIGATION: TourChapterDefinition = {
  id: 'tour.navigation',
  definitionVersion: 1,
  contentVersion: 1,
  title: L('tour.navigation.title', 'Find your way around'),
  summary: L(
    'tour.navigation.summary',
    'Visit Today, Plan, Library, Journal, Create, Search, and All features using real navigation.'
  ),
  platforms: PLATFORMS,
  featurePrerequisites: ['shell'],
  learningChapterId: 'chapter.navigation',
  coverageFamilies: ['navigation'],
  steps: [
    {
      id: 'intro',
      kind: 'informational',
      title: L('tour.navigation.intro.title', 'Shell tour'),
      instruction: L(
        'tour.navigation.intro.instruction',
        'You will tap real tabs and buttons. Progress saves with your account; Exit keeps unfinished work.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.navigation.intro.recovery', 'Tap Next to begin.'),
      allowSkip: true,
      allowInformationalNext: true,
    },
    {
      id: 'open-today',
      kind: 'action',
      title: L('tour.navigation.open-today.title', 'Open Today'),
      instruction: L('tour.navigation.open-today.instruction', 'Open the Today tab.'),
      route: '/',
      targetId: 'shell.nav.today',
      expectedAction: 'navigate_shell',
      completionPredicate: 'target_activated',
      recovery: L('tour.navigation.open-today.recovery', 'Use the bottom or side navigation.'),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'open-plan',
      kind: 'action',
      title: L('tour.navigation.open-plan.title', 'Open Plan'),
      instruction: L('tour.navigation.open-plan.instruction', 'Open Plan.'),
      route: '/plan',
      targetId: 'shell.nav.plan',
      expectedAction: 'navigate_shell',
      completionPredicate: 'target_activated',
      recovery: L('tour.navigation.open-plan.recovery', 'Pause if Plan is unavailable.'),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'open-library',
      kind: 'action',
      title: L('tour.navigation.open-library.title', 'Open Library'),
      instruction: L('tour.navigation.open-library.instruction', 'Open Library.'),
      route: '/library',
      targetId: 'shell.nav.library',
      expectedAction: 'navigate_shell',
      completionPredicate: 'target_activated',
      recovery: L('tour.navigation.open-library.recovery', 'Use navigation or All features.'),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'open-journal',
      kind: 'action',
      title: L('tour.navigation.open-journal.title', 'Open Journal'),
      instruction: L(
        'tour.navigation.open-journal.instruction',
        'Open Journal (via tab or All features if Journal is hidden).'
      ),
      route: '/journal',
      targetId: 'shell.nav.journal',
      expectedAction: 'navigate_shell',
      completionPredicate: 'target_activated',
      recovery: L(
        'tour.navigation.open-journal.recovery',
        'If Journal is hidden, open All features and choose Journal. Skip only if you prefer to leave it hidden.'
      ),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'open-create',
      kind: 'action',
      title: L('tour.navigation.open-create.title', 'Open Create'),
      instruction: L('tour.navigation.open-create.instruction', 'Open Create (+).'),
      targetId: 'shell.create',
      expectedAction: 'open_create',
      completionPredicate: 'target_activated',
      recovery: L('tour.navigation.open-create.recovery', 'Look for Create in the header.'),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'open-search',
      kind: 'action',
      title: L('tour.navigation.open-search.title', 'Open Search'),
      instruction: L('tour.navigation.open-search.instruction', 'Open Search.'),
      targetId: 'shell.search',
      expectedAction: 'navigate_shell',
      completionPredicate: 'target_activated',
      recovery: L('tour.navigation.open-search.recovery', 'Search stays reachable from the shell.'),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'open-all-features',
      kind: 'action',
      title: L('tour.navigation.open-all-features.title', 'Open All features'),
      instruction: L(
        'tour.navigation.open-all-features.instruction',
        'Open All features to see modules including hidden ones.'
      ),
      targetId: 'shell.all-features',
      expectedAction: 'navigate_shell',
      completionPredicate: 'target_activated',
      recovery: L('tour.navigation.open-all-features.recovery', 'Find All features in the shell.'),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'done',
      kind: 'informational',
      title: L('tour.navigation.done.title', 'Navigation complete'),
      instruction: L(
        'tour.navigation.done.instruction',
        'You used real shell controls. Settings, Help, and Search remain reachable after personalization.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.navigation.done.recovery', 'Tap Next to finish.'),
      allowSkip: false,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.navigate-shell', 'help.all-features-pins'],
    },
  ],
};

export const TOUR_CHAPTER_PERSONALIZATION: TourChapterDefinition = {
  id: 'tour.personalization',
  definitionVersion: 1,
  contentVersion: 1,
  title: L('tour.personalization.title', 'Personalize your shell'),
  summary: L(
    'tour.personalization.summary',
    'Pin, hide, and restore modules without deleting content. Journal hide leaves three primary tabs.'
  ),
  platforms: PLATFORMS,
  featurePrerequisites: ['personalization'],
  learningChapterId: 'chapter.navigation',
  coverageFamilies: ['personalization'],
  steps: [
    {
      id: 'intro',
      kind: 'informational',
      title: L('tour.personalization.intro.title', 'Your layout'),
      instruction: L(
        'tour.personalization.intro.instruction',
        'Changes apply through normal preferences. The tour will not silently reverse your choices later.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.personalization.intro.recovery', 'Tap Next.'),
      allowSkip: true,
      allowInformationalNext: true,
    },
    {
      id: 'pin-module',
      kind: 'action',
      title: L('tour.personalization.pin-module.title', 'Pin a module'),
      instruction: L(
        'tour.personalization.pin-module.instruction',
        'In All features, pin a supported module you want quick access to.'
      ),
      targetId: 'features.pin',
      expectedAction: 'pin_module',
      completionPredicate: 'preference_changed',
      recovery: L(
        'tour.personalization.pin-module.recovery',
        'Open All features. Skip if pins are unavailable in this build.'
      ),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'hide-journal',
      kind: 'action',
      title: L('tour.personalization.hide-journal.title', 'Hide Journal from primary tabs'),
      instruction: L(
        'tour.personalization.hide-journal.instruction',
        'Hide Journal so primary tabs become three. Entries are not deleted; Journal stays in All features.'
      ),
      targetId: 'features.hide.journal',
      expectedAction: 'hide_journal_tab',
      completionPredicate: 'preference_changed',
      recovery: L(
        'tour.personalization.hide-journal.recovery',
        'If Journal is already hidden, skip. Never delete journal entries to “finish” this step.'
      ),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'open-hidden-via-all',
      kind: 'action',
      title: L('tour.personalization.open-hidden.title', 'Open Journal from All features'),
      instruction: L(
        'tour.personalization.open-hidden.instruction',
        'Open All features and choose Journal to prove hidden destinations remain discoverable.'
      ),
      targetId: 'shell.all-features',
      expectedAction: 'navigate_shell',
      completionPredicate: 'target_activated',
      recovery: L('tour.personalization.open-hidden.recovery', 'All features lists hidden modules.'),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'restore-or-keep',
      kind: 'action',
      title: L('tour.personalization.restore.title', 'Restore or keep your choice'),
      instruction: L(
        'tour.personalization.restore.instruction',
        'Restore Journal to primary tabs, or explicitly keep it hidden. The tour will not unhide private modules without this action.'
      ),
      targetId: 'features.restore.journal',
      expectedAction: 'restore_module',
      completionPredicate: 'preference_changed',
      recovery: L(
        'tour.personalization.restore.recovery',
        'Skip only after you confirmed your preferred visibility.'
      ),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'done',
      kind: 'informational',
      title: L('tour.personalization.done.title', 'Layout updated'),
      instruction: L(
        'tour.personalization.done.instruction',
        'Settings, Help, and Search stay reachable. Reset appearance/layout from Settings when you want defaults.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.personalization.done.recovery', 'Tap Next.'),
      allowSkip: false,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.all-features-pins', 'help.workspace-and-preferences'],
    },
  ],
};

export const TOUR_CHAPTER_TASKS: TourChapterDefinition = {
  id: 'tour.tasks',
  definitionVersion: 1,
  contentVersion: 1,
  title: L('tour.tasks.title', 'Tasks day to day'),
  summary: L(
    'tour.tasks.summary',
    'Create with required fields, optional details/deadlines, edit, reopen, complete/undo, and filters.'
  ),
  platforms: PLATFORMS,
  featurePrerequisites: ['tasks'],
  learningChapterId: 'chapter.tasks-routines',
  coverageFamilies: ['tasks'],
  steps: [
    {
      id: 'intro',
      kind: 'informational',
      title: L('tour.tasks.intro.title', 'Real tasks'),
      instruction: L(
        'tour.tasks.intro.instruction',
        'Prefer a labeled practice task or choose Use my own item. Complete/Undo must not invent a tomorrow copy.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.tasks.intro.recovery', 'Tap Next.'),
      allowSkip: true,
      allowInformationalNext: true,
    },
    {
      id: 'create-save',
      kind: 'action',
      title: L('tour.tasks.create-save.title', 'Create and save'),
      instruction: L(
        'tour.tasks.create-save.instruction',
        'Create a task with a title (required). Optionally add details and a supported deadline, then save until Saved on this device.'
      ),
      targetId: 'create.task.save',
      expectedAction: 'save_practice_task',
      completionPredicate: 'practice_task_saved_locally',
      entityType: 'task',
      recovery: L('tour.tasks.create-save.recovery', 'Retry after a failed save; do not advance on click alone.'),
      allowSkip: false,
      allowInformationalNext: false,
    },
    {
      id: 'reopen-edit',
      kind: 'action',
      title: L('tour.tasks.reopen-edit.title', 'Reopen and edit'),
      instruction: L(
        'tour.tasks.reopen-edit.instruction',
        'Open the same canonical task in Plan and save an edit.'
      ),
      route: '/plan',
      targetId: 'plan.task.practice',
      expectedAction: 'update_practice_entity',
      completionPredicate: 'entity_updated_locally',
      entityType: 'task',
      recovery: L('tour.tasks.reopen-edit.recovery', 'Reopen the same ID — do not create a duplicate.'),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'complete',
      kind: 'action',
      title: L('tour.tasks.complete.title', 'Complete'),
      instruction: L('tour.tasks.complete.instruction', 'Mark the practice task complete using the normal control.'),
      targetId: 'task.complete',
      expectedAction: 'complete_practice_task',
      completionPredicate: 'practice_task_completed',
      entityType: 'task',
      recovery: L('tour.tasks.complete.recovery', 'Completion must save locally.'),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'undo',
      kind: 'action',
      title: L('tour.tasks.undo.title', 'Undo completion'),
      instruction: L('tour.tasks.undo.instruction', 'Undo completion on the same task — no new day copy.'),
      targetId: 'task.undo-complete',
      expectedAction: 'undo_practice_task_completion',
      completionPredicate: 'practice_task_completion_undone',
      entityType: 'task',
      recovery: L('tour.tasks.undo.recovery', 'Use Undo toast or reopen the task.'),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'filter',
      kind: 'action',
      title: L('tour.tasks.filter.title', 'Use a Plan filter'),
      instruction: L(
        'tour.tasks.filter.instruction',
        'Apply a Plan filter (for example Completed or Today). Filters change the view, not ownership.'
      ),
      targetId: 'plan.filter',
      expectedAction: 'apply_filter',
      completionPredicate: 'filter_view_changed',
      recovery: L('tour.tasks.filter.recovery', 'Clear filters afterward if you prefer.'),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'done',
      kind: 'informational',
      title: L('tour.tasks.done.title', 'Tasks covered'),
      instruction: L(
        'tour.tasks.done.instruction',
        'You verified create/edit/complete/undo and filters on real controls. Cleanup stays selective from Help.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.tasks.done.recovery', 'Tap Next.'),
      allowSkip: false,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.tasks-vs-routines'],
    },
  ],
};

export const TOUR_CHAPTER_ROUTINES: TourChapterDefinition = {
  id: 'tour.routines',
  definitionVersion: 1,
  contentVersion: 1,
  title: L('tour.routines.title', 'Routines and occurrences'),
  summary: L(
    'tour.routines.summary',
    'Create/edit a routine, complete or skip one occurrence, undo, and confirm another date stays independent.'
  ),
  platforms: PLATFORMS,
  featurePrerequisites: ['routines'],
  learningChapterId: 'chapter.tasks-routines',
  coverageFamilies: ['routines'],
  steps: [
    {
      id: 'intro',
      kind: 'informational',
      title: L('tour.routines.intro.title', 'One day at a time'),
      instruction: L(
        'tour.routines.intro.instruction',
        'Occurrence actions apply to a specific date. Another calendar day remains independent.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.routines.intro.recovery', 'Tap Next.'),
      allowSkip: true,
      allowInformationalNext: true,
    },
    {
      id: 'create-save',
      kind: 'action',
      title: L('tour.routines.create-save.title', 'Create routine'),
      instruction: L(
        'tour.routines.create-save.instruction',
        'Create a labeled practice routine with schedule/timezone, then wait for Saved on this device.'
      ),
      targetId: 'create.routine.save',
      expectedAction: 'save_practice_entity',
      completionPredicate: 'entity_saved_locally',
      entityType: 'routine',
      createType: 'routine',
      recovery: L('tour.routines.create-save.recovery', 'Retry after failed save.'),
      allowSkip: false,
      allowInformationalNext: false,
    },
    {
      id: 'reopen',
      kind: 'action',
      title: L('tour.routines.reopen.title', 'Reopen the routine'),
      instruction: L('tour.routines.reopen.instruction', 'Open the same routine record (not a projection stub).'),
      targetId: 'plan.routine.practice',
      expectedAction: 'open_practice_entity',
      completionPredicate: 'entity_opened',
      entityType: 'routine',
      recovery: L('tour.routines.reopen.recovery', 'Confirm the editor loaded the canonical routine.'),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'occurrence',
      kind: 'action',
      title: L('tour.routines.occurrence.title', 'Complete or skip today'),
      instruction: L(
        'tour.routines.occurrence.instruction',
        'Complete or skip today’s occurrence using normal controls.'
      ),
      targetId: 'routine.occurrence.action',
      expectedAction: 'occurrence_complete',
      completionPredicate: 'occurrence_action_verified',
      entityType: 'routine',
      recovery: L('tour.routines.occurrence.recovery', 'Must persist locally before advancing.'),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'undo-occurrence',
      kind: 'action',
      title: L('tour.routines.undo-occurrence.title', 'Undo occurrence'),
      instruction: L('tour.routines.undo-occurrence.instruction', 'Undo that occurrence action if supported.'),
      targetId: 'routine.occurrence.undo',
      expectedAction: 'occurrence_undo',
      completionPredicate: 'occurrence_action_verified',
      entityType: 'routine',
      recovery: L('tour.routines.undo-occurrence.recovery', 'Skip if undo is unavailable after skip.'),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'other-date',
      kind: 'informational',
      title: L('tour.routines.other-date.title', 'Another date is independent'),
      instruction: L(
        'tour.routines.other-date.instruction',
        'Open history or another day: yesterday/tomorrow stays independent of today’s occurrence state.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.routines.other-date.recovery', 'Acknowledge after inspecting history.'),
      allowSkip: true,
      allowInformationalNext: true,
    },
    {
      id: 'done',
      kind: 'informational',
      title: L('tour.routines.done.title', 'Routines covered'),
      instruction: L('tour.routines.done.instruction', 'Replay will not duplicate the practice routine ID.'),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.routines.done.recovery', 'Tap Next.'),
      allowSkip: false,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.tasks-vs-routines'],
    },
  ],
};

export const TOUR_CHAPTER_CALENDAR: TourChapterDefinition = {
  id: 'tour.calendar',
  definitionVersion: 1,
  contentVersion: 1,
  title: L('tour.calendar.title', 'Calendar projections'),
  summary: L(
    'tour.calendar.summary',
    'Agenda/month navigation, open task/routine projections as source records, and a private event.'
  ),
  platforms: PLATFORMS,
  featurePrerequisites: ['calendar'],
  learningChapterId: 'chapter.calendar',
  coverageFamilies: ['calendar'],
  steps: [
    {
      id: 'intro',
      kind: 'informational',
      title: L('tour.calendar.intro.title', 'Canonical links'),
      instruction: L(
        'tour.calendar.intro.instruction',
        'Calendar shows projections. Opening an item should load the original task, routine, or event.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.calendar.intro.recovery', 'Tap Next.'),
      allowSkip: true,
      allowInformationalNext: true,
    },
    {
      id: 'open-calendar',
      kind: 'action',
      title: L('tour.calendar.open.title', 'Open Calendar'),
      instruction: L('tour.calendar.open.instruction', 'Open Plan → Calendar (agenda or month).'),
      route: '/plan',
      targetId: 'plan.calendar',
      expectedAction: 'navigate_shell',
      completionPredicate: 'target_activated',
      recovery: L('tour.calendar.open.recovery', 'Use Plan sub-navigation.'),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'open-projection',
      kind: 'action',
      title: L('tour.calendar.projection.title', 'Open a projection'),
      instruction: L(
        'tour.calendar.projection.instruction',
        'Open a task or routine projection and confirm the source record loads.'
      ),
      targetId: 'calendar.projection.open',
      expectedAction: 'open_calendar_projection',
      completionPredicate: 'calendar_projection_opened',
      recovery: L('tour.calendar.projection.recovery', 'Row visibility alone is not enough — editor must load.'),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'create-event',
      kind: 'action',
      title: L('tour.calendar.event.title', 'Create a private event'),
      instruction: L(
        'tour.calendar.event.instruction',
        'Create a labeled practice event. Note date-only versus timed behavior for your timezone.'
      ),
      targetId: 'calendar.event.save',
      expectedAction: 'save_practice_entity',
      completionPredicate: 'entity_saved_locally',
      entityType: 'calendar_event',
      recovery: L('tour.calendar.event.recovery', 'Wait for local save acknowledgment.'),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'done',
      kind: 'informational',
      title: L('tour.calendar.done.title', 'Calendar covered'),
      instruction: L(
        'tour.calendar.done.instruction',
        'Date-only deadlines and timed events stay honest about timezone display.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.calendar.done.recovery', 'Tap Next.'),
      allowSkip: false,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.calendar'],
    },
  ],
};

export const TOUR_CHAPTER_NOTES_LIBRARY: TourChapterDefinition = {
  id: 'tour.notes-library',
  definitionVersion: 1,
  contentVersion: 1,
  title: L('tour.notes-library.title', 'Notes and Library'),
  summary: L(
    'tour.notes-library.summary',
    'Create, write, save, reopen the same note; observe save status labels.'
  ),
  platforms: PLATFORMS,
  featurePrerequisites: ['notes'],
  learningChapterId: 'chapter.notes-library',
  coverageFamilies: ['notes', 'library'],
  steps: [
    {
      id: 'intro',
      kind: 'informational',
      title: L('tour.notes-library.intro.title', 'Honest save labels'),
      instruction: L(
        'tour.notes-library.intro.instruction',
        'Watch for Unsaved, Saved on this device, Waiting to sync, Synchronized, and Failed—retry. Save click ≠ synchronized.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.notes-library.intro.recovery', 'Tap Next.'),
      allowSkip: true,
      allowInformationalNext: true,
    },
    {
      id: 'create-save',
      kind: 'action',
      title: L('tour.notes-library.create-save.title', 'Create and save a note'),
      instruction: L(
        'tour.notes-library.create-save.instruction',
        'Create a practice note (try English and Bangla text). Save until Saved on this device.'
      ),
      targetId: 'create.note.save',
      expectedAction: 'save_practice_entity',
      completionPredicate: 'entity_saved_locally',
      entityType: 'note',
      createType: 'note',
      recovery: L('tour.notes-library.create-save.recovery', 'Retry failed saves; draft is kept.'),
      allowSkip: false,
      allowInformationalNext: false,
    },
    {
      id: 'reopen-edit',
      kind: 'action',
      title: L('tour.notes-library.reopen.title', 'Reopen and edit'),
      instruction: L(
        'tour.notes-library.reopen.instruction',
        'Open the same note from Library, edit, and save again.'
      ),
      route: '/library',
      targetId: 'library.note.practice',
      expectedAction: 'update_practice_entity',
      completionPredicate: 'entity_updated_locally',
      entityType: 'note',
      recovery: L('tour.notes-library.reopen.recovery', 'Must load the same note ID.'),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'done',
      kind: 'informational',
      title: L('tour.notes-library.done.title', 'Notes covered'),
      instruction: L(
        'tour.notes-library.done.instruction',
        'Note bodies stay in the note repository — never in tour progress.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.notes-library.done.recovery', 'Tap Next.'),
      allowSkip: false,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.notes-and-library', 'help.save-and-sync'],
    },
  ],
};

export const TOUR_CHAPTER_JOURNAL: TourChapterDefinition = {
  id: 'tour.journal',
  definitionVersion: 1,
  contentVersion: 1,
  title: L('tour.journal.title', 'Journal privately'),
  summary: L(
    'tour.journal.summary',
    'Create, save, reopen a journal entry; respect privacy defaults. Bodies never enter tour telemetry.'
  ),
  platforms: PLATFORMS,
  featurePrerequisites: ['journal'],
  learningChapterId: 'chapter.journal',
  coverageFamilies: ['journal'],
  steps: [
    {
      id: 'intro',
      kind: 'informational',
      title: L('tour.journal.intro.title', 'Private by default'),
      instruction: L(
        'tour.journal.intro.instruction',
        'Journal previews stay hidden by default. Tour progress stores only IDs — never entry text.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.journal.intro.recovery', 'Tap Next.'),
      allowSkip: true,
      allowInformationalNext: true,
    },
    {
      id: 'create-save',
      kind: 'action',
      title: L('tour.journal.create-save.title', 'Write and save'),
      instruction: L(
        'tour.journal.create-save.instruction',
        'Create a practice journal entry for a supported date and save locally.'
      ),
      targetId: 'journal.entry.save',
      expectedAction: 'save_practice_entity',
      completionPredicate: 'entity_saved_locally',
      entityType: 'journal_entry',
      createType: 'journal',
      recovery: L('tour.journal.create-save.recovery', 'Retry without copying text into Help or telemetry.'),
      allowSkip: false,
      allowInformationalNext: false,
    },
    {
      id: 'reopen',
      kind: 'action',
      title: L('tour.journal.reopen.title', 'Reopen the entry'),
      instruction: L('tour.journal.reopen.instruction', 'Reopen the same journal entry and confirm it loaded.'),
      targetId: 'journal.entry.practice',
      expectedAction: 'open_practice_entity',
      completionPredicate: 'entity_opened',
      entityType: 'journal_entry',
      recovery: L('tour.journal.reopen.recovery', 'Editor must load — list visibility is not enough.'),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'done',
      kind: 'informational',
      title: L('tour.journal.done.title', 'Journal covered'),
      instruction: L(
        'tour.journal.done.instruction',
        'Multiple entries per day remain supported; privacy controls stay in Settings/preferences.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.journal.done.recovery', 'Tap Next.'),
      allowSkip: false,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.journal-privacy'],
    },
  ],
};

export const TOUR_CHAPTER_FOLDERS_SEARCH: TourChapterDefinition = {
  id: 'tour.folders-search',
  definitionVersion: 1,
  contentVersion: 1,
  title: L('tour.folders-search.title', 'Folders, filters, and search'),
  summary: L(
    'tour.folders-search.summary',
    'Organize with folders, clear filters without moving records, and reopen a search hit.'
  ),
  platforms: PLATFORMS,
  featurePrerequisites: ['library', 'search'],
  learningChapterId: 'chapter.notes-library',
  coverageFamilies: ['library', 'search'],
  steps: [
    {
      id: 'intro',
      kind: 'informational',
      title: L('tour.folders-search.intro.title', 'Views vs ownership'),
      instruction: L(
        'tour.folders-search.intro.instruction',
        'Filters change what you see. Clearing filters does not move records. Search respects journal preview privacy.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.folders-search.intro.recovery', 'Tap Next.'),
      allowSkip: true,
      allowInformationalNext: true,
    },
    {
      id: 'create-folder',
      kind: 'action',
      title: L('tour.folders-search.folder.title', 'Create a practice folder'),
      instruction: L(
        'tour.folders-search.folder.instruction',
        'Create a labeled practice folder (respect depth/cycle rules).'
      ),
      targetId: 'library.folder.create',
      expectedAction: 'save_practice_entity',
      completionPredicate: 'entity_saved_locally',
      entityType: 'folder',
      recovery: L('tour.folders-search.folder.recovery', 'Skip if folder create is unavailable.'),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'filter',
      kind: 'action',
      title: L('tour.folders-search.filter.title', 'Apply then clear a filter'),
      instruction: L(
        'tour.folders-search.filter.instruction',
        'Apply a Library filter, then clear it. Records stay where they are.'
      ),
      targetId: 'library.filter',
      expectedAction: 'clear_filter',
      completionPredicate: 'filter_view_changed',
      recovery: L('tour.folders-search.filter.recovery', 'Clear filters from the filter bar.'),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'search-open',
      kind: 'action',
      title: L('tour.folders-search.search.title', 'Search and reopen'),
      instruction: L(
        'tour.folders-search.search.instruction',
        'Search for a practice item and open the canonical result.'
      ),
      targetId: 'shell.search',
      expectedAction: 'open_search_result',
      completionPredicate: 'search_result_opened',
      recovery: L(
        'tour.folders-search.search.recovery',
        'Offline search coverage may be partial — Help explains honesty.'
      ),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'done',
      kind: 'informational',
      title: L('tour.folders-search.done.title', 'Organization covered'),
      instruction: L(
        'tour.folders-search.done.instruction',
        'Cleanup remains selective. Do not bulk-delete by name prefix.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.folders-search.done.recovery', 'Tap Next.'),
      allowSkip: false,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.search', 'help.notes-and-library'],
    },
  ],
};

export const TOUR_CHAPTER_HELP_RETURN: TourChapterDefinition = {
  id: 'tour.help-return',
  definitionVersion: 1,
  contentVersion: 1,
  title: L('tour.help-return.title', 'Help without losing drafts'),
  summary: L(
    'tour.help-return.summary',
    'Open a Help article from context and return to the editor without discarding drafts; pause/resume learning.'
  ),
  platforms: PLATFORMS,
  featurePrerequisites: ['help'],
  learningChapterId: 'chapter.help-learning',
  coverageFamilies: ['help'],
  steps: [
    {
      id: 'intro',
      kind: 'informational',
      title: L('tour.help-return.intro.title', 'Keep your draft'),
      instruction: L(
        'tour.help-return.intro.instruction',
        'Start from an editor with unsaved text if you can. Help must not wipe it.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.help-return.intro.recovery', 'Tap Next.'),
      allowSkip: true,
      allowInformationalNext: true,
    },
    {
      id: 'open-help',
      kind: 'action',
      title: L('tour.help-return.open-help.title', 'Open Help'),
      instruction: L(
        'tour.help-return.open-help.instruction',
        'Open a relevant Help article (contextual link or Help catalog).'
      ),
      targetId: 'help.article.open',
      expectedAction: 'open_help_article',
      completionPredicate: 'help_article_opened',
      recovery: L('tour.help-return.open-help.recovery', 'Use /help or a ContextualHelpLink.'),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'return-editor',
      kind: 'action',
      title: L('tour.help-return.return.title', 'Return to the editor'),
      instruction: L(
        'tour.help-return.return.instruction',
        'Return to the original editor and confirm the draft is still there.'
      ),
      targetId: 'help.return.editor',
      expectedAction: 'return_from_help',
      completionPredicate: 'help_return_to_editor',
      recovery: L('tour.help-return.return.recovery', 'Use Back / return context — do not reload away the draft.'),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'pause-resume',
      kind: 'informational',
      title: L('tour.help-return.pause.title', 'Pause and resume'),
      instruction: L(
        'tour.help-return.pause.instruction',
        'Pause this chapter, leave Help, then Resume from Learn the app. Progress should restore.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.help-return.pause.recovery', 'Acknowledge after trying Pause/Resume.'),
      allowSkip: true,
      allowInformationalNext: true,
    },
    {
      id: 'cleanup',
      kind: 'action',
      title: L('tour.help-return.cleanup.title', 'Review practice cleanup'),
      instruction: L(
        'tour.help-return.cleanup.instruction',
        'Open practice cleanup review. Keep edited/linked items by default; remove only selected labeled practice records.'
      ),
      targetId: 'tour.cleanup.review',
      expectedAction: 'confirm_cleanup',
      completionPredicate: 'cleanup_selection_confirmed',
      recovery: L(
        'tour.help-return.cleanup.recovery',
        'You may keep everything. Never auto-delete user-owned items.'
      ),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'done',
      kind: 'informational',
      title: L('tour.help-return.done.title', 'Help covered'),
      instruction: L(
        'tour.help-return.done.instruction',
        'Advanced recovery/portability/attachments remain Phase 81 when those features are ready.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.help-return.done.recovery', 'Tap Next.'),
      allowSkip: false,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.using-help'],
    },
  ],
};

/** Everyday chapters excluding the Phase 79 starter (`tour.task-create-save`). */
export const TOUR_EVERYDAY_CHAPTERS_WITHOUT_STARTER: readonly TourChapterDefinition[] = [
  TOUR_CHAPTER_NAVIGATION,
  TOUR_CHAPTER_PERSONALIZATION,
  TOUR_CHAPTER_TASKS,
  TOUR_CHAPTER_ROUTINES,
  TOUR_CHAPTER_CALENDAR,
  TOUR_CHAPTER_NOTES_LIBRARY,
  TOUR_CHAPTER_JOURNAL,
  TOUR_CHAPTER_FOLDERS_SEARCH,
  TOUR_CHAPTER_HELP_RETURN,
];
