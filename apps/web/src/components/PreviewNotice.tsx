'use client';

import React, { useId, useState } from 'react';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import { corePreviewSummary, corePreviewDetails } from '../config/preview';

export const PreviewNotice: React.FC<{ themeMode: ThemeMode }> = ({ themeMode }) => {
  const palette = colors[themeMode];
  const detailsId = useId();
  const [open, setOpen] = useState(false);

  return (
    <aside
      aria-label="Testing preview limitations"
      className="daynori-preview-notice"
      style={{
        padding: `${spacing.xs}px ${spacing.base}px`,
        backgroundColor: themeMode === 'dark' ? '#3a3420' : '#fff1c2',
        color: themeMode === 'dark' ? '#f5ecd2' : '#332c1a',
        borderBottom: `1px solid ${palette.border.subtle}`,
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: `${spacing.xs}px ${spacing.sm}px`,
          maxWidth: '960px',
          margin: '0 auto',
        }}
      >
        <p
          className="daynori-break"
          style={{
            margin: 0,
            flex: '1 1 12rem',
            minWidth: 0,
            fontSize: '13px',
            lineHeight: 1.4,
            fontWeight: 600,
          }}
        >
          {corePreviewSummary}
        </p>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((v) => !v)}
          style={{
            minHeight: `${touchTargets.webMin}px`,
            minWidth: `${touchTargets.webMin}px`,
            padding: `0 ${spacing.sm}px`,
            borderRadius: `${radii.sm}px`,
            border: `1px solid ${themeMode === 'dark' ? '#8a7a40' : '#b8a46a'}`,
            background: 'transparent',
            color: 'inherit',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {open ? 'Hide details' : 'Details'}
        </button>
      </div>
      {open && (
        <ul
          id={detailsId}
          className="daynori-break"
          style={{
            margin: `${spacing.xs}px auto 0`,
            maxWidth: '960px',
            paddingLeft: '1.25rem',
            fontSize: '12px',
            lineHeight: 1.45,
            fontWeight: 400,
          }}
        >
          {corePreviewDetails.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </aside>
  );
};
