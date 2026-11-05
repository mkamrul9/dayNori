import type { TourChapterDefinition } from './types.js';

const L = (key: string, defaultText: string) => ({ key, defaultText });
const PLATFORMS = ['web', 'installedPwa', 'android'] as const;

/**
 * Checks whether a chapter is capability-gated on unreleased features.
 * Invariant: Unavailable capabilities cannot launch fake live practice.
 */
export function isChapterGated(chapter: TourChapterDefinition): boolean {
  if (chapter.isGated === true) return true;
  const gatedFeatures = ['reminders', 'vault', 'drive', 'rooms', 'billing', 'assistant'];
  return chapter.featurePrerequisites.some((f) => gatedFeatures.includes(f));
}

// ============================================================================
// PART 1: AVAILABLE ADVANCED CHAPTERS (Action-verified with durable receipts)
// ============================================================================

/**
 * Files and audio attachments chapter (Phase 75/81).
 * Teaches local attachment storage, metadata, and audio preview controls without cloud quota exposure.
 */
export const TOUR_CHAPTER_FILES_AUDIO: TourChapterDefinition = {
  id: 'tour.files-audio',
  definitionVersion: 1,
  contentVersion: 1,
  isAdvanced: true,
  title: L('tour.files-audio.title', 'Files and audio attachments'),
  summary: L(
    'tour.files-audio.summary',
    'Practice attaching files and audio records, inspecting file quotas, and managing attachments safely.'
  ),
  platforms: PLATFORMS,
  featurePrerequisites: ['library'],
  learningChapterId: 'chapter.files-audio',
  coverageFamilies: ['files', 'audio'],
  steps: [
    {
      id: 'intro',
      kind: 'informational',
      title: L('tour.files-audio.intro.title', 'Attachments and audio'),
      instruction: L(
        'tour.files-audio.intro.instruction',
        'Learn to link files and audio recordings to your notes and library. Attachments use quota-safe local storage.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.files-audio.intro.recovery', 'Tap Next to begin practice.'),
      allowSkip: true,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.files-upload', 'help.audio-recording'],
    },
    {
      id: 'open-create',
      kind: 'action',
      title: L('tour.files-audio.open-create.title', 'Open Create'),
      instruction: L(
        'tour.files-audio.open-create.instruction',
        'Open the Create menu (+) from the navigation header.'
      ),
      route: '/library',
      targetId: 'shell.create',
      expectedAction: 'open_create',
      completionPredicate: 'target_activated',
      recovery: L('tour.files-audio.open-create.recovery', 'Tap Create (+) in the header.'),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'select-file-type',
      kind: 'action',
      title: L('tour.files-audio.select-file-type.title', 'Choose File upload'),
      instruction: L(
        'tour.files-audio.select-file-type.instruction',
        'Select Upload File in the create sheet.'
      ),
      targetId: 'create.type.file',
      expectedAction: 'select_create_type',
      completionPredicate: 'create_type_selected',
      createType: 'file',
      recovery: L(
        'tour.files-audio.select-file-type.recovery',
        'Re-open Create if the sheet closed. Choose Upload File.'
      ),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'save-practice-file',
      kind: 'action',
      title: L('tour.files-audio.save-practice-file.title', 'Attach practice document'),
      instruction: L(
        'tour.files-audio.save-practice-file.instruction',
        'Save a practice attachment. Wait for the local storage receipt to confirm the file is saved on this device.'
      ),
      targetId: 'create.file.save',
      expectedAction: 'save_practice_entity',
      completionPredicate: 'entity_saved_locally',
      entityType: 'file',
      recovery: L(
        'tour.files-audio.save-practice-file.recovery',
        'If saving failed, retry. Local attachments persist in indexed device storage.'
      ),
      allowSkip: false,
      allowInformationalNext: false,
    },
    {
      id: 'record-audio-preview',
      kind: 'action',
      title: L('tour.files-audio.record-audio-preview.title', 'Preview attached record'),
      instruction: L(
        'tour.files-audio.record-audio-preview.instruction',
        'Open the practice file attachment to inspect its details and view audio capture options.'
      ),
      targetId: 'audio.record-control',
      expectedAction: 'open_practice_entity',
      completionPredicate: 'entity_opened',
      entityType: 'file',
      recovery: L(
        'tour.files-audio.record-audio-preview.recovery',
        'Open the file from the library list until its preview panel loads.'
      ),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'quota-review',
      kind: 'informational',
      title: L('tour.files-audio.quota-review.title', 'Storage quota and policy'),
      instruction: L(
        'tour.files-audio.quota-review.instruction',
        'Attachments count toward your workspace file quota. Large media is kept on-device until explicitly synchronized.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.files-audio.quota-review.recovery', 'Tap Next to complete this chapter.'),
      allowSkip: true,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.files-upload'],
    },
    {
      id: 'done',
      kind: 'informational',
      title: L('tour.files-audio.done.title', 'Files and audio covered'),
      instruction: L(
        'tour.files-audio.done.instruction',
        'You learned how file and audio attachments work locally. Clean up practice files anytime via Help.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.files-audio.done.recovery', 'Tap Next to finish.'),
      allowSkip: false,
      allowInformationalNext: true,
    },
  ],
};

/**
 * Expenses and budgets chapter (Phase 76/81).
 * Teaches creating expenses, exact amounts, currency codes, and budgets with zero real charges.
 */
export const TOUR_CHAPTER_EXPENSES: TourChapterDefinition = {
  id: 'tour.expenses',
  definitionVersion: 1,
  contentVersion: 1,
  isAdvanced: true,
  title: L('tour.expenses.title', 'Expenses and budgets'),
  summary: L(
    'tour.expenses.summary',
    'Track exact financial amounts, currency, categories, and review expense reports without real transactions.'
  ),
  platforms: PLATFORMS,
  featurePrerequisites: ['expenses'],
  learningChapterId: 'chapter.expenses',
  coverageFamilies: ['expenses'],
  steps: [
    {
      id: 'intro',
      kind: 'informational',
      title: L('tour.expenses.intro.title', 'Track daily spending'),
      instruction: L(
        'tour.expenses.intro.instruction',
        'Daynori tracks expenses with exact decimal precision and currencies. Practice entries never make real financial transactions.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.expenses.intro.recovery', 'Tap Next to begin.'),
      allowSkip: true,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.expenses'],
    },
    {
      id: 'open-create',
      kind: 'action',
      title: L('tour.expenses.open-create.title', 'Open Create'),
      instruction: L('tour.expenses.open-create.instruction', 'Open Create (+) from the navigation header.'),
      route: '/expenses',
      targetId: 'shell.create',
      expectedAction: 'open_create',
      completionPredicate: 'target_activated',
      recovery: L('tour.expenses.open-create.recovery', 'Use Create (+) in the top header.'),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'select-expense-type',
      kind: 'action',
      title: L('tour.expenses.select-expense-type.title', 'Choose Expense'),
      instruction: L(
        'tour.expenses.select-expense-type.instruction',
        'Choose New Expense in the create sheet.'
      ),
      targetId: 'create.type.expense',
      expectedAction: 'select_create_type',
      completionPredicate: 'create_type_selected',
      createType: 'expense',
      recovery: L(
        'tour.expenses.select-expense-type.recovery',
        'Select Expense in the list of available item types.'
      ),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'save-practice-expense',
      kind: 'action',
      title: L('tour.expenses.save-practice-expense.title', 'Save practice expense'),
      instruction: L(
        'tour.expenses.save-practice-expense.instruction',
        'Enter an amount, choose a category, and save. The record is persisted with a durable local receipt.'
      ),
      targetId: 'create.expense.save',
      expectedAction: 'save_practice_entity',
      completionPredicate: 'entity_saved_locally',
      entityType: 'expense',
      recovery: L(
        'tour.expenses.save-practice-expense.recovery',
        'Fix any validation error and save. Practice expenses use your selected currency.'
      ),
      allowSkip: false,
      allowInformationalNext: false,
    },
    {
      id: 'open-expenses-view',
      kind: 'action',
      title: L('tour.expenses.open-expenses-view.title', 'Review expenses dashboard'),
      instruction: L(
        'tour.expenses.open-expenses-view.instruction',
        'Open the Expenses dashboard to see monthly totals, category breakdowns, and budgets.'
      ),
      route: '/expenses',
      targetId: 'expenses.list.view',
      expectedAction: 'open_practice_entity',
      completionPredicate: 'entity_opened',
      entityType: 'expense',
      recovery: L(
        'tour.expenses.open-expenses-view.recovery',
        'Navigate to Expenses via All features or sidebar.'
      ),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'done',
      kind: 'informational',
      title: L('tour.expenses.done.title', 'Expenses covered'),
      instruction: L(
        'tour.expenses.done.instruction',
        'You learned to track expenses, filter categories, and inspect budgets. Export summaries anytime.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.expenses.done.recovery', 'Tap Next to finish.'),
      allowSkip: false,
      allowInformationalNext: true,
    },
  ],
};

/**
 * Approved custom sections chapter (Phase 76/81).
 * Teaches custom section composition with approved block types and strict script/SQL execution invariants.
 */
export const TOUR_CHAPTER_CUSTOM_SECTIONS: TourChapterDefinition = {
  id: 'tour.custom-sections',
  definitionVersion: 1,
  contentVersion: 1,
  isAdvanced: true,
  title: L('tour.custom-sections.title', 'Custom sections'),
  summary: L(
    'tour.custom-sections.summary',
    'Organize records with approved custom section blocks (Checklists, Key-Value, Text) safely.'
  ),
  platforms: PLATFORMS,
  featurePrerequisites: ['custom-sections'],
  learningChapterId: 'chapter.custom-sections',
  coverageFamilies: ['custom-sections'],
  steps: [
    {
      id: 'intro',
      kind: 'informational',
      title: L('tour.custom-sections.intro.title', 'Structured custom sections'),
      instruction: L(
        'tour.custom-sections.intro.instruction',
        'Compose reusable sections using approved block types (Checklist, Key-Value, Text). Daynori never executes user scripts or raw SQL.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.custom-sections.intro.recovery', 'Tap Next to begin.'),
      allowSkip: true,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.custom-sections'],
    },
    {
      id: 'open-builder',
      kind: 'action',
      title: L('tour.custom-sections.open-builder.title', 'Open Sections builder'),
      instruction: L(
        'tour.custom-sections.open-builder.instruction',
        'Open the Custom sections builder to create or modify a section composition.'
      ),
      route: '/custom-sections',
      targetId: 'sections.open-builder',
      expectedAction: 'navigate_shell',
      completionPredicate: 'target_activated',
      recovery: L(
        'tour.custom-sections.open-builder.recovery',
        'Navigate to Custom sections and click Create Section.'
      ),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'add-approved-block',
      kind: 'action',
      title: L('tour.custom-sections.add-approved-block.title', 'Add an approved block'),
      instruction: L(
        'tour.custom-sections.add-approved-block.instruction',
        'Select an approved block type, such as a Checklist or Key-Value field.'
      ),
      targetId: 'sections.add-block',
      expectedAction: 'update_practice_entity',
      completionPredicate: 'entity_updated_locally',
      entityType: 'custom_section',
      recovery: L(
        'tour.custom-sections.add-approved-block.recovery',
        'Choose one of the approved block types in the builder modal.'
      ),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'save-section-template',
      kind: 'action',
      title: L('tour.custom-sections.save-section-template.title', 'Save section composition'),
      instruction: L(
        'tour.custom-sections.save-section-template.instruction',
        'Save the section. Schema revisions are validated to protect existing record references.'
      ),
      targetId: 'sections.save',
      expectedAction: 'save_practice_entity',
      completionPredicate: 'entity_saved_locally',
      entityType: 'custom_section',
      recovery: L(
        'tour.custom-sections.save-section-template.recovery',
        'Click Save Section. Schema updates preserve existing linked data.'
      ),
      allowSkip: false,
      allowInformationalNext: false,
    },
    {
      id: 'done',
      kind: 'informational',
      title: L('tour.custom-sections.done.title', 'Custom sections covered'),
      instruction: L(
        'tour.custom-sections.done.instruction',
        'You learned how to build safe, structured section templates across your workspace.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.custom-sections.done.recovery', 'Tap Next to finish.'),
      allowSkip: false,
      allowInformationalNext: true,
    },
  ],
};

/**
 * Offline save, sync, and conflict recovery chapter (Phase 77/81).
 * Teaches local-first durable save receipts, offline queueing, and non-destructive conflict handling.
 */
export const TOUR_CHAPTER_OFFLINE_SYNC: TourChapterDefinition = {
  id: 'tour.offline-sync',
  definitionVersion: 1,
  contentVersion: 1,
  isAdvanced: true,
  title: L('tour.offline-sync.title', 'Save, sync, and offline recovery'),
  summary: L(
    'tour.offline-sync.summary',
    'Learn durable local save receipts, offline indicators, and explicit conflict resolution (Update vs Later).'
  ),
  platforms: PLATFORMS,
  featurePrerequisites: ['shell'],
  learningChapterId: 'chapter.offline-sync',
  coverageFamilies: ['sync', 'offline', 'portability'],
  steps: [
    {
      id: 'intro',
      kind: 'informational',
      title: L('tour.offline-sync.intro.title', 'Local-first reliability'),
      instruction: L(
        'tour.offline-sync.intro.instruction',
        'Daynori saves changes to your device immediately. Sync happens in the background when connectivity is available.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.offline-sync.intro.recovery', 'Tap Next to learn sync indicators.'),
      allowSkip: true,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.save-and-sync', 'help.offline-reopen'],
    },
    {
      id: 'observe-offline-badge',
      kind: 'informational',
      title: L('tour.offline-sync.observe-offline-badge.title', 'Saved on this device'),
      instruction: L(
        'tour.offline-sync.observe-offline-badge.instruction',
        'When offline, mutations show "Saved on this device". Daynori never claims cloud persistence without server acknowledgment.'
      ),
      targetId: 'sync.offline-indicator',
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.offline-sync.observe-offline-badge.recovery', 'Tap Next when ready.'),
      allowSkip: true,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.save-and-sync'],
    },
    {
      id: 'review-conflict-resolution',
      kind: 'informational',
      title: L('tour.offline-sync.review-conflict-resolution.title', 'Sync conflict safety'),
      instruction: L(
        'tour.offline-sync.review-conflict-resolution.instruction',
        'If an item was updated on another device, Daynori flags the conflict. You choose "Update" or "Later" — never silent data loss.'
      ),
      targetId: 'sync.conflict-dialog',
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.offline-sync.review-conflict-resolution.recovery', 'Tap Next.'),
      allowSkip: true,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.save-and-sync'],
    },
    {
      id: 'export-backup-preview',
      kind: 'action',
      title: L('tour.offline-sync.export-backup-preview.title', 'Data export & portability'),
      instruction: L(
        'tour.offline-sync.export-backup-preview.instruction',
        'Open Settings to view data portability options. You can export complete offline JSON/ZIP backups anytime.'
      ),
      route: '/settings',
      targetId: 'portability.export-btn',
      expectedAction: 'navigate_shell',
      completionPredicate: 'target_activated',
      recovery: L(
        'tour.offline-sync.export-backup-preview.recovery',
        'Open Settings and navigate to the Export / Backup section.'
      ),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'done',
      kind: 'informational',
      title: L('tour.offline-sync.done.title', 'Sync and offline covered'),
      instruction: L(
        'tour.offline-sync.done.instruction',
        'You understand local-first durable save receipts, background sync, and conflict resolution.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.offline-sync.done.recovery', 'Tap Next to finish.'),
      allowSkip: false,
      allowInformationalNext: true,
    },
  ],
};

/**
 * Trash and safe recovery chapter.
 * Teaches soft-deletion, inspecting Trash, and restoring items without data loss.
 */
export const TOUR_CHAPTER_TRASH_RECOVERY: TourChapterDefinition = {
  id: 'tour.trash-recovery',
  definitionVersion: 1,
  contentVersion: 1,
  isAdvanced: true,
  title: L('tour.trash-recovery.title', 'Trash and safe recovery'),
  summary: L(
    'tour.trash-recovery.summary',
    'Move practice records to Trash, inspect Trash contents, and restore items without data loss.'
  ),
  platforms: PLATFORMS,
  featurePrerequisites: ['library'],
  learningChapterId: 'chapter.notes-library',
  coverageFamilies: ['trash', 'notes', 'library'],
  steps: [
    {
      id: 'intro',
      kind: 'informational',
      title: L('tour.trash-recovery.intro.title', 'Two-stage deletion safety'),
      instruction: L(
        'tour.trash-recovery.intro.instruction',
        'Deleted items move to Trash first. They remain recoverable for 30 days before permanent deletion.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.trash-recovery.intro.recovery', 'Tap Next to begin.'),
      allowSkip: true,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.notes-and-library'],
    },
    {
      id: 'open-practice-note',
      kind: 'action',
      title: L('tour.trash-recovery.open-practice-note.title', 'Open practice note'),
      instruction: L(
        'tour.trash-recovery.open-practice-note.instruction',
        'Open the practice note in Library to prepare for safe trash demonstration.'
      ),
      route: '/library',
      targetId: 'library.practice.item',
      expectedAction: 'open_practice_entity',
      completionPredicate: 'entity_opened',
      entityType: 'note',
      recovery: L(
        'tour.trash-recovery.open-practice-note.recovery',
        'Click on your practice note in the Library list.'
      ),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'move-to-trash',
      kind: 'action',
      title: L('tour.trash-recovery.move-to-trash.title', 'Move to Trash'),
      instruction: L(
        'tour.trash-recovery.move-to-trash.instruction',
        'Click Delete / Move to Trash. The note moves to Trash without being permanently removed.'
      ),
      targetId: 'note.move-trash',
      expectedAction: 'update_practice_entity',
      completionPredicate: 'entity_updated_locally',
      entityType: 'note',
      recovery: L(
        'tour.trash-recovery.move-to-trash.recovery',
        'Use the Trash icon in the note toolbar.'
      ),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'open-trash-filter',
      kind: 'action',
      title: L('tour.trash-recovery.open-trash-filter.title', 'Open Trash filter'),
      instruction: L(
        'tour.trash-recovery.open-trash-filter.instruction',
        'View the Trash filter to locate soft-deleted records.'
      ),
      targetId: 'library.view.trash',
      expectedAction: 'apply_filter',
      completionPredicate: 'filter_view_changed',
      recovery: L(
        'tour.trash-recovery.open-trash-filter.recovery',
        'Switch to the Trash view in Library.'
      ),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'restore-practice-note',
      kind: 'action',
      title: L('tour.trash-recovery.restore-practice-note.title', 'Restore from Trash'),
      instruction: L(
        'tour.trash-recovery.restore-practice-note.instruction',
        'Restore the note from Trash back to active Library records.'
      ),
      targetId: 'trash.restore-item',
      expectedAction: 'update_practice_entity',
      completionPredicate: 'entity_updated_locally',
      entityType: 'note',
      recovery: L(
        'tour.trash-recovery.restore-practice-note.recovery',
        'Click Restore on the trashed item.'
      ),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'done',
      kind: 'informational',
      title: L('tour.trash-recovery.done.title', 'Recovery verified'),
      instruction: L(
        'tour.trash-recovery.done.instruction',
        'Your note is restored safely. Permanent deletion requires explicit secondary confirmation.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.trash-recovery.done.recovery', 'Tap Next to finish.'),
      allowSkip: false,
      allowInformationalNext: true,
    },
  ],
};

// ============================================================================
// PART 2: SAFE EXPLANATORY TREATMENT CHAPTERS (Non-destructive / zero charges)
// ============================================================================

/**
 * Account deletion safeguards chapter.
 * Rule: Learning must never require real account deletion.
 */
export const TOUR_CHAPTER_ACCOUNT_DELETION_SAFE: TourChapterDefinition = {
  id: 'tour.account-deletion-safe',
  definitionVersion: 1,
  contentVersion: 1,
  isSafeTreatment: true,
  title: L('tour.account-deletion-safe.title', 'Account deletion safeguards'),
  summary: L(
    'tour.account-deletion-safe.summary',
    'Understand data export, grace periods, and deletion safeguards without deleting your account.'
  ),
  platforms: PLATFORMS,
  featurePrerequisites: ['settings'],
  learningChapterId: 'chapter.account-first-use',
  coverageFamilies: ['account'],
  steps: [
    {
      id: 'intro',
      kind: 'informational',
      title: L('tour.account-deletion-safe.intro.title', 'Safe deletion overview'),
      instruction: L(
        'tour.account-deletion-safe.intro.instruction',
        'Account deletion is irreversible. This walkthrough explains the safety steps without deleting any real account.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.account-deletion-safe.intro.recovery', 'Tap Next to review safeguards.'),
      allowSkip: true,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.welcome-and-sign-in'],
    },
    {
      id: 'open-account-settings',
      kind: 'action',
      title: L('tour.account-deletion-safe.open-account-settings.title', 'Open Account settings'),
      instruction: L(
        'tour.account-deletion-safe.open-account-settings.instruction',
        'Open Account Settings to inspect security and profile management.'
      ),
      route: '/settings',
      targetId: 'settings.account-link',
      expectedAction: 'navigate_shell',
      completionPredicate: 'target_activated',
      recovery: L(
        'tour.account-deletion-safe.open-account-settings.recovery',
        'Click Account in the Settings navigation.'
      ),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'inspect-deletion-safeguards',
      kind: 'informational',
      title: L('tour.account-deletion-safe.inspect-deletion-safeguards.title', 'Export before deletion'),
      instruction: L(
        'tour.account-deletion-safe.inspect-deletion-safeguards.instruction',
        'Before deletion, you are prompted to download a full data archive. A 30-day grace period allows cancellation before permanent removal.'
      ),
      targetId: 'account.deletion-info',
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.account-deletion-safe.inspect-deletion-safeguards.recovery', 'Tap Next.'),
      allowSkip: true,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.welcome-and-sign-in'],
    },
    {
      id: 'done',
      kind: 'informational',
      title: L('tour.account-deletion-safe.done.title', 'Safeguards understood'),
      instruction: L(
        'tour.account-deletion-safe.done.instruction',
        'You reviewed account deletion protections safely without touching live account status.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.account-deletion-safe.done.recovery', 'Tap Next to complete.'),
      allowSkip: false,
      allowInformationalNext: true,
    },
  ],
};

/**
 * Recovery secrets and credential security chapter.
 * Rule: Learning must never require real secret disclosure or password changing.
 */
export const TOUR_CHAPTER_RECOVERY_SECRETS_SAFE: TourChapterDefinition = {
  id: 'tour.recovery-secrets-safe',
  definitionVersion: 1,
  contentVersion: 1,
  isSafeTreatment: true,
  title: L('tour.recovery-secrets-safe.title', 'Recovery keys and password security'),
  summary: L(
    'tour.recovery-secrets-safe.summary',
    'Learn how password reset, session recovery, and emergency access kits work safely.'
  ),
  platforms: PLATFORMS,
  featurePrerequisites: ['settings'],
  learningChapterId: 'chapter.account-first-use',
  coverageFamilies: ['account'],
  steps: [
    {
      id: 'intro',
      kind: 'informational',
      title: L('tour.recovery-secrets-safe.intro.title', 'Security without exposure'),
      instruction: L(
        'tour.recovery-secrets-safe.intro.instruction',
        'Learn how session tokens and recovery kits protect your workspace without disclosing credentials.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.recovery-secrets-safe.intro.recovery', 'Tap Next to begin.'),
      allowSkip: true,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.welcome-and-sign-in'],
    },
    {
      id: 'view-security-settings',
      kind: 'action',
      title: L('tour.recovery-secrets-safe.view-security-settings.title', 'View Security settings'),
      instruction: L(
        'tour.recovery-secrets-safe.view-security-settings.instruction',
        'Open Security & Session management in Settings.'
      ),
      route: '/settings',
      targetId: 'settings.security-link',
      expectedAction: 'navigate_shell',
      completionPredicate: 'target_activated',
      recovery: L(
        'tour.recovery-secrets-safe.view-security-settings.recovery',
        'Open Settings and select Security.'
      ),
      allowSkip: true,
      allowInformationalNext: false,
    },
    {
      id: 'inspect-session-recovery',
      kind: 'informational',
      title: L('tour.recovery-secrets-safe.inspect-session-recovery.title', 'Session revocation'),
      instruction: L(
        'tour.recovery-secrets-safe.inspect-session-recovery.instruction',
        'If a device is lost, active sessions can be revoked immediately from any authenticated device.'
      ),
      targetId: 'account.session-recovery-info',
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.recovery-secrets-safe.inspect-session-recovery.recovery', 'Tap Next.'),
      allowSkip: true,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.welcome-and-sign-in'],
    },
    {
      id: 'done',
      kind: 'informational',
      title: L('tour.recovery-secrets-safe.done.title', 'Security principles verified'),
      instruction: L(
        'tour.recovery-secrets-safe.done.instruction',
        'You verified credential safeguards and session management without altering active keys.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.recovery-secrets-safe.done.recovery', 'Tap Next to finish.'),
      allowSkip: false,
      allowInformationalNext: true,
    },
  ],
};

/**
 * Plans and purchases overview chapter.
 * Rule: Learning must never require real financial charges.
 */
export const TOUR_CHAPTER_BILLING_SAFE: TourChapterDefinition = {
  id: 'tour.billing-safe',
  definitionVersion: 1,
  contentVersion: 1,
  isSafeTreatment: true,
  title: L('tour.billing-safe.title', 'Plans and purchases overview'),
  summary: L(
    'tour.billing-safe.summary',
    'Explore workspace tiers and features in sandbox preview mode with no real charges.'
  ),
  platforms: PLATFORMS,
  featurePrerequisites: ['settings'],
  learningChapterId: 'chapter.optional-gated',
  coverageFamilies: ['billing'],
  steps: [
    {
      id: 'intro',
      kind: 'informational',
      title: L('tour.billing-safe.intro.title', 'Workspace plan overview'),
      instruction: L(
        'tour.billing-safe.intro.instruction',
        'Review available workspace tiers. This tutorial uses preview mode and will never charge your payment method.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.billing-safe.intro.recovery', 'Tap Next to review tiers.'),
      allowSkip: true,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.billing-optional'],
    },
    {
      id: 'inspect-tier-matrix',
      kind: 'informational',
      title: L('tour.billing-safe.inspect-tier-matrix.title', 'Compare tier features'),
      instruction: L(
        'tour.billing-safe.inspect-tier-matrix.instruction',
        'Free preview includes core organizer features. Higher tiers provide expanded file quotas and team collaboration.'
      ),
      targetId: 'billing.tier-matrix',
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.billing-safe.inspect-tier-matrix.recovery', 'Tap Next when finished reviewing.'),
      allowSkip: true,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.billing-optional'],
    },
    {
      id: 'done',
      kind: 'informational',
      title: L('tour.billing-safe.done.title', 'Plan review complete'),
      instruction: L(
        'tour.billing-safe.done.instruction',
        'You understand workspace tiers and feature entitlements. No live payments were initiated.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.billing-safe.done.recovery', 'Tap Next to finish.'),
      allowSkip: false,
      allowInformationalNext: true,
    },
  ],
};

/**
 * Collaboration and room sharing safeguards chapter.
 * Rule: Learning must never send real invites to external contacts.
 */
export const TOUR_CHAPTER_SHARING_SAFE: TourChapterDefinition = {
  id: 'tour.sharing-safe',
  definitionVersion: 1,
  contentVersion: 1,
  isSafeTreatment: true,
  title: L('tour.sharing-safe.title', 'Collaboration and room sharing safeguards'),
  summary: L(
    'tour.sharing-safe.summary',
    'Learn room permissions, invite links, and moderation tools without sending real invitations.'
  ),
  platforms: PLATFORMS,
  featurePrerequisites: ['settings'],
  learningChapterId: 'chapter.optional-gated',
  coverageFamilies: ['rooms'],
  steps: [
    {
      id: 'intro',
      kind: 'informational',
      title: L('tour.sharing-safe.intro.title', 'Safe collaboration principles'),
      instruction: L(
        'tour.sharing-safe.intro.instruction',
        'Learn how shared rooms, member permissions, and invite links work without inviting actual external users.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.sharing-safe.intro.recovery', 'Tap Next to begin.'),
      allowSkip: true,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.rooms-optional'],
    },
    {
      id: 'inspect-role-permissions',
      kind: 'informational',
      title: L('tour.sharing-safe.inspect-role-permissions.title', 'Workspace & room roles'),
      instruction: L(
        'tour.sharing-safe.inspect-role-permissions.instruction',
        'Workspace roles separate Owners, Members, and Viewers. Invitations can be revoked at any time.'
      ),
      targetId: 'rooms.roles-info',
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.sharing-safe.inspect-role-permissions.recovery', 'Tap Next.'),
      allowSkip: true,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.rooms-optional'],
    },
    {
      id: 'done',
      kind: 'informational',
      title: L('tour.sharing-safe.done.title', 'Sharing safeguards verified'),
      instruction: L(
        'tour.sharing-safe.done.instruction',
        'You understand member roles and access controls without sending unsolicited external messages.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.sharing-safe.done.recovery', 'Tap Next to finish.'),
      allowSkip: false,
      allowInformationalNext: true,
    },
  ],
};

// ============================================================================
// PART 3: DORMANT CAPABILITY-GATED CHAPTERS (Blocked until feature phase passes)
// ============================================================================

export const TOUR_CHAPTER_REMINDERS_GATED: TourChapterDefinition = {
  id: 'tour.reminders-gated',
  definitionVersion: 1,
  contentVersion: 1,
  isGated: true,
  gatedReason: 'Blocked pending Phase 69 reminders delivery capability release (DEF-V2-002).',
  title: L('tour.reminders-gated.title', 'Scheduled reminders and alerts'),
  summary: L(
    'tour.reminders-gated.summary',
    'Configure notification schedules, web push, and device alerts when reminders are released.'
  ),
  platforms: PLATFORMS,
  featurePrerequisites: ['reminders'],
  learningChapterId: 'chapter.optional-gated',
  coverageFamilies: ['reminders'],
  steps: [
    {
      id: 'gated-notice',
      kind: 'informational',
      title: L('tour.reminders-gated.notice.title', 'Reminders capability gated'),
      instruction: L(
        'tour.reminders-gated.notice.instruction',
        'Push notifications and reminder delivery are currently gated. Fake live practice is prohibited.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.reminders-gated.notice.recovery', 'Acknowledge to exit.'),
      allowSkip: false,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.reminders-delivery'],
    },
  ],
};

export const TOUR_CHAPTER_VAULT_GATED: TourChapterDefinition = {
  id: 'tour.vault-gated',
  definitionVersion: 1,
  contentVersion: 1,
  isGated: true,
  gatedReason: 'Blocked pending Phase 60 independent security review (DEF-V2-004).',
  title: L('tour.vault-gated.title', 'Encrypted vault and passkey storage'),
  summary: L(
    'tour.vault-gated.summary',
    'Client-side encrypted notes and secrets with independent hardware key unlock.'
  ),
  platforms: PLATFORMS,
  featurePrerequisites: ['vault'],
  learningChapterId: 'chapter.optional-gated',
  coverageFamilies: ['vault'],
  steps: [
    {
      id: 'gated-notice',
      kind: 'informational',
      title: L('tour.vault-gated.notice.title', 'Vault capability gated'),
      instruction: L(
        'tour.vault-gated.notice.instruction',
        'The encrypted vault is locked pending independent security review. Live practice is prohibited.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.vault-gated.notice.recovery', 'Acknowledge to exit.'),
      allowSkip: false,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.vault-optional'],
    },
  ],
};

export const TOUR_CHAPTER_DRIVE_GATED: TourChapterDefinition = {
  id: 'tour.drive-gated',
  definitionVersion: 1,
  contentVersion: 1,
  isGated: true,
  gatedReason: 'Blocked pending live Google Drive connection verification (DEF-V2-005).',
  title: L('tour.drive-gated.title', 'Google Drive backup and sync'),
  summary: L(
    'tour.drive-gated.summary',
    'Connect personal Google Drive account for automatic encrypted backups and export.'
  ),
  platforms: PLATFORMS,
  featurePrerequisites: ['drive'],
  learningChapterId: 'chapter.optional-gated',
  coverageFamilies: ['drive'],
  steps: [
    {
      id: 'gated-notice',
      kind: 'informational',
      title: L('tour.drive-gated.notice.title', 'Google Drive capability gated'),
      instruction: L(
        'tour.drive-gated.notice.instruction',
        'Google Drive cloud backup is unavailable in this preview. Live practice is prohibited.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.drive-gated.notice.recovery', 'Acknowledge to exit.'),
      allowSkip: false,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.drive-optional'],
    },
  ],
};

export const TOUR_CHAPTER_ROOMS_GATED: TourChapterDefinition = {
  id: 'tour.rooms-gated',
  definitionVersion: 1,
  contentVersion: 1,
  isGated: true,
  gatedReason: 'Blocked pending live shared rooms infrastructure (DEF-V2-006).',
  title: L('tour.rooms-gated.title', 'Live rooms and group chat'),
  summary: L(
    'tour.rooms-gated.summary',
    'Real-time communication and workspace rooms for teams and families.'
  ),
  platforms: PLATFORMS,
  featurePrerequisites: ['rooms'],
  learningChapterId: 'chapter.optional-gated',
  coverageFamilies: ['rooms'],
  steps: [
    {
      id: 'gated-notice',
      kind: 'informational',
      title: L('tour.rooms-gated.notice.title', 'Rooms capability gated'),
      instruction: L(
        'tour.rooms-gated.notice.instruction',
        'Real-time shared rooms are gated in this build. Live chat practice is prohibited.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.rooms-gated.notice.recovery', 'Acknowledge to exit.'),
      allowSkip: false,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.rooms-optional'],
    },
  ],
};

export const TOUR_CHAPTER_BILLING_GATED: TourChapterDefinition = {
  id: 'tour.billing-gated',
  definitionVersion: 1,
  contentVersion: 1,
  isGated: true,
  gatedReason: 'Blocked pending production payment processing release (DEF-V2-007).',
  title: L('tour.billing-gated.title', 'Live subscription and billing'),
  summary: L(
    'tour.billing-gated.summary',
    'Manage live workspace subscriptions and invoices.'
  ),
  platforms: PLATFORMS,
  featurePrerequisites: ['billing'],
  learningChapterId: 'chapter.optional-gated',
  coverageFamilies: ['billing'],
  steps: [
    {
      id: 'gated-notice',
      kind: 'informational',
      title: L('tour.billing-gated.notice.title', 'Live billing gated'),
      instruction: L(
        'tour.billing-gated.notice.instruction',
        'Production payment processing is disabled in this preview. Live purchase practice is prohibited.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.billing-gated.notice.recovery', 'Acknowledge to exit.'),
      allowSkip: false,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.billing-optional'],
    },
  ],
};

export const TOUR_CHAPTER_ASSISTANT_GATED: TourChapterDefinition = {
  id: 'tour.assistant-gated',
  definitionVersion: 1,
  contentVersion: 1,
  isGated: true,
  gatedReason: 'Blocked pending production AI assistant provider integration (DEF-V2-008).',
  title: L('tour.assistant-gated.title', 'Daynori AI assistant'),
  summary: L(
    'tour.assistant-gated.summary',
    'AI-assisted drafting, scheduling suggestions, and natural language organizer queries.'
  ),
  platforms: PLATFORMS,
  featurePrerequisites: ['assistant'],
  learningChapterId: 'chapter.optional-gated',
  coverageFamilies: ['assistant'],
  steps: [
    {
      id: 'gated-notice',
      kind: 'informational',
      title: L('tour.assistant-gated.notice.title', 'Assistant capability gated'),
      instruction: L(
        'tour.assistant-gated.notice.instruction',
        'The live AI assistant is disabled in this preview. Live model queries are prohibited.'
      ),
      completionPredicate: 'informational_acknowledged',
      recovery: L('tour.assistant-gated.notice.recovery', 'Acknowledge to exit.'),
      allowSkip: false,
      allowInformationalNext: true,
      troubleshootingArticleIds: ['help.assistant-optional'],
    },
  ],
};

// ============================================================================
// AGGREGATED ADVANCED COLLECTIONS
// ============================================================================

export const TOUR_AVAILABLE_ADVANCED_CHAPTERS: readonly TourChapterDefinition[] = [
  TOUR_CHAPTER_FILES_AUDIO,
  TOUR_CHAPTER_EXPENSES,
  TOUR_CHAPTER_CUSTOM_SECTIONS,
  TOUR_CHAPTER_OFFLINE_SYNC,
  TOUR_CHAPTER_TRASH_RECOVERY,
];

export const TOUR_SAFE_TREATMENT_CHAPTERS: readonly TourChapterDefinition[] = [
  TOUR_CHAPTER_ACCOUNT_DELETION_SAFE,
  TOUR_CHAPTER_RECOVERY_SECRETS_SAFE,
  TOUR_CHAPTER_BILLING_SAFE,
  TOUR_CHAPTER_SHARING_SAFE,
];

export const TOUR_GATED_CHAPTERS: readonly TourChapterDefinition[] = [
  TOUR_CHAPTER_REMINDERS_GATED,
  TOUR_CHAPTER_VAULT_GATED,
  TOUR_CHAPTER_DRIVE_GATED,
  TOUR_CHAPTER_ROOMS_GATED,
  TOUR_CHAPTER_BILLING_GATED,
  TOUR_CHAPTER_ASSISTANT_GATED,
];

export const TOUR_ADVANCED_CHAPTERS: readonly TourChapterDefinition[] = [
  ...TOUR_AVAILABLE_ADVANCED_CHAPTERS,
  ...TOUR_SAFE_TREATMENT_CHAPTERS,
  ...TOUR_GATED_CHAPTERS,
];
