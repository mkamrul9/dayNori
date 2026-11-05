'use client';

import React, { useEffect, useState } from 'react';
import { colors, spacing, type ThemeMode } from '@daynori/design-tokens';

export interface LoadingStateProps {
  label?: string;
  themeMode?: ThemeMode;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  label = 'Loading',
  themeMode = 'light',
}) => {
  const palette = colors[themeMode];
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
        color: palette.text.secondary,
        padding: spacing.base,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 16,
          height: 16,
          border: `2px solid ${palette.border.strong}`,
          borderTopColor: palette.action.primary,
          borderRadius: '50%',
          animation: prefersReducedMotion ? 'none' : 'daynori-spin 0.8s linear infinite',
          opacity: prefersReducedMotion ? 0.85 : 1,
        }}
      />
      <style>{`@keyframes daynori-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <span>{label}</span>
    </div>
  );
};
