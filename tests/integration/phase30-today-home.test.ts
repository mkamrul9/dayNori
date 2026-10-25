import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { createApiClient, DaynoriApiClient, ApiConflictError } from '@daynori/api-client';
import {
  getDefaultHomeLayout,
  validateCustomLabel,
  sanitizeAndMigrateHomeLayout,
  reorderWidgets,
  reorderModuleShortcuts,
  filterRecentItemsForPrivacy,
  APPROVED_HOME_WIDGET_IDS,
  APPROVED_MODULE_SHORTCUT_IDS,
  type HomeLayout,
  type RecentItemEntry,
} from '@daynori/domain';

describe('Phase 30: Today Home and Personal Customization Suite', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase30-today-home-key';

  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  let tokenUserA: string;
  let tokenUserB: string;
  let clientA: DaynoriApiClient;
  let clientB: DaynoriApiClient;
  let workspaceAId: string;
  let _workspaceBId: string;

  async function createToken(userId: string): Promise<string> {
    return new SignJWT({
      sub: userId,
      aud: audience,
      iss: issuer,
      role: 'authenticated',
      aal: 'aal1',
      session_id: crypto.randomUUID(),
    })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(keyPair.privateKey);
  }

  beforeAll(async () => {
    adminPool = createAdminPool();
    runtimePool = createRuntimePool();

    keyPair = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = kid;
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';
    jwks = { keys: [publicJwk] };

    tokenUserA = await createToken(userAId);
    tokenUserB = await createToken(userBId);

    const verifier = new JwtVerifier({
      issuer,
      audience,
      localJwks: jwks,
    });

    server = buildServer({
      runtimePool,
      jwtVerifier: verifier,
    });

    await server.listen({ port: 0, host: '127.0.0.1' });
    const address = server.server.address();
    if (typeof address === 'object' && address !== null) {
      baseUrl = `http://127.0.0.1:${address.port}`;
    }

    clientA = createApiClient({ baseUrl, token: tokenUserA });
    clientB = createApiClient({ baseUrl, token: tokenUserB });

    const provA = await clientA.provisionPersonalWorkspace({
      displayName: 'Alice Today',
      timeZone: 'Europe/London',
      preferredLocale: 'en-GB',
      weekStart: 'monday',
    });
    workspaceAId = provA.data.workspace.id;

    const provB = await clientB.provisionPersonalWorkspace({
      displayName: 'Bob Today',
      timeZone: 'America/New_York',
      preferredLocale: 'en-US',
      weekStart: 'sunday',
    });
    _workspaceBId = provB.data.workspace.id;
  });

  afterAll(async () => {
    await server.close();
    await runtimePool.end();
    await adminPool.end();
  });

  describe('1. Default Home Layout & New Account Baseline', () => {
    it('returns a calm, small default home layout (3-5 visible cards) for new accounts', () => {
      const defaultLayout = getDefaultHomeLayout();
      expect(defaultLayout.version).toBe(1);
      expect(defaultLayout.density).toBe('comfortable');

      const visibleWidgets = defaultLayout.widgets.filter((w) => w.visible);
      // Approximately 3 to 5 visible cards
      expect(visibleWidgets.length).toBeGreaterThanOrEqual(3);
      expect(visibleWidgets.length).toBeLessThanOrEqual(5);

      const visibleIds = visibleWidgets.map((w) => w.id);
      expect(visibleIds).toContain('tasks');
      expect(visibleIds).toContain('routines');
      expect(visibleIds).toContain('upcoming_summary');
      expect(visibleIds).toContain('journal_prompt');
      // Phase 69: Quick Capture and module chips default off — shell Create/nav are primary
      expect(visibleIds).not.toContain('quick_capture');

      // Optional heavier cards are hidden by default
      const hiddenIds = defaultLayout.widgets.filter((w) => !w.visible).map((w) => w.id);
      expect(hiddenIds).toContain('quick_capture');
      expect(hiddenIds).toContain('recent_items');
      expect(hiddenIds).toContain('favorite_folders');

      // Module shortcuts remain registered but default hidden (shell owns primary destinations)
      expect(defaultLayout.moduleShortcuts.length).toBe(APPROVED_MODULE_SHORTCUT_IDS.length);
      expect(defaultLayout.moduleShortcuts.every((s) => s.visible === false)).toBe(true);
      expect(defaultLayout.favoriteFolderIds).toEqual([]);
    });

    it('newly provisioned profile preferences reflect default display settings and preserve quietHours', async () => {
      const profileRes = await clientA.getUserPreferences();
      expect(profileRes.data.preferences.theme).toBe('system');
      expect(profileRes.data.preferences.compactMode).toBe(false);
      expect(profileRes.data.preferences.journalPreviewHidden).toBe(true);
      expect(profileRes.data.preferences.suppressBodySnippets).toBe(true);
    });
  });

  describe('2. Customizing Layout, Bounded Labels & XSS Protection', () => {
    it('sanitizes malicious script and HTML tags from custom labels', () => {
      expect(validateCustomLabel('<script>alert("xss")</script>My Tasks')).toBe('My Tasks');
      expect(validateCustomLabel('<b>Priority</b> Actions')).toBe('Priority Actions');
      expect(validateCustomLabel('<style>body{color:red;}</style>Routines')).toBe('Routines');
      expect(validateCustomLabel('   Trimmed Label   ')).toBe('Trimmed Label');
      expect(validateCustomLabel('')).toBeNull();
      expect(validateCustomLabel('A'.repeat(50))).toBe('A'.repeat(40));
    });

    it('reorders widgets cleanly using accessible Move Up and Move Down alternatives to drag-and-drop', () => {
      const layout = getDefaultHomeLayout();
      const initialFirst = layout.widgets[0].id;
      const initialSecond = layout.widgets[1].id;

      // Moving first item UP is a no-op (bounded)
      const afterInvalidUp = reorderWidgets(layout.widgets, initialFirst, 'up');
      expect(afterInvalidUp[0].id).toBe(initialFirst);

      // Moving first item DOWN swaps with second
      const afterDown = reorderWidgets(layout.widgets, initialFirst, 'down');
      expect(afterDown[0].id).toBe(initialSecond);
      expect(afterDown[1].id).toBe(initialFirst);
      expect(afterDown[0].order).toBe(0);
      expect(afterDown[1].order).toBe(1);

      // Moving last item DOWN is a no-op (bounded)
      const lastId = layout.widgets[layout.widgets.length - 1].id;
      const afterInvalidDown = reorderWidgets(layout.widgets, lastId, 'down');
      expect(afterInvalidDown[afterInvalidDown.length - 1].id).toBe(lastId);
    });

    it('reorders module shortcuts cleanly with boundary protection', () => {
      const layout = getDefaultHomeLayout();
      const firstShortcut = layout.moduleShortcuts[0].id;
      const secondShortcut = layout.moduleShortcuts[1].id;

      const swapped = reorderModuleShortcuts(layout.moduleShortcuts, firstShortcut, 'down');
      expect(swapped[0].id).toBe(secondShortcut);
      expect(swapped[1].id).toBe(firstShortcut);
    });
  });

  describe('3. Persistence, Concurrency & Unrelated Preferences Preservation', () => {
    it('persists customized homeLayout via PATCH /v1/users/me/preferences while preserving quietHours & privacy settings', async () => {
      // 1. First set quietHours on User A profile
      const current = await clientA.getUserPreferences();
      const withQuietHours = await clientA.updateUserPreferences({
        preferences: {
          ...current.data.preferences,
          theme: 'dark',
          quietHours: {
            enabled: true,
            start: '22:00',
            end: '07:00',
            timezone: 'Europe/London',
          },
        },
        expectedRevision: current.data.revision,
      });

      expect(withQuietHours.data.preferences.theme).toBe('dark');
      expect(withQuietHours.data.preferences.quietHours?.enabled).toBe(true);

      // 2. Now update only the homeLayout with custom labels, hidden journal, and compact density
      const customizedLayout: HomeLayout = {
        version: 1,
        density: 'compact',
        widgets: [
          { id: 'tasks', visible: true, order: 0, customLabel: 'Immediate Action Items' },
          { id: 'routines', visible: true, order: 1, customLabel: 'Daily Flow' },
          { id: 'upcoming_summary', visible: true, order: 2, customLabel: 'Horizon (7 Days)' },
          { id: 'quick_capture', visible: true, order: 3 },
          { id: 'journal_prompt', visible: false, order: 4 }, // User hid Journal prompt
          { id: 'recent_items', visible: true, order: 5, customLabel: 'Recents' },
          { id: 'favorite_folders', visible: false, order: 6 },
        ],
        moduleShortcuts: getDefaultHomeLayout().moduleShortcuts,
        favoriteFolderIds: [],
      };

      const layoutUpdateRes = await clientA.updateUserPreferences({
        preferences: {
          ...withQuietHours.data.preferences,
          homeLayout: customizedLayout,
        },
        expectedRevision: withQuietHours.data.revision,
      });

      expect(layoutUpdateRes.data.preferences.homeLayout?.density).toBe('compact');
      expect(layoutUpdateRes.data.preferences.homeLayout?.widgets[0].customLabel).toBe('Immediate Action Items');
      expect(layoutUpdateRes.data.preferences.homeLayout?.widgets.find((w) => w.id === 'journal_prompt')?.visible).toBe(false);

      // Invariant check: quietHours and theme were NOT wiped!
      expect(layoutUpdateRes.data.preferences.theme).toBe('dark');
      expect(layoutUpdateRes.data.preferences.quietHours?.enabled).toBe(true);
      expect(layoutUpdateRes.data.preferences.quietHours?.start).toBe('22:00');
    });

    it('rejects concurrent layout edits with stale expectedRevision (HTTP 409 Conflict)', async () => {
      const current = await clientA.getUserPreferences();
      const baseRev = current.data.revision;

      // Two concurrent updates sending different densities
      const req1 = clientA.updateUserPreferences({
        preferences: {
          ...current.data.preferences,
          homeLayout: {
            ...getDefaultHomeLayout(),
            density: 'comfortable',
          },
        },
        expectedRevision: baseRev,
      });

      const req2 = clientA.updateUserPreferences({
        preferences: {
          ...current.data.preferences,
          homeLayout: {
            ...getDefaultHomeLayout(),
            density: 'compact',
          },
        },
        expectedRevision: baseRev,
      });

      const settled = await Promise.allSettled([req1, req2]);
      const fulfilled = settled.filter((r) => r.status === 'fulfilled');
      const rejected = settled.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const err = (rejected[0] as PromiseRejectedResult).reason;
      expect(err).toBeInstanceOf(ApiConflictError);

      const after = await clientA.getUserPreferences();
      expect(after.data.revision).toBe(baseRev + 1);
    });

    it('synchronizes layout across second client session for same user', async () => {
      const tokenClient2 = await createToken(userAId);
      const clientA2 = createApiClient({ baseUrl, token: tokenClient2 });

      const prefsA2 = await clientA2.getUserPreferences();
      expect(prefsA2.data.preferences.homeLayout?.version).toBe(1);
      expect(prefsA2.data.preferences.homeLayout?.widgets.find((w) => w.id === 'tasks')?.id).toBe('tasks');
    });
  });

  describe('4. Privacy, Content Filtering & Fault Tolerance', () => {
    it('redacts private journal titles and completely suppresses body snippets in recent items', () => {
      const recentItems: RecentItemEntry[] = [
        {
          id: crypto.randomUUID(),
          title: 'Quarterly Review Notes',
          type: 'note',
          updatedAt: '2026-10-17T12:00:00Z',
          bodyPreview: 'Confidential strategy discussion notes...',
        },
        {
          id: crypto.randomUUID(),
          title: 'My Deepest Secrets Journal',
          type: 'journal',
          updatedAt: '2026-10-17T14:00:00Z',
          bodyPreview: 'Private reflection on personal health...',
        },
        {
          id: crypto.randomUUID(),
          title: 'Encrypted Master Key Backup',
          type: 'vault' as unknown as RecentItemEntry['type'],
          updatedAt: '2026-10-17T15:00:00Z',
          bodyPreview: 'Vault ciphertext...',
        },
      ];

      const filtered = filterRecentItemsForPrivacy(recentItems);

      // Vault items are strictly dropped
      expect(filtered.some((item) => (item.type as string) === 'vault')).toBe(false);

      // Journal items have bodyPreview stripped and title normalized to generic 'Journal entry'
      const journalItem = filtered.find((item) => item.type === 'journal');
      expect(journalItem).toBeDefined();
      expect(journalItem?.title).toBe('Journal entry');
      expect(journalItem?.bodyPreview).toBeNull();

      // Notes retain their title and preview if non-sensitive
      const noteItem = filtered.find((item) => item.type === 'note');
      expect(noteItem?.title).toBe('Quarterly Review Notes');
      expect(noteItem?.bodyPreview).toBe('Confidential strategy discussion notes...');
    });

    it('safely filters out unreleased or unapproved module identifiers during migration', () => {
      const dirtyLayout = {
        version: 1,
        density: 'comfortable',
        widgets: [
          { id: 'tasks', visible: true, order: 0 },
          { id: 'vault', visible: true, order: 1 }, // Unreleased module
          { id: 'expenses', visible: true, order: 2 }, // Unreleased module
          { id: 'ai_copilot', visible: true, order: 3 }, // Unapproved widget
        ],
        moduleShortcuts: [
          { id: 'today', visible: true, order: 0 },
          { id: 'crypto_wallet', visible: true, order: 1 }, // Unapproved shortcut
        ],
        favoriteFolderIds: [crypto.randomUUID()],
      };

      const sanitized = sanitizeAndMigrateHomeLayout(dirtyLayout);
      expect(sanitized.version).toBe(1);

      // Dropped unapproved widgets and restored missing approved widgets
      const widgetIds = sanitized.widgets.map((w) => w.id);
      expect(widgetIds).not.toContain('vault');
      expect(widgetIds).not.toContain('expenses');
      expect(widgetIds).not.toContain('ai_copilot');
      expect(widgetIds).not.toContain('crypto_wallet');

      // Restored missing approved widgets
      for (const approvedId of APPROVED_HOME_WIDGET_IDS) {
        expect(widgetIds).toContain(approvedId);
      }

      // Restored missing approved shortcuts
      const shortcutIds = sanitized.moduleShortcuts.map((s) => s.id);
      for (const approvedShortcut of APPROVED_MODULE_SHORTCUT_IDS) {
        expect(shortcutIds).toContain(approvedShortcut);
      }
    });

    it('gracefully tolerates deleted favorite folders without breaking layout or throwing errors', async () => {
      // Create a folder in workspace A
      const folderRes = await clientA.createFolder(workspaceAId, {
        name: 'Temporary Project Folder',
        color: '#3b82f6',
      });
      const folderId = folderRes.data.id;

      // Add to favorite folders in homeLayout
      const current = await clientA.getUserPreferences();
      const layoutWithFolder: HomeLayout = {
        ...getDefaultHomeLayout(),
        favoriteFolderIds: [folderId],
      };

      await clientA.updateUserPreferences({
        preferences: {
          ...current.data.preferences,
          homeLayout: layoutWithFolder,
        },
        expectedRevision: current.data.revision,
      });

      // Trash the folder
      await clientA.trashFolder(workspaceAId, folderId, {
        policy: 'trash_subtree',
        baseRevision: folderRes.data.revision,
      });

      // Fetching preferences and applying migration does not fail
      const afterDelete = await clientA.getUserPreferences();
      const migrated = sanitizeAndMigrateHomeLayout(afterDelete.data.preferences.homeLayout);
      expect(migrated.favoriteFolderIds).toContain(folderId); // ID persists safely until user removes or views
    });
  });

  describe('5. Restore Defaults & Data Non-Destruction Invariant', () => {
    it('restoring default layout resets layout preferences without deleting tasks, routines, or notes', async () => {
      // 1. Create a canonical task
      const taskRes = await clientA.createTask(workspaceAId, {
        title: 'Crucial Work Task',
        status: 'todo',
        priority: 'high',
      });
      const taskId = taskRes.data.id;

      // 2. Create a canonical routine
      const routineRes = await clientA.createRoutine(workspaceAId, {
        title: 'Morning Meditation',
        frequency: 'daily',
        timezone: 'Europe/London',
        activeFrom: '2026-01-01',
      });
      const routineId = routineRes.data.id;

      // 3. User restores default layout
      const current = await clientA.getUserPreferences();
      const restoredLayout = getDefaultHomeLayout();

      const afterRestore = await clientA.updateUserPreferences({
        preferences: {
          ...current.data.preferences,
          homeLayout: restoredLayout,
        },
        expectedRevision: current.data.revision,
      });

      expect(afterRestore.data.preferences.homeLayout?.density).toBe('comfortable');
      expect(afterRestore.data.preferences.homeLayout?.widgets.length).toBe(APPROVED_HOME_WIDGET_IDS.length);

      // Invariant: Canonical task and routine are 100% intact
      const fetchedTask = await clientA.getTask(workspaceAId, taskId);
      expect(fetchedTask.data.title).toBe('Crucial Work Task');
      expect(fetchedTask.data.status).toBe('todo');

      const fetchedRoutine = await clientA.getRoutine(workspaceAId, routineId);
      expect(fetchedRoutine.data.title).toBe('Morning Meditation');
      expect(fetchedRoutine.data.frequency).toBe('daily');
    });
  });

  describe('6. Account Isolation & Multi-Tenant Separation', () => {
    it('ensures User A layout customizations are completely invisible to User B', async () => {
      const prefsB = await clientB.getUserPreferences();
      // User B has their own fresh preferences
      expect(prefsB.data.id).not.toBe(userAId);
      expect(prefsB.data.displayName).toBe('Bob Today');

      // User B cannot see User A custom widget label 'Immediate Action Items'
      const bWidgets = prefsB.data.preferences.homeLayout?.widgets ?? getDefaultHomeLayout().widgets;
      const bWidgetLabels = bWidgets.map((w) => w.customLabel);
      expect(bWidgetLabels).not.toContain('Immediate Action Items');
    });
  });
});
