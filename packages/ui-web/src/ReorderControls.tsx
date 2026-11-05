'use client';

import React from 'react';
import { spacing, type ThemeMode } from '@daynori/design-tokens';
import { IconButton } from './IconButton.js';

export interface ReorderControlsProps {
  label: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  themeMode?: ThemeMode;
}

/** Keyboard-accessible alternative to drag reordering. */
export const ReorderControls: React.FC<ReorderControlsProps> = ({
  label,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  themeMode = 'light',
}) => (
  <div
    role="group"
    aria-label={`Reorder ${label}`}
    style={{ display: 'inline-flex', gap: spacing.xs }}
  >
    <IconButton
      label={`Move ${label} up`}
      icon="arrow-up"
      themeMode={themeMode}
      disabled={!canMoveUp}
      onClick={onMoveUp}
    />
    <IconButton
      label={`Move ${label} down`}
      icon="arrow-down"
      themeMode={themeMode}
      disabled={!canMoveDown}
      onClick={onMoveDown}
    />
  </div>
);
