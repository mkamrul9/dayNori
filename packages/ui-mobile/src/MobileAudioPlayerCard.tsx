import { Icon } from './Icon.js';
import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import {
  formatAudioDuration,
  formatByteSize,
  type AudioAttachment,
  type NativeAudioPlayerAdapter,
  type NativeAudioPlayerStatus,
} from '@daynori/domain';

export interface MobileAudioPlayerCardProps {
  attachment: AudioAttachment;
  audioUrl?: string | null;
  themeMode?: ThemeMode;
  playerAdapter?: NativeAudioPlayerAdapter;
  onDelete?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  isPlaying?: boolean;
  currentSeconds?: number;
  testID?: string;
}

export const MobileAudioPlayerCard: React.FC<MobileAudioPlayerCardProps> = ({
  attachment,
  audioUrl,
  themeMode = 'light',
  playerAdapter,
  onDelete,
  onPlay,
  onPause,
  isPlaying = false,
  currentSeconds = 0,
  testID = 'mobile-audio-player-card',
}) => {
  const palette = colors[themeMode];
  const [internalPlaying, setInternalPlaying] = useState<boolean>(false);
  const [playerStatus, setPlayerStatus] = useState<NativeAudioPlayerStatus>({
    isLoaded: false,
    isPlaying: false,
  });
  const [localPosSeconds, setLocalPosSeconds] = useState<number>(currentSeconds);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  useEffect(() => {
    if (!audioUrl || !playerAdapter) return;
    let isSubscribed = true;

    void playerAdapter.loadAsync(audioUrl, (status) => {
      if (!isSubscribed) return;
      setPlayerStatus(status);
      if (status.isLoaded) {
        setPlaybackError(null);
        if (typeof status.positionMillis === 'number') {
          setLocalPosSeconds(Math.floor(status.positionMillis / 1000));
        }
      } else if (status.error) {
        setPlaybackError(status.error);
      }
    });

    return () => {
      isSubscribed = false;
      void playerAdapter.unloadAsync().catch(() => {});
    };
  }, [audioUrl, playerAdapter]);

  const activePlaying = playerAdapter ? playerStatus.isPlaying : isPlaying || internalPlaying;

  const displayedSeconds = playerAdapter ? localPosSeconds : currentSeconds;

  const handleToggle = async () => {
    if (playerAdapter) {
      try {
        if (playerStatus.isPlaying) {
          await playerAdapter.pauseAsync();
          if (onPause) onPause();
        } else {
          await playerAdapter.playAsync();
          if (onPlay) onPlay();
        }
      } catch (err: unknown) {
        setPlaybackError(err instanceof Error ? err.message : 'Playback error');
      }
    } else {
      if (activePlaying) {
        if (onPause) onPause();
        setInternalPlaying(false);
      } else {
        if (onPlay) onPlay();
        setInternalPlaying(true);
      }
    }
  };

  const totalDuration = attachment.durationSeconds || 1;

  return (
    <View
      testID={testID}
      style={[
        styles.card,
        {
          backgroundColor: palette.surfaceRaised,
          borderColor: palette.border.subtle,
        },
      ]}
    >
      {/* Header Info */}
      <View style={styles.headerRow}>
        <View style={styles.titleArea}>
          <Text style={{ fontSize: 18 }} accessibilityLabel="Audio attachment">
            <Icon name="microphone" color={palette.text.primary} size={18} />
          </Text>
          <View style={{ flex: 1 }}>
            <Text
              style={[styles.fileName, { color: palette.text.primary }]}
              numberOfLines={1}
              ellipsizeMode="middle"
            >
              {attachment.fileName}
            </Text>
            <Text style={[styles.metaText, { color: palette.text.secondary }]}>
              {formatByteSize(attachment.byteSize)} • {attachment.mimeType}
            </Text>
          </View>
        </View>

        {onDelete && (
          <Pressable
            onPress={onDelete}
            style={styles.deleteButton}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${attachment.fileName}`}
            hitSlop={8}
          >
            <Text style={[styles.deleteText, { color: palette.status.danger }]}>
              <Icon name="trash" color={palette.status.danger} />
            </Text>
          </Pressable>
        )}
      </View>

      {/* Play Controls & Progress Bar */}
      <View style={styles.controlsRow}>
        <Pressable
          onPress={handleToggle}
          style={[
            styles.playButton,
            {
              backgroundColor: palette.action.primary,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={activePlaying ? 'Pause audio recording' : 'Play audio recording'}
        >
          <Text style={styles.playIcon}>
            <Icon name={activePlaying ? 'pause' : 'play'} color={palette.text.primary} />
          </Text>
        </Pressable>

        <View style={{ flex: 1, gap: 2 }}>
          {/* Visual Progress Bar */}
          <View style={[styles.progressBarBackground, { backgroundColor: palette.border.subtle }]}>
            <View
              style={[
                styles.progressBarFill,
                {
                  backgroundColor: palette.action.primary,
                  width: `${Math.min(100, Math.round((displayedSeconds / totalDuration) * 100))}%`,
                },
              ]}
            />
          </View>

          <View style={styles.timeRow}>
            <Text style={[styles.timeText, { color: palette.text.secondary }]}>
              {formatAudioDuration(displayedSeconds)}
            </Text>
            <Text style={[styles.timeText, { color: palette.text.secondary }]}>
              {formatAudioDuration(totalDuration)}
            </Text>
          </View>
          {playbackError && (
            <Text style={{ fontSize: 11, color: palette.status.danger, marginTop: 2 }}>
              {playbackError}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  titleArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
  },
  metaText: {
    fontSize: 12,
    marginTop: 1,
  },
  deleteButton: {
    minWidth: touchTargets.mobileMin,
    minHeight: touchTargets.mobileMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {
    fontSize: 16,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  playButton: {
    width: touchTargets.mobileMin,
    height: touchTargets.mobileMin,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  progressBarBackground: {
    height: 4,
    width: '100%',
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    fontSize: 11,
  },
});
