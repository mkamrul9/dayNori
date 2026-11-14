import type { Pool } from 'pg';
import {
  calculateAudioTranscriptionCost,
  detectTranscriptionUncertainty,
  isAiKillSwitchActive,
  isAiLocallyEnabled,
  MockAudioTranscriptionAdapter,
  validateAudioForTranscription,
  zeroAudioBuffer,
  type AudioTranscriptionAdapter,
} from '@daynori/domain';
import type { TranscribeAudioResponseData } from '@daynori/contracts';
import { withTenantContext, withUserContext } from '../../db/index.js';
import { AiServiceError, assertPersonalWorkspaceOwned, getAiConsentStatus } from './service.js';

let defaultTranscriptionAdapter: AudioTranscriptionAdapter = new MockAudioTranscriptionAdapter();

export function setAudioTranscriptionAdapter(adapter: AudioTranscriptionAdapter): void {
  defaultTranscriptionAdapter = adapter;
}

export function resetAudioTranscriptionAdapter(): void {
  defaultTranscriptionAdapter = new MockAudioTranscriptionAdapter();
}

/**
 * Proactively overwrites audio buffer memory bytes with zeros in place.
 *
 * Practical limits in JavaScript / Node.js / V8 runtime:
 * - Calling `buffer.fill(0)` zeros out the underlying allocated bytes of the Buffer instance in memory.
 * - However, V8 string primitives (such as the incoming base64 payload `input.audioBase64`),
 *   JSON parser tokens, HTTP body streams, and OS-level socket/TLS buffers are immutable in
 *   JavaScript and cannot be explicitly wiped from memory; they are managed by the V8 Garbage Collector.
 * - Slices, network transport buffers, or OS-level socket buffers cannot be directly cleared from JS.
 * - Therefore, in-memory zeroing of the decoded Buffer reduces raw binary exposure in Node heap,
 *   but it does NOT guarantee instantaneous complete erasure of all ephemeral representations from process RAM.
 */
export function scrubAudioMemory(buffer: Buffer | Uint8Array | null | undefined): boolean {
  return zeroAudioBuffer(buffer);
}

export interface TranscribeAudioInput {
  userId: string;
  workspaceId: string;
  audioBase64: string;
  mimeType: string;
  durationSeconds: number;
  byteSize?: number;
  languageHint?: string;
  clientOperationId?: string;
  signal?: AbortSignal;
}

export async function transcribeAudio(
  pool: Pool,
  input: TranscribeAudioInput
): Promise<TranscribeAudioResponseData> {
  // 1. Server-enforced kill switch
  if (isAiKillSwitchActive(process.env)) {
    throw new AiServiceError('AI kill switch active', 503, 'AI_KILL_SWITCH_ACTIVE');
  }

  // 2. Production fail-closed gate
  if (!isAiLocallyEnabled(process.env)) {
    throw new AiServiceError(
      'AI capability unavailable in this environment',
      503,
      'AI_UNAVAILABLE'
    );
  }

  // 3. Check user AI consent
  const consent = await withUserContext(pool, input.userId, (client) =>
    getAiConsentStatus(client, input.userId)
  );
  if (!consent.enabled) {
    throw new AiServiceError('AI consent required', 403, 'AI_CONSENT_REQUIRED');
  }

  // 4. Decode base64 audio bytes
  let audioBuffer: Buffer;
  try {
    audioBuffer = Buffer.from(input.audioBase64, 'base64');
  } catch {
    throw new AiServiceError('Invalid base64 audio payload', 400, 'INVALID_AUDIO_BASE64');
  }

  const actualByteSize = audioBuffer.length;
  let requestId: string | null = null;
  let reserveTokens = 0;

  try {
    // 5. Validate audio parameters
    const validation = validateAudioForTranscription({
      durationSeconds: input.durationSeconds,
      byteSize: actualByteSize,
      mimeType: input.mimeType,
    });
    if (!validation.valid) {
      throw new AiServiceError(
        validation.message || 'Invalid audio recording',
        400,
        validation.code || 'INVALID_AUDIO'
      );
    }

    // 6. Check workspace access and handle idempotent replay
    const existing = await withTenantContext(
      pool,
      { userId: input.userId, workspaceId: input.workspaceId },
      async (client) => {
        await assertPersonalWorkspaceOwned(client, input.userId, input.workspaceId);

        if (input.clientOperationId) {
          const check = await client.query<{
            id: string;
            transcript: string;
            detected_language: string;
            confidence: string;
            duration_seconds: string;
            byte_size: number;
            words_count: number;
            cost_micro_usd: number;
            retention_policy: 'transient_deleted' | 'transient_purged';
          }>(
            `SELECT id, transcript, detected_language, confidence, duration_seconds,
                    byte_size, words_count, cost_micro_usd, retention_policy
             FROM app.ai_transcriptions
             WHERE user_id = $1 AND workspace_id = $2 AND client_operation_id = $3 AND status = 'completed'
             LIMIT 1`,
            [input.userId, input.workspaceId, input.clientOperationId]
          );
          if (check.rows[0]) {
            const r = check.rows[0];
            const conf = parseFloat(r.confidence) || 1.0;
            const uncertainty = detectTranscriptionUncertainty(r.transcript, conf);
            return {
              transcriptionId: r.id,
              transcript: r.transcript,
              detectedLanguage: r.detected_language,
              confidence: conf,
              durationSeconds: parseFloat(r.duration_seconds) || input.durationSeconds,
              byteSize: r.byte_size,
              wordsCount: r.words_count,
              costMicroUsd: r.cost_micro_usd,
              retentionPolicy: r.retention_policy,
              uncertainSpeech: uncertainty.uncertain,
              provisionalNotice:
                'Audio processed under 0-day transient retention policy. Original audio discarded from server.',
            };
          }
        }
        return null;
      }
    );

    if (existing) {
      return existing;
    }

    // 7. Concurrency-safe durable budget reservation
    reserveTokens = Math.max(100, Math.ceil(input.durationSeconds * 25));
    const reservation = await withUserContext(pool, input.userId, async (client) => {
      const res = await client.query<{
        ok: boolean;
        request_id: string;
        reserved: number;
        spent: number;
        budget_limit: number;
      }>(`SELECT * FROM app.ai_create_reservation($1, $2, $3)`, [
        input.userId,
        reserveTokens,
        consent.consentGeneration,
      ]);
      return res.rows[0];
    });

    if (!reservation?.ok) {
      throw new AiServiceError('AI monthly budget exhausted', 429, 'AI_BUDGET_EXHAUSTED');
    }

    requestId = reservation.request_id;
    const costMicroUsd = calculateAudioTranscriptionCost(input.durationSeconds);

    // 8. Execute transcription through adapter with signal fencing
    if (input.signal?.aborted) {
      throw new AiServiceError('Transcription cancelled', 499, 'AI_CANCELLED');
    }

    const result = await defaultTranscriptionAdapter.transcribe({
      audioBuffer,
      mimeType: input.mimeType,
      durationSeconds: input.durationSeconds,
      languageHint: input.languageHint,
      signal: input.signal,
    });

    // Check if cancelled during transcription
    if (input.signal?.aborted) {
      throw new AiServiceError('Transcription cancelled', 499, 'AI_CANCELLED');
    }

    // 9. Settle budget request
    await withUserContext(pool, input.userId, (client) =>
      client.query(`SELECT * FROM app.ai_settle_request($1, $2, $3)`, [
        requestId,
        reserveTokens,
        'settled',
      ])
    );
    requestId = null;

    // 10. Persist metadata record in app.ai_transcriptions
    const inserted = await withTenantContext(
      pool,
      { userId: input.userId, workspaceId: input.workspaceId },
      async (client) => {
        const res = await client.query<{ id: string }>(
          `INSERT INTO app.ai_transcriptions (
            workspace_id, user_id, client_operation_id, duration_seconds,
            byte_size, mime_type, transcript, detected_language, confidence,
            words_count, cost_micro_usd, status, retention_policy
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'completed', 'transient_deleted'
          ) RETURNING id`,
          [
            input.workspaceId,
            input.userId,
            input.clientOperationId || null,
            result.durationSeconds,
            actualByteSize,
            input.mimeType,
            result.transcript,
            result.detectedLanguage,
            result.confidence,
            result.wordsCount,
            costMicroUsd,
          ]
        );
        return res.rows[0]?.id;
      }
    );

    return {
      transcriptionId: inserted || crypto.randomUUID(),
      transcript: result.transcript,
      detectedLanguage: result.detectedLanguage,
      confidence: result.confidence,
      durationSeconds: result.durationSeconds,
      byteSize: actualByteSize,
      wordsCount: result.wordsCount,
      costMicroUsd,
      retentionPolicy: 'transient_deleted',
      uncertainSpeech: result.uncertainSpeech,
      provisionalNotice:
        'Audio processed under 0-day transient retention policy. Original audio discarded from server.',
    };
  } catch (err) {
    if (requestId) {
      const isCancelled =
        (err instanceof Error && err.name === 'AbortError') ||
        (err instanceof AiServiceError && err.code === 'AI_CANCELLED');

      // Settle budget with cancelled or unknown_usage status
      await withUserContext(pool, input.userId, (client) =>
        client.query(`SELECT * FROM app.ai_settle_request($1, $2, $3)`, [
          requestId,
          isCancelled ? Math.min(50, reserveTokens) : reserveTokens,
          isCancelled ? 'cancelled' : 'unknown_usage',
        ])
      );

      if (isCancelled) {
        throw new AiServiceError('Transcription cancelled', 499, 'AI_CANCELLED');
      }
    }
    throw err;
  } finally {
    // 11. Overwrite decoded buffer memory with zeros across ALL return and error paths
    scrubAudioMemory(audioBuffer);
  }
}
