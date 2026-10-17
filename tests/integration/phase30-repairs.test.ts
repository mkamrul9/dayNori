import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { createApiClient, DaynoriApiClient, ApiConflictError } from '@daynori/api-client';
import {
  getDefaultHomeLayout,
  sanitizeAndMigrateHomeLayout,
  UnsupportedLayoutVersionError,
  isUnsupportedNewerLayoutVersion,
} from '@daynori/domain';
import {
  encryptWebPushPayload,
  createVapidAuthHeader,
  assertSafePushEndpointNetworkDestination,
} from '../../apps/worker/src/crypto/webPushEncryption.js';

describe('Phase 29 & 30 Repairs Regression Suite', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase30-repairs-key';

  const userAId = crypto.randomUUID();
  let tokenUserA: string;
  let clientA: DaynoriApiClient;

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

    const verifier = new JwtVerifier({
      issuer,
      audience,
      localJwks: jwks,
    });

    server = buildServer({
      runtimePool,
      adminPool,
      jwtVerifier: verifier,
      env: {
        PORT: 0,
        SUPABASE_URL: issuer,
        SUPABASE_JWT_SECRET: 'test-secret',
        DATABASE_URL: 'postgres://localhost/test',
        DATABASE_DIRECT_URL: 'postgres://localhost/test',
      },
    });

    await server.listen({ port: 0, host: '127.0.0.1' });
    const address = server.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Server address missing');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;

    tokenUserA = await createToken(userAId);
    clientA = createApiClient({
      baseUrl,
      token: tokenUserA,
    });

    await clientA.provisionPersonalWorkspace({
      displayName: 'Alice Repairs',
      timeZone: 'UTC',
      preferredLocale: 'en',
      weekStart: 'monday',
    });
  });

  afterAll(async () => {
    await server.close();
    await runtimePool.end();
    await adminPool.end();
  });

  describe('1. First Customization Save on Fresh Profile', () => {
    it('adopts authoritative revision 1 and saves layout successfully without 409 conflict', async () => {
      // Create fresh user profile via personal workspace provisioning (starts with revision 1, no homeLayout)
      const freshUserId = crypto.randomUUID();
      const freshToken = await createToken(freshUserId);
      const freshClient = createApiClient({
        baseUrl,
        token: freshToken,
      });

      await freshClient.provisionPersonalWorkspace({
        displayName: 'Fresh User',
        timeZone: 'Asia/Dhaka',
        preferredLocale: 'en',
        weekStart: 'monday',
      });

      // Verify fresh user starts with revision 1 and no homeLayout
      const initPrefs = await freshClient.getUserPreferences();
      expect(initPrefs.data.revision).toBe(1);
      expect(initPrefs.data.preferences.homeLayout).toBeUndefined();

      // First save supplying authoritative revision 1
      const customLayout = getDefaultHomeLayout();
      customLayout.density = 'compact';

      const saveRes = await freshClient.updateUserPreferences({
        preferences: {
          homeLayout: customLayout,
          theme: 'dark',
        },
        expectedRevision: initPrefs.data.revision, // 1
      });

      expect(saveRes.data.revision).toBe(2);
      expect(saveRes.data.preferences.homeLayout?.density).toBe('compact');
      expect(saveRes.data.preferences.theme).toBe('dark');

      // Subsequent fetch confirms persisted revision 2
      const fetched = await freshClient.getUserPreferences();
      expect(fetched.data.revision).toBe(2);
      expect(fetched.data.preferences.homeLayout?.density).toBe('compact');
      expect(fetched.data.preferences.theme).toBe('dark');
    });
  });

  describe('2. Atomic Merge & Preference Preservation', () => {
    it('preserves quietHours and journal preferences when updating homeLayout', async () => {
      // 1. Set full existing preferences on User A
      const existingQuietHours = {
        enabled: true,
        start: '22:00',
        end: '07:30',
        timezone: 'America/New_York',
      };

      const initialRes = await clientA.updateUserPreferences({
        preferences: {
          journalPreviewHidden: true,
          suppressBodySnippets: true,
          quietHours: existingQuietHours,
          theme: 'light',
        },
      });

      const currentRev = initialRes.data.revision;

      // 2. Update homeLayout only
      const newLayout = getDefaultHomeLayout();
      newLayout.widgets[0]!.customLabel = 'My Top Tasks';

      const afterLayoutUpdate = await clientA.updateUserPreferences({
        preferences: {
          homeLayout: newLayout,
        },
        expectedRevision: currentRev,
      });

      expect(afterLayoutUpdate.data.revision).toBe(currentRev + 1);

      // Invariant: quietHours and journal privacy preferences are completely preserved
      expect(afterLayoutUpdate.data.preferences.quietHours).toEqual(existingQuietHours);
      expect(afterLayoutUpdate.data.preferences.journalPreviewHidden).toBe(true);
      expect(afterLayoutUpdate.data.preferences.suppressBodySnippets).toBe(true);
      expect(afterLayoutUpdate.data.preferences.theme).toBe('light');
      expect(afterLayoutUpdate.data.preferences.homeLayout?.widgets[0]?.customLabel).toBe('My Top Tasks');
    });

    it('rejects concurrent save with 409 ApiConflictError when expectedRevision is stale', async () => {
      const current = await clientA.getUserPreferences();
      const currentRev = current.data.revision;

      // First device updates successfully
      await clientA.updateUserPreferences({
        preferences: { theme: 'dark' },
        expectedRevision: currentRev,
      });

      // Second device tries to update using stale revision
      await expect(
        clientA.updateUserPreferences({
          preferences: { theme: 'light' },
          expectedRevision: currentRev, // stale!
        })
      ).rejects.toThrow(ApiConflictError);
    });
  });

  describe('3. Home Layout Compatibility & Schema Bounds', () => {
    it('detects unsupported newer version and throws UnsupportedLayoutVersionError', () => {
      const v2Layout = {
        version: 2,
        density: 'compact',
        widgets: [],
        moduleShortcuts: [],
        favoriteFolderIds: [],
        newFutureFeature: 'unsupported_flag',
      };

      expect(isUnsupportedNewerLayoutVersion(v2Layout)).toBe(true);
      expect(() => sanitizeAndMigrateHomeLayout(v2Layout)).toThrow(UnsupportedLayoutVersionError);

      // With allowUnsupportedVersion: true, returns fallback layout preserving unsupportedVersion marker
      const safeFallback = sanitizeAndMigrateHomeLayout(v2Layout, { allowUnsupportedVersion: true });
      expect(safeFallback.unsupportedVersion).toBe(2);
      expect(safeFallback.density).toBe('comfortable');
    });

    it('bounds widget count and shortcuts to maximum approved counts', () => {
      const oversizedInput = {
        version: 1,
        widgets: Array.from({ length: 20 }, (_, i) => ({
          id: 'tasks',
          visible: true,
          order: i,
        })),
        moduleShortcuts: Array.from({ length: 25 }, (_, i) => ({
          id: 'today',
          visible: true,
          order: i,
        })),
        favoriteFolderIds: Array.from({ length: 50 }, () => crypto.randomUUID()),
      };

      const sanitized = sanitizeAndMigrateHomeLayout(oversizedInput);
      expect(sanitized.widgets.length).toBeLessThanOrEqual(7);
      expect(sanitized.moduleShortcuts.length).toBeLessThanOrEqual(10);
      expect(sanitized.favoriteFolderIds.length).toBeLessThanOrEqual(20);
    });
  });

  describe('4. Web Push RFC 8291 Payload Encryption', () => {
    it('encrypts payload using standard P-256 ECDH and HKDF producing 16-byte salt and valid header', () => {
      // Generate synthetic client P-256 key pair
      const clientEcdh = crypto.createECDH('prime256v1');
      clientEcdh.generateKeys();
      const clientPublicKey = clientEcdh.getPublicKey('base64url');
      const clientAuthSecret = crypto.randomBytes(16).toString('base64url');

      const payload = JSON.stringify({
        title: 'Daily Routine Reminder',
        body: 'Time for your daily review.',
        tag: 'routine-reminder',
      });

      const encryptedBuffer = encryptWebPushPayload({
        p256dh: clientPublicKey,
        auth: clientAuthSecret,
        payload,
      });

      // Salt is first 16 bytes (RFC 8291)
      const salt = encryptedBuffer.subarray(0, 16);
      expect(salt.length).toBe(16);
      // Record size is next 4 bytes (BE 4096 = 0x00001000)
      const rs = encryptedBuffer.readUInt32BE(16);
      expect(rs).toBe(4096);
      // idlen is 1 byte at index 20
      const idlen = encryptedBuffer[20];
      expect(idlen).toBe(65);
      // server public key is 65 bytes starting at index 21
      const serverKey = encryptedBuffer.subarray(21, 21 + 65);
      expect(serverKey.length).toBe(65);
      expect(serverKey[0]).toBe(0x04);
      // Total length contains header (86 bytes) + ciphertext + 16 byte tag
      expect(encryptedBuffer.length).toBeGreaterThan(86 + payload.length);
    });

    it('generates valid ES256 VAPID authorization header', () => {
      const vapidKeys = crypto.generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
      });
      const privateKeyPem = vapidKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
      const publicKeyDer = vapidKeys.publicKey.export({ type: 'spki', format: 'der' });
      // Raw uncompressed public key (last 65 bytes)
      const rawPublicKey = publicKeyDer.subarray(publicKeyDer.length - 65).toString('base64url');

      const authHeader = createVapidAuthHeader({
        endpoint: 'https://push.example.com/v1/send/sub-123',
        subject: 'mailto:admin@daynori.app',
        vapidPrivateKey: privateKeyPem,
        vapidPublicKey: rawPublicKey,
      });

      expect(authHeader.startsWith('vapid t=')).toBe(true);
      expect(authHeader).toContain(`k=${rawPublicKey}`);
    });
  });

  describe('5. Outbound Web Push SSRF Guard', () => {
    it('blocks loopback, private IPs, and non-HTTPS destinations', async () => {
      const privateEndpoints = [
        'http://127.0.0.1:8080/push',
        'http://localhost:3000/push',
        'https://127.0.0.1:8443/push',
        'https://10.0.0.1/push',
        'https://192.168.1.1/push',
        'https://172.16.0.1/push',
        'https://169.254.169.254/latest/meta-data',
        'http://[::1]:8080/push',
      ];

      for (const endpoint of privateEndpoints) {
        await expect(assertSafePushEndpointNetworkDestination(endpoint)).rejects.toThrow();
      }
    });
  });
});
