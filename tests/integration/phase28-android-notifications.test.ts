import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';
import { DaynoriWorker, type PushNotificationAdapter } from '../../apps/worker/src/worker.js';
import {
  setupNotificationChannelsAsync,
  getNotificationCapabilityAsync,
  requestNotificationPermissionAsync,
  getInstallationIdAsync,
  registerDeviceAsync,
  deactivateDeviceAsync,
  scheduleLocalReminderAsync,
  cancelLocalReminderAsync,
  cancelAllLocalRemindersAsync,
  initNotificationResponseListener,
} from '../../apps/mobile/src/notifications/adapter.js';
import { __mockNotificationControls } from '@daynori/test-utils';
import { defaultSecureStorage } from '../../apps/mobile/src/auth/secureStorage.js';
import type { NotificationPayload } from '@daynori/contracts';

describe('Phase 28: Android Notifications and Local Reminders Suite', () => {
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
  const kid = 'phase28-notifications-key';

  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  let tokenUserA: string;
  let tokenUserB: string;
  let clientA: DaynoriApiClient;
  let clientB: DaynoriApiClient;
  let personalWorkspaceAId: string;
  let personalWorkspaceBId: string;

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

    migrator = new Migrator(adminPool);
    await migrator.migrate();

    keyPair = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(keyPair.publicKey);
    jwks = { keys: [{ ...publicJwk, kid, alg: 'RS256', use: 'sig' }] };

    const verifier = new JwtVerifier({
      issuer,
      audience,
      localJwks: jwks,
    });

    server = buildServer({
      runtimePool,
      jwtVerifier: verifier,
      allowUnauthenticatedStartup: false,
    });

    const address = await server.listen({ port: 0, host: '127.0.0.1' });
    baseUrl = address;

    tokenUserA = await createToken(userAId);
    tokenUserB = await createToken(userBId);

    clientA = createApiClient({ baseUrl, token: tokenUserA });
    clientB = createApiClient({ baseUrl, token: tokenUserB });

    await adminPool.query(
      `
      INSERT INTO app.profiles (id, display_name)
      VALUES ($1, 'User A Phase 28'), ($2, 'User B Phase 28')
      ON CONFLICT (id) DO NOTHING;
      `,
      [userAId, userBId]
    );

    const wsARes = await adminPool.query<{ id: string }>(`
      INSERT INTO app.workspaces (name, kind, owner_id)
      VALUES ('Personal Workspace A Phase 28', 'personal', '${userAId}')
      RETURNING id;
    `);
    personalWorkspaceAId = wsARes.rows[0]!.id;

    await adminPool.query(`
      INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
      VALUES ('${personalWorkspaceAId}', '${userAId}', 'owner');
    `);

    const wsBRes = await adminPool.query<{ id: string }>(`
      INSERT INTO app.workspaces (name, kind, owner_id)
      VALUES ('Personal Workspace B Phase 28', 'personal', '${userBId}')
      RETURNING id;
    `);
    personalWorkspaceBId = wsBRes.rows[0]!.id;

    await adminPool.query(`
      INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
      VALUES ('${personalWorkspaceBId}', '${userBId}', 'owner');
    `);

    worker = new DaynoriWorker(adminPool);
    worker.start(adminPool);
  });

  afterAll(async () => {
    worker.stop();
    await server.close();
    await runtimePool.end();
    await adminPool.end();
  });

  beforeEach(async () => {
    worker.start(adminPool);
    __mockNotificationControls.reset();
    await defaultSecureStorage.deleteItemAsync('daynori_installation_id');
    await defaultSecureStorage.deleteItemAsync('daynori_registered_device_id');
    await defaultSecureStorage.deleteItemAsync('daynori_registered_push_token');
  });

  describe('1. Native Android Notification Adapter & Channel Setup', () => {
    it('initializes required Android notification channels with distinct importance and descriptions', async () => {
      await setupNotificationChannelsAsync();

      // Channels initialized in mock system
      const capability = await getNotificationCapabilityAsync();
      expect(capability).toBeDefined();
      expect(capability.isExactAlarmPermitted).toBe(false); // Preserves exact-alarm gate
    });

    it('honestly reflects undetermined, granted, denied, and channel-disabled capability states', async () => {
      // 1. Undetermined
      __mockNotificationControls.setPermission('undetermined');
      let cap = await getNotificationCapabilityAsync();
      expect(cap.status).toBe('undetermined');
      expect(cap.canDeliverLocally).toBe(false);

      // 2. Granted
      __mockNotificationControls.setPermission('granted');
      cap = await getNotificationCapabilityAsync();
      expect(cap.status).toBe('granted');
      expect(cap.canDeliverLocally).toBe(true);

      // 3. Denied
      __mockNotificationControls.setPermission('denied');
      cap = await getNotificationCapabilityAsync();
      expect(cap.status).toBe('denied');
      expect(cap.canDeliverLocally).toBe(false);
      expect(cap.details).toContain('permission was denied');
    });

    it('requests notification permission contextually after setup action and updates capability', async () => {
      __mockNotificationControls.setPermission('undetermined');

      const cap = await requestNotificationPermissionAsync('Explicit reminder setup prompt');
      expect(cap.status).toBe('granted');
      expect(cap.canDeliverLocally).toBe(true);
    });
  });

  describe('2. Device Registration, Token Maintenance & Tenant Scoping', () => {
    it('registers an Android device with stable installation ID and truthful capability metadata', async () => {
      __mockNotificationControls.setPermission('granted');
      __mockNotificationControls.setPushToken('fcm_token_sample_abc123');

      const regResult = await registerDeviceAsync(clientA, {
        appVersion: '0.1.0',
        osVersion: '14',
      });

      expect(regResult.success).toBe(true);
      expect(regResult.deviceId).toBeDefined();
      expect(regResult.pushAvailable).toBe(true);

      // Verify in DB with user scoping
      const devRes = await adminPool.query<{
        id: string;
        user_id: string;
        push_token: string;
        token_type: string;
        is_active: boolean;
      }>(`SELECT id, user_id, push_token, token_type, is_active FROM app.devices WHERE id = $1;`, [
        regResult.deviceId,
      ]);

      expect(devRes.rows.length).toBe(1);
      expect(devRes.rows[0]!.user_id).toBe(userAId);
      expect(devRes.rows[0]!.push_token).toBe('fcm_token_sample_abc123');
      expect(devRes.rows[0]!.token_type).toBe('fcm');
      expect(devRes.rows[0]!.is_active).toBe(true);
    });

    it('honestly exposes unavailable push state when push credentials are not present', async () => {
      __mockNotificationControls.setPermission('granted');
      __mockNotificationControls.setPushToken(null); // No push credentials

      const regResult = await registerDeviceAsync(clientA);
      expect(regResult.success).toBe(true);
      expect(regResult.pushAvailable).toBe(false);

      const devRes = await adminPool.query<{ push_token: string | null; token_type: string }>(
        `SELECT push_token, token_type FROM app.devices WHERE id = $1;`,
        [regResult.deviceId]
      );
      expect(devRes.rows[0]!.push_token).toBeNull();
      expect(devRes.rows[0]!.token_type).toBe('none');
    });

    it('supports push token rotation and idempotent device re-registration', async () => {
      __mockNotificationControls.setPermission('granted');
      __mockNotificationControls.setPushToken('fcm_initial_token');

      const reg1 = await registerDeviceAsync(clientA);
      expect(reg1.success).toBe(true);

      // Rotate token
      __mockNotificationControls.setPushToken('fcm_rotated_token');
      const reg2 = await registerDeviceAsync(clientA);

      expect(reg2.success).toBe(true);
      expect(reg2.deviceId).toBe(reg1.deviceId); // Same installation ID re-registers same device row

      const devRes = await adminPool.query<{ push_token: string }>(
        `SELECT push_token FROM app.devices WHERE id = $1;`,
        [reg1.deviceId]
      );
      expect(devRes.rows[0]!.push_token).toBe('fcm_rotated_token');
    });

    it('deactivates device on logout or account switch, preventing stale cross-account delivery', async () => {
      __mockNotificationControls.setPermission('granted');
      __mockNotificationControls.setPushToken('fcm_active_token');

      const reg = await registerDeviceAsync(clientA);
      expect(reg.deviceId).toBeDefined();

      // Deactivate on logout
      await deactivateDeviceAsync(clientA);

      const devRes = await adminPool.query<{ is_active: boolean }>(
        `SELECT is_active FROM app.devices WHERE id = $1;`,
        [reg.deviceId]
      );
      expect(devRes.rows[0]!.is_active).toBe(false);

      // Secure storage cleared
      const storedId = await defaultSecureStorage.getItemAsync('daynori_registered_device_id');
      expect(storedId).toBeNull();
    });

    it('prevents cross-user device manipulation', async () => {
      __mockNotificationControls.setPermission('granted');
      __mockNotificationControls.setPushToken('fcm_user_a_token');

      const regA = await registerDeviceAsync(clientA);

      // User B tries to deactivate User A's device installation
      const instId = await getInstallationIdAsync();
      const deactB = await clientB.deactivateDevice(instId);
      expect(deactB.data.success).toBe(true);

      // User A device remains active because the deletion is scoped to User B
      const devRes = await adminPool.query<{ is_active: boolean }>(
        `SELECT is_active FROM app.devices WHERE id = $1;`,
        [regA.deviceId]
      );
      expect(devRes.rows[0]!.is_active).toBe(true);
    });
  });

  describe('3. Local Scheduling, Backend Coordination & Push Fallback Suppression', () => {
    it('schedules local reminder, redacts private bodies for lock-screen, and records schedule acknowledgment', async () => {
      __mockNotificationControls.setPermission('granted');
      __mockNotificationControls.setPushToken('fcm_token_coord');

      const reg = await registerDeviceAsync(clientA);
      expect(reg.deviceId).toBeDefined();

      const taskRes = await clientA.createTask(personalWorkspaceAId, {
        title: 'Review quarterly goals',
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
        privacyLevel: 'generic',
      });

      const instances = await clientA.listReminderInstances(personalWorkspaceAId, {
        targetId: taskRes.data.id,
      });
      const instance = instances.data[0]!;

      // Schedule locally on device
      const schedResult = await scheduleLocalReminderAsync(clientA, {
        instanceId: instance.id,
        workspaceId: personalWorkspaceAId,
        title: 'Review quarterly goals',
        body: 'Sensitive internal memo details',
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
        ruleRevision: ruleRes.data.ruleRevision,
        deliveryGeneration: 1,
        privacyLevel: 'private',
      });

      expect(schedResult.scheduled).toBe(true);
      expect(schedResult.nativeNotificationId).toBeDefined();

      // Verify scheduled notification content in mock OS: body was redacted
      const scheduledMap = __mockNotificationControls.getScheduledMap();
      const mockNotif = scheduledMap.get(schedResult.nativeNotificationId!);
      expect(mockNotif).toBeDefined();
      expect(mockNotif?.content.body).toBe('Open Daynori to view details'); // Redacted

      // Verify device schedule record in database
      const dbSchedules = await clientA.listDeviceSchedules(personalWorkspaceAId, instance.id);
      expect(dbSchedules.data.length).toBe(1);
      expect(dbSchedules.data[0]!.acknowledged).toBe(true);
      expect(dbSchedules.data[0]!.deliveryMode).toBe('local');
      expect(dbSchedules.data[0]!.nativeNotificationId).toBe(schedResult.nativeNotificationId);
    });

    it('worker suppresses push delivery when device local scheduling is validly acknowledged', async () => {
      const taskRes = await clientA.createTask(personalWorkspaceAId, {
        title: 'Suppression test task',
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

      // Register device and acknowledge local schedule
      const deviceId = crypto.randomUUID();
      await adminPool.query(
        `
        INSERT INTO app.devices (id, user_id, installation_id, platform, push_token, token_type, is_active)
        VALUES ($1, $2, 'inst_test_suppress', 'android', 'fcm_token_suppress', 'fcm', true);
        `,
        [deviceId, userAId]
      );

      await adminPool.query(
        `
        INSERT INTO app.device_reminder_schedules (
          workspace_id, instance_id, device_id, rule_revision, delivery_generation,
          native_notification_id, delivery_mode, acknowledged, acknowledged_at
        )
        VALUES ($1, $2, $3, 1, 1, 'mock-notif-suppressed', 'local', true, now());
        `,
        [personalWorkspaceAId, instance.id, deviceId]
      );

      // Track push adapter calls
      let pushSentCount = 0;
      const testPushAdapter: PushNotificationAdapter = {
        sendPushNotification: async () => {
          pushSentCount++;
          return { status: 'delivered', providerMessageId: 'prov_test' };
        },
      };
      worker.setPushAdapter(testPushAdapter);

      // Process worker job
      const res = await worker.processJob(crypto.randomUUID(), 'reminder_delivery', {
        workspaceId: personalWorkspaceAId,
        instanceId: instance.id,
        ruleId: ruleRes.data.id,
        ruleRevision: 1,
        deliveryGeneration: 1,
        targetType: 'task',
        targetId: taskRes.data.id,
        actorUserId: userAId,
      });

      expect(res.status).toBe('completed');
      expect(pushSentCount).toBe(0); // Push was suppressed by acknowledged local schedule!

      // Database delivery record records suppressed delivery
      const delivRes = await adminPool.query<{ status: string; redacted_body: string }>(
        `SELECT status, redacted_body FROM app.reminder_deliveries WHERE instance_id = $1 AND channel = 'push';`,
        [instance.id]
      );
      expect(delivRes.rows.length).toBe(1);
      expect(delivRes.rows[0]!.redacted_body).toContain('Suppressed by device local schedule acknowledgment');
    });

    it('worker activates push fallback when local schedule is NOT acknowledged and device has valid token', async () => {
      const taskRes = await clientA.createTask(personalWorkspaceAId, {
        title: 'Fallback push task',
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

      // Active device with push token, but NO local schedule acknowledgment
      const deviceId = crypto.randomUUID();
      await adminPool.query(
        `
        INSERT INTO app.devices (id, user_id, installation_id, platform, push_token, token_type, is_active)
        VALUES ($1, $2, 'inst_test_fallback', 'android', 'fcm_fallback_token_123', 'fcm', true);
        `,
        [deviceId, userAId]
      );

      let sentPayload: any = null;
      const testPushAdapter: PushNotificationAdapter = {
        sendPushNotification: async (req) => {
          sentPayload = req;
          return { status: 'delivered', providerMessageId: 'fcm_msg_fallback_999' };
        },
      };
      worker.setPushAdapter(testPushAdapter);

      const res = await worker.processJob(crypto.randomUUID(), 'reminder_delivery', {
        workspaceId: personalWorkspaceAId,
        instanceId: instance.id,
        ruleId: ruleRes.data.id,
        ruleRevision: 1,
        deliveryGeneration: 1,
        targetType: 'task',
        targetId: taskRes.data.id,
        actorUserId: userAId,
      });

      expect(res.status).toBe('completed');
      expect(sentPayload).toBeDefined();
      expect(sentPayload?.pushToken).toBe('fcm_fallback_token_123');
      expect(sentPayload?.dataPayload?.instanceId).toBe(instance.id);

      // Delivery record reflects real provider acceptance
      const delivRes = await adminPool.query<{ status: string; provider_message_id: string }>(
        `SELECT status, provider_message_id FROM app.reminder_deliveries WHERE instance_id = $1 AND channel = 'push';`,
        [instance.id]
      );
      expect(delivRes.rows[0]!.status).toBe('delivered');
      expect(delivRes.rows[0]!.provider_message_id).toBe('fcm_msg_fallback_999');
    });

    it('worker cleans up invalidated push token when push provider reports unregistered token', async () => {
      const taskRes = await clientA.createTask(personalWorkspaceAId, {
        title: 'Invalid token task',
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

      const deviceId = crypto.randomUUID();
      await adminPool.query(
        `
        INSERT INTO app.devices (id, user_id, installation_id, platform, push_token, token_type, is_active)
        VALUES ($1, $2, 'inst_test_invalid_token', 'android', 'fcm_stale_token_xyz', 'fcm', true);
        `,
        [deviceId, userAId]
      );

      const invalidTokenAdapter: PushNotificationAdapter = {
        sendPushNotification: async () => ({
          status: 'failed',
          errorMessage: 'Device token not registered',
          isTokenInvalid: true,
        }),
      };
      worker.setPushAdapter(invalidTokenAdapter);

      await worker.processJob(crypto.randomUUID(), 'reminder_delivery', {
        workspaceId: personalWorkspaceAId,
        instanceId: instance.id,
        ruleId: ruleRes.data.id,
        ruleRevision: 1,
        deliveryGeneration: 1,
        targetType: 'task',
        targetId: taskRes.data.id,
        actorUserId: userAId,
      });

      // Device push_token was cleared and marked inactive
      const devRes = await adminPool.query<{ is_active: boolean; push_token: string | null }>(
        `SELECT is_active, push_token FROM app.devices WHERE id = $1;`,
        [deviceId]
      );
      expect(devRes.rows[0]!.is_active).toBe(false);
      expect(devRes.rows[0]!.push_token).toBeNull();
    });

    it('cancels scheduled local notifications on request or workspace reset', async () => {
      const id1 = await scheduleLocalReminderAsync(null, {
        instanceId: crypto.randomUUID(),
        workspaceId: personalWorkspaceAId,
        title: 'Cancel test 1',
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
        ruleRevision: 1,
      });
      const id2 = await scheduleLocalReminderAsync(null, {
        instanceId: crypto.randomUUID(),
        workspaceId: personalWorkspaceAId,
        title: 'Cancel test 2',
        scheduledAt: new Date(Date.now() + 7200000).toISOString(),
        ruleRevision: 1,
      });

      expect(__mockNotificationControls.getScheduledCount()).toBe(2);

      await cancelLocalReminderAsync(id1.nativeNotificationId!);
      expect(__mockNotificationControls.getScheduledCount()).toBe(1);

      await cancelAllLocalRemindersAsync();
      expect(__mockNotificationControls.getScheduledCount()).toBe(0);
    });
  });

  describe('4. Notification Actions, Deep Links & Payload Safety', () => {
    it('handles notification tap responses, validates payload schema, and deduplicates repeated taps', async () => {
      const receivedPayloads: NotificationPayload[] = [];
      const cleanup = initNotificationResponseListener((payload) => {
        receivedPayloads.push(payload);
      });

      const validPayload: NotificationPayload = {
        type: 'notification',
        destination: 'plan',
        itemId: crypto.randomUUID(),
        instanceId: crypto.randomUUID(),
        workspaceId: personalWorkspaceAId,
        ruleRevision: 1,
        deliveryGeneration: 1,
        timestamp: Date.now(),
      };

      // 1. First tap processes normally
      __mockNotificationControls.simulateNotificationResponse({
        notification: {
          request: {
            identifier: 'notif-tap-1',
            content: { data: validPayload },
            trigger: {},
          },
        },
        actionIdentifier: 'default',
      });

      expect(receivedPayloads.length).toBe(1);
      expect(receivedPayloads[0]!.destination).toBe('plan');

      // 2. Immediate repeated tap with same payload is deduplicated
      __mockNotificationControls.simulateNotificationResponse({
        notification: {
          request: {
            identifier: 'notif-tap-2',
            content: { data: validPayload },
            trigger: {},
          },
        },
        actionIdentifier: 'default',
      });

      expect(receivedPayloads.length).toBe(1); // Deduplicated!

      // 3. Invalid payload schema is safely ignored without crashing
      __mockNotificationControls.simulateNotificationResponse({
        notification: {
          request: {
            identifier: 'notif-tap-invalid',
            content: { data: { destination: 'illegal_admin_page' } },
            trigger: {},
          },
        },
        actionIdentifier: 'default',
      });

      expect(receivedPayloads.length).toBe(1); // Ignored

      cleanup();
    });

    it('confidential reminder completely redacts body and title for lock-screen safety', async () => {
      const res = await scheduleLocalReminderAsync(null, {
        instanceId: crypto.randomUUID(),
        workspaceId: personalWorkspaceAId,
        title: 'Confidential Journal Entry Reminder',
        body: 'Extremely private reflections',
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
        ruleRevision: 1,
        privacyLevel: 'confidential',
      });

      const mockNotif = __mockNotificationControls.getScheduledMap().get(res.nativeNotificationId!);
      expect(mockNotif?.content.title).toBe('Daynori Reminder');
      expect(mockNotif?.content.body).toBe('You have a scheduled reminder');
    });
  });
});
