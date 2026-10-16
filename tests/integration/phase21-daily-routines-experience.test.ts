import crypto from 'node:crypto';
import 'fake-indexeddb/auto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';
import {
  computeDeterministicOccurrenceId,
  explainWhyDueToday,
  calculateGentleProgress,
  explainScheduleChangeImpact,
  reconcileOccurrencesOnScheduleChange,
  isTaskDueToday,
  isTaskOverdue,
  getCalendarDateInTimezone,
  type RoutineTemplateRule,
  type RoutineOccurrence,
} from '@daynori/domain';
import {
  IndexedDbLocalRepository,
  clearAllLocalData,
  setTrustedDeviceConsent,
} from '../../apps/web/src/data/indexedDbRepository.js';

// In-memory localStorage mock for Node test runner
const memoryStorage = new Map<string, string>();
const globalWithStorage = globalThis as unknown as { localStorage?: Storage };
if (typeof globalWithStorage.localStorage === 'undefined') {
  globalWithStorage.localStorage = {
    getItem: (key: string) => memoryStorage.get(key) ?? null,
    setItem: (key: string, value: string) => memoryStorage.set(key, String(value)),
    removeItem: (key: string) => memoryStorage.delete(key),
    clear: () => memoryStorage.clear(),
    key: (_index: number) => null,
    length: 0,
  };
}

describe('Phase 21: Daily Routine Experience, Checklists and History', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase21-routines-key';

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

    // 1. Run migrations
    migrator = new Migrator();
    await migrator.migrate();

    // 2. Setup JWT Key Pair & Tokens
    keyPair = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = kid;
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';
    jwks = { keys: [publicJwk] };

    tokenUserA = await createToken(userAId);
    tokenUserB = await createToken(userBId);

    // 3. Start API Server with in-memory JWKS verifier
    const jwtVerifier = new JwtVerifier({
      issuer,
      audience,
      localJwks: jwks,
    });

    server = buildServer({
      jwtVerifier,
      adminPool,
      runtimePool,
      rateLimitOptions: { windowMs: 60000, maxRequests: 50000 },
    });

    await server.listen({ port: 0, host: '127.0.0.1' });
    const address = server.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Server address not resolved');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;

    // 4. API Clients
    clientA = createApiClient({
      baseUrl,
      token: tokenUserA,
    });

    clientB = createApiClient({
      baseUrl,
      token: tokenUserB,
    });

    // 5. Seed user profiles and workspaces
    const admin = await adminPool.connect();
    try {
      await admin.query(`
        INSERT INTO app.profiles (id, display_name) VALUES
          ('${userAId}', 'User A Phase 21'),
          ('${userBId}', 'User B Phase 21')
        ON CONFLICT (id) DO NOTHING;
      `);

      const wsARes = await admin.query<{ id: string }>(`
        INSERT INTO app.workspaces (name, kind, owner_id)
        VALUES ('Workspace User A Phase 21', 'personal', '${userAId}')
        RETURNING id;
      `);
      workspaceAId = wsARes.rows[0].id;

      await admin.query(`
        INSERT INTO app.workspace_memberships (workspace_id, user_id, role) VALUES
          ('${workspaceAId}', '${userAId}', 'owner');
      `);

      const wsBRes = await admin.query<{ id: string }>(`
        INSERT INTO app.workspaces (name, kind, owner_id)
        VALUES ('Workspace User B Phase 21', 'personal', '${userBId}')
        RETURNING id;
      `);
      workspaceBId = wsBRes.rows[0].id;

      await admin.query(`
        INSERT INTO app.workspace_memberships (workspace_id, user_id, role) VALUES
          ('${workspaceBId}', '${userBId}', 'owner');
      `);
    } finally {
      admin.release();
    }
  });

  afterAll(async () => {
    await server.close();
    await runtimePool.end();
    await adminPool.end();
  });

  describe('Multi-day Journey, Completion, Undo, and History Preservation', () => {
    const day1Date = '2026-10-20';
    const day2Date = '2026-10-21';
    let routine1Id: string;
    let day1OccRevision = 1;

    it('creates routine template and generates today occurrence deterministically', async () => {
      const routineRes = await clientA.createRoutine(workspaceAId, {
        title: 'Morning Architectural Focus',
        details: 'Review system specs before notifications.',
        frequency: 'daily',
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        timezone: 'America/New_York',
        scheduledTime: '08:30',
        activeFrom: '2026-10-01',
      });

      expect(routineRes.data).toBeDefined();
      const routine = routineRes.data;
      expect(routine.title).toBe('Morning Architectural Focus');
      routine1Id = routine.id;

      // Generate occurrence on day 1
      const genRes = await clientA.generateOccurrences(workspaceAId, {
        routineId: routine1Id,
        startDate: day1Date,
        endDate: day1Date,
      });

      expect(genRes.data).toHaveLength(1);
      const day1Occ = genRes.data[0];
      expect(day1Occ.scheduledDate).toBe(day1Date);
      expect(day1Occ.status).toBe('pending');
      expect(day1Occ.completedAt).toBeNull();
      day1OccRevision = day1Occ.revision;

      // Verify deterministic ID
      const expectedId = computeDeterministicOccurrenceId(workspaceAId, routine1Id, day1Date);
      expect(day1Occ.id).toBe(expectedId);
    });

    it('completes day 1 occurrence, verifies timestamp and transition history', async () => {
      const occId = computeDeterministicOccurrenceId(workspaceAId, routine1Id, day1Date);

      const completeRes = await clientA.completeOccurrence(workspaceAId, occId, {
        baseRevision: day1OccRevision,
      });

      expect(completeRes.data.status).toBe('done');
      expect(completeRes.data.completedAt).not.toBeNull();
      expect(completeRes.data.history.length).toBeGreaterThan(0);
      const lastTransition = completeRes.data.history[completeRes.data.history.length - 1];
      expect(lastTransition.toStatus || lastTransition.status).toBe('done');
      day1OccRevision = completeRes.data.revision;
    });

    it('triggers reversible undo: reopens occurrence to pending and clears completedAt', async () => {
      const occId = computeDeterministicOccurrenceId(workspaceAId, routine1Id, day1Date);

      const reopenRes = await clientA.reopenOccurrence(workspaceAId, occId, {
        baseRevision: day1OccRevision,
      });

      expect(reopenRes.data.status).toBe('pending');
      expect(reopenRes.data.completedAt).toBeNull();
      day1OccRevision = reopenRes.data.revision;

      // Complete it again so Day 1 is recorded as completed
      const finalComplete = await clientA.completeOccurrence(workspaceAId, occId, {
        baseRevision: day1OccRevision,
      });
      expect(finalComplete.data.status).toBe('done');
      expect(finalComplete.data.completedAt).not.toBeNull();
      day1OccRevision = finalComplete.data.revision;
    });

    it('advances to day 2: generates fresh occurrence while preserving day 1 completion in history', async () => {
      // Generate Day 2 occurrence
      const genDay2 = await clientA.generateOccurrences(workspaceAId, {
        routineId: routine1Id,
        startDate: day2Date,
        endDate: day2Date,
      });

      expect(genDay2.data).toHaveLength(1);
      const day2Occ = genDay2.data[0];
      expect(day2Occ.scheduledDate).toBe(day2Date);
      expect(day2Occ.status).toBe('pending');

      // Skip Day 2 occurrence
      const skipRes = await clientA.skipOccurrence(workspaceAId, day2Occ.id, {
        baseRevision: day2Occ.revision,
      });
      expect(skipRes.data.status).toBe('skipped');

      // Now query history across both days [day1Date, day2Date]
      const historyRes = await clientA.listOccurrences(workspaceAId, {
        routineId: routine1Id,
        startDate: day1Date,
        endDate: day2Date,
      });

      expect(historyRes.data).toHaveLength(2);
      const day1History = historyRes.data.find((o) => o.scheduledDate === day1Date);
      const day2History = historyRes.data.find((o) => o.scheduledDate === day2Date);

      // Invariant: Yesterday's completion is completely preserved
      expect(day1History).toBeDefined();
      expect(day1History?.status).toBe('done');
      expect(day1History?.completedAt).not.toBeNull();

      // Day 2 is recorded as skipped
      expect(day2History).toBeDefined();
      expect(day2History?.status).toBe('skipped');
    });

    it('calculates gentle progress without punitive streak shaming', () => {
      // Occurrences: 1 completed, 1 skipped
      const mockOccurrences = [{ status: 'done' as const }, { status: 'skipped' as const }];

      const progress = calculateGentleProgress(mockOccurrences);
      expect(progress.completedCount).toBe(1);
      expect(progress.skippedCount).toBe(1);
      expect(progress.totalScheduled).toBe(2);
      expect(progress.completionRate).toBe(50);
      expect(progress.message).toContain('1 completed, 1 skipped today.');

      // Zero completed, only ready
      const pendingOnly = [{ status: 'pending' as const }, { status: 'pending' as const }];
      const progressPending = calculateGentleProgress(pendingOnly);
      expect(progressPending.message).toBe('2 routines ready for today.');

      // All completed
      const allDone = [{ status: 'done' as const }, { status: 'done' as const }];
      const progressDone = calculateGentleProgress(allDone);
      expect(progressDone.isAllCompleted).toBe(true);
      expect(progressDone.message).toContain('Well done!');
    });
  });

  describe('Schedule Modifications and History Preservation', () => {
    it('explains schedule change impact and protects historical occurrences', () => {
      const explanation = explainScheduleChangeImpact('2026-10-25', '2026-10-20');
      expect(explanation).toContain('2026-10-25');
      expect(explanation).toContain('Past completed and skipped history is preserved');

      const existingRule: RoutineTemplateRule = {
        id: 'r_schedule_test',
        workspaceId: workspaceAId,
        folderId: null,
        title: 'Exercise Routine',
        details: null,
        frequency: 'daily',
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        timezone: 'America/New_York',
        scheduledTime: '07:00',
        activeFrom: '2026-10-01',
        activeTo: null,
        isPaused: false,
        isArchived: false,
        scheduleRevision: 1,
        effectiveDate: '2026-10-01',
      };

      const newRule: RoutineTemplateRule = {
        ...existingRule,
        frequency: 'weekdays',
        weekdays: [1, 2, 3, 4, 5],
        scheduleRevision: 2,
        effectiveDate: '2026-10-25',
      };

      // Reconcile occurrences on schedule change
      const pastOccurrences: RoutineOccurrence[] = [
        {
          id: 'occ_past_1',
          workspaceId: workspaceAId,
          routineId: existingRule.id,
          scheduledDate: '2026-10-20',
          scheduleRevision: 1,
          plannedInstant: null,
          timezone: 'America/New_York',
          status: 'done',
          completedAt: '2026-10-20T07:15:00.000Z',
          completedBy: userAId,
          history: [],
          serverRevision: 1,
          revision: 1,
          createdAt: '2026-10-20T07:00:00.000Z',
          updatedAt: '2026-10-20T07:15:00.000Z',
        },
        {
          id: 'occ_future_weekend',
          workspaceId: workspaceAId,
          routineId: existingRule.id,
          scheduledDate: '2026-10-25', // Sunday
          scheduleRevision: 1,
          plannedInstant: null,
          timezone: 'America/New_York',
          status: 'pending',
          completedAt: null,
          completedBy: null,
          history: [],
          serverRevision: 1,
          revision: 1,
          createdAt: '2026-10-20T07:00:00.000Z',
          updatedAt: '2026-10-20T07:00:00.000Z',
        },
      ];

      const { retained, cancelledOccurrences } = reconcileOccurrencesOnScheduleChange(
        pastOccurrences,
        newRule,
        '2026-10-25'
      );

      // Past done occurrence is retained
      expect(retained.some((o) => o.id === 'occ_past_1')).toBe(true);
      // Future Sunday occurrence not in weekdays rule is cancelled
      expect(cancelledOccurrences.some((o) => o.id === 'occ_future_weekend')).toBe(true);
    });

    it('explains why routine is due today with structured cadence notes', () => {
      const routine: Pick<
        RoutineTemplateRule,
        | 'frequency'
        | 'weekdays'
        | 'scheduledTime'
        | 'timezone'
        | 'activeFrom'
        | 'activeTo'
        | 'isPaused'
        | 'isArchived'
      > = {
        frequency: 'weekdays',
        weekdays: [1, 2, 3, 4, 5],
        scheduledTime: '09:00',
        timezone: 'America/New_York',
        activeFrom: '2026-10-01',
        activeTo: null,
        isPaused: false,
        isArchived: false,
      };

      // 2026-10-20 is a Tuesday (weekday 2)
      const explanationTuesday = explainWhyDueToday(routine, '2026-10-20');
      expect(explanationTuesday.isDue).toBe(true);
      expect(explanationTuesday.cadenceDescription).toBe('Repeats weekdays (Mon–Fri) at 09:00');
      expect(explanationTuesday.reason).toContain('Due today');

      // 2026-10-25 is a Sunday (weekday 7)
      const explanationSunday = explainWhyDueToday(routine, '2026-10-25');
      expect(explanationSunday.isDue).toBe(false);
      expect(explanationSunday.reason).toContain('Not scheduled for today');
    });
  });

  describe('Separation of Daily Routines and Tasks Due Today', () => {
    it('verifies task domain helpers strictly isolate one-off tasks from recurring routines', () => {
      const refDate = new Date('2026-10-20T14:00:00.000Z');
      const timezone = 'America/New_York';

      // Task with today deadline
      const taskDueToday = {
        status: 'pending' as const,
        deadline: {
          type: 'date' as const,
          date: '2026-10-20',
        },
      };

      // Task with past deadline (overdue)
      const taskOverdue = {
        status: 'pending' as const,
        deadline: {
          type: 'date' as const,
          date: '2026-10-18',
        },
      };

      // Routine is recurring by template rule; tasks are evaluated by discrete deadline
      expect(isTaskDueToday(taskDueToday, refDate, timezone)).toBe(true);
      expect(isTaskOverdue(taskOverdue, refDate, timezone)).toBe(true);
      expect(isTaskDueToday(taskOverdue, refDate, timezone)).toBe(false);
    });
  });

  describe('Tenant Isolation Verification', () => {
    it('prevents workspace B from accessing workspace A routines and occurrences', async () => {
      const routinesA = await clientA.listRoutines(workspaceAId);
      expect(routinesA.data.length).toBeGreaterThan(0);
      const routineA = routinesA.data[0];

      // User B lists Workspace B routines (should be empty, not contain A's)
      const routinesB = await clientB.listRoutines(workspaceBId);
      expect(routinesB.data.some((r) => r.id === routineA.id)).toBe(false);

      // User B attempts to access Workspace A's routine (should fail with 403 or 404)
      await expect(clientB.getRoutine(workspaceBId, routineA.id)).rejects.toThrow();

      // User B attempts to complete Workspace A's occurrence in workspace B
      const occId = computeDeterministicOccurrenceId(workspaceAId, routineA.id, '2026-10-20');
      await expect(
        clientB.completeOccurrence(workspaceBId, occId, { baseRevision: 1 })
      ).rejects.toThrow();

      // User B attempts to skip Workspace A's occurrence
      await expect(
        clientB.skipOccurrence(workspaceBId, occId, { baseRevision: 1 })
      ).rejects.toThrow();
    });
  });

  describe('Local IndexedDB Repository & Offline Support', () => {
    it('persists routine and occurrence locally in IndexedDB', async () => {
      await clearAllLocalData();
      setTrustedDeviceConsent(true);

      const repo = new IndexedDbLocalRepository();
      await repo.initialize({
        userId: userAId,
        workspaceId: workspaceAId,
      });

      const testRoutine = {
        id: crypto.randomUUID(),
        workspaceId: workspaceAId,
        folderId: null,
        title: 'Local Focus Session',
        details: 'Testing offline persistence',
        frequency: 'daily' as const,
        weekdays: [1, 2, 3, 4, 5, 6, 7] as (1 | 2 | 3 | 4 | 5 | 6 | 7)[],
        timezone: 'America/New_York',
        scheduledTime: '10:00',
        activeFrom: '2026-10-01',
        activeTo: null,
        effectiveDate: '2026-10-01',
        isPaused: false,
        isArchived: false,
        isPinned: false,
        scheduleRevision: 1,
        serverRevision: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      await repo.upsertRoutine(testRoutine);
      const loaded = await repo.getRoutine(workspaceAId, testRoutine.id);
      expect(loaded).toBeDefined();
      expect(loaded?.title).toBe('Local Focus Session');

      // Local occurrence
      const testOcc = {
        id: computeDeterministicOccurrenceId(workspaceAId, testRoutine.id, '2026-10-20'),
        workspaceId: workspaceAId,
        routineId: testRoutine.id,
        scheduledDate: '2026-10-20',
        scheduleRevision: 1,
        plannedInstant: null,
        timezone: 'America/New_York',
        status: 'pending' as const,
        completedAt: null,
        completedBy: null,
        history: [],
        serverRevision: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await repo.upsertRoutineOccurrence(testOcc);
      const loadedOcc = await repo.getRoutineOccurrence(workspaceAId, testOcc.id);
      expect(loadedOcc).toBeDefined();
      expect(loadedOcc?.status).toBe('pending');

      await repo.close();
    });
  });

  describe('Phase 20-21 Defect Repair Verification', () => {
    it('ensures routine creation generates occurrences that strictly remain pending without completeOccurrence mutation', async () => {
      const routineRes = await clientA.createRoutine(workspaceAId, {
        title: 'Pending Generation Verification',
        details: 'Verify newly generated occurrences remain pending.',
        frequency: 'daily',
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        timezone: 'America/New_York',
        scheduledTime: '09:00',
        activeFrom: '2026-11-01',
      });

      expect(routineRes.data).toBeDefined();
      const rId = routineRes.data.id;

      const genRes = await clientA.generateOccurrences(workspaceAId, {
        routineId: rId,
        startDate: '2026-11-01',
        endDate: '2026-11-07',
      });

      expect(genRes.data.length).toBe(7);
      for (const occ of genRes.data) {
        expect(occ.status).toBe('pending');
        expect(occ.completedAt).toBeNull();
        expect(occ.completedBy).toBeNull();
        expect(occ.history).toEqual([]);
      }
    });

    it('handles compensating undo preserving monotonic audit trail across transitions', async () => {
      const routineRes = await clientA.createRoutine(workspaceAId, {
        title: 'Compensating Undo Verification',
        frequency: 'daily',
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        timezone: 'America/New_York',
        scheduledTime: '10:00',
        activeFrom: '2026-11-10',
      });
      const rId = routineRes.data.id;
      const scheduledDate = '2026-11-10';

      const genRes = await clientA.generateOccurrences(workspaceAId, {
        routineId: rId,
        startDate: scheduledDate,
        endDate: scheduledDate,
      });
      const occ = genRes.data[0];
      expect(occ.status).toBe('pending');

      // 1. Complete occurrence
      const completed = await clientA.completeOccurrence(workspaceAId, occ.id, {
        baseRevision: occ.revision,
      });
      expect(completed.data.status).toBe('done');
      expect(completed.data.history.length).toBe(1);
      expect(completed.data.history[0].toStatus || completed.data.history[0].status).toBe('done');

      // 2. Compensating reopen (undo)
      const reopened = await clientA.reopenOccurrence(workspaceAId, occ.id, {
        baseRevision: completed.data.revision,
      });
      expect(reopened.data.status).toBe('pending');
      expect(reopened.data.completedAt).toBeNull();
      // History must preserve both transitions rather than wiping history
      expect(reopened.data.history.length).toBe(2);
      const [t1, t2] = reopened.data.history;
      expect(t1.toStatus || t1.status).toBe('done');
      expect(t2.toStatus || t2.status).toBe('pending');
    });

    it('handles offline complete followed by reopen sync with offlineMeta without 404', async () => {
      const routineRes = await clientA.createRoutine(workspaceAId, {
        title: 'Offline Sync Reopen Verification',
        frequency: 'daily',
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        timezone: 'UTC',
        scheduledTime: '12:00',
        activeFrom: '2026-11-15',
      });
      const routineId = routineRes.data.id;
      const scheduledDate = '2026-11-15';
      const offlineOccId = computeDeterministicOccurrenceId(workspaceAId, routineId, scheduledDate);
      const deviceId = crypto.randomUUID();

      // Push completeOccurrence followed by reopenOccurrence via syncPush
      const op1Id = crypto.randomUUID();
      const op2Id = crypto.randomUUID();

      const pushRes = await clientA.syncPush({
        commands: [
          {
            operationId: op1Id,
            deviceId,
            workspaceId: workspaceAId,
            commandVersion: 1,
            schemaVersion: 1,
            command: 'completeOccurrence',
            entityType: 'routine_occurrence',
            entityId: offlineOccId,
            baseRevision: 0,
            dependencyOperationIds: [],
            clientTimestamp: new Date().toISOString(),
            payload: {
              routineId,
              scheduledDate,
              history: [
                {
                  fromStatus: 'pending',
                  toStatus: 'done',
                  status: 'done',
                  changedAt: new Date().toISOString(),
                  transitionedAt: new Date().toISOString(),
                  actorId: userAId,
                },
              ],
            },
          },
          {
            operationId: op2Id,
            deviceId,
            workspaceId: workspaceAId,
            commandVersion: 1,
            schemaVersion: 1,
            command: 'reopenOccurrence',
            entityType: 'routine_occurrence',
            entityId: offlineOccId,
            baseRevision: 1,
            dependencyOperationIds: [op1Id],
            clientTimestamp: new Date().toISOString(),
            payload: {
              routineId,
              scheduledDate,
              history: [
                {
                  fromStatus: 'done',
                  toStatus: 'pending',
                  status: 'pending',
                  changedAt: new Date().toISOString(),
                  transitionedAt: new Date().toISOString(),
                  actorId: userAId,
                  reason: 'Compensating undo action',
                },
              ],
            },
          },
        ],
      });

      expect(pushRes.data.results).toHaveLength(2);
      expect(pushRes.data.results[0].status).toBe('accepted');
      expect(pushRes.data.results[1].status).toBe('accepted');

      // Verify the resulting occurrence is pending in DB
      const occList = await clientA.listOccurrences(workspaceAId, {
        routineId,
        startDate: scheduledDate,
        endDate: scheduledDate,
      });
      expect(occList.data).toHaveLength(1);
      const syncedOcc = occList.data[0];
      expect(syncedOcc.status).toBe('pending');
      expect(syncedOcc.completedAt).toBeNull();
    });

    it('evaluates scheduling-zone policy: occurrence date derives from routine timezone rather than viewing timezone', () => {
      // Instant: 2026-10-20T22:30:00.000Z
      const instant = new Date('2026-10-20T22:30:00.000Z');

      // Routine timezone: Asia/Tokyo (UTC+9) -> 2026-10-21 07:30:00
      const routineTz = 'Asia/Tokyo';
      const routineDate = getCalendarDateInTimezone(instant, routineTz);
      expect(routineDate).toBe('2026-10-21');

      // Viewing timezone: America/New_York (UTC-4) -> 2026-10-20 18:30:00
      const viewingTz = 'America/New_York';
      const viewingDate = getCalendarDateInTimezone(instant, viewingTz);
      expect(viewingDate).toBe('2026-10-20');

      // Scheduling policy invariant: occurrence date MUST be evaluated with routine.timezone
      expect(routineDate).not.toBe(viewingDate);
    });

    it('handles rapid successive actions (complete -> undo -> skip) maintaining correct revision ordering', async () => {
      const routineRes = await clientA.createRoutine(workspaceAId, {
        title: 'Rapid Actions Verification',
        frequency: 'daily',
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        timezone: 'UTC',
        scheduledTime: '15:00',
        activeFrom: '2026-11-20',
      });
      const rId = routineRes.data.id;
      const scheduledDate = '2026-11-20';

      const genRes = await clientA.generateOccurrences(workspaceAId, {
        routineId: rId,
        startDate: scheduledDate,
        endDate: scheduledDate,
      });
      let currentOcc = genRes.data[0];
      const initialRev = currentOcc.revision;

      // 1. Complete
      const compRes = await clientA.completeOccurrence(workspaceAId, currentOcc.id, {
        baseRevision: currentOcc.revision,
      });
      expect(compRes.data.status).toBe('done');
      expect(compRes.data.revision).toBeGreaterThan(initialRev);
      currentOcc = compRes.data;

      // 2. Undo (Reopen)
      const reopenRes = await clientA.reopenOccurrence(workspaceAId, currentOcc.id, {
        baseRevision: currentOcc.revision,
      });
      expect(reopenRes.data.status).toBe('pending');
      expect(reopenRes.data.revision).toBeGreaterThan(compRes.data.revision);
      currentOcc = reopenRes.data;

      // 3. Skip
      const skipRes = await clientA.skipOccurrence(workspaceAId, currentOcc.id, {
        baseRevision: currentOcc.revision,
      });
      expect(skipRes.data.status).toBe('skipped');
      expect(skipRes.data.revision).toBeGreaterThan(reopenRes.data.revision);
      expect(skipRes.data.history.length).toBe(3);
    });
  });
});
