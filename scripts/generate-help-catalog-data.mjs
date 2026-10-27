#!/usr/bin/env node
/**
 * Generates packages/domain/src/help/catalogData.ts with full action coverage.
 * Re-run when function-register action IDs change and review the diff.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const L = (key, defaultText) => ({ key, defaultText });

function art(partial) {
  return {
    platforms: ['web', 'installedPwa', 'android'],
    capabilities: ['core'],
    prerequisites: [],
    failures: [],
    relatedArticleIds: [],
    essentialOffline: false,
    gatedFeature: false,
    ...partial,
  };
}

const articles = [];

function add(id, categoryId, title, summary, actions, steps, expected, extra = {}) {
  articles.push(
    art({
      id,
      contentVersion: 1,
      categoryId,
      title: L(`help.${id}.title`, title),
      summary: L(`help.${id}.summary`, summary),
      keywords: extra.keywords || title.toLowerCase().split(/\s+/).slice(0, 8),
      relatedActionIds: actions,
      prerequisites: (extra.prerequisites || []).map((t, i) => L(`help.${id}.prereq.${i}`, t)),
      steps: steps.map((t, i) => ({ instruction: L(`help.${id}.step.${i}`, t) })),
      expectedResult: L(`help.${id}.expected`, expected),
      failures: (extra.failures || []).map((f, i) => ({
        symptom: L(`help.${id}.fail.${i}.s`, f[0]),
        recovery: L(`help.${id}.fail.${i}.r`, f[1]),
      })),
      platformDifferences: extra.platformDifferences
        ? L(`help.${id}.platforms`, extra.platformDifferences)
        : undefined,
      relatedArticleIds: extra.related || [],
      learningChapterId: extra.chapter,
      essentialOffline: !!extra.essentialOffline,
      gatedFeature: !!extra.gatedFeature,
      capabilities: extra.capabilities || ['core'],
      platforms: extra.platforms || ['web', 'installedPwa', 'android'],
    })
  );
}

add(
  'help.welcome-and-sign-in',
  'account',
  'Welcome, sign-in, and recovery',
  'Open Daynori, sign in or create an account, and recover access without confusing outages for bad passwords.',
  [
    'account.welcome-shell',
    'account.sign-up',
    'account.sign-in',
    'account.recover-password',
    'account.session-refresh',
    'account.sign-out',
  ],
  [
    'Open Daynori. Review Welcome if shown.',
    'Choose Sign in or Create account. Enter email and password.',
    'If you forgot your password, use Recover password and follow the email instructions.',
    'Use Log out only when you intend to end the session on this device.',
  ],
  'You are signed in with an active session, or you see a clear recovery message — not a false invalid-password claim during outages.',
  {
    failures: [
      [
        'Server sleeping or rate limited',
        'Wait and Retry. Do not assume the password is wrong until the app says so.',
      ],
      [
        'Email not verified',
        'Check inbox for verification; complete it before expecting full access.',
      ],
    ],
    chapter: 'chapter.account-first-use',
    keywords: ['sign in', 'login', 'password', 'recover', 'logout', 'session'],
  }
);

add(
  'help.workspace-and-preferences',
  'account',
  'Workspace readiness and preferences',
  'Provision a personal workspace and update appearance, locale, and privacy preferences.',
  ['account.workspace-provision', 'account.preferences-update', 'account.privacy-terms'],
  [
    'After sign-in, allow workspace provision to finish (or open Account and provision if needed).',
    'Open Settings to change theme, text size, week start, locale, and privacy options.',
    'Open Privacy / Terms from Account or Settings when you need legal text.',
  ],
  'Your personal workspace is ready and preference changes show a clear save or conflict message.',
  { chapter: 'chapter.account-first-use', related: ['help.welcome-and-sign-in'] }
);

add(
  'help.account-deletion',
  'account',
  'Delete your account safely',
  'Understand what account deletion removes and how backups are suppressed afterward.',
  ['account.account-deletion'],
  [
    'Open Account or Settings → account management.',
    'Read the deletion warnings carefully. Export data first if you need a copy (see Export).',
    'Confirm deletion only if you intend permanent removal of the account.',
  ],
  'Deletion follows the product’s retention path; reading this article never deletes an account.',
  {
    failures: [
      [
        'Still see old data after restore',
        'Account deletion suppresses resurrecting a deleted account from backup — check Support status for limits.',
      ],
    ],
    related: ['help.export-import', 'help.support-and-feedback'],
  }
);

add(
  'help.navigate-shell',
  'navigation',
  'Navigate Today, Plan, Library, Journal, and Settings',
  'Use the main shell destinations and Create menu.',
  [
    'nav.open-today',
    'nav.open-plan',
    'nav.open-library',
    'nav.open-journal',
    'nav.open-settings',
    'nav.open-help',
    'nav.open-support',
    'nav.open-review',
    'nav.create-menu',
  ],
  [
    'Use the bottom or side navigation: Today, Plan, Library, Journal.',
    'Tap Create (+) to open Note, Task, Routine, Journal, or other enabled types.',
    'Open Settings from the shell; Help and Support are available from Settings or Help destinations.',
  ],
  'You land on the chosen screen without losing your signed-in workspace.',
  {
    chapter: 'chapter.navigation',
    keywords: ['today', 'plan', 'library', 'journal', 'create', 'settings'],
  }
);

add(
  'help.all-features-pins',
  'navigation',
  'All features, pins, and hiding modules',
  'Find every module, pin shortcuts, and hide modules without deleting content.',
  [
    'nav.all-features-directory',
    'nav.hide-show-modules',
    'nav.theme-toggle',
    'nav.language-text-scale',
  ],
  [
    'Open All features from the shell header or sidebar.',
    'Search by name, then open a destination.',
    'Hide a module to remove shortcuts without deleting content; restore it from the same directory.',
    'Pin supported modules for secondary shortcuts. Change theme and text scale under Settings → Appearance.',
  ],
  'Settings, Help, Search, and All features stay reachable even when modules are hidden.',
  { chapter: 'chapter.navigation', related: ['help.navigate-shell'] }
);

add(
  'help.tasks-vs-routines',
  'planning',
  'Tasks versus routines',
  'A task finishes once. A routine repeats; each day stays independent.',
  [
    'tasks.create',
    'tasks.edit',
    'tasks.complete',
    'tasks.reopen-undo',
    'tasks.delete-restore',
    'tasks.list-filters',
    'tasks.subtasks',
    'routines.create',
    'routines.edit',
    'routines.complete-occurrence',
    'routines.skip-occurrence',
    'routines.undo-occurrence',
    'routines.history',
    'routines.independent-dates',
  ],
  [
    'Tap Create → Task. Enter a title (and deadline if needed), then Save. Open Details for notes, priority, folder, tags, or subtasks.',
    'Completing a task never copies it to tomorrow. Use Undo/reopen if you completed by mistake.',
    'Tap Create → Routine. Set the schedule. Complete or skip today’s occurrence only — other dates stay independent.',
    'Use Plan filters to focus lists; filters never move or delete items.',
  ],
  'Tasks and routines appear under Plan/Today with the labels you expect; occurrences do not rewrite other days.',
  {
    chapter: 'chapter.tasks-routines',
    keywords: ['task', 'routine', 'occurrence', 'complete', 'deadline', 'subtask'],
    failures: [
      [
        'Thought completing a task created tomorrow’s copy',
        'Tasks do not auto-copy. Use a routine for repeating work.',
      ],
    ],
  }
);

add(
  'help.calendar',
  'planning',
  'Calendar projections and events',
  'View agenda/month, open the same task or routine from a projection, and manage personal events.',
  [
    'calendar.view-feed',
    'calendar.create-event',
    'calendar.edit-event',
    'calendar.delete-event',
    'calendar.open-canonical',
  ],
  [
    'Open Plan → Calendar. Phones default to agenda; month is available.',
    'Tap a task or routine projection to open that same record (canonical link).',
    'Create or edit a personal calendar event when you need a standalone event.',
  ],
  'Projections open the real task/routine; personal events edit the same calendar event.',
  { chapter: 'chapter.calendar', related: ['help.tasks-vs-routines'] }
);

add(
  'help.notes-and-library',
  'library',
  'Notes, folders, and Library filters',
  'Write notes, organize folders, and filter without moving items unintentionally.',
  [
    'notes.create-save',
    'notes.reopen-edit',
    'notes.format-guides-links',
    'notes.trash-restore',
    'notes.long-content',
    'library.folder-create',
    'library.folder-move-rename',
    'library.folder-trash-restore',
    'library.browse-mixed',
    'library.saved-views',
  ],
  [
    'Tap Create → Note. Status shows Unsaved, Saved on this device, Waiting to sync, Synchronized, or Failed — retry.',
    'Empty titles become Untitled after save. Reopen the same note from Library or Search.',
    'Library uses one workspace folder tree (depth up to five). Filters change the view only — Clear filters never moves items.',
    'Folder moves keep the same ID, dates, and links. Trash/restore keeps recovery rules.',
  ],
  'Notes reopen with the same identity; filters do not rearrange storage.',
  {
    chapter: 'chapter.notes-library',
    keywords: ['note', 'folder', 'library', 'filter', 'untitled', 'bangla'],
    essentialOffline: true,
  }
);

add(
  'help.journal-privacy',
  'journal',
  'Journal writing and privacy',
  'Write private daily entries and control preview snippets in Search and lists.',
  [
    'journal.create-entry',
    'journal.edit-reopen',
    'journal.backdate',
    'journal.privacy-snippets',
    'journal.trash-restore',
  ],
  [
    'Open Journal to write a private daily entry. Save and reopen the same entry.',
    'Backdate only when intentional; the entry date is part of the record.',
    'Under Settings → Privacy and data (and Journal list controls), choose whether journal snippets appear in previews/search.',
  ],
  'Journal content stays private by default in ordinary search snippets unless you change privacy settings.',
  { chapter: 'chapter.journal', keywords: ['journal', 'privacy', 'snippet', 'preview'] }
);

add(
  'help.search',
  'library',
  'Search coverage and limits',
  'Search stays inside your workspace; offline search only covers locally stored records.',
  ['search.global', 'search.offline-coverage'],
  [
    'Open Search from the shell.',
    'Results stay inside your authorized workspace. Vault items stay out of ordinary search.',
    'Offline, search only covers records already on this device — coverage is not claimed as complete.',
  ],
  'You see honest results or an empty state; Help search never queries private notes for instructional lookup.',
  { essentialOffline: true, related: ['help.journal-privacy', 'help.notes-and-library'] }
);

add(
  'help.files-upload',
  'attachments',
  'Upload, quota, cancel, and delete files',
  'Understand reserve → upload → finalize, quota, cancel/retry, and deletion. Uploads may be unavailable in preview.',
  [
    'files.upload-reserve-finalize',
    'files.download-preview',
    'files.cancel-retry-quota',
    'files.delete',
  ],
  [
    'From Library, choose Upload when the control is enabled.',
    'Wait for processing before preview or download. Cancel releases the reservation.',
    'Quota includes reserved and stored bytes. Delete removes your reference and schedules private-byte cleanup.',
  ],
  'When uploads are gated off (for example free hosted preview), controls explain unavailability — reading Help never uploads a file.',
  {
    gatedFeature: true,
    capabilities: ['attachments', 'hostedPreviewLimited'],
    failures: [
      [
        'Upload control missing or disabled',
        'Expected when attachment capability is off. Use local notes until providers are ready.',
      ],
      ['Quota exceeded', 'Delete unused files or cancel reservations, then retry.'],
    ],
    chapter: 'chapter.files-audio',
  }
);

add(
  'help.audio-recording',
  'attachments',
  'Record and attach audio',
  'Explicit Start after microphone permission; review before attach. Separate from assistant transcription.',
  ['audio.record-attach'],
  [
    'Open a surface that offers Record when audio is enabled.',
    'Grant microphone permission only if you intend to record. Tap Start — never ambient recording.',
    'Pause/stop, review, then save to attach. Limits include about 10 minutes / 25 MB for the recorder.',
  ],
  'Drafts stay account-scoped; Log out stops prior-account playback. Help never starts a recording by itself.',
  {
    gatedFeature: true,
    capabilities: ['audio', 'hostedPreviewLimited'],
    failures: [
      [
        'Permission denied',
        'Enable microphone in system settings, return, and Start again.',
      ],
      [
        'Control unavailable',
        'Audio may be off in preview or until attachment readiness evidence is complete.',
      ],
    ],
    chapter: 'chapter.files-audio',
  }
);

add(
  'help.expenses',
  'extensions',
  'Expenses, refunds, and reports',
  'Enter amount and currency first; refunds name the original; reports never mix currencies.',
  [
    'expenses.create-edit',
    'expenses.budgets-reports',
    'expenses.export',
    'expenses.trash-restore',
  ],
  [
    'Open Expenses from All features (or enable under Settings).',
    'Enter kind, amount, currency, and date first. Optional category, note, payment, and receipt live under Details.',
    'Refunds must name the original expense and stay within its amount.',
    'Reports and budgets keep currencies separate. Export keeps exact amounts and dates.',
  ],
  'Amounts stay exact; reading Help never creates a real expense.',
  {
    chapter: 'chapter.expenses',
    failures: [
      [
        'Receipt unavailable',
        'Attachment capability may be gated. Save the expense without a new receipt upload.',
      ],
    ],
    capabilities: ['core', 'attachments'],
  }
);

add(
  'help.custom-sections',
  'extensions',
  'Custom sections and schema changes',
  'Build typed sections, reorder accessibly, and recover through migration preview without deleting referenced items.',
  [
    'sections.create-from-template',
    'sections.records-crud',
    'sections.reorder-accessible',
    'sections.remove-preserve-refs',
  ],
  [
    'Create a section from an approved template or empty builder.',
    'Add typed fields or a view of existing notes/tasks — references stay the original records.',
    'Reorder with Move up / Move down (no dragging required).',
    'Before confirming schema changes, read the migration preview. Removing a section does not delete referenced items.',
  ],
  'Referenced notes/tasks remain; Help never silently applies a destructive schema change.',
  { chapter: 'chapter.custom-sections' }
);

add(
  'help.save-and-sync',
  'offline',
  'Local save, sync, and conflicts',
  'Saved on this device is not the same as server acknowledgment. Resolve conflicts explicitly.',
  ['sync.push-pull', 'sync.conflict-review', 'offline.pending-queue'],
  [
    'Edit as usual. Watch status: Unsaved → Saved on this device → Waiting to sync → Synchronized (or Failed — retry).',
    'Pending mutations stay queued offline and retry with the same operation ID when online.',
    'If Conflict appears, open conflict review. Keep both versions recoverable — never rely on client clock as winner.',
  ],
  'You can explain each status; long text is never silently replaced.',
  {
    essentialOffline: true,
    chapter: 'chapter.offline-sync',
    keywords: ['sync', 'saved on this device', 'conflict', 'pending', 'queue'],
    related: ['help.offline-reopen', 'help.notes-and-library'],
  }
);

add(
  'help.offline-reopen',
  'offline',
  'Trusted-device offline and updates',
  'Distinguish warm offline use, local browser shell evidence, and installed-PWA/native verification still outstanding.',
  ['offline.cold-reopen'],
  [
    'While already open, edits queue offline and show honest unavailable states for remote-only features.',
    'Trusted-device consent is required for durable browser storage. Missing consent or storage shows a truthful offline help page.',
    'When an app update is ready: save work, then Update — or choose Later. Update will not activate while unsaved work remains.',
    'Cold reopen: a public offline shell can restore local IndexedDB records on a trusted device. Installed production PWA and native installed-build cold launch verification may still be outstanding — do not treat engineering fixtures as a platform guarantee.',
  ],
  'You understand local vs cloud and Update/Later without losing drafts.',
  {
    essentialOffline: true,
    chapter: 'chapter.offline-sync',
    keywords: ['offline', 'trusted device', 'update', 'later', 'consent', 'pwa'],
    failures: [
      [
        'Offline shell unavailable',
        'Grant trusted-device consent online once, ensure local data exists, then retry. Or reconnect.',
      ],
      [
        'Keys or storage missing',
        'Follow recovery limits; never expect plaintext fallbacks for native encryption failures.',
      ],
    ],
    related: ['help.save-and-sync'],
  }
);

add(
  'help.export-import',
  'offline',
  'Export, import, and Trash',
  'Move data with validation; Trash restore and deletion limits stay explicit.',
  [
    'portability.export-import',
    'notes.trash-restore',
    'tasks.delete-restore',
    'journal.trash-restore',
    'expenses.trash-restore',
  ],
  [
    'Open Settings / recovery or portability surfaces for Export.',
    'Import only trusted files; invalid imports are rejected with validation errors.',
    'Trash restore brings back eligible items; offline edits against deleted records stay recoverable drafts, not silent resurrection.',
  ],
  'Exports are workspace-scoped; Help never runs a destructive export/delete by being opened.',
  { essentialOffline: true, related: ['help.account-deletion', 'help.save-and-sync'] }
);

add(
  'help.reminders-and-install',
  'notifications',
  'Install Daynori and troubleshoot notifications',
  'Install the PWA/app and understand reminder subscription limits.',
  [
    'reminders.create-rule',
    'reminders.web-push-subscribe',
    'reminders.device-register',
    'reminders.deliver-deep-link',
  ],
  [
    'On supported browsers: use the Install banner when shown, or browser Install app.',
    'Allow notifications only if you want reminders. Subscription binds to your signed-in account.',
    'Notification text stays generic for privacy; opening a reminder reauthorizes before showing private content.',
  ],
  'Install and notification state are honest when unavailable in preview.',
  {
    gatedFeature: true,
    capabilities: ['reminders', 'hostedPreviewLimited'],
    keywords: ['install', 'notification', 'reminder', 'push', 'pwa'],
    failures: [
      [
        'No Install banner',
        'Use browser menu → Install app, or continue in the browser tab.',
      ],
      [
        'Reminders off in preview',
        'Expected in some free preview builds — check Settings for status.',
      ],
    ],
  }
);

add(
  'help.vault-optional',
  'optional',
  'Optional vault',
  'Client-encrypted vault is optional and separate from ordinary organizer data.',
  ['vault.setup-unlock', 'vault.lock', 'vault.recovery', 'vault.harness-synthetic'],
  [
    'Open Vault only if offered in your build.',
    'Set up unlock and understand recovery limits before storing secrets.',
    'Lock when finished. UI locks do not encrypt ordinary browser IndexedDB.',
  ],
  'Vault plaintext never enters ordinary Help or shared Cache Storage.',
  { gatedFeature: true, capabilities: ['vault'], chapter: 'chapter.optional-gated' }
);

add(
  'help.drive-optional',
  'optional',
  'Optional Google Drive',
  'Connect Drive only with reviewed scopes; disconnect revokes access.',
  ['drive.connect', 'drive.select-sync', 'drive.disconnect-revoke'],
  [
    'Open Drive settings when the feature is released for your account.',
    'Review scopes before authorizing. Select what to sync.',
    'Disconnect/revoke when you no longer want access.',
  ],
  'Unavailable Drive is explained — Help does not invent a connected account.',
  { gatedFeature: true, capabilities: ['drive'], chapter: 'chapter.optional-gated' }
);

add(
  'help.rooms-optional',
  'optional',
  'Optional rooms and chat',
  'Shared rooms stay production-disabled without a reviewed preview capability.',
  ['rooms.create-invite', 'rooms.chat-message', 'rooms.moderation-block', 'rooms.leave-revoke'],
  [
    'If Rooms appear, create or join only with people you trust.',
    'Leaving or revocation stops unauthorized sync for that room.',
  ],
  'When rooms are off, Help describes unavailability instead of dead links to privileged chat.',
  { gatedFeature: true, capabilities: ['rooms'], chapter: 'chapter.optional-gated' }
);

add(
  'help.billing-optional',
  'optional',
  'Billing and entitlements',
  'Catalog and purchase flows never charge from Help; sandbox/preview rules apply.',
  ['billing.catalog-entitlement', 'billing.purchase-restore', 'billing.downgrade-preserve'],
  [
    'Open Billing only when offered.',
    'Review entitlements. Purchase/restore only through the official store flow.',
    'Downgrades preserve data according to product rules.',
  ],
  'Reading Help never purchases anything.',
  { gatedFeature: true, capabilities: ['billing'], chapter: 'chapter.optional-gated' }
);

add(
  'help.assistant-optional',
  'optional',
  'Optional assistant',
  'Consent-bound assistant with grounded answers; voice capture is separate from Library audio attach.',
  [
    'assistant.consent',
    'assistant.ask-grounded',
    'assistant.propose-confirm',
    'assistant.voice-capture',
    'assistant.nori-launcher',
  ],
  [
    'Open the assistant only if enabled. Review consent.',
    'Ask within allowed scope. Edit proposals before Confirm save.',
    'Voice capture for the assistant is separate from Library audio attachments.',
  ],
  'Live AI may be off in preview; Help remains usable without AI.',
  {
    gatedFeature: true,
    capabilities: ['assistant', 'hostedPreviewLimited'],
    chapter: 'chapter.optional-gated',
  }
);

add(
  'help.using-help',
  'support',
  'Search Help and Learn the app',
  'Find articles, open Learn the app chapters, and replay the beginner guide without losing drafts.',
  ['help.search-howtos', 'help.replay-beginner-guide', 'nav.open-help'],
  [
    'Open Help. Use Search how-to for instructional content only.',
    'Browse categories or Common tasks. Open an article for steps and recovery.',
    'Use Learn the app for chapter links. Replay beginner guide from Help when offered — it does not reset settings.',
    'Contextual Help from editors opens the article without discarding unsaved text.',
  ],
  'You can find guidance offline for essential recovery articles without live AI.',
  {
    essentialOffline: true,
    chapter: 'chapter.help-learning',
    keywords: ['help', 'search', 'learn', 'tutorial', 'howto'],
  }
);

add(
  'help.support-and-feedback',
  'support',
  'Support and feedback contact status',
  'Troubleshoot first. Contact routes stay honest when no monitored inbox is configured.',
  ['nav.open-support', 'support.contact-form', 'support.bug-suggestion-submit'],
  [
    'Open Support for troubleshooting.',
    'If Contact / Feedback is unconfigured, the screen explains the current status — no invented email or false receipt.',
    'Feedback intake and delivery are later phases; use available troubleshooting meanwhile.',
  ],
  'You never see a fake delivery success from Help.',
  { related: ['help.using-help'], keywords: ['support', 'feedback', 'contact', 'bug'] }
);

add(
  'help.developer-surfaces',
  'support',
  'Developer and operator surfaces',
  'Component gallery, harnesses, and triage panels are restricted — not ordinary user Help.',
  [
    'dev.component-gallery-mobile',
    'dev.vault-harness-link',
    'dev.provisional-integration-panels',
    'dev.feedback-triage',
    'dev.feature-release-switches',
  ],
  [
    'Ordinary Help does not include operator runbooks or repository artifact paths.',
    'If you see Developer-only controls, they require authorized roles and separate documentation.',
  ],
  'Users stay on task-based Help; privileged routes are not exposed as working user features.',
  { gatedFeature: true, capabilities: ['core'] }
);

const categories = [
  { id: 'account', title: 'Account & first use', summary: 'Sign-in, workspace, privacy, deletion', sortOrder: 10 },
  { id: 'navigation', title: 'Home & navigation', summary: 'Shell, Create, All features, appearance', sortOrder: 20 },
  { id: 'planning', title: 'Plan & calendar', summary: 'Tasks, routines, calendar', sortOrder: 30 },
  { id: 'library', title: 'Library & search', summary: 'Notes, folders, search', sortOrder: 40 },
  { id: 'journal', title: 'Journal', summary: 'Private entries and privacy', sortOrder: 50 },
  { id: 'attachments', title: 'Files & audio', summary: 'Uploads, quota, recording', sortOrder: 60 },
  { id: 'extensions', title: 'Expenses & sections', summary: 'Money and custom sections', sortOrder: 70 },
  { id: 'offline', title: 'Sync, offline & portability', summary: 'Save states, offline, export', sortOrder: 80 },
  { id: 'notifications', title: 'Install & reminders', summary: 'PWA install and notifications', sortOrder: 90 },
  { id: 'optional', title: 'Optional & gated', summary: 'Vault, Drive, rooms, billing, assistant', sortOrder: 100 },
  { id: 'support', title: 'Help & support', summary: 'Help, learning, contact status', sortOrder: 110 },
].map((c) => ({
  id: c.id,
  title: L(`help.category.${c.id}.title`, c.title),
  summary: L(`help.category.${c.id}.summary`, c.summary),
  sortOrder: c.sortOrder,
}));

const target = path.join(root, 'packages/domain/src/help/catalogData.ts');
const header = `/**
 * Help catalog seed (Phase 78).
 * Generated by scripts/generate-help-catalog-data.mjs — re-run after action-ID changes, then review.
 */
import type { HelpArticle, HelpCategory } from './types.js';

`;

const body = `export const HELP_CATEGORIES: readonly HelpCategory[] = ${JSON.stringify(
  categories,
  null,
  2
)} as const;

export const HELP_ARTICLES: readonly HelpArticle[] = ${JSON.stringify(
  articles,
  null,
  2
)} as unknown as readonly HelpArticle[];
`;

fs.writeFileSync(target, header + body);

const essential = articles.filter((a) => a.essentialOffline);
const essentialPayload = {
  contentVersion: 1,
  generatedAt: new Date().toISOString(),
  note: 'Public instructional subset only. No private HTML/API/user data.',
  articles: essential.map((a) => ({
    id: a.id,
    title: a.title.defaultText,
    summary: a.summary.defaultText,
    steps: a.steps.map((s) => s.instruction.defaultText),
    expectedResult: a.expectedResult.defaultText,
    failures: a.failures.map((f) => ({
      symptom: f.symptom.defaultText,
      recovery: f.recovery.defaultText,
    })),
  })),
};
const essentialOut = path.join(root, 'apps/web/public/help-essential.json');
fs.writeFileSync(essentialOut, JSON.stringify(essentialPayload, null, 2) + '\n');

const reg = JSON.parse(
  fs.readFileSync(path.join(root, 'docs/roadmap/v2/function-register.json'), 'utf8')
);
const covered = new Set(articles.flatMap((a) => a.relatedActionIds));
const missing = reg.actions.map((a) => a.id).filter((id) => !covered.has(id));
if (missing.length) {
  console.error('Missing action coverage:', missing.join(', '));
  process.exit(1);
}
console.log(
  `Wrote ${target} (${articles.length} articles, ${covered.size} actions covered); essential ${essential.length} → ${essentialOut}`
);
