import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import {
  createApiClient,
  ApiConflictError,
  ApiValidationError,
  ApiNotFoundError,
} from '@daynori/api-client';

describe('Phase 10: Personal Workspace & User Preferences Integration', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase10-test-key';

  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();

  let tokenUserA: string;
  let tokenUserB: string;

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
  });

  afterAll(async () => {
    await server.close();
    await runtimePool.end();
    await adminPool.end();
  });

  describe('1. Idempotent & Atomic Personal Workspace Provisioning', () => {
    let provisionedWorkspaceId: string;

    it('provisions exactly one personal workspace and profile on first call with 201 Created', async () => {
      const clientA = createApiClient({
        baseUrl,
        token: tokenUserA,
      });

      const res = await clientA.provisionPersonalWorkspace({
        displayName: 'Alice In Wonderland',
        timeZone: 'Europe/London',
        preferredLocale: 'en-GB',
        weekStart: 'monday',
      });

      expect(res.data.isNew).toBe(true);
      expect(res.data.workspace.kind).toBe('personal');
      expect(res.data.workspace.ownerId).toBe(userAId);
      expect(res.data.profile.displayName).toBe('Alice In Wonderland');
      expect(res.data.profile.timeZone).toBe('Europe/London');
      expect(res.data.profile.preferredLocale).toBe('en-GB');
      expect(res.data.profile.weekStart).toBe('monday');
      expect(res.data.profile.preferences).toEqual({ theme: 'system', compactMode: false });
      expect(res.data.profile.revision).toBe(1);

      provisionedWorkspaceId = res.data.workspace.id;

      // Verify owner membership was created atomically in database
      const adminClient = await adminPool.connect();
      try {
        const memRes = await adminClient.query(
          `SELECT role FROM app.workspace_memberships WHERE workspace_id = $1 AND user_id = $2`,
          [provisionedWorkspaceId, userAId]
        );
        expect(memRes.rows).toHaveLength(1);
        expect(memRes.rows[0].role).toBe('owner');
      } finally {
        adminClient.release();
      }
    });

    it('returns the existing personal workspace on repeated calls idempotently with 200 OK', async () => {
      const clientA = createApiClient({
        baseUrl,
        token: tokenUserA,
      });

      const res = await clientA.provisionPersonalWorkspace({
        displayName: 'Alice Second Attempt',
      });

      expect(res.data.isNew).toBe(false);
      expect(res.data.workspace.id).toBe(provisionedWorkspaceId);
      expect(res.data.workspace.kind).toBe('personal');
      expect(res.data.profile.displayName).toBe('Alice In Wonderland'); // original display name preserved
    });

    it('enforces database uniqueness: concurrent provisioning requests yield exactly one personal workspace', async () => {
      const concurrentUserId = crypto.randomUUID();
      const concurrentToken = await createToken(concurrentUserId);
      const concurrentClient = createApiClient({
        baseUrl,
        token: concurrentToken,
      });

      // Fire 5 simultaneous provisioning requests
      const results = await Promise.all([
        concurrentClient.provisionPersonalWorkspace({ displayName: 'Concurrent 1' }),
        concurrentClient.provisionPersonalWorkspace({ displayName: 'Concurrent 2' }),
        concurrentClient.provisionPersonalWorkspace({ displayName: 'Concurrent 3' }),
        concurrentClient.provisionPersonalWorkspace({ displayName: 'Concurrent 4' }),
        concurrentClient.provisionPersonalWorkspace({ displayName: 'Concurrent 5' }),
      ]);

      const workspaceIds = new Set(results.map((r) => r.data.workspace.id));
      expect(workspaceIds.size).toBe(1); // Exactly one unique workspace ID

      // Verify in DB that only 1 personal workspace exists for concurrentUserId
      const adminClient = await adminPool.connect();
      try {
        const wsRows = await adminClient.query(
          `SELECT id FROM app.workspaces WHERE owner_id = $1 AND kind = 'personal'`,
          [concurrentUserId]
        );
        expect(wsRows.rows).toHaveLength(1);
      } finally {
        adminClient.release();
      }
    });

    it('rejects creating a secondary personal workspace via POST /v1/workspaces with 409 Conflict', async () => {
      const clientA = createApiClient({
        baseUrl,
        token: tokenUserA,
      });

      await expect(
        clientA.createWorkspace({
          name: 'Alice Duplicate Personal Workspace',
          kind: 'personal',
        })
      ).rejects.toThrow(ApiConflictError);
    });
  });

  describe('2. Workspace Boundaries & Membership Enforcement', () => {
    it('GET /v1/workspaces/personal resolves the provisioned personal workspace', async () => {
      const clientA = createApiClient({
        baseUrl,
        token: tokenUserA,
      });

      const personalWs = await clientA.getPersonalWorkspace();
      expect(personalWs.data.kind).toBe('personal');
      expect(personalWs.data.ownerId).toBe(userAId);
    });

    it('GET /v1/workspaces/personal returns 404 if not yet provisioned', async () => {
      const unprovisionedUserId = crypto.randomUUID();
      const unprovisionedToken = await createToken(unprovisionedUserId);
      const unprovisionedClient = createApiClient({
        baseUrl,
        token: unprovisionedToken,
      });

      await expect(unprovisionedClient.getPersonalWorkspace()).rejects.toThrow(ApiNotFoundError);
    });

    it('CROSS-TENANT ISOLATION: User B cannot get or select User A personal workspace (returns 404)', async () => {
      const clientA = createApiClient({ baseUrl, token: tokenUserA });
      const clientB = createApiClient({ baseUrl, token: tokenUserB });

      // First provision User B
      await clientB.provisionPersonalWorkspace({ displayName: 'Bob The Builder' });

      const userAPersonalWs = await clientA.getPersonalWorkspace();

      // User B tries to access User A's workspace
      await expect(clientB.getWorkspace(userAPersonalWs.data.id)).rejects.toThrow(ApiNotFoundError);
    });
  });

  describe('3. Validated User Preferences & Optimistic Concurrency Control', () => {
    it('GET /v1/users/me/preferences returns actor profile and default preferences', async () => {
      const clientA = createApiClient({ baseUrl, token: tokenUserA });

      const profileRes = await clientA.getUserPreferences();
      expect(profileRes.data.id).toBe(userAId);
      expect(profileRes.data.timeZone).toBe('Europe/London');
      expect(profileRes.data.preferredLocale).toBe('en-GB');
      expect(profileRes.data.weekStart).toBe('monday');
      expect(profileRes.data.preferences).toEqual({ theme: 'system', compactMode: false });
      expect(profileRes.data.preferencesSchemaVersion).toBe(1);
      expect(profileRes.data.revision).toBe(1);
    });

    it('PATCH /v1/users/me/preferences validates IANA time zone and rejects invalid strings', async () => {
      const clientA = createApiClient({ baseUrl, token: tokenUserA });

      await expect(
        clientA.updateUserPreferences({
          timeZone: 'Mars/Curiosity_Rover',
        })
      ).rejects.toThrow(ApiValidationError);

      await expect(
        clientA.updateUserPreferences({
          timeZone: 'Invalid/Zone_Name',
        })
      ).rejects.toThrow(ApiValidationError);
    });

    it('PATCH /v1/users/me/preferences validates locale and week start', async () => {
      const clientA = createApiClient({ baseUrl, token: tokenUserA });

      await expect(
        clientA.updateUserPreferences({
          preferredLocale: '1234567890!invalid',
        })
      ).rejects.toThrow(ApiValidationError);

      await expect(
        clientA.updateUserPreferences({
          // @ts-expect-error Testing invalid week start value
          weekStart: 'wednesday',
        })
      ).rejects.toThrow(ApiValidationError);
    });

    it('PATCH /v1/users/me/preferences updates preferences and increments revision', async () => {
      const clientA = createApiClient({ baseUrl, token: tokenUserA });

      const updated = await clientA.updateUserPreferences({
        timeZone: 'America/New_York',
        preferredLocale: 'en-US',
        weekStart: 'sunday',
        preferences: {
          theme: 'dark',
          compactMode: true,
        },
        expectedRevision: 1,
      });

      expect(updated.data.timeZone).toBe('America/New_York');
      expect(updated.data.preferredLocale).toBe('en-US');
      expect(updated.data.weekStart).toBe('sunday');
      expect(updated.data.preferences).toEqual({ theme: 'dark', compactMode: true });
      expect(updated.data.revision).toBe(2);
    });

    it('PATCH /v1/users/me/preferences rejects stale expectedRevision with 409 Conflict', async () => {
      const clientA = createApiClient({ baseUrl, token: tokenUserA });

      // Actor currently at revision 2, but client provides expectedRevision: 1
      await expect(
        clientA.updateUserPreferences({
          timeZone: 'Asia/Tokyo',
          expectedRevision: 1,
        })
      ).rejects.toThrow(ApiConflictError);

      // Verify that profile values were preserved and NOT overwritten
      const current = await clientA.getUserPreferences();
      expect(current.data.timeZone).toBe('America/New_York');
      expect(current.data.revision).toBe(2);
    });

    it('PATCH /v1/users/me/preferences succeeds when expectedRevision matches current revision', async () => {
      const clientA = createApiClient({ baseUrl, token: tokenUserA });

      const updated = await clientA.updateUserPreferences({
        timeZone: 'Asia/Tokyo',
        weekStart: 'monday',
        expectedRevision: 2,
      });

      expect(updated.data.timeZone).toBe('Asia/Tokyo');
      expect(updated.data.weekStart).toBe('monday');
      expect(updated.data.revision).toBe(3);
    });
  });
});
