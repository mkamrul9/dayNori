'use client';

import React, { useId } from 'react';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import { Button } from './Button.js';

export interface CoachmarkProps {
  open: boolean;
  title: string;
  description: string;
  stepLabel?: string;
  themeMode?: ThemeMode;
  onContinue?: () => void;
  onSkip?: () => void;
  onExit?: () => void;
  /** Visual spotlight only — full action-verified tour is Phase 79. */
}

/**
 * Presentation primitive for learning coachmarks/spotlights.
 * Does not verify that target controls exist or complete tour engine work (Phase 79).
 */
export const Coachmark: React.FC<CoachmarkProps> = ({
  open,
  title,
  description,
  stepLabel,
  themeMode = 'light',
  onContinue,
  onSkip,
  onExit,
}) => {
  const titleId = useId();
  const descId = useId();
  const palette = colors[themeMode];
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={descId}
      style={{
        position: 'relative',
        maxWidth: 360,
        padding: spacing.base,
        borderRadius: radii.card,
        backgroundColor: palette.surface,
        border: `2px solid ${palette.border.focus}`,
        boxShadow: `0 8px 24px rgba(23, 44, 44, 0.12)`,
        color: palette.text.primary,
      }}
    >
      {stepLabel ? (
        <p style={{ margin: `0 0 ${spacing.xs}px`, color: palette.text.secondary, fontSize: 12 }}>
          {stepLabel}
        </p>
      ) : null}
      <h3 id={titleId} style={{ margin: `0 0 ${spacing.xs}px`, fontSize: 16 }}>
        {title}
      </h3>
      <p id={descId} style={{ margin: `0 0 ${spacing.md}px`, color: palette.text.secondary }}>
        {description}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.sm }}>
        {onContinue ? (
          <Button type="button" themeMode={themeMode} onClick={onContinue}>
            Continue
          </Button>
        ) : null}
        {onSkip ? (
          <Button type="button" variant="secondary" themeMode={themeMode} onClick={onSkip}>
            Skip
          </Button>
        ) : null}
        {onExit ? (
          <Button type="button" variant="subtle" themeMode={themeMode} onClick={onExit}>
            Exit
          </Button>
        ) : null}
      </div>
    </div>
  );
};
