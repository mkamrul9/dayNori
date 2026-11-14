import {
  MAX_AUDIO_RECORDING_SECONDS,
  MAX_AUDIO_RECORDING_BYTES,
  isSupportedAudioMimeType,
} from './audio.js';

export const AUDIO_RETENTION_POLICIES = {
  TRANSIENT_DELETED: 'transient_deleted',
  TRANSIENT_PURGED: 'transient_purged',
} as const;
export type AudioRetentionPolicy =
  (typeof AUDIO_RETENTION_POLICIES)[keyof typeof AUDIO_RETENTION_POLICIES];

export interface AudioValidationResult {
  valid: boolean;
  code?: string;
  message?: string;
}

/**
 * Overwrites buffer memory bytes with zeros in place.
 *
 * Practical limits in JavaScript / V8 runtime:
 * - Overwrites the underlying byte array of the Buffer / Uint8Array instance.
 * - Does not and cannot erase immutable V8 strings (e.g. base64 payloads) or OS/network buffers.
 * - Serves as proactive in-memory defense-in-depth against lingering binary audio in heap.
 */
export function zeroAudioBuffer(buffer?: Buffer | Uint8Array | null): boolean {
  if (!buffer) return false;
  try {
    if (typeof (buffer as Buffer).fill === 'function') {
      (buffer as Buffer).fill(0);
      return true;
    }
    if (buffer instanceof Uint8Array) {
      buffer.fill(0);
      return true;
    }
  } catch {
    // Slices or detached array buffers
  }
  return false;
}

/**
 * Validates audio parameters prior to uploading and transcribing.
 * Enforces duration bounds (0.5s to 600s), byte size bounds (<= 25 MiB),
 * and approved audio MIME types.
 */
export function validateAudioForTranscription(input: {
  durationSeconds: number;
  byteSize?: number;
  mimeType: string;
}): AudioValidationResult {
  if (
    !Number.isFinite(input.durationSeconds) ||
    Number.isNaN(input.durationSeconds) ||
    input.durationSeconds < 0.5 ||
    input.durationSeconds > MAX_AUDIO_RECORDING_SECONDS
  ) {
    return {
      valid: false,
      code: 'AUDIO_DURATION_OUT_OF_BOUNDS',
      message: `Audio duration (${input.durationSeconds}s) must be between 0.5s and ${MAX_AUDIO_RECORDING_SECONDS}s.`,
    };
  }

  if (
    input.byteSize !== undefined &&
    (!Number.isFinite(input.byteSize) ||
      Number.isNaN(input.byteSize) ||
      input.byteSize <= 0 ||
      input.byteSize > MAX_AUDIO_RECORDING_BYTES)
  ) {
    return {
      valid: false,
      code: 'AUDIO_SIZE_EXCEEDED',
      message: `Audio byte size (${input.byteSize} bytes) exceeds maximum allowable limit of ${MAX_AUDIO_RECORDING_BYTES} bytes (25 MiB).`,
    };
  }

  if (!isSupportedAudioMimeType(input.mimeType)) {
    return {
      valid: false,
      code: 'UNSUPPORTED_AUDIO_MIME',
      message: `Audio MIME type '${input.mimeType}' is not supported. Supported formats: audio/webm, audio/mp4, audio/ogg, audio/wav, audio/mpeg.`,
    };
  }

  return { valid: true };
}

/**
 * Calculates estimated audio transcription cost in micro-USD ($0.000001).
 * Default Gemini 1.5 Flash multimodal: $0.00002 / second ($0.02 / 1000s).
 * Minimum billable duration: 1 second (20 micro-USD).
 */
export function calculateAudioTranscriptionCost(
  durationSeconds: number,
  provider: 'gemini' | 'whisper' = 'gemini'
): number {
  const boundedSeconds = Math.max(1, Math.round(durationSeconds));
  if (provider === 'whisper') {
    // OpenAI Whisper: $0.006 / minute = $0.0001 / second = 100 micro-USD / sec
    return boundedSeconds * 100;
  }
  // Gemini 1.5 Flash multimodal audio: $0.00002 / second = 20 micro-USD / sec
  return Math.max(20, boundedSeconds * 20);
}

export interface AudioTranscriptionResult {
  transcript: string;
  detectedLanguage: string;
  confidence: number;
  durationSeconds: number;
  wordsCount: number;
  costMicroUsd: number;
  audioCleanedUp: boolean;
  uncertainSpeech: boolean;
}

export interface AudioTranscriptionAdapter {
  transcribe(input: {
    audioBuffer: Buffer | Uint8Array;
    mimeType: string;
    durationSeconds: number;
    languageHint?: string;
    signal?: AbortSignal;
  }): Promise<AudioTranscriptionResult>;
}

export interface TranscriptionUncertainty {
  uncertain: boolean;
  reason?: 'silence' | 'low_confidence' | 'empty';
  promptMessage?: string;
}

/**
 * Evaluates transcript and recognition confidence for speech uncertainty.
 * Flags silence, empty output, or low confidence (< 0.70) requiring explicit user correction.
 */
export function detectTranscriptionUncertainty(
  transcript: string,
  confidence: number
): TranscriptionUncertainty {
  const trimmed = transcript.trim();
  if (trimmed.length === 0) {
    return {
      uncertain: true,
      reason: 'silence',
      promptMessage:
        'No clear speech was detected in this recording. Please check your microphone or try recording again.',
    };
  }

  if (confidence < 0.7) {
    return {
      uncertain: true,
      reason: 'low_confidence',
      promptMessage:
        'Speech recognition confidence was low. Please review and edit the transcript text before generating organizer items.',
    };
  }

  return { uncertain: false };
}

/**
 * Deterministic mock audio transcription adapter for unit/integration testing
 * and offline local development without external provider network calls.
 */
export class MockAudioTranscriptionAdapter implements AudioTranscriptionAdapter {
  private customMockHandler?: (
    buffer: Buffer | Uint8Array,
    durationSeconds: number
  ) => Partial<AudioTranscriptionResult> | null;

  constructor(
    customHandler?: (
      buffer: Buffer | Uint8Array,
      durationSeconds: number
    ) => Partial<AudioTranscriptionResult> | null
  ) {
    this.customMockHandler = customHandler;
  }

  async transcribe(input: {
    audioBuffer: Buffer | Uint8Array;
    mimeType: string;
    durationSeconds: number;
    languageHint?: string;
    signal?: AbortSignal;
  }): Promise<AudioTranscriptionResult> {
    if (input.signal?.aborted) {
      const err = new Error('Transcription aborted by client');
      err.name = 'AbortError';
      throw err;
    }

    const durationSeconds = Math.max(0.5, Math.round(input.durationSeconds * 10) / 10);
    const bufStr = Buffer.isBuffer(input.audioBuffer)
      ? input.audioBuffer.toString('utf8', 0, Math.min(input.audioBuffer.length, 512))
      : new TextDecoder().decode(input.audioBuffer.slice(0, 512));

    if (this.customMockHandler) {
      const custom = this.customMockHandler(input.audioBuffer, durationSeconds);
      if (custom) {
        const words = (custom.transcript || '').trim().split(/\s+/).filter(Boolean).length;
        const confidence = custom.confidence !== undefined ? custom.confidence : 0.95;
        const uncertainty = detectTranscriptionUncertainty(custom.transcript || '', confidence);
        return {
          transcript: custom.transcript || '',
          detectedLanguage: custom.detectedLanguage || input.languageHint || 'en',
          confidence,
          durationSeconds,
          wordsCount: words,
          costMicroUsd: calculateAudioTranscriptionCost(durationSeconds),
          audioCleanedUp: true,
          uncertainSpeech: uncertainty.uncertain,
        };
      }
    }

    // 1. Silence detection
    const isAllZeros =
      input.audioBuffer.length > 0 &&
      input.audioBuffer.slice(0, 100).every((b) => b === 0);
    if (
      input.audioBuffer.length === 0 ||
      bufStr.includes('silence') ||
      isAllZeros
    ) {
      return {
        transcript: '',
        detectedLanguage: input.languageHint || 'en',
        confidence: 0.0,
        durationSeconds,
        wordsCount: 0,
        costMicroUsd: calculateAudioTranscriptionCost(durationSeconds),
        audioCleanedUp: true,
        uncertainSpeech: true,
      };
    }

    // 2. Low-confidence / noisy audio
    if (bufStr.includes('noisy') || bufStr.includes('mumble')) {
      return {
        transcript: 'submit report ... project review ... Friday',
        detectedLanguage: input.languageHint || 'en',
        confidence: 0.45,
        durationSeconds,
        wordsCount: 6,
        costMicroUsd: calculateAudioTranscriptionCost(durationSeconds),
        audioCleanedUp: true,
        uncertainSpeech: true,
      };
    }

    // 3. Embedded text in mock fixture buffer
    const embeddedMatch = bufStr.match(/MOCK_TRANSCRIPT:([^\r\n]+)/);
    if (embeddedMatch && embeddedMatch[1]) {
      const rawText = embeddedMatch[1].trim();
      const isBangla = /[\u0980-\u09FF]/.test(rawText);
      const isCodeSwitched = isBangla && /[a-zA-Z]/.test(rawText);
      const lang = isCodeSwitched ? 'bn-en' : isBangla ? 'bn' : 'en';
      const words = rawText.split(/\s+/).filter(Boolean).length;
      return {
        transcript: rawText,
        detectedLanguage: lang,
        confidence: 0.98,
        durationSeconds,
        wordsCount: words,
        costMicroUsd: calculateAudioTranscriptionCost(durationSeconds),
        audioCleanedUp: true,
        uncertainSpeech: false,
      };
    }

    // 4. Bengali language synthetic defaults
    if (input.languageHint === 'bn' || bufStr.includes('bangla')) {
      const bnText = 'আগামীকাল সকাল দশটায় ডাক্তারের সাথে অ্যাপয়েন্টমেন্ট আছে';
      return {
        transcript: bnText,
        detectedLanguage: 'bn',
        confidence: 0.97,
        durationSeconds,
        wordsCount: 6,
        costMicroUsd: calculateAudioTranscriptionCost(durationSeconds),
        audioCleanedUp: true,
        uncertainSpeech: false,
      };
    }

    // 5. Code-switched (Banglish) synthetic default
    if (input.languageHint === 'bn-en' || bufStr.includes('banglish') || bufStr.includes('code-switch')) {
      const csText = 'Friday-তে project report submit করতে হবে 5pm-এর মধ্যে';
      return {
        transcript: csText,
        detectedLanguage: 'bn-en',
        confidence: 0.94,
        durationSeconds,
        wordsCount: 8,
        costMicroUsd: calculateAudioTranscriptionCost(durationSeconds),
        audioCleanedUp: true,
        uncertainSpeech: false,
      };
    }

    // 6. Default English speech
    const defaultText = 'Submit CS50 memory allocation pset by Friday at 5pm';
    return {
      transcript: defaultText,
      detectedLanguage: 'en',
      confidence: 0.96,
      durationSeconds,
      wordsCount: 9,
      costMicroUsd: calculateAudioTranscriptionCost(durationSeconds),
      audioCleanedUp: true,
      uncertainSpeech: false,
    };
  }
}
