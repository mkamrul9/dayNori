export const MAX_AUDIO_RECORDING_SECONDS = 600; // 10 minutes maximum duration
export const MAX_AUDIO_RECORDING_BYTES = 25 * 1024 * 1024; // 25 MiB maximum size
export const AUDIO_WARNING_THRESHOLD_SECONDS = 540; // 9 minutes warning threshold

export const SUPPORTED_AUDIO_RECORDING_MIME_TYPES = [
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/mpeg',
] as const;

export type SupportedAudioMimeType = (typeof SUPPORTED_AUDIO_RECORDING_MIME_TYPES)[number];

export interface AudioAttachment {
  fileId: string;
  fileName: string;
  durationSeconds: number;
  byteSize: number;
  mimeType: string;
  createdAt: string;
}

export interface AudioDraftSession {
  sessionId: string;
  workspaceId: string;
  durationSeconds: number;
  byteSize: number;
  mimeType: string;
  status: 'recording' | 'paused' | 'stopped' | 'interrupted' | 'uploaded';
  createdAt: string;
  updatedAt: string;
  targetItemType?: 'note' | 'journal' | 'knowledge' | 'file';
  targetItemId?: string;
  blobKey?: string;
}

/**
 * Validates audio recording duration against allowable limits.
 * Duration must be positive and not exceed the maximum allowed duration (default 10 minutes).
 */
export function validateAudioDuration(
  durationSeconds: number,
  maxDurationSeconds: number = MAX_AUDIO_RECORDING_SECONDS
): boolean {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return false;
  }
  return durationSeconds <= maxDurationSeconds;
}

/**
 * Formats a duration in seconds into MM:SS string representation.
 */
export function formatAudioDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '00:00';
  }
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Checks whether the supplied MIME type is a recognized audio format supported by Daynori storage.
 */
export function isSupportedAudioMimeType(mimeType: string): boolean {
  if (!mimeType || typeof mimeType !== 'string') return false;
  const baseMime = mimeType.split(';')[0]!.trim().toLowerCase();
  return (SUPPORTED_AUDIO_RECORDING_MIME_TYPES as readonly string[]).includes(baseMime);
}

/**
 * Validates whether an item type allows attaching recorded audio files.
 * Permitted types: note, journal, knowledge, file.
 */
export function canAttachAudioToItem(itemType: string): boolean {
  return ['note', 'journal', 'knowledge', 'file'].includes(itemType.toLowerCase().trim());
}

/**
 * Calculates audio playback progress percentage bounded between 0 and 100.
 */
export function calculateAudioProgress(currentSeconds: number, totalSeconds: number): number {
  if (!Number.isFinite(currentSeconds) || !Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return 0;
  }
  const pct = (currentSeconds / totalSeconds) * 100;
  return Math.max(0, Math.min(100, Math.round(pct * 10) / 10));
}

/**
 * Constructs and validates a durable AudioAttachment object.
 */
export function createAudioAttachment(params: {
  fileId: string;
  fileName: string;
  durationSeconds: number;
  byteSize: number;
  mimeType: string;
  createdAt?: string;
}): AudioAttachment {
  if (!params.fileId || typeof params.fileId !== 'string') {
    throw new Error('fileId is required for AudioAttachment');
  }
  if (!params.fileName || typeof params.fileName !== 'string') {
    throw new Error('fileName is required for AudioAttachment');
  }
  if (!validateAudioDuration(params.durationSeconds)) {
    throw new Error(
      `Invalid audio duration: ${params.durationSeconds}s exceeds allowable 1 to ${MAX_AUDIO_RECORDING_SECONDS}s range`
    );
  }
  if (params.byteSize <= 0 || params.byteSize > MAX_AUDIO_RECORDING_BYTES) {
    throw new Error(
      `Invalid audio byte size: ${params.byteSize} bytes exceeds maximum ${MAX_AUDIO_RECORDING_BYTES} bytes`
    );
  }
  if (!isSupportedAudioMimeType(params.mimeType)) {
    throw new Error(`Unsupported audio MIME type: ${params.mimeType}`);
  }

  return {
    fileId: params.fileId,
    fileName: params.fileName,
    durationSeconds: Math.round(params.durationSeconds),
    byteSize: Math.round(params.byteSize),
    mimeType: params.mimeType.split(';')[0]!.trim().toLowerCase(),
    createdAt: params.createdAt || new Date().toISOString(),
  };
}
