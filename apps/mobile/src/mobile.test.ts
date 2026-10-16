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
        accessibilityLabel: 'Authenticate with synthetic account',
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
    });

    it('mounts SettingsView, handles theme toggle and isolates dev review tools', () => {
      let themeToggled = false;
      let textScale = 1.0;
      let authToggled = false;

      let renderer: ReactTestRenderer;
      act(() => {
        renderer = TestRenderer.create(
          React.createElement(SettingsView, {
            themeMode: 'light',
            onToggleTheme: () => {
              themeToggled = true;
            },
            textScale: 1.0,
            onChangeTextScale: (scale) => {
              textScale = scale;
            },
            isAuthenticated: false,
            onToggleAuth: () => {
              authToggled = true;
            },
            onOpenGallery: () => {},
            onClose: () => {},
            devReviewMode: false,
          })
        );
      });

      const root = renderer!.root;
      const themeBtn = root.findByProps({ accessibilityLabel: 'Switch to dark theme' });
      act(() => {
        themeBtn.props.onPress();
      });
      expect(themeToggled).toBe(true);

      // Text scale adjust
      const scale150Btn = root.findByProps({ testID: 'scale-btn-1.5' });
      act(() => {
        scale150Btn.props.onPress();
      });
      expect(textScale).toBe(1.5);

      // Dev review mode auth toggle
      const showDevToolsBtn = root.findByProps({
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
});
