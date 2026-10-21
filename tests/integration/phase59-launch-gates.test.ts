/**
 * Phase 59 — Local launch preparation: disabled modules stay unreachable;
 * public legal/deletion drafts are served without inventing production URLs.
 */
import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient } from '@daynori/api-client';

describe('Phase 59: launch gates and disabled module denial', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;
  let token = '';
  let workspaceId = '';

  beforeAll(async () => {
    process.env['NODE_ENV'] = 'development';
    delete process.env['DAYNORI_ROOMS_LOCAL_ENABLED'];
    delete process.env['DAYNORI_AI_LOCAL_ENABLED'];
    delete process.env['DAYNORI_BILLING_LOCAL_ENABLED'];
    delete process.env['ENABLE_EXPENSES'];

    adminPool = createAdminPool();
    runtimePool = createRuntimePool();
    await new Migrator().migrate();

    const keyPair = await generateKeyPair('RS256');
    const kid = 'phase59-key';
    const issuer = 'https://auth.daynori.test';
    const audience = 'daynori-api';
    const publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = kid;
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';
    const jwks: JSONWebKeySet = { keys: [publicJwk] };

    server = buildServer({
      jwtVerifier: new JwtVerifier({ issuer, audience, localJwks: jwks }),
      runtimePool,
      rateLimitOptions: { windowMs: 60000, maxRequests: 20000 },
      enableChatPublicationRecovery: false,
    });
    await server.listen({ port: 0, host: '127.0.0.1' });
    const addr = server.server.address();
    if (!addr || typeof addr === 'string') throw new Error('no address');
    baseUrl = `http://127.0.0.1:${addr.port}`;

    const userId = crypto.randomUUID();
    await adminPool.query(`INSERT INTO app.profiles (id, display_name) VALUES ($1,'P59')`, [
      userId,
    ]);
    token = await new SignJWT({
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

    const client = createApiClient({ baseUrl, token });
    workspaceId = (await client.provisionPersonalWorkspace()).data.workspace.id;
  }, 120_000);

  afterAll(async () => {
    if (server) await server.close();
    if (runtimePool) await runtimePool.end();
    if (adminPool) await adminPool.end();
  });

  it('denies vault, rooms, AI, and billing via direct API (not merely hidden UI)', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    expect((await fetch(`${baseUrl}/v1/vault/status`, { headers: auth })).status).toBe(403);
    expect((await fetch(`${baseUrl}/v1/rooms`, { headers: auth })).status).toBe(403);
    expect((await fetch(`${baseUrl}/v1/ai/consent`, { headers: auth })).status).toBe(403);
    expect((await fetch(`${baseUrl}/v1/billing/catalog`, { headers: auth })).status).toBe(403);
    expect((await fetch(`${baseUrl}/v1/expenses`, { headers: auth })).status).toBe(403);
  });

  it('keeps core organizer usable under the same gates', async () => {
    const client = createApiClient({ baseUrl, token });
    const note = await client.createNote(workspaceId, {
      title: 'launch-core',
      plainText: 'enabled personal module',
    });
    expect(note.data.id).toBeTruthy();
  });

  it('serves public account-deletion request without auth (enumeration-safe shape)', async () => {
    const res = await fetch(`${baseUrl}/v1/public/account-deletion-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'synthetic-unknown@example.test' }),
    });
    // Must not reveal whether the email exists; accept 200/202 acknowledgment shapes.
    expect([200, 202]).toContain(res.status);
  });
});
