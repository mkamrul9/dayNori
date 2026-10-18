import { useEffect, useRef, useState } from 'react';
import {
  AppState,
  BackHandler,
  Linking,
  SafeAreaView,
  Share,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { colors, type ThemeMode } from '@daynori/design-tokens';
import {
  MobileHeader,
  MobileNavigationBar,
  MobileSyncDiagnosticsSheet,
  MobileRecoveryExportSheet,
  MobileConflictReviewSheet,
  MobileWorkspacePortabilitySheet,
  MobileAccountDeletionSheet,
  type MobileExportActionResult,
  type MobileTab,
} from '@daynori/ui-mobile';
import { parseDeepLinkUrl, type DeepLinkPayload } from '@daynori/contracts';

import { defaultAuthAdapter } from './src/auth/authAdapter';
import { MobileKeyManager } from './src/data/keyManager.js';
import { SqliteLocalRepository } from './src/data/sqliteRepository.js';
import { createMobileSyncEngine } from './src/data/syncAdapter.js';
import { defaultSecureStorage } from './src/auth/secureStorage.js';
import { createApiClient, type DaynoriApiClient } from '@daynori/api-client';
import type { SyncEngine, ConflictRecord, FileRecord } from '@daynori/sync';
import {
  exportRecoveryData,
  getRedactedSyncDiagnostics,
  type RedactedSyncDiagnostics,
  type RecoveryExport,
} from '@daynori/sync';
import { MobileOfflineFileCache } from './src/data/offlineFileCache.js';
import { ExpoFileSystemOfflineStorageAdapter } from './src/data/expoFileSystemStorageAdapter.js';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

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
import { OnboardingSheet } from './src/views/OnboardingSheet';
import {
  setupForegroundNotificationHandler,
  setupNotificationChannelsAsync,
  initNotificationResponseListener,
  getNotificationCapabilityAsync,
  requestNotificationPermissionAsync,
  registerDeviceAsync,
  deactivateDeviceAsync,
  setupPushTokenRotationListener,
  resetNotificationResponseState,
  type NotificationCapabilityState,
} from './src/notifications/adapter.js';
import { defaultScheduleCoordinator } from './src/notifications/coordinator.js';

export default function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [textScale, setTextScale] = useState<number>(1.0);
  const [currentTab, setCurrentTab] = useState<MobileTab>('today');
  const [planSubView, setPlanSubView] = useState<PlanSubView>('tasks');
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>('all');
  const [activeModal, setActiveModal] = useState<ActiveModal>('none');
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [notificationCapability, setNotificationCapability] =
    useState<NotificationCapabilityState | null>(null);

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

  // Canonical result navigation targets from SearchSheet
  const [targetLibraryItemId, setTargetLibraryItemId] = useState<string | null>(null);
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null);
  const [targetTaskId, setTargetTaskId] = useState<string | null>(null);
  const [targetJournalEntryId, setTargetJournalEntryId] = useState<string | null>(null);
  const [targetJournalDate, setTargetJournalDate] = useState<string | null>(null);

  const palette = colors[themeMode];

  // Sync Diagnostics, Recovery Export, and Conflict Review state (Phase 34)
  const [syncDiagnostics, setSyncDiagnostics] = useState<RedactedSyncDiagnostics | null>(null);
  const [recoveryExport, setRecoveryExport] = useState<RecoveryExport | null>(null);
  const [activeConflict, setActiveConflict] = useState<ConflictRecord | null>(null);
  const sessionGenRef = useRef(0);

  // Reset diagnostics and recovery export on session / workspace change
  useEffect(() => {
    sessionGenRef.current += 1;
    setSyncDiagnostics(null);
    setRecoveryExport(null);
    setActiveConflict(null);
  }, [userNamespace?.userId, userNamespace?.workspaceId]);

  // Listen for conflict_detected from active sync engine
  useEffect(() => {
    if (!syncEngine) return;
    const unsub = syncEngine.onEvent((evt) => {
      if (evt.type === 'conflict_detected') {
        setActiveConflict(evt.conflict);
      } else if (evt.type === 'conflict_resolved') {
        setActiveConflict((prev) => (prev?.id === evt.conflictId ? null : prev));
      }
    });
    return () => {
      unsub();
    };
  }, [syncEngine]);

  const loadDiagnostics = async () => {
    if (!syncEngine || !userNamespace) return;
    const gen = sessionGenRef.current;
    try {
      const diag = await syncEngine.getDiagnostics();
      if (sessionGenRef.current === gen) {
        setSyncDiagnostics(getRedactedSyncDiagnostics(diag));
      }
    } catch {
      // fallback
    }
  };

  const loadRecoveryExport = async () => {
    if (!repository || !userNamespace) return;
    const gen = sessionGenRef.current;
    try {
      const exportData = await exportRecoveryData({
        repository,
        workspaceId: userNamespace.workspaceId,
        userId: userNamespace.userId,
        deviceId: 'android-device',
        checkAttachmentCached: (f: FileRecord) =>
          MobileOfflineFileCache.hasBinary(
            userNamespace.userId,
            userNamespace.workspaceId,
            f.id,
            Number(f.version) || 1
          ),
      });
      if (sessionGenRef.current === gen) {
        setRecoveryExport(exportData);
      }
    } catch {
      // fallback
    }
  };

  const handleShareOrCopyRecovery = async (
    jsonString: string,
    _actionType: 'copy' | 'share' = 'share'
  ): Promise<MobileExportActionResult> => {
    try {
      const shareResult = await Share.share({
        title: 'Daynori Recovery Export',
        message: jsonString,
      });
      if (shareResult.action === Share.sharedAction) {
        return { status: 'success' };
      } else if (shareResult.action === Share.dismissedAction) {
        return { status: 'cancelled' };
      }
      return { status: 'success' };
    } catch (err: unknown) {
      return {
        status: 'failure',
        error: err instanceof Error ? err.message : 'Share failed',
      };
    }
  };

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
        await defaultScheduleCoordinator.initialize(currentUser.id, currentUser.workspaceId);
        void registerDeviceAsync(client);
        setupPushTokenRotationListener(client);

        // Initial reconciliation of upcoming reminders
        void client
          .listReminderInstances(currentUser.workspaceId)
          .then((res) => {
            if (res?.data) {
              void defaultScheduleCoordinator.reconcileInstances(client, res.data);
            }
          })
          .catch(() => {});
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
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      // Reconcile reminders and local alerts upon resume
      if (nextState === 'active' && apiClient && userNamespace?.workspaceId) {
        void apiClient
          .listReminderInstances(userNamespace.workspaceId)
          .then((res) => {
            if (res?.data) {
              void defaultScheduleCoordinator.reconcileInstances(apiClient, res.data);
            }
          })
          .catch(() => {});
      }
    });
    return () => {
      if (appStateSubscription && typeof appStateSubscription.remove === 'function') {
        appStateSubscription.remove();
      }
    };
  }, [apiClient, userNamespace?.workspaceId]);

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

    // 5. Initialize Notification Lifecycle & Channels (Phase 28)
    setupForegroundNotificationHandler();
    void setupNotificationChannelsAsync();
    void getNotificationCapabilityAsync().then(setNotificationCapability);

    const cleanupNotifications = initNotificationResponseListener(async (payload) => {
      // 1. Authenticated workspace and account check
      const currentAuth = defaultAuthAdapter.isAuthenticated();
      const currentUser = defaultAuthAdapter.getCurrentUser();

      if (!currentAuth || !currentUser) {
        setPendingProtectedDest(payload.destination);
        return;
      }

      if (
        payload.workspaceId &&
        currentUser.workspaceId &&
        payload.workspaceId !== currentUser.workspaceId
      ) {
        // Prevent cross-workspace navigation
        return;
      }

      // 2. Reauthorize target and verify source record exists
      if (payload.itemId && repository && currentUser.workspaceId) {
        try {
          const header = await repository.getItemHeader(currentUser.workspaceId, payload.itemId);
          if (!header) {
            console.warn(`Reminder target item ${payload.itemId} not found or deleted.`);
          }
        } catch {
          // Fallback gracefully to destination tab navigation
        }
      }

      const dest = payload.destination;
      if (dest === 'today') {
        setCurrentTab('today');
        setActiveModal('none');
      } else if (dest === 'plan' || dest === 'plan/tasks') {
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
    });

    return () => {
      if (linkingSubscription && typeof linkingSubscription.remove === 'function') {
        linkingSubscription.remove();
      }
      cleanupNotifications();
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
            onNavigateToLibrary={(_folderId?: string) => {
              setCurrentTab('library');
            }}
            onOpenCreate={() => setActiveModal('create')}
            onTriggerOnboarding={() => setActiveModal('onboarding')}
            repository={repository ?? undefined}
            syncEngine={syncEngine ?? undefined}
            apiClient={apiClient ?? undefined}
            workspaceId={userNamespace?.workspaceId ?? null}
            userId={userNamespace?.userId ?? null}
            isOnline={isOnline}
            refreshTrigger={refreshTrigger}
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
            targetTaskId={targetTaskId}
            onClearTarget={() => setTargetTaskId(null)}
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
            targetItemId={targetLibraryItemId}
            targetFolderId={targetFolderId}
            onClearTarget={() => {
              setTargetLibraryItemId(null);
              setTargetFolderId(null);
            }}
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
            targetEntryId={targetJournalEntryId}
            targetDate={targetJournalDate}
            onClearTarget={() => {
              setTargetJournalEntryId(null);
              setTargetJournalDate(null);
            }}
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
        workspaceId={userNamespace?.workspaceId}
        userId={userNamespace?.userId}
        apiClient={apiClient ?? undefined}
        localRepository={repository ?? undefined}
        onSelectItem={(item) => {
          setActiveModal('none');
          if (item.displayType === 'note' || item.displayType === 'knowledge') {
            setCurrentTab('library');
            setTargetLibraryItemId(item.id);
          } else if (item.displayType === 'file') {
            setCurrentTab('library');
            setLibraryFilter('files');
            setTargetLibraryItemId(item.id);
          } else if (item.displayType === 'folder') {
            setCurrentTab('library');
            setTargetFolderId(item.id);
          } else if (item.displayType === 'task') {
            setCurrentTab('plan');
            setPlanSubView('tasks');
            setTargetTaskId(item.id);
          } else if (item.displayType === 'journal') {
            setCurrentTab('journal');
            setTargetJournalEntryId(item.id);
            setTargetJournalDate((item.metadata?.entryDate as string) || null);
          }
        }}
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
                if (apiClient) {
                  void defaultScheduleCoordinator.cancelAll(apiClient);
                  void deactivateDeviceAsync(apiClient);
                }
                resetNotificationResponseState();
                setPendingProtectedDest(null);
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
            notificationCapability={notificationCapability}
            onRequestNotificationPermission={async () => {
              const cap = await requestNotificationPermissionAsync();
              setNotificationCapability(cap);
              if (apiClient && cap.status === 'granted') {
                void registerDeviceAsync(apiClient);
              }
            }}
            onOpenGallery={() => setActiveModal('gallery')}
            onOpenOnboarding={() => setActiveModal('onboarding-replay')}
            onOpenSyncDiagnostics={() => {
              void loadDiagnostics();
              setActiveModal('sync-diagnostics');
            }}
            onOpenRecoveryExport={() => {
              void loadRecoveryExport();
              setActiveModal('recovery-export');
            }}
            onOpenPortability={() => setActiveModal('workspace-portability')}
            onOpenAccountDeletion={() => setActiveModal('account-deletion')}
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

      {/* Onboarding Tutorial Sheet (Phase 31 First-Use Discovery) */}
      <OnboardingSheet
        visible={activeModal === 'onboarding' || activeModal === 'onboarding-replay'}
        onClose={() => setActiveModal('none')}
        themeMode={themeMode}
        apiClient={apiClient ?? undefined}
        repository={repository ?? undefined}
        workspaceId={userNamespace?.workspaceId ?? null}
        userId={userNamespace?.userId ?? null}
        isReplay={activeModal === 'onboarding-replay'}
        onComplete={() => {
          setActiveModal('none');
          setRefreshTrigger((prev) => prev + 1);
        }}
      />

      {/* Phase 34 Sync Diagnostics Sheet */}
      <MobileSyncDiagnosticsSheet
        visible={activeModal === 'sync-diagnostics'}
        onClose={() => setActiveModal('none')}
        diagnostics={syncDiagnostics}
        onRefresh={loadDiagnostics}
        onSyncNow={async () => {
          if (syncEngine) {
            await syncEngine.syncNow();
            await loadDiagnostics();
          }
        }}
        onOpenRecoveryExport={() => {
          void loadRecoveryExport();
          setActiveModal('recovery-export');
        }}
        themeMode={themeMode}
      />

      {/* Phase 34 Recovery Export Sheet */}
      <MobileRecoveryExportSheet
        visible={activeModal === 'recovery-export'}
        onClose={() => setActiveModal('none')}
        exportData={recoveryExport}
        onShareOrCopy={handleShareOrCopyRecovery}
        themeMode={themeMode}
      />

      {/* Phase 34 Conflict Review Sheet */}
      <MobileConflictReviewSheet
        visible={activeModal === 'conflict-review' && activeConflict !== null}
        onClose={() => setActiveModal('none')}
        conflict={activeConflict}
        onResolve={async (resolution, customPayload) => {
          if (syncEngine && activeConflict) {
            await syncEngine.resolveConflict(activeConflict.id, resolution, customPayload);
            setActiveConflict(null);
            setActiveModal('none');
            await loadDiagnostics();
          }
        }}
        themeMode={themeMode}
      />

      {/* Phase 35 Workspace Portability Sheet */}
      <MobileWorkspacePortabilitySheet
        visible={activeModal === 'workspace-portability'}
        onClose={() => setActiveModal('none')}
        workspaceId={userNamespace?.workspaceId ?? ''}
        themeMode={themeMode}
        onExportWorkspace={async (password) => {
          if (!apiClient || !userNamespace) throw new Error('Client or workspace not available');
          const reauthRes = await apiClient.reauthenticate({
            purpose: 'protected_export',
            password,
            sessionBinding: userNamespace.workspaceId,
          });
          return await apiClient.createWorkspaceExport(userNamespace.workspaceId, {
            reauthToken: reauthRes.reauthToken,
            includeAttachments: true,
          });
        }}
        onPreviewImport={async (archiveBase64) => {
          if (!apiClient || !userNamespace) throw new Error('Client or workspace not available');
          return await apiClient.previewWorkspaceImport(userNamespace.workspaceId, {
            archiveBase64,
          });
        }}
        onExecuteImport={async (previewId, strategy) => {
          if (!apiClient || !userNamespace) throw new Error('Client or workspace not available');
          return await apiClient.executeWorkspaceImport(userNamespace.workspaceId, {
            previewId,
            duplicateStrategy: strategy,
          });
        }}
        onPickArchive={async () => {
          try {
            const res = await DocumentPicker.getDocumentAsync({
              copyToCacheDirectory: true,
              type: [
                'application/zip',
                'application/x-zip-compressed',
                'application/octet-stream',
                '*/*',
              ],
            });
            if (res.canceled || !res.assets || res.assets.length === 0) {
              return null;
            }
            const asset = res.assets[0];
            if (!asset) return null;
            const base64Data = await FileSystem.readAsStringAsync(asset.uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            return { name: asset.name, base64: base64Data };
          } catch (err) {
            console.error('Failed to pick document archive:', err);
            return null;
          }
        }}
        onDownloadExport={async (downloadUrl: string) => {
          try {
            const targetPath = `${FileSystem.documentDirectory}daynori-export-${Date.now()}.zip`;
            const fullUrl = downloadUrl.startsWith('http') ? downloadUrl : downloadUrl;
            const result = await FileSystem.downloadAsync(fullUrl, targetPath);
            if (result.status === 200) {
              await Share.share({
                title: 'Daynori Export',
                message: `Export saved to ${result.uri}`,
                url: result.uri,
              });
            }
          } catch (err) {
            console.error('Failed to download export:', err);
          }
        }}
      />

      {/* Phase 36 Account Deletion Sheet */}
      <MobileAccountDeletionSheet
        visible={activeModal === 'account-deletion'}
        onClose={() => setActiveModal('none')}
        themeMode={themeMode}
        userEmail={defaultAuthAdapter.getCurrentUser()?.email ?? undefined}
        onRequestDeletion={async (password) => {
          if (!apiClient) throw new Error('API client not available');
          return await apiClient.requestAccountDeletion({ password });
        }}
        onConfirmDeletion={async (confirmationToken) => {
          if (!apiClient) throw new Error('API client not available');
          return await apiClient.confirmAccountDeletion({ confirmationToken });
        }}
        onSuccess={() => {
          setActiveModal('none');
          void defaultAuthAdapter.signOut({ createDraft, searchQuery });
        }}
      />
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
