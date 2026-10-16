'use client';

import React from 'react';
import {
  colors,
  focusRing,
  radii,
  spacing,
  typography,
  type ThemeMode,
} from '@daynori/design-tokens';

export interface BreadcrumbItem {
  id: string | null;
  label: string;
  onClick?: () => void;
}

export interface BreadcrumbNavProps {
  items: BreadcrumbItem[];
  themeMode?: ThemeMode;
  onNavigateBack?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export const BreadcrumbNav: React.FC<BreadcrumbNavProps> = ({
  items,
  themeMode = 'light',
  onNavigateBack,
  className,
  style,
}) => {
  const palette = colors[themeMode];

  return (
    <nav
      aria-label="Breadcrumb"
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: `${spacing.xs}px`,
        fontSize: `${typography.webScale.body}px`,
        lineHeight: typography.lineHeight.relaxed,
        padding: `${spacing.xs}px 0`,
        ...style,
      }}
    >
      {onNavigateBack && items.length > 1 && (
        <button
          type="button"
          onClick={onNavigateBack}
          aria-label="Navigate to parent folder"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '2px',
            padding: `${spacing.xs}px ${spacing.sm}px`,
            borderRadius: radii.sm,
            border: `1px solid ${palette.border.subtle}`,
            background: palette.surface,
            color: palette.text.primary,
            fontSize: `${typography.webScale.supporting}px`,
            fontWeight: 600,
            cursor: 'pointer',
            marginRight: `${spacing.xs}px`,
            minHeight: '32px',
          }}
        >
          <span aria-hidden="true">&larr;</span> Up
        </button>
      )}

      <ol
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          listStyle: 'none',
          padding: 0,
          margin: 0,
          gap: `${spacing.xs}px`,
        }}
      >
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li
              key={item.id ?? `root-${index}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: `${spacing.xs}px`,
              }}
            >
              {index > 0 && (
                <span
                  aria-hidden="true"
                  style={{
                    color: palette.text.secondary,
                    userSelect: 'none',
                  }}
                >
                  /
                </span>
              )}
              {isLast ? (
                <span
                  aria-current="page"
                  style={{
                    fontWeight: 700,
                    color: palette.text.primary,
                    maxWidth: '220px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={item.label}
                >
                  {item.label}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={item.onClick}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: `2px ${spacing.xs}px`,
                    borderRadius: radii.sm,
                    color: palette.action.primary,
                    fontWeight: 500,
                    cursor: 'pointer',
                    textDecoration: 'none',
                    maxWidth: '160px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    outline: 'none',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.outline = `${focusRing.width}px solid ${focusRing[themeMode]}`;
                    e.currentTarget.style.outlineOffset = `${focusRing.offset}px`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.outline = 'none';
                  }}
                  title={item.label}
                >
                  {item.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
