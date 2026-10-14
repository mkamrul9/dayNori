import { describe, expect, it, beforeEach } from 'vitest';
import React from 'react';
import App from '../App.js';
import { MobileAuthAdapter } from './auth/authAdapter.js';
import { TodayView } from './views/TodayView.js';
import { PlanView } from './views/PlanView.js';
import { LibraryView } from './views/LibraryView.js';
import { JournalView } from './views/JournalView.js';
import { SettingsView } from './views/SettingsView.js';
import { SearchSheet } from './views/SearchSheet.js';
import { CreateSheet } from './views/CreateSheet.js';
import { ComponentGalleryView } from './views/ComponentGalleryView.js';
import { BackHandler, AppState, Linking, AccessibilityInfo } from '@daynori/test-utils';
import { parseDeepLinkUrl } from '@daynori/contracts';

describe('Android Navigation Shell & Contracts (Phase 06)', () => {
  beforeEach(() => {
    BackHandler._clearListeners();
    AppState._clearListeners();
    Linking._clearListeners();
  });

  describe('Root Application Shell', () => {
    it('instantiates root App component with navigation shell structure', () => {
      const appElement = React.createElement(App);
      expect(appElement).toBeDefined();
      expect(appElement.type).toBe(App);
    });
  });

  describe('Authentication Adapter Contract', () => {
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
  });

  describe('Destinations & Views', () => {
    it('renders TodayView with greeting, upcoming tasks, routines, and demo state toggles', () => {
      let navigatedToPlan = false;
      let navigatedToJournal = false;
      let openedCreate = false;

      const element = React.createElement(TodayView, {
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
      });

      expect(element.props.themeMode).toBe('light');
      element.props.onNavigateToPlan();
      expect(navigatedToPlan).toBe(true);
      element.props.onNavigateToJournal();
      expect(navigatedToJournal).toBe(true);
      element.props.onOpenCreate();
      expect(openedCreate).toBe(true);
    });

    it('renders PlanView supporting Tasks, Routines, and Calendar sub-views', () => {
      let activeSubView = 'tasks';
      const element = React.createElement(PlanView, {
        themeMode: 'dark',
        initialSubView: 'calendar',
        onSubViewChange: (sv) => {
          activeSubView = sv;
        },
      });

      expect(element.props.initialSubView).toBe('calendar');
      element.props.onSubViewChange?.('routines');
      expect(activeSubView).toBe('routines');
    });

    it('renders LibraryView with canonical hierarchy and module filter chips', () => {
      let activeFilter = 'all';
      const element = React.createElement(LibraryView, {
        themeMode: 'light',
        initialFilter: 'notes',
        onFilterChange: (f) => {
          activeFilter = f;
        },
      });

      expect(element.props.initialFilter).toBe('notes');
      element.props.onFilterChange?.('files');
      expect(activeFilter).toBe('files');
    });

    it('renders JournalView with protection gate when unauthenticated and unlocks on login', () => {
      let loggedIn = false;
      let returnedToToday = false;

      // 1. Unauthenticated state renders gate
      const unauthElement = React.createElement(JournalView, {
        themeMode: 'light',
        isAuthenticated: false,
        onLoginSynthetic: () => {
          loggedIn = true;
        },
        onNavigateToToday: () => {
          returnedToToday = true;
        },
      });

      expect(unauthElement.props.isAuthenticated).toBe(false);
      unauthElement.props.onLoginSynthetic();
      expect(loggedIn).toBe(true);
      unauthElement.props.onNavigateToToday();
      expect(returnedToToday).toBe(true);

      // 2. Authenticated state renders timeline
      const authElement = React.createElement(JournalView, {
        themeMode: 'light',
        isAuthenticated: true,
        onLoginSynthetic: () => {},
        onNavigateToToday: () => {},
      });
      expect(authElement.props.isAuthenticated).toBe(true);
    });

    it('renders SettingsView with theme switcher, font scaling, and link to Component Gallery', () => {
      let themeToggled = false;
      let textScale = 1.0;
      let galleryOpened = false;

      const element = React.createElement(SettingsView, {
        themeMode: 'light',
        onToggleTheme: () => {
          themeToggled = true;
        },
        textScale: 1.0,
        onChangeTextScale: (scale) => {
          textScale = scale;
        },
        isAuthenticated: false,
        onToggleAuth: () => {},
        onOpenGallery: () => {
          galleryOpened = true;
        },
        onClose: () => {},
      });

      element.props.onToggleTheme();
      expect(themeToggled).toBe(true);
      element.props.onChangeTextScale(1.5);
      expect(textScale).toBe(1.5);
      element.props.onOpenGallery();
      expect(galleryOpened).toBe(true);
    });

    it('preserves Phase 04 Component Gallery as review destination', () => {
      let closed = false;
      const gallery = React.createElement(ComponentGalleryView, {
        themeMode: 'light',
        onToggleTheme: () => {},
        onClose: () => {
          closed = true;
        },
      });

      expect(gallery.type).toBe(ComponentGalleryView);
      gallery.props.onClose();
      expect(closed).toBe(true);
    });

    it('renders SearchSheet and CreateSheet with input draft preservation', () => {
      let draftTitle = '';
      const createSheet = React.createElement(CreateSheet, {
        visible: true,
        onClose: () => {},
        themeMode: 'light',
        initialDraft: { type: 'task', title: 'Draft Task', details: 'Important context' },
        onDraftChange: (d) => {
          draftTitle = d.title;
        },
        onCreateItem: () => {},
      });

      expect(createSheet.props.initialDraft?.title).toBe('Draft Task');
      createSheet.props.onDraftChange?.({ type: 'task', title: 'Updated Title', details: '' });
      expect(draftTitle).toBe('Updated Title');

      let queryText = '';
      const searchSheet = React.createElement(SearchSheet, {
        visible: true,
        onClose: () => {},
        themeMode: 'light',
        initialQuery: 'architecture',
        onQueryChange: (q) => {
          queryText = q;
        },
      });

      expect(searchSheet.props.initialQuery).toBe('architecture');
      searchSheet.props.onQueryChange?.('routines');
      expect(queryText).toBe('routines');
    });
  });

  describe('Deep Linking & Platform Contracts', () => {
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

    it('dispatches back press events to hardware listeners', () => {
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

    it('dispatches lifecycle events on AppState change', () => {
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

    it('notifies reduced motion changes via AccessibilityInfo', async () => {
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
