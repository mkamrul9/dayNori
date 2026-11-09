/**
 * Phase 90 — AI provider consent, privacy, and operating decisions readiness test suite.
 * Verifies server kill switch, error classification, bounded inputs/outputs,
 * atomic budget reservations, idempotent settlement, cancellation fencing,
 * journal opt-in, vault exclusion, monetary accounting, and secret isolation.
 *
 * Fake and mock transport only — no live provider calls or real user content transmission.
 */

import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  CURRENT_AI_CONSENT_VERSION,
  CURRENT_AI_PROVIDER_DISCLOSURE_VERSION,
  calculateEstimatedAiCost,
  isAiSourceKindEligible,
  validateAiContentScope,
} from '@daynori/domain';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool, withUserContext } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';
import {
  FakeAiProvider,
  OpenAiCompatibleProvider,
  resolveAiProvider,
  type AiHttpTransport,
} from '../../apps/api/src/modules/ai/provider.js';
import {
  retrieveAuthorizedAnswer,
  setAiProviderOverrideForTests,
  indexPersonalSource,
} from '../../apps/api/src/modules/ai/service.js';

describe('Phase 90: AI provider consent, privacy, and operating decisions', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;
  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase90-test-key';
  const userId = crypto.randomUUID();
  const userB = crypto.randomUUID();
  let client: DaynoriApiClient;
  let clientB: DaynoriApiClient;
  let workspaceId: string;
  let workspaceB: string;

  async function createToken(uid: string): Promise<string> {
    return new SignJWT({
      sub: uid,
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

  async function acceptAi(cli: DaynoriApiClient, journal = false) {
    return cli.acceptAiConsent({
      consentVersion: CURRENT_AI_CONSENT_VERSION,
      providerDisclosureVersion: CURRENT_AI_PROVIDER_DISCLOSURE_VERSION,
      contentScope: { notes: true, tasks: true, journal },
    });
  }

  beforeAll(async () => {
    process.env['NODE_ENV'] = 'test';
    process.env['DAYNORI_AI_LOCAL_ENABLED'] = 'true';
    process.env['DAYNORI_AI_PROVIDER'] = 'fake';
    delete process.env['DAYNORI_AI_LIVE_ENABLED'];
    delete process.env['DAYNORI_AI_KILL_SWITCH'];

    adminPool = createAdminPool();
    runtimePool = createRuntimePool();
    await new Migrator().migrate();

    keyPair = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = kid;
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';
    const jwks: JSONWebKeySet = { keys: [publicJwk] };

    server = buildServer({
      jwtVerifier: new JwtVerifier({ issuer, audience, localJwks: jwks }),
      runtimePool,
      rateLimitOptions: { windowMs: 60000, maxRequests: 50000 },
      enableChatPublicationRecovery: false,
    });
    await server.listen({ port: 0, host: '127.0.0.1' });
    const addr = server.server.address();
    if (!addr || typeof addr === 'string') throw new Error('no address');
    baseUrl = `http://127.0.0.1:${addr.port}`;
    client = createApiClient({ baseUrl, token: await createToken(userId) });
    clientB = createApiClient({ baseUrl, token: await createToken(userB) });

    const setup = await adminPool.connect();
    try {
      await setup.query(
        `INSERT INTO app.profiles (id, display_name) VALUES ($1,'Phase 90 User'), ($2,'Phase 90 User B') ON CONFLICT DO NOTHING`,
        [userId, userB]
      );
      const wsA = await setup.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id)
         VALUES ('Phase 90 personal', 'personal', $1) RETURNING id`,
        [userId]
      );
      workspaceId = wsA.rows[0]!.id;
      await setup.query(
        `INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
         VALUES ($1,$2,'owner') ON CONFLICT DO NOTHING`,
        [workspaceId, userId]
      );

      const wsB = await setup.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id)
         VALUES ('Phase 90 personal B', 'personal', $1) RETURNING id`,
        [userB]
      );
      workspaceB = wsB.rows[0]!.id;
      await setup.query(
        `INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
         VALUES ($1,$2,'owner') ON CONFLICT DO NOTHING`,
        [workspaceB, userB]
      );
    } finally {
      setup.release();
    }
  });

  afterEach(() => {
    delete process.env['DAYNORI_AI_KILL_SWITCH'];
    setAiProviderOverrideForTests(null);
  });

  afterAll(async () => {
    await server.close();
    await runtimePool.end();
    await adminPool.end();
  });

  it('AI-001: server kill switch immediately halts AI routes with HTTP 503', async () => {
    // Normal operation before kill switch
    await acceptAi(client);
    const before = await client.getAiConsentStatus();
    expect(before.data.enabled).toBe(true);

    // Engage server kill switch
    process.env['DAYNORI_AI_KILL_SWITCH'] = 'true';

    // Verify resolveAiProvider returns UnavailableAiProvider
    const provider = resolveAiProvider(process.env);
    expect(provider.mode).toBe('unavailable');

    // Verify routes fail closed with 503 AI_KILL_SWITCH_ACTIVE
    await expect(client.getAiConsentStatus()).rejects.toMatchObject({
      statusCode: 503,
      code: 'AI_KILL_SWITCH_ACTIVE',
    });

    await expect(
      client.acceptAiConsent({
        consentVersion: CURRENT_AI_CONSENT_VERSION,
        providerDisclosureVersion: CURRENT_AI_PROVIDER_DISCLOSURE_VERSION,
      })
    ).rejects.toMatchObject({
      statusCode: 503,
      code: 'AI_KILL_SWITCH_ACTIVE',
    });

    await expect(
      client.retrieveAiAnswer({
        workspaceId,
        query: 'What did I plan?',
      })
    ).rejects.toMatchObject({
      statusCode: 503,
      code: 'AI_KILL_SWITCH_ACTIVE',
    });

    // Clear kill switch and verify normal operation resumes
    delete process.env['DAYNORI_AI_KILL_SWITCH'];
    const after = await client.getAiConsentStatus();
    expect(after.data.enabled).toBe(true);
  });

  it('AI-002: provider error classification maps 429 rate limits, 503 outages, and rejects oversized input/output', async () => {
    // 1. Rate limit 429
    const rateLimitTransport: AiHttpTransport = async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'Rate limit exceeded' } }),
      text: async () => 'Rate limit exceeded',
    });
    const rateLimitProvider = new OpenAiCompatibleProvider(
      'fake-key',
      'https://api.openai.com/v1',
      'gpt-4o-mini',
      rateLimitTransport
    );
    await expect(
      rateLimitProvider.complete({
        system: 'sys',
        user: 'user',
        maxOutputTokens: 100,
      })
    ).rejects.toMatchObject({ code: 'AI_PROVIDER_RATE_LIMIT' });

    // 2. Outage 503
    const outageTransport: AiHttpTransport = async () => ({
      ok: false,
      status: 503,
      json: async () => ({ error: { message: 'Service Unavailable' } }),
      text: async () => 'Service Unavailable',
    });
    const outageProvider = new OpenAiCompatibleProvider(
      'fake-key',
      'https://api.openai.com/v1',
      'gpt-4o-mini',
      outageTransport
    );
    await expect(
      outageProvider.complete({
        system: 'sys',
        user: 'user',
        maxOutputTokens: 100,
      })
    ).rejects.toMatchObject({ code: 'AI_PROVIDER_OUTAGE' });

    // 3. Auth error 401
    const authTransport: AiHttpTransport = async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Invalid API key' } }),
      text: async () => 'Invalid API key',
    });
    const authProvider = new OpenAiCompatibleProvider(
      'fake-key',
      'https://api.openai.com/v1',
      'gpt-4o-mini',
      authTransport
    );
    await expect(
      authProvider.complete({
        system: 'sys',
        user: 'user',
        maxOutputTokens: 100,
      })
    ).rejects.toMatchObject({ code: 'AI_PROVIDER_AUTH_ERROR' });

    // 4. Input too large (>20,000 chars)
    await expect(
      outageProvider.complete({
        system: 'sys',
        user: 'x'.repeat(20_001),
        maxOutputTokens: 100,
      })
    ).rejects.toMatchObject({ code: 'AI_PROVIDER_INPUT_TOO_LARGE' });

    // 5. Output too large (>20,000 chars)
    const giantResponseTransport: AiHttpTransport = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'A'.repeat(20_001) } }],
        usage: { prompt_tokens: 10, completion_tokens: 5000 },
      }),
      text: async () => '',
    });
    const giantResponseProvider = new OpenAiCompatibleProvider(
      'fake-key',
      'https://api.openai.com/v1',
      'gpt-4o-mini',
      giantResponseTransport
    );
    await expect(
      giantResponseProvider.complete({
        system: 'sys',
        user: 'hello',
        maxOutputTokens: 100,
      })
    ).rejects.toMatchObject({ code: 'AI_PROVIDER_MALFORMED' });
  });

  it('AI-003: durable concurrency-safe budget reservation prevents over-allocation', async () => {
    await acceptAi(client);
    const windowStart = new Date().toISOString().slice(0, 7) + '-01';

    // Set budget limit to 2000 tokens for this test
    const setup = await adminPool.connect();
    try {
      await setup.query(
        `INSERT INTO app.ai_budget_windows (user_id, window_start, reserved_tokens, spent_tokens, budget_limit)
         VALUES ($1, $2, 0, 0, 2000)
         ON CONFLICT (user_id, window_start) DO UPDATE SET budget_limit = 2000, reserved_tokens = 0, spent_tokens = 0`,
        [userId, windowStart]
      );
    } finally {
      setup.release();
    }

    // Reservation 1: 1200 tokens -> should succeed
    const res1 = await withUserContext(runtimePool, userId, (c) =>
      c.query<{ ok: boolean; request_id: string }>(
        `SELECT * FROM app.ai_create_reservation($1, 1200, 1, 2000)`,
        [userId]
      )
    );
    expect(res1.rows[0]?.ok).toBe(true);
    expect(res1.rows[0]?.request_id).toBeDefined();

    // Reservation 2: 1000 tokens -> would exceed 2000 total (1200 + 1000 = 2200 > 2000) -> should fail closed
    const res2 = await withUserContext(runtimePool, userId, (c) =>
      c.query<{ ok: boolean; request_id: string }>(
        `SELECT * FROM app.ai_create_reservation($1, 1000, 1, 2000)`,
        [userId]
      )
    );
    expect(res2.rows[0]?.ok).toBe(false);
    expect(res2.rows[0]?.request_id).toBeNull();

    // Verify window state in DB
    const win = await withUserContext(runtimePool, userId, (c) =>
      c.query<{ reserved_tokens: number; spent_tokens: number }>(
        `SELECT reserved_tokens, spent_tokens FROM app.ai_budget_windows WHERE user_id = $1 AND window_start = $2`,
        [userId, windowStart]
      )
    );
    expect(win.rows[0]?.reserved_tokens).toBe(1200);
    expect(win.rows[0]?.spent_tokens).toBe(0);
  });

  it('AI-004: idempotent settlement releases reservation once and never double-counts', async () => {
    const windowStart = new Date().toISOString().slice(0, 7) + '-01';
    let requestId: string;

    const setup = await adminPool.connect();
    try {
      await setup.query(
        `INSERT INTO app.ai_budget_windows (user_id, window_start, reserved_tokens, spent_tokens, budget_limit)
         VALUES ($1, $2, 0, 0, 50000)
         ON CONFLICT (user_id, window_start) DO UPDATE SET budget_limit = 50000, reserved_tokens = 0, spent_tokens = 0`,
        [userId, windowStart]
      );
    } finally {
      setup.release();
    }

    const res = await withUserContext(runtimePool, userId, (c) =>
      c.query<{ request_id: string }>(
        `SELECT request_id FROM app.ai_create_reservation($1, 800, 1, 50000)`,
        [userId]
      )
    );
    requestId = res.rows[0]!.request_id;

    // First settle: actual usage 950 tokens (exceeded estimate)
    const settle1 = await withUserContext(runtimePool, userId, (c) =>
      c.query<{ already_settled: boolean; settled_tokens: number; status: string }>(
        `SELECT * FROM app.ai_settle_request($1, 950, 'settled')`,
        [requestId]
      )
    );
    expect(settle1.rows[0]?.already_settled).toBe(false);
    expect(settle1.rows[0]?.settled_tokens).toBe(950);
    expect(settle1.rows[0]?.status).toBe('settled');

    // Verify window after first settle: reserved decreased by 800 (now 0), spent increased by 950
    const win1 = await withUserContext(runtimePool, userId, (c) =>
      c.query<{ reserved_tokens: number; spent_tokens: number }>(
        `SELECT reserved_tokens, spent_tokens FROM app.ai_budget_windows WHERE user_id = $1 AND window_start = $2`,
        [userId, windowStart]
      )
    );
    expect(win1.rows[0]?.reserved_tokens).toBe(0);
    expect(win1.rows[0]?.spent_tokens).toBe(950);

    // Duplicate settle with same request id: must be idempotent
    const settle2 = await withUserContext(runtimePool, userId, (c) =>
      c.query<{ already_settled: boolean; settled_tokens: number; status: string }>(
        `SELECT * FROM app.ai_settle_request($1, 950, 'settled')`,
        [requestId]
      )
    );
    expect(settle2.rows[0]?.already_settled).toBe(true);
    expect(settle2.rows[0]?.settled_tokens).toBe(950);

    // Window must NOT have incremented again
    const win2 = await withUserContext(runtimePool, userId, (c) =>
      c.query<{ reserved_tokens: number; spent_tokens: number }>(
        `SELECT reserved_tokens, spent_tokens FROM app.ai_budget_windows WHERE user_id = $1 AND window_start = $2`,
        [userId, windowStart]
      )
    );
    expect(win2.rows[0]?.spent_tokens).toBe(950);
  });

  it('AI-005: post-provider result fencing discards output when consent changes mid-request', async () => {
    await acceptAi(client);

    // Create a note and index it
    const note = await client.createNote(workspaceId, {
      title: 'Confidential Study Strategy',
      plainText: 'Detailed revision on biology and physics concepts.',
    });
    await client.indexAiSource({ workspaceId, itemId: note.data.id });

    // Set up a paused provider
    let releaseGate: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    const pausedProvider = new FakeAiProvider();
    pausedProvider.pauseGate = gate;
    setAiProviderOverrideForTests(pausedProvider);

    // Launch retrieve in background
    const retrievePromise = client.retrieveAiAnswer({
      workspaceId,
      query: 'biology physics concepts',
    });

    // Wait a tick, then withdraw consent while request is paused
    await new Promise((r) => setTimeout(r, 50));
    await client.disableAi({ purgeDerived: true });

    // Release paused provider
    releaseGate!();

    // Result must be abstained with consent change explanation; output discarded
    const res = await retrievePromise;
    expect(res.data.abstained).toBe(true);
    expect(res.data.answer).toContain('consent changed');
    expect(res.data.citations).toHaveLength(0);
  });

  it('AI-006: strict journal opt-in and unconditional vault exclusion', async () => {
    // 1. Without journal opt-in (default)
    const scopeDefault = validateAiContentScope({ notes: true, tasks: true, journal: false });
    expect(isAiSourceKindEligible('journal_entry', 'standard', scopeDefault)).toBe(false);
    expect(isAiSourceKindEligible('note', 'standard', scopeDefault)).toBe(true);
    expect(isAiSourceKindEligible('task', 'standard', scopeDefault)).toBe(true);

    // 2. Unconditional vault exclusion: vault is never eligible regardless of consent
    const scopeAll = validateAiContentScope({ notes: true, tasks: true, journal: true });
    expect(isAiSourceKindEligible('note', 'vault', scopeAll)).toBe(false);
    expect(isAiSourceKindEligible('task', 'vault', scopeAll)).toBe(false);
    expect(isAiSourceKindEligible('journal_entry', 'vault', scopeAll)).toBe(false);

    // 3. Rooms and chat messages are not eligible
    expect(isAiSourceKindEligible('room_message', 'standard', scopeAll)).toBe(false);
    expect(isAiSourceKindEligible('room_content', 'standard', scopeAll)).toBe(false);

    // 4. Indexing a vault item fails closed with reason: source_excluded
    await acceptAi(client, true);
    const vaultNote = await client.createNote(workspaceId, {
      title: 'Vault Secret Item',
      plainText: 'High security master credentials',
      securityScope: 'vault',
    });

    const idxResult = await withUserContext(runtimePool, userId, (c) =>
      indexPersonalSource(c, { userId, workspaceId, itemId: vaultNote.data.id })
    );
    expect(idxResult.indexed).toBe(false);
    expect(idxResult.reason).toBe('source_excluded');
  });

  it('AI-007: cancellation via AbortSignal bounds settlement and throws AI_CANCELLED', async () => {
    await acceptAi(client);

    // Create and index a note so that prep.authorized.length > 0 and provider is invoked
    const note = await client.createNote(workspaceId, {
      title: 'Searchable Document for Cancellation Test',
      plainText: 'Cancelled request test target body data.',
    });
    await client.indexAiSource({ workspaceId, itemId: note.data.id });

    let releaseGate: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    const pausedProvider = new FakeAiProvider();
    pausedProvider.pauseGate = gate;
    setAiProviderOverrideForTests(pausedProvider);

    const ac = new AbortController();
    const retrievePromise = retrieveAuthorizedAnswer(runtimePool, {
      userId,
      workspaceId,
      query: 'Cancelled request test target',
      signal: ac.signal,
    });

    // Abort while provider is paused
    await new Promise((r) => setTimeout(r, 40));
    ac.abort();
    releaseGate!();

    await expect(retrievePromise).rejects.toMatchObject({
      code: 'AI_CANCELLED',
      statusCode: 499,
    });
  });

  it('AI-008: precise monetary cost calculations across candidate models', () => {
    // gpt-4o-mini: $0.150 / 1M input (0.15 micro-USD/tok), $0.600 / 1M output (0.60 micro-USD/tok)
    const mini = calculateEstimatedAiCost(2000, 1000, 'gpt-4o-mini');
    // 2000 * 0.15 = 300 micros; 1000 * 0.60 = 600 micros; Total: 900 micros = $0.0009
    expect(mini.inputCostMicros).toBe(300);
    expect(mini.outputCostMicros).toBe(600);
    expect(mini.totalCostMicros).toBe(900);
    expect(mini.totalCostUsd).toBe(0.0009);

    // claude-3-5-haiku: $1.00 / 1M input (1.0 micro-USD/tok), $5.00 / 1M output (5.0 micro-USD/tok)
    const haiku = calculateEstimatedAiCost(2000, 1000, 'claude-3-5-haiku');
    // 2000 * 1.0 = 2000 micros; 1000 * 5.0 = 5000 micros; Total: 7000 micros = $0.007
    expect(haiku.inputCostMicros).toBe(2000);
    expect(haiku.outputCostMicros).toBe(5000);
    expect(haiku.totalCostMicros).toBe(7000);
    expect(haiku.totalCostUsd).toBe(0.007);

    // gemini-1.5-flash: $0.075 / 1M input (0.075 micro-USD/tok), $0.30 / 1M output (0.30 micro-USD/tok)
    const flash = calculateEstimatedAiCost(2000, 1000, 'gemini-1.5-flash');
    // 2000 * 0.075 = 150 micros; 1000 * 0.30 = 300 micros; Total: 450 micros = $0.00045
    expect(flash.inputCostMicros).toBe(150);
    expect(flash.outputCostMicros).toBe(300);
    expect(flash.totalCostMicros).toBe(450);
    expect(flash.totalCostUsd).toBe(0.00045);
  });

  it('AI-009: cross-workspace and cross-tenant access is rejected', async () => {
    await acceptAi(client);
    await acceptAi(clientB);

    // User A cannot retrieve from User B's workspace
    await expect(
      client.retrieveAiAnswer({
        workspaceId: workspaceB,
        query: 'Cross-tenant probe',
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'AI_SCOPE_FORBIDDEN',
    });

    // User B cannot index into User A's workspace
    await expect(
      clientB.indexAiSource({
        workspaceId: workspaceId,
        itemId: crypto.randomUUID(),
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'AI_SCOPE_FORBIDDEN',
    });
  });

  it('AI-010: provider API keys and credentials are never leaked in client status or error responses', async () => {
    process.env['OPENAI_API_KEY'] = 'sk-proj-supersecretkeyneverleak9999';
    try {
      const status = await client.getAiConsentStatus();
      const rawString = JSON.stringify(status);
      expect(rawString).not.toContain('supersecretkey');
      expect(rawString).not.toContain('sk-proj');
      expect(status.data.providerMode).toBeDefined();

      // Ensure error responses also don't leak environment credentials
      try {
        await client.retrieveAiAnswer({
          workspaceId,
          query: 'secret check',
        });
      } catch (err: unknown) {
        const errString = JSON.stringify(err);
        expect(errString).not.toContain('supersecretkey');
      }
    } finally {
      delete process.env['OPENAI_API_KEY'];
    }
  });
});
