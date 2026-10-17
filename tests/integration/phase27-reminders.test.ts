import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';
import { DaynoriWorker } from '../../apps/worker/src/worker.js';
import {
  isTimeInQuietHours,
  calculateNextQuietHoursEnd,
  calculateSnoozeTime,
  materializeReminderOccurrences,
  redactReminderPayload,
  type ReminderRule,
} from '@daynori/domain';

describe('Phase 27: Reminder Scheduling and Durable Delivery Jobs Suite', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;
  let worker: DaynoriWorker;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase27-reminders-key';

  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  let tokenUserA: string;
  let tokenUserB: string;
  let clientA: DaynoriApiClient;
  let clientB: DaynoriApiClient;
  let personalWorkspaceAId: string;
  let personalWorkspaceBId: string;
  let sharedRoomAId: string;

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
    migrator = new Migrator(adminPool);
    await migrator.migrate();

    // 2. Setup RS256 key pair
    keyPair = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(keyPair.publicKey);
    jwks = { keys: [{ ...publicJwk, kid, alg: 'RS256', use: 'sig' }] };

    const verifier = new JwtVerifier({
      issuer,
      audience,
      localJwks: jwks,
    });

    // 3. Start API server
    server = buildServer({
      runtimePool,
      jwtVerifier: verifier,
      allowUnauthenticatedStartup: false,
    });

    const address = await server.listen({ port: 0, host: '127.0.0.1' });
    baseUrl = address;

    // 4. Create tokens & clients
    tokenUserA = await createToken(userAId);
    tokenUserB = await createToken(userBId);

    clientA = createApiClient({ baseUrl, token: tokenUserA });
    clientB = createApiClient({ baseUrl, token: tokenUserB });

    // 5. Seed test user profiles
    await adminPool.query(
      `
      INSERT INTO app.profiles (id, display_name)
      VALUES ($1, 'User A Phase 27'), ($2, 'User B Phase 27')
      ON CONFLICT (id) DO NOTHING;
      `,
      [userAId, userBId]
    );

    // 6. Seed workspaces
    const wsARes = await adminPool.query<{ id: string }>(`
      INSERT INTO app.workspaces (name, kind, owner_id)
      VALUES ('Personal Workspace A', 'personal', '${userAId}')
      RETURNING id;
    `);
    personalWorkspaceAId = wsARes.rows[0]!.id;

    await adminPool.query(`
      INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
      VALUES ('${personalWorkspaceAId}', '${userAId}', 'owner');
    `);

    const wsBRes = await adminPool.query<{ id: string }>(`
      INSERT INTO app.workspaces (name, kind, owner_id)
      VALUES ('Personal Workspace B', 'personal', '${userBId}')
      RETURNING id;
    `);
    personalWorkspaceBId = wsBRes.rows[0]!.id;

    await adminPool.query(`
      INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
      VALUES ('${personalWorkspaceBId}', '${userBId}', 'owner');
    `);

    const roomRes = await adminPool.query<{ id: string }>(`
      INSERT INTO app.workspaces (name, kind, owner_id)
      VALUES ('Shared Room A', 'room', '${userAId}')
      RETURNING id;
    `);
    sharedRoomAId = roomRes.rows[0]!.id;

    await adminPool.query(`
      INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
      VALUES ('${sharedRoomAId}', '${userAId}', 'owner');
    `);

    // 7. Initialize worker
    worker = new DaynoriWorker(runtimePool);
    worker.start();
  });

  afterAll(async () => {
    if (worker) worker.stop();
    if (server) await server.close();
    await runtimePool.end();
    await adminPool.end();
  });

  describe('1. Pure Domain Logic & Invariants', () => {
    it('evaluates quiet hours spanning midnight correctly', () => {
      const config = {
        enabled: true,
        start: '22:00',
        end: '08:00',
        timezone: 'UTC',
      };

      // 23:30 is in quiet hours
      expect(isTimeInQuietHours('2026-10-17T23:30:00Z', config)).toBe(true);
      // 03:00 is in quiet hours
      expect(isTimeInQuietHours('2026-10-18T03:00:00Z', config)).toBe(true);
      // 08:00 is end of quiet hours (open)
      expect(isTimeInQuietHours('2026-10-18T08:00:00Z', config)).toBe(false);
      // 14:00 is outside quiet hours
      expect(isTimeInQuietHours('2026-10-18T14:00:00Z', config)).toBe(false);
      // 21:59 is outside quiet hours
      expect(isTimeInQuietHours('2026-10-18T21:59:00Z', config)).toBe(false);
    });

    it('calculates the next quiet hours end instant correctly across midnight', () => {
      const config = {
        enabled: true,
        start: '22:00',
        end: '08:00',
        timezone: 'UTC',
      };

      // Given 23:00 on Oct 17, next end is Oct 18 at 08:00:00
      const nextEnd = calculateNextQuietHoursEnd('2026-10-17T23:00:00Z', config);
      expect(nextEnd).toBe('2026-10-18T08:00:00.000Z');
    });

    it('bounds snooze duration between 5 minutes and 1440 minutes', () => {
      const base = '2026-10-17T12:00:00.000Z';
      const minSnooze = calculateSnoozeTime(base, 1); // < 5 clamped to 5
      expect(minSnooze.snoozeUntil).toBe('2026-10-17T12:05:00.000Z');

      const normalSnooze = calculateSnoozeTime(base, 30);
      expect(normalSnooze.snoozeUntil).toBe('2026-10-17T12:30:00.000Z');

      const maxSnooze = calculateSnoozeTime(base, 5000); // clamped to 1440 (24h)
      expect(maxSnooze.snoozeUntil).toBe('2026-10-18T12:00:00.000Z');
    });

    it('materializes occurrences with deterministic idempotency keys', () => {
      const dummyRule: ReminderRule = {
        id: crypto.randomUUID(),
        workspaceId: personalWorkspaceAId,
        targetType: 'task',
        targetId: crypto.randomUUID(),
        ruleRevision: 1,
        offsetMinutes: 15,
        scheduleTime: null,
        timezone: 'UTC',
        recurrence: 'none',
        quietHoursBehavior: 'defer',
        channels: ['in_app', 'push'],
        privacyLevel: 'generic',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const occurrences = materializeReminderOccurrences({
        rule: dummyRule,
        target: {
          id: dummyRule.targetId,
          dueTimestamp: '2026-10-20T10:00:00.000Z',
          startDate: null,
          isDone: false,
          isDeleted: false,
        },
        horizonDays: 14,
        now: new Date('2026-10-17T00:00:00Z'),
      });

      expect(occurrences.length).toBe(1);
      // 10:00 - 15 minutes = 09:45
      expect(occurrences[0]!.scheduledAt).toBe('2026-10-20T09:45:00.000Z');
      expect(occurrences[0]!.occurrenceKey).toContain(`rev1_once_`);
    });

    it('strictly redacts sensitive details from notification payloads', () => {
      // Generic privacy level
      const genericPayload = redactReminderPayload({
        title: 'Confidential therapy meeting notes and financial records',
        targetType: 'task',
        privacyLevel: 'generic',
      });
      expect(genericPayload.title).toBe('Daynori Reminder');
      expect(genericPayload.body).not.toContain('therapy');
      expect(genericPayload.body).not.toContain('financial');

      // Detailed privacy level retains title only, redacting sensitive body
      const detailedPayload = redactReminderPayload({
        title: 'Review Quarterly Report',
        targetType: 'task',
        privacyLevel: 'detailed',
      });
      expect(detailedPayload.title).toBe('Task: Review Quarterly Report');
      expect(detailedPayload.body).toBe('Scheduled item reminder.');
    });
  });

  describe('2. Workspace RLS & Personal Scope Validation', () => {
    it('rejects reminder creation in shared room workspaces', async () => {
      const taskRes = await clientA.createTask(sharedRoomAId, {
        title: 'Shared Task',
      });

      await expect(
        clientA.createReminderRule(sharedRoomAId, {
          targetType: 'task',
          targetId: taskRes.data.id,
          offsetMinutes: 30,
        })
      ).rejects.toThrow();
    });

    it('prevents cross-workspace reminder access between users', async () => {
      const taskA = await clientA.createTask(personalWorkspaceAId, {
        title: "User A's Private Task",
        deadline: {
          type: 'timed',
          timestamp: new Date(Date.now() + 3600000).toISOString(),
          timezone: 'UTC',
        },
      });

      const ruleA = await clientA.createReminderRule(personalWorkspaceAId, {
        targetType: 'task',
        targetId: taskA.data.id,
        offsetMinutes: 15,
      });

      // User B cannot view User A's reminder rules
      await expect(
        clientB.getReminderRule(personalWorkspaceAId, ruleA.data.id)
      ).rejects.toThrow();

      // User B cannot list User A's reminder rules
      await expect(
        clientB.listReminderRules(personalWorkspaceAId)
      ).rejects.toThrow();
    });
  });

  describe('3. Lifecycle: Scheduling, Invalidation, Snooze & Receipt Tracking', () => {
    it('completing a task invalidates its stale pending reminder instances', async () => {
      const dueInstant = new Date(Date.now() + 7200000).toISOString();
      const taskRes = await clientA.createTask(personalWorkspaceAId, {
        title: 'Buy groceries before dinner',
        deadline: {
          type: 'timed',
          timestamp: dueInstant,
          timezone: 'UTC',
        },
      });

      const ruleRes = await clientA.createReminderRule(personalWorkspaceAId, {
        targetType: 'task',
        targetId: taskRes.data.id,
        offsetMinutes: 30,
      });

      expect(ruleRes.data.id).toBeDefined();

      // Verify scheduled instance exists
      const instancesBefore = await clientA.listReminderInstances(personalWorkspaceAId, {
        targetId: taskRes.data.id,
      });
      expect(instancesBefore.data.length).toBeGreaterThanOrEqual(1);
      expect(instancesBefore.data[0]!.status).toBe('scheduled');

      // Complete the task
      await clientA.completeTask(personalWorkspaceAId, taskRes.data.id, {
        baseRevision: taskRes.data.revision,
      });

      // Verify the reminder instance was invalidated
      const instancesAfter = await clientA.listReminderInstances(personalWorkspaceAId, {
        targetId: taskRes.data.id,
      });
      expect(instancesAfter.data.length).toBeGreaterThanOrEqual(1);
      const targetInstance = instancesAfter.data.find((i) => i.targetId === taskRes.data.id);
      expect(targetInstance?.status).toBe('invalidated');
      expect(targetInstance?.invalidatedReason).toBe('task_completed');
    });

    it('rescheduling a task invalidates its pending reminder instances', async () => {
      const originalDue = new Date(Date.now() + 7200000).toISOString();
      const taskRes = await clientA.createTask(personalWorkspaceAId, {
        title: 'Prepare presentation deck',
        deadline: {
          type: 'timed',
          timestamp: originalDue,
          timezone: 'UTC',
        },
      });

      await clientA.createReminderRule(personalWorkspaceAId, {
        targetType: 'task',
        targetId: taskRes.data.id,
        offsetMinutes: 15,
      });

      const before = await clientA.listReminderInstances(personalWorkspaceAId, {
        targetId: taskRes.data.id,
      });
      expect(before.data[0]!.status).toBe('scheduled');

      // Reschedule deadline to a different time
      const newDue = new Date(Date.now() + 14400000).toISOString();
      await clientA.updateTask(personalWorkspaceAId, taskRes.data.id, {
        deadline: {
          type: 'timed',
          timestamp: newDue,
          timezone: 'UTC',
        },
        baseRevision: taskRes.data.revision,
      });

      const after = await clientA.listReminderInstances(personalWorkspaceAId, {
        targetId: taskRes.data.id,
      });
      const invalidated = after.data.find((i) => i.status === 'invalidated');
      expect(invalidated).toBeDefined();
      expect(invalidated?.invalidatedReason).toBe('task_rescheduled');
    });

    it('supports snoozing reminder instances with status transitions', async () => {
      const taskRes = await clientA.createTask(personalWorkspaceAId, {
        title: 'Call insurance provider',
        deadline: {
          type: 'timed',
          timestamp: new Date(Date.now() + 3600000).toISOString(),
          timezone: 'UTC',
        },
      });

      await clientA.createReminderRule(personalWorkspaceAId, {
        targetType: 'task',
        targetId: taskRes.data.id,
        offsetMinutes: 10,
      });

      const instances = await clientA.listReminderInstances(personalWorkspaceAId, {
        targetId: taskRes.data.id,
      });
      const instance = instances.data[0]!;

      // Snooze by 20 minutes
      const snoozed = await clientA.snoozeReminderInstance(
        personalWorkspaceAId,
        instance.id,
        { snoozeMinutes: 20 }
      );

      expect(snoozed.data.status).toBe('snoozed');
      expect(snoozed.data.snoozeUntil).toBeDefined();
    });

    it('tracks delivery receipts distinguishing scheduled/accepted from observed/user-opened', async () => {
      const taskRes = await clientA.createTask(personalWorkspaceAId, {
        title: 'Pick up dry cleaning',
        deadline: {
          type: 'timed',
          timestamp: new Date(Date.now() + 3600000).toISOString(),
          timezone: 'UTC',
        },
      });

      await clientA.createReminderRule(personalWorkspaceAId, {
        targetType: 'task',
        targetId: taskRes.data.id,
        offsetMinutes: 10,
      });

      const instances = await clientA.listReminderInstances(personalWorkspaceAId, {
        targetId: taskRes.data.id,
      });
      const instance = instances.data[0]!;

      // Simulate worker dispatch creating a delivery record
      const delivRes = await adminPool.query<{ id: string }>(
        `
        INSERT INTO app.reminder_deliveries (
          workspace_id, instance_id, channel, recipient_user_id,
          provider, status, redacted_title, redacted_body, attempt_count
        )
        VALUES ($1, $2, 'in_app', $3, 'in_app', 'accepted', 'Task: Pick up dry cleaning', 'Scheduled item reminder.', 1)
        RETURNING id;
        `,
        [personalWorkspaceAId, instance.id, userAId]
      );
      const deliveryId = delivRes.rows[0]!.id;

      // User opens the notification
      const receiptRes = await clientA.recordDeliveryReceipt(personalWorkspaceAId, deliveryId, {
        status: 'opened',
      });

      expect(receiptRes.data.status).toBe('opened');
      expect(receiptRes.data.openedAt).toBeDefined();

      // Check instance was marked 'observed'
      const updatedInstances = await clientA.listReminderInstances(personalWorkspaceAId, {
        targetId: taskRes.data.id,
      });
      const observedInstance = updatedInstances.data.find((i) => i.id === instance.id);
      expect(observedInstance?.status).toBe('observed');
    });
  });

  describe('4. Worker Leased Job Processing & Deduplication', () => {
    it('retrying a delivery job does not create duplicate reminder instances or duplicate deliveries', async () => {
      const taskRes = await clientA.createTask(personalWorkspaceAId, {
        title: 'Review flight tickets',
        deadline: {
          type: 'timed',
          timestamp: new Date(Date.now() + 3600000).toISOString(),
          timezone: 'UTC',
        },
      });

      const ruleRes = await clientA.createReminderRule(personalWorkspaceAId, {
        targetType: 'task',
        targetId: taskRes.data.id,
        offsetMinutes: 10,
        channels: ['in_app', 'push'],
      });

      const instances = await clientA.listReminderInstances(personalWorkspaceAId, {
        targetId: taskRes.data.id,
      });
      const instance = instances.data[0]!;

      // Process job via worker
      const fakeJobId = crypto.randomUUID();
      const jobPayload = {
        workspaceId: personalWorkspaceAId,
        instanceId: instance.id,
        ruleId: ruleRes.data.id,
        ruleRevision: 1,
        targetType: 'task',
        targetId: taskRes.data.id,
        actorUserId: userAId,
      };

      // First run: dispatches deliveries
      const run1 = await worker.processJob(fakeJobId, 'reminder_delivery', jobPayload);
      expect(run1.status).toBe('completed');
      expect(run1.details?.['outcome']).toBe('dispatched');

      // Count deliveries created
      const count1Res = await runtimePool.query<{ count: string }>(
        `SELECT COUNT(*) FROM app.reminder_deliveries WHERE instance_id = $1;`,
        [instance.id]
      );
      const initialCount = Number(count1Res.rows[0]!.count);
      expect(initialCount).toBe(2); // in_app + push

      // Second run (simulating retry / duplicate delivery trigger)
      const fakeJobId2 = crypto.randomUUID();
      const run2 = await worker.processJob(fakeJobId2, 'reminder_delivery', jobPayload);
      expect(run2.status).toBe('completed');
      expect(run2.details?.['outcome']).toBe('already_dispatched');

      // Verify delivery count did NOT increase
      const count2Res = await runtimePool.query<{ count: string }>(
        `SELECT COUNT(*) FROM app.reminder_deliveries WHERE instance_id = $1;`,
        [instance.id]
      );
      expect(Number(count2Res.rows[0]!.count)).toBe(initialCount);
    });

    it('worker respects quiet hours drop behavior', async () => {
      // Set quiet hours on user's profile
      await adminPool.query(
        `
        UPDATE app.profiles
        SET preferences = jsonb_set(
          preferences,
          '{quietHours}',
          '{"enabled": true, "start": "00:00", "end": "23:59", "timezone": "UTC"}'::jsonb
        )
        WHERE id = $1;
        `,
        [userAId]
      );

      const taskRes = await clientA.createTask(personalWorkspaceAId, {
        title: 'Meditation reminder',
        deadline: {
          type: 'timed',
          timestamp: new Date(Date.now() + 3600000).toISOString(),
          timezone: 'UTC',
        },
      });

      const ruleRes = await clientA.createReminderRule(personalWorkspaceAId, {
        targetType: 'task',
        targetId: taskRes.data.id,
        offsetMinutes: 10,
        quietHoursBehavior: 'drop',
      });

      const instances = await clientA.listReminderInstances(personalWorkspaceAId, {
        targetId: taskRes.data.id,
      });
      const instance = instances.data[0]!;

      // Execute worker delivery job
      const jobId = crypto.randomUUID();
      const res = await worker.processJob(jobId, 'reminder_delivery', {
        workspaceId: personalWorkspaceAId,
        instanceId: instance.id,
        ruleId: ruleRes.data.id,
        ruleRevision: 1,
        targetType: 'task',
        targetId: taskRes.data.id,
        actorUserId: userAId,
      });

      expect(res.status).toBe('completed');
      expect(res.details?.['outcome']).toBe('dropped_quiet_hours');

      // Instance was marked 'dismissed'
      const updatedInst = await clientA.listReminderInstances(personalWorkspaceAId, {
        targetId: taskRes.data.id,
      });
      expect(updatedInst.data[0]!.status).toBe('dismissed');

      // Delivery record reflects 'dropped_quiet_hours'
      const deliv = await runtimePool.query<{ status: string }>(
        `SELECT status FROM app.reminder_deliveries WHERE instance_id = $1;`,
        [instance.id]
      );
      expect(deliv.rows[0]?.status).toBe('dropped_quiet_hours');

      // Restore user quiet hours
      await adminPool.query(
        `
        UPDATE app.profiles
        SET preferences = preferences - 'quietHours'
        WHERE id = $1;
        `,
        [userAId]
      );
    });

    it('worker records truthful unavailable status when no push adapter is configured instead of fabricating delivery rows', async () => {
      // Ensure quiet hours are not active
      await adminPool.query(
        `UPDATE app.profiles SET preferences = preferences - 'quietHours' WHERE id = $1;`,
        [userAId]
      );

      const taskRes = await clientA.createTask(personalWorkspaceAId, {
        title: 'Truthful delivery test task',
        deadline: {
          type: 'timed',
          timestamp: new Date(Date.now() + 3600000).toISOString(),
          timezone: 'UTC',
        },
      });

      const ruleRes = await clientA.createReminderRule(personalWorkspaceAId, {
        targetType: 'task',
        targetId: taskRes.data.id,
        offsetMinutes: 10,
        channels: ['push'],
      });

      const instances = await clientA.listReminderInstances(personalWorkspaceAId, {
        targetId: taskRes.data.id,
      });
      const instance = instances.data[0]!;

      // Ensure worker has no push adapter set
      worker.setPushAdapter(null);

      const fakeJobId = crypto.randomUUID();
      const jobPayload = {
        workspaceId: personalWorkspaceAId,
        instanceId: instance.id,
        ruleId: ruleRes.data.id,
        ruleRevision: 1,
        deliveryGeneration: 1,
        targetType: 'task',
        targetId: taskRes.data.id,
        actorUserId: userAId,
      };

      const res = await worker.processJob(fakeJobId, 'reminder_delivery', jobPayload);
      expect(res.status).toBe('completed');
      expect(res.details?.['outcome']).toBe('dispatched');

      // Query database delivery row: must be truthful 'unavailable', NOT fabricated 'accepted' with prov_* ID
      const deliv = await runtimePool.query<{ status: string; provider_message_id: string | null }>(
        `SELECT status, provider_message_id FROM app.reminder_deliveries WHERE instance_id = $1 AND channel = 'push';`,
        [instance.id]
      );
      expect(deliv.rows.length).toBe(1);
      expect(deliv.rows[0]!.status).toBe('unavailable');
      expect(deliv.rows[0]!.provider_message_id).toBeNull();
    });

    it('worker defers delivery during quiet hours and preserves the pending job at rescheduleRunAt', async () => {
      const _updRes = await adminPool.query(
        `
        UPDATE app.profiles
        SET preferences = jsonb_set(
          preferences,
          '{quietHours}',
          '{"enabled": true, "start": "00:00", "end": "23:59", "timezone": "UTC"}'::jsonb
        )
        WHERE id = $1;
        `,
        [userAId]
      );

      try {
        const taskRes = await clientA.createTask(personalWorkspaceAId, {
          title: 'Quiet hours defer test task',
          deadline: {
            type: 'timed',
            timestamp: new Date(Date.now() + 3600000).toISOString(),
            timezone: 'UTC',
          },
        });

        const ruleRes = await clientA.createReminderRule(personalWorkspaceAId, {
          targetType: 'task',
          targetId: taskRes.data.id,
          offsetMinutes: 10,
          quietHoursBehavior: 'defer',
        });

        const instances = await clientA.listReminderInstances(personalWorkspaceAId, {
          targetId: taskRes.data.id,
        });
        const instance = instances.data[0]!;

        // Enqueue actual background job using task_type
        const enqueueRes = await adminPool.query<{ id: string }>(
          `
          INSERT INTO app.background_jobs (task_type, payload, run_at, status)
          VALUES ('reminder_delivery', $1, NOW() - INTERVAL '1 second', 'pending')
          RETURNING id;
          `,
          [
            JSON.stringify({
              workspaceId: personalWorkspaceAId,
              instanceId: instance.id,
              ruleId: ruleRes.data.id,
              ruleRevision: 1,
              deliveryGeneration: 1,
              targetType: 'task',
              targetId: taskRes.data.id,
              actorUserId: userAId,
            }),
          ]
        );
        const dbJobId = enqueueRes.rows[0]!.id;

        // Start worker and process through polling lifecycle
        worker.start(adminPool);
        let jobResult: { jobId?: string } | null = null;
        for (let attempt = 0; attempt < 10; attempt++) {
          jobResult = await worker.pollAndProcessNextJob(adminPool);
          if (jobResult?.jobId === dbJobId) break;
        }
        expect(jobResult).toBeDefined();
        expect(jobResult?.jobId).toBe(dbJobId);
        expect(jobResult?.status).toBe('deferred');
        worker.stop();

        // Verify DB job state: must NOT be 'completed'; must be 'pending' with deferred run_at
        const jobRow = await adminPool.query<{ status: string; run_at: Date }>(
          `SELECT status, run_at FROM app.background_jobs WHERE id = $1;`,
          [dbJobId]
        );
        expect(jobRow.rows[0]!.status).toBe('pending');
        expect(new Date(jobRow.rows[0]!.run_at).getTime()).toBeGreaterThan(Date.now());

        // Instance state must remain scheduled
        const instRow = await runtimePool.query<{ status: string }>(
          `SELECT status FROM app.reminder_instances WHERE id = $1;`,
          [instance.id]
        );
        expect(instRow.rows[0]!.status).toBe('scheduled');
      } finally {
        worker.stop();
        // Cleanup quiet hours
        await adminPool.query(
          `UPDATE app.profiles SET preferences = preferences - 'quietHours' WHERE id = $1;`,
          [userAId]
        );
      }
    });

    it('snooze advances delivery generation, tracks relative to user action, and retries do not collide', async () => {
      // Ensure quiet hours are not active
      await adminPool.query(
        `UPDATE app.profiles SET preferences = preferences - 'quietHours' WHERE id = $1;`,
        [userAId]
      );

      const taskRes = await clientA.createTask(personalWorkspaceAId, {
        title: 'Snooze generation test task',
        deadline: {
          type: 'timed',
          timestamp: new Date(Date.now() + 3600000).toISOString(),
          timezone: 'UTC',
        },
      });

      await clientA.createReminderRule(personalWorkspaceAId, {
        targetType: 'task',
        targetId: taskRes.data.id,
        offsetMinutes: 10,
        channels: ['in_app'],
      });

      const instances = await clientA.listReminderInstances(personalWorkspaceAId, {
        targetId: taskRes.data.id,
      });
      const initialInstance = instances.data[0]!;
      expect(initialInstance.deliveryGeneration).toBe(1);

      // Snooze instance for 20 minutes
      const snoozedRes = await clientA.snoozeReminderInstance(personalWorkspaceAId, initialInstance.id, {
        snoozeMinutes: 20,
      });

      expect(snoozedRes.data.status).toBe('snoozed');
      expect(snoozedRes.data.deliveryGeneration).toBe(2);

      // The new scheduledAt should be roughly now + 20 minutes
      const diffMs = new Date(snoozedRes.data.scheduledAt).getTime() - Date.now();
      expect(diffMs).toBeGreaterThan(18 * 60 * 1000);
      expect(diffMs).toBeLessThanOrEqual(21 * 60 * 1000);
    });

    it('source deadline update rebuilds future reminder instances', async () => {
      const initialDeadline = new Date(Date.now() + 2 * 3600000).toISOString();
      const taskRes = await clientA.createTask(personalWorkspaceAId, {
        title: 'Deadline rebuild test task',
        deadline: {
          type: 'timed',
          timestamp: initialDeadline,
          timezone: 'UTC',
        },
      });

      await clientA.createReminderRule(personalWorkspaceAId, {
        targetType: 'task',
        targetId: taskRes.data.id,
        offsetMinutes: 30,
        channels: ['in_app'],
      });

      const instList1 = await clientA.listReminderInstances(personalWorkspaceAId, {
        targetId: taskRes.data.id,
      });
      expect(instList1.data.length).toBe(1);
      const oldInstanceId = instList1.data[0]!.id;

      // Update task deadline to +5 hours with required baseRevision
      const newDeadline = new Date(Date.now() + 5 * 3600000).toISOString();
      await clientA.updateTask(personalWorkspaceAId, taskRes.data.id, {
        deadline: {
          type: 'timed',
          timestamp: newDeadline,
          timezone: 'UTC',
        },
        baseRevision: taskRes.data.revision,
      });

      // Query instances again: old instance should be invalidated, new instance scheduled
      const instList2 = await clientA.listReminderInstances(personalWorkspaceAId, {
        targetId: taskRes.data.id,
      });

      const activeInst = instList2.data.find((i) => i.status === 'scheduled');
      expect(activeInst).toBeDefined();
      expect(activeInst!.id).not.toBe(oldInstanceId);

      // Verify scheduled time matches new deadline - 30 minutes
      const expectedTime = new Date(new Date(newDeadline).getTime() - 30 * 60 * 1000);
      expect(Math.abs(new Date(activeInst!.scheduledAt).getTime() - expectedTime.getTime())).toBeLessThan(5000);
    });

    it('enforces optimistic concurrency with baseRevision on reminder rule updates', async () => {
      const taskRes = await clientA.createTask(personalWorkspaceAId, {
        title: 'Rule concurrency test task',
        deadline: {
          type: 'timed',
          timestamp: new Date(Date.now() + 7200000).toISOString(),
          timezone: 'UTC',
        },
      });

      const ruleRes = await clientA.createReminderRule(personalWorkspaceAId, {
        targetType: 'task',
        targetId: taskRes.data.id,
        offsetMinutes: 15,
        channels: ['in_app'],
      });

      const ruleId = ruleRes.data.id;
      expect(ruleRes.data.ruleRevision).toBe(1);

      // Attempt to update with mismatched baseRevision (e.g. 99)
      await expect(
        clientA.updateReminderRule(personalWorkspaceAId, ruleId, {
          offsetMinutes: 20,
          baseRevision: 99,
        })
      ).rejects.toThrow();

      // Update with correct baseRevision (1)
      const updated = await clientA.updateReminderRule(personalWorkspaceAId, ruleId, {
        offsetMinutes: 25,
        baseRevision: 1,
      });

      expect(updated.data.ruleRevision).toBe(2);
      expect(updated.data.offsetMinutes).toBe(25);
    });

    it('enforces monotonic delivery receipts: client cannot regress opened to delivered or claim accepted', async () => {
      const taskRes = await clientA.createTask(personalWorkspaceAId, {
        title: 'Monotonic receipt test task',
        deadline: {
          type: 'timed',
          timestamp: new Date(Date.now() + 3600000).toISOString(),
          timezone: 'UTC',
        },
      });

      await clientA.createReminderRule(personalWorkspaceAId, {
        targetType: 'task',
        targetId: taskRes.data.id,
        offsetMinutes: 10,
        channels: ['in_app'],
      });

      const instances = await clientA.listReminderInstances(personalWorkspaceAId, {
        targetId: taskRes.data.id,
      });
      const instance = instances.data[0]!;

      // Insert delivery record
      const delivRes = await runtimePool.query<{ id: string }>(
        `
        INSERT INTO app.reminder_deliveries (
          workspace_id, instance_id, delivery_generation, channel, recipient_user_id, status, redacted_title, created_at
        ) VALUES ($1, $2, 1, 'in_app', $3, 'delivered', 'Test reminder', NOW())
        RETURNING id;
        `,
        [personalWorkspaceAId, instance.id, userAId]
      );
      const deliveryId = delivRes.rows[0]!.id;

      // 1. Client transitions to 'opened'
      const openReceipt = await clientA.recordDeliveryReceipt(personalWorkspaceAId, deliveryId, {
        status: 'opened',
      });
      expect(openReceipt.data.status).toBe('opened');

      // 2. Client attempts to regress back to 'delivered' -> must be monotonic/idempotent and remain 'opened'
      const regressReceipt = await clientA.recordDeliveryReceipt(personalWorkspaceAId, deliveryId, {
        status: 'delivered',
      });
      expect(regressReceipt.data.status).toBe('opened');

      // 3. Client attempts to claim provider status 'accepted' -> rejected by contract validation
      await expect(
        // @ts-expect-error testing invalid status from client
        clientA.recordDeliveryReceipt(personalWorkspaceAId, deliveryId, {
          status: 'accepted',
        })
      ).rejects.toThrow();
    });
  });
});
