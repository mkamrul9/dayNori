'use client';

import React, { useEffect, useId, useRef } from 'react';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  themeMode?: ThemeMode;
  children: React.ReactNode;
}

export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  onClose,
  title,
  description,
  themeMode = 'light',
  children,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const titleId = useId();
  const descId = useId();
  const palette = colors[themeMode];

  useEffect(() => {
    if (!isOpen) return undefined;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    // Focus first focusable element or dialog container
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusable?.[0];
    if (firstFocusable) {
      firstFocusable.focus();
    } else {
      dialogRef.current?.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      // Focus trap
      if (e.key === 'Tab' && dialogRef.current) {
        const elements = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (elements.length === 0) return;

        const first = elements[0];
        const last = elements[elements.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus on close
      previouslyFocusedRef.current?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: `${spacing.base}px`,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        style={{
          backgroundColor: palette.surface,
          color: palette.text.primary,
          borderRadius: `${radii.sheet}px`,
          border: `1px solid ${palette.border.subtle}`,
          padding: `${spacing.lg}px`,
          maxWidth: '500px',
          width: '100%',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.2)',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: `${spacing.sm}px`,
          }}
        >
          <h2 id={titleId} style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '18px',
              color: palette.text.secondary,
              padding: `${spacing.xs}px`,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {description && (
          <p
            id={descId}
            style={{
              margin: `0 0 ${spacing.base}px 0`,
              fontSize: '14px',
              color: palette.text.secondary,
            }}
          >
            {description}
          </p>
        )}

        <div>{children}</div>
      </div>
    </div>
  );
};
