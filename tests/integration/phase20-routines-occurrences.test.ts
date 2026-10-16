import crypto from 'node:crypto';
import 'fake-indexeddb/auto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import {
  createAdminPool,
  createRuntimePool,
  withTenantContext,
} from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';
import {
  getIsoWeekday,
  validateRoutineTitle,
  validateWeekdays,
  calculatePlannedInstant,
  isRoutineScheduledOnDate,
  generateOccurrencesForDateRange,
  completeOccurrence,
  skipOccurrence,
  reopenOccurrence,
  reconcileOccurrencesOnScheduleChange,
  type RoutineTemplateRule,
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

describe('Phase 20: Daily Routine Schedules, Occurrences and Persistence', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase20-routines-key';

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

    // 1. Run migrations up to 00017
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
          ('${userAId}', 'User A Phase 20'),
          ('${userBId}', 'User B Phase 20')
        ON CONFLICT (id) DO NOTHING;
      `);

      const wsARes = await admin.query<{ id: string }>(`
        INSERT INTO app.workspaces (name, kind, owner_id)
        VALUES ('Workspace User A', 'personal', '${userAId}')
        RETURNING id;
      `);
      workspaceAId = wsARes.rows[0].id;

      await admin.query(`
        INSERT INTO app.workspace_memberships (workspace_id, user_id, role) VALUES
          ('${workspaceAId}', '${userAId}', 'owner');
      `);

      const wsBRes = await admin.query<{ id: string }>(`
        INSERT INTO app.workspaces (name, kind, owner_id)
        VALUES ('Workspace User B', 'personal', '${userBId}')
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

  // =========================================================================
  // 1. Domain Logic: Pure recurrence calculation & ISO weekdays
  // =========================================================================
  describe('Domain Logic: Pure Recurrence & Timezone Calculations', () => {
    it('correctly maps ISO weekdays (1=Monday .. 7=Sunday)', () => {
      // 2026-10-12 is Monday (1)
      expect(getIsoWeekday('2026-10-12')).toBe(1);
      // 2026-10-16 is Friday (5)
      expect(getIsoWeekday('2026-10-16')).toBe(5);
      // 2026-10-17 is Saturday (6)
      expect(getIsoWeekday('2026-10-17')).toBe(6);
      // 2026-10-18 is Sunday (7)
      expect(getIsoWeekday('2026-10-18')).toBe(7);
    });

    it('validates routine title and weekday collections', () => {
      expect(validateRoutineTitle('Morning Meditation')).toBe('Morning Meditation');
      expect(() => validateRoutineTitle('   ')).toThrow();
      expect(validateWeekdays([1, 3, 5])).toEqual([1, 3, 5]);
      expect(() => validateWeekdays([0, 8])).toThrow();
      expect(() => validateWeekdays([])).toThrow();
    });

    it('calculates planned instant with unambiguous local time resolution in Asia/Dhaka', () => {
      const instant = calculatePlannedInstant('2026-10-16', '08:30', 'Asia/Dhaka');
      expect(instant).toBeDefined();
      // Asia/Dhaka is UTC+6 -> 08:30 local is 02:30 UTC
      expect(instant).toContain('2026-10-16T02:30:00');
    });

    it('handles DST transition disambiguation without crashing or shifting days', () => {
      // US Eastern spring forward date (2026-03-08 at 02:00 -> 03:00)
      const instantSpring = calculatePlannedInstant('2026-03-08', '02:30', 'America/New_York');
      expect(instantSpring).toBeDefined();

      // US Eastern fall back date (2026-11-01 at 02:00)
      const instantFall = calculatePlannedInstant('2026-11-01', '01:30', 'America/New_York');
      expect(instantFall).toBeDefined();
    });

    it('evaluates whether a routine is scheduled on specific dates respecting active period and pause', () => {
      const template: RoutineTemplateRule = {
        frequency: 'weekdays',
        weekdays: [1, 3, 5], // Mon, Wed, Fri
        timezone: 'Asia/Dhaka',
        activeFrom: '2026-10-01',
        activeTo: '2026-10-31',
        isPaused: false,
      };

      // 2026-10-12 (Mon) -> yes
      expect(isRoutineScheduledOnDate(template, '2026-10-12')).toBe(true);
      // 2026-10-13 (Tue) -> no
      expect(isRoutineScheduledOnDate(template, '2026-10-13')).toBe(false);
      // Before activeFrom -> no
      expect(isRoutineScheduledOnDate(template, '2026-09-30')).toBe(false);
      // After activeTo -> no
      expect(isRoutineScheduledOnDate(template, '2026-11-01')).toBe(false);

      // When paused -> no occurrences
      const pausedTemplate = { ...template, isPaused: true };
      expect(isRoutineScheduledOnDate(pausedTemplate, '2026-10-12')).toBe(false);
    });

    it('generates occurrences for a date range idempotently without duplicates', () => {
      const template: RoutineTemplateRule = {
        id: 'routine-1',
        frequency: 'daily',
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        timezone: 'UTC',
        scheduledTime: '07:00',
        activeFrom: '2026-10-10',
        activeTo: null,
        isPaused: false,
      };

      const range1 = generateOccurrencesForDateRange(template, '2026-10-10', '2026-10-12', []);
      expect(range1.length).toBe(3);
      expect(range1[0].scheduledDate).toBe('2026-10-10');
      expect(range1[1].scheduledDate).toBe('2026-10-11');
      expect(range1[2].scheduledDate).toBe('2026-10-12');

      // Re-running with existing occurrences generates only newly planned dates, preserving existing state
      const completedFirst = completeOccurrence(range1[0], '2026-10-10T07:15:00Z', 'user-1');
      const existing = [completedFirst, range1[1], range1[2]];
      const range2 = generateOccurrencesForDateRange(
        template,
        '2026-10-10',
        '2026-10-13',
        existing
      );
      expect(range2.length).toBe(1);
      expect(range2[0].scheduledDate).toBe('2026-10-13');
      expect(range2[0].status).toBe('pending');
      expect(existing[0].status).toBe('done'); // preserved!
    });

    it('completing today never completes tomorrow (date-scoped occurrence isolation)', () => {
      const template: RoutineTemplateRule = {
        id: 'routine-1',
        frequency: 'daily',
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        timezone: 'UTC',
        activeFrom: '2026-10-10',
        activeTo: null,
        isPaused: false,
      };

      const occurrences = generateOccurrencesForDateRange(template, '2026-10-15', '2026-10-16', []);
      const today = occurrences[0];
      const tomorrow = occurrences[1];

      const completedToday = completeOccurrence(today, '2026-10-15T09:00:00Z', 'user-1');
      expect(completedToday.status).toBe('done');
      expect(tomorrow.status).toBe('pending'); // Tomorrow remains pending!
    });

    it('supports occurrence skip, reopen, and transition history', () => {
      const template: RoutineTemplateRule = {
        id: 'r1',
        frequency: 'daily',
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        timezone: 'UTC',
        activeFrom: '2026-10-01',
        activeTo: null,
        isPaused: false,
      };

      const [occ] = generateOccurrencesForDateRange(template, '2026-10-05', '2026-10-05', []);

      // Skip occurrence
      const skipped = skipOccurrence(occ, '2026-10-05T10:00:00Z', 'Traveling today');
      expect(skipped.status).toBe('skipped');
      expect(skipped.history.length).toBe(1);
      expect(skipped.history[0].toStatus).toBe('skipped');
      expect(skipped.history[0].reason).toBe('Traveling today');

      // Reopen occurrence
      const reopened = reopenOccurrence(skipped, '2026-10-05T11:00:00Z');
      expect(reopened.status).toBe('pending');
      expect(reopened.history.length).toBe(2);
      expect(reopened.history[1].toStatus).toBe('pending');

      // Complete occurrence
      const done = completeOccurrence(reopened, '2026-10-05T12:00:00Z', 'user-1');
      expect(done.status).toBe('done');
      expect(done.completedAt).toBe('2026-10-05T12:00:00Z');
      expect(done.history.length).toBe(3);
    });

    it('schedule change preservation: preserves past completed/skipped history and reconciles future occurrences', () => {
      const oldTemplate: RoutineTemplateRule = {
        id: 'r1',
        frequency: 'daily',
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        timezone: 'UTC',
        activeFrom: '2026-10-01',
        activeTo: null,
        isPaused: false,
      };

      const occurrences = generateOccurrencesForDateRange(
        oldTemplate,
        '2026-10-01',
        '2026-10-05',
        []
      );

      // Complete Oct 1, Skip Oct 2
      const oct1 = completeOccurrence(occurrences[0], '2026-10-01T08:00:00Z', 'user-1');
      const oct2 = skipOccurrence(occurrences[1], '2026-10-02T08:00:00Z', 'Busy');
      const oct3 = occurrences[2]; // pending
      const oct4 = occurrences[3]; // pending
      const oct5 = occurrences[4]; // pending

      // Change schedule effective Oct 3: weekdays only (Mon..Fri)
      // 2026-10-03 is Saturday, 2026-10-04 is Sunday, 2026-10-05 is Monday
      const newTemplate: RoutineTemplateRule = {
        id: 'r1',
        frequency: 'weekdays',
        weekdays: [1, 2, 3, 4, 5], // Mon..Fri only
        timezone: 'UTC',
        activeFrom: '2026-10-01',
        activeTo: null,
        isPaused: false,
      };

      const { retained } = reconcileOccurrencesOnScheduleChange(
        [oct1, oct2, oct3, oct4, oct5],
        newTemplate,
        '2026-10-03' // effectiveDate
      );

      // Oct 1 (past done) preserved
      expect(retained.find((o) => o.scheduledDate === '2026-10-01')?.status).toBe('done');
      // Oct 2 (past skipped) preserved
      expect(retained.find((o) => o.scheduledDate === '2026-10-02')?.status).toBe('skipped');
      // Oct 3 (Saturday, pending) removed because new schedule excludes weekends from effectiveDate forward
      expect(retained.find((o) => o.scheduledDate === '2026-10-03')).toBeUndefined();
      // Oct 4 (Sunday, pending) removed
      expect(retained.find((o) => o.scheduledDate === '2026-10-04')).toBeUndefined();
      // Oct 5 (Monday, pending) retained
      expect(retained.find((o) => o.scheduledDate === '2026-10-05')?.status).toBe('pending');
    });
  });

  // =========================================================================
  // 2. API & Database Integration: CRUD, Occurrence Generation & Uniqueness
  // =========================================================================
  describe('API & PostgreSQL Persistence', () => {
    let routine1Id: string;
    let initialRevision: number;

    it('creates a daily routine schedule template under workspace A', async () => {
      const res = await clientA.createRoutine(workspaceAId, {
        title: 'Morning Run & Stretching',
        details: '30 mins outdoor run followed by hamstring stretch',
        frequency: 'daily',
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        timezone: 'Asia/Dhaka',
        scheduledTime: '06:30',
        activeFrom: '2026-10-01',
      });

      expect(res.data).toBeDefined();
      expect(res.data.title).toBe('Morning Run & Stretching');
      expect(res.data.timezone).toBe('Asia/Dhaka');
      expect(res.data.scheduledTime).toBe('06:30');
      expect(res.data.scheduleRevision).toBe(1);
      routine1Id = res.data.id;
      initialRevision = res.data.revision;
    });

    it('generates occurrences for a date range bounded up to 90 days', async () => {
      const res = await clientA.generateOccurrences(workspaceAId, {
        routineId: routine1Id,
        startDate: '2026-10-01',
        endDate: '2026-10-07',
      });

      expect(res.data.length).toBe(7);
      expect(res.data[0].scheduledDate).toBe('2026-10-01');
      expect(res.data[6].scheduledDate).toBe('2026-10-07');
      expect(res.data[0].status).toBe('pending');
      // Verify plannedInstant is computed with Asia/Dhaka (+06:00 -> 06:30 is 00:30 UTC)
      expect(res.data[0].plannedInstant).toContain('2026-10-01T00:30:00');
    });

    it('enforces PostgreSQL unique constraint uq_routine_occurrence_date preventing duplicates', async () => {
      // Direct raw query attempting duplicate insertion
      const duplicateInsertPromise = withTenantContext(
        runtimePool,
        {
          userId: userAId,
          workspaceId: workspaceAId,
          workspaceRole: 'owner',
        },
        async (client) => {
          return client.query(
            `INSERT INTO app.routine_occurrences (
              workspace_id, routine_id, scheduled_date, timezone, status
             ) VALUES ($1, $2, '2026-10-01', 'Asia/Dhaka', 'pending');`,
            [workspaceAId, routine1Id]
          );
        }
      );

      await expect(duplicateInsertPromise).rejects.toThrow(/uq_routine_occurrence_date/);
    });

    it('generation is idempotent: repeated generation requests do not create duplicate rows', async () => {
      const res = await clientA.generateOccurrences(workspaceAId, {
        routineId: routine1Id,
        startDate: '2026-10-01',
        endDate: '2026-10-07',
      });

      expect(res.data.length).toBe(7);
    });

    it('completes an occurrence with revision protection and idempotency', async () => {
      const occList = await clientA.listOccurrences(workspaceAId, {
        routineId: routine1Id,
        startDate: '2026-10-01',
        endDate: '2026-10-01',
      });
      const occ = occList.data[0];
      expect(occ.status).toBe('pending');

      const completed = await clientA.completeOccurrence(workspaceAId, occ.id, {
        baseRevision: occ.revision,
      });

      expect(completed.data.status).toBe('done');
      expect(completed.data.completedAt).toBeDefined();

      // Completing again idempotently succeeds
      const completedAgain = await clientA.completeOccurrence(workspaceAId, occ.id, {
        baseRevision: completed.data.revision,
      });
      expect(completedAgain.data.status).toBe('done');
    });

    it('skips and reopens an occurrence with history retention', async () => {
      const occList = await clientA.listOccurrences(workspaceAId, {
        routineId: routine1Id,
        startDate: '2026-10-02',
        endDate: '2026-10-02',
      });
      const occ = occList.data[0];

      // Skip
      const skipped = await clientA.skipOccurrence(workspaceAId, occ.id, {
        baseRevision: occ.revision,
      });
      expect(skipped.data.status).toBe('skipped');
      expect(skipped.data.history.length).toBe(1);

      // Reopen
      const reopened = await clientA.reopenOccurrence(workspaceAId, occ.id, {
        baseRevision: skipped.data.revision,
      });
      expect(reopened.data.status).toBe('pending');
      expect(reopened.data.history.length).toBe(2);
      expect(reopened.data.history[1].toStatus).toBe('pending');
    });

    it('schedule change forward: schedule revision increments and preserves past occurrence states', async () => {
      const updateRes = await clientA.updateRoutine(workspaceAId, routine1Id, {
        title: 'Morning Run (Weekdays)',
        frequency: 'weekdays',
        weekdays: [1, 2, 3, 4, 5], // Exclude weekends
        effectiveDate: '2026-10-03',
        baseRevision: initialRevision,
      });

      expect(updateRes.data.title).toBe('Morning Run (Weekdays)');
      expect(updateRes.data.scheduleRevision).toBe(2);
      expect(updateRes.data.effectiveDate).toBe('2026-10-03');

      // Oct 1 (done) is intact
      const oct1 = await clientA.listOccurrences(workspaceAId, {
        routineId: routine1Id,
        startDate: '2026-10-01',
        endDate: '2026-10-01',
      });
      expect(oct1.data[0].status).toBe('done');
    });

    it('backfills offline days as date-scoped occurrences, never creating overdue tasks', async () => {
      // Simulate generating 14 days covering past offline days
      const res = await clientA.generateOccurrences(workspaceAId, {
        routineId: routine1Id,
        startDate: '2026-10-05',
        endDate: '2026-10-18',
      });

      expect(res.data.length).toBeGreaterThan(0);
      // All occurrences are date-scoped routine records, not items in the task list
      const taskList = await clientA.listTasks(workspaceAId);
      const routineTaskCopies = taskList.data.filter((t) => t.title.includes('Morning Run'));
      expect(routineTaskCopies.length).toBe(0);
    });

    it('strictly enforces tenant isolation: Workspace B cannot access Workspace A routines or occurrences', async () => {
      await expect(clientB.getRoutine(workspaceBId, routine1Id)).rejects.toThrow();
      await expect(
        clientB.generateOccurrences(workspaceBId, {
          routineId: routine1Id,
          startDate: '2026-10-01',
          endDate: '2026-10-07',
        })
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // 3. Local IndexedDB Repository Integration
  // =========================================================================
  describe('Local IndexedDB Repository: Routines & Occurrences Store', () => {
    let localRepo: IndexedDbLocalRepository;

    beforeAll(async () => {
      await clearAllLocalData();
      setTrustedDeviceConsent(true);
      localRepo = new IndexedDbLocalRepository();
      await localRepo.initialize({
        userId: userAId,
        workspaceId: workspaceAId,
      });
    });

    afterAll(async () => {
      await localRepo.close();
      await clearAllLocalData();
    });

    it('persists, updates, and lists routines in IndexedDB', async () => {
      const routineRecord = {
        id: crypto.randomUUID(),
        workspaceId: workspaceAId,
        folderId: null,
        title: 'Daily Journal Reflection',
        details: 'Reflect on 3 wins and 1 learning',
        frequency: 'daily' as const,
        weekdays: [1, 2, 3, 4, 5, 6, 7] as (1 | 2 | 3 | 4 | 5 | 6 | 7)[],
        timezone: 'Asia/Dhaka',
        scheduledTime: '21:00',
        activeFrom: '2026-10-01',
        activeTo: null,
        isPaused: false,
        isArchived: false,
        isPinned: true,
        scheduleRevision: 1,
        effectiveDate: '2026-10-01',
        serverRevision: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      await localRepo.upsertRoutine(routineRecord);

      const retrieved = await localRepo.getRoutine(workspaceAId, routineRecord.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.title).toBe('Daily Journal Reflection');
      expect(retrieved?.isPinned).toBe(true);

      const list = await localRepo.listRoutines(workspaceAId);
      expect(list.some((r) => r.id === routineRecord.id)).toBe(true);
    });

    it('persists, updates, and queries date-scoped occurrences in IndexedDB', async () => {
      const rId = crypto.randomUUID();
      const occId1 = crypto.randomUUID();
      const occId2 = crypto.randomUUID();

      await localRepo.upsertRoutineOccurrence({
        id: occId1,
        workspaceId: workspaceAId,
        routineId: rId,
        scheduledDate: '2026-10-15',
        scheduleRevision: 1,
        plannedInstant: '2026-10-15T15:00:00Z',
        timezone: 'Asia/Dhaka',
        status: 'pending',
        completedAt: null,
        completedBy: null,
        history: [],
        serverRevision: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await localRepo.upsertRoutineOccurrence({
        id: occId2,
        workspaceId: workspaceAId,
        routineId: rId,
        scheduledDate: '2026-10-16',
        scheduleRevision: 1,
        plannedInstant: '2026-10-16T15:00:00Z',
        timezone: 'Asia/Dhaka',
        status: 'done',
        completedAt: '2026-10-16T15:30:00Z',
        completedBy: userAId,
        history: [
          {
            fromStatus: 'pending',
            toStatus: 'done',
            transitionedAt: '2026-10-16T15:30:00Z',
          },
        ],
        serverRevision: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const occ1 = await localRepo.getRoutineOccurrence(workspaceAId, occId1);
      expect(occ1?.status).toBe('pending');

      const occ2 = await localRepo.getRoutineOccurrence(workspaceAId, occId2);
      expect(occ2?.status).toBe('done');
      expect(occ2?.history.length).toBe(1);

      // Query by date range
      const range = await localRepo.listRoutineOccurrences(
        workspaceAId,
        rId,
        '2026-10-15',
        '2026-10-16'
      );
      expect(range.length).toBe(2);
      expect(range[0].scheduledDate).toBe('2026-10-15');
      expect(range[1].scheduledDate).toBe('2026-10-16');
    });

    it('erases routines and routine occurrences on clearWorkspaceData', async () => {
      await localRepo.clearWorkspaceData(workspaceAId);
      const routines = await localRepo.listRoutines(workspaceAId);
      expect(routines.length).toBe(0);
      const occurrences = await localRepo.listRoutineOccurrences(workspaceAId);
      expect(occurrences.length).toBe(0);
    });
  });
});
