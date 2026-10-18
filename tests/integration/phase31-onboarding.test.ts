import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { createApiClient, DaynoriApiClient, ApiConflictError } from '@daynori/api-client';
import {
  TUTORIAL_STEPS,
  ONBOARDING_STEP_METADATA,
  ONBOARDING_INTEREST_LABELS,
  SAMPLE_STARTER_TEMPLATE,
  getDefaultOnboardingState,
  shouldShowOnboarding,
  advanceOnboardingStep,
  completeOnboarding,
  skipOnboarding,
  resetOnboardingForReplay,
  deriveModuleShortcutsFromInterests,
  getSampleFolderId,
  getSampleNoteId,
  getSampleTaskId,
  createDeterministicUuid,
  getDefaultHomeLayout,
  type OnboardingInterest,
  type OnboardingState,
  type HomeLayout,
} from '@daynori/domain';

describe('Phase 31: First-Use Tutorial & Progressive Discovery Suite', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase31-onboarding-key';

  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  let tokenUserA: string;
  let tokenUserB: string;
  let clientA: DaynoriApiClient;
  let clientB: DaynoriApiClient;
  let workspaceAId: string;
  let workspaceBId: string;

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
      displayName: 'Alice Onboarding',
      timeZone: 'Europe/London',
      preferredLocale: 'en-GB',
      weekStart: 'monday',
    });
    workspaceAId = provA.data.workspace.id;

    const provB = await clientB.provisionPersonalWorkspace({
      displayName: 'Bob Onboarding',
      timeZone: 'America/New_York',
      preferredLocale: 'en-US',
      weekStart: 'sunday',
    });
    workspaceBId = provB.data.workspace.id;
  });

  afterAll(async () => {
    await server.close();
    await runtimePool.end();
    await adminPool.end();
  });

  describe('1. Fresh Account Baseline & Onboarding Trigger', () => {
    it('detects that a new user requires onboarding by default', async () => {
      const res = await clientA.getUserPreferences();
      expect(res.data).toBeDefined();

      const onboardingPref = res.data.preferences?.onboarding as OnboardingState | undefined;
      expect(shouldShowOnboarding(onboardingPref)).toBe(true);

      const defaultState = getDefaultOnboardingState();
      expect(defaultState.version).toBe(1);
      expect(defaultState.step).toBe('capture');
      expect(defaultState.completed).toBe(false);
      expect(defaultState.skipped).toBe(false);
      expect(defaultState.selectedInterests).toEqual(['notes', 'planning', 'journal', 'files']);
      expect(defaultState.createdSampleItemIds).toEqual([]);
      expect(defaultState.createdFolderId).toBeNull();
    });

    it('defines accessible tutorial metadata for each step', () => {
      expect(TUTORIAL_STEPS).toEqual(['capture', 'planning', 'organize']);

      for (const step of TUTORIAL_STEPS) {
        const meta = ONBOARDING_STEP_METADATA[step];
        expect(meta).toBeDefined();
        expect(meta.title.length).toBeGreaterThan(0);
        expect(meta.description.length).toBeGreaterThan(0);
        expect(meta.announcement.length).toBeGreaterThan(0);
        expect(meta.stepIndex).toBeGreaterThanOrEqual(1);
        expect(meta.totalSteps).toBe(3);
      }
    });

    it('provides clear labels and icons for interests', () => {
      const interests: OnboardingInterest[] = ['notes', 'planning', 'journal', 'files'];
      for (const interest of interests) {
        const item = ONBOARDING_INTEREST_LABELS[interest];
        expect(item).toBeDefined();
        expect(item.label.length).toBeGreaterThan(0);
        expect(item.icon.length).toBeGreaterThan(0);
        expect(item.description.length).toBeGreaterThan(0);
      }
    });
  });

  describe('2. Interest Selection & Shortcut Derivation', () => {
    it('customizes visible module shortcuts based on selected interests', () => {
      const baseLayout = getDefaultHomeLayout();

      // Case A: User only wants Notes & Files
      const notesAndFilesLayout = deriveModuleShortcutsFromInterests(['notes', 'files'], baseLayout);
      const visibleShortcutsA = notesAndFilesLayout.moduleShortcuts
        .filter((s) => s.visible)
        .map((s) => s.id);

      expect(visibleShortcutsA).toContain('notes');
      expect(visibleShortcutsA).toContain('files');
      expect(visibleShortcutsA).not.toContain('tasks');
      expect(visibleShortcutsA).not.toContain('routines');
      expect(visibleShortcutsA).not.toContain('journal');

      // Invariant: Unreleased module 'knowledge' remains hidden
      const knowledge = notesAndFilesLayout.moduleShortcuts.find((s) => s.id === 'knowledge');
      expect(knowledge?.visible).toBe(false);

      // Case B: User wants Planning and Journal
      const planningLayout = deriveModuleShortcutsFromInterests(
        ['planning', 'journal'],
        baseLayout
      );
      const visibleShortcutsB = planningLayout.moduleShortcuts
        .filter((s) => s.visible)
        .map((s) => s.id);

      expect(visibleShortcutsB).toContain('tasks');
      expect(visibleShortcutsB).toContain('routines');
      expect(visibleShortcutsB).toContain('journal');
      expect(visibleShortcutsB).not.toContain('files');
    });

    it('preserves module ordering and core properties during derivation', () => {
      const baseLayout = getDefaultHomeLayout();
      const updated = deriveModuleShortcutsFromInterests(['notes'], baseLayout);

      expect(updated.moduleShortcuts.length).toBe(baseLayout.moduleShortcuts.length);
      expect(updated.version).toBe(baseLayout.version);
      expect(updated.density).toBe(baseLayout.density);
    });
  });

  describe('3. Deterministic Sample Generation & Idempotency', () => {
    it('produces RFC 4122 v5-compliant deterministic UUIDs for starter items', () => {
      const folderId1 = getSampleFolderId(workspaceAId, userAId);
      const folderId2 = getSampleFolderId(workspaceAId, userAId);
      const noteId1 = getSampleNoteId(workspaceAId, userAId);
      const taskId1 = getSampleTaskId(workspaceAId, userAId);

      // Deterministic idempotency
      expect(folderId1).toBe(folderId2);
      expect(folderId1).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(noteId1).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(taskId1).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );

      // Unique between different items
      expect(folderId1).not.toBe(noteId1);
      expect(noteId1).not.toBe(taskId1);

      // Scoped across workspaces/users
      const folderIdUserB = getSampleFolderId(workspaceBId, userBId);
      expect(folderId1).not.toBe(folderIdUserB);
    });

    it('creates sample starter folder, note, and task on the server', async () => {
      const sampleFolderId = getSampleFolderId(workspaceAId, userAId);
      const sampleNoteId = getSampleNoteId(workspaceAId, userAId);
      const sampleTaskId = getSampleTaskId(workspaceAId, userAId);

      // 1. Create starter folder
      const folderRes = await clientA.createFolder(workspaceAId, {
        id: sampleFolderId,
        name: SAMPLE_STARTER_TEMPLATE.folderName,
        securityScope: 'standard',
      });
      expect(folderRes.data.id).toBe(sampleFolderId);
      expect(folderRes.data.name).toBe(SAMPLE_STARTER_TEMPLATE.folderName);

      // 2. Create sample note inside folder
      const noteRes = await clientA.createNote(workspaceAId, {
        id: sampleNoteId,
        title: SAMPLE_STARTER_TEMPLATE.noteTitle,
        folderId: sampleFolderId,
        securityScope: 'standard',
        document: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: SAMPLE_STARTER_TEMPLATE.noteSnippet }],
            },
          ],
        },
      });
      expect(noteRes.data.id).toBe(sampleNoteId);
      expect(noteRes.data.title).toBe(SAMPLE_STARTER_TEMPLATE.noteTitle);
      expect(noteRes.data.folderId).toBe(sampleFolderId);

      // 3. Create sample task inside folder
      const taskRes = await clientA.createTask(workspaceAId, {
        id: sampleTaskId,
        title: SAMPLE_STARTER_TEMPLATE.taskTitle,
        folderId: sampleFolderId,
        status: 'todo',
        priority: 'normal',
        isPinned: false,
        securityScope: 'standard',
        tags: [],
        deadline: { type: 'none' },
        subtaskOrder: 0,
      });
      expect(taskRes.data.id).toBe(sampleTaskId);
      expect(taskRes.data.title).toBe(SAMPLE_STARTER_TEMPLATE.taskTitle);
      expect(taskRes.data.folderId).toBe(sampleFolderId);

      // 4. Update user preferences with completed onboarding state
      const completedOnboarding: OnboardingState = {
        ...completeOnboarding(getDefaultOnboardingState()),
        selectedInterests: ['notes', 'planning', 'journal', 'files'],
        createdSampleItemIds: [sampleNoteId, sampleTaskId],
        createdFolderId: sampleFolderId,
      };

      const prefRes = await clientA.updateUserPreferences({
        preferences: {
          onboarding: completedOnboarding,
        },
      });

      expect(prefRes.data.preferences?.onboarding).toBeDefined();
      const savedOnboarding = prefRes.data.preferences?.onboarding as OnboardingState;
      expect(savedOnboarding.completed).toBe(true);
      expect(savedOnboarding.createdSampleItemIds).toContain(sampleNoteId);
      expect(savedOnboarding.createdSampleItemIds).toContain(sampleTaskId);
      expect(savedOnboarding.createdFolderId).toBe(sampleFolderId);
      expect(shouldShowOnboarding(savedOnboarding)).toBe(false);
    });
  });

  describe('4. Skippable Onboarding Journey', () => {
    it('allows a user to skip the tutorial and reach home immediately without creating samples', async () => {
      // User B chooses to skip onboarding
      const userBPrefs = await clientB.getUserPreferences();
      const initialBOnboarding =
        (userBPrefs.data.preferences?.onboarding as OnboardingState | undefined) ??
        getDefaultOnboardingState();

      expect(shouldShowOnboarding(initialBOnboarding)).toBe(true);

      const skippedState = skipOnboarding(initialBOnboarding);
      expect(skippedState.skipped).toBe(true);
      expect(skippedState.step).toBe('completed');
      expect(skippedState.completed).toBe(false);
      expect(skippedState.createdSampleItemIds).toEqual([]);
      expect(skippedState.createdFolderId).toBeNull();
      expect(shouldShowOnboarding(skippedState)).toBe(false);

      const updateRes = await clientB.updateUserPreferences({
        preferences: {
          onboarding: skippedState,
        },
      });

      const savedB = updateRes.data.preferences?.onboarding as OnboardingState;
      expect(savedB.skipped).toBe(true);
      expect(shouldShowOnboarding(savedB)).toBe(false);

      // Verify that no starter notes or tasks were created in workspace B
      const notesList = await clientB.listNotes(workspaceBId);
      expect(notesList.data.length).toBe(0);
      const tasksList = await clientB.listTasks(workspaceBId);
      expect(tasksList.data.length).toBe(0);
    });
  });

  describe('5. Tutorial Replay Invariant (Never Duplicate Content)', () => {
    it('resets progress for replay from Settings while strictly preserving created items and folders', async () => {
      // Retrieve User A's current onboarding state
      const currentPrefs = await clientA.getUserPreferences();
      const existingOnboarding = currentPrefs.data.preferences?.onboarding as OnboardingState;
      expect(existingOnboarding.completed).toBe(true);
      expect(existingOnboarding.createdSampleItemIds.length).toBeGreaterThan(0);
      expect(existingOnboarding.createdFolderId).not.toBeNull();

      // Trigger replay
      const replayState = resetOnboardingForReplay(existingOnboarding);
      expect(replayState.step).toBe('capture');
      expect(replayState.completed).toBe(false);
      expect(replayState.skipped).toBe(false);

      // CRITICAL INVARIANT: Replay keeps tracked sample item IDs and folder ID intact
      expect(replayState.createdSampleItemIds).toEqual(existingOnboarding.createdSampleItemIds);
      expect(replayState.createdFolderId).toBe(existingOnboarding.createdFolderId);

      // shouldShowOnboarding evaluates to true during replay
      expect(shouldShowOnboarding(replayState)).toBe(true);

      // Complete replay with customized interests (e.g. ['notes'])
      const replayedFinished: OnboardingState = {
        ...completeOnboarding(replayState),
        selectedInterests: ['notes'],
        createdSampleItemIds: replayState.createdSampleItemIds,
        createdFolderId: replayState.createdFolderId,
      };

      const updateRes = await clientA.updateUserPreferences({
        preferences: {
          onboarding: replayedFinished,
        },
      });

      const finalSaved = updateRes.data.preferences?.onboarding as OnboardingState;
      expect(finalSaved.completed).toBe(true);
      expect(finalSaved.selectedInterests).toEqual(['notes']);
      // Still matches original sample items, no duplicates
      expect(finalSaved.createdSampleItemIds).toEqual(existingOnboarding.createdSampleItemIds);
      expect(finalSaved.createdFolderId).toBe(existingOnboarding.createdFolderId);

      // Verify only 1 starter note and 1 starter task exist in workspace A
      const notes = await clientA.listNotes(workspaceAId);
      expect(notes.data.length).toBe(1);
      const tasks = await clientA.listTasks(workspaceAId);
      expect(tasks.data.length).toBe(1);
    });
  });

  describe('6. Multi-Device Synchronization & Conflict Handling', () => {
    it('synchronizes onboarding state across simulated devices via preferences revision', async () => {
      // Simulate Device 1 fetching preferences
      const device1Client = createApiClient({ baseUrl, token: tokenUserA });
      const device2Client = createApiClient({ baseUrl, token: tokenUserA });

      const d1Prefs = await device1Client.getUserPreferences();
      const d2Prefs = await device2Client.getUserPreferences();

      expect(d1Prefs.data.revision).toBe(d2Prefs.data.revision);
      const d1Onboarding = d1Prefs.data.preferences?.onboarding as OnboardingState;
      expect(d1Onboarding.completed).toBe(true);

      // Device 1 updates step state
      const nextStepState = advanceOnboardingStep(d1Onboarding, 'planning');
      const updateD1 = await device1Client.updateUserPreferences({
        preferences: {
          onboarding: nextStepState,
        },
        expectedRevision: d1Prefs.data.revision,
      });

      expect(updateD1.data.revision).toBe(d1Prefs.data.revision + 1);

      // Device 2 attempts an update with stale expectedRevision
      await expect(
        device2Client.updateUserPreferences({
          preferences: {
            onboarding: advanceOnboardingStep(d1Onboarding, 'organize'),
          },
          expectedRevision: d2Prefs.data.revision, // stale!
        })
      ).rejects.toThrow(ApiConflictError);

      // Device 2 re-fetches latest state and cleanly resolves
      const refreshedD2 = await device2Client.getUserPreferences();
      expect(refreshedD2.data.revision).toBe(updateD1.data.revision);
      const latestOnboarding = refreshedD2.data.preferences?.onboarding as OnboardingState;
      expect(latestOnboarding.step).toBe('planning');
    });
  });
});
