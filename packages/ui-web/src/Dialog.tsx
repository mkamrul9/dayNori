'use client';

import { Icon } from './Icon.js';
import React, { useEffect, useId, useRef } from 'react';
import {
  colors,
  focusRing,
  radii,
  spacing,
  touchTargets,
  type ThemeMode,
} from '@daynori/design-tokens';

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  themeMode?: ThemeMode;
  children?: React.ReactNode;
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
  const wasOpenRef = useRef<boolean>(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const titleId = useId();
  const descId = useId();
  const palette = colors[themeMode];

  useEffect(() => {
    if (!isOpen) {
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        previouslyFocusedRef.current?.focus();
      }
      return undefined;
    }

    // Only set initial focus and record opener when transitioning from closed to open
    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

      // Focus first focusable element or dialog container
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      const firstFocusable = focusable?.[0];
      if (firstFocusable) {
        firstFocusable.focus();
      } else {
        dialogRef.current?.focus();
      }
    }

    // Prevent background scrolling while modal is open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }

      // Tab trap containment
      if (e.key === 'Tab' && dialogRef.current) {
        const elements = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (elements.length === 0) {
          e.preventDefault();
          return;
        }

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
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCloseRef.current();
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: `${spacing.base}px`,
        backdropFilter: 'blur(2px)',
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
          maxWidth: '520px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.28)',
          outline: 'none',
          boxSizing: 'border-box',
          position: 'relative',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: `${spacing.base}px`,
            marginBottom: `${spacing.sm}px`,
          }}
        >
          <h2 id={titleId} style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={() => onCloseRef.current()}
            aria-label="Close dialog"
            style={{
              background: 'transparent',
              border: `1px solid ${palette.border.subtle}`,
              borderRadius: `${radii.sm}px`,
              cursor: 'pointer',
              fontSize: '18px',
              color: palette.text.secondary,
              minHeight: `${touchTargets.webMin}px`,
              minWidth: `${touchTargets.webMin}px`,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
              padding: 0,
              outline: 'none',
              transition: 'background-color 150ms ease, border-color 150ms ease',
            }}
            onFocus={(e) => {
              e.currentTarget.style.outline = `${focusRing.width}px solid ${palette.border.focus}`;
              e.currentTarget.style.outlineOffset = `${focusRing.offset}px`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.outline = 'none';
            }}
          >
            <Icon name="x" />
          </button>
        </div>

        {description && (
          <p
            id={descId}
            style={{
              margin: `0 0 ${spacing.base}px 0`,
              fontSize: '14px',
              color: palette.text.secondary,
              lineHeight: 1.5,
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
