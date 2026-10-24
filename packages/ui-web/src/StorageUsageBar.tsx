'use client';

import React from 'react';
import { colors, radii, spacing, typography, type ThemeMode } from '@daynori/design-tokens';
import { computeStorageUsage } from '@daynori/domain';

export interface StorageUsageBarProps {
  storedBytes: number;
  reservedBytes: number;
  maxBytes: number;
  themeMode?: ThemeMode;
  compact?: boolean;
  className?: string;
}

export const StorageUsageBar: React.FC<StorageUsageBarProps> = ({
  storedBytes,
  reservedBytes,
  maxBytes,
  themeMode = 'light',
  compact = false,
  className,
}) => {
  const palette = colors[themeMode];
  const usage = computeStorageUsage(storedBytes, reservedBytes, maxBytes);

  const storedPercent = Math.min(100, Math.round((usage.storedBytes / usage.maxBytes) * 100));
  const reservedPercent = Math.min(
    100 - storedPercent,
    Math.round((usage.reservedBytes / usage.maxBytes) * 100)
  );

  const barColor = usage.isExceeded
    ? palette.status.danger
    : usage.isNearLimit
      ? palette.status.warning
      : palette.action.primary;

  const reservedColor = usage.isExceeded
    ? palette.status.danger
    : usage.isNearLimit
      ? '#f59e0b'
      : '#93c5fd';

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 4 : spacing.xs,
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: compact ? typography.webScale.metadata : typography.webScale.supporting,
          color: palette.text.secondary,
        }}
      >
        <span style={{ fontWeight: 600, color: palette.text.primary }}>Storage Usage</span>
        <span>
          {usage.formattedStored} of {usage.formattedMax} ({usage.percentUsed}%)
          {usage.reservedBytes > 0 && ` • ${usage.formattedReserved} reserved`}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={usage.percentUsed}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${usage.percentUsed}% storage used (${usage.formattedStored} of ${usage.formattedMax})`}
        style={{
          display: 'flex',
          height: compact ? 6 : 8,
          width: '100%',
          backgroundColor: palette.surfaceRaised,
          borderRadius: radii.pill,
          overflow: 'hidden',
          border: `1px solid ${palette.border.subtle}`,
        }}
      >
        <div
          style={{
            width: `${storedPercent}%`,
            backgroundColor: barColor,
            transition: 'width 200ms ease',
          }}
          title={`Stored: ${usage.formattedStored}`}
        />
        {reservedPercent > 0 && (
          <div
            style={{
              width: `${reservedPercent}%`,
              backgroundColor: reservedColor,
              opacity: 0.7,
              transition: 'width 200ms ease',
            }}
            title={`Reserved: ${usage.formattedReserved}`}
          />
        )}
      </div>

      {usage.isExceeded && (
        <div
          role="alert"
          style={{
            fontSize: typography.webScale.metadata,
            color: palette.status.danger,
            fontWeight: 500,
          }}
        >
          Storage quota exceeded. Free up space before uploading more files.
        </div>
      )}

      {!usage.isExceeded && usage.isNearLimit && (
        <div
          style={{
            fontSize: typography.webScale.metadata,
            color: palette.status.warning,
            fontWeight: 500,
          }}
        >
          Storage is nearing capacity ({usage.percentUsed}% used).
        </div>
      )}
    </div>
  );
};
