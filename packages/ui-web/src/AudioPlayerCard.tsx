'use client';

import { Icon } from './Icon.js';
import React, { useState, useRef, useEffect } from 'react';
import {
  colors,
  radii,
  spacing,
  touchTargets,
  typography,
  type ThemeMode,
} from '@daynori/design-tokens';
import { formatAudioDuration, formatByteSize, type AudioAttachment } from '@daynori/domain';

export interface AudioPlayerCardProps {
  attachment: AudioAttachment;
  audioUrl?: string | null;
  themeMode?: ThemeMode;
  onDelete?: () => void;
  onDownload?: () => void;
  testID?: string;
}

export const AudioPlayerCard: React.FC<AudioPlayerCardProps> = ({
  attachment,
  audioUrl,
  themeMode = 'light',
  onDelete,
  onDownload,
  testID = 'audio-player-card',
}) => {
  const palette = colors[themeMode] || colors.light;
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const onError = () => {
      setIsPlaying(false);
      setPlaybackError('Failed to load audio stream');
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, []);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio
        .play()
        .then(() => {
          setIsPlaying(true);
          setPlaybackError(null);
        })
        .catch((err) => {
          setPlaybackError(err instanceof Error ? err.message : 'Playback failed');
          setIsPlaying(false);
        });
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const seekTo = parseFloat(e.target.value);
    setCurrentTime(seekTo);
    if (audioRef.current) {
      audioRef.current.currentTime = seekTo;
    }
  };

  const totalDuration = attachment.durationSeconds || 1;

  return (
    <div
      data-testid={testID}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radii.card,
        border: `1px solid ${palette.border.subtle}`,
        backgroundColor: palette.surfaceRaised,
        fontFamily: typography.fontFamily.sans,
      }}
    >
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" />}

      {/* Header with audio metadata */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.sm,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, overflow: 'hidden' }}>
          <span style={{ fontSize: '1.25rem' }} role="img" aria-label="Audio recording">
            <Icon name="microphone" />
          </span>
          <div style={{ overflow: 'hidden' }}>
            <span
              style={{
                display: 'block',
                fontSize: typography.webScale.body,
                fontWeight: '600',
                color: palette.text.primary,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={attachment.fileName}
            >
              {attachment.fileName}
            </span>
            <span
              style={{ fontSize: typography.webScale.supporting, color: palette.text.secondary }}
            >
              {formatByteSize(attachment.byteSize)} • {attachment.mimeType}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'center' }}>
          {onDownload && (
            <button
              type="button"
              onClick={onDownload}
              aria-label={`Download ${attachment.fileName}`}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: palette.action.primary,
                fontSize: typography.webScale.supporting,
                padding: spacing.xs,
                minHeight: touchTargets.webMin,
                minWidth: touchTargets.webMin,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="download" /> Download
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Delete attachment ${attachment.fileName}`}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: palette.status.danger,
                fontSize: typography.webScale.supporting,
                padding: spacing.xs,
                minHeight: touchTargets.webMin,
                minWidth: touchTargets.webMin,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="trash" /> Delete
            </button>
          )}
        </div>
      </div>

      {playbackError && (
        <div
          role="alert"
          style={{
            fontSize: typography.webScale.supporting,
            color: palette.status.danger,
            padding: spacing.xs,
          }}
        >
          <Icon name="warning" /> {playbackError}
        </div>
      )}

      {/* Player Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
        <button
          type="button"
          onClick={togglePlayPause}
          disabled={!audioUrl}
          aria-label={isPlaying ? 'Pause audio recording' : 'Play audio recording'}
          style={{
            width: touchTargets.webMin,
            height: touchTargets.webMin,
            borderRadius: radii.sm,
            border: 'none',
            backgroundColor: audioUrl ? palette.action.primary : palette.border.subtle,
            color: '#FFFFFF',
            cursor: audioUrl ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1rem',
          }}
        >
          <Icon name={isPlaying ? 'pause' : 'play'} />
        </button>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <input
            type="range"
            min={0}
            max={totalDuration}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            disabled={!audioUrl}
            aria-label="Seek audio playback"
            aria-valuemin={0}
            aria-valuemax={totalDuration}
            aria-valuenow={Math.round(currentTime)}
            aria-valuetext={`${formatAudioDuration(currentTime)} of ${formatAudioDuration(totalDuration)}`}
            style={{
              width: '100%',
              cursor: audioUrl ? 'pointer' : 'default',
            }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: typography.webScale.supporting,
              color: palette.text.secondary,
            }}
          >
            <span>{formatAudioDuration(currentTime)}</span>
            <span>{formatAudioDuration(totalDuration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
