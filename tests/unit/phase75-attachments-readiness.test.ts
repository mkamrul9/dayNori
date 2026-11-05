import { describe, expect, it } from 'vitest';
import {
  MAX_AUDIO_RECORDING_BYTES,
  MAX_AUDIO_RECORDING_SECONDS,
  MockAudioRecorderAdapter,
} from '@daynori/domain';
import {
  MAX_AUDIO_FILE_BYTES,
  MAX_GENERAL_FILE_BYTES,
  UPLOAD_CAPABILITY_EXPIRY_SECONDS,
  DOWNLOAD_CAPABILITY_EXPIRY_SECONDS,
  MAX_CONCURRENT_RESERVATIONS,
} from '@daynori/contracts';
import {
  saveDurableAudioDraft,
  getDurableAudioDraft,
  clearDurableAudioDraft,
} from '../../packages/ui-web/src/audioDraftStore.js';
import { createConfiguredMalwareScanner } from '../../apps/api/src/providers/index.js';
import {
  PolicyMalwareScanner,
  UnavailableMalwareScanner,
} from '../../apps/api/src/modules/files/scanner.js';

describe('Phase 75 — attachment readiness invariants', () => {
  it('keeps recorder limits distinct from the file-upload audio ceiling', () => {
    expect(MAX_AUDIO_RECORDING_SECONDS).toBe(600);
    expect(MAX_AUDIO_RECORDING_BYTES).toBe(25 * 1024 * 1024);
    expect(MAX_GENERAL_FILE_BYTES).toBe(25 * 1024 * 1024);
    expect(MAX_AUDIO_FILE_BYTES).toBe(50 * 1024 * 1024);
    expect(MAX_AUDIO_RECORDING_BYTES).toBeLessThan(MAX_AUDIO_FILE_BYTES);
    expect(UPLOAD_CAPABILITY_EXPIRY_SECONDS).toBe(7200);
    expect(DOWNLOAD_CAPABILITY_EXPIRY_SECONDS).toBe(300);
    expect(MAX_CONCURRENT_RESERVATIONS).toBe(5);
  });

  it('scopes durable audio drafts by account and isolates two synthetic accounts', async () => {
    const workspaceId = '11111111-1111-4111-8111-111111111111';
    const accountA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const accountB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const bytesA = new TextEncoder().encode('synthetic-audio-a').buffer;
    const bytesB = new TextEncoder().encode('synthetic-audio-b').buffer;

    await saveDurableAudioDraft({
      workspaceId,
      accountId: accountA,
      mimeType: 'audio/webm',
      durationSeconds: 3,
      byteSize: bytesA.byteLength,
      audioBuffer: bytesA,
    });
    await saveDurableAudioDraft({
      workspaceId,
      accountId: accountB,
      mimeType: 'audio/webm',
      durationSeconds: 4,
      byteSize: bytesB.byteLength,
      audioBuffer: bytesB,
    });

    const draftA = await getDurableAudioDraft(workspaceId, accountA);
    const draftB = await getDurableAudioDraft(workspaceId, accountB);
    expect(draftA?.accountId).toBe(accountA);
    expect(draftB?.accountId).toBe(accountB);
    expect(draftA?.byteSize).toBe(bytesA.byteLength);
    expect(draftB?.byteSize).toBe(bytesB.byteLength);
    expect(draftA?.key).not.toBe(draftB?.key);

    await clearDurableAudioDraft(workspaceId, accountA);
    expect(await getDurableAudioDraft(workspaceId, accountA)).toBeNull();
    expect((await getDurableAudioDraft(workspaceId, accountB))?.accountId).toBe(accountB);

    await clearDurableAudioDraft(workspaceId, accountB);
  });

  it('does not clear a prior unsaved mock recording when starting a new session without discard', async () => {
    const adapter = new MockAudioRecorderAdapter({ durationSeconds: 2, byteSize: 4096 });
    await adapter.startRecordingAsync();
    const first = await adapter.stopRecordingAsync();
    expect(adapter.peekLastRecording?.()?.uri).toBe(first.uri);

    await adapter.startRecordingAsync();
    expect(adapter.peekLastRecording?.()?.uri).toBe(first.uri);

    await adapter.discardRecordingAsync();
    expect(adapter.peekLastRecording?.()).toBeNull();
  });

  it('wires PolicyMalwareScanner only via explicit non-production opt-in', () => {
    const unavailable = createConfiguredMalwareScanner({ NODE_ENV: 'production' });
    expect(unavailable).toBeInstanceOf(UnavailableMalwareScanner);

    const policy = createConfiguredMalwareScanner({
      NODE_ENV: 'development',
      DAYNORI_ALLOW_POLICY_SCANNER: 'true',
    });
    expect(policy).toBeInstanceOf(PolicyMalwareScanner);

    const stillUnavailable = createConfiguredMalwareScanner({
      NODE_ENV: 'production',
      DAYNORI_ALLOW_POLICY_SCANNER: 'true',
    });
    expect(stillUnavailable).toBeInstanceOf(UnavailableMalwareScanner);
  });
});
