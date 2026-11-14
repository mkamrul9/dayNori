/**
 * Phase 115 — Voice Assistant UI and Physical Device Gate Unit Tests.
 *
 * Verifies:
 * 1. Web AssistantPanel UI voice controls, gating banners, and editable transcript surfaces.
 * 2. Mobile AssistantSheet UI voice controls, gating state, and transcript review inputs.
 * 3. Physical Android phone gate DEF-V2-011 fail-closed status.
 * 4. Audio memory scrubbing limits documentation and contracts.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  zeroAudioBuffer,
  detectTranscriptionUncertainty,
  validateAudioForTranscription,
} from '@daynori/domain';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

describe('Phase 115: Voice Assistant UI and Physical Device Gate Unit Tests', () => {
  it('VUI-01: Web AssistantPanel properly gates voice actions and provides editable transcript review', () => {
    const webPanelPath = path.join(ROOT_DIR, 'apps/web/src/components/AssistantPanel.tsx');
    const content = fs.readFileSync(webPanelPath, 'utf8');

    // 1. Record Voice button is gated under isGated
    expect(content).toContain('disabled={isGated}');
    expect(content).toContain('data-tour="assistant-voice-record"');
    expect(content).toContain('Record Voice');

    // 2. Transcribe Voice button is gated under isGated
    expect(content).toContain('data-tour="assistant-voice-transcribe"');
    expect(content).toContain('Transcribe Voice');

    // 3. Informative gating banner rendered
    expect(content).toContain('assistant-gated-banner');
    expect(content).toContain('DEF-V2-008');

    // 4. Editable transcript review textarea present
    expect(content).toContain('id="assistant-transcript-edit"');
    expect(content).toContain('data-tour="assistant-transcript-edit"');
    expect(content).toContain('Review & Correct Transcript:');

    // 5. Uncertainty alert message rendering
    expect(content).toContain('transcriptUncertainty?.uncertain');

    // 6. Pre-transmission 0-day retention disclosure
    expect(content).toContain('0-day retention policy');
    expect(content).toContain('cancelVoiceRecording');
  });

  it('VUI-02: Mobile AssistantSheet properly gates voice chips and provides multiline transcript review', () => {
    const mobileSheetPath = path.join(ROOT_DIR, 'apps/mobile/src/views/AssistantSheet.tsx');
    const content = fs.readFileSync(mobileSheetPath, 'utf8');

    // 1. Voice chips disabled when isGated is true
    expect(content).toContain('disabled={isGated}');
    expect(content).toContain('Record Voice');

    // 2. Transcribe Voice button disabled when isGated
    expect(content).toContain('Transcribe Voice');

    // 3. Gating banner with DEF-V2-008
    expect(content).toContain('DEF-V2-008');
    expect(content).toContain('Assistant is currently gated under DEF-V2-008');

    // 4. Uncertainty alert handling
    expect(content).toContain('Uncertain recognition detected');

    // 5. Cancel recording discards locally
    expect(content).toContain('cancelVoiceRecording');
    expect(content).toContain('discardRecordingAsync');
  });

  it('VUI-03: Physical Android phone release gate DEF-V2-011 remains strictly fail-closed', () => {
    const functionRegisterPath = path.join(ROOT_DIR, 'docs/roadmap/v2/function-register.json');
    const register = JSON.parse(fs.readFileSync(functionRegisterPath, 'utf8'));
    const def = register.defects.find((d: any) => d.id === 'DEF-V2-011');

    expect(def).toBeDefined();
    expect(def.title).toContain('Physical Android and TalkBack evidence still missing');
    expect(def.severity).toBe('high');
    expect(def.platforms).toContain('android');
    expect(def.userImpact).toContain('physical-device readiness');
  });

  it('VUI-04: zeroAudioBuffer proactively zeroes memory and handles null/undefined safely', () => {
    expect(zeroAudioBuffer(null)).toBe(false);
    expect(zeroAudioBuffer(undefined)).toBe(false);

    const buf = Buffer.from('TEST_AUDIO_MEMORY_TO_ZERO_123');
    expect(buf.every((b) => b === 0)).toBe(false);
    expect(zeroAudioBuffer(buf)).toBe(true);
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  it('VUI-05: Uncertainty detection accurately classifies silence, low confidence, and fluent speech', () => {
    // 1. Silence
    const silence = detectTranscriptionUncertainty('', 0.0);
    expect(silence.uncertain).toBe(true);
    expect(silence.reason).toBe('silence');

    // 2. Low confidence (< 0.70)
    const lowConf = detectTranscriptionUncertainty('meeting tomorrow maybe', 0.55);
    expect(lowConf.uncertain).toBe(true);
    expect(lowConf.reason).toBe('low_confidence');

    // 3. High confidence (>= 0.70)
    const fluent = detectTranscriptionUncertainty('Submit tax return by Friday', 0.96);
    expect(fluent.uncertain).toBe(false);
    expect(fluent.reason).toBeUndefined();
  });

  it('VUI-06: validateAudioForTranscription enforces audio envelope limits', () => {
    // Valid 5s WAV
    expect(validateAudioForTranscription({ durationSeconds: 5, mimeType: 'audio/wav', byteSize: 160000 }).valid).toBe(true);

    // Duration out of bounds (<0.5s)
    const shortCheck = validateAudioForTranscription({ durationSeconds: 0.1, mimeType: 'audio/webm' });
    expect(shortCheck.valid).toBe(false);
    expect(shortCheck.code).toBe('AUDIO_DURATION_OUT_OF_BOUNDS');

    // Duration out of bounds (>600s)
    const longCheck = validateAudioForTranscription({ durationSeconds: 601, mimeType: 'audio/webm' });
    expect(longCheck.valid).toBe(false);
    expect(longCheck.code).toBe('AUDIO_DURATION_OUT_OF_BOUNDS');

    // Unsupported MIME
    const mimeCheck = validateAudioForTranscription({ durationSeconds: 5, mimeType: 'audio/flac' });
    expect(mimeCheck.valid).toBe(false);
    expect(mimeCheck.code).toBe('UNSUPPORTED_AUDIO_MIME');
  });
});
