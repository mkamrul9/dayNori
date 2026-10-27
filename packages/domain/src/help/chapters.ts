import { L } from './text.js';
import type { LearningChapter } from './types.js';

/**
 * Learn the app chapter catalog (Phase 78).
 * Runnable action-verified tours are Phase 79 — chapters stay honest about state.
 */
export const LEARNING_CHAPTERS: readonly LearningChapter[] = [
  {
    id: 'chapter.account-first-use',
    title: L('help.chapter.account-first-use.title', 'Account and first use'),
    summary: L(
      'help.chapter.account-first-use.summary',
      'Sign-in, workspace readiness, and preferences.'
    ),
    relatedArticleIds: ['help.welcome-and-sign-in', 'help.workspace-and-preferences'],
    state: 'available_replay',
    stateExplanation: L(
      'help.chapter.account-first-use.state',
      'Replay the existing beginner onboarding from Help. A full action-verified tour engine arrives later.'
    ),
  },
  {
    id: 'chapter.navigation',
    title: L('help.chapter.navigation.title', 'Find your way around'),
    summary: L(
      'help.chapter.navigation.summary',
      'Today, Plan, Library, Create, and All features.'
    ),
    relatedArticleIds: ['help.navigate-shell', 'help.all-features-pins'],
    state: 'coming_later',
    stateExplanation: L(
      'help.chapter.navigation.state',
      'Guided practice for this chapter is coming later. Read the related Help articles now.'
    ),
  },
  {
    id: 'chapter.tasks-routines',
    title: L('help.chapter.tasks-routines.title', 'Tasks and routines'),
    summary: L(
      'help.chapter.tasks-routines.summary',
      'One-time tasks versus repeating routines.'
    ),
    relatedArticleIds: ['help.tasks-vs-routines'],
    state: 'coming_later',
    stateExplanation: L(
      'help.chapter.tasks-routines.state',
      'Guided practice is not runnable yet. Use the Help article to learn the distinction.'
    ),
  },
  {
    id: 'chapter.calendar',
    title: L('help.chapter.calendar.title', 'Calendar'),
    summary: L('help.chapter.calendar.summary', 'Agenda, month, and canonical projections.'),
    relatedArticleIds: ['help.calendar'],
    state: 'coming_later',
    stateExplanation: L(
      'help.chapter.calendar.state',
      'Guided practice coming later. Open Plan → Calendar with the Help article beside you.'
    ),
  },
  {
    id: 'chapter.notes-library',
    title: L('help.chapter.notes-library.title', 'Notes and Library'),
    summary: L(
      'help.chapter.notes-library.summary',
      'Writing, folders, filters, and save status.'
    ),
    relatedArticleIds: ['help.notes-and-library', 'help.search'],
    state: 'coming_later',
    stateExplanation: L(
      'help.chapter.notes-library.state',
      'Guided practice coming later. Articles stay available offline for essentials.'
    ),
  },
  {
    id: 'chapter.journal',
    title: L('help.chapter.journal.title', 'Journal privacy'),
    summary: L('help.chapter.journal.summary', 'Private entries and preview settings.'),
    relatedArticleIds: ['help.journal-privacy'],
    state: 'coming_later',
    stateExplanation: L(
      'help.chapter.journal.state',
      'Guided practice coming later. Opening articles is not the same as finishing a guided chapter.'
    ),
  },
  {
    id: 'chapter.files-audio',
    title: L('help.chapter.files-audio.title', 'Files and audio'),
    summary: L(
      'help.chapter.files-audio.summary',
      'Uploads, quota, and recording — often gated.'
    ),
    relatedArticleIds: ['help.files-upload', 'help.audio-recording'],
    state: 'gated_unavailable',
    stateExplanation: L(
      'help.chapter.files-audio.state',
      'Live practice stays unavailable while attachment capabilities are gated. Read the Help articles for honest prerequisites.'
    ),
  },
  {
    id: 'chapter.expenses',
    title: L('help.chapter.expenses.title', 'Expenses'),
    summary: L('help.chapter.expenses.summary', 'Exact amounts, refunds, and reports.'),
    relatedArticleIds: ['help.expenses'],
    state: 'coming_later',
    stateExplanation: L(
      'help.chapter.expenses.state',
      'Guided practice coming later. Help never creates a real expense.'
    ),
  },
  {
    id: 'chapter.custom-sections',
    title: L('help.chapter.custom-sections.title', 'Custom sections'),
    summary: L(
      'help.chapter.custom-sections.summary',
      'Templates, fields, reorder, and migration recovery.'
    ),
    relatedArticleIds: ['help.custom-sections'],
    state: 'coming_later',
    stateExplanation: L(
      'help.chapter.custom-sections.state',
      'Guided practice coming later.'
    ),
  },
  {
    id: 'chapter.offline-sync',
    title: L('help.chapter.offline-sync.title', 'Save, sync, and offline'),
    summary: L(
      'help.chapter.offline-sync.summary',
      'Local save labels, conflicts, trusted-device offline, Update/Later.'
    ),
    relatedArticleIds: ['help.save-and-sync', 'help.offline-reopen', 'help.export-import'],
    state: 'coming_later',
    stateExplanation: L(
      'help.chapter.offline-sync.state',
      'Essential recovery articles are available offline. Full installed-PWA/native cold-launch verification may still be outstanding.'
    ),
  },
  {
    id: 'chapter.optional-gated',
    title: L('help.chapter.optional-gated.title', 'Optional features'),
    summary: L(
      'help.chapter.optional-gated.summary',
      'Vault, Drive, rooms, billing, and assistant when released.'
    ),
    relatedArticleIds: [
      'help.vault-optional',
      'help.drive-optional',
      'help.rooms-optional',
      'help.billing-optional',
      'help.assistant-optional',
    ],
    state: 'gated_unavailable',
    stateExplanation: L(
      'help.chapter.optional-gated.state',
      'These features may be off in your build. Help explains availability; practice stays unavailable when gated.'
    ),
  },
  {
    id: 'chapter.help-learning',
    title: L('help.chapter.help-learning.title', 'Using Help'),
    summary: L(
      'help.chapter.help-learning.summary',
      'Search Help, Learn the app, and beginner replay.'
    ),
    relatedArticleIds: ['help.using-help', 'help.support-and-feedback'],
    state: 'available_replay',
    stateExplanation: L(
      'help.chapter.help-learning.state',
      'You can replay the beginner guide now. Article reading is not a substitute for a future guided chapter.'
    ),
  },
] as const;
