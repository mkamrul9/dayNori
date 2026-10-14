'use client';

import React from 'react';
import {
  colors,
  focusRing,
  radii,
  spacing,
  touchTargets,
  type ThemeMode,
} from '@daynori/design-tokens';

export type FeedbackSeverity = 'info' | 'success' | 'warning' | 'danger';

export interface FeedbackProps {
  severity: FeedbackSeverity;
  title?: string;
  message: string;
  themeMode?: ThemeMode;
  onDismiss?: () => void;
}

export const Feedback: React.FC<FeedbackProps> = ({
  severity,
  title,
  message,
  themeMode = 'light',
  onDismiss,
}) => {
  const palette = colors[themeMode];

  let bg: string = palette.status.infoBg;
  let fg: string = palette.status.info;
  let border: string = palette.status.infoBorder;
  let icon = 'ℹ️';
  let statusPrefix = 'Notice:';

  if (severity === 'success') {
    bg = palette.status.successBg;
    fg = palette.status.success;
    border = palette.status.successBorder;
    icon = '✓';
    statusPrefix = 'Success:';
  } else if (severity === 'warning') {
    bg = palette.status.warningBg;
    fg = palette.status.warning;
    border = palette.status.warningBorder;
    icon = '⚠';
    statusPrefix = 'Warning:';
  } else if (severity === 'danger') {
    bg = palette.status.dangerBg;
    fg = palette.status.danger;
    border = palette.status.dangerBorder;
    icon = '✕';
    statusPrefix = 'Error:';
  }

  const role = severity === 'danger' ? 'alert' : 'status';

  return (
    <div
      role={role}
      aria-live={severity === 'danger' ? 'assertive' : 'polite'}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: `${spacing.sm}px`,
        backgroundColor: bg,
        color: fg,
        border: `1px solid ${border}`,
        borderRadius: `${radii.sm}px`,
        padding: `${spacing.sm}px ${spacing.md}px`,
        fontSize: '14px',
        lineHeight: 1.5,
      }}
    >
      <div style={{ display: 'flex', gap: `${spacing.sm}px`, alignItems: 'flex-start', flex: 1 }}>
        <span aria-hidden="true" style={{ fontWeight: 'bold', flexShrink: 0, marginTop: '2px' }}>
          {icon}
        </span>
        <div style={{ flex: 1 }}>
          <span
            className="sr-only"
            style={{
              position: 'absolute',
              width: '1px',
              height: '1px',
              padding: 0,
              margin: '-1px',
              overflow: 'hidden',
              clip: 'rect(0, 0, 0, 0)',
              border: 0,
            }}
          >
            {statusPrefix}{' '}
          </span>
          {title && <strong style={{ display: 'block', marginBottom: '2px' }}>{title}</strong>}
          <span>{message}</span>
        </div>
      </div>

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss message"
          style={{
            background: 'transparent',
            border: 'none',
            color: fg,
            cursor: 'pointer',
            minHeight: `${touchTargets.webMin}px`,
            minWidth: `${touchTargets.webMin}px`,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            fontSize: '16px',
            lineHeight: 1,
            borderRadius: `${radii.sm}px`,
            outline: 'none',
            flexShrink: 0,
          }}
          onFocus={(e) => {
            e.currentTarget.style.outline = `${focusRing.width}px solid ${palette.border.focus}`;
            e.currentTarget.style.outlineOffset = `${focusRing.offset}px`;
          }}
          onBlur={(e) => {
            e.currentTarget.style.outline = 'none';
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
};
