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
  validateCalendarEventTitle,
  validateCalendarEventInterval,
  getDaysCoveredByAllDayEvent,
  buildMonthGrid,
  buildCalendarReadModel,
} from '@daynori/domain';
import type { CalendarEventRecord } from '@daynori/sync';
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

describe('Phase 26: Calendar and Deadline Views Integration Suite', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase26-calendar-key';

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

    // 2. Setup JWT keypair & tokens
    keyPair = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = kid;
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';
    jwks = { keys: [publicJwk] };

    tokenUserA = await createToken(userAId);
    tokenUserB = await createToken(userBId);

    // 3. Start API Server with in-memory verifier
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
      throw new Error('Failed to bind server address');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;

    // 4. API Clients
    clientA = createApiClient({ baseUrl, token: tokenUserA });
    clientB = createApiClient({ baseUrl, token: tokenUserB });

    // 5. Seed user profiles and workspaces
    const admin = await adminPool.connect();
    try {
      await admin.query(`
        INSERT INTO app.profiles (id, display_name) VALUES
          ('${userAId}', 'User A Phase 26'),
          ('${userBId}', 'User B Phase 26')
        ON CONFLICT (id) DO NOTHING;
      `);

      const wsARes = await admin.query<{ id: string }>(`
        INSERT INTO app.workspaces (name, kind, owner_id)
        VALUES ('Calendar Workspace A', 'personal', '${userAId}')
        RETURNING id;
      `);
      workspaceAId = wsARes.rows[0]!.id;

      await admin.query(`
        INSERT INTO app.workspace_memberships (workspace_id, user_id, role) VALUES
          ('${workspaceAId}', '${userAId}', 'owner');
      `);

      const wsBRes = await admin.query<{ id: string }>(`
        INSERT INTO app.workspaces (name, kind, owner_id)
        VALUES ('Calendar Workspace B', 'personal', '${userBId}')
        RETURNING id;
      `);
      workspaceBId = wsBRes.rows[0]!.id;

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
  // 1. Pure Domain Logic & Timezone Tests
  // =========================================================================
  describe('Domain Logic: Intervals, Grid Projections & Week-Start Preferences', () => {
    it('validates title and interval constraints', () => {
      expect(validateCalendarEventTitle(' Quarterly Architecture Review ')).toBe(
        'Quarterly Architecture Review'
      );
      expect(() => validateCalendarEventTitle('')).toThrow();
      expect(() => validateCalendarEventTitle('   ')).toThrow();

      // Valid all-day event
      expect(() =>
        validateCalendarEventInterval({
          title: 'All-Day Vacation',
          allDay: true,
          startDate: '2026-10-20',
          endDate: '2026-10-25',
          startAt: null,
          endAt: null,
          timezone: 'America/New_York',
        })
      ).not.toThrow();

      // Invalid all-day event: endDate <= startDate
      expect(() =>
        validateCalendarEventInterval({
          title: 'Invalid All-Day',
          allDay: true,
          startDate: '2026-10-20',
          endDate: '2026-10-20',
          startAt: null,
          endAt: null,
          timezone: 'America/New_York',
        })
      ).toThrow(/strictly after/i);

      // Valid timed event
      expect(() =>
        validateCalendarEventInterval({
          title: 'Planning Session',
          allDay: false,
          startDate: null,
          endDate: null,
          startAt: '2026-10-20T14:00:00.000Z',
          endAt: '2026-10-20T15:30:00.000Z',
          timezone: 'America/New_York',
        })
      ).not.toThrow();

      // Invalid timed event: endAt <= startAt
      expect(() =>
        validateCalendarEventInterval({
          title: 'Inverted Timed',
          allDay: false,
          startDate: null,
          endDate: null,
          startAt: '2026-10-20T15:00:00.000Z',
          endAt: '2026-10-20T14:00:00.000Z',
          timezone: 'America/New_York',
        })
      ).toThrow(/strictly after/i);
    });

    it('correctly calculates days covered by all-day events with exclusive end date', () => {
      // 2026-10-20 to 2026-10-23 covers 20th, 21st, 22nd (3 days total, 23rd is exclusive boundary)
      const days = getDaysCoveredByAllDayEvent('2026-10-20', '2026-10-23');
      expect(days).toEqual(['2026-10-20', '2026-10-21', '2026-10-22']);
    });

    it('respects week-start preference (Monday=1, Sunday=7, Saturday=6) when constructing month grid', () => {
      // October 2026: 2026-10-01 is a Thursday (ISO 4)
      // Monday start (1): First row starts with Monday Sep 28 (3 filler days)
      const monGrid = buildMonthGrid({
        year: 2026,
        month: 10,
        weekStart: 1,
        todayDate: '2026-10-17',
        items: [],
        journalIndicators: {},
        viewingTimezone: 'UTC',
      });
      expect(monGrid.length).toBeGreaterThanOrEqual(5);
      expect(monGrid[0]!.cells[0]!.date).toBe('2026-09-28'); // Monday
      expect(monGrid[0]!.cells[3]!.date).toBe('2026-10-01'); // Thursday

      // Sunday start (7): First row starts with Sunday Sep 27 (4 filler days)
      const sunGrid = buildMonthGrid({
        year: 2026,
        month: 10,
        weekStart: 7,
        todayDate: '2026-10-17',
        items: [],
        journalIndicators: {},
        viewingTimezone: 'UTC',
      });
      expect(sunGrid[0]!.cells[0]!.date).toBe('2026-09-27'); // Sunday
      expect(sunGrid[0]!.cells[4]!.date).toBe('2026-10-01'); // Thursday

      // Saturday start (6): First row starts with Saturday Sep 26 (5 filler days)
      const satGrid = buildMonthGrid({
        year: 2026,
        month: 10,
        weekStart: 6,
        todayDate: '2026-10-17',
        items: [],
        journalIndicators: {},
        viewingTimezone: 'UTC',
      });
      expect(satGrid[0]!.cells[0]!.date).toBe('2026-09-26'); // Saturday
      expect(satGrid[0]!.cells[5]!.date).toBe('2026-10-01'); // Thursday
    });

    it('preserves journal entry privacy in projected read model: count only, zero body/prompt exposure', () => {
      const readModel = buildCalendarReadModel({
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        timezone: 'America/New_York',
        tasks: [],
        routines: [],
        routineOccurrences: [],
        events: [],
        journalDates: [
          { date: '2026-10-16', count: 2 },
          { date: '2026-10-17', count: 1 },
        ],
      });

      expect(readModel.journalIndicators['2026-10-16']).toEqual({
        date: '2026-10-16',
        hasEntry: true,
        count: 2,
      });
      expect(readModel.journalIndicators['2026-10-17']).toEqual({
        date: '2026-10-17',
        hasEntry: true,
        count: 1,
      });
      expect(readModel.journalIndicators['2026-10-18']).toBeUndefined();

      // Ensure no private entry bodies or reflections exist anywhere on the indicator objects
      const indicatorStr = JSON.stringify(readModel.journalIndicators);
      expect(indicatorStr).not.toContain('body');
      expect(indicatorStr).not.toContain('prompt');
      expect(indicatorStr).not.toContain('reflection');
    });
  });

  // =========================================================================
  // 2. Personal Events REST API & Validation
  // =========================================================================
  describe('Personal Calendar Events REST API & PostgreSQL Persistence', () => {
    let createdAllDayEventId: string;
    let createdTimedEventId: string;

    it('creates an all-day personal calendar event with exclusive end date', async () => {
      const res = await clientA.createCalendarEvent(workspaceAId, {
        title: 'Team Offsite Planning',
        details: 'Review roadmap and strategic milestones',
        allDay: true,
        startDate: '2026-10-25',
        endDate: '2026-10-28', // 3 days: 25, 26, 27
        timezone: 'America/New_York',
      });

      expect(res.data.id).toBeDefined();
      expect(res.data.title).toBe('Team Offsite Planning');
      expect(res.data.allDay).toBe(true);
      expect(res.data.startDate).toBe('2026-10-25');
      expect(res.data.endDate).toBe('2026-10-28');
      expect(res.data.startAt).toBeNull();
      expect(res.data.endAt).toBeNull();
      expect(res.data.revision).toBe(1);

      createdAllDayEventId = res.data.id;
    });

    it('creates a timed personal calendar event with UTC ISO timestamps', async () => {
      const res = await clientA.createCalendarEvent(workspaceAId, {
        title: 'Architecture Sync Session',
        details: 'Deep dive into calendar projection algorithms',
        allDay: false,
        startAt: '2026-10-26T14:00:00.000Z',
        endAt: '2026-10-26T15:30:00.000Z',
        timezone: 'UTC',
      });

      expect(res.data.id).toBeDefined();
      expect(res.data.title).toBe('Architecture Sync Session');
      expect(res.data.allDay).toBe(false);
      expect(res.data.startAt).toBe('2026-10-26T14:00:00.000Z');
      expect(res.data.endAt).toBe('2026-10-26T15:30:00.000Z');
      expect(res.data.startDate).toBeNull();
      expect(res.data.endDate).toBeNull();
      expect(res.data.revision).toBe(1);

      createdTimedEventId = res.data.id;
    });

    it('rejects invalid or inverted intervals with 400 Bad Request', async () => {
      // Inverted all-day: end date is before start date
      await expect(
        clientA.createCalendarEvent(workspaceAId, {
          title: 'Inverted All-Day Event',
          allDay: true,
          startDate: '2026-10-28',
          endDate: '2026-10-25',
          timezone: 'America/New_York',
        })
      ).rejects.toThrow();

      // Zero-length all-day: end date equals start date
      await expect(
        clientA.createCalendarEvent(workspaceAId, {
          title: 'Zero Length All-Day Event',
          allDay: true,
          startDate: '2026-10-28',
          endDate: '2026-10-28',
          timezone: 'America/New_York',
        })
      ).rejects.toThrow();

      // Inverted timed: endAt is before startAt
      await expect(
        clientA.createCalendarEvent(workspaceAId, {
          title: 'Inverted Timed Event',
          allDay: false,
          startAt: '2026-10-26T16:00:00.000Z',
          endAt: '2026-10-26T15:00:00.000Z',
          timezone: 'UTC',
        })
      ).rejects.toThrow();
    });

    it('updates an existing calendar event and increments revision', async () => {
      const res = await clientA.updateCalendarEvent(workspaceAId, createdTimedEventId, {
        title: 'Architecture Sync (Extended)',
        endAt: '2026-10-26T16:00:00.000Z',
      });

      expect(res.data.title).toBe('Architecture Sync (Extended)');
      expect(res.data.endAt).toBe('2026-10-26T16:00:00.000Z');
      expect(res.data.revision).toBe(2);
    });

    it('fetches an event by ID and enforces workspace scoping', async () => {
      const res = await clientA.getCalendarEvent(workspaceAId, createdAllDayEventId);
      expect(res.data.id).toBe(createdAllDayEventId);
      expect(res.data.title).toBe('Team Offsite Planning');

      // User B cannot access User A's calendar event
      await expect(clientB.getCalendarEvent(workspaceBId, createdAllDayEventId)).rejects.toThrow();
    });

    it('deletes a calendar event and verifies subsequent 404', async () => {
      const delEvent = await clientA.createCalendarEvent(workspaceAId, {
        title: 'Temporary Discard Event',
        allDay: true,
        startDate: '2026-10-29',
        endDate: '2026-10-30',
        timezone: 'UTC',
      });

      await clientA.deleteCalendarEvent(workspaceAId, delEvent.data.id);
      await expect(clientA.getCalendarEvent(workspaceAId, delEvent.data.id)).rejects.toThrow();
    });
  });

  // =========================================================================
  // 3. Unified Aggregated Calendar Feed Integration
  // =========================================================================
  describe('Unified Aggregated Calendar Feed & Canonical Projections', () => {
    let taskWithDeadlineId: string;
    let routineScheduleId: string;

    it('aggregates canonical tasks, routines, and personal events without duplicating task tables', async () => {
      // 1. Create a task with a timed deadline in Workspace A
      const taskRes = await clientA.createTask(workspaceAId, {
        title: 'Deploy Production Release 1.0',
        priority: 'urgent',
        deadline: {
          type: 'timed',
          timestamp: '2026-10-26T12:00:00.000Z',
          timezone: 'America/New_York',
        },
      });
      taskWithDeadlineId = taskRes.data.id;

      // 2. Create a daily routine schedule in Workspace A
      const routineRes = await clientA.createRoutine(workspaceAId, {
        title: 'Daily Code Review',
        frequency: 'daily',
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        timezone: 'UTC',
        activeFrom: '2026-10-24',
        activeTo: '2026-10-30',
      });
      routineScheduleId = routineRes.data.id;

      await clientA.generateOccurrences(workspaceAId, {
        routineId: routineScheduleId,
        startDate: '2026-10-24',
        endDate: '2026-10-30',
      });

      // 3. Query aggregated feed for October 24-30
      const feed = await clientA.getCalendarFeed(workspaceAId, {
        startDate: '2026-10-24',
        endDate: '2026-10-30',
        timezone: 'UTC',
      });

      expect(feed.data.items.length).toBeGreaterThanOrEqual(3);

      // Verify task presence
      const taskItem = feed.data.items.find(
        (i) => i.sourceType === 'task_deadline' && i.taskId === taskWithDeadlineId
      );
      expect(taskItem).toBeDefined();
      expect(taskItem!.title).toBe('Deploy Production Release 1.0');
      expect(taskItem!.priority).toBe('urgent');
      expect(taskItem!.deadlineType).toBe('timed');

      // Verify routine presence
      const routineItem = feed.data.items.find((i) => i.sourceType === 'routine_occurrence');
      expect(routineItem).toBeDefined();
      expect(routineItem!.routineTitle).toBe('Daily Code Review');

      // Verify personal event presence
      const eventItem = feed.data.items.find(
        (i) => i.sourceType === 'calendar_event' && i.title.includes('Architecture Sync')
      );
      expect(eventItem).toBeDefined();

      // Assert no duplicate task table exists in the database
      const admin = await adminPool.connect();
      try {
        const tableCheck = await admin.query<{ count: string }>(`
          SELECT count(*) FROM information_schema.tables
          WHERE table_schema = 'app' AND table_name = 'calendar_tasks';
        `);
        expect(parseInt(tableCheck.rows[0]!.count, 10)).toBe(0);
      } finally {
        admin.release();
      }
    });

    it('updating a canonical task deadline immediately updates the calendar feed projection', async () => {
      // Move deadline to 2026-10-28
      await clientA.updateTask(workspaceAId, taskWithDeadlineId, {
        baseRevision: 1,
        deadline: {
          type: 'date',
          date: '2026-10-28',
        },
      });

      // Fetch feed
      const feed = await clientA.getCalendarFeed(workspaceAId, {
        startDate: '2026-10-24',
        endDate: '2026-10-30',
        timezone: 'UTC',
      });

      const updatedTaskItem = feed.data.items.find(
        (i) => i.sourceType === 'task_deadline' && i.taskId === taskWithDeadlineId
      );
      expect(updatedTaskItem).toBeDefined();
      expect(updatedTaskItem!.deadlineDate).toBe('2026-10-28');
      expect(updatedTaskItem!.deadlineType).toBe('date');

      // Clear deadline completely: task should no longer appear in calendar feed
      await clientA.updateTask(workspaceAId, taskWithDeadlineId, {
        baseRevision: 2,
        deadline: { type: 'none' },
      });

      const feedAfterClear = await clientA.getCalendarFeed(workspaceAId, {
        startDate: '2026-10-24',
        endDate: '2026-10-30',
        timezone: 'UTC',
      });

      const missingTask = feedAfterClear.data.items.find(
        (i) => i.sourceType === 'task_deadline' && i.taskId === taskWithDeadlineId
      );
      expect(missingTask).toBeUndefined();
    });

    it('respects source filter toggles (includeTasks, includeRoutines, includeEvents)', async () => {
      // Re-add deadline to task
      await clientA.updateTask(workspaceAId, taskWithDeadlineId, {
        baseRevision: 3,
        deadline: { type: 'date', date: '2026-10-26' },
      });

      // 1. Exclude tasks
      const noTasks = await clientA.getCalendarFeed(workspaceAId, {
        startDate: '2026-10-24',
        endDate: '2026-10-30',
        includeTasks: false,
      });
      expect(noTasks.data.items.some((i) => i.sourceType === 'task_deadline')).toBe(false);
      expect(noTasks.data.items.some((i) => i.sourceType === 'calendar_event')).toBe(true);

      // 2. Exclude routines
      const noRoutines = await clientA.getCalendarFeed(workspaceAId, {
        startDate: '2026-10-24',
        endDate: '2026-10-30',
        includeRoutines: false,
      });
      expect(noRoutines.data.items.some((i) => i.sourceType === 'routine_occurrence')).toBe(false);
      expect(noRoutines.data.items.some((i) => i.sourceType === 'task_deadline')).toBe(true);

      // 3. Exclude personal events
      const noEvents = await clientA.getCalendarFeed(workspaceAId, {
        startDate: '2026-10-24',
        endDate: '2026-10-30',
        includeEvents: false,
      });
      expect(noEvents.data.items.some((i) => i.sourceType === 'calendar_event')).toBe(false);
    });

    it('strictly isolates calendar feeds between workspaces (multi-tenancy security)', async () => {
      // User B querying User B's workspace must not see any items from Workspace A
      const feedB = await clientB.getCalendarFeed(workspaceBId, {
        startDate: '2026-10-24',
        endDate: '2026-10-30',
      });
      expect(feedB.data.items).toHaveLength(0);

      // User B cannot query Workspace A's feed
      await expect(
        clientB.getCalendarFeed(workspaceAId, {
          startDate: '2026-10-24',
          endDate: '2026-10-30',
        })
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // 4. Local Durable Storage Integration (IndexedDB)
  // =========================================================================
  describe('Local Durable Repository: IndexedDbLocalRepository Calendar Support', () => {
    it('persists and retrieves calendar events in IndexedDB store', async () => {
      await clearAllLocalData();
      setTrustedDeviceConsent(true);
      const repo = new IndexedDbLocalRepository();
      await repo.initialize({ workspaceId: 'ws-local-test', userId: 'user-local-test' });

      const localEvent: CalendarEventRecord = {
        id: 'evt-local-1',
        workspaceId: 'ws-local-test',
        folderId: null,
        title: 'Offline Calendar Review',
        details: 'Review calendar offline sync',
        allDay: true,
        startDate: '2026-11-10',
        endDate: '2026-11-12',
        startAt: null,
        endAt: null,
        timezone: 'UTC',
        isArchived: false,
        securityScope: 'standard',
        serverRevision: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      await repo.upsertCalendarEvent(localEvent);

      const retrieved = await repo.getCalendarEvent('ws-local-test', 'evt-local-1');
      expect(retrieved).toBeDefined();
      expect(retrieved!.title).toBe('Offline Calendar Review');
      expect(retrieved!.startDate).toBe('2026-11-10');

      const allEvents = await repo.listCalendarEvents('ws-local-test');
      expect(allEvents.length).toBe(1);
      expect(allEvents[0]!.id).toBe('evt-local-1');

      // Update event
      const updatedEvent: CalendarEventRecord = {
        ...localEvent,
        title: 'Offline Calendar Review (Confirmed)',
        serverRevision: 2,
      };
      await repo.upsertCalendarEvent(updatedEvent);

      const afterUpdate = await repo.getCalendarEvent('ws-local-test', 'evt-local-1');
      expect(afterUpdate!.title).toBe('Offline Calendar Review (Confirmed)');
      expect(afterUpdate!.serverRevision).toBe(2);

      await repo.close();
    });
  });
});
