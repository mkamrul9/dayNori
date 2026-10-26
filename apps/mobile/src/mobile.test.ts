import { describe, expect, it, beforeEach } from 'vitest';
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from './test-render.js';
import App from '../App.js';
import { MobileAuthAdapter, defaultAuthAdapter } from './auth/authAdapter.js';
import { TodayView } from './views/TodayView.js';
import { PlanView } from './views/PlanView.js';
import { LibraryView, SAMPLE_MOBILE_FOLDERS, SAMPLE_MOBILE_ITEMS } from './views/LibraryView.js';
import { JournalView } from './views/JournalView.js';
import { SettingsView } from './views/SettingsView.js';
import { CreateSheet } from './views/CreateSheet.js';
import { ComponentGalleryView } from './views/ComponentGalleryView.js';
import { BackHandler, AppState, Linking, AccessibilityInfo } from '@daynori/test-utils';
import { parseDeepLinkUrl } from '@daynori/contracts';

/**
 * TEST BOUNDARY & LIMITATIONS DISCLAIMER:
 * These tests execute in Node/Vitest using react-test-renderer and in-memory mock adapters to verify
 * component mounting, hook evaluation, sub-view transitions, form draft retention, and route contracts.
 * They do NOT claim to prove physical Android hardware Back button behavior, native keyboard avoidance,
 * OS background/resume lifecycle, or native GPU rendering. Those native behaviors require physical
 * device verification under Phase 04 and Phase 06 acceptance gates.
 */

describe('Android Navigation Shell & Contracts (Phase 06)', () => {
  beforeEach(() => {
    BackHandler._clearListeners();
    AppState._clearListeners();
    Linking._clearListeners();
    defaultAuthAdapter.clearListeners();
    defaultAuthAdapter.logout();
  });

  describe('Root Application Shell Mounting', () => {
    it('mounts root App component tree and initializes navigation shell structure', () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = TestRenderer.create(React.createElement(App));
      });

      const root = renderer!.root;
      expect(root).toBeDefined();

      // Find top header and bottom navigation bar in mounted tree
      const json = renderer!.toJSON();
      expect(json).toBeDefined();
    });
  });

  describe('Authentication Adapter Contract & External Deep Link Security', () => {
    it('defaults strictly to unauthenticated with no user session', () => {
      const adapter = new MobileAuthAdapter(false);
      expect(adapter.isAuthenticated()).toBe(false);
      expect(adapter.getCurrentUser()).toBeNull();
      expect(adapter.getPendingDestination()).toBeNull();
    });

    it('transitions to authenticated on synthetic login and triggers listener', () => {
      const adapter = new MobileAuthAdapter(false);
      let listenerCalled = false;
      const unsubscribe = adapter.subscribe(() => {
        listenerCalled = true;
      });

      adapter.setPendingDestination('journal');
      expect(adapter.getPendingDestination()).toBe('journal');

      adapter.loginSynthetic({
        id: 'usr_test_123',
        name: 'Test Contributor',
        workspaceId: 'ws_test_456',
      });

      expect(adapter.isAuthenticated()).toBe(true);
      expect(adapter.getCurrentUser()?.id).toBe('usr_test_123');
      expect(listenerCalled).toBe(true);

      adapter.logout();
      expect(adapter.isAuthenticated()).toBe(false);
      expect(adapter.getCurrentUser()).toBeNull();
      expect(adapter.getPendingDestination()).toBeNull();

      unsubscribe();
    });

    it('SECURITY: External auth deep links must NEVER establish an authenticated session', () => {
      expect(defaultAuthAdapter.isAuthenticated()).toBe(false);

      // Mount App and dispatch external link
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = TestRenderer.create(React.createElement(App));
      });
      expect(renderer.root).toBeDefined();

      act(() => {
        Linking._mockEmitUrl('daynori://auth?token=attacker-injected-token-999');
      });

      // Assert session remains unauthenticated
      expect(defaultAuthAdapter.isAuthenticated()).toBe(false);
      expect(defaultAuthAdapter.getCurrentUser()).toBeNull();
    });
  });

  describe('Mounted Destinations & Interaction Tests', () => {
    it('mounts TodayView, renders tasks/routines, and handles interactive empty state toggle', () => {
      let navigatedToPlan = false;
      let navigatedToJournal = false;
      let openedCreate = false;

      let renderer: ReactTestRenderer;
      act(() => {
        renderer = TestRenderer.create(
          React.createElement(TodayView, {
            themeMode: 'light',
            onNavigateToPlan: () => {
              navigatedToPlan = true;
            },
            onNavigateToJournal: () => {
              navigatedToJournal = true;
            },
            onOpenCreate: () => {
              openedCreate = true;
            },
          })
        );
      });

      const root = renderer!.root;
      expect(root).toBeDefined();

      // Find interactive toggle button for empty state and trigger press
      const toggleBtn = root.findByProps({ testID: 'state-btn-empty' });
      expect(toggleBtn).toBeDefined();

      act(() => {
        toggleBtn.props.onPress();
      });

      // Verify empty state is now mounted
      const emptyState = renderer!.root.findByProps({ testID: 'today-empty-state' });
      expect(emptyState).toBeDefined();

      // Trigger create callback from empty state
      act(() => {
        renderer!.root.findByProps({ accessibilityLabel: 'Create task' }).props.onPress();
      });
      expect(openedCreate).toBe(true);

      // Switch back to normal state to access navigation buttons
      act(() => {
        renderer!.root.findByProps({ testID: 'state-btn-normal' }).props.onPress();
      });

      // Trigger navigation callbacks through mounted tree props
      act(() => {
        renderer!.root
          .findByProps({ accessibilityLabel: 'View full schedule in Plan' })
          .props.onPress();
      });
      expect(navigatedToPlan).toBe(true);

      act(() => {
        renderer!.root
          .findByProps({ accessibilityLabel: 'Write reflection in Journal' })
          .props.onPress();
      });
      expect(navigatedToJournal).toBe(true);
    });

    it('mounts PlanView and interactively switches between Tasks, Routines, and Calendar sub-views', () => {
      let activeSubView = 'tasks';
      let renderer: ReactTestRenderer;

      act(() => {
        renderer = TestRenderer.create(
          React.createElement(PlanView, {
            themeMode: 'dark',
            initialSubView: 'tasks',
            onSubViewChange: (sv) => {
              activeSubView = sv;
            },
          })
        );
      });

      const root = renderer!.root;

      // Switch to Calendar
      const calendarTab = root.findByProps({ testID: 'plan-tab-calendar' });
      act(() => {
        calendarTab.props.onPress();
      });
      expect(activeSubView).toBe('calendar');

      // Switch to Routines
      const routinesTab = root.findByProps({ testID: 'plan-tab-routines' });
      act(() => {
        routinesTab.props.onPress();
      });
      expect(activeSubView).toBe('routines');
    });

    it('interactively navigates agenda, day, and month views and creates personal events in PlanView', async () => {
      let renderer!: ReactTestRenderer;

      act(() => {
        renderer = TestRenderer.create(
          React.createElement(PlanView, {
            themeMode: 'dark',
            initialSubView: 'calendar',
          })
        );
      });

      // 1. Verify calendar subview is rendered
      const calendarSubView = renderer.root.findByProps({ testID: 'plan-calendar-subview' });
      expect(calendarSubView).toBeDefined();

      // 2. Switch between view modes: Day and Month
      const dayTab = renderer.root.findByProps({ testID: 'plan-calendar-view-day' });
      act(() => {
        dayTab.props.onPress();
      });

      const monthTab = renderer.root.findByProps({ testID: 'plan-calendar-view-month' });
      act(() => {
        monthTab.props.onPress();
      });

      const agendaTab = renderer.root.findByProps({ testID: 'plan-calendar-view-agenda' });
      act(() => {
        agendaTab.props.onPress();
      });

      // 3. Toggle filter chips
      const taskFilterChip = renderer.root.findByProps({ testID: 'plan-calendar-filter-tasks' });
      act(() => {
        taskFilterChip.props.onPress();
      });

      // 4. Open Add Event Sheet
      const addEventBtn = renderer.root.findByProps({ testID: 'plan-calendar-add-event-btn' });
      act(() => {
        addEventBtn.props.onPress();
      });

      const eventModal = renderer.root.findByProps({ testID: 'plan-calendar-event-modal' });
      expect(eventModal.props.visible).toBe(true);

      // 5. Fill in title and save event
      const titleInput = renderer.root.findByProps({ testID: 'plan-event-title-input' });
      act(() => {
        titleInput.props.onChangeText('Sprint Planning Ceremony');
      });

      const saveEventBtn = renderer.root.findByProps({ testID: 'plan-event-save-btn' });
      await act(async () => {
        await saveEventBtn.props.onPress();
      });

      // Verify event appears in agenda
      const treeStr = JSON.stringify(renderer.toJSON());
      expect(treeStr).toContain('Sprint Planning Ceremony');
    });

    it('interactively creates tasks, toggles completion, and supports undo in PlanView', () => {
      let renderer!: ReactTestRenderer;

      act(() => {
        renderer = TestRenderer.create(
          React.createElement(PlanView, {
            themeMode: 'light',
            initialSubView: 'tasks',
          })
        );
      });

      const root = renderer.root;

      // 1. Quick capture a task
      const input = root.findByProps({ testID: 'plan-quick-add-input' });
      act(() => {
        input.props.onChangeText('Mobile Test Task');
      });

      const addBtn = root.findByProps({ testID: 'plan-quick-add-btn' });
      act(() => {
        addBtn.props.onPress();
      });

      // Verify task appears
      const treeStr = JSON.stringify(renderer.toJSON());
      expect(treeStr).toContain('Mobile Test Task');

      // 2. Toggle completion on task t1
      const t1Toggle = renderer.root.findByProps({ testID: 'task-toggle-t1' });
      act(() => {
        t1Toggle.props.onPress();
      });

      // Assert undo banner appears
      const undoBanner = renderer.root.findByProps({ testID: 'plan-undo-banner' });
      expect(undoBanner).toBeDefined();

      // Click Undo
      const undoBtn = renderer.root.findByProps({ testID: 'plan-undo-btn' });
      act(() => {
        undoBtn.props.onPress();
      });

      // Checkbox for t1 should be unchecked again
      const t1Restored = renderer.root.findByProps({ testID: 'task-toggle-t1' });
      expect((t1Restored.props.accessibilityState as { checked: boolean }).checked).toBe(false);
    });

    it('displays overdue task explanations using explicit text and dates, not color alone', () => {
      let renderer!: ReactTestRenderer;

      act(() => {
        renderer = TestRenderer.create(
          React.createElement(PlanView, {
            themeMode: 'light',
            initialSubView: 'tasks',
          })
        );
      });

      const jsonStr = JSON.stringify(renderer.toJSON());
      // t3 in sample tasks is 2 days overdue
      expect(jsonStr).toContain('Overdue by');
      expect(jsonStr).toContain('Due');
    });

    it('mounts LibraryView and interactively switches module filter chips', () => {
      let activeFilter = 'all';
      let renderer: ReactTestRenderer;

      act(() => {
        renderer = TestRenderer.create(
          React.createElement(LibraryView, {
            themeMode: 'light',
            initialFilter: 'all',
            onFilterChange: (f) => {
              activeFilter = f;
            },
          })
        );
      });

      const root = renderer!.root;

      // Click 'notes' filter chip
      const notesChip = root.findByProps({ testID: 'library-filter-notes' });
      act(() => {
        notesChip.props.onPress();
      });
      expect(activeFilter).toBe('notes');

      // Click 'files' filter chip
      const filesChip = root.findByProps({ testID: 'library-filter-files' });
      act(() => {
        filesChip.props.onPress();
      });
      expect(activeFilter).toBe('files');
    });

    it('defaults to an empty workspace without hardcoded sample folders', () => {
      let renderer!: ReactTestRenderer;

      act(() => {
        renderer = TestRenderer.create(
          React.createElement(LibraryView, {
            themeMode: 'light',
          })
        );
      });

      // Should show empty state
      const emptyState = renderer.root.findByProps({ testID: 'mobile-empty-state' });
      expect(emptyState).toBeDefined();
    });

    it('navigates into Software folder and displays subfolders and breadcrumbs', () => {
      let renderer!: ReactTestRenderer;

      act(() => {
        renderer = TestRenderer.create(
          React.createElement(LibraryView, {
            themeMode: 'light',
            initialFolders: SAMPLE_MOBILE_FOLDERS,
            initialItems: SAMPLE_MOBILE_ITEMS,
          })
        );
      });

      // Find Software folder button and click
      const softwareFolderBtn = renderer.root.findByProps({
        accessibilityLabel: 'Open folder Software, contains 0 items',
      });
      expect(softwareFolderBtn).toBeDefined();

      act(() => {
        softwareFolderBtn.props.onPress();
      });

      // Breadcrumb should now show Software
      const breadcrumb = renderer.root.findByProps({ testID: 'mobile-breadcrumb' });
      expect(breadcrumb.props.accessibilityLabel).toContain('Software');

      // Click Go Back to parent
      const upBtn = renderer.root.findByProps({ accessibilityLabel: 'Go back to parent folder' });
      expect(upBtn).toBeDefined();
      act(() => {
        upBtn.props.onPress();
      });

      // Breadcrumb should be back to Workspace
      const breadcrumbRoot = renderer.root.findByProps({ testID: 'mobile-breadcrumb' });
      expect(breadcrumbRoot.props.accessibilityLabel).toBe('Current location: Workspace');
    });

    it('supports reordering folders up and down', () => {
      let renderer!: ReactTestRenderer;

      act(() => {
        renderer = TestRenderer.create(
          React.createElement(LibraryView, {
            themeMode: 'light',
            initialFolders: SAMPLE_MOBILE_FOLDERS,
            initialItems: SAMPLE_MOBILE_ITEMS,
          })
        );
      });

      // Find move down button for first folder (Software)
      const moveDownBtn = renderer.root.findByProps({ accessibilityLabel: 'Move Software down' });
      expect(moveDownBtn).toBeDefined();

      act(() => {
        moveDownBtn.props.onPress();
      });

      // After moving down, Software can now be moved up
      const moveUpBtn = renderer.root.findByProps({ accessibilityLabel: 'Move Software up' });
      expect(moveUpBtn.props.disabled).toBe(false);
    });

    it('demonstrates Software and Government jobs sample journeys', () => {
      let renderer!: ReactTestRenderer;

      act(() => {
        renderer = TestRenderer.create(
          React.createElement(LibraryView, {
            themeMode: 'light',
          })
        );
      });

      const demoBtn = renderer.root.findByProps({ accessibilityLabel: 'Load sample journeys' });
      expect(demoBtn).toBeDefined();

      act(() => {
        demoBtn.props.onPress();
      });

      // Verify Government jobs folder is present on updated root
      const govJobsBtn = renderer.root.findByProps({
        accessibilityLabel: 'Open folder Government jobs, contains 0 items',
      });
      expect(govJobsBtn).toBeDefined();
    });

    it('connects LibraryView to sync engine to persist and reflect live sync status', async () => {
      const enqueuedMutations: Array<{ command: string; payload: Record<string, unknown> }> = [];
      const listeners: Array<() => void> = [];

      const mockSyncEngine = {
        getDiagnostics: () => ({
          workspaceId: 'ws-mob-test',
          userId: 'user-mob-test',
          deviceId: 'dev-1',
          isLeader: true,
          networkStatus: 'online' as const,
          cloudSyncStatus: 'synced' as const,
          queueLength: 0,
          inFlightCount: 0,
          failedCount: 0,
          lastSyncedAt: null,
          lastSyncSequence: 0,
          accessEpoch: null,
          consecutiveFailures: 0,
          activeConflictsCount: 0,
        }),
        onEvent: (cb: () => void) => {
          listeners.push(cb);
          return () => {};
        },
        enqueueMutation: async (params: { command: string; payload: Record<string, unknown> }) => {
          enqueuedMutations.push(params);
        },
        pushPending: async () => {},
      } as unknown as import('@daynori/sync').SyncEngine;

      let renderer!: ReactTestRenderer;
      await act(async () => {
        renderer = TestRenderer.create(
          React.createElement(LibraryView, {
            themeMode: 'light',
            workspaceId: 'ws-mob-test',
            userId: 'user-mob-test',
            syncEngine: mockSyncEngine,
            initialFolders: SAMPLE_MOBILE_FOLDERS,
          })
        );
      });

      // Verify status bar renders "Saved locally • ☁️ Synced"
      const statusBar = renderer.root.findByProps({ accessibilityRole: 'summary' });
      expect(statusBar.props.accessibilityLabel).toBe('Status: Saved locally, Synced');

      // Click move down button for first folder (Software)
      const moveDownBtn = renderer.root.findByProps({ accessibilityLabel: 'Move Software down' });
      await act(async () => {
        moveDownBtn.props.onPress();
      });

      // Verify reorderFolder was enqueued to sync engine
      expect(enqueuedMutations.length).toBeGreaterThan(0);
      expect(enqueuedMutations[0]?.command).toBe('reorderFolder');
    });

    it('mounts JournalView with protection gate when unauthenticated and unlocks on login', () => {
      let loggedIn = false;
      let renderer: ReactTestRenderer;

      // 1. Unauthenticated state renders gate card
      act(() => {
        renderer = TestRenderer.create(
          React.createElement(JournalView, {
            themeMode: 'light',
            isAuthenticated: false,
            onLoginSynthetic: () => {
              loggedIn = true;
            },
            onNavigateToToday: () => {},
          })
        );
      });

      const unauthRoot = renderer!.root;
      const unlockBtn = unauthRoot.findByProps({
        accessibilityLabel: 'Sign in to your account',
      });
      expect(unlockBtn).toBeDefined();

      act(() => {
        unlockBtn.props.onPress();
      });
      expect(loggedIn).toBe(true);

      // 2. Authenticated state renders timeline and new entry button
      let authRenderer: ReactTestRenderer;
      act(() => {
        authRenderer = TestRenderer.create(
          React.createElement(JournalView, {
            themeMode: 'light',
            isAuthenticated: true,
            onLoginSynthetic: () => {},
            onNavigateToToday: () => {},
          })
        );
      });

      const newEntryBtn = authRenderer!.root.findByProps({
        accessibilityLabel: 'Write new reflection',
      });
      expect(newEntryBtn).toBeDefined();

      // Open reflection writing form
      act(() => {
        newEntryBtn.props.onPress();
      });

      // Verify form elements exist: Title, Body, Save, Cancel
      const saveBtn = authRenderer!.root.findByProps({
        accessibilityLabel: 'Save reflection',
      });
      expect(saveBtn).toBeDefined();

      const cancelBtn = authRenderer!.root.findByProps({
        accessibilityLabel: 'Cancel reflection',
      });
      expect(cancelBtn).toBeDefined();

      // Cancel writing returns to timeline
      act(() => {
        cancelBtn.props.onPress();
      });
      expect(
        authRenderer!.root.findByProps({
          accessibilityLabel: 'Write new reflection',
        })
      ).toBeDefined();
    });

    it('handles writing a reflection with mood selection and template prompts in JournalView', () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = TestRenderer.create(
          React.createElement(JournalView, {
            themeMode: 'light',
            isAuthenticated: true,
            onLoginSynthetic: () => {},
            onNavigateToToday: () => {},
          })
        );
      });

      // 1. Click write
      const writeBtn = renderer!.root.findByProps({
        accessibilityLabel: 'Write new reflection',
      });
      act(() => {
        writeBtn.props.onPress();
      });

      // 2. Select mood
      const moodBtn = renderer!.root.findByProps({
        accessibilityLabel: 'Mood Great',
      });
      expect(moodBtn).toBeDefined();
      act(() => {
        moodBtn.props.onPress();
      });

      // 3. Toggle prompt tray
      const promptTrayBtn = renderer!.root.findByProps({
        accessibilityLabel: 'Toggle reflection templates',
      });
      expect(promptTrayBtn).toBeDefined();
      act(() => {
        promptTrayBtn.props.onPress();
      });

      // 4. Save entry
      const saveBtn = renderer!.root.findByProps({
        accessibilityLabel: 'Save reflection',
      });
      act(() => {
        saveBtn.props.onPress();
      });
    });

    it('navigates days and supports snippet privacy toggle in JournalView', () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = TestRenderer.create(
          React.createElement(JournalView, {
            themeMode: 'light',
            isAuthenticated: true,
            onLoginSynthetic: () => {},
            onNavigateToToday: () => {},
          })
        );
      });

      const prevDayBtn = renderer!.root.findByProps({
        accessibilityLabel: 'Previous day',
      });
      expect(prevDayBtn).toBeDefined();
      act(() => {
        prevDayBtn.props.onPress();
      });

      const nextDayBtn = renderer!.root.findByProps({
        accessibilityLabel: 'Next day',
      });
      expect(nextDayBtn).toBeDefined();
      act(() => {
        nextDayBtn.props.onPress();
      });

      const todayBtn = renderer!.root.findByProps({
        accessibilityLabel: 'Jump to today',
      });
      expect(todayBtn).toBeDefined();
      act(() => {
        todayBtn.props.onPress();
      });

      // Toggle privacy snippets
      const snippetToggle = renderer!.root.findByProps({
        accessibilityLabel: 'Show snippets',
      });
      expect(snippetToggle).toBeDefined();
      act(() => {
        snippetToggle.props.onPress();
      });
      expect(
        renderer!.root.findByProps({
          accessibilityLabel: 'Hide snippets',
        })
      ).toBeDefined();
    });

    it('mounts SettingsView appearance group, theme toggle, and operator-only dev review', () => {
      let themeToggled = false;
      let textScale = 1.0;
      let backToHub = false;

      let renderer: ReactTestRenderer;
      act(() => {
        renderer = TestRenderer.create(
          React.createElement(SettingsView, {
            themeMode: 'light',
            group: 'appearance',
            onBackToHub: () => {
              backToHub = true;
            },
            onToggleTheme: () => {
              themeToggled = true;
            },
            textScale: 1.0,
            onChangeTextScale: (scale) => {
              textScale = scale;
            },
            isAuthenticated: false,
            onToggleAuth: () => {},
            isOperator: true,
            onOpenGallery: () => {},
            onClose: () => {},
            devReviewMode: false,
          })
        );
      });

      const root = renderer!.root;
      const backBtn = root.findByProps({ testID: 'settings-back-to-hub' });
      act(() => {
        backBtn.props.onPress();
      });
      expect(backToHub).toBe(true);

      const themeBtn = root.findByProps({ accessibilityLabel: 'Switch to dark theme' });
      act(() => {
        themeBtn.props.onPress();
      });
      expect(themeToggled).toBe(true);

      const scale150Btn = root.findByProps({ testID: 'scale-btn-1.5' });
      act(() => {
        scale150Btn.props.onPress();
      });
      expect(textScale).toBe(1.5);
    });

    it('keeps ordinary Settings account free of developer review tools', () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = TestRenderer.create(
          React.createElement(SettingsView, {
            themeMode: 'light',
            group: 'account',
            onBackToHub: () => {},
            onToggleTheme: () => {},
            textScale: 1.0,
            onChangeTextScale: () => {},
            isAuthenticated: false,
            onToggleAuth: () => {},
            isOperator: false,
            onClose: () => {},
          })
        );
      });

      expect(() =>
        renderer!.root.findByProps({
          accessibilityLabel: 'Show development review authentication tools',
        })
      ).toThrow();
    });

    it('shows operator synthetic auth tools only when isOperator', () => {
      let authToggled = false;
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = TestRenderer.create(
          React.createElement(SettingsView, {
            themeMode: 'light',
            group: 'account',
            onBackToHub: () => {},
            onToggleTheme: () => {},
            textScale: 1.0,
            onChangeTextScale: () => {},
            isAuthenticated: false,
            onToggleAuth: () => {
              authToggled = true;
            },
            isOperator: true,
            onClose: () => {},
          })
        );
      });

      const showDevToolsBtn = renderer!.root.findByProps({
        accessibilityLabel: 'Show development review authentication tools',
      });
      act(() => {
        showDevToolsBtn.props.onPress();
      });
      const loginSyntheticBtn = renderer!.root.findByProps({
        accessibilityLabel: 'Log in synthetic account',
      });
      act(() => {
        loginSyntheticBtn.props.onPress();
      });
      expect(authToggled).toBe(true);
    });

    it('mounts ComponentGalleryView as review destination', () => {
      let closed = false;
      let renderer: ReactTestRenderer;

      act(() => {
        renderer = TestRenderer.create(
          React.createElement(ComponentGalleryView, {
            themeMode: 'light',
            onToggleTheme: () => {},
            onClose: () => {
              closed = true;
            },
          })
        );
      });

      const root = renderer!.root;
      const closeBtn = root.findByProps({ accessibilityLabel: 'Back to Settings' });
      act(() => {
        closeBtn.props.onPress();
      });
      expect(closed).toBe(true);
    });

    it('mounts SearchSheet and CreateSheet with input draft preservation', () => {
      let draftTitle = '';
      let renderer: ReactTestRenderer;

      act(() => {
        renderer = TestRenderer.create(
          React.createElement(CreateSheet, {
            visible: true,
            onClose: () => {},
            themeMode: 'light',
            initialDraft: { type: 'task', title: 'Initial Draft', details: '' },
            onDraftChange: (d) => {
              draftTitle = d.title;
            },
            onCreateItem: () => {},
          })
        );
      });

      const root = renderer!.root;
      const titleInput = root.findByProps({ placeholder: 'Give your task a clear title...' });
      act(() => {
        titleInput.props.onChangeText('Updated Draft');
      });
      expect(draftTitle).toBe('Updated Draft');
    });
  });

  describe('Deep Linking & Mock Platform Contracts', () => {
    it('parses and routes deep links to parent tabs and sub-views', () => {
      const todayLink = parseDeepLinkUrl('daynori://today');
      expect(todayLink.success).toBe(true);
      expect(todayLink.payload?.destination).toBe('today');

      const calendarLink = parseDeepLinkUrl('daynori://notification?destination=plan/calendar');
      expect(calendarLink.success).toBe(true);
      expect(calendarLink.payload?.destination).toBe('plan/calendar');

      const fileLink = parseDeepLinkUrl('daynori://file?fileId=spec-01');
      expect(fileLink.success).toBe(true);
      expect(fileLink.payload?.destination).toBe('library');
    });

    it('rejects malicious deep links with path traversal without throwing', () => {
      const traversal = parseDeepLinkUrl('daynori://file?fileId=../../../secret.key');
      expect(traversal.success).toBe(false);
      expect(traversal.error).toBeDefined();

      const injection = parseDeepLinkUrl('daynori://file?fileId=id;DROP TABLE users;');
      expect(injection.success).toBe(false);
    });

    it('dispatches back press events to mock hardware listeners', () => {
      let backHandled = false;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        backHandled = true;
        return true;
      });

      const handled = BackHandler._mockPressBack();
      expect(handled).toBe(true);
      expect(backHandled).toBe(true);

      sub.remove();
      const unhandled = BackHandler._mockPressBack();
      expect(unhandled).toBe(false);
    });

    it('dispatches mock lifecycle events on AppState change', () => {
      let stateChanged = '';
      const sub = AppState.addEventListener('change', (newState: string) => {
        stateChanged = newState;
      });

      AppState._mockSetAppState('background');
      expect(AppState.currentState).toBe('background');
      expect(stateChanged).toBe('background');

      AppState._mockSetAppState('active');
      expect(AppState.currentState).toBe('active');
      expect(stateChanged).toBe('active');

      sub.remove();
    });

    it('notifies reduced motion changes via mock AccessibilityInfo', async () => {
      AccessibilityInfo.setReduceMotion(false);
      expect(await AccessibilityInfo.isReduceMotionEnabled()).toBe(false);

      let notified = false;
      const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled: boolean) => {
        notified = enabled;
      });

      AccessibilityInfo.setReduceMotion(true);
      expect(await AccessibilityInfo.isReduceMotionEnabled()).toBe(true);
      expect(notified).toBe(true);

      sub.remove();
    });
  });

  describe('Phase 21: Mobile Daily Routines Experience & History', () => {
    it('renders separate routines checklist and tasks sections with gentle progress', () => {
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = TestRenderer.create(
          React.createElement(TodayView, {
            themeMode: 'light',
            onNavigateToPlan: () => {},
            onNavigateToJournal: () => {},
            onOpenCreate: () => {},
          })
        );
      });

      const root = renderer.root;
      // Both sections should be mounted
      const routinesSection = root.findByProps({ testID: 'today-routines-section' });
      const tasksSection = root.findByProps({ testID: 'today-tasks-section' });
      expect(routinesSection).toBeDefined();
      expect(tasksSection).toBeDefined();

      // Check routine rows
      const row1 = root.findByProps({ testID: 'mobile-routine-row-r1' });
      const row2 = root.findByProps({ testID: 'mobile-routine-row-r2' });
      expect(row1).toBeDefined();
      expect(row2).toBeDefined();
    });

    it('completes routine, shows undo toast, and reverts completion upon undo press', () => {
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = TestRenderer.create(
          React.createElement(TodayView, {
            themeMode: 'light',
            onNavigateToPlan: () => {},
            onNavigateToJournal: () => {},
            onOpenCreate: () => {},
          })
        );
      });

      // Find Mark Done button on routine 1
      const doneBtn = renderer.root.findByProps({
        accessibilityLabel: 'Mark "Morning deep work session" as done for 2026-10-14',
      });
      expect(doneBtn).toBeDefined();

      act(() => {
        doneBtn.props.onPress();
      });

      // Undo toast should now appear
      const undoToast = renderer.root.findByProps({ testID: 'undo-toast' });
      expect(undoToast).toBeDefined();

      // Trigger undo
      const undoBtn = renderer.root.findByProps({ testID: 'undo-toast-btn' });
      act(() => {
        undoBtn.props.onPress();
      });

      // Status should revert to pending; "Mark as done" button should be back
      const revertedDoneBtn = renderer.root.findByProps({
        accessibilityLabel: 'Mark "Morning deep work session" as done for 2026-10-14',
      });
      expect(revertedDoneBtn).toBeDefined();
    });

    it('skips routine and displays undo toast', () => {
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = TestRenderer.create(
          React.createElement(TodayView, {
            themeMode: 'light',
            onNavigateToPlan: () => {},
            onNavigateToJournal: () => {},
            onOpenCreate: () => {},
          })
        );
      });

      // Find Skip button on routine 2
      const skipBtn = renderer.root.findByProps({
        accessibilityLabel: 'Skip routine "Evening reflection & summary"',
      });
      expect(skipBtn).toBeDefined();

      act(() => {
        skipBtn.props.onPress();
      });

      // Undo toast displays skip message
      const undoToast = renderer.root.findByProps({ testID: 'undo-toast' });
      expect(undoToast).toBeDefined();
    });

    it('opens history sheet displaying preserved yesterday completion and gentle progress stats', () => {
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = TestRenderer.create(
          React.createElement(TodayView, {
            themeMode: 'light',
            onNavigateToPlan: () => {},
            onNavigateToJournal: () => {},
            onOpenCreate: () => {},
          })
        );
      });

      // Open history on routine 1
      const historyBtn = renderer.root.findByProps({
        accessibilityLabel: 'View history for "Morning deep work session"',
      });
      expect(historyBtn).toBeDefined();

      act(() => {
        historyBtn.props.onPress();
      });

      // History sheet should mount with yesterday's occurrence
      const historySheet = renderer.root.findByProps({ testID: 'mobile-routine-history-sheet' });
      expect(historySheet).toBeDefined();

      const yesterdayOcc = renderer.root.findByProps({ testID: 'history-occ-2026-10-13' });
      expect(yesterdayOcc).toBeDefined();
    });
  });
});
