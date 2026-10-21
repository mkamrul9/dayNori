/**
 * Phase 60 — Production-mode release boundary verification.
 *
 * Distinct from phase59-launch-gates (development NODE_ENV API probes).
 * This suite asserts production fail-closed behavior for optional modules,
 * enumeration-safe public deletion, and core organizer usability.
 */
import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  isAiLocallyEnabled,
  isBillingLocallyEnabled,
  isBillingProductionActivationEnabled,
  isRoomsLocallyEnabled,
} from '@daynori/domain';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient } from '@daynori/api-client';

describe('Phase 60: production-mode release boundaries', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;
  let token = '';
  let workspaceId = '';
  let knownEmail = '';
  const prevNodeEnv = process.env['NODE_ENV'];

  beforeAll(async () => {
    process.env['NODE_ENV'] = 'production';
    // Ordinary development flags must not activate optional modules in production.
    process.env['DAYNORI_ROOMS_LOCAL_ENABLED'] = 'true';
    process.env['DAYNORI_AI_LOCAL_ENABLED'] = 'true';
    process.env['DAYNORI_AI_LIVE_ENABLED'] = 'true';
    process.env['DAYNORI_BILLING_LOCAL_ENABLED'] = 'true';
    process.env['DAYNORI_BILLING_PRODUCTION_ENABLED'] = 'true';
    delete process.env['ENABLE_EXPENSES'];

    expect(isRoomsLocallyEnabled(process.env)).toBe(false);
    expect(isAiLocallyEnabled(process.env)).toBe(false);
    expect(isBillingLocallyEnabled(process.env)).toBe(false);
    expect(isBillingProductionActivationEnabled(process.env)).toBe(false);

    adminPool = createAdminPool();
    runtimePool = createRuntimePool();
    await new Migrator().migrate();

    const keyPair = await generateKeyPair('RS256');
    const kid = 'phase60-key';
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
    knownEmail = `synthetic-known-${userId.slice(0, 8)}@example.test`;
    await adminPool.query(
      `INSERT INTO app.profiles (id, display_name) VALUES ($1,'P60')`,
      [userId]
    );
    // Best-effort email column if present (enumeration tests still compare response shape).
    try {
      await adminPool.query(`UPDATE app.profiles SET email = $1 WHERE id = $2`, [
        knownEmail,
        userId,
      ]);
    } catch {
      /* schema may not expose email on profiles */
    }

    token = await new SignJWT({
      sub: userId,
      aud: audience,
      iss: issuer,
      role: 'authenticated',
      aal: 'aal1',
      session_id: crypto.randomUUID(),
      email: knownEmail,
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
    if (prevNodeEnv === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = prevNodeEnv;
    delete process.env['DAYNORI_ROOMS_LOCAL_ENABLED'];
    delete process.env['DAYNORI_AI_LOCAL_ENABLED'];
    delete process.env['DAYNORI_AI_LIVE_ENABLED'];
    delete process.env['DAYNORI_BILLING_LOCAL_ENABLED'];
    delete process.env['DAYNORI_BILLING_PRODUCTION_ENABLED'];
  });

  it('keeps vault/rooms/AI/billing/expenses denied under production despite local flags', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    expect((await fetch(`${baseUrl}/v1/vault/status`, { headers: auth })).status).toBe(403);
    expect((await fetch(`${baseUrl}/v1/rooms`, { headers: auth })).status).toBe(403);
    expect((await fetch(`${baseUrl}/v1/ai/consent`, { headers: auth })).status).toBe(403);
    expect((await fetch(`${baseUrl}/v1/billing/catalog`, { headers: auth })).status).toBe(403);
    expect((await fetch(`${baseUrl}/v1/expenses`, { headers: auth })).status).toBe(403);
  });

  it('keeps core organizer usable in production with optional modules gated', async () => {
    const client = createApiClient({ baseUrl, token });
    const note = await client.createNote(workspaceId, {
      title: 'phase60-core',
      plainText: 'production-gated core path',
    });
    expect(note.data.id).toBeTruthy();
    const listed = await client.listNotes(workspaceId);
    expect(listed.data.some((n) => n.id === note.data.id)).toBe(true);
  });

  it('returns enumeration-safe acknowledgments for unknown and known synthetic emails', async () => {
    const unknown = await fetch(`${baseUrl}/v1/public/account-deletion-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'synthetic-unknown-phase60@example.test' }),
    });
    const known = await fetch(`${baseUrl}/v1/public/account-deletion-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: knownEmail }),
    });
    expect([200, 202]).toContain(unknown.status);
    expect([200, 202]).toContain(known.status);
    const unknownBody = (await unknown.json()) as { message?: string; success?: boolean };
    const knownBody = (await known.json()) as { message?: string; success?: boolean };
    expect(unknownBody.message).toBe(knownBody.message);
    expect(unknownBody.success).toBe(knownBody.success);
    // Destructive action requires verify endpoint — request alone must not delete.
    expect(String(unknownBody.message || '')).toMatch(/confirmation|instructions|associated/i);
  });

  it('requires verification token before public deletion completes', async () => {
    const bogus = await fetch(`${baseUrl}/v1/public/account-deletion-request/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: crypto.randomUUID(),
        verificationToken: 'not-a-real-token',
      }),
    });
    expect(bogus.status).toBeGreaterThanOrEqual(400);
  });
});

describe('Phase 60: domain gates ignore development harness flags in production', () => {
  it('documents worker/deep-link flag expectations', () => {
    expect(
      isRoomsLocallyEnabled({
        NODE_ENV: 'production',
        DAYNORI_ROOMS_LOCAL_ENABLED: 'true',
      })
    ).toBe(false);
    expect(
      isAiLocallyEnabled({
        NODE_ENV: 'production',
        DAYNORI_AI_LOCAL_ENABLED: 'true',
        DAYNORI_AI_LIVE_ENABLED: 'true',
      })
    ).toBe(false);
    expect(
      isBillingProductionActivationEnabled({
        NODE_ENV: 'production',
        DAYNORI_BILLING_LOCAL_ENABLED: 'true',
        DAYNORI_BILLING_PRODUCTION_ENABLED: 'true',
      })
    ).toBe(false);
  });
});
