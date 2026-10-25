import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { createApiClient, ApiConflictError } from '@daynori/api-client';

describe('Phase 66: operator session and feature personalization', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase66-test-key';

  const ordinaryUserId = crypto.randomUUID();
  const operatorUserId = crypto.randomUUID();

  let tokenOrdinary: string;
  let tokenOperator: string;
  let previousOperatorEnv: string | undefined;

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
    previousOperatorEnv = process.env.DAYNORI_OPERATOR_USER_IDS;
    process.env.DAYNORI_OPERATOR_USER_IDS = operatorUserId;

    adminPool = createAdminPool();
    runtimePool = createRuntimePool();

    keyPair = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = kid;
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';
    jwks = { keys: [publicJwk] };

    tokenOrdinary = await createToken(ordinaryUserId);
    tokenOperator = await createToken(operatorUserId);

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
    } else {
      throw new Error('Failed to bind test server');
    }
  });

  afterAll(async () => {
    if (previousOperatorEnv === undefined) {
      delete process.env.DAYNORI_OPERATOR_USER_IDS;
    } else {
      process.env.DAYNORI_OPERATOR_USER_IDS = previousOperatorEnv;
    }
    await server.close();
    await runtimePool.end();
    await adminPool.end();
  });

  it('denies operator session to unauthenticated and ordinary users', async () => {
    const anon = await fetch(`${baseUrl}/v1/operator/session`);
    expect([401, 403]).toContain(anon.status);

    const ordinary = await fetch(`${baseUrl}/v1/operator/session`, {
      headers: { Authorization: `Bearer ${tokenOrdinary}` },
    });
    expect(ordinary.status).toBe(403);
  });

  it('allows operator session only for allowlisted user', async () => {
    const res = await fetch(`${baseUrl}/v1/operator/session`, {
      headers: { Authorization: `Bearer ${tokenOperator}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { operator: boolean; userId: string } };
    expect(body.data.operator).toBe(true);
    expect(body.data.userId).toBe(operatorUserId);
  });

  it('persists featurePersonalization and rejects stale revision overwrite', async () => {
    const client = createApiClient({
      baseUrl,
      token: tokenOrdinary,
    });

    await client.provisionPersonalWorkspace({ displayName: 'Phase66 User' });
    const initial = await client.getUserPreferences();
    const revision = initial.data.revision;

    const updated = await client.updateUserPreferences({
      expectedRevision: revision,
      preferences: {
        featurePersonalization: {
          version: 1,
          hiddenFeatureIds: ['journal', 'bogus-id'],
          pinnedFeatureIds: ['expenses', 'settings'],
        },
      },
    });

    const personalization = updated.data.preferences.featurePersonalization;
    expect(personalization?.hiddenFeatureIds).toEqual(['journal']);
    expect(personalization?.pinnedFeatureIds).toEqual(['expenses']);
    expect(updated.data.preferences.theme).toBeDefined();

    await expect(
      client.updateUserPreferences({
        expectedRevision: revision,
        preferences: {
          featurePersonalization: {
            version: 1,
            hiddenFeatureIds: [],
            pinnedFeatureIds: [],
          },
        },
      })
    ).rejects.toBeInstanceOf(ApiConflictError);
  });

  it('does not grant operator via preference payload', async () => {
    const client = createApiClient({
      baseUrl,
      token: tokenOrdinary,
    });
    const prefs = await client.getUserPreferences();
    await client.updateUserPreferences({
      expectedRevision: prefs.data.revision,
      preferences: {
        featurePersonalization: {
          version: 1,
          hiddenFeatureIds: [],
          pinnedFeatureIds: ['expenses'],
        },
      },
    });
    const denied = await fetch(`${baseUrl}/v1/operator/session`, {
      headers: { Authorization: `Bearer ${tokenOrdinary}` },
    });
    expect(denied.status).toBe(403);
  });
});
