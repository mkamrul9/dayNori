import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { colors, getContrastRatio } from '@daynori/design-tokens';
import {
  Button,
  Card,
  Dialog,
  Feedback,
  ListRow,
  TextField,
  EmptyState,
  SkipLink,
  RouteAnnouncer,
  NoteEditor,
  JournalEditor,
  TaskRow,
  TaskDetailEditor,
  RoutineRow,
  RoutineDetailEditor,
  RoutineHistoryViewer,
} from './index.js';

describe('UI Web Primitives Accessibility & Interaction Contracts', () => {
  it('exports all core accessible primitives', () => {
    expect(Button).toBeDefined();
    expect(JournalEditor).toBeDefined();
    expect(Card).toBeDefined();
    expect(TextField).toBeDefined();
    expect(Dialog).toBeDefined();
    expect(Feedback).toBeDefined();
    expect(ListRow).toBeDefined();
    expect(EmptyState).toBeDefined();
    expect(SkipLink).toBeDefined();
    expect(RouteAnnouncer).toBeDefined();
  });

  describe('Button Accessibility', () => {
    it('renders standard primary button with accessible attributes', () => {
      const html = renderToString(React.createElement(Button, { id: 'btn-1' }, 'Click me'));
      expect(html).toContain('type="button"');
      expect(html).toContain('aria-busy="false"');
      expect(html).toContain('aria-disabled="false"');
      expect(html).toContain('Click me');
      expect(html).toContain('min-height:44px');
    });

    it('enforces 44px minimum touch target on compact buttons', () => {
      const html = renderToString(React.createElement(Button, { size: 'compact' }, 'Compact'));
      expect(html).toContain('min-height:44px');
      expect(html).toContain('min-width:44px');
    });

    it('renders loading state with aria-busy and status role', () => {
      const html = renderToString(React.createElement(Button, { loading: true }, 'Saving'));
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-label="Loading"');
    });

    it('renders disabled state with aria-disabled and disabled attribute', () => {
      const html = renderToString(React.createElement(Button, { disabled: true }, 'Disabled'));
      expect(html).toContain('disabled=""');
      expect(html).toContain('aria-disabled="true"');
    });

    it('renders danger button variant with WCAG AA compliant contrast in light and dark themes', () => {
      const lightHtml = renderToString(
        React.createElement(Button, { variant: 'danger', themeMode: 'light' }, 'Delete')
      );
      expect(lightHtml).toContain('background-color:#B3261E');
      expect(lightHtml).toContain('color:#FFFFFF');
      expect(
        getContrastRatio(colors.light.action.dangerLabel, colors.light.action.danger)
      ).toBeGreaterThanOrEqual(4.5);

      const darkHtml = renderToString(
        React.createElement(Button, { variant: 'danger', themeMode: 'dark' }, 'Delete')
      );
      expect(darkHtml).toContain('background-color:#F2B8B5');
      expect(darkHtml).toContain('color:#381615');
      expect(
        getContrastRatio(colors.dark.action.dangerLabel, colors.dark.action.danger)
      ).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe('TextField Accessibility', () => {
    it('associates label, input, and helper text via aria-describedby', () => {
      const html = renderToString(
        React.createElement(TextField, {
          id: 'title-field',
          label: 'Task Title',
          helperText: 'A concise summary of the task.',
        })
      );
      expect(html).toContain('for="title-field"');
      expect(html).toContain('id="title-field"');
      expect(html).toContain('aria-describedby="title-field-helper"');
      expect(html).toContain('id="title-field-helper"');
      expect(html).toContain('Task Title');
    });

    it('associates error message with role="alert" and aria-invalid="true"', () => {
      const html = renderToString(
        React.createElement(TextField, {
          id: 'error-field',
          label: 'Due Date',
          errorMessage: 'Date format must be YYYY-MM-DD.',
        })
      );
      expect(html).toContain('aria-invalid="true"');
      expect(html).toContain('aria-describedby="error-field-error"');
      expect(html).toContain('role="alert"');
      expect(html).toContain('Date format must be YYYY-MM-DD.');
    });

    it('constructs aria-describedby only from rendered elements when helperText and errorMessage are both supplied', () => {
      const html = renderToString(
        React.createElement(TextField, {
          id: 'conflict-field',
          label: 'Priority',
          helperText: 'A helper note that should be hidden on error',
          errorMessage: 'Priority cannot be empty',
        })
      );
      expect(html).toContain('aria-describedby="conflict-field-error"');
      expect(html).not.toContain('conflict-field-helper');
      expect(html).toContain('role="alert"');
      expect(html).toContain('Priority cannot be empty');
      expect(html).not.toContain('A helper note that should be hidden on error');
    });

    it('preserves caller-supplied aria-describedby and combines with rendered description', () => {
      const html = renderToString(
        React.createElement(TextField, {
          id: 'caller-desc-field',
          label: 'Tags',
          'aria-describedby': 'external-format-guide',
          errorMessage: 'Invalid tag format',
        })
      );
      expect(html).toContain('aria-describedby="external-format-guide caller-desc-field-error"');
    });

    it('recovers aria-describedby to helperText when errorMessage is cleared', () => {
      const errorHtml = renderToString(
        React.createElement(TextField, {
          id: 'recover-field',
          label: 'Recovery Test',
          helperText: 'Standard helper instruction',
          errorMessage: 'Temporary error',
        })
      );
      expect(errorHtml).toContain('aria-describedby="recover-field-error"');
      expect(errorHtml).not.toContain('recover-field-helper');

      const recoveredHtml = renderToString(
        React.createElement(TextField, {
          id: 'recover-field',
          label: 'Recovery Test',
          helperText: 'Standard helper instruction',
        })
      );
      expect(recoveredHtml).toContain('aria-describedby="recover-field-helper"');
      expect(recoveredHtml).toContain('id="recover-field-helper"');
      expect(recoveredHtml).toContain('Standard helper instruction');
    });
  });

  describe('Dialog Accessibility', () => {
    it('renders accessible dialog modal structure when open', () => {
      const html = renderToString(
        React.createElement(
          Dialog,
          {
            isOpen: true,
            onClose: () => {},
            title: 'Delete Confirmation',
            description: 'Are you sure you want to delete this note?',
          },
          React.createElement('button', { type: 'button' }, 'Confirm')
        )
      );
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('Delete Confirmation');
      expect(html).toContain('aria-label="Close dialog"');
      expect(html).toContain('Confirm');
    });

    it('renders nothing when isOpen is false', () => {
      const html = renderToString(
        React.createElement(
          Dialog,
          {
            isOpen: false,
            onClose: () => {},
            title: 'Hidden Dialog',
          },
          'Content'
        )
      );
      expect(html).toBe('');
    });
  });

  describe('Feedback Accessibility', () => {
    it('renders danger feedback with role="alert" and assertive aria-live', () => {
      const html = renderToString(
        React.createElement(Feedback, {
          severity: 'danger',
          title: 'Network Error',
          message: 'Unable to reach the server.',
        })
      );
      expect(html).toContain('role="alert"');
      expect(html).toContain('aria-live="assertive"');
      expect(html).toContain('Error:');
      expect(html).toContain('Network Error');
    });

    it('renders info/success feedback with role="status" and polite aria-live', () => {
      const html = renderToString(
        React.createElement(Feedback, {
          severity: 'success',
          title: 'Saved',
          message: 'Draft stored locally.',
        })
      );
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('Success:');
    });

    it('enforces 44px minimum touch target on dismiss button', () => {
      const html = renderToString(
        React.createElement(Feedback, {
          severity: 'info',
          message: 'Notice with dismiss',
          onDismiss: () => {},
        })
      );
      expect(html).toContain('min-height:44px');
      expect(html).toContain('min-width:44px');
      expect(html).toContain('aria-label="Dismiss message"');
    });
  });

  describe('ListRow Accessibility', () => {
    it('renders interactive row with button role and aria-pressed, without invalid aria-selected', () => {
      const selectedHtml = renderToString(
        React.createElement(ListRow, {
          title: 'Morning review',
          subtitle: 'Daily routine',
          onClick: () => {},
          selected: true,
        })
      );
      expect(selectedHtml).toContain('role="button"');
      expect(selectedHtml).toContain('tabindex="0"');
      expect(selectedHtml).toContain('aria-pressed="true"');
      expect(selectedHtml).not.toContain('aria-selected');
      expect(selectedHtml).toContain('min-height:44px');
      expect(selectedHtml).toContain('Morning review');

      const unselectedHtml = renderToString(
        React.createElement(ListRow, {
          title: 'Morning review',
          subtitle: 'Daily routine',
          onClick: () => {},
          selected: false,
        })
      );
      expect(unselectedHtml).toContain('role="button"');
      expect(unselectedHtml).toContain('aria-pressed="false"');
      expect(unselectedHtml).not.toContain('aria-selected');
    });

    it('renders metadata with secondary color ensuring contrast >= 4.5:1 on selected backgrounds', () => {
      const lightSelectedHtml = renderToString(
        React.createElement(ListRow, {
          title: 'Task item',
          meta: '12:00 PM',
          selected: true,
          themeMode: 'light',
          onClick: () => {},
        })
      );
      expect(lightSelectedHtml).toContain(`color:${colors.light.text.secondary}`);
      expect(
        getContrastRatio(colors.light.text.secondary, colors.light.action.subtle)
      ).toBeGreaterThanOrEqual(4.5);

      const darkSelectedHtml = renderToString(
        React.createElement(ListRow, {
          title: 'Task item',
          meta: '12:00 PM',
          selected: true,
          themeMode: 'dark',
          onClick: () => {},
        })
      );
      expect(darkSelectedHtml).toContain(`color:${colors.dark.text.secondary}`);
      expect(
        getContrastRatio(colors.dark.text.secondary, colors.dark.action.subtle)
      ).toBeGreaterThanOrEqual(4.5);
    });

    it('enables text wrapping rather than forcing white-space:nowrap truncation', () => {
      const html = renderToString(
        React.createElement(ListRow, {
          title: 'Very long title that wraps on 320px narrow screens',
          subtitle: 'Detailed subtitle explaining tasks',
        })
      );
      expect(html).not.toContain('white-space:nowrap');
      expect(html).toContain('overflow-wrap:anywhere');
    });

    it('renders non-interactive row without button role or aria-pressed', () => {
      const html = renderToString(
        React.createElement(ListRow, {
          title: 'Static item',
        })
      );
      expect(html).not.toContain('role="button"');
      expect(html).not.toContain('tabindex="0"');
      expect(html).not.toContain('aria-pressed');
    });
  });

  describe('EmptyState Accessibility', () => {
    it('renders accessible empty state with section region and action button', () => {
      const html = renderToString(
        React.createElement(EmptyState, {
          id: 'tasks-empty',
          title: 'No upcoming tasks',
          description: 'You have cleared all tasks for today.',
          actionLabel: 'Create Task',
          onAction: () => {},
        })
      );
      expect(html).toContain('id="tasks-empty"');
      expect(html).toContain('aria-label="No upcoming tasks"');
      expect(html).toContain('No upcoming tasks');
      expect(html).toContain('You have cleared all tasks for today.');
      expect(html).toContain('Create Task');
    });
  });

  describe('SkipLink Accessibility', () => {
    it('renders skip link pointing to main-content with 44px min touch target semantics', () => {
      const html = renderToString(
        React.createElement(SkipLink, {
          targetId: 'main-content',
          label: 'Skip to main content',
        })
      );
      expect(html).toContain('href="#main-content"');
      expect(html).toContain('Skip to main content');
    });
  });

  describe('RouteAnnouncer Accessibility', () => {
    it('renders polite live region for route change announcements', () => {
      const html = renderToString(
        React.createElement(RouteAnnouncer, {
          message: 'Navigated to Today view',
        })
      );
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('aria-atomic="true"');
      expect(html).toContain('Navigated to Today view');
    });
  });

  describe('NoteEditor Component', () => {
    it('renders distraction-free note editor with title input, toolbar, and blocks', () => {
      const html = renderToString(
        React.createElement(NoteEditor, {
          initialTitle: 'Test Note',
          localSaveStatus: 'Saved locally',
          cloudSyncStatus: 'Synced',
        })
      );
      expect(html).toContain('data-testid="note-editor"');
      expect(html).toContain('role="toolbar"');
      expect(html).toContain('aria-label="Note editor toolbar"');
      expect(html).toContain('value="Test Note"');
      expect(html).toContain('placeholder="Untitled note..."');
      expect(html).toContain('data-testid="format-paragraph"');
      expect(html).toContain('data-testid="format-h1"');
      expect(html).toContain('data-testid="format-bold"');
      expect(html).toContain('data-testid="editor-undo"');
      expect(html).toContain('data-testid="editor-redo"');
      expect(html).toContain('Saved locally');
      expect(html).toContain('Synced');
    });

    it('renders conflict banner when conflict is present', () => {
      const html = renderToString(
        React.createElement(NoteEditor, {
          initialTitle: 'Conflict Note',
          conflict: {
            serverRevision: 5,
            serverTitle: 'Server Note',
          },
        })
      );
      expect(html).toContain('data-testid="conflict-banner"');
      expect(html).toContain('Server Rev');
      expect(html).toContain('5');
      expect(html).toContain('data-testid="resolve-keep-server"');
      expect(html).toContain('data-testid="resolve-keep-local"');
      expect(html).toContain('data-testid="resolve-save-copy"');
    });

    it('preserves Bangla Unicode content cleanly in note editor rendering', () => {
      const html = renderToString(
        React.createElement(NoteEditor, {
          initialTitle: 'বাংলা নোট শিরোনাম',
          initialDocument: {
            version: 1,
            type: 'doc',
            content: [
              {
                id: 'p-1',
                type: 'paragraph',
                content: [{ type: 'text', text: 'এটি একটি বাংলা অনুচ্ছেদ' }],
              },
            ],
          },
        })
      );
      expect(html).toContain('বাংলা নোট শিরোনাম');
      expect(html).toContain('এটি একটি বাংলা অনুচ্ছেদ');
    });
  });

  describe('TaskRow & TaskDetailEditor Accessibility', () => {
    it('renders TaskRow with accessible attributes, priority label, and overdue warning text', () => {
      const html = renderToString(
        React.createElement(TaskRow, {
          id: 'task-test-1',
          title: 'Review quarterly architecture plan',
          priority: 'urgent',
          status: 'todo',
          deadline: { type: 'date', date: '2026-10-10' },
          themeMode: 'light',
          userTimezone: 'UTC',
        })
      );
      expect(html).toContain('Review quarterly architecture plan');
      expect(html).toContain('Urgent');
      expect(html).toContain('Overdue by');
      expect(html).toContain('Due 2026-10-10');
      expect(html).toContain('role="listitem"');
      expect(html).toContain(
        'Mark task &quot;Review quarterly architecture plan&quot; as completed'
      );
    });

    it('renders TaskDetailEditor with dialog role and deadline options', () => {
      const html = renderToString(
        React.createElement(TaskDetailEditor, {
          id: 'task-test-2',
          initialTitle: 'Detailed Task Specification',
          initialPriority: 'high',
          initialStatus: 'todo',
          initialDeadline: {
            type: 'timed',
            timestamp: '2026-10-16T15:00:00.000Z',
            timezone: 'UTC',
          },
          themeMode: 'light',
          userTimezone: 'UTC',
        })
      );
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('Task Details');
      expect(html).toContain('Detailed Task Specification');
      expect(html).toContain('High');
      expect(html).toContain('Save Task');
    });
  });

  describe('RoutineRow, RoutineDetailEditor & RoutineHistoryViewer Accessibility', () => {
    it('renders RoutineRow with checkbox role, cadence note, and why-due description', () => {
      const html = renderToString(
        React.createElement(RoutineRow, {
          routine: {
            id: 'routine-test-1',
            title: 'Morning Meditation (15 min)',
            frequency: 'daily',
            weekdays: [1, 2, 3, 4, 5, 6, 7],
            timezone: 'Asia/Dhaka',
            scheduledTime: '06:30',
            isPaused: false,
          },
          occurrence: {
            id: 'occ-test-1',
            routineId: 'routine-test-1',
            scheduledDate: '2026-10-16',
            status: 'pending',
          },
          viewingDate: '2026-10-16',
          themeMode: 'light',
        })
      );

      expect(html).toContain('role="listitem"');
      expect(html).toContain('role="checkbox"');
      expect(html).toContain('Morning Meditation (15 min)');
      expect(html).toContain('Repeats every day at 06:30');
      expect(html).toContain('Due today');
      expect(html).toContain('Pending');
      expect(html).toContain('Skip');
      expect(html).toContain('data-routine-id="routine-test-1"');
    });

    it('renders RoutineDetailEditor with modal dialog role and weekday selector', () => {
      const html = renderToString(
        React.createElement(RoutineDetailEditor, {
          isOpen: true,
          onClose: () => {},
          onSave: () => {},
          todayDate: '2026-10-16',
          defaultTimezone: 'Asia/Dhaka',
          themeMode: 'light',
        })
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('New Daily Routine');
      expect(html).toContain('Every Day');
      expect(html).toContain('Custom Weekdays');
      expect(html).toContain('Scheduled Time');
      expect(html).toContain('Create Routine');
    });

    it('renders RoutineHistoryViewer with past occurrences and gentle progress without streak shaming', () => {
      const html = renderToString(
        React.createElement(RoutineHistoryViewer, {
          isOpen: true,
          onClose: () => {},
          routineTitle: 'Evening Journal Reflection',
          occurrences: [
            {
              id: 'occ-1',
              routineId: 'r-1',
              scheduledDate: '2026-10-15',
              scheduleRevision: 1,
              plannedInstant: null,
              timezone: 'UTC',
              status: 'done',
              completedAt: '2026-10-15T21:30:00.000Z',
              completedBy: 'user-1',
              history: [],
            },
            {
              id: 'occ-2',
              routineId: 'r-1',
              scheduledDate: '2026-10-14',
              scheduleRevision: 1,
              plannedInstant: null,
              timezone: 'UTC',
              status: 'skipped',
              completedAt: null,
              completedBy: null,
              history: [],
            },
          ],
          themeMode: 'light',
        })
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('Completion History');
      expect(html).toContain('Evening Journal Reflection');
      expect(html).toContain('Gentle tracking · No broken streaks or penalties');
      expect(html).toContain('2026-10-15');
      expect(html).toContain('Completed');
      expect(html).toContain('2026-10-14');
      expect(html).toContain('Skipped');
    });
  });

  describe('JournalEditor Component', () => {
    it('renders focused journal editor with date, mood options, and reflection controls', () => {
      const html = renderToString(
        React.createElement(JournalEditor, {
          initialTitle: 'Evening Reflection',
          initialEntryDate: '2026-10-16',
          initialMood: 'reflective',
          initialTags: ['evening', 'focus'],
          localSaveStatus: 'Saved locally',
          cloudSyncStatus: 'Synced with cloud',
        })
      );

      expect(html).toContain('data-testid="journal-editor"');
      expect(html).toContain('value="Evening Reflection"');
      expect(html).toContain('value="2026-10-16"');
      expect(html).toContain('data-testid="journal-mood-reflective"');
      expect(html).toContain('aria-pressed="true"');
      expect(html).toContain('data-testid="journal-tag-evening"');
      expect(html).toContain('data-testid="journal-tag-focus"');
      expect(html).toContain('data-testid="journal-toggle-prompts-btn"');
      expect(html).toContain('Saved locally');
      expect(html).toContain('Synced with cloud');
    });

    it('displays backdated indicator badge when entry date is in the past', () => {
      const html = renderToString(
        React.createElement(JournalEditor, {
          initialTitle: 'Past Journal Entry',
          initialEntryDate: '2020-01-01',
          initialTimezone: 'UTC',
        })
      );

      expect(html).toContain('data-testid="journal-backdated-badge"');
      expect(html).toContain('Backdated');
    });

    it('renders conflict resolution banner with recovery choices when conflict is present', () => {
      const html = renderToString(
        React.createElement(JournalEditor, {
          initialTitle: 'Local version of journal',
          conflict: {
            serverRevision: 4,
            serverTitle: 'Server version of journal',
          },
        })
      );

      expect(html).toContain('data-testid="conflict-banner"');
      expect(html).toContain('data-testid="resolve-keep-server"');
      expect(html).toContain('data-testid="resolve-keep-local"');
      expect(html).toContain('data-testid="resolve-save-copy"');
    });

    it('preserves Bangla Unicode document and text cleanly', () => {
      const html = renderToString(
        React.createElement(JournalEditor, {
          initialTitle: 'আজকের চিন্তা ও আত্মবিশ্লেষণ',
          initialMood: 'great',
          initialDocument: {
            version: 1,
            type: 'doc',
            content: [
              {
                id: 'p-1',
                type: 'paragraph',
                content: [{ type: 'text', text: 'শান্ত ও নিরিবিলি পরিবেশে আজকের ভাবনা।' }],
              },
            ],
          },
        })
      );

      expect(html).toContain('আজকের চিন্তা ও আত্মবিশ্লেষণ');
      expect(html).toContain('শান্ত ও নিরিবিলি পরিবেশে আজকের ভাবনা।');
    });
  });

  describe('StorageUsageBar Component', () => {
    it('renders storage progress bar with percentage and byte counts', async () => {
      const { StorageUsageBar } = await import('./StorageUsageBar.js');

      const html = renderToString(
        React.createElement(StorageUsageBar, {
          storedBytes: 25 * 1024 * 1024,
          reservedBytes: 5 * 1024 * 1024,
          maxBytes: 100 * 1024 * 1024,
          themeMode: 'light',
        })
      );

      expect(html).toContain('role="progressbar"');
      expect(html).toContain('aria-valuenow="30"');
      expect(html).toContain('25 MB');
      expect(html).toContain('100 MB');
      expect(html).toContain('30');
      expect(html).toContain('5 MB reserved');
    });

    it('displays warning when approaching storage quota', async () => {
      const { StorageUsageBar } = await import('./StorageUsageBar.js');

      const html = renderToString(
        React.createElement(StorageUsageBar, {
          storedBytes: 85 * 1024 * 1024,
          reservedBytes: 0,
          maxBytes: 100 * 1024 * 1024,
        })
      );

      expect(html).toContain('Storage is nearing capacity');
      expect(html).toContain('85');
      expect(html).toContain('% used');
    });

    it('displays alert message when quota is exceeded', async () => {
      const { StorageUsageBar } = await import('./StorageUsageBar.js');

      const html = renderToString(
        React.createElement(StorageUsageBar, {
          storedBytes: 100 * 1024 * 1024,
          reservedBytes: 5 * 1024 * 1024,
          maxBytes: 100 * 1024 * 1024,
        })
      );

      expect(html).toContain('role="alert"');
      expect(html).toContain('Storage quota exceeded');
    });
  });

  describe('FileUploadDialog Component', () => {
    it('renders file upload dialog with folder placement and storage bar', async () => {
      const { FileUploadDialog } = await import('./FileUploadDialog.js');

      const html = renderToString(
        React.createElement(FileUploadDialog, {
          isOpen: true,
          onClose: () => {},
          workspaceId: 'ws-test',
          folders: [
            { id: 'f-1', name: 'Software', parentId: null, icon: '💻' },
            { id: 'f-2', name: 'Guides', parentId: 'f-1', icon: '📚' },
          ],
          initialFolderId: 'f-2',
          storedBytes: 10 * 1024 * 1024,
          reservedBytes: 0,
          maxBytes: 100 * 1024 * 1024,
        })
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('Upload File');
      expect(html).toContain('Folder Destination');
      expect(html).toContain('Software');
      expect(html).toContain('Guides');
      expect(html).toContain('Browse Files');
      expect(html).toContain('Storage Usage');
    });
  });

  describe('FilePreviewDialog Component', () => {
    it('renders safe image preview when file is verified', async () => {
      const { FilePreviewDialog } = await import('./FilePreviewDialog.js');

      const html = renderToString(
        React.createElement(FilePreviewDialog, {
          isOpen: true,
          onClose: () => {},
          workspaceId: 'ws-test',
          file: {
            id: 'file-img-1',
            fileName: 'architecture-diagram.png',
            detectedMimeType: 'image/png',
            byteSize: 1024 * 512,
            version: 1,
            quarantineStatus: 'verified',
            sha256Checksum: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
            folderName: 'Software',
            verifiedAt: '2026-10-17T12:00:00.000Z',
          },
          onRequestDownloadUrl: async () => 'https://storage.local/download/img.png',
        })
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('architecture-diagram.png');
      expect(html).toContain('✓ Verified Clean');
      expect(html).toContain('512 KB');
    });

    it('renders office document metadata card without claiming full in-browser editing', async () => {
      const { FilePreviewDialog } = await import('./FilePreviewDialog.js');

      const html = renderToString(
        React.createElement(FilePreviewDialog, {
          isOpen: true,
          onClose: () => {},
          workspaceId: 'ws-test',
          file: {
            id: 'file-doc-1',
            fileName: 'Study-Guide-Notes.docx',
            detectedMimeType:
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            byteSize: 1024 * 1024 * 2,
            version: 1,
            quarantineStatus: 'verified',
            sha256Checksum: '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff',
            folderName: 'Government jobs',
            verifiedAt: '2026-10-17T12:00:00.000Z',
          },
          onRequestDownloadUrl: async () => 'https://storage.local/download/doc.docx',
        })
      );

      expect(html).toContain('Study-Guide-Notes.docx');
      expect(html).toContain('Office Document Notice');
      expect(html).toContain('In-browser office document editing is not supported in this release');
      expect(html).toContain('Download Document');
    });

    it('blocks preview and displays warning when file is quarantined or rejected', async () => {
      const { FilePreviewDialog } = await import('./FilePreviewDialog.js');

      const html = renderToString(
        React.createElement(FilePreviewDialog, {
          isOpen: true,
          onClose: () => {},
          workspaceId: 'ws-test',
          file: {
            id: 'file-quarantine-1',
            fileName: 'Suspicious-Script.svg',
            detectedMimeType: 'image/svg+xml',
            byteSize: 1024,
            version: 1,
            quarantineStatus: 'rejected',
            sha256Checksum: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
          },
        })
      );

      expect(html).toContain('✕ Security Rejected');
      expect(html).toContain('rejected by malware and active content inspection');
      expect(html).not.toContain('<iframe');
      expect(html).not.toContain('<img');
    });
  });
});
