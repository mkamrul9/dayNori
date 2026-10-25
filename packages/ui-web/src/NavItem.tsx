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
import { Icon, type IconProps } from './Icon.js';

export interface NavItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon?: IconProps['name'];
  selected?: boolean;
  themeMode?: ThemeMode;
  /** bottom-tab denser layout vs sidebar row */
  density?: 'sidebar' | 'tab';
}

/** Shared primitive for sidebar rows and bottom-nav tabs. */
export const NavItem: React.FC<NavItemProps> = ({
  label,
  icon,
  selected = false,
  themeMode = 'light',
  density = 'sidebar',
  style,
  onFocus,
  onBlur,
  ...props
}) => {
  const palette = colors[themeMode];
  const [isFocused, setIsFocused] = useState(false);
  const isTab = density === 'tab';

  return (
    <button
      type="button"
      aria-current={selected ? 'page' : undefined}
      onFocus={(e) => {
        setIsFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setIsFocused(false);
        onBlur?.(e);
      }}
      style={{
        display: 'flex',
        flexDirection: isTab ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: isTab ? 'center' : 'flex-start',
        gap: isTab ? 2 : spacing.sm,
        width: isTab ? '100%' : '100%',
        minHeight: touchTargets.webMin,
        padding: isTab ? `${spacing.xs}px ${spacing.xs}px` : `0 ${spacing.md}px`,
        border: 'none',
        borderTop: isTab ? `3px solid ${selected ? palette.action.primary : 'transparent'}` : 'none',
        borderRadius: isTab ? 0 : radii.sm,
        backgroundColor: selected && !isTab ? palette.action.subtle : 'transparent',
        color: selected ? (isTab ? palette.action.primary : palette.action.subtleText) : palette.text.secondary,
        fontWeight: selected ? 700 : 500,
        font: 'inherit',
        fontSize: isTab ? 11 : 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
        outline: isFocused ? `${focusRing.width}px solid ${palette.border.focus}` : 'none',
        outlineOffset: focusRing.offset,
        ...style,
      }}
      {...props}
    >
      {icon ? <Icon name={icon} size={isTab ? 20 : 20} /> : null}
      <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </button>
  );
};
