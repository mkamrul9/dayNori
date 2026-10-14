'use client';

import React, { useState } from 'react';
import {
  colors,
  focusRing,
  radii,
  spacing,
  touchTargets,
  type ThemeMode,
} from '@daynori/design-tokens';

export interface SkipLinkProps {
  targetId?: string;
  label?: string;
  themeMode?: ThemeMode;
}

export const SkipLink: React.FC<SkipLinkProps> = ({
  targetId = 'main-content',
  label = 'Skip to main content',
  themeMode = 'light',
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const palette = colors[themeMode];

  return (
    <a
      href={`#${targetId}`}
      className="daynori-skip-link"
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      style={
        isFocused
          ? {
              position: 'fixed',
              top: `${spacing.base}px`,
              left: `${spacing.base}px`,
              zIndex: 99999,
              backgroundColor: palette.action.primary,
              color: palette.action.label,
              padding: `${spacing.sm}px ${spacing.base}px`,
              borderRadius: `${radii.sm}px`,
              minHeight: `${touchTargets.webMin}px`,
              minWidth: `${touchTargets.webMin}px`,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              textDecoration: 'none',
              outline: `${focusRing.width}px solid ${palette.border.focus}`,
              outlineOffset: `${focusRing.offset}px`,
              boxShadow: `0 4px 12px rgba(0, 0, 0, 0.25)`,
            }
          : {
              position: 'absolute',
              width: '1px',
              height: '1px',
              padding: 0,
              margin: '-1px',
              overflow: 'hidden',
              clip: 'rect(0, 0, 0, 0)',
              whiteSpace: 'nowrap',
              border: 0,
            }
      }
    >
      {label}
    </a>
  );
};
