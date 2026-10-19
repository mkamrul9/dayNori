'use client';

import React, { useState, useEffect, useRef, useId, useCallback } from 'react';
import { colors, radii, spacing, touchTargets, typography, type ThemeMode } from '@daynori/design-tokens';
import {
  formatAudioDuration,
  formatByteSize,
  MAX_AUDIO_RECORDING_SECONDS,
  MAX_AUDIO_RECORDING_BYTES,
  AUDIO_WARNING_THRESHOLD_SECONDS,
  type AudioAttachment,
} from '@daynori/domain';
import { Button } from './Button.js';
import { Feedback } from './Feedback.js';
import {
  saveDurableAudioDraft,
  getDurableAudioDraft,
  clearDurableAudioDraft,
  type DurableAudioDraft,
} from './audioDraftStore.js';

export interface AudioRecorderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  accountId?: string;
  themeMode?: ThemeMode;
  onSaveAudio: (data: {
    blob: Blob;
    durationSeconds: number;
    fileName: string;
    mimeType: string;
    byteSize: number;
  }) => Promise<AudioAttachment | void>;
  attachedItemTitle?: string;
  attachedItemType?: 'note' | 'journal' | 'knowledge' | 'file';
  testID?: string;
}

type RecorderPhase = 'idle' | 'recording' | 'paused' | 'stopped' | 'uploading' | 'error';

export const AudioRecorderDialog: React.FC<AudioRecorderDialogProps> = ({
  isOpen,
  onClose,
  workspaceId,
  accountId,
  themeMode = 'light',
  onSaveAudio,
  attachedItemTitle,
  attachedItemType = 'note',
  testID = 'audio-recorder-dialog',
}) => {
  const palette = colors[themeMode] || colors.light;
  const titleId = useId();
  const descId = useId();
  const liveStatusId = useId();

  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedMimeType, setRecordedMimeType] = useState<string>('audio/webm');
  const [feedback, setFeedback] = useState<{ severity: 'danger' | 'warning' | 'info'; message: string } | null>(null);
  const [hasRecoverableDraft, setHasRecoverableDraft] = useState<boolean>(false);
  const [recoveredDraft, setRecoveredDraft] = useState<DurableAudioDraft | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const isCancelledRef = useRef<boolean>(false);
  const cumulativeBytesRef = useRef<number>(0);
  const elapsedSecondsRef = useRef<number>(0);

  // Check for interrupted draft on mount or open
  useEffect(() => {
    isMountedRef.current = true;
    isCancelledRef.current = false;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void getDurableAudioDraft(workspaceId, accountId).then((draft) => {
      if (!isMountedRef.current) return;
      if (draft && draft.audioBuffer && draft.audioBuffer.byteLength > 0) {
        setRecoveredDraft(draft);
        setHasRecoverableDraft(true);
      } else if (draft) {
        setRecoveredDraft(null);
        setHasRecoverableDraft(true);
      } else {
        setRecoveredDraft(null);
        setHasRecoverableDraft(false);
      }
    });
  }, [isOpen, workspaceId, accountId]);

  // Clean up recording stream & timer on close/unmount
  const cleanupMedia = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    mediaRecorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(null);
    }
  }, [recordedUrl]);

  useEffect(() => {
    if (!isOpen) {
      cleanupMedia();
      setPhase('idle');
      setElapsedSeconds(0);
      setRecordedBlob(null);
      setFeedback(null);
    }
  }, [isOpen, cleanupMedia]);

  // Select preferred supported mime type
  const getPreferredMimeType = (): string => {
    if (typeof MediaRecorder === 'undefined') return 'audio/webm';
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
      'audio/wav',
    ];
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c)) return c;
    }
    return 'audio/webm';
  };

  // Start deliberate recording
  const handleStartRecording = async () => {
    setFeedback(null);
    chunksRef.current = [];
    cumulativeBytesRef.current = 0;
    elapsedSecondsRef.current = 0;
    isCancelledRef.current = false;

    if (!navigator?.mediaDevices?.getUserMedia) {
      setFeedback({
        severity: 'danger',
        message: 'Microphone recording is not supported in this browser environment.',
      });
      return;
    }

    try {
      // 1. Request microphone permission explicitly via user gesture
      const streamPromise = navigator.mediaDevices.getUserMedia({ audio: true });
      const stream = await streamPromise;

      if (!isMountedRef.current || isCancelledRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;

      const chosenMime = getPreferredMimeType();
      setRecordedMimeType(chosenMime);

      const recorder = new MediaRecorder(stream, { mimeType: chosenMime });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = async (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
          cumulativeBytesRef.current += e.data.size;

          // Enforce 25 MiB byte limit
          if (cumulativeBytesRef.current >= MAX_AUDIO_RECORDING_BYTES) {
            handleStopRecording();
            return;
          }

          // Persist durable binary draft periodically
          try {
            const combinedBlob = new Blob(chunksRef.current, { type: chosenMime });
            const buffer = await combinedBlob.arrayBuffer();
            if (isMountedRef.current && !isCancelledRef.current) {
              await saveDurableAudioDraft({
                workspaceId,
                accountId,
                mimeType: chosenMime,
                durationSeconds: Math.max(1, elapsedSecondsRef.current),
                byteSize: buffer.byteLength,
                audioBuffer: buffer,
              });
            }
          } catch {}
        }
      };

      recorder.onstop = () => {
        const fullBlob = new Blob(chunksRef.current, { type: chosenMime });
        setRecordedBlob(fullBlob);
        const url = URL.createObjectURL(fullBlob);
        setRecordedUrl(url);
        setPhase('stopped');
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
      };

      recorder.start(1000); // 1-second timeslices for chunk reliability
      setPhase('recording');
      setElapsedSeconds(0);
      elapsedSecondsRef.current = 0;

      // Start elapsed timer
      timerIntervalRef.current = setInterval(() => {
        setElapsedSeconds((prev) => {
          const next = prev + 1;
          elapsedSecondsRef.current = next;
          // Duration limit check (10 minutes)
          if (next >= MAX_AUDIO_RECORDING_SECONDS) {
            handleStopRecording();
            return MAX_AUDIO_RECORDING_SECONDS;
          }
          return next;
        });
      }, 1000);
    } catch (err: unknown) {
      cleanupMedia();
      setPhase('error');
      const isPermissionDenied =
        err instanceof DOMException &&
        (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
      setFeedback({
        severity: 'danger',
        message: isPermissionDenied
          ? 'Microphone permission was denied. Daynori organizer functions remain fully usable without recording.'
          : 'Failed to access microphone. Please ensure your microphone is connected and authorized.',
      });
    }
  };

  const handlePauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      setPhase('paused');
    }
  };

  const handleResumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      timerIntervalRef.current = setInterval(() => {
        setElapsedSeconds((prev) => {
          const next = prev + 1;
          elapsedSecondsRef.current = next;
          if (next >= MAX_AUDIO_RECORDING_SECONDS) {
            handleStopRecording();
            return MAX_AUDIO_RECORDING_SECONDS;
          }
          return next;
        });
      }, 1000);
      setPhase('recording');
    }
  };

  const handleStopRecording = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleRestoreDraft = () => {
    if (!recoveredDraft || !recoveredDraft.audioBuffer) return;
    const restoredBlob = new Blob([recoveredDraft.audioBuffer], { type: recoveredDraft.mimeType });
    setRecordedBlob(restoredBlob);
    const url = URL.createObjectURL(restoredBlob);
    setRecordedUrl(url);
    setElapsedSeconds(recoveredDraft.durationSeconds);
    elapsedSecondsRef.current = recoveredDraft.durationSeconds;
    setRecordedMimeType(recoveredDraft.mimeType);
    setPhase('stopped');
    setHasRecoverableDraft(false);
    setRecoveredDraft(null);
    setFeedback({
      severity: 'info',
      message: `Restored previous session (${formatAudioDuration(recoveredDraft.durationSeconds)}, ${formatByteSize(recoveredDraft.byteSize)}). You can review or save it.`,
    });
  };

  const handleDiscardDraft = async () => {
    await clearDurableAudioDraft(workspaceId, accountId);
    setHasRecoverableDraft(false);
    setRecoveredDraft(null);
  };

  const handleDiscard = async () => {
    isCancelledRef.current = true;
    cleanupMedia();
    setRecordedBlob(null);
    setPhase('idle');
    setElapsedSeconds(0);
    elapsedSecondsRef.current = 0;
    setFeedback(null);
    await clearDurableAudioDraft(workspaceId, accountId);
    setHasRecoverableDraft(false);
    setRecoveredDraft(null);
  };

  const handleSaveAndAttach = async () => {
    if (!recordedBlob) return;
    setPhase('uploading');
    setFeedback(null);

    try {
      const ext = recordedMimeType.includes('mp4')
        ? 'm4a'
        : recordedMimeType.includes('ogg')
          ? 'ogg'
          : recordedMimeType.includes('wav')
            ? 'wav'
            : 'webm';
      const fileName = `voice-note-${new Date().toISOString().slice(0, 10)}-${Date.now()}.${ext}`;

      await onSaveAudio({
        blob: recordedBlob,
        durationSeconds: Math.max(1, elapsedSeconds),
        fileName,
        mimeType: recordedMimeType.split(';')[0]!.trim(),
        byteSize: recordedBlob.size,
      });

      // Clear draft on successful upload
      await clearDurableAudioDraft(workspaceId, accountId);
      setHasRecoverableDraft(false);
      setRecoveredDraft(null);

      onClose();
    } catch (err: unknown) {
      setPhase('stopped');
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Failed to upload audio recording.',
      });
    }
  };

  if (!isOpen) return null;

  const isNearLimit = elapsedSeconds >= AUDIO_WARNING_THRESHOLD_SECONDS;
  const progressPercent = Math.min(100, Math.round((elapsedSeconds / MAX_AUDIO_RECORDING_SECONDS) * 100));

  return (
    <div
      data-testid={testID}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.md,
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: radii.card,
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
          width: '100%',
          maxWidth: '520px',
          padding: spacing.xl,
          display: 'flex',
          flexDirection: 'column',
          gap: spacing.md,
          fontFamily: typography.fontFamily.sans,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2
              id={titleId}
              style={{
                fontSize: typography.webScale.pageTitle,
                fontWeight: 'bold',
                color: palette.text.primary,
                margin: 0,
              }}
            >
              🎙️ Record Audio Memo
            </h2>
            <p id={descId} style={{ fontSize: typography.webScale.supporting, color: palette.text.secondary, margin: '2px 0 0 0' }}>
              {attachedItemTitle
                ? `Attach spoken memo to ${attachedItemType}: ${attachedItemTitle}`
                : `Deliberate voice recording for ${attachedItemType} with private storage`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.25rem',
              color: palette.text.secondary,
              minWidth: touchTargets.webMin,
              minHeight: touchTargets.webMin,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Live Accessibility Status Announcement */}
        <div
          id={liveStatusId}
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
          }}
        >
          {phase === 'recording'
            ? `Recording audio: ${formatAudioDuration(elapsedSeconds)}`
            : phase === 'paused'
              ? `Recording paused at ${formatAudioDuration(elapsedSeconds)}`
              : phase === 'stopped'
                ? `Recording finished. Duration: ${formatAudioDuration(elapsedSeconds)}`
                : ''}
        </div>

        {feedback && <Feedback severity={feedback.severity} message={feedback.message} />}

        {hasRecoverableDraft && phase === 'idle' && (
          <div
            style={{
              padding: spacing.sm,
              backgroundColor: '#EFF6FF',
              borderRadius: radii.sm,
              border: '1px solid #BFDBFE',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: spacing.sm,
            }}
          >
            {recoveredDraft ? (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: typography.webScale.supporting, fontWeight: '600', color: '#1E40AF' }}>
                    ⚠️ Recovered previous recording session ({formatAudioDuration(recoveredDraft.durationSeconds)}, {formatByteSize(recoveredDraft.byteSize)}).
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#3B82F6' }}>
                    Durable audio binary preserved across restart.
                  </span>
                </div>
                <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={handleRestoreDraft}
                    style={{
                      backgroundColor: '#2563EB',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: radii.sm,
                      padding: '4px 10px',
                      cursor: 'pointer',
                      fontSize: typography.webScale.supporting,
                      fontWeight: '600',
                    }}
                  >
                    Restore Recording
                  </button>
                  <button
                    type="button"
                    onClick={handleDiscardDraft}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: palette.status.danger,
                      cursor: 'pointer',
                      fontSize: typography.webScale.supporting,
                      fontWeight: '600',
                    }}
                  >
                    Discard Draft
                  </button>
                </div>
              </>
            ) : (
              <>
                <span style={{ fontSize: typography.webScale.supporting, color: '#B91C1C' }}>
                  ⚠️ A previous recording session was interrupted before data could be finalized and is unrecoverable.
                </span>
                <button
                  type="button"
                  onClick={handleDiscardDraft}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: palette.status.danger,
                    cursor: 'pointer',
                    fontSize: typography.webScale.supporting,
                    fontWeight: '600',
                  }}
                >
                  Discard Draft
                </button>
              </>
            )}
          </div>
        )}

        {/* Phase 1: Idle - Deliberate Start Button */}
        {phase === 'idle' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, alignItems: 'center', padding: `${spacing.lg}px 0` }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: radii.pill,
                backgroundColor: '#FEE2E2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2rem',
              }}
            >
              🎙️
            </div>
            <p style={{ fontSize: typography.webScale.body, color: palette.text.secondary, textAlign: 'center', margin: 0, maxWidth: 360 }}>
              Audio recording requires explicit permission. Maximum recording length is <strong>10 minutes (25 MB)</strong>.
            </p>
            <Button
              variant="primary"
              onClick={handleStartRecording}
              style={{ backgroundColor: '#DC2626', borderColor: '#DC2626' }}
            >
              🔴 Request Mic & Start Recording
            </Button>
          </div>
        )}

        {/* Phase 2: Recording / Paused Active Indicator */}
        {(phase === 'recording' || phase === 'paused') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, alignItems: 'center', padding: `${spacing.md}px 0` }}>
            {/* Pulsing indicator banner */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: spacing.sm,
                padding: `${spacing.xs}px ${spacing.md}px`,
                borderRadius: radii.pill,
                backgroundColor: phase === 'recording' ? '#FEE2E2' : '#FEF3C7',
                border: `1px solid ${phase === 'recording' ? '#FCA5A5' : '#FDE68A'}`,
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 12,
                  height: 12,
                  borderRadius: radii.pill,
                  backgroundColor: phase === 'recording' ? '#DC2626' : '#D97706',
                  animation: phase === 'recording' ? 'pulse 1.5s infinite' : 'none',
                }}
              />
              <span style={{ fontSize: typography.webScale.supporting, fontWeight: 'bold', color: phase === 'recording' ? '#991B1B' : '#92400E' }}>
                {phase === 'recording' ? 'RECORDING ACTIVE' : 'RECORDING PAUSED'}
              </span>
            </div>

            {/* Large Timer Display */}
            <div
              style={{
                fontSize: '2.5rem',
                fontWeight: 'bold',
                fontFamily: typography.fontFamily.sans,
                color: palette.text.primary,
                letterSpacing: 2,
              }}
            >
              {formatAudioDuration(elapsedSeconds)}
            </div>

            {/* Limit Progress Bar */}
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div
                style={{
                  height: 6,
                  width: '100%',
                  borderRadius: radii.pill,
                  backgroundColor: '#E2E8F0',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${progressPercent}%`,
                    backgroundColor: isNearLimit ? '#DC2626' : '#2563EB',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: typography.webScale.supporting, color: palette.text.secondary }}>
                <span>{isNearLimit ? '⚠️ Approaching 10:00 limit' : 'Max 10 minutes'}</span>
                <span>{formatAudioDuration(MAX_AUDIO_RECORDING_SECONDS)}</span>
              </div>
            </div>

            {/* Recording Controls */}
            <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.sm }}>
              {phase === 'recording' ? (
                <Button variant="secondary" onClick={handlePauseRecording}>
                  ⏸ Pause
                </Button>
              ) : (
                <Button variant="secondary" onClick={handleResumeRecording}>
                  ▶ Resume
                </Button>
              )}
              <Button
                variant="primary"
                onClick={handleStopRecording}
                style={{ backgroundColor: '#DC2626', borderColor: '#DC2626' }}
              >
                ⏹ Stop & Review
              </Button>
              <Button variant="subtle" onClick={handleDiscard}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Phase 3: Stopped / Review Stage */}
        {(phase === 'stopped' || phase === 'uploading') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
            <div
              style={{
                padding: spacing.md,
                backgroundColor: palette.surfaceRaised,
                borderRadius: radii.card,
                display: 'flex',
                flexDirection: 'column',
                gap: spacing.sm,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: typography.webScale.body, fontWeight: '600', color: palette.text.primary }}>
                  Audio Preview
                </span>
                <span style={{ fontSize: typography.webScale.supporting, color: palette.text.secondary }}>
                  {formatAudioDuration(elapsedSeconds)} • {recordedBlob ? formatByteSize(recordedBlob.size) : '0 B'}
                </span>
              </div>

              {recordedUrl && (
                <audio
                  controls
                  src={recordedUrl}
                  style={{ width: '100%', height: 40 }}
                  aria-label="Recorded audio preview"
                />
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: spacing.sm }}>
              <Button variant="subtle" onClick={handleDiscard} disabled={phase === 'uploading'}>
                Discard & Re-record
              </Button>
              <Button
                variant="primary"
                onClick={handleSaveAndAttach}
                disabled={phase === 'uploading'}
              >
                {phase === 'uploading' ? 'Uploading & Verifying...' : '💾 Save & Attach Audio'}
              </Button>
            </div>
          </div>
        )}

        {/* Phase 4: Error Stage */}
        {phase === 'error' && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.sm }}>
            <Button variant="secondary" onClick={onClose}>
              Dismiss
            </Button>
            <Button variant="primary" onClick={handleStartRecording}>
              Retry Microphone Request
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
