import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient } from '@daynori/api-client';
import { BetaAccessService } from '../../apps/api/src/modules/beta/betaAccessService.js';
import { validateBetaEnvironment } from '../../infra/deployment/beta/validate-beta-env.mjs';

describe('Phase 38: Controlled Private Beta Backend Enforcement & Scoping', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;
  let betaService: BetaAccessService;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.internal';
  const audience = 'daynori-api';
  const kid = 'beta-prep-test-key';

  const userEnrolledId = crypto.randomUUID();
  const userUninvitedId = crypto.randomUUID();
  const userNewCandidateId = crypto.randomUUID();

  let tokenEnrolled: string;
  let tokenUninvited: string;
  let tokenNewCandidate: string;

  async function createToken(userId: string, email: string): Promise<string> {
    return new SignJWT({
      sub: userId,
      email,
      aud: audience,
      iss: issuer,
      role: 'authenticated',
      aal: 'aal1',
      session_id: crypto.randomUUID(),
    })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(keyPair.privateKey);
  }

  beforeAll(async () => {
    process.env['BETA_ACCESS_MODE'] = 'private_invitation_only';
    process.env['BETA_MAX_SEATS'] = '5';

    adminPool = createAdminPool();
    runtimePool = createRuntimePool();

    migrator = new Migrator();
    await migrator.migrate();

    betaService = new BetaAccessService(runtimePool);

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
      allowedAlgorithms: ['RS256'],
    });

    server = buildServer({
      runtimePool,
      jwtVerifier: verifier,
      allowUnauthenticatedStartup: false,
    });

    baseUrl = await server.listen({ port: 0, host: '127.0.0.1' });

    tokenEnrolled = await createToken(userEnrolledId, 'enrolled@example.test');
    tokenUninvited = await createToken(userUninvitedId, 'uninvited@example.test');
    tokenNewCandidate = await createToken(userNewCandidateId, 'candidate@example.test');

    const admin = await adminPool.connect();
    try {
      // Clear previous test run state
      await admin.query('DELETE FROM app.beta_enrollments; DELETE FROM app.beta_invitations;');

      // Seed user profiles
      await admin.query(
        `INSERT INTO app.profiles (id, display_name)
         VALUES
           ($1, 'Enrolled User'),
           ($2, 'Uninvited User'),
           ($3, 'New Candidate User')
         ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;`,
        [userEnrolledId, userUninvitedId, userNewCandidateId]
      );

      // Pre-enroll userEnrolledId
      await admin.query(
        `INSERT INTO app.beta_enrollments (user_id, status)
         VALUES ($1, 'enrolled')
         ON CONFLICT (user_id) DO UPDATE SET status = 'enrolled';`,
        [userEnrolledId]
      );
    } finally {
      admin.release();
    }
  });

  afterAll(async () => {
    delete process.env['BETA_ACCESS_MODE'];
    delete process.env['BETA_MAX_SEATS'];
    if (server) await server.close();
    if (adminPool) await adminPool.end();
    if (runtimePool) await runtimePool.end();
  }, 30000);

  describe('1. Private Beta Invitation Boundary Enforcement', () => {
    it('rejects uninvited authenticated users from accessing organizer endpoints', async () => {
      const client = createApiClient({ baseUrl, token: () => tokenUninvited });

      await expect(client.provisionPersonalWorkspace()).rejects.toThrow(
        /Private beta access requires an active invitation enrollment/
      );
    });

    it('permits enrolled users to provision workspaces and perform organizer operations', async () => {
      const client = createApiClient({ baseUrl, token: () => tokenEnrolled });

      const prov = await client.provisionPersonalWorkspace();
      expect(prov.data.workspace.id).toBeDefined();

      const note = await client.createNote(prov.data.workspace.id, {
        title: 'Beta Note',
        document: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello Beta' }] }],
        },
      });
      expect(note.data.id).toBeDefined();
    });

    it('keeps unauthenticated public health and deletion routes accessible', async () => {
      const healthRes = await fetch(`${baseUrl}/health`);
      expect(healthRes.status).toBe(200);

      const deletionRes = await fetch(`${baseUrl}/v1/public/account-deletion-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'public.visitor@example.test' }),
      });
      expect(deletionRes.status).toBe(200);
    });

    it('strictly rejects direct calls to unreleased feature modules with 403 Forbidden', async () => {
      // Direct call to expenses, vault, rooms, ai, billing must be blocked with 403
      const endpoints = [
        '/v1/expenses/records',
        '/v1/vault/items',
        '/v1/rooms/list',
        '/v1/ai/completions',
        '/v1/billing/subscriptions',
      ];

      for (const endpoint of endpoints) {
        const res = await fetch(`${baseUrl}${endpoint}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${tokenEnrolled}`,
          },
        });
        expect(res.status).toBe(403);
      }
    });
  });

  describe('2. Invitation Claiming & Seat Limit Lifecycles', () => {
    let validCode: string;
    let expiredCode: string;
    let revokedCode: string;

    beforeAll(async () => {
      const admin = await adminPool.connect();
      try {
        validCode = `BETA-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
        expiredCode = `EXP-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
        revokedCode = `REV-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

        await betaService.createInvitation(admin, validCode, { expiresInHours: 48 });
        await betaService.createInvitation(admin, expiredCode, { expiresInHours: -1 });
        const rev = await betaService.createInvitation(admin, revokedCode, { expiresInHours: 48 });
        await admin.query(`UPDATE app.beta_invitations SET status = 'revoked' WHERE id = $1;`, [
          rev.id,
        ]);
      } finally {
        admin.release();
      }
    });

    it('rejects claiming with an invalid or unknown invitation code', async () => {
      const res = await fetch(`${baseUrl}/v1/beta/claim-invitation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenNewCandidate}`,
        },
        body: JSON.stringify({ invitationCode: 'NON_EXISTENT_CODE' }),
      });
      expect(res.status).toBe(403);
    });

    it('rejects claiming an expired invitation code', async () => {
      const res = await fetch(`${baseUrl}/v1/beta/claim-invitation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenNewCandidate}`,
        },
        body: JSON.stringify({ invitationCode: expiredCode }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error?.message || data.message).toContain('expired');
    });

    it('rejects claiming a revoked invitation code', async () => {
      const res = await fetch(`${baseUrl}/v1/beta/claim-invitation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenNewCandidate}`,
        },
        body: JSON.stringify({ invitationCode: revokedCode }),
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error?.message || data.message).toContain('revoked');
    });

    it('successfully claims a valid invitation code and enables organizer access', async () => {
      const client = createApiClient({ baseUrl, token: () => tokenNewCandidate });

      // Before claim: blocked
      await expect(client.provisionPersonalWorkspace()).rejects.toThrow();

      // Claim invitation
      const claimRes = await fetch(`${baseUrl}/v1/beta/claim-invitation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenNewCandidate}`,
        },
        body: JSON.stringify({ invitationCode: validCode }),
      });
      expect(claimRes.status).toBe(200);
      const claimData = await claimRes.json();
      expect(claimData.enrolled).toBe(true);

      // After claim: access granted!
      const prov = await client.provisionPersonalWorkspace();
      expect(prov.data.workspace.id).toBeDefined();
    });

    it('rejects reusing an already claimed invitation code', async () => {
      const anotherUserId = crypto.randomUUID();
      const anotherToken = await createToken(anotherUserId, 'another@example.test');

      const admin = await adminPool.connect();
      try {
        await admin.query(
          `INSERT INTO app.profiles (id, display_name) VALUES ($1, 'Another User') ON CONFLICT DO NOTHING;`,
          [anotherUserId]
        );
      } finally {
        admin.release();
      }

      const res = await fetch(`${baseUrl}/v1/beta/claim-invitation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anotherToken}`,
        },
        body: JSON.stringify({ invitationCode: validCode }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error?.message || data.message).toContain('already been claimed');
    });

    it('strictly enforces seat limits under race conditions', async () => {
      // Set seat limit to current number of enrolled seats (2: userEnrolledId + userNewCandidateId)
      const seatVictimId = crypto.randomUUID();
      const _seatVictimToken = await createToken(seatVictimId, 'victim@example.test');
      const extraCode = `EXTRA-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

      const admin = await adminPool.connect();
      try {
        await admin.query(
          `INSERT INTO app.profiles (id, display_name) VALUES ($1, 'Seat Victim') ON CONFLICT DO NOTHING;`,
          [seatVictimId]
        );
        await betaService.createInvitation(admin, extraCode, { expiresInHours: 24 });
      } finally {
        admin.release();
      }

      // Claiming with maxSeats = 2 (when 2 are already enrolled) must be rejected
      const claimPromise = betaService.claimInvitation(seatVictimId, extraCode, 2);
      await expect(claimPromise).rejects.toThrow(/Beta participant seat limit \(2\) reached/);
    });
  });

  describe('3. Beta Environment Configuration Validation', () => {
    it('rejects missing or invalid BETA_ALLOW_PUBLIC_SIGNUP', () => {
      const res = validateBetaEnvironment({
        BETA_ACCESS_MODE: 'private_invitation_only',
        BETA_INVITATION_SECRET: 'high_entropy_secret_at_least_32_characters_long_123',
        BETA_MAX_SEATS: '50',
        DB_USER: 'daynori_runtime',
        DB_NAME: 'daynori_beta',
        STORAGE_PRIVATE_BUCKET: 'daynori-beta-private-assets',
        STORAGE_QUOTA_BYTES_PER_WORKSPACE: '104857600',
        REDACT_TELEMETRY: 'true',
        REAUTH_SECRET: 'reauth_secret_at_least_32_characters_long_123',
      });
      expect(res.valid).toBe(false);
      expect(res.errors.some((e: string) => e.includes('BETA_ALLOW_PUBLIC_SIGNUP'))).toBe(true);
    });

    it('rejects negative or malformed storage quota', () => {
      const res = validateBetaEnvironment({
        BETA_ACCESS_MODE: 'private_invitation_only',
        BETA_ALLOW_PUBLIC_SIGNUP: 'false',
        BETA_INVITATION_SECRET: 'high_entropy_secret_at_least_32_characters_long_123',
        BETA_MAX_SEATS: '50',
        DB_USER: 'daynori_runtime',
        DB_NAME: 'daynori_beta',
        STORAGE_PRIVATE_BUCKET: 'daynori-beta-private-assets',
        STORAGE_QUOTA_BYTES_PER_WORKSPACE: '-104857600',
        REDACT_TELEMETRY: 'true',
        REAUTH_SECRET: 'reauth_secret_at_least_32_characters_long_123',
      });
      expect(res.valid).toBe(false);
      expect(res.errors.some((e: string) => e.includes('STORAGE_QUOTA_BYTES_PER_WORKSPACE'))).toBe(true);
    });

    it('rejects placeholder database credentials', () => {
      const res = validateBetaEnvironment({
        BETA_ACCESS_MODE: 'private_invitation_only',
        BETA_ALLOW_PUBLIC_SIGNUP: 'false',
        BETA_INVITATION_SECRET: 'high_entropy_secret_at_least_32_characters_long_123',
        BETA_MAX_SEATS: '50',
        DB_USER: 'daynori_runtime',
        DB_NAME: 'daynori_beta',
        DB_PASSWORD: 'replace_with_owner_supplied_beta_db_password',
        STORAGE_PRIVATE_BUCKET: 'daynori-beta-private-assets',
        STORAGE_QUOTA_BYTES_PER_WORKSPACE: '104857600',
        REDACT_TELEMETRY: 'true',
        REAUTH_SECRET: 'reauth_secret_at_least_32_characters_long_123',
      });
      expect(res.valid).toBe(false);
      expect(res.errors.some((e: string) => e.includes('Placeholder credentials'))).toBe(true);
    });

    it('passes validation when all required invariants and secrets are properly configured', () => {
      const res = validateBetaEnvironment({
        BETA_ACCESS_MODE: 'private_invitation_only',
        BETA_ALLOW_PUBLIC_SIGNUP: 'false',
        BETA_INVITATION_SECRET: 'high_entropy_secret_at_least_32_characters_long_123',
        BETA_MAX_SEATS: '50',
        DB_USER: 'daynori_runtime',
        DB_NAME: 'daynori_beta',
        DB_PASSWORD: 'secure_runtime_password_xyz_789',
        STORAGE_PRIVATE_BUCKET: 'daynori-beta-private-assets',
        STORAGE_QUOTA_BYTES_PER_WORKSPACE: '104857600',
        REDACT_TELEMETRY: 'true',
        REAUTH_SECRET: 'reauth_secret_at_least_32_characters_long_123',
      });
      expect(res.valid).toBe(true);
      expect(res.errors.length).toBe(0);
    });
  });
});
