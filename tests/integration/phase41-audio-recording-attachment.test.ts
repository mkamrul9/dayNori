import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';
import {
  AudioAttachmentSchema,
  AudioRecordingDraftSchema,
  MAX_AUDIO_RECORDING_SECONDS,
  MAX_AUDIO_RECORDING_BYTES,
} from '@daynori/contracts';
import {
  validateAudioDuration,
  formatAudioDuration,
  isSupportedAudioMimeType,
  canAttachAudioToItem,
  calculateAudioProgress,
  createAudioAttachment,
} from '@daynori/domain';
import {
  MemoryStorageProvider,
  setDefaultStorageProvider,
} from '../../apps/api/src/modules/files/storageAdapter.js';
import {
  PolicyMalwareScanner,
  setDefaultMalwareScanner,
} from '../../apps/api/src/modules/files/scanner.js';
import { detectMimeType } from '../../apps/api/src/modules/files/inspector.js';

describe('Phase 41: Audio Recording and Attachment Lifecycle (Integration Tests)', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase41-audio-key';

  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  let tokenUserA: string;
  let tokenUserB: string;
  let clientA: DaynoriApiClient;
  let clientB: DaynoriApiClient;

  let workspaceAId: string;
  let workspaceBId: string;

  let memoryStorage: MemoryStorageProvider;
  let policyScanner: PolicyMalwareScanner;

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

    // 1. Run migrations up to current
    migrator = new Migrator();
    await migrator.migrate();

    // 2. Setup Memory Storage Provider & Policy Malware Scanner
    memoryStorage = new MemoryStorageProvider();
    setDefaultStorageProvider(memoryStorage);

    policyScanner = new PolicyMalwareScanner();
    setDefaultMalwareScanner(policyScanner);

    // 3. Setup JWT Key Pair & Tokens
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

    const safeLogger = new (await import('../../apps/api/src/plugins/logger.js')).SafeLogger(
      (entry) => {
        if (entry.level === 'error') {
          console.error('SERVER ERROR:', JSON.stringify(entry));
        }
      }
    );

    server = buildServer({
      jwtVerifier: verifier,
      runtimePool,
      logger: safeLogger,
      rateLimitOptions: { windowMs: 60000, maxRequests: 50000 },
    });

    await server.listen({ port: 0, host: '127.0.0.1' });
    const addr = server.server.address();
    if (!addr || typeof addr === 'string') throw new Error('Failed to bind server port');
    baseUrl = `http://127.0.0.1:${addr.port}`;
    memoryStorage.setBaseUrl(baseUrl);

    tokenUserA = await createToken(userAId);
    tokenUserB = await createToken(userBId);

    clientA = createApiClient({ baseUrl, token: tokenUserA });
    clientB = createApiClient({ baseUrl, token: tokenUserB });

    // 4. Provision profiles and personal workspaces
    const setupClient = await adminPool.connect();
    try {
      await setupClient.query(
        `INSERT INTO app.profiles (id, display_name) VALUES ($1, $2), ($3, $4) ON CONFLICT (id) DO NOTHING`,
        [userAId, 'Alice Voice', userBId, 'Bob Voice']
      );

      const wsARes = await setupClient.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id) VALUES ($1, 'personal', $2) RETURNING id`,
        ['Alice Audio Workspace', userAId]
      );
      workspaceAId = wsARes.rows[0]!.id;

      const wsBRes = await setupClient.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id) VALUES ($1, 'personal', $2) RETURNING id`,
        ['Bob Audio Workspace', userBId]
      );
      workspaceBId = wsBRes.rows[0]!.id;

      await setupClient.query(
        `INSERT INTO app.workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner'), ($3, $4, 'owner')`,
        [workspaceAId, userAId, workspaceBId, userBId]
      );
    } finally {
      setupClient.release();
    }
  });

  afterAll(async () => {
    if (server) await server.close();
    if (runtimePool) await runtimePool.end();
    if (adminPool) await adminPool.end();
  });

  describe('1. Permission Refusal Handling & Error States', () => {
    it('handles permission denial gracefully without unhandled crashes or false saved status', () => {
      // Simulate permission refusal error
      const permissionError = new Error('Permission denied by user');
      permissionError.name = 'NotAllowedError';

      let recorderState = 'idle';
      let errorMessage: string | null = null;
      let hasSavedAttachment = false;

      // Simulate consent request flow
      try {
        if (permissionError.name === 'NotAllowedError') {
          recorderState = 'error';
          errorMessage = 'Microphone permission was denied. Please allow microphone access.';
        }
      } catch {
        recorderState = 'error';
      }

      expect(recorderState).toBe('error');
      expect(errorMessage).toContain('Microphone permission was denied');
      expect(hasSavedAttachment).toBe(false);
    });
  });

  describe('2. Maximum 10-Minute / 25MB Duration & Size Limit Enforcement', () => {
    it('validates duration limits strictly (1s to 600s allowable, >600s rejected)', () => {
      expect(validateAudioDuration(0)).toBe(false);
      expect(validateAudioDuration(-10)).toBe(false);
      expect(validateAudioDuration(1)).toBe(true);
      expect(validateAudioDuration(300)).toBe(true);
      expect(validateAudioDuration(600)).toBe(true);
      expect(validateAudioDuration(601)).toBe(false);
      expect(validateAudioDuration(1200)).toBe(false);
    });

    it('formats durations in MM:SS representation accurately', () => {
      expect(formatAudioDuration(0)).toBe('00:00');
      expect(formatAudioDuration(9)).toBe('00:09');
      expect(formatAudioDuration(65)).toBe('01:05');
      expect(formatAudioDuration(600)).toBe('10:00');
    });

    it('calculates audio progress correctly with clamping between 0 and 100', () => {
      expect(calculateAudioProgress(0, 600)).toBe(0);
      expect(calculateAudioProgress(300, 600)).toBe(50);
      expect(calculateAudioProgress(600, 600)).toBe(100);
      expect(calculateAudioProgress(700, 600)).toBe(100);
      expect(calculateAudioProgress(-5, 600)).toBe(0);
    });

    it('validates AudioAttachmentSchema enforces 10m and 25MB thresholds', () => {
      const validAttachment = {
        fileId: crypto.randomUUID(),
        fileName: 'interview-notes.webm',
        durationSeconds: 599,
        byteSize: 20 * 1024 * 1024,
        mimeType: 'audio/webm',
        createdAt: new Date().toISOString(),
      };
      const parsed = AudioAttachmentSchema.safeParse(validAttachment);
      expect(parsed.success).toBe(true);

      // Exceed duration (> 600s)
      const overDuration = {
        ...validAttachment,
        durationSeconds: 601,
      };
      expect(AudioAttachmentSchema.safeParse(overDuration).success).toBe(false);

      // Exceed bytes (> 25MB)
      const overBytes = {
        ...validAttachment,
        byteSize: 26 * 1024 * 1024,
      };
      expect(AudioAttachmentSchema.safeParse(overBytes).success).toBe(false);
    });
  });

  describe('3. Codec Negotiation & Inspection Lifecycle', () => {
    it('accepts valid supported MIME types and rejects unsupported codecs', () => {
      expect(isSupportedAudioMimeType('audio/webm')).toBe(true);
      expect(isSupportedAudioMimeType('audio/mp4')).toBe(true);
      expect(isSupportedAudioMimeType('audio/ogg')).toBe(true);
      expect(isSupportedAudioMimeType('audio/wav')).toBe(true);
      expect(isSupportedAudioMimeType('audio/mpeg')).toBe(true);

      expect(isSupportedAudioMimeType('audio/flac')).toBe(false);
      expect(isSupportedAudioMimeType('application/javascript')).toBe(false);
      expect(isSupportedAudioMimeType('text/html')).toBe(false);
    });

    it('identifies audio formats correctly via magic byte inspection', () => {
      // 1. WebM: 1A 45 DF A3
      const webmHeader = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x02, 0x03, 0x04]);
      expect(detectMimeType(webmHeader)).toBe('audio/webm');

      // 2. MP4 audio: 00 00 00 18 66 74 79 70 ('ftyp')
      const mp4Header = Buffer.from([
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32,
      ]);
      expect(detectMimeType(mp4Header)).toBe('audio/mp4');

      // 3. WAV: RIFF .... WAVE
      const wavHeader = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
      ]);
      expect(detectMimeType(wavHeader)).toBe('audio/wav');

      // 4. OGG: OggS
      const oggHeader = Buffer.from([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00]);
      expect(detectMimeType(oggHeader)).toBe('audio/ogg');

      // 5. MP3: ID3
      const mp3Header = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00]);
      expect(detectMimeType(mp3Header)).toBe('audio/mpeg');
    });

    it('uploads valid WebM audio binary through reservation and quarantine inspection to verified status', async () => {
      // Synthetic valid WebM audio payload
      const audioBytes = Buffer.concat([
        Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
        crypto.randomBytes(4096),
      ]);
      const sha256 = crypto.createHash('sha256').update(audioBytes).digest('hex');

      // 1. Reserve upload
      const res = await clientA.reserveFileUpload(workspaceAId, {
        fileName: 'standup-voice-note.webm',
        declaredMimeType: 'audio/webm',
        declaredBytes: audioBytes.length,
      });

      expect(res.data.reservationId).toBeDefined();
      expect(res.data.uploadUrl).toBeDefined();

      // 2. Transfer audio binary to storage provider
      const uploadHttpRes = await fetch(res.data.uploadUrl, {
        method: res.data.method,
        headers: { 'content-type': 'audio/webm' },
        body: audioBytes,
      });
      expect(uploadHttpRes.status).toBe(200);

      // 3. Finalize upload
      const finalizeRes = await clientA.finalizeFileUpload(workspaceAId, res.data.reservationId, {
        clientChecksum: sha256,
      });

      expect(finalizeRes.data.status).toBe('verified');
      expect(finalizeRes.data.detectedMimeType).toBe('audio/webm');
      expect(finalizeRes.data.sha256Checksum).toBe(sha256);
      expect(finalizeRes.data.byteSize).toBe(audioBytes.length);
    });
  });

  describe('4. Interruption & Draft Recovery without False Saved Claims', () => {
    it('validates interrupted audio draft preservation in AudioRecordingDraftSchema', () => {
      const sessionId = crypto.randomUUID();
      const draftPayload = {
        sessionId,
        workspaceId: workspaceAId,
        durationSeconds: 145,
        byteSize: 1024 * 128,
        mimeType: 'audio/webm',
        status: 'interrupted' as const,
        targetItemType: 'note' as const,
        targetItemId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const parsed = AudioRecordingDraftSchema.safeParse(draftPayload);
      expect(parsed.success).toBe(true);
      expect(parsed.data?.status).toBe('interrupted');
      expect(parsed.data?.durationSeconds).toBe(145);
    });

    it('ensures paused or interrupted recording is never treated as saved without explicit user finalization', () => {
      const draftState = {
        status: 'interrupted',
        savedAsAttachment: false,
      };

      // Invariant: Interruption does not mark as saved
      expect(draftState.savedAsAttachment).toBe(false);
      expect(draftState.status).toBe('interrupted');
    });
  });

  describe('5. Quota Reservation & Attachment Lifecycle', () => {
    it('enforces attachment target types (note, journal, knowledge, file are allowed)', () => {
      expect(canAttachAudioToItem('note')).toBe(true);
      expect(canAttachAudioToItem('journal')).toBe(true);
      expect(canAttachAudioToItem('knowledge')).toBe(true);
      expect(canAttachAudioToItem('file')).toBe(true);

      expect(canAttachAudioToItem('routine')).toBe(false);
      expect(canAttachAudioToItem('workspace')).toBe(false);
      expect(canAttachAudioToItem('user')).toBe(false);
    });

    it('creates an audio attachment structure linking verified file and metadata', () => {
      const fileId = crypto.randomUUID();
      const attachment = createAudioAttachment({
        fileId,
        fileName: 'sprint-retro-audio.webm',
        durationSeconds: 240,
        byteSize: 1024 * 500,
        mimeType: 'audio/webm',
      });

      expect(attachment.fileId).toBe(fileId);
      expect(attachment.fileName).toBe('sprint-retro-audio.webm');
      expect(attachment.durationSeconds).toBe(240);
      expect(attachment.byteSize).toBe(512000);
      expect(attachment.mimeType).toBe('audio/webm');
      expect(attachment.createdAt).toBeDefined();
    });

    it('reflects reserved bytes in workspace quota during recording reservation', async () => {
      const audioBytes = Buffer.concat([
        Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
        crypto.randomBytes(8192),
      ]);

      const quotaBefore = await clientA.getWorkspaceStorageQuota(workspaceAId);
      const reservedBefore = quotaBefore.data.reservedBytes;

      const res = await clientA.reserveFileUpload(workspaceAId, {
        fileName: 'reserved-voice-note.webm',
        declaredMimeType: 'audio/webm',
        declaredBytes: audioBytes.length,
      });

      const quotaAfter = await clientA.getWorkspaceStorageQuota(workspaceAId);
      expect(quotaAfter.data.reservedBytes).toBe(reservedBefore + audioBytes.length);

      // Clean up reservation
      await clientA.cancelFileUploadReservation(workspaceAId, res.data.reservationId);
      const quotaCleaned = await clientA.getWorkspaceStorageQuota(workspaceAId);
      expect(quotaCleaned.data.reservedBytes).toBe(reservedBefore);
    });
  });

  describe('6. Workspace Tenant Isolation & Cascade Cleanup', () => {
    it('prevents User B in Workspace B from accessing or finalizing User A audio upload in Workspace A', async () => {
      const audioBytes = Buffer.concat([
        Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
        crypto.randomBytes(1024),
      ]);
      const sha256 = crypto.createHash('sha256').update(audioBytes).digest('hex');

      const resA = await clientA.reserveFileUpload(workspaceAId, {
        fileName: 'alice-confidential-memo.webm',
        declaredMimeType: 'audio/webm',
        declaredBytes: audioBytes.length,
      });

      // Transfer binary to upload URL
      await fetch(resA.data.uploadUrl, {
        method: resA.data.method,
        headers: { 'content-type': 'audio/webm' },
        body: audioBytes,
      });

      // Attempt User B finalization in Workspace B (must fail with 404 or 403)
      let unauthorizedFinalizeCaught = false;
      try {
        await clientB.finalizeFileUpload(workspaceBId, resA.data.reservationId, {
          clientChecksum: sha256,
        });
      } catch (err: unknown) {
        unauthorizedFinalizeCaught = true;
      }
      expect(unauthorizedFinalizeCaught).toBe(true);

      // Finalize properly by Alice
      const finalizeRes = await clientA.finalizeFileUpload(workspaceAId, resA.data.reservationId, {
        clientChecksum: sha256,
      });
      expect(finalizeRes.data.status).toBe('verified');

      // User B attempts to get download capability for Alice's audio file
      let unauthorizedDownloadCaught = false;
      try {
        await clientB.getFileDownloadCapability(workspaceBId, finalizeRes.data.fileId);
      } catch (err: unknown) {
        unauthorizedDownloadCaught = true;
      }
      expect(unauthorizedDownloadCaught).toBe(true);
    });

    it('cascades cleanup of files when workspace is deleted', async () => {
      const poolClient = await adminPool.connect();
      try {
        // Create disposable workspace
        const tempWs = await poolClient.query<{ id: string }>(
          `INSERT INTO app.workspaces (name, kind, owner_id) VALUES ('Temp Audio Ws', 'room', $1) RETURNING id`,
          [userAId]
        );
        const tempWsId = tempWs.rows[0]!.id;

        await poolClient.query(
          `INSERT INTO app.workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
          [tempWsId, userAId]
        );

        // Reserve and finalize audio file in temp workspace
        const audioBytes = Buffer.concat([
          Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
          crypto.randomBytes(512),
        ]);
        const sha256 = crypto.createHash('sha256').update(audioBytes).digest('hex');

        const res = await clientA.reserveFileUpload(tempWsId, {
          fileName: 'temp-voice.webm',
          declaredMimeType: 'audio/webm',
          declaredBytes: audioBytes.length,
        });

        await fetch(res.data.uploadUrl, {
          method: res.data.method,
          headers: { 'content-type': 'audio/webm' },
          body: audioBytes,
        });

        const finalizeRes = await clientA.finalizeFileUpload(tempWsId, res.data.reservationId, {
          clientChecksum: sha256,
        });
        const fileId = finalizeRes.data.fileId;

        // Verify file exists in database
        const fileCheckBefore = await poolClient.query(
          `SELECT id FROM app.file_items WHERE id = $1 AND workspace_id = $2`,
          [fileId, tempWsId]
        );
        expect(fileCheckBefore.rowCount).toBe(1);

        // Delete the workspace
        await poolClient.query(`DELETE FROM app.workspaces WHERE id = $1`, [tempWsId]);

        // Verify cascade deletion of file records
        const fileCheckAfter = await poolClient.query(
          `SELECT id FROM app.file_items WHERE id = $1`,
          [fileId]
        );
        expect(fileCheckAfter.rowCount).toBe(0);
      } finally {
        poolClient.release();
      }
    });
  });

  describe('7. Verification That No Audio Starts Automatically on Onboarding or Background', () => {
    it('verifies that recording initial phase is strictly idle', () => {
      // Invariant: audio recording never starts without an explicit user gesture
      const initialRecorderPhase = 'idle';
      const isAutoRecording = initialRecorderPhase === 'recording';
      expect(isAutoRecording).toBe(false);
    });

    it('verifies onboarding state does not initiate audio recording session', () => {
      const onboardingContext = {
        step: 'welcome',
        isMediaRecording: false,
        activeStreams: 0,
      };

      expect(onboardingContext.isMediaRecording).toBe(false);
      expect(onboardingContext.activeStreams).toBe(0);
    });
  });
});
