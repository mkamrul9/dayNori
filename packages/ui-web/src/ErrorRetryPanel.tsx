'use client';

import React from 'react';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import { Button } from './Button.js';
import { Icon } from './Icon.js';

export interface ErrorRetryPanelProps {
  title: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  themeMode?: ThemeMode;
  /** When true, wording should not imply authentication failure. */
  offline?: boolean;
}

export const ErrorRetryPanel: React.FC<ErrorRetryPanelProps> = ({
  title,
  description,
  onRetry,
  retryLabel = 'Retry',
  themeMode = 'light',
  offline = false,
}) => {
  const palette = colors[themeMode];
  return (
    <div
      role="alert"
      style={{
        padding: spacing.base,
        borderRadius: radii.card,
        backgroundColor: palette.status.dangerBg,
        border: `1px solid ${palette.status.dangerBorder}`,
        color: palette.status.danger,
      }}
    >
      <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'flex-start' }}>
        <Icon name={offline ? 'offline' : 'warning'} size={20} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ display: 'block', marginBottom: spacing.xs }}>{title}</strong>
          {description ? (
            <p style={{ margin: `0 0 ${spacing.sm}px`, color: palette.text.primary }}>{description}</p>
          ) : null}
          {onRetry ? (
            <Button type="button" variant="secondary" themeMode={themeMode} onClick={onRetry}>
              {retryLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
};
