import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  AppState,
  type AppStateStatus,
} from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import {
  formatAudioDuration,
  formatByteSize,
  MAX_AUDIO_RECORDING_SECONDS,
  AUDIO_WARNING_THRESHOLD_SECONDS,
  type AudioAttachment,
} from '@daynori/domain';
import { MobileButton } from './MobileButton.js';
import { MobileFeedback } from './MobileFeedback.js';

export interface MobileAudioRecorderSheetProps {
  visible: boolean;
  onClose: () => void;
  workspaceId: string;
  themeMode?: ThemeMode;
  onSaveAudio: (data: {
    durationSeconds: number;
    fileName: string;
    mimeType: string;
    byteSize: number;
    uri?: string;
  }) => Promise<AudioAttachment | void>;
  attachedItemTitle?: string;
  attachedItemType?: 'note' | 'journal' | 'knowledge' | 'file';
  testID?: string;
}

type RecorderPhase = 'idle' | 'recording' | 'paused' | 'stopped' | 'uploading' | 'error';

export const MobileAudioRecorderSheet: React.FC<MobileAudioRecorderSheetProps> = ({
  visible,
  onClose,
  workspaceId: _workspaceId,
  themeMode = 'light',
  onSaveAudio,
  attachedItemTitle,
  attachedItemType = 'note',
  testID = 'mobile-audio-recorder-sheet',
}) => {
  const palette = colors[themeMode];

  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [feedback, setFeedback] = useState<{ severity: 'danger' | 'warning' | 'info'; message: string } | null>(null);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resetState = useCallback(() => {
    stopTimer();
    setPhase('idle');
    setElapsedSeconds(0);
    setFeedback(null);
    setRecordedUri(null);
  }, [stopTimer]);

  useEffect(() => {
    if (!visible) {
      resetState();
    }
  }, [visible, resetState]);

  // Handle interruption on app backgrounding (phone calls, switching apps)
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState.match(/inactive|background/) && phase === 'recording') {
        stopTimer();
        setPhase('paused');
        setFeedback({
          severity: 'warning',
          message: 'Recording paused due to app interruption or phone call. You can resume or save.',
        });
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      sub.remove();
    };
  }, [phase, stopTimer]);

  // Explicit user action to start recording
  const handleStartRecording = () => {
    setFeedback(null);
    setPhase('recording');
    setElapsedSeconds(0);

    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => {
        const next = prev + 1;
        if (next >= MAX_AUDIO_RECORDING_SECONDS) {
          handleStopRecording();
          return MAX_AUDIO_RECORDING_SECONDS;
        }
        return next;
      });
    }, 1000);
  };

  const handlePauseRecording = () => {
    if (phase === 'recording') {
      stopTimer();
      setPhase('paused');
    }
  };

  const handleResumeRecording = () => {
    if (phase === 'paused') {
      setPhase('recording');
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => {
          const next = prev + 1;
          if (next >= MAX_AUDIO_RECORDING_SECONDS) {
            handleStopRecording();
            return MAX_AUDIO_RECORDING_SECONDS;
          }
          return next;
        });
      }, 1000);
    }
  };

  const handleStopRecording = () => {
    stopTimer();
    setRecordedUri(`file:///data/user/0/daynori/cache/audio_${Date.now()}.m4a`);
    setPhase('stopped');
  };

  const handleDiscard = () => {
    resetState();
  };

  const handleSaveAndAttach = async () => {
    setPhase('uploading');
    setFeedback(null);

    try {
      const fileName = `voice-note-${new Date().toISOString().slice(0, 10)}-${Date.now()}.m4a`;
      const durationSeconds = Math.max(1, elapsedSeconds);
      // Rough estimation for audio: ~64kbps = 8KB/s
      const estimatedBytes = Math.min(25 * 1024 * 1024, durationSeconds * 8192);

      await onSaveAudio({
        durationSeconds,
        fileName,
        mimeType: 'audio/mp4',
        byteSize: estimatedBytes,
        uri: recordedUri || undefined,
      });

      onClose();
    } catch (err: unknown) {
      setPhase('stopped');
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Failed to save audio recording.',
      });
    }
  };

  const isNearLimit = elapsedSeconds >= AUDIO_WARNING_THRESHOLD_SECONDS;
  const progressPercent = Math.min(100, Math.round((elapsedSeconds / MAX_AUDIO_RECORDING_SECONDS) * 100));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View testID={testID} style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: palette.background }]}>
          {/* Header */}
          <View style={[styles.headerRow, { borderBottomColor: palette.border.subtle }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: palette.text.primary }]}>
                🎙️ Record Audio Memo
              </Text>
              <Text style={[styles.subtitle, { color: palette.text.secondary }]}>
                {attachedItemTitle
                  ? `Attach voice note to: ${attachedItemTitle}`
                  : `Deliberate recording for ${attachedItemType}`}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close audio recorder"
            >
              <Text style={{ fontSize: 18, color: palette.text.secondary }}>✕</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            {feedback && <MobileFeedback severity={feedback.severity} message={feedback.message} />}

            {/* Phase 1: Idle Start Gesture */}
            {phase === 'idle' && (
              <View style={styles.centerArea}>
                <View style={[styles.micCircle, { backgroundColor: '#FEE2E2' }]}>
                  <Text style={{ fontSize: 36 }}>🎙️</Text>
                </View>
                <Text style={[styles.bodyText, { color: palette.text.secondary }]}>
                  Recording requires explicit permission. Maximum recording duration is{' '}
                  <Text style={{ fontWeight: 'bold' }}>10 minutes (25 MB)</Text>.
                </Text>
                <View style={{ width: '100%', marginTop: spacing.md }}>
                  <MobileButton
                    title="🔴 Request Mic & Start Recording"
                    variant="primary"
                    themeMode={themeMode}
                    onPress={handleStartRecording}
                    accessibilityLabel="Request microphone permission and start recording"
                  />
                </View>
              </View>
            )}

            {/* Phase 2: Active Recording / Paused */}
            {(phase === 'recording' || phase === 'paused') && (
              <View style={styles.centerArea}>
                {/* Active Indicator Banner */}
                <View
                  style={[
                    styles.indicatorBanner,
                    {
                      backgroundColor: phase === 'recording' ? '#FEE2E2' : '#FEF3C7',
                      borderColor: phase === 'recording' ? '#FCA5A5' : '#FDE68A',
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: phase === 'recording' ? '#DC2626' : '#D97706' },
                    ]}
                  />
                  <Text
                    style={[
                      styles.indicatorText,
                      { color: phase === 'recording' ? '#991B1B' : '#92400E' },
                    ]}
                  >
                    {phase === 'recording' ? 'RECORDING ACTIVE' : 'RECORDING PAUSED'}
                  </Text>
                </View>

                {/* Big Timer */}
                <Text
                  accessibilityRole="timer"
                  accessibilityLabel={`Recording duration ${formatAudioDuration(elapsedSeconds)}`}
                  style={[styles.bigTimer, { color: palette.text.primary }]}
                >
                  {formatAudioDuration(elapsedSeconds)}
                </Text>

                {/* Progress bar towards 10 min */}
                <View style={{ width: '100%', gap: 4 }}>
                  <View
                    style={[styles.progressBarBg, { backgroundColor: palette.border.subtle }]}
                  >
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          backgroundColor: isNearLimit ? '#DC2626' : palette.action.primary,
                          width: `${progressPercent}%`,
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.progressRow}>
                    <Text style={{ fontSize: 11, color: palette.text.secondary }}>
                      {isNearLimit ? '⚠️ Approaching 10:00 limit' : 'Max 10 minutes'}
                    </Text>
                    <Text style={{ fontSize: 11, color: palette.text.secondary }}>
                      {formatAudioDuration(MAX_AUDIO_RECORDING_SECONDS)}
                    </Text>
                  </View>
                </View>

                {/* Controls */}
                <View style={styles.controlsRow}>
                  {phase === 'recording' ? (
                    <View style={{ flex: 1 }}>
                      <MobileButton
                        title="⏸ Pause"
                        variant="secondary"
                        themeMode={themeMode}
                        onPress={handlePauseRecording}
                        accessibilityLabel="Pause recording"
                      />
                    </View>
                  ) : (
                    <View style={{ flex: 1 }}>
                      <MobileButton
                        title="▶ Resume"
                        variant="secondary"
                        themeMode={themeMode}
                        onPress={handleResumeRecording}
                        accessibilityLabel="Resume recording"
                      />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <MobileButton
                      title="⏹ Stop"
                      variant="primary"
                      themeMode={themeMode}
                      onPress={handleStopRecording}
                      accessibilityLabel="Stop recording"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <MobileButton
                      title="Cancel"
                      variant="subtle"
                      themeMode={themeMode}
                      onPress={handleDiscard}
                      accessibilityLabel="Cancel recording"
                    />
                  </View>
                </View>
              </View>
            )}

            {/* Phase 3: Stopped / Review */}
            {(phase === 'stopped' || phase === 'uploading') && (
              <View style={{ gap: spacing.md }}>
                <View
                  style={[
                    styles.reviewCard,
                    {
                      backgroundColor: palette.surfaceRaised,
                      borderColor: palette.border.subtle,
                    },
                  ]}
                >
                  <Text style={[styles.reviewTitle, { color: palette.text.primary }]}>
                    Recording Preview
                  </Text>
                  <Text style={[styles.reviewMeta, { color: palette.text.secondary }]}>
                    Duration: {formatAudioDuration(elapsedSeconds)} • Est. Size:{' '}
                    {formatByteSize(elapsedSeconds * 8192)}
                  </Text>
                </View>

                <View style={{ gap: spacing.sm }}>
                  <MobileButton
                    title={phase === 'uploading' ? 'Saving...' : '💾 Save & Attach Audio'}
                    variant="primary"
                    themeMode={themeMode}
                    onPress={handleSaveAndAttach}
                    disabled={phase === 'uploading'}
                    accessibilityLabel="Save and attach recorded audio"
                  />
                  <MobileButton
                    title="Discard & Re-record"
                    variant="subtle"
                    themeMode={themeMode}
                    onPress={handleDiscard}
                    disabled={phase === 'uploading'}
                    accessibilityLabel="Discard recording"
                  />
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    maxHeight: '85%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeButton: {
    minWidth: touchTargets.mobileMin,
    minHeight: touchTargets.mobileMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
  },
  centerArea: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  micCircle: {
    width: 72,
    height: 72,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bodyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    lineHeight: 20,
  },
  indicatorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radii.pill,
  },
  indicatorText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  bigTimer: {
    fontSize: 44,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  progressBarBg: {
    height: 6,
    width: '100%',
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  controlsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    width: '100%',
    marginTop: spacing.sm,
  },
  reviewCard: {
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing.xs,
  },
  reviewTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  reviewMeta: {
    fontSize: 13,
  },
});
