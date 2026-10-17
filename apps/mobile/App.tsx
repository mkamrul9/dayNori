import { useEffect, useRef, useState } from 'react';
import {
  AppState,
  BackHandler,
  Linking,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { colors, type ThemeMode } from '@daynori/design-tokens';
import { MobileHeader, MobileNavigationBar, type MobileTab } from '@daynori/ui-mobile';
import { parseDeepLinkUrl, type DeepLinkPayload } from '@daynori/contracts';

import { defaultAuthAdapter } from './src/auth/authAdapter';
import { MobileKeyManager } from './src/data/keyManager.js';
import { SqliteLocalRepository } from './src/data/sqliteRepository.js';
import { createMobileSyncEngine } from './src/data/syncAdapter.js';
import { defaultSecureStorage } from './src/auth/secureStorage.js';
import { createApiClient, type DaynoriApiClient } from '@daynori/api-client';
import type { SyncEngine } from '@daynori/sync';
import { MobileOfflineFileCache } from './src/data/offlineFileCache.js';
import { ExpoFileSystemOfflineStorageAdapter } from './src/data/expoFileSystemStorageAdapter.js';

MobileOfflineFileCache.setAdapter(new ExpoFileSystemOfflineStorageAdapter());
import type { ActiveModal, CreateDraft, LibraryFilter, PlanSubView } from './src/navigation/types';
import { TodayView } from './src/views/TodayView';
import { PlanView } from './src/views/PlanView';
import { LibraryView } from './src/views/LibraryView';
import { JournalView } from './src/views/JournalView';
import { SettingsView } from './src/views/SettingsView';
import { SearchSheet } from './src/views/SearchSheet';
import { CreateSheet } from './src/views/CreateSheet';
import { ComponentGalleryView } from './src/views/ComponentGalleryView';

export default function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [textScale, setTextScale] = useState<number>(1.0);
  const [currentTab, setCurrentTab] = useState<MobileTab>('today');
  const [planSubView, setPlanSubView] = useState<PlanSubView>('tasks');
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>('all');
  const [activeModal, setActiveModal] = useState<ActiveModal>('none');

  // Production encrypted repository and sync engine state
  const [repository, setRepository] = useState<SqliteLocalRepository | null>(null);
  const [syncEngine, setSyncEngine] = useState<SyncEngine | null>(null);
  const [apiClient, setApiClient] = useState<DaynoriApiClient | null>(null);
  const [userNamespace, setUserNamespace] = useState<{
    userId: string;
    workspaceId: string;
  } | null>(null);
  const [isOnline] = useState<boolean>(true);

  // Input draft preservation across shell navigation
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [createDraft, setCreateDraft] = useState<CreateDraft>({
    type: 'task',
    title: '',
    details: '',
  });

  // Authentication adapter state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    defaultAuthAdapter.isAuthenticated()
  );
  const [pendingProtectedDest, setPendingProtectedDest] = useState<string | null>(null);

  // Link deduplication timestamp
  const lastLinkRef = useRef<{ url: string; time: number } | null>(null);

  const palette = colors[themeMode];

  // 1. Subscribe to Auth Adapter changes
  useEffect(() => {
    const unsubscribe = defaultAuthAdapter.subscribe(() => {
      const auth = defaultAuthAdapter.isAuthenticated();
      setIsAuthenticated(auth);
      // If user became authenticated and there was a pending destination, resolve it
      if (auth && pendingProtectedDest) {
        if (pendingProtectedDest === 'journal') {
          setCurrentTab('journal');
        } else if (pendingProtectedDest === 'library') {
          setCurrentTab('library');
        }
        setPendingProtectedDest(null);
      }
    });
    return unsubscribe;
  }, [pendingProtectedDest]);

  // Production Storage & Sync Engine Lifecycle
  useEffect(() => {
    let isCancelled = false;

    async function initMobileStorage() {
      if (!isAuthenticated) {
        if (syncEngine) {
          void syncEngine.stop();
          setSyncEngine(null);
        }
        if (repository) {
          void repository.close();
          setRepository(null);
        }
        setApiClient(null);
        setUserNamespace(null);
        return;
      }

      const currentUser = defaultAuthAdapter.getCurrentUser();
      if (!currentUser?.id || !currentUser?.workspaceId) {
        setApiClient(null);
        setUserNamespace(null);
        return;
      }

      setUserNamespace({ userId: currentUser.id, workspaceId: currentUser.workspaceId });

      try {
        const keyManager = new MobileKeyManager(defaultSecureStorage);
        const repo = new SqliteLocalRepository({ keyManager });
        await repo.initialize({
          userId: currentUser.id,
          workspaceId: currentUser.workspaceId,
        });

        if (isCancelled) {
          await repo.close();
          return;
        }

        setRepository(repo);

        const client = createApiClient({
          baseUrl: 'http://localhost:3000',
        });
        setApiClient(client);

        const engine = createMobileSyncEngine({
          repository: repo,
          apiClient: client,
          namespace: { userId: currentUser.id, workspaceId: currentUser.workspaceId },
          secureStore: defaultSecureStorage,
        });

        if (isCancelled) {
          await repo.close();
          return;
        }

        setSyncEngine(engine);
        await engine.start();
      } catch {
        /* storage initialization error handled gracefully */
      }
    }

    void initMobileStorage();

    return () => {
      isCancelled = true;
    };
  }, [isAuthenticated]);

  // 2. Android Hardware Back Handling
  useEffect(() => {
    const onHardwareBack = (): boolean => {
      // 1. If any modal sheet is open, dismiss it
      if (activeModal !== 'none') {
        setActiveModal('none');
        return true; // handled
      }

      // 2. If in Plan sub-view other than default 'tasks', return to 'tasks'
      if (currentTab === 'plan' && planSubView !== 'tasks') {
        setPlanSubView('tasks');
        return true;
      }

      // 3. If in Library with a specific filter active, reset filter to 'all'
      if (currentTab === 'library' && libraryFilter !== 'all') {
        setLibraryFilter('all');
        return true;
      }

      // 4. If on any tab other than Today, navigate back to Today tab
      if (currentTab !== 'today') {
        setCurrentTab('today');
        return true;
      }

      // 5. On Today dashboard with no modals, allow default system exit
      return false;
    };

    const backSubscription = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => {
      if (backSubscription && typeof backSubscription.remove === 'function') {
        backSubscription.remove();
      } else {
        BackHandler.removeEventListener('hardwareBackPress', onHardwareBack);
      }
    };
  }, [activeModal, currentTab, planSubView, libraryFilter]);

  // 3. App Resume / Background Lifecycle Handling
  useEffect(() => {
    const appStateSubscription = AppState.addEventListener('change', (_nextState) => {
      // Retain active tab, modal state, and input drafts upon resume
    });
    return () => {
      if (appStateSubscription && typeof appStateSubscription.remove === 'function') {
        appStateSubscription.remove();
      }
    };
  }, []);

  // 4. Cold-Start and Warm-Start Deep-Linking
  useEffect(() => {
    const handleDeepLink = (url: string) => {
      if (!url) return;

      // Deduplication: prevent repeated navigation if same payload received within 5 seconds
      const now = Date.now();
      if (
        lastLinkRef.current &&
        lastLinkRef.current.url === url &&
        now - lastLinkRef.current.time < 5000
      ) {
        return;
      }
      lastLinkRef.current = { url, time: now };

      const parseResult = parseDeepLinkUrl(url);
      if (!parseResult.success || !parseResult.payload) {
        return;
      }

      const payload: DeepLinkPayload = parseResult.payload;

      if (payload.type === 'notification') {
        const dest = payload.destination;
        if (dest === 'today') {
          setCurrentTab('today');
          setActiveModal('none');
        } else if (dest === 'plan') {
          setCurrentTab('plan');
          setPlanSubView('tasks');
          setActiveModal('none');
        } else if (dest === 'plan/calendar') {
          setCurrentTab('plan');
          setPlanSubView('calendar');
          setActiveModal('none');
        } else if (dest === 'plan/routines') {
          setCurrentTab('plan');
          setPlanSubView('routines');
          setActiveModal('none');
        } else if (dest === 'library' || dest.startsWith('library/')) {
          setCurrentTab('library');
          setActiveModal('none');
        } else if (dest === 'journal') {
          // Protected route
          if (!defaultAuthAdapter.isAuthenticated()) {
            setPendingProtectedDest('journal');
          }
          setCurrentTab('journal');
          setActiveModal('none');
        } else if (dest === 'settings') {
          setActiveModal('settings');
        } else if (dest === 'review') {
          setActiveModal('gallery');
        }
      } else if (payload.type === 'file') {
        setCurrentTab('library');
        setLibraryFilter('files');
        setActiveModal('none');
      } else if (payload.type === 'auth') {
        void defaultAuthAdapter.handleDeepLink(url).then((res) => {
          if (res.success) {
            setIsAuthenticated(true);
            if (pendingProtectedDest) {
              if (pendingProtectedDest === 'journal') {
                setCurrentTab('journal');
              } else if (pendingProtectedDest === 'library') {
                setCurrentTab('library');
              }
              setPendingProtectedDest(null);
            }
          }
        });
        setActiveModal('none');
      }
    };

    // Restore persistent session from OS-backed secure storage
    void defaultAuthAdapter.restoreSession().then((restored) => {
      if (restored) {
        setIsAuthenticated(true);
      }
    });

    // Cold-start link
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });

    // Warm-start link
    const linkingSubscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    return () => {
      if (linkingSubscription && typeof linkingSubscription.remove === 'function') {
        linkingSubscription.remove();
      }
    };
  }, []);

  // Contextual Header Subtitle
  const getHeaderInfo = () => {
    switch (currentTab) {
      case 'today':
        return { title: 'Today', subtitle: 'Wednesday, Oct 14 • Overview' };
      case 'plan':
        return { title: 'Plan', subtitle: 'Tasks, Routines, and Calendar' };
      case 'library':
        return { title: 'Library', subtitle: 'Workspace folders and files' };
      case 'journal':
        return { title: 'Journal', subtitle: 'Private thoughts and reflection' };
    }
  };

  const headerInfo = getHeaderInfo();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]}>
      <StatusBar
        barStyle={themeMode === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={palette.surface}
      />

      {/* Main Top Header */}
      <MobileHeader
        title={headerInfo.title}
        subtitle={headerInfo.subtitle}
        themeMode={themeMode}
        onOpenSearch={() => setActiveModal('search')}
        onOpenCreate={() => setActiveModal('create')}
        onOpenSettings={() => setActiveModal('settings')}
      />

      {/* Main Content Area */}
      <View style={styles.contentArea}>
        {currentTab === 'today' && (
          <TodayView
            themeMode={themeMode}
            onNavigateToPlan={() => setCurrentTab('plan')}
            onNavigateToJournal={() => setCurrentTab('journal')}
            onOpenCreate={() => setActiveModal('create')}
            repository={repository ?? undefined}
            syncEngine={syncEngine ?? undefined}
            workspaceId={userNamespace?.workspaceId ?? null}
            userId={userNamespace?.userId ?? null}
            isOnline={isOnline}
          />
        )}

        {currentTab === 'plan' && (
          <PlanView
            themeMode={themeMode}
            initialSubView={planSubView}
            onSubViewChange={setPlanSubView}
            repository={repository ?? undefined}
            syncEngine={syncEngine ?? undefined}
            workspaceId={userNamespace?.workspaceId ?? null}
            userId={userNamespace?.userId ?? null}
            isOnline={isOnline}
          />
        )}

        {currentTab === 'library' && (
          <LibraryView
            themeMode={themeMode}
            initialFilter={libraryFilter}
            onFilterChange={setLibraryFilter}
            onOpenCreate={() => setActiveModal('create')}
            repository={repository ?? undefined}
            syncEngine={syncEngine ?? undefined}
            workspaceId={userNamespace?.workspaceId ?? null}
            userId={userNamespace?.userId ?? null}
            isOnline={isOnline}
            apiClient={apiClient ?? undefined}
          />
        )}

        {currentTab === 'journal' && (
          <JournalView
            themeMode={themeMode}
            isAuthenticated={isAuthenticated}
            onLoginSynthetic={() => defaultAuthAdapter.loginSynthetic()}
            onNavigateToToday={() => setCurrentTab('today')}
            repository={repository ?? undefined}
            syncEngine={syncEngine ?? undefined}
            workspaceId={userNamespace?.workspaceId ?? null}
            userId={userNamespace?.userId ?? null}
            isOnline={isOnline}
          />
        )}
      </View>

      {/* Bottom Organizer Navigation Bar */}
      <MobileNavigationBar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        themeMode={themeMode}
      />

      {/* Search Sheet */}
      <SearchSheet
        visible={activeModal === 'search'}
        onClose={() => setActiveModal('none')}
        themeMode={themeMode}
        initialQuery={searchQuery}
        onQueryChange={setSearchQuery}
      />

      {/* Create Sheet */}
      <CreateSheet
        visible={activeModal === 'create'}
        onClose={() => setActiveModal('none')}
        themeMode={themeMode}
        initialDraft={createDraft}
        onDraftChange={setCreateDraft}
        onCreateItem={() => {}}
      />

      {/* Settings Modal */}
      {activeModal === 'settings' && (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: palette.background, zIndex: 100 }]}
        >
          <SettingsView
            themeMode={themeMode}
            onToggleTheme={() => setThemeMode((m) => (m === 'light' ? 'dark' : 'light'))}
            textScale={textScale}
            onChangeTextScale={setTextScale}
            isAuthenticated={isAuthenticated}
            onToggleAuth={() => {
              if (isAuthenticated) {
                if (userNamespace?.userId) {
                  void MobileOfflineFileCache.clearAccount(userNamespace.userId).catch(() => {});
                }
                if (userNamespace?.workspaceId) {
                  void MobileOfflineFileCache.clearWorkspace(userNamespace.workspaceId).catch(
                    () => {}
                  );
                }
                void defaultAuthAdapter.signOut({ createDraft, searchQuery });
                setCreateDraft({ type: 'task', title: '', details: '' });
                setSearchQuery('');
                if (currentTab === 'journal') {
                  setCurrentTab('today');
                }
              } else {
                defaultAuthAdapter.loginSynthetic();
              }
            }}
            onOpenGallery={() => setActiveModal('gallery')}
            onClose={() => setActiveModal('none')}
          />
        </View>
      )}

      {/* Component Gallery Modal (Phase 04 Review Destination) */}
      {activeModal === 'gallery' && (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: palette.background, zIndex: 101 }]}
        >
          <ComponentGalleryView
            themeMode={themeMode}
            onToggleTheme={() => setThemeMode((m) => (m === 'light' ? 'dark' : 'light'))}
            onClose={() => setActiveModal('settings')}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentArea: {
    flex: 1,
  },
});
