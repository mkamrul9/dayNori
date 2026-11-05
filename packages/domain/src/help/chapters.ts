import { L } from './text.js';
import type { LearningChapter } from './types.js';

/**
 * Learn the app chapter catalog (Phase 78–80).
 * `runnable` only when action-verified tour definitions are implemented and verified.
 * Phase 81 advanced/gated chapters stay gated or coming later.
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
      'Replay the beginner onboarding from Help. Everyday guided chapters cover workflows after first use.'
    ),
  },
  {
    id: 'chapter.navigation',
    title: L('help.chapter.navigation.title', 'Find your way around'),
    summary: L(
      'help.chapter.navigation.summary',
      'Today, Plan, Library, Journal, Create, Search, and All features — plus personalization.'
    ),
    relatedArticleIds: ['help.navigate-shell', 'help.all-features-pins'],
    state: 'runnable',
    stateExplanation: L(
      'help.chapter.navigation.state',
      'Start guided navigation and personalization chapters. They advance only after real shell actions.'
    ),
  },
  {
    id: 'chapter.task-create-save',
    title: L('help.chapter.task-create-save.title', 'Starter: your first task'),
    summary: L(
      'help.chapter.task-create-save.summary',
      'Optional short starter: create, save, reopen, complete, and undo one task.'
    ),
    relatedArticleIds: ['help.tasks-vs-routines'],
    state: 'runnable',
    stateExplanation: L(
      'help.chapter.task-create-save.state',
      'Start the short starter chapter, or continue with Tasks and routines for fuller coverage.'
    ),
  },
  {
    id: 'chapter.tasks-routines',
    title: L('help.chapter.tasks-routines.title', 'Tasks and routines'),
    summary: L(
      'help.chapter.tasks-routines.summary',
      'Day-to-day tasks, filters, routines, and independent occurrences.'
    ),
    relatedArticleIds: ['help.tasks-vs-routines'],
    state: 'runnable',
    stateExplanation: L(
      'help.chapter.tasks-routines.state',
      'Guided chapters for tasks and routines use real Create/Plan controls and durable save checks.'
    ),
  },
  {
    id: 'chapter.calendar',
    title: L('help.chapter.calendar.title', 'Calendar'),
    summary: L('help.chapter.calendar.summary', 'Agenda, month, projections, and private events.'),
    relatedArticleIds: ['help.calendar'],
    state: 'runnable',
    stateExplanation: L(
      'help.chapter.calendar.state',
      'Guided calendar practice opens projections as source records and can create a practice event.'
    ),
  },
  {
    id: 'chapter.notes-library',
    title: L('help.chapter.notes-library.title', 'Notes, Library, folders, and search'),
    summary: L(
      'help.chapter.notes-library.summary',
      'Notes, save labels, folders, filters, and search reopen.'
    ),
    relatedArticleIds: ['help.notes-and-library', 'help.search'],
    state: 'runnable',
    stateExplanation: L(
      'help.chapter.notes-library.state',
      'Guided notes/library and folders/search chapters are available. Reading articles alone is not practice completion.'
    ),
  },
  {
    id: 'chapter.journal',
    title: L('help.chapter.journal.title', 'Journal privacy'),
    summary: L('help.chapter.journal.summary', 'Private entries and preview settings.'),
    relatedArticleIds: ['help.journal-privacy'],
    state: 'runnable',
    stateExplanation: L(
      'help.chapter.journal.state',
      'Guided journal practice never stores entry bodies in tour progress.'
    ),
  },
  {
    id: 'chapter.files-audio',
    title: L('help.chapter.files-audio.title', 'Files and audio'),
    summary: L(
      'help.chapter.files-audio.summary',
      'Uploads, quota, and recording controls.'
    ),
    relatedArticleIds: ['help.files-upload', 'help.audio-recording'],
    state: 'runnable',
    stateExplanation: L(
      'help.chapter.files-audio.state',
      'Guided practice covers quota-safe local file attachments and audio recording controls.'
    ),
  },
  {
    id: 'chapter.expenses',
    title: L('help.chapter.expenses.title', 'Expenses'),
    summary: L('help.chapter.expenses.summary', 'Exact amounts, refunds, and reports.'),
    relatedArticleIds: ['help.expenses'],
    state: 'runnable',
    stateExplanation: L(
      'help.chapter.expenses.state',
      'Guided practice teaches creating expenses, categories, and reviewable budgets with zero real charges.'
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
    state: 'runnable',
    stateExplanation: L(
      'help.chapter.custom-sections.state',
      'Guided practice teaches composing approved section blocks and accessible reordering safely.'
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
    state: 'runnable',
    stateExplanation: L(
      'help.chapter.offline-sync.state',
      'Guided practice covers durable local save receipts, offline queueing, and non-destructive conflict handling.'
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
      'These features are currently gated (Phase 60 vault, Phase 69 reminders, Drive, rooms, billing, assistant). Fake live practice is prohibited.'
    ),
  },
  {
    id: 'chapter.integrations-future',
    title: L('help.chapter.integrations-future.title', 'Future integrations and automations'),
    summary: L(
      'help.chapter.integrations-future.summary',
      'Third-party sync, external calendar integrations, and webhook automations.'
    ),
    relatedArticleIds: ['help.save-and-sync'],
    state: 'coming_later',
    stateExplanation: L(
      'help.chapter.integrations-future.state',
      'External third-party bridges, calendar automations, and sync relays will be covered in future releases.'
    ),
  },
  {
    id: 'chapter.help-learning',
    title: L('help.chapter.help-learning.title', 'Using Help'),
    summary: L(
      'help.chapter.help-learning.summary',
      'Open Help, return to drafts, pause/resume learning, and review practice cleanup.'
    ),
    relatedArticleIds: ['help.using-help', 'help.support-and-feedback'],
    state: 'runnable',
    stateExplanation: L(
      'help.chapter.help-learning.state',
      'Start the Help-return guided chapter, or replay the beginner guide.'
    ),
  },
] as const;
