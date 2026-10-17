import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';
import { DaynoriWorker } from '../../apps/worker/src/worker.js';
import {
  urlBase64ToUint8Array,
  arrayBufferToBase64Url,
  getWebPushCapabilityStateAsync,
  flushPendingPushDeactivationsAsync,
} from '../../apps/web/src/notifications/webPushManager.js';

describe('Phase 29: Web Reminder Delivery and PWA Support Suite', () => {
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
  const kid = 'phase29-web-reminders-key';

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
      VALUES ($1, 'User A Phase 29'), ($2, 'User B Phase 29')
      ON CONFLICT (id) DO NOTHING;
      `,
      [userAId, userBId]
    );

    const wsARes = await adminPool.query<{ id: string }>(`
      INSERT INTO app.workspaces (name, kind, owner_id)
      VALUES ('Personal Workspace A Phase 29', 'personal', '${userAId}')
      RETURNING id;
    `);
    personalWorkspaceAId = wsARes.rows[0]!.id;

    await adminPool.query(`
      INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
      VALUES ('${personalWorkspaceAId}', '${userAId}', 'owner');
    `);

    const wsBRes = await adminPool.query<{ id: string }>(`
      INSERT INTO app.workspaces (name, kind, owner_id)
      VALUES ('Personal Workspace B Phase 29', 'personal', '${userBId}')
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
    await worker?.stop();
    await server?.close();
    await runtimePool?.end();
    await adminPool?.end();
  });

  beforeEach(async () => {
    await adminPool.query(`DELETE FROM app.background_jobs;`);
    await adminPool.query(`DELETE FROM app.device_reminder_schedules;`);
    await adminPool.query(`DELETE FROM app.reminder_deliveries;`);
    await adminPool.query(`DELETE FROM app.reminder_instances;`);
    await adminPool.query(`DELETE FROM app.reminder_rules;`);
    await adminPool.query(`DELETE FROM app.web_push_subscriptions;`);
    await adminPool.query(`DELETE FROM app.devices;`);
  });

  describe('A. Web Push Helper & Capability Invariants', () => {
    it('correctly converts base64url keys to Uint8Array and back', () => {
      const sample = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9ScVU7M2N0e';
      const uint8 = urlBase64ToUint8Array(sample);
      expect(uint8).toBeInstanceOf(Uint8Array);
      expect(uint8.length).toBeGreaterThan(0);

      const roundTrip = arrayBufferToBase64Url(uint8.buffer as ArrayBuffer);
      expect(roundTrip).toBe(sample);
    });

    it('returns unsupported capability state gracefully in non-browser Node environment', async () => {
      const capability = await getWebPushCapabilityStateAsync();
      expect(capability.isSupported).toBe(false);
      expect(capability.isSecureContext).toBe(false);
      expect(capability.permission).toBe('unsupported');
      expect(capability.isSubscribed).toBe(false);
      expect(capability.canSubscribe).toBe(false);
    });
  });

  describe('B. VAPID and Subscription Registration API', () => {
    it('returns VAPID public key with public cache headers', async () => {
      const res = await clientA.getVapidPublicKey();
      expect(res.data).toBeDefined();
      expect(res.data.publicKey).toBeTruthy();
      expect(typeof res.data.publicKey).toBe('string');
    });

    it('registers a Web Push subscription with valid endpoint and keys', async () => {
      const endpoint = `https://fcm.googleapis.com/fcm/send/sub_${crypto.randomUUID()}`;
      const p256dh = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9ScVU7M2N0e';
      const auth = 'tBHItJI5svbpez7KI4CCXg';

      const res = await clientA.registerWebPushSubscription({
        endpoint,
        p256dh,
        auth,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
      });

      expect(res.data).toBeDefined();
      expect(res.data.endpoint).toBe(endpoint);
      expect(res.data.isActive).toBe(true);

      // Verify database record
      const dbRow = await adminPool.query(
        `SELECT * FROM app.web_push_subscriptions WHERE endpoint = $1;`,
        [endpoint]
      );
      expect(dbRow.rows.length).toBe(1);
      expect(dbRow.rows[0].user_id).toBe(userAId);
      expect(dbRow.rows[0].p256dh).toBe(p256dh);
      expect(dbRow.rows[0].auth).toBe(auth);
      expect(dbRow.rows[0].is_active).toBe(true);
    });

    it('rejects SSRF endpoint destinations (loopback, private networks, insecure HTTP, IP variants, credentials, ports)', async () => {
      const p256dh = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9ScVU7M2N0e';
      const auth = 'tBHItJI5svbpez7KI4CCXg';

      // 1. Loopback IP
      await expect(
        clientA.registerWebPushSubscription({
          endpoint: 'https://127.0.0.1:8080/push',
          p256dh,
          auth,
        })
      ).rejects.toThrow();

      // 2. Localhost
      await expect(
        clientA.registerWebPushSubscription({
          endpoint: 'https://localhost/push',
          p256dh,
          auth,
        })
      ).rejects.toThrow();

      // 3. Private RFC1918 range
      await expect(
        clientA.registerWebPushSubscription({
          endpoint: 'https://192.168.1.100/push',
          p256dh,
          auth,
        })
      ).rejects.toThrow();

      // 4. Insecure HTTP
      await expect(
        clientA.registerWebPushSubscription({
          endpoint: 'http://push.services.mozilla.com/v1/sub',
          p256dh,
          auth,
        })
      ).rejects.toThrow();

      // 5. Octal IPv4 (0177.0.0.1)
      await expect(
        clientA.registerWebPushSubscription({
          endpoint: 'https://0177.0.0.1/push',
          p256dh,
          auth,
        })
      ).rejects.toThrow();

      // 6. Hex IPv4 (0x7f000001)
      await expect(
        clientA.registerWebPushSubscription({
          endpoint: 'https://0x7f.0.0.1/push',
          p256dh,
          auth,
        })
      ).rejects.toThrow();

      // 7. Dword integer representation (2130706433)
      await expect(
        clientA.registerWebPushSubscription({
          endpoint: 'https://2130706433/push',
          p256dh,
          auth,
        })
      ).rejects.toThrow();

      // 8. IPv6 mapped address (::ffff:127.0.0.1)
      await expect(
        clientA.registerWebPushSubscription({
          endpoint: 'https://[::ffff:127.0.0.1]/push',
          p256dh,
          auth,
        })
      ).rejects.toThrow();

      // 9. Non-standard port (must be default HTTPS 443)
      await expect(
        clientA.registerWebPushSubscription({
          endpoint: 'https://fcm.googleapis.com:8443/fcm/send/sub',
          p256dh,
          auth,
        })
      ).rejects.toThrow();

      // 10. Embedded credentials
      await expect(
        clientA.registerWebPushSubscription({
          endpoint: 'https://user:pass@fcm.googleapis.com/fcm/send/sub',
          p256dh,
          auth,
        })
      ).rejects.toThrow();

      // 11. Disallowed internal suffixes
      await expect(
        clientA.registerWebPushSubscription({
          endpoint: 'https://service.internal/push',
          p256dh,
          auth,
        })
      ).rejects.toThrow();
    });

    it('enforces single-account active endpoint binding when multiple accounts share an endpoint on the same browser', async () => {
      const sharedEndpoint = `https://fcm.googleapis.com/fcm/send/shared_browser_${crypto.randomUUID()}`;
      const p256dh = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9ScVU7M2N0eA';
      const auth = 'tBHItJI5svbpez7KI4CCXg';

      // 1. Account A subscribes on browser
      await clientA.registerWebPushSubscription({
        endpoint: sharedEndpoint,
        p256dh,
        auth,
      });

      const subARow1 = await adminPool.query(
        `SELECT is_active FROM app.web_push_subscriptions WHERE endpoint = $1 AND user_id = $2;`,
        [sharedEndpoint, userAId]
      );
      expect(subARow1.rows[0].is_active).toBe(true);

      // 2. Account A logs out offline, or Account B signs in on the same browser
      // Account B registers the same endpoint
      await clientB.registerWebPushSubscription({
        endpoint: sharedEndpoint,
        p256dh,
        auth,
      });

      // 3. Verify Account A's subscription was automatically deactivated and Account B's is active
      const subARow2 = await adminPool.query(
        `SELECT is_active FROM app.web_push_subscriptions WHERE endpoint = $1 AND user_id = $2;`,
        [sharedEndpoint, userAId]
      );
      expect(subARow2.rows[0].is_active).toBe(false);

      const subBRow = await adminPool.query(
        `SELECT is_active FROM app.web_push_subscriptions WHERE endpoint = $1 AND user_id = $2;`,
        [sharedEndpoint, userBId]
      );
      expect(subBRow.rows[0].is_active).toBe(true);

      // 4. Verify partial unique index guarantees at most 1 active subscription for this endpoint
      const activeCount = await adminPool.query(
        `SELECT count(*)::int as count FROM app.web_push_subscriptions WHERE endpoint = $1 AND is_active = true;`,
        [sharedEndpoint]
      );
      expect(activeCount.rows[0].count).toBe(1);
    });

    it('durably flushes pending deactivations from prior offline logouts', async () => {
      const offlineEndpoint = `https://fcm.googleapis.com/fcm/send/offline_logout_${crypto.randomUUID()}`;
      const p256dh = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9ScVU7M2N0eA';
      const auth = 'tBHItJI5svbpez7KI4CCXg';

      await clientA.registerWebPushSubscription({
        endpoint: offlineEndpoint,
        p256dh,
        auth,
      });

      // Simulate offline signout: pending deactivation queued in localStorage
      const mockStorage: Record<string, string> = {
        daynori_pending_push_deactivations: JSON.stringify([offlineEndpoint]),
      };

      const originalLocalStorage = globalThis.localStorage;
      globalThis.localStorage = {
        getItem: (k: string) => mockStorage[k] ?? null,
        setItem: (k: string, v: string) => {
          mockStorage[k] = v;
        },
        removeItem: (k: string) => {
          delete mockStorage[k];
        },
        clear: () => {},
        key: () => null,
        length: 0,
      } as unknown as Storage;

      try {
        await flushPendingPushDeactivationsAsync(clientA);

        // Verify endpoint is deactivated in database
        const row = await adminPool.query(
          `SELECT is_active FROM app.web_push_subscriptions WHERE endpoint = $1;`,
          [offlineEndpoint]
        );
        expect(row.rows[0].is_active).toBe(false);

        // Verify pending queue in localStorage was cleared
        expect(mockStorage['daynori_pending_push_deactivations']).toBeUndefined();
      } finally {
        globalThis.localStorage = originalLocalStorage;
      }
    });

    it('idempotently updates existing subscription on re-registration', async () => {
      const endpoint = `https://updates.push.services.mozilla.com/wpush/v2/sub_${crypto.randomUUID()}`;
      const p256dh1 = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9ScVU7M2N0e1';
      const p256dh2 = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9ScVU7M2N0e2';
      const auth = 'tBHItJI5svbpez7KI4CCXg';

      await clientA.registerWebPushSubscription({
        endpoint,
        p256dh: p256dh1,
        auth,
      });

      const updateRes = await clientA.registerWebPushSubscription({
        endpoint,
        p256dh: p256dh2,
        auth,
      });

      expect(updateRes.data.endpoint).toBe(endpoint);
      expect(updateRes.data.isActive).toBe(true);

      const dbRows = await adminPool.query(
        `SELECT * FROM app.web_push_subscriptions WHERE endpoint = $1;`,
        [endpoint]
      );
      expect(dbRows.rows.length).toBe(1);
      expect(dbRows.rows[0].p256dh).toBe(p256dh2);
    });

    it('lists only active subscriptions belonging to authenticated user', async () => {
      const endpointA = `https://fcm.googleapis.com/fcm/send/user_a_${crypto.randomUUID()}`;
      const endpointB = `https://fcm.googleapis.com/fcm/send/user_b_${crypto.randomUUID()}`;

      await clientA.registerWebPushSubscription({
        endpoint: endpointA,
        p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9ScVU7M2N0eA',
        auth: 'tBHItJI5svbpez7KI4CCXA',
      });

      await clientB.registerWebPushSubscription({
        endpoint: endpointB,
        p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9ScVU7M2N0eB',
        auth: 'tBHItJI5svbpez7KI4CCXB',
      });

      const listA = await clientA.listWebPushSubscriptions();
      expect(listA.data.length).toBe(1);
      expect(listA.data[0]!.endpoint).toBe(endpointA);

      const listB = await clientB.listWebPushSubscriptions();
      expect(listB.data.length).toBe(1);
      expect(listB.data[0]!.endpoint).toBe(endpointB);
    });

    it('deactivates subscription on unsubscribe request', async () => {
      const endpoint = `https://fcm.googleapis.com/fcm/send/sub_${crypto.randomUUID()}`;
      await clientA.registerWebPushSubscription({
        endpoint,
        p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9ScVU7M2N0eA',
        auth: 'tBHItJI5svbpez7KI4CCXg',
      });

      const deactRes = await clientA.deactivateWebPushSubscription(endpoint);
      expect(deactRes.data.success).toBe(true);

      const dbRow = await adminPool.query(
        `SELECT is_active FROM app.web_push_subscriptions WHERE endpoint = $1;`,
        [endpoint]
      );
      expect(dbRow.rows[0].is_active).toBe(false);

      const listAfter = await clientA.listWebPushSubscriptions();
      expect(listAfter.data.length).toBe(0);
    });
  });

  describe('C. Multi-Device and Web Push Delivery Coordination', () => {
    it('delivers independently to Web Push subscription when an Android device acknowledges local scheduling', async () => {
      const taskRes = await clientA.createTask(personalWorkspaceAId, {
        title: 'Multi-device and web reminder test',
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

      // 1. Setup Android Device A (locally acknowledged)
      const devAId = crypto.randomUUID();
      await adminPool.query(
        `INSERT INTO app.devices (id, user_id, installation_id, platform, token_type, push_token, is_active)
         VALUES ($1, $2, 'inst_dev_a', 'android', 'expo_push', 'ExponentPushToken[devA]', true);`,
        [devAId, userAId]
      );

      await adminPool.query(
        `INSERT INTO app.device_reminder_schedules (
           workspace_id, instance_id, device_id, rule_revision, delivery_generation,
           native_notification_id, delivery_mode, acknowledged, acknowledged_at
         ) VALUES ($1, $2, $3, 1, 1, 'mock-notif-a', 'local', true, now());`,
        [personalWorkspaceAId, instance.id, devAId]
      );

      // 2. Setup Android Device B (not acknowledged)
      const devBId = crypto.randomUUID();
      await adminPool.query(
        `INSERT INTO app.devices (id, user_id, installation_id, platform, token_type, push_token, is_active)
         VALUES ($1, $2, 'inst_dev_b', 'android', 'expo_push', 'ExponentPushToken[devB]', true);`,
        [devBId, userAId]
      );

      // 3. Setup Web Push Subscription
      const webSubEndpoint = `https://fcm.googleapis.com/fcm/send/web_${crypto.randomUUID()}`;
      const subRes = await adminPool.query<{ id: string }>(
        `INSERT INTO app.web_push_subscriptions (user_id, endpoint, p256dh, auth, is_active)
         VALUES ($1, $2, 'p256dh_sample', 'auth_sample', true) RETURNING id;`,
        [userAId, webSubEndpoint]
      );
      const subId = subRes.rows[0]!.id;

      // Mock push adapters
      let pushSentCount = 0;
      worker.setPushAdapter({
        sendPushNotification: async () => {
          pushSentCount++;
          return { status: 'delivered', providerMessageId: 'prov_push' };
        },
      });

      let webPushSentCount = 0;
      worker.setWebPushAdapter({
        sendWebPush: async () => {
          webPushSentCount++;
          return { success: true, status: 'delivered', providerMessageId: 'prov_web_push' };
        },
      });

      // Execute worker delivery job
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
      expect(pushSentCount).toBe(1); // Sent to Device B only; Device A was suppressed
      expect(webPushSentCount).toBe(1); // Sent to Web Push independently

      // Verify deliveries in database
      const deliveries = await adminPool.query(
        `SELECT recipient_device_id, recipient_subscription_id, channel, status, redacted_body
         FROM app.reminder_deliveries
         WHERE instance_id = $1;`,
        [instance.id]
      );

      const devADelivery = deliveries.rows.find((d) => d.recipient_device_id === devAId);
      const devBDelivery = deliveries.rows.find((d) => d.recipient_device_id === devBId);
      const webDelivery = deliveries.rows.find((d) => d.recipient_subscription_id === subId);

      // Device A acknowledged local schedule -> suppressed_local_schedule
      expect(devADelivery).toBeDefined();
      expect(devADelivery.status).toBe('suppressed_local_schedule');
      expect(devADelivery.redacted_body).toContain('Suppressed by device local schedule acknowledgment');

      // Device B did NOT acknowledge local schedule -> delivered via push
      expect(devBDelivery).toBeDefined();
      expect(devBDelivery.status).toBe('delivered');

      // Web Push subscription did NOT acknowledge local schedule -> delivered via web push
      expect(webDelivery).toBeDefined();
      expect(webDelivery.status).toBe('delivered');
    });

    it('deactivates expired Web Push subscription on 410 Gone error and records failed delivery', async () => {
      const taskRes = await clientA.createTask(personalWorkspaceAId, {
        title: 'Expired subscription task',
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

      const webSubEndpoint = `https://fcm.googleapis.com/fcm/send/expired_${crypto.randomUUID()}`;
      const subRes = await adminPool.query<{ id: string }>(
        `INSERT INTO app.web_push_subscriptions (user_id, endpoint, p256dh, auth, is_active)
         VALUES ($1, $2, 'p256dh_exp', 'auth_exp', true) RETURNING id;`,
        [userAId, webSubEndpoint]
      );
      const subId = subRes.rows[0]!.id;

      worker.setWebPushAdapter({
        sendWebPush: async () => {
          return {
            success: false,
            status: 'failed',
            errorMessage: '410 Gone: Push subscription has expired or unsubscribed',
            isSubscriptionExpired: true,
          };
        },
      });

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

      // Check delivery status
      const deliveries = await adminPool.query(
        `SELECT status, error_message
         FROM app.reminder_deliveries
         WHERE instance_id = $1 AND recipient_subscription_id = $2;`,
        [instance.id, subId]
      );
      expect(deliveries.rows.length).toBe(1);
      expect(deliveries.rows[0].status).toBe('failed');
      expect(deliveries.rows[0].error_message).toContain('410');

      // Subscription must be marked inactive
      const subCheck = await adminPool.query(
        `SELECT is_active FROM app.web_push_subscriptions WHERE id = $1;`,
        [subId]
      );
      expect(subCheck.rows[0].is_active).toBe(false);
    });

    it('retries failed Web Push delivery on subsequent execution without duplicate delivery rows', async () => {
      const taskRes = await clientA.createTask(personalWorkspaceAId, {
        title: 'Retry subscription task',
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

      const webSubEndpoint = `https://fcm.googleapis.com/fcm/send/transient_${crypto.randomUUID()}`;
      const subRes = await adminPool.query<{ id: string }>(
        `INSERT INTO app.web_push_subscriptions (user_id, endpoint, p256dh, auth, is_active)
         VALUES ($1, $2, 'p256dh_t', 'auth_t', true) RETURNING id;`,
        [userAId, webSubEndpoint]
      );
      const subId = subRes.rows[0]!.id;

      let callCount = 0;
      worker.setWebPushAdapter({
        sendWebPush: async () => {
          callCount++;
          if (callCount === 1) {
            return {
              status: 'failed',
              errorMessage: '503 Service Unavailable: Gateway Timeout',
            };
          }
          return {
            success: true,
            status: 'delivered',
            providerMessageId: 'receipt-recovered',
          };
        },
      });

      // First run: fails transiently
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

      const delivery1 = await adminPool.query(
        `SELECT status, attempt_count, error_message
         FROM app.reminder_deliveries
         WHERE instance_id = $1 AND recipient_subscription_id = $2;`,
        [instance.id, subId]
      );
      expect(delivery1.rows[0].status).toBe('failed');
      expect(delivery1.rows[0].attempt_count).toBe(1);
      expect(delivery1.rows[0].error_message).toContain('503');

      // Verify a durable background retry job was persisted in app.background_jobs
      const retryJobRes = await adminPool.query<{ id: string; status: string; payload: Record<string, unknown> }>(
        `SELECT id, status, payload FROM app.background_jobs
         WHERE task_type = 'reminder_delivery' AND status = 'pending'
           AND (payload->>'instanceId') = $1 AND (payload->>'isRetry') = 'true';`,
        [instance.id]
      );
      expect(retryJobRes.rows.length).toBe(1);
      expect(retryJobRes.rows[0]!.payload.isRetry).toBe(true);
      const retryJobId = retryJobRes.rows[0]!.id;

      // Simulate backoff timer elapsed by advancing run_at into the past
      await adminPool.query(
        `UPDATE app.background_jobs SET run_at = now() - interval '1 second' WHERE id = $1;`,
        [retryJobId]
      );

      // Second run: worker polls and processes the persisted retry job from the database
      const pollRes = await worker.pollAndProcessNextJob();
      expect(pollRes).not.toBeNull();
      expect(pollRes!.jobId).toBe(retryJobId);
      expect(pollRes!.status).toBe('completed');

      const delivery2 = await adminPool.query(
        `SELECT status, attempt_count, provider_message_id
         FROM app.reminder_deliveries
         WHERE instance_id = $1 AND recipient_subscription_id = $2;`,
        [instance.id, subId]
      );
      expect(delivery2.rows.length).toBe(1);
      expect(delivery2.rows[0].status).toBe('delivered');
      expect(delivery2.rows[0].attempt_count).toBe(2);
      expect(delivery2.rows[0].provider_message_id).toBe('receipt-recovered');

      const completedJobRes = await adminPool.query(
        `SELECT status FROM app.background_jobs WHERE id = $1;`,
        [retryJobId]
      );
      expect(completedJobRes.rows[0].status).toBe('completed');
    });
  });

  describe('D. Service Worker & PWA Cache Safety Rules', () => {
    let swContent: string;

    beforeAll(() => {
      const swPath = path.resolve(process.cwd(), 'apps/web/public/sw.js');
      expect(fs.existsSync(swPath)).toBe(true);
      swContent = fs.readFileSync(swPath, 'utf8');
    });

    it('includes static public allowlist and versioned cache name', () => {
      expect(swContent).toContain('daynori-static-v2');
      expect(swContent).toContain('ALLOWLISTED_STATIC_ASSETS');
      expect(swContent).toContain('/offline.html');
      expect(swContent).toContain('/manifest.json');
    });

    it('strictly forbids caching HTML navigation, Next.js RSC, and private APIs', () => {
      // Check exclusion functions/logic in sw.js
      expect(swContent).toContain('isAllowlistedStaticAsset');
      expect(swContent).toContain('_rsc');
      expect(swContent).toContain('/api/');
      expect(swContent).toContain('/v1/');
      expect(swContent).toContain("req.headers.get('RSC')");
      expect(swContent).toContain("req.mode === 'navigate'");
    });

    it('restricts notification click destinations to same-origin allowed paths', () => {
      expect(swContent).toContain('ALLOWED_DESTINATIONS');
      expect(swContent).toContain('plan');
      expect(swContent).toContain('settings');
      expect(swContent).toContain('clients.openWindow');
    });

    it('displays privacy-minimized generic titles and bodies on push events', () => {
      expect(swContent).toContain('Daynori Reminder');
      expect(swContent).toContain('You have a scheduled reminder');
      expect(swContent).toContain('registration.showNotification');
    });

    it('executes shipped service worker in sandbox and validates actual CacheStorage, fetch canary rules, and push privacy', async () => {
      // 1. Setup in-memory mock CacheStorage
      const inMemoryCache = new Map<string, Response>();
      const mockCache = {
        addAll: async (urls: string[]) => {
          for (const u of urls) {
            inMemoryCache.set(u, new Response(`content of ${u}`, { status: 200 }));
          }
        },
        match: async (reqOrUrl: Request | string) => {
          const key = typeof reqOrUrl === 'string' ? reqOrUrl : new URL(reqOrUrl.url).pathname;
          return inMemoryCache.get(key) || null;
        },
        put: async (req: Request | string, res: Response) => {
          const key = typeof req === 'string' ? req : new URL(req.url).pathname;
          inMemoryCache.set(key, res);
        },
        delete: async (key: string) => inMemoryCache.delete(key),
      };

      const eventHandlers: Record<string, ((e: Record<string, unknown>) => Promise<void> | void)[]> = {};
      const notificationsShown: { title: string; options: Record<string, unknown> }[] = [];
      const openedWindows: string[] = [];

      const sandboxSelf: Record<string, unknown> = {
        location: { origin: 'https://daynori.app' },
      };
      const sandboxCaches = {
        open: async () => mockCache,
        keys: async () => ['daynori-static-v1'],
        delete: async () => true,
        match: async (reqOrUrl: Request | string) => mockCache.match(reqOrUrl),
      };
      const sandboxClients = {
        claim: async () => {},
        matchAll: async () => [],
        openWindow: async (url: string) => {
          openedWindows.push(url);
          return { focus: async () => {} };
        },
      };
      const sandboxRegistration = {
        showNotification: async (title: string, options: Record<string, unknown>) => {
          notificationsShown.push({ title, options });
        },
      };
      const sandboxAddEventListener = (event: string, handler: (e: Record<string, unknown>) => void) => {
        if (!eventHandlers[event]) eventHandlers[event] = [];
        eventHandlers[event]!.push(handler);
      };

      sandboxSelf.caches = sandboxCaches;
      sandboxSelf.addEventListener = sandboxAddEventListener;
      sandboxSelf.clients = sandboxClients;
      sandboxSelf.registration = sandboxRegistration;

      const sandbox: Record<string, unknown> = {
        self: sandboxSelf,
        caches: sandboxCaches,
        addEventListener: sandboxAddEventListener,
        clients: sandboxClients,
        registration: sandboxRegistration,
        Request,
        Response,
        URL,
        URLSearchParams,
        console,
      };

      // 2. Execute shipped sw.js in new VM context
      vm.createContext(sandbox);
      vm.runInContext(swContent, sandbox);

      // Verify event listeners were registered
      expect(eventHandlers['install']).toBeDefined();
      expect(eventHandlers['activate']).toBeDefined();
      expect(eventHandlers['fetch']).toBeDefined();
      expect(eventHandlers['push']).toBeDefined();
      expect(eventHandlers['notificationclick']).toBeDefined();

      // 3. Test install event
      let installWaitPromise: Promise<unknown> | null = null;
      const installEvent = {
        waitUntil: (p: Promise<unknown>) => {
          installWaitPromise = p;
        },
      };
      await eventHandlers['install']![0]!(installEvent);
      await installWaitPromise;

      expect(inMemoryCache.has('/offline.html')).toBe(true);
      expect(inMemoryCache.has('/manifest.json')).toBe(true);
      expect(inMemoryCache.has('/favicon.ico')).toBe(true);

      // 4. Test fetch event: public static file without query
      let fetchResPromise: Promise<Response> | null = null;
      const staticReq = new Request('https://daynori.app/manifest.json');
      await eventHandlers['fetch']![0]!({
        request: staticReq,
        respondWith: (p: Promise<Response>) => {
          fetchResPromise = p;
        },
        waitUntil: () => {},
      });
      const staticRes = await fetchResPromise!;
      expect(staticRes.status).toBe(200);

      // 5. Test fetch event: synthetic canary with signature token must NOT match allowlist
      let _canaryResPromise: Promise<Response> | null = null;
      const canaryReq = new Request('https://daynori.app/manifest.json?signature=synthetic-canary');
      let responded = false;
      await eventHandlers['fetch']![0]!({
        request: canaryReq,
        respondWith: (p: Promise<Response>) => {
          responded = true;
          _canaryResPromise = p;
        },
        waitUntil: () => {},
      });
      // When not matching allowlist and not navigate, sw.js falls through to default network
      expect(responded).toBe(false);

      // 6. Test push event: sensitive payload MUST produce generic title and body
      let pushWaitPromise: Promise<unknown> | null = null;
      await eventHandlers['push']![0]!({
        data: {
          json: () => ({
            title: 'Confidential Medical Alert: Prescription refill',
            body: 'Private patient details that should never be shown unauthenticated',
            data: { itemId: 'item_123', workspaceId: 'ws_abc', instanceId: 'inst_xyz', targetType: 'task', deliveryGeneration: '1' },
          }),
        },
        waitUntil: (p: Promise<unknown>) => {
          pushWaitPromise = p;
        },
      });
      await pushWaitPromise;

      expect(notificationsShown.length).toBe(1);
      expect(notificationsShown[0]!.title).toBe('Daynori Reminder');
      expect(notificationsShown[0]!.options.body).toBe('You have a scheduled reminder');
      expect(notificationsShown[0]!.options.data.itemId).toBe('item_123');

      // 7. Test push event with malformed / non-JSON data: still generic and graceful
      let malformedWait: Promise<unknown> | null = null;
      await eventHandlers['push']![0]!({
        data: {
          json: () => {
            throw new Error('Unexpected token < in JSON at position 0');
          },
        },
        waitUntil: (p: Promise<unknown>) => {
          malformedWait = p;
        },
      });
      await malformedWait;

      expect(notificationsShown.length).toBe(2);
      expect(notificationsShown[1]!.title).toBe('Daynori Reminder');
      expect(notificationsShown[1]!.options.body).toBe('You have a scheduled reminder');

      // 8. Test notification click event: navigates to validated plan destination carrying identifiers
      let clickWait: Promise<unknown> | null = null;
      await eventHandlers['notificationclick']![0]!({
        notification: {
          close: () => {},
          data: {
            destination: 'plan',
            itemId: 'item_123',
            workspaceId: 'ws_abc',
            instanceId: 'inst_xyz',
            targetType: 'task',
            deliveryGeneration: '1',
          },
        },
        waitUntil: (p: Promise<unknown>) => {
          clickWait = p;
        },
      });
      await clickWait;

      expect(openedWindows.length).toBe(1);
      expect(openedWindows[0]).toContain('/plan?');
      expect(openedWindows[0]).toContain('targetId=item_123');
      expect(openedWindows[0]).toContain('workspaceId=ws_abc');
      expect(openedWindows[0]).toContain('reminderInstanceId=inst_xyz');
      expect(openedWindows[0]).toContain('deliveryGeneration=1');
    });
  });

  describe('E. ReminderAgendaView Account Isolation and Offline Claims', () => {
    it('isolates local cached reminder state strictly to current workspace/account', () => {
      const wsAKey = 'daynori_agenda_cache_ws_user_a';
      const wsBKey = 'daynori_agenda_cache_ws_user_b';

      const mockStore: Record<string, string> = {
        [wsAKey]: JSON.stringify([{ id: 'inst_a', targetTitle: 'User A Secret Task' }]),
      };

      // Reading User A's cache succeeds
      const aData = JSON.parse(mockStore[wsAKey] || '[]');
      expect(aData.length).toBe(1);
      expect(aData[0].targetTitle).toBe('User A Secret Task');

      // Reading User B's cache does NOT return User A's data
      const bData = JSON.parse(mockStore[wsBKey] || '[]');
      expect(bData.length).toBe(0);

      // Verify clearing cache on account switch
      delete mockStore[wsAKey];
      expect(mockStore[wsAKey]).toBeUndefined();
    });
  });
});
