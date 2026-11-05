'use client';

import React, { useState } from 'react';
import { colors, focusRing, type ThemeMode } from '@daynori/design-tokens';

export interface TextLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  themeMode?: ThemeMode;
  children: React.ReactNode;
}

export const TextLink: React.FC<TextLinkProps> = ({
  themeMode = 'light',
  children,
  style,
  onFocus,
  onBlur,
  ...props
}) => {
  const palette = colors[themeMode];
  const [isFocused, setIsFocused] = useState(false);

  return (
    <a
      onFocus={(e) => {
        setIsFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setIsFocused(false);
        onBlur?.(e);
      }}
      style={{
        color: palette.action.primary,
        fontWeight: 600,
        textDecoration: 'underline',
        textUnderlineOffset: '2px',
        outline: isFocused ? `${focusRing.width}px solid ${palette.border.focus}` : 'none',
        outlineOffset: `${focusRing.offset}px`,
        borderRadius: 2,
        ...style,
      }}
      {...props}
    >
      {children}
    </a>
  );
};
