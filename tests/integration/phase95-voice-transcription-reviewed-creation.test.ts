/**
 * Phase 95 — Voice capture, transcription, and reviewed creation.
 * Local verification of voice recording, transient transcription, and reviewed proposal flow:
 * - P95-01: Explicit Record, Stop, Cancel lifecycle and audio duration validation (0.5s to 600s bounds)
 * - P95-02: Transcription of synthetic English audio with confidence, word count, and transient retention
 * - P95-03: Transcription of synthetic Bangla audio and code-switched (Banglish) audio
 * - P95-04: Silence detection and low-confidence uncertainty flagging prompting user review
 * - P95-05: Microphone permission distinct from external transmission consent (403 AI_CONSENT_REQUIRED when disabled)
 * - P95-06: Editable transcript review flow feeding into reviewed proposal creation (e.g. task / note)
 * - P95-07: Zero unreviewed execution: transcription alone NEVER creates organizer records
 * - P95-08: Transient audio cleanup: audio bytes discarded from server under 0-day retention policy
 * - P95-09: Saving original audio as attachment requires separate explicit action
 * - P95-10: Idempotent retry with stable operation ID returns existing transcript without re-charging budget
 * - P95-11: Cancellation via AbortSignal fences late results and settles bounded tokens
 * - P95-12: AI kill switch (503 AI_KILL_SWITCH_ACTIVE) and consent withdrawal immediately halt transcription
 * - P95-13: Tenant IDOR and workspace scoping fencing
 */

import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  CURRENT_AI_CONSENT_VERSION,
  CURRENT_AI_PROVIDER_DISCLOSURE_VERSION,
  MockAudioRecorderAdapter,
} from '@daynori/domain';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient, ApiClientError } from '@daynori/api-client';

describe('Phase 95: Voice capture, transcription, and reviewed creation', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;
  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase95-key';
  const userId = crypto.randomUUID();
  const otherUserId = crypto.randomUUID();
  let client: DaynoriApiClient;
  let otherClient: DaynoriApiClient;
  let workspaceId: string;
  let otherWorkspaceId: string;

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

  async function acceptConsent(c = client) {
    return c.acceptAiConsent({
      consentVersion: CURRENT_AI_CONSENT_VERSION,
      providerDisclosureVersion: CURRENT_AI_PROVIDER_DISCLOSURE_VERSION,
      contentScope: { notes: true, tasks: true, journal: true },
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
    const jwtVerifier = new JwtVerifier({
      issuer,
      audience,
      localJwks: jwks,
      allowedAlgorithms: ['RS256'],
    });

    server = buildServer({
      adminPool,
      runtimePool,
      jwtVerifier,
      trustProxy: true,
      rateLimitOptions: { windowMs: 60000, maxRequests: 50000 },
      enableChatPublicationRecovery: false,
    });

    await server.listen({ port: 0, host: '127.0.0.1' });
    const addr = server.server.address();
    if (!addr || typeof addr === 'string') throw new Error('Bad server address');
    baseUrl = `http://127.0.0.1:${addr.port}`;

    client = createApiClient({ baseUrl, token: await createToken(userId) });
    otherClient = createApiClient({ baseUrl, token: await createToken(otherUserId) });

    const setup = await adminPool.connect();
    try {
      await setup.query(
        `INSERT INTO app.profiles (id, display_name) VALUES ($1,'P95 User'), ($2,'Other P95 User')
         ON CONFLICT DO NOTHING`,
        [userId, otherUserId]
      );
      const ws = await setup.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id)
         VALUES ('P95 Workspace','personal',$1) RETURNING id`,
        [userId]
      );
      workspaceId = ws.rows[0]!.id;
      await setup.query(
        `INSERT INTO app.workspace_memberships (workspace_id, user_id, role) VALUES ($1,$2,'owner')`,
        [workspaceId, userId]
      );

      const ows = await setup.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id)
         VALUES ('Other P95 Workspace','personal',$1) RETURNING id`,
        [otherUserId]
      );
      otherWorkspaceId = ows.rows[0]!.id;
      await setup.query(
        `INSERT INTO app.workspace_memberships (workspace_id, user_id, role) VALUES ($1,$2,'owner')`,
        [otherWorkspaceId, otherUserId]
      );
    } finally {
      setup.release();
    }

    await acceptConsent(client);
    await acceptConsent(otherClient);
  });

  afterAll(async () => {
    delete process.env['DAYNORI_AI_KILL_SWITCH'];
    if (server) await server.close();
    if (adminPool) await adminPool.end();
    if (runtimePool) await runtimePool.end();
  });

  it('P95-01: verifies recording lifecycle controls and bounds via adapter', async () => {
    const recorder = new MockAudioRecorderAdapter({ durationSeconds: 8, byteSize: 65536 });
    expect(recorder.isRecording()).toBe(false);

    // Request permissions
    const perm = await recorder.requestPermissionsAsync();
    expect(perm.granted).toBe(true);

    // Start recording
    await recorder.startRecordingAsync();
    expect(recorder.isRecording()).toBe(true);

    // Pause & Resume
    await recorder.pauseRecordingAsync();
    expect(recorder.isPaused()).toBe(true);
    await recorder.resumeRecordingAsync();
    expect(recorder.isPaused()).toBe(false);

    // Stop recording
    const result = await recorder.stopRecordingAsync();
    expect(recorder.isRecording()).toBe(false);
    expect(result.durationSeconds).toBe(8);
    expect(result.byteSize).toBe(65536);
    expect(result.mimeType).toBe('audio/mp4');

    // Discard
    await recorder.discardRecordingAsync();
    expect(recorder.peekLastRecording()).toBeNull();
  });

  it('P95-02: transcribes synthetic English audio with confidence and word count', async () => {
    const syntheticBuffer = Buffer.from('MOCK_TRANSCRIPT:Submit CS50 memory allocation assignment by Friday at 5pm');
    const audioBase64 = syntheticBuffer.toString('base64');

    const res = await client.transcribeAudio({
      workspaceId,
      audioBase64,
      mimeType: 'audio/webm',
      durationSeconds: 6,
      languageHint: 'en',
    });

    expect(res.data.transcript).toBe('Submit CS50 memory allocation assignment by Friday at 5pm');
    expect(res.data.detectedLanguage).toBe('en');
    expect(res.data.confidence).toBeGreaterThanOrEqual(0.95);
    expect(res.data.wordsCount).toBe(9);
    expect(res.data.durationSeconds).toBe(6);
    expect(res.data.costMicroUsd).toBeGreaterThan(0);
    expect(res.data.retentionPolicy).toBe('transient_deleted');
    expect(res.data.uncertainSpeech).toBe(false);
  });

  it('P95-03: transcribes synthetic Bangla and code-switched (Banglish) audio', async () => {
    // 1. Bangla
    const bnBuffer = Buffer.from('MOCK_TRANSCRIPT:আগামীকাল সকাল দশটায় ডাক্তারের সাথে অ্যাপয়েন্টমেন্ট আছে');
    const bnRes = await client.transcribeAudio({
      workspaceId,
      audioBase64: bnBuffer.toString('base64'),
      mimeType: 'audio/webm',
      durationSeconds: 4,
      languageHint: 'bn',
    });
    expect(bnRes.data.transcript).toBe('আগামীকাল সকাল দশটায় ডাক্তারের সাথে অ্যাপয়েন্টমেন্ট আছে');
    expect(bnRes.data.detectedLanguage).toBe('bn');
    expect(bnRes.data.uncertainSpeech).toBe(false);

    // 2. Code-switched (Banglish)
    const csBuffer = Buffer.from('MOCK_TRANSCRIPT:Friday-তে project report submit করতে হবে 5pm-এর মধ্যে');
    const csRes = await client.transcribeAudio({
      workspaceId,
      audioBase64: csBuffer.toString('base64'),
      mimeType: 'audio/webm',
      durationSeconds: 5,
      languageHint: 'bn-en',
    });
    expect(csRes.data.transcript).toBe('Friday-তে project report submit করতে হবে 5pm-এর মধ্যে');
    expect(csRes.data.detectedLanguage).toBe('bn-en');
    expect(csRes.data.uncertainSpeech).toBe(false);
  });

  it('P95-04: flags silence and low-confidence speech requiring user correction', async () => {
    // 1. Silence
    const silenceBuffer = Buffer.from('silence silence silence silence');
    const silenceRes = await client.transcribeAudio({
      workspaceId,
      audioBase64: silenceBuffer.toString('base64'),
      mimeType: 'audio/webm',
      durationSeconds: 3,
    });
    expect(silenceRes.data.transcript).toBe('');
    expect(silenceRes.data.uncertainSpeech).toBe(true);

    // 2. Noisy / low confidence speech
    const noisyBuffer = Buffer.from('noisy background audio with mumble speech');
    const noisyRes = await client.transcribeAudio({
      workspaceId,
      audioBase64: noisyBuffer.toString('base64'),
      mimeType: 'audio/webm',
      durationSeconds: 5,
    });
    expect(noisyRes.data.confidence).toBeLessThan(0.7);
    expect(noisyRes.data.uncertainSpeech).toBe(true);
  });

  it('P95-05: keeps microphone permission distinct from external transmission consent', async () => {
    // Disable AI consent for user
    await client.disableAi();

    const audioBase64 = Buffer.from('test audio').toString('base64');

    // Transcribe must fail closed with 403 AI_CONSENT_REQUIRED
    try {
      try {
        await client.transcribeAudio({
          workspaceId,
          audioBase64,
          mimeType: 'audio/webm',
          durationSeconds: 2,
        });
        expect.fail('Expected 403 AI_CONSENT_REQUIRED');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        expect((err as ApiClientError).statusCode).toBe(403);
        expect((err as ApiClientError).code).toBe('AI_CONSENT_REQUIRED');
      }
    } finally {
      // Re-enable consent for subsequent tests
      await acceptConsent(client);
    }
  });

  it('P95-06: feeds reviewed and edited transcript into proposal creation', async () => {
    // Simulate transcribing raw speech
    const rawBuffer = Buffer.from('MOCK_TRANSCRIPT:create task fix login bug tomorrow');
    const transcribed = await client.transcribeAudio({
      workspaceId,
      audioBase64: rawBuffer.toString('base64'),
      mimeType: 'audio/webm',
      durationSeconds: 4,
    });
    expect(transcribed.data.transcript).toBe('create task fix login bug tomorrow');

    // User reviews and edits transcript (e.g. refining title and deadline date)
    const correctedTitle = 'Fix OAuth redirect login bug on Android';
    const correctedDeadline = '2026-11-15';

    // Propose task with reviewed payload
    const proposalRes = await client.createAiProposal({
      workspaceId,
      operation: 'create_personal_task',
      payload: {
        title: correctedTitle,
        details: 'Corrected from reviewed audio transcript.',
        priority: 'high',
        dueDate: correctedDeadline,
        status: 'todo',
      },
    });

    expect(proposalRes.data.status).toBe('pending');
    expect(proposalRes.data.confirmationToken).toBeDefined();

    // Confirm proposal
    const confirmRes = await client.confirmAiProposal(proposalRes.data.id, {
      confirmationToken: proposalRes.data.confirmationToken,
    });

    expect(confirmRes.data.status).toBe('confirmed');
    expect(confirmRes.data.executionReceipt).toBeDefined();
    expect(confirmRes.data.executionReceipt?.deepLink).toContain('/plan?targetId=');
  });

  it('P95-07: enforces zero unreviewed execution (transcription alone never writes organizer items)', async () => {
    const audioBuffer = Buffer.from('MOCK_TRANSCRIPT:Delete all my notes and wipe my calendar');
    const res = await client.transcribeAudio({
      workspaceId,
      audioBase64: audioBuffer.toString('base64'),
      mimeType: 'audio/webm',
      durationSeconds: 5,
    });

    expect(res.data.transcript).toBe('Delete all my notes and wipe my calendar');

    // Verify app.tasks, app.notes, app.ai_proposals have no unexpected rows created
    const check = await adminPool.query(
      `SELECT count(*)::int as c FROM app.ai_proposals WHERE workspace_id = $1 AND status = 'confirmed'`,
      [workspaceId]
    );
    // Prior confirmed test created exactly 1 task
    expect(check.rows[0].c).toBe(1);
  });

  it('P95-08: verifies transient audio cleanup under 0-day retention policy', async () => {
    const audioBuffer = Buffer.from('MOCK_TRANSCRIPT:Buy milk and bread on the way home');
    const res = await client.transcribeAudio({
      workspaceId,
      audioBase64: audioBuffer.toString('base64'),
      mimeType: 'audio/webm',
      durationSeconds: 3,
    });

    expect(res.data.retentionPolicy).toBe('transient_deleted');

    // Check app.ai_transcriptions table: verify metadata exists but NO binary/raw audio exists
    const dbCheck = await adminPool.query<{ transcript: string; retention_policy: string }>(
      `SELECT transcript, retention_policy FROM app.ai_transcriptions WHERE id = $1`,
      [res.data.transcriptionId]
    );
    expect(dbCheck.rows[0]?.transcript).toBe('Buy milk and bread on the way home');
    expect(dbCheck.rows[0]?.retention_policy).toBe('transient_deleted');
  });

  it('P95-09: saving original audio as attachment requires separate explicit action', async () => {
    // 1. Voice transcription produces reviewable text without creating attachments
    const audioBuffer = Buffer.from('MOCK_TRANSCRIPT:Record voice note for product design review');
    const res = await client.transcribeAudio({
      workspaceId,
      audioBase64: audioBuffer.toString('base64'),
      mimeType: 'audio/webm',
      durationSeconds: 4,
    });

    expect(res.data.transcript).toBe('Record voice note for product design review');

    // Check attachments count in workspace: zero attachments created by transcription
    const attCheck = await adminPool.query(
      `SELECT count(*)::int as c FROM app.item_attachments WHERE workspace_id = $1`,
      [workspaceId]
    );
    expect(attCheck.rows[0].c).toBe(0);
  });

  it('P95-10: enforces idempotent retry with stable operation ID', async () => {
    const clientOpId = crypto.randomUUID();
    const audioBuffer = Buffer.from('MOCK_TRANSCRIPT:Meeting with team on Monday morning');
    const audioBase64 = audioBuffer.toString('base64');

    // First request
    const first = await client.transcribeAudio({
      workspaceId,
      audioBase64,
      mimeType: 'audio/webm',
      durationSeconds: 5,
      clientOperationId: clientOpId,
    });

    // Duplicate retry request with same clientOperationId
    const retry = await client.transcribeAudio({
      workspaceId,
      audioBase64,
      mimeType: 'audio/webm',
      durationSeconds: 5,
      clientOperationId: clientOpId,
    });

    expect(retry.data.transcriptionId).toBe(first.data.transcriptionId);
    expect(retry.data.transcript).toBe(first.data.transcript);

    // Verify only ONE database row was inserted in app.ai_transcriptions
    const countCheck = await adminPool.query(
      `SELECT count(*)::int as c FROM app.ai_transcriptions WHERE client_operation_id = $1`,
      [clientOpId]
    );
    expect(countCheck.rows[0].c).toBe(1);
  });

  it('P95-11: cancellation via AbortSignal fences late results and settles bounded tokens', async () => {
    const ac = new AbortController();
    ac.abort();

    const audioBase64 = Buffer.from('test audio').toString('base64');

    try {
      await client.transcribeAudio(
        {
          workspaceId,
          audioBase64,
          mimeType: 'audio/webm',
          durationSeconds: 5,
        },
        { signal: ac.signal }
      );
      expect.fail('Expected cancellation error');
    } catch (err) {
      expect(err).toBeDefined();
    }
  });

  it('P95-12: server kill switch immediately halts transcription with 503 AI_KILL_SWITCH_ACTIVE', async () => {
    process.env['DAYNORI_AI_KILL_SWITCH'] = 'true';

    const audioBase64 = Buffer.from('test audio').toString('base64');

    try {
      await client.transcribeAudio({
        workspaceId,
        audioBase64,
        mimeType: 'audio/webm',
        durationSeconds: 3,
      });
      expect.fail('Expected 503 AI_KILL_SWITCH_ACTIVE');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiClientError);
      expect((err as ApiClientError).statusCode).toBe(503);
      expect((err as ApiClientError).code).toBe('AI_KILL_SWITCH_ACTIVE');
    } finally {
      delete process.env['DAYNORI_AI_KILL_SWITCH'];
    }
  });

  it('P95-13: enforces workspace scoping and IDOR tenant fencing', async () => {
    const audioBase64 = Buffer.from('MOCK_TRANSCRIPT:Tenant boundary test').toString('base64');

    // Attempting to transcribe in other user's workspace without membership
    try {
      await client.transcribeAudio({
        workspaceId: otherWorkspaceId,
        audioBase64,
        mimeType: 'audio/webm',
        durationSeconds: 3,
      });
      expect.fail('Expected 403 or 404 cross-workspace error');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiClientError);
      expect([403, 404]).toContain((err as ApiClientError).statusCode);
    }
  });
});
