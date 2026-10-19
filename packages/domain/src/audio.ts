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
  if (!Number.isFinite(durationSeconds) || Number.isNaN(durationSeconds) || durationSeconds < 0.5) {
    return false;
  }
  return Math.round(durationSeconds) <= maxDurationSeconds;
}

/**
 * Formats a duration in seconds into MM:SS string representation.
 */
export function formatAudioDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || Number.isNaN(seconds) || seconds < 0) {
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
  if (!itemType || typeof itemType !== 'string') return false;
  return ['note', 'journal', 'knowledge', 'file'].includes(itemType.toLowerCase().trim());
}

/**
 * Calculates audio playback progress percentage bounded between 0 and 100.
 */
export function calculateAudioProgress(currentSeconds: number, totalSeconds: number): number {
  if (
    !Number.isFinite(currentSeconds) ||
    Number.isNaN(currentSeconds) ||
    !Number.isFinite(totalSeconds) ||
    Number.isNaN(totalSeconds) ||
    totalSeconds <= 0
  ) {
    return 0;
  }
  const pct = (currentSeconds / totalSeconds) * 100;
  return Math.max(0, Math.min(100, Math.round(pct * 10) / 10));
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (!params.fileId || typeof params.fileId !== 'string' || !UUID_REGEX.test(params.fileId)) {
    throw new Error('fileId must be a valid UUID for AudioAttachment');
  }
  if (!params.fileName || typeof params.fileName !== 'string' || params.fileName.trim().length === 0) {
    throw new Error('fileName is required for AudioAttachment');
  }
  if (!Number.isFinite(params.durationSeconds) || Number.isNaN(params.durationSeconds) || !validateAudioDuration(params.durationSeconds)) {
    throw new Error(
      `Invalid audio duration: ${params.durationSeconds}s must be a finite duration between 1 and ${MAX_AUDIO_RECORDING_SECONDS}s`
    );
  }
  if (
    !Number.isFinite(params.byteSize) ||
    Number.isNaN(params.byteSize) ||
    params.byteSize <= 0 ||
    params.byteSize > MAX_AUDIO_RECORDING_BYTES
  ) {
    throw new Error(
      `Invalid audio byte size: ${params.byteSize} bytes exceeds maximum allowable ${MAX_AUDIO_RECORDING_BYTES} bytes`
    );
  }
  if (!isSupportedAudioMimeType(params.mimeType)) {
    throw new Error(`Unsupported audio MIME type: ${params.mimeType}`);
  }

  const roundedDuration = Math.max(1, Math.round(params.durationSeconds));
  const roundedBytes = Math.max(1, Math.round(params.byteSize));

  let createdAt = params.createdAt || new Date().toISOString();
  if (isNaN(Date.parse(createdAt))) {
    createdAt = new Date().toISOString();
  }

  return {
    fileId: params.fileId,
    fileName: params.fileName.trim(),
    durationSeconds: roundedDuration,
    byteSize: roundedBytes,
    mimeType: params.mimeType.split(';')[0]!.trim().toLowerCase(),
    createdAt,
  };
}

export interface AudioRecordingResult {
  uri: string;
  durationSeconds: number;
  byteSize: number;
  mimeType: string;
  fileName: string;
}

export interface NativeAudioRecorderAdapter {
  requestPermissionsAsync(): Promise<{ granted: boolean; canAskAgain: boolean }>;
  startRecordingAsync(): Promise<void>;
  pauseRecordingAsync(): Promise<void>;
  resumeRecordingAsync(): Promise<void>;
  stopRecordingAsync(): Promise<AudioRecordingResult>;
  discardRecordingAsync(): Promise<void>;
  isRecording(): boolean;
  isPaused(): boolean;
}

export interface NativeAudioPlayerStatus {
  isLoaded: boolean;
  isPlaying: boolean;
  durationMillis?: number;
  positionMillis?: number;
  didJustFinish?: boolean;
  error?: string;
}

export interface NativeAudioPlayerAdapter {
  loadAsync(uri: string, onStatusUpdate?: (status: NativeAudioPlayerStatus) => void): Promise<void>;
  playAsync(): Promise<void>;
  pauseAsync(): Promise<void>;
  stopAsync(): Promise<void>;
  setPositionAsync(positionMillis: number): Promise<void>;
  unloadAsync(): Promise<void>;
}

export class MockAudioRecorderAdapter implements NativeAudioRecorderAdapter {
  private _isRecording = false;
  private _isPaused = false;
  private _durationSeconds = 0;
  private _byteSize = 16384;
  private _permissionGranted = true;

  constructor(options?: { permissionGranted?: boolean; durationSeconds?: number; byteSize?: number }) {
    if (options?.permissionGranted !== undefined) this._permissionGranted = options.permissionGranted;
    if (options?.durationSeconds !== undefined) this._durationSeconds = options.durationSeconds;
    if (options?.byteSize !== undefined) this._byteSize = options.byteSize;
  }

  async requestPermissionsAsync(): Promise<{ granted: boolean; canAskAgain: boolean }> {
    return { granted: this._permissionGranted, canAskAgain: true };
  }

  async startRecordingAsync(): Promise<void> {
    if (!this._permissionGranted) throw new Error('Microphone permission denied');
    this._isRecording = true;
    this._isPaused = false;
  }

  async pauseRecordingAsync(): Promise<void> {
    if (this._isRecording) this._isPaused = true;
  }

  async resumeRecordingAsync(): Promise<void> {
    if (this._isRecording) this._isPaused = false;
  }

  async stopRecordingAsync(): Promise<AudioRecordingResult> {
    this._isRecording = false;
    this._isPaused = false;
    const duration = Math.max(1, this._durationSeconds || 5);
    const byteSize = this._byteSize || duration * 8192;
    return {
      uri: `file:///test-cache/recording-${Date.now()}.m4a`,
      durationSeconds: duration,
      byteSize,
      mimeType: 'audio/mp4',
      fileName: `recording-${Date.now()}.m4a`,
    };
  }

  async discardRecordingAsync(): Promise<void> {
    this._isRecording = false;
    this._isPaused = false;
  }

  isRecording(): boolean {
    return this._isRecording;
  }

  isPaused(): boolean {
    return this._isPaused;
  }
}

export class MockAudioPlayerAdapter implements NativeAudioPlayerAdapter {
  private _status: NativeAudioPlayerStatus = { isLoaded: false, isPlaying: false };
  private _listener?: (status: NativeAudioPlayerStatus) => void;

  async loadAsync(_uri: string, onStatusUpdate?: (status: NativeAudioPlayerStatus) => void): Promise<void> {
    this._listener = onStatusUpdate;
    this._status = { isLoaded: true, isPlaying: false, durationMillis: 10000, positionMillis: 0 };
    this._listener?.(this._status);
  }

  async playAsync(): Promise<void> {
    this._status = { ...this._status, isPlaying: true };
    this._listener?.(this._status);
  }

  async pauseAsync(): Promise<void> {
    this._status = { ...this._status, isPlaying: false };
    this._listener?.(this._status);
  }

  async stopAsync(): Promise<void> {
    this._status = { ...this._status, isPlaying: false, positionMillis: 0 };
    this._listener?.(this._status);
  }

  async setPositionAsync(positionMillis: number): Promise<void> {
    this._status = { ...this._status, positionMillis };
    this._listener?.(this._status);
  }

  async unloadAsync(): Promise<void> {
    this._status = { isLoaded: false, isPlaying: false };
    this._listener?.(this._status);
  }
}

