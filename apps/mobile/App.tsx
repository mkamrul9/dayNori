import { useEffect, useRef, useState } from 'react';
import {
  AppState,
  BackHandler,
  Linking,
  PixelRatio,
  Platform,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, type ThemeMode } from '@daynori/design-tokens';
import {
  androidStatusBarTopPad,
  MobileHeader,
  MobileNavigationBar,
  MobileSyncDiagnosticsSheet,
  MobileRecoveryExportSheet,
  MobileConflictReviewSheet,
  MobileWorkspacePortabilitySheet,
  MobileAccountDeletionSheet,
  MobileAudioRecorderSheet,
  type MobileExportActionResult,
  type MobileTab,
} from '@daynori/ui-mobile';
import { parseDeepLinkUrl, type DeepLinkPayload } from '@daynori/contracts';

import { defaultAuthAdapter } from './src/auth/authAdapter';
import { MobileKeyManager } from './src/data/keyManager.js';
import { SqliteLocalRepository } from './src/data/sqliteRepository.js';
import { createMobileSyncEngine, getOrCreateMobileDeviceId } from './src/data/syncAdapter.js';
import { defaultSecureStorage } from './src/auth/secureStorage.js';
import type { DaynoriApiClient } from '@daynori/api-client';
import { createMobileApiClient } from './src/data/mobileApiClient.js';
import { saveQuickCapture } from './src/data/quickCapture.js';
import type { SyncEngine, ConflictRecord, FileRecord } from '@daynori/sync';
import {
  exportRecoveryData,
  getRedactedSyncDiagnostics,
  type RedactedSyncDiagnostics,
  type RecoveryExport,
} from '@daynori/sync';
import {
  MobileOfflineFileCache,
  base64ToArrayBuffer,
  computeMobileBufferSha256,
} from './src/data/offlineFileCache.js';
import { ExpoFileSystemOfflineStorageAdapter } from './src/data/expoFileSystemStorageAdapter.js';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { ExpoAudioRecorderAdapter } from './src/audio/audioAdapter.js';

MobileOfflineFileCache.setAdapter(new ExpoFileSystemOfflineStorageAdapter());
import type { ActiveModal, CreateDraft, LibraryFilter, PlanSubView } from './src/navigation/types';
import { TodayView } from './src/views/TodayView';
import { PlanView } from './src/views/PlanView';
import { LibraryView } from './src/views/LibraryView';
import { JournalView } from './src/views/JournalView';
import { SettingsView } from './src/views/SettingsView';
import { SettingsHubView } from './src/views/SettingsHubView';
import {
  SETTINGS_NESTED_MODALS,
  type MobileSettingsGroupId,
} from './src/settings/settingsGroups.js';
import { AccountSheet } from './src/views/AccountSheet.js';
import { SearchSheet } from './src/views/SearchSheet';
import { CreateSheet } from './src/views/CreateSheet';
import { ComponentGalleryView } from './src/views/ComponentGalleryView';
import { AllFeaturesSheet } from './src/views/AllFeaturesSheet';
import { OnboardingSheet } from './src/views/OnboardingSheet';
import { ExpensesView } from './src/views/ExpensesView';
import { CustomSectionsView } from './src/views/CustomSectionsView';
import { VaultHarnessView } from './src/vault/VaultHarnessView';
import { DriveConnectionsSheet } from './src/views/DriveConnectionsSheet';
import { RoomsSheet } from './src/views/RoomsSheet';
import { AssistantSheet } from './src/views/AssistantSheet';
import { BillingSheet } from './src/views/BillingSheet';
import {
  generateUuid,
  getDefaultFeaturePersonalization,
  isPlatformOperator,
  listPrimaryShellTabs,
  sanitizeAndMigrateFeaturePersonalization,
  type FeatureAuthContext,
  type FeaturePersonalization,
  type FeatureReleaseContext,
} from '@daynori/domain';
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
import { isCorePreview, mobileOperatorUserIds } from './src/config/runtime.js';

export default function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [textScale, setTextScale] = useState<number>(() => {
    try {
      return Math.min(2, Math.max(1, PixelRatio.getFontScale()));
    } catch {
      return 1.0;
    }
  });
  const [currentTab, setCurrentTab] = useState<MobileTab>('today');
  const [planSubView, setPlanSubView] = useState<PlanSubView>('tasks');
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>('all');
  const [activeModal, setActiveModal] = useState<ActiveModal>('none');
  /** null = Settings hub; set when a focused group screen is open (Phase 71). */
  const [settingsGroup, setSettingsGroup] = useState<MobileSettingsGroupId | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [notificationCapability, setNotificationCapability] =
    useState<NotificationCapabilityState | null>(null);

  // Production encrypted repository and sync engine state
  const [repository, setRepository] = useState<SqliteLocalRepository | null>(null);
  const [syncEngine, setSyncEngine] = useState<SyncEngine | null>(null);
  const [apiClient, setApiClient] = useState<DaynoriApiClient | null>(null);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [userNamespace, setUserNamespace] = useState<{
    userId: string;
    workspaceId: string;
  } | null>(null);
  const [isOnline] = useState<boolean>(true);
  const audioRecorderAdapter = useRef(new ExpoAudioRecorderAdapter()).current;

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
  const [accountNamespaceKey, setAccountNamespaceKey] = useState('');
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
  const isOperator = isPlatformOperator(
    { userId: userNamespace?.userId },
    { DAYNORI_OPERATOR_USER_IDS: mobileOperatorUserIds }
  );
  const [featurePersonalization, setFeaturePersonalization] = useState(() =>
    getDefaultFeaturePersonalization()
  );
  const mobileRelease: FeatureReleaseContext = {
    platform: 'android',
    corePreview: isCorePreview,
    production: typeof __DEV__ !== 'undefined' ? !__DEV__ : true,
    moduleReleased: {
      vault: false,
      drive: false,
      rooms: false,
      billing: false,
      assistant: false,
    },
    capabilityKnown: true,
  };
  const mobileAuth: FeatureAuthContext = {
    authenticated: isAuthenticated,
    hasWorkspaceMembership: Boolean(userNamespace?.workspaceId),
    isPlatformOperator: isOperator,
    privilegeKnown: true,
  };
  const primaryShellTabs = listPrimaryShellTabs(mobileRelease, mobileAuth, featurePersonalization);
  const visiblePrimaryTabs = primaryShellTabs
    .map((t) => t.mobileDestination)
    .filter(
      (d): d is MobileTab => d === 'today' || d === 'plan' || d === 'library' || d === 'journal'
    );

  // Sync Diagnostics, Recovery Export, and Conflict Review state (Phase 34)
  const [syncDiagnostics, setSyncDiagnostics] = useState<RedactedSyncDiagnostics | null>(null);
  const [recoveryExport, setRecoveryExport] = useState<RecoveryExport | null>(null);
  const [activeConflict, setActiveConflict] = useState<ConflictRecord | null>(null);
  const sessionGenRef = useRef(0);
  const [expensesEnabled, setExpensesEnabled] = useState<boolean>(false);

  useEffect(() => {
    if (!userNamespace?.userId) {
      setFeaturePersonalization(getDefaultFeaturePersonalization());
      return;
    }
    const key = `daynori_expenses_enabled_${userNamespace.userId}`;
    defaultSecureStorage
      .getItemAsync(key)
      .then((val) => {
        if (val !== null) {
          setExpensesEnabled(val === 'true');
        }
      })
      .catch(() => {});
  }, [userNamespace?.userId]);

  useEffect(() => {
    if (currentTab === 'journal' && !visiblePrimaryTabs.includes('journal')) {
      setCurrentTab('today');
    }
  }, [currentTab, visiblePrimaryTabs]);

  const persistFeaturePersonalization = async (next: FeaturePersonalization) => {
    setFeaturePersonalization(next);
    if (!apiClient) return;
    try {
      await apiClient.updateUserPreferences({ preferences: { featurePersonalization: next } });
    } catch {
      // offline: local state retained until next successful sync
    }
  };

  const handleToggleExpensesEnabled = async (enabled: boolean) => {
    setExpensesEnabled(enabled);
    if (userNamespace?.userId) {
      const key = `daynori_expenses_enabled_${userNamespace.userId}`;
      await defaultSecureStorage.setItemAsync(key, String(enabled)).catch(() => {});
    }
    if (apiClient) {
      try {
        await apiClient.updateUserPreferences({ preferences: { expensesEnabled: enabled } });
      } catch {
        // offline fallback
      }
    }
  };

  // Reset diagnostics / personalization on session / workspace change (Phase 66 isolates accounts).
  useEffect(() => {
    sessionGenRef.current += 1;
    setSyncDiagnostics(null);
    setRecoveryExport(null);
    setActiveConflict(null);

    if (!apiClient || !userNamespace?.userId) {
      setFeaturePersonalization(getDefaultFeaturePersonalization());
      return;
    }
    const gen = sessionGenRef.current;
    const userId = userNamespace.userId;
    void apiClient
      .getUserPreferences()
      .then((profile) => {
        if (sessionGenRef.current !== gen || userNamespace.userId !== userId) return;
        const prefs = profile.data?.preferences as
          | { featurePersonalization?: unknown; homeLayout?: { moduleShortcuts?: unknown } }
          | undefined;
        setFeaturePersonalization(
          sanitizeAndMigrateFeaturePersonalization(
            prefs?.featurePersonalization ?? null,
            (prefs?.homeLayout?.moduleShortcuts as
              Array<{ id: string; visible: boolean; order: number }> | undefined) ?? null
          )
        );
      })
      .catch(() => {
        if (sessionGenRef.current === gen) {
          setFeaturePersonalization(getDefaultFeaturePersonalization());
        }
      });
  }, [apiClient, userNamespace?.userId, userNamespace?.workspaceId]);

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
      const deviceId = await getOrCreateMobileDeviceId(defaultSecureStorage);
      const exportData = await exportRecoveryData({
        repository,
        workspaceId: userNamespace.workspaceId,
        userId: userNamespace.userId,
        deviceId,
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
      const current = defaultAuthAdapter.getCurrentUser();
      setAccountNamespaceKey(current ? `${current.id}:${current.workspaceId ?? ''}` : '');
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

  // Production Storage & Sync Engine Lifecycle.
  // Serialize open/close: React Strict Mode remounts this effect and Expo SQLite shares
  // one native handle per DB name — overlapping close+initialize causes flaky failures.
  const storageGenerationRef = useRef(0);
  const storageQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const generation = ++storageGenerationRef.current;
    let openedRepository: SqliteLocalRepository | null = null;
    let openedEngine: SyncEngine | null = null;

    const runExclusive = (fn: () => Promise<void>) => {
      const next = storageQueueRef.current.then(fn, fn);
      storageQueueRef.current = next.then(
        () => undefined,
        () => undefined
      );
      return next;
    };

    void runExclusive(async () => {
      if (!isAuthenticated) {
        if (generation !== storageGenerationRef.current) return;
        setSyncEngine(null);
        setRepository(null);
        setApiClient(null);
        setUserNamespace(null);
        setStorageMessage(null);
        return;
      }

      const currentUser = defaultAuthAdapter.getCurrentUser();
      if (!currentUser?.id || !currentUser?.workspaceId) {
        if (generation !== storageGenerationRef.current) return;
        setApiClient(null);
        setUserNamespace(null);
        return;
      }

      if (generation !== storageGenerationRef.current) return;
      setRepository(null);
      setSyncEngine(null);
      setApiClient(null);
      setStorageMessage(null);
      setUserNamespace({ userId: currentUser.id, workspaceId: currentUser.workspaceId });

      try {
        const keyManager = new MobileKeyManager(defaultSecureStorage);
        const repo = new SqliteLocalRepository({ keyManager });
        openedRepository = repo;
        await repo.initialize({
          userId: currentUser.id,
          workspaceId: currentUser.workspaceId,
        });

        if (generation !== storageGenerationRef.current) {
          await repo.close();
          openedRepository = null;
          return;
        }

        setRepository(repo);

        const client = createMobileApiClient();
        setApiClient(client);

        const engine = createMobileSyncEngine({
          repository: repo,
          apiClient: client,
          namespace: { userId: currentUser.id, workspaceId: currentUser.workspaceId },
          secureStore: defaultSecureStorage,
        });
        openedEngine = engine;

        if (generation !== storageGenerationRef.current) {
          await engine.stop();
          await repo.close();
          openedEngine = null;
          openedRepository = null;
          return;
        }

        setSyncEngine(engine);
        await engine.start();
        await defaultScheduleCoordinator.initialize(currentUser.id, currentUser.workspaceId);
        void registerDeviceAsync(client);
        setupPushTokenRotationListener(client);

        void client
          .listReminderInstances(currentUser.workspaceId)
          .then((res) => {
            if (res?.data) {
              void defaultScheduleCoordinator.reconcileInstances(client, res.data);
            }
          })
          .catch(() => {});
      } catch (err) {
        if (generation === storageGenerationRef.current) {
          const raw = err instanceof Error ? err.message : String(err);
          const code =
            raw.match(
              /\b(NO_SECURE_RANDOM|KEY_NOT_FOUND|KEY_INVALIDATED_OR_MISMATCH|INVALID_KEY_FORMAT|SQLCIPHER_UNAVAILABLE|SECURE_STORE_[A-Z_]+|WORKSPACE_INDEX_FAILED|StorageUnavailableError|StorageKeyError)\b/
            )?.[1] ??
            (err instanceof Error ? err.name : 'unknown');
          const hint =
            /Failed to open encrypted database/i.test(raw) && !/KEY_|NO_SECURE|SQLCIPHER/i.test(code)
              ? raw.replace(/Failed to open encrypted database "[^"]+":\s*/i, '').slice(0, 120)
              : code;
          setStorageMessage(
            `Could not open your saved data (${hint}). Reopen the app to retry. Your data has not been cleared.`
          );
        }
      }
    });

    return () => {
      void runExclusive(async () => {
        if (generation !== storageGenerationRef.current) {
          // Successor effect owns the namespace; only close handles this generation opened.
        }
        try {
          await openedEngine?.stop();
        } catch {
          /* ignore */
        }
        try {
          await openedRepository?.close();
        } catch {
          console.warn('Could not close the prior account storage session.');
        }
      });
    };
  }, [isAuthenticated, accountNamespaceKey]);

  const openSettingsHub = () => {
    setSettingsGroup(null);
    setActiveModal('settings');
  };

  const returnToSettingsFromNested = () => {
    setActiveModal('settings');
  };

  // 2. Android hardware back + shared dismiss stack (iOS uses sheet Close / system gestures)
  // Priority: topmost overlay → Settings group → Settings hub → Plan/Library detail → Today → exit
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const onHardwareBack = (): boolean => {
      if (activeModal !== 'none' && activeModal !== 'settings') {
        if (SETTINGS_NESTED_MODALS.has(activeModal)) {
          setActiveModal('settings');
          return true;
        }
        setActiveModal('none');
        return true;
      }

      if (activeModal === 'settings') {
        if (settingsGroup !== null) {
          setSettingsGroup(null);
          return true;
        }
        setActiveModal('none');
        setSettingsGroup(null);
        return true;
      }

      if (currentTab === 'plan' && planSubView !== 'tasks') {
        setPlanSubView('tasks');
        return true;
      }

      if (currentTab === 'library' && libraryFilter !== 'all') {
        setLibraryFilter('all');
        return true;
      }

      if (currentTab !== 'today') {
        setCurrentTab('today');
        return true;
      }

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
  }, [activeModal, settingsGroup, currentTab, planSubView, libraryFilter]);

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
          openSettingsHub();
        } else if (dest === 'review') {
          // Phase 66: gallery is operator-only; deny ordinary deep links.
          setActiveModal('none');
        } else if (String(dest).includes('vault')) {
          // Production vault deep links remain closed while Phase 44/45 gates are unmet.
          // Do not open decrypted vault content from a notification/deep link.
          setActiveModal('none');
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
        openSettingsHub();
      } else if (dest === 'review') {
        // Phase 66: gallery is operator-only; deny ordinary notification deep links.
        setActiveModal('none');
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
        return {
          title: 'Today',
          subtitle: `${new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date())} • Overview`,
        };
      case 'plan':
        return { title: 'Plan', subtitle: 'Tasks, Routines, and Calendar' };
      case 'library':
        return { title: 'Library', subtitle: 'Workspace folders and files' };
      case 'journal':
        return { title: 'Journal', subtitle: 'Private thoughts and reflection' };
    }
  };

  const headerInfo = getHeaderInfo();

  // Single inset policy: androidStatusBarTopPad (density-portable 48dp floor when
  // StatusBar under-reports on edge-to-edge). Optional measuredTopInset reserved for
  // a future linked safe-area provider — current Dev Client APK does not ship it.
  const topPad = Platform.OS === 'android' ? androidStatusBarTopPad() : 0;

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <StatusBar
        barStyle={themeMode === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={Platform.OS === 'android' ? palette.surface : undefined}
      />
      <View
        style={{
          flex: 1,
          paddingTop: topPad,
          backgroundColor: palette.background,
        }}
      >
      {/* Main Top Header */}
      <MobileHeader
        title={headerInfo.title}
        subtitle={headerInfo.subtitle}
        themeMode={themeMode}
        onOpenSearch={() => setActiveModal('search')}
        onOpenCreate={() => setActiveModal('create')}
        onOpenAllFeatures={() => setActiveModal('all-features')}
        onOpenSettings={openSettingsHub}
      />

      {/* Main Content Area */}
      {isCorePreview && (
        <Text
          accessibilityRole="text"
          style={{ color: palette.text.primary, backgroundColor: palette.surface, padding: 12 }}
        >
          Free testing preview: uploads, audio attachments, and reminder delivery are unavailable.
          The server may take a minute to wake up. Use sample content.
        </Text>
      )}
      {storageMessage && (
        <Text accessibilityRole="alert" style={{ color: palette.status.danger, padding: 16 }}>
          {storageMessage}
        </Text>
      )}
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
            onLoginSynthetic={() => setActiveModal('account')}
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
        visibleTabs={visiblePrimaryTabs}
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
        onClose={() => setActiveModal((current) => (current === 'create' ? 'none' : current))}
        themeMode={themeMode}
        initialDraft={createDraft}
        onDraftChange={setCreateDraft}
        onCreateItem={async (draft) => {
          await saveQuickCapture(
            syncEngine,
            userNamespace?.workspaceId ?? null,
            draft,
            Intl.DateTimeFormat().resolvedOptions().timeZone
          );
          setCreateDraft({ type: 'task', title: '', details: '' });
          if (draft.type === 'task' || draft.type === 'routine') {
            setPlanSubView(draft.type === 'task' ? 'tasks' : 'routines');
            setCurrentTab('plan');
          } else setCurrentTab(draft.type === 'journal' ? 'journal' : 'library');
        }}
        onRecordAudio={isCorePreview ? undefined : () => setActiveModal('audio-recorder')}
      />

      {/* Settings Modal */}
      {activeModal === 'account' && (
        <AccountSheet themeMode={themeMode} onClose={() => setActiveModal('none')} />
      )}
      {activeModal === 'settings' && (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: palette.background,
              zIndex: 100,
            },
          ]}
        >
          {settingsGroup === null ? (
            <SettingsHubView
              themeMode={themeMode}
              onOpenGroup={setSettingsGroup}
              onClose={() => {
                setActiveModal('none');
                setSettingsGroup(null);
              }}
            />
          ) : (
            <SettingsView
              themeMode={themeMode}
              group={settingsGroup}
              onBackToHub={() => setSettingsGroup(null)}
              onToggleTheme={() => setThemeMode((m) => (m === 'light' ? 'dark' : 'light'))}
              textScale={textScale}
              onChangeTextScale={setTextScale}
              isAuthenticated={isAuthenticated}
              isOperator={isOperator}
              workspaceId={
                defaultAuthAdapter.getCurrentUser()?.workspaceId ??
                userNamespace?.workspaceId ??
                null
              }
              onProvisionWorkspace={async () => {
                const result = await defaultAuthAdapter.provisionPersonalWorkspaceDetailed();
                if (result.status !== 'ready' || !result.workspaceId) {
                  setStorageMessage(
                    result.message ??
                      'Could not provision your personal workspace. Check the network and retry. Your session was kept.'
                  );
                }
              }}
              onOpenAccount={() => setActiveModal('account')}
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
                  setActiveModal('account');
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
              onOpenAllFeatures={() => setActiveModal('all-features')}
              onOpenGallery={isOperator ? () => setActiveModal('gallery') : undefined}
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
              expensesEnabled={expensesEnabled}
              onToggleExpensesEnabled={handleToggleExpensesEnabled}
              onOpenExpenses={() => setActiveModal('expenses')}
              onOpenCustomSections={() => setActiveModal('custom-sections')}
              onOpenVaultHarness={
                isOperator && typeof __DEV__ !== 'undefined' && __DEV__
                  ? () => setActiveModal('vault-harness')
                  : undefined
              }
              onOpenDriveConnections={
                isOperator && apiClient && userNamespace?.workspaceId
                  ? () => setActiveModal('drive-connections')
                  : undefined
              }
              onOpenRooms={
                isOperator && apiClient && userNamespace?.workspaceId
                  ? () => setActiveModal('rooms')
                  : undefined
              }
              onOpenAssistant={
                isOperator && apiClient && userNamespace?.workspaceId
                  ? () => setActiveModal('assistant')
                  : undefined
              }
              onOpenBilling={
                isOperator && apiClient && userNamespace?.workspaceId
                  ? () => setActiveModal('billing')
                  : undefined
              }
              onClose={() => {
                setActiveModal('none');
                setSettingsGroup(null);
              }}
            />
          )}
        </View>
      )}

      {activeModal === 'all-features' ? (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: palette.background, zIndex: 101 }]}
        >
          <AllFeaturesSheet
            themeMode={themeMode}
            isAuthenticated={isAuthenticated}
            hasWorkspace={Boolean(userNamespace?.workspaceId)}
            isOperator={isOperator}
            personalization={featurePersonalization}
            onChangePersonalization={(next) => {
              void persistFeaturePersonalization(next);
            }}
            onClose={() => {
              // Header opens All features over shell; Settings workspace returns to hub.
              if (settingsGroup !== null) {
                returnToSettingsFromNested();
              } else {
                setActiveModal('none');
              }
            }}
            onOpenDestination={(destination) => {
              setActiveModal('none');
              if (destination === 'settings') {
                openSettingsHub();
                return;
              }
              if (destination === 'search') {
                setActiveModal('search');
                return;
              }
              if (destination === 'create') {
                setActiveModal('create');
                return;
              }
              if (
                destination === 'today' ||
                destination === 'plan' ||
                destination === 'library' ||
                destination === 'journal'
              ) {
                setCurrentTab(destination);
              }
            }}
          />
        </View>
      ) : null}

      {/* Phase 57 provisional billing — operator-gated */}
      {activeModal === 'billing' && isOperator && apiClient && userNamespace?.workspaceId ? (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: palette.background, zIndex: 102 }]}
        >
          <BillingSheet
            themeMode={themeMode}
            workspaceId={userNamespace.workspaceId}
            apiClient={apiClient}
            onClose={returnToSettingsFromNested}
          />
        </View>
      ) : null}

      {/* Phase 56 provisional assistant — operator-gated */}
      {activeModal === 'assistant' && isOperator && apiClient && userNamespace?.workspaceId ? (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: palette.background, zIndex: 102 }]}
        >
          <AssistantSheet
            themeMode={themeMode}
            workspaceId={userNamespace.workspaceId}
            apiClient={apiClient}
            onClose={returnToSettingsFromNested}
          />
        </View>
      ) : null}

      {/* Phase 51 provisional shared rooms — operator-gated */}
      {activeModal === 'rooms' && isOperator && apiClient && userNamespace?.workspaceId ? (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: palette.background, zIndex: 102 }]}
        >
          <RoomsSheet
            themeMode={themeMode}
            personalWorkspaceId={userNamespace.workspaceId}
            userId={userNamespace.userId}
            apiClient={apiClient}
            onClose={returnToSettingsFromNested}
          />
        </View>
      ) : null}

      {/* Phase 49 provisional Drive connections — operator-gated */}
      {activeModal === 'drive-connections' &&
      isOperator &&
      apiClient &&
      userNamespace?.workspaceId ? (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: palette.background, zIndex: 102 }]}
        >
          <DriveConnectionsSheet
            themeMode={themeMode}
            workspaceId={userNamespace.workspaceId}
            apiClient={apiClient}
            openSystemBrowser={(url) => {
              void Linking.openURL(url);
            }}
            onClose={returnToSettingsFromNested}
          />
        </View>
      ) : null}

      {/* Phase 46 synthetic vault harness — operator + development only */}
      {isOperator &&
        typeof __DEV__ !== 'undefined' &&
        __DEV__ &&
        activeModal === 'vault-harness' && (
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: palette.background, zIndex: 102 }]}
          >
            <VaultHarnessView
              themeMode={themeMode}
              accountId={userNamespace?.userId ?? 'synthetic-account'}
              workspaceId={userNamespace?.workspaceId ?? '11111111-1111-4111-8111-111111111111'}
              isOnline={isOnline}
              onClose={returnToSettingsFromNested}
            />
          </View>
        )}

      {/* Component Gallery Modal — operator-gated (Phase 66) */}
      {activeModal === 'gallery' && isOperator && (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: palette.background, zIndex: 101 }]}
        >
          <ComponentGalleryView
            themeMode={themeMode}
            onToggleTheme={() => setThemeMode((m) => (m === 'light' ? 'dark' : 'light'))}
            onClose={returnToSettingsFromNested}
          />
        </View>
      )}

      {/* Expenses Modal (Phase 40 Opt-In) */}
      {activeModal === 'expenses' && (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: palette.background, zIndex: 102 }]}
        >
          <ExpensesView
            themeMode={themeMode}
            workspaceId={userNamespace?.workspaceId ?? null}
            apiClient={apiClient ?? undefined}
            isOnline={isOnline}
            onClose={returnToSettingsFromNested}
          />
        </View>
      )}

      {/* Custom Sections Modal (Phase 43) */}
      {activeModal === 'custom-sections' && (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: palette.background, zIndex: 103 }]}
        >
          <CustomSectionsView
            themeMode={themeMode}
            workspaceId={userNamespace?.workspaceId ?? ''}
            apiClient={apiClient}
            onClose={returnToSettingsFromNested}
          />
        </View>
      )}

      {/* Onboarding Tutorial Sheet (Phase 31 First-Use Discovery) */}
      <OnboardingSheet
        visible={activeModal === 'onboarding' || activeModal === 'onboarding-replay'}
        onClose={() => {
          if (activeModal === 'onboarding-replay') {
            returnToSettingsFromNested();
          } else {
            setActiveModal('none');
          }
        }}
        themeMode={themeMode}
        apiClient={apiClient ?? undefined}
        repository={repository ?? undefined}
        workspaceId={userNamespace?.workspaceId ?? null}
        userId={userNamespace?.userId ?? null}
        isReplay={activeModal === 'onboarding-replay'}
        onComplete={() => {
          if (activeModal === 'onboarding-replay') {
            returnToSettingsFromNested();
          } else {
            setActiveModal('none');
          }
          setRefreshTrigger((prev) => prev + 1);
        }}
      />

      {/* Phase 34 Sync Diagnostics Sheet */}
      <MobileSyncDiagnosticsSheet
        visible={activeModal === 'sync-diagnostics'}
        onClose={returnToSettingsFromNested}
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
        onClose={returnToSettingsFromNested}
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
        onClose={returnToSettingsFromNested}
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
        onClose={returnToSettingsFromNested}
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

      {/* Phase 41 Mobile Audio Recorder Sheet */}
      <MobileAudioRecorderSheet
        visible={activeModal === 'audio-recorder'}
        onClose={() => setActiveModal('none')}
        workspaceId={userNamespace?.workspaceId ?? ''}
        themeMode={themeMode}
        recorderAdapter={audioRecorderAdapter}
        onSaveAudio={async (data) => {
          if (!data.uri) {
            throw new Error('No recording file was produced.');
          }
          const workspaceId = userNamespace?.workspaceId;
          if (!workspaceId) {
            throw new Error('No active workspace.');
          }

          // 1. Read recording binary bytes from disk
          const base64 = await FileSystem.readAsStringAsync(data.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const buffer = base64ToArrayBuffer(base64);
          const sha256 = await computeMobileBufferSha256(buffer);

          let fileId = generateUuid();

          if (apiClient) {
            // Online flow: standard private binary upload lifecycle
            const reserveRes = await apiClient.reserveFileUpload(workspaceId, {
              fileName: data.fileName,
              declaredMimeType: data.mimeType,
              declaredBytes: data.byteSize,
            });
            const { reservationId, uploadUrl, headers } = reserveRes.data;

            const putRes = await fetch(uploadUrl, {
              method: 'PUT',
              headers: {
                'Content-Type': data.mimeType,
                ...(headers || {}),
              },
              body: buffer,
            });
            if (!putRes.ok) {
              throw new Error(`Upload transfer failed with HTTP ${putRes.status}`);
            }

            const finalizeRes = await apiClient.finalizeFileUpload(workspaceId, reservationId, {
              clientChecksum: sha256,
            });
            fileId = finalizeRes.data.fileId;
          }

          // 2. Persist binary to local mobile offline cache
          if (userNamespace?.userId) {
            await MobileOfflineFileCache.saveBinary({
              accountId: userNamespace.userId,
              workspaceId,
              fileId,
              version: 1,
              fileName: data.fileName,
              mimeType: data.mimeType,
              expectedSha256: sha256,
              data: buffer,
            }).catch(() => {});
          }

          // 3. Upsert to local repository
          if (repository) {
            const now = new Date().toISOString();
            await repository.upsertFile({
              id: fileId,
              workspaceId,
              folderId: null,
              fileName: data.fileName,
              declaredMimeType: data.mimeType,
              detectedMimeType: data.mimeType,
              byteSize: data.byteSize,
              sha256Checksum: sha256,
              version: '1',
              quarantineStatus: 'verified',
              rejectionReason: null,
              createdBy: userNamespace?.userId || workspaceId,
              createdAt: now,
              updatedAt: now,
              verifiedAt: now,
            });
          }

          setActiveModal('none');
          return {
            fileId,
            fileName: data.fileName,
            durationSeconds: data.durationSeconds,
            byteSize: data.byteSize,
            mimeType: data.mimeType,
            createdAt: new Date().toISOString(),
          };
        }}
      />
      </View>
    </View>
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
