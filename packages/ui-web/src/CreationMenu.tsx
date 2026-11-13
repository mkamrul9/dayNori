'use client';

import React, { useEffect, useId, useRef } from 'react';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import { Icon, type IconProps } from './Icon.js';
import { IconButton } from './IconButton.js';

export interface CreationMenuItem {
  id: string;
  label: string;
  description?: string;
  icon?: IconProps['name'];
  onSelect: () => void;
}

export interface CreationMenuProps {
  open: boolean;
  title?: string;
  items: CreationMenuItem[];
  onClose: () => void;
  themeMode?: ThemeMode;
  /** Element to restore focus to when closed. */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

/**
 * Modern, calm Creation Sheet for quickly adding tasks, routines, notes, and entries.
 * Features high-contrast vector icons, supportive descriptions, and clean touch targets.
 */
export const CreationMenu: React.FC<CreationMenuProps> = ({
  open,
  title = 'Create Item',
  items,
  onClose,
  themeMode = 'light',
  returnFocusRef,
}) => {
  const palette = colors[themeMode];
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement as HTMLElement | null;
    const first = sheetRef.current?.querySelector<HTMLElement>('button, [href]');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const target = returnFocusRef?.current ?? prev;
      target?.focus?.();
    };
  }, [open, onClose, returnFocusRef]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: themeMode === 'dark' ? 'rgba(0, 0, 0, 0.65)' : 'rgba(23, 44, 44, 0.35)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        zIndex: 120,
        padding: spacing.base,
        boxSizing: 'border-box',
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          width: 'min(460px, 100%)',
          maxHeight: '85vh',
          overflowY: 'auto',
          backgroundColor: palette.surface,
          color: palette.text.primary,
          borderRadius: `${radii.sheet}px`,
          border: `1px solid ${palette.border.subtle}`,
          boxShadow: themeMode === 'dark' ? '0 12px 36px rgba(0,0,0,0.5)' : '0 12px 32px rgba(23,44,44,0.12)',
          padding: `${spacing.lg}px ${spacing.base}px`,
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: `${spacing.md}px`,
            paddingBottom: `${spacing.xs}px`,
            borderBottom: `1px solid ${palette.border.subtle}`,
          }}
        >
          <div>
            <h2 id={titleId} style={{ margin: 0, fontSize: '18px', fontWeight: 700, letterSpacing: '-0.2px' }}>
              {title}
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: palette.text.secondary }}>
              Select what you want to add to your workspace
            </p>
          </div>
          <IconButton label="Close creation menu" icon="x" themeMode={themeMode} onClick={onClose} />
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  item.onSelect();
                  onClose();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: `${spacing.md}px`,
                  width: '100%',
                  minHeight: `${touchTargets.webMin}px`,
                  padding: `${spacing.sm}px ${spacing.md}px`,
                  border: '1px solid transparent',
                  borderRadius: `${radii.sm}px`,
                  background: 'transparent',
                  color: palette.text.primary,
                  font: 'inherit',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'background-color 140ms ease, border-color 140ms ease',
                  boxSizing: 'border-box',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = palette.surfaceRaised;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {item.icon ? (
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      backgroundColor: palette.action.subtle,
                      color: palette.action.primary,
                      flexShrink: 0,
                    }}
                  >
                    <Icon name={item.icon} size={18} />
                  </span>
                ) : null}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: palette.text.primary }}>
                    {item.label}
                  </div>
                  {item.description && (
                    <div style={{ fontSize: '12px', color: palette.text.secondary, marginTop: '1px' }}>
                      {item.description}
                    </div>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
