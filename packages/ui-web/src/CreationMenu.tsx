'use client';

import React, { useEffect, useId, useRef } from 'react';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import { Icon, type IconProps } from './Icon.js';
import { IconButton } from './IconButton.js';

export interface CreationMenuItem {
  id: string;
  label: string;
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

export const CreationMenu: React.FC<CreationMenuProps> = ({
  open,
  title = 'Create',
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
        backgroundColor: 'rgba(13, 25, 25, 0.45)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        zIndex: 80,
        padding: spacing.base,
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
          width: 'min(420px, 100%)',
          maxHeight: '85vh',
          overflow: 'auto',
          backgroundColor: palette.surface,
          color: palette.text.primary,
          borderRadius: `${radii.sheet}px ${radii.sheet}px ${radii.card}px ${radii.card}px`,
          border: `1px solid ${palette.border.subtle}`,
          padding: spacing.base,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 id={titleId} style={{ margin: 0, fontSize: 18 }}>
            {title}
          </h2>
          <IconButton label="Close create menu" icon="x" themeMode={themeMode} onClick={onClose} />
        </div>
        <ul style={{ listStyle: 'none', margin: `${spacing.md}px 0 0`, padding: 0 }}>
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
                  gap: spacing.sm,
                  width: '100%',
                  minHeight: touchTargets.webMin,
                  padding: `0 ${spacing.sm}px`,
                  border: 'none',
                  borderRadius: radii.sm,
                  background: 'transparent',
                  color: palette.text.primary,
                  font: 'inherit',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                {item.icon ? <Icon name={item.icon} size={20} /> : null}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
