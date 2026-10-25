'use client';

import React from 'react';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import { Icon } from './Icon.js';

export type SyncStatusKind = 'device' | 'waiting' | 'synced' | 'offline' | 'error';

const COPY: Record<SyncStatusKind, string> = {
  device: 'Saved on this device',
  waiting: 'Waiting to sync',
  synced: 'Synchronized',
  offline: 'Offline',
  error: 'Sync error — retry',
};

export interface SyncStatusBadgeProps {
  status: SyncStatusKind;
  themeMode?: ThemeMode;
}

/** Distinguishes local save from synchronization — pair color with text. */
export const SyncStatusBadge: React.FC<SyncStatusBadgeProps> = ({
  status,
  themeMode = 'light',
}) => {
  const palette = colors[themeMode];
  let bg: string = palette.action.subtle;
  let fg: string = palette.action.subtleText;
  let icon: string = 'cloud';
  if (status === 'device' || status === 'waiting') {
    bg = palette.status.warningBg;
    fg = palette.status.warning;
    icon = status === 'waiting' ? 'refresh' : 'save';
  } else if (status === 'synced') {
    bg = palette.status.successBg;
    fg = palette.status.success;
    icon = 'check-circle';
  } else if (status === 'offline') {
    bg = palette.status.warningBg;
    fg = palette.status.warning;
    icon = 'offline';
  } else if (status === 'error') {
    bg = palette.status.dangerBg;
    fg = palette.status.danger;
    icon = 'warning';
  }

  return (
    <span
      role="status"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: spacing.xs,
        padding: `${spacing.xs}px ${spacing.sm}px`,
        borderRadius: radii.pill,
        backgroundColor: bg,
        color: fg,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      <Icon name={icon} size={14} />
      {COPY[status]}
    </span>
  );
};
